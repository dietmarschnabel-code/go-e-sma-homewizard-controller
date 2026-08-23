package main

import (
	"encoding/csv"
	"flag"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
)

type IntervalRecord struct {
	Timestamp time.Time
	Export    float64 // Einspeisung (kWh)
	Import    float64 // Verbrauch (kWh)
}

type GoESession struct {
	Start      time.Time
	End        time.Time
	Energy     float64
	MeterStart float64
	MeterEnd   float64
}

func main() {
	noeFile := flag.String("noe", "", "Pfad zur Netz NÖ CSV")
	goeFile := flag.String("goe", "", "Pfad zur go-eCharger CSV (optional)")
	outDir := flag.String("out", "./p1", "Zielverzeichnis")
	mode := flag.String("mode", "both", "Modus: 'monthly', 'daily' oder 'both'")

	importOffset := flag.Float64("import-offset", 0.0, "Start-Offset für Netzbezug (kWh)")
	exportOffset := flag.Float64("export-offset", 0.0, "Start-Offset für Einspeisung (kWh)")
	chargerOffset := flag.Float64("charger-offset", 0.0, "Start-Offset für Charger (kWh)")

	flag.Parse()

	if *noeFile == "" {
		log.Fatal("Bitte -noe <pfad> angeben.")
	}

	records, err := parseNetzNoe(*noeFile)
	if err != nil {
		log.Fatalf("Fehler beim Lesen der Netz NÖ CSV: %v", err)
	}

	var goeSessions []GoESession
	if *goeFile != "" {
		goeSessions, err = parseGoE(*goeFile)
		if err != nil {
			log.Printf("Warnung: go-eCharger CSV konnte nicht gelesen werden: %v", err)
		}
	}

	if err := os.MkdirAll(*outDir, 0755); err != nil {
		log.Fatalf("Fehler beim Erstellen des Ausgabeordners: %v", err)
	}

	if *mode == "monthly" || *mode == "both" {
		if err := generateMonthlyFiles(records, goeSessions, *outDir, *chargerOffset); err != nil {
			log.Fatalf("Fehler bei Monatsdateien: %v", err)
		}
	}

	var finalImport, finalExport, finalCharger float64
	var totalImport, totalExport, totalCharger float64

	if *mode == "daily" || *mode == "both" {
		finalImport, finalExport, finalCharger, totalImport, totalExport, totalCharger, err = generateDailyFiles5Min(
			records, goeSessions, *outDir, *importOffset, *exportOffset, *chargerOffset,
		)
		if err != nil {
			log.Fatalf("Fehler bei Tagesdateien: %v", err)
		}
	}

	printSummary(
		records, goeSessions,
		*importOffset, *exportOffset, *chargerOffset,
		totalImport, totalExport, totalCharger,
		finalImport, finalExport, finalCharger,
	)
}

func parseNetzNoe(filepath string) ([]IntervalRecord, error) {
	file, err := os.Open(filepath)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	reader := csv.NewReader(file)
	reader.Comma = ';'
	reader.FieldsPerRecord = -1

	header, err := reader.Read()
	if err != nil {
		return nil, err
	}

	idxTime, idxExport, idxImport := -1, -1, -1
	for i, col := range header {
		// Strip UTF-8 Byte Order Mark (BOM) if present
		cleanCol := strings.TrimPrefix(strings.TrimSpace(col), "\ufeff")
		if strings.HasPrefix(cleanCol, "Messzeitpunkt") {
			idxTime = i
		} else if strings.HasPrefix(cleanCol, "Einspeisung") {
			idxExport = i
		} else if strings.HasPrefix(cleanCol, "Verbrauch") {
			idxImport = i
		}
	}

	if idxTime == -1 || idxExport == -1 || idxImport == -1 {
		return nil, fmt.Errorf("erforderliche Spalten nicht gefunden (idxTime: %d, idxExport: %d, idxImport: %d)", idxTime, idxExport, idxImport)
	}

	var records []IntervalRecord
	loc, _ := time.LoadLocation("Europe/Vienna")

	for {
		line, err := reader.Read()
		if err == io.EOF {
			break
		}

		maxIdx := idxTime
		if idxExport > maxIdx {
			maxIdx = idxExport
		}
		if idxImport > maxIdx {
			maxIdx = idxImport
		}

		if err != nil || len(line) <= maxIdx {
			continue
		}

		t, err := time.ParseInLocation("02.01.2006 15:04", strings.TrimSpace(line[idxTime]), loc)
		if err != nil {
			continue
		}

		expStr := strings.ReplaceAll(strings.TrimSpace(line[idxExport]), ",", ".")
		impStr := strings.ReplaceAll(strings.TrimSpace(line[idxImport]), ",", ".")

		exp, _ := strconv.ParseFloat(expStr, 64)
		imp, _ := strconv.ParseFloat(impStr, 64)

		records = append(records, IntervalRecord{
			Timestamp: t,
			Export:    exp,
			Import:    imp,
		})
	}

	sort.Slice(records, func(i, j int) bool {
		return records[i].Timestamp.Before(records[j].Timestamp)
	})

	return records, nil
}

func parseGoE(filepath string) ([]GoESession, error) {
	file, err := os.Open(filepath)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	reader := csv.NewReader(file)
	reader.FieldsPerRecord = -1

	header, err := reader.Read()
	if err != nil {
		return nil, err
	}

	idxStart, idxEnd, idxEnergy, idxMeterStart, idxMeterEnd := -1, -1, -1, -1, -1
	for i, col := range header {
		c := strings.TrimSpace(col)
		switch c {
		case "Start":
			idxStart = i
		case "End":
			idxEnd = i
		case "Energy", "Meter Difference":
			idxEnergy = i
		case "Meter start":
			idxMeterStart = i
		case "Meter end":
			idxMeterEnd = i
		}
	}

	var sessions []GoESession
	for {
		line, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil || len(line) < 5 {
			continue
		}

		startStr := strings.TrimSpace(line[idxStart])
		endStr := strings.TrimSpace(line[idxEnd])

		tStart, errStart := time.Parse("02.01.2006 15:04:05-07:00", startStr)
		tEnd, errEnd := time.Parse("02.01.2006 15:04:05-07:00", endStr)
		if errStart != nil || errEnd != nil {
			continue
		}

		energy, _ := strconv.ParseFloat(strings.ReplaceAll(strings.TrimSpace(line[idxEnergy]), ",", "."), 64)
		mStart, _ := strconv.ParseFloat(strings.ReplaceAll(strings.TrimSpace(line[idxMeterStart]), ",", "."), 64)
		mEnd, _ := strconv.ParseFloat(strings.ReplaceAll(strings.TrimSpace(line[idxMeterEnd]), ",", "."), 64)

		sessions = append(sessions, GoESession{
			Start:      tStart,
			End:        tEnd,
			Energy:     energy,
			MeterStart: mStart,
			MeterEnd:   mEnd,
		})
	}

	return sessions, nil
}

func generateMonthlyFiles(records []IntervalRecord, goeSessions []GoESession, outDir string, chargerOffset float64) error {
	type DailySum struct {
		Import        float64
		Export        float64
		ChargerStart  float64
		ChargerEnd    float64
		HasChargerVal bool
	}

	monthlyMap := make(map[string]map[string]*DailySum)

	for _, r := range records {
		stepImport := r.Import / 3.0
		stepExport := r.Export / 3.0
		intervalStart := r.Timestamp.Add(-15 * time.Minute)

		for i := 0; i < 3; i++ {
			tTick := intervalStart.Add(time.Duration(i*5) * time.Minute)
			monthKey := tTick.Format("200601")
			dayKey := tTick.Format("2006-01-02")

			if _, ok := monthlyMap[monthKey]; !ok {
				monthlyMap[monthKey] = make(map[string]*DailySum)
			}
			if _, ok := monthlyMap[monthKey][dayKey]; !ok {
				monthlyMap[monthKey][dayKey] = &DailySum{}
			}

			m := monthlyMap[monthKey][dayKey]
			m.Import += stepImport
			m.Export += stepExport

			chargerTotal, _ := getGoEStatusAt(tTick, goeSessions, chargerOffset)
			if !m.HasChargerVal {
				m.ChargerStart = chargerTotal
				m.HasChargerVal = true
			}
			m.ChargerEnd = chargerTotal
		}
	}

	for monthKey, days := range monthlyMap {
		fileName := filepath.Join(outDir, fmt.Sprintf("p1-data-%s.csv", monthKey))
		f, err := os.Create(fileName)
		if err != nil {
			return err
		}

		writer := csv.NewWriter(f)
		writer.Write([]string{"date", "import_kwh", "export_kwh", "charger_kwh"})

		var dayKeys []string
		for k := range days {
			dayKeys = append(dayKeys, k)
		}
		sort.Strings(dayKeys)

		for _, dayStr := range dayKeys {
			sum := days[dayStr]

			chargerKwh := 0.0
			if sum.HasChargerVal && sum.ChargerEnd >= sum.ChargerStart {
				chargerKwh = sum.ChargerEnd - sum.ChargerStart
			}

			writer.Write([]string{
				dayStr,
				fmt.Sprintf("%.3f", sum.Import),
				fmt.Sprintf("%.3f", sum.Export),
				fmt.Sprintf("%.3f", chargerKwh),
			})
		}

		writer.Flush()
		f.Close()
	}

	return nil
}

func generateDailyFiles5Min(
	records []IntervalRecord, goeSessions []GoESession, outDir string,
	importOffset, exportOffset, chargerOffset float64,
) (float64, float64, float64, float64, float64, float64, error) {

	if len(records) == 0 {
		return importOffset, exportOffset, chargerOffset, 0, 0, 0, nil
	}

	type TickRecord struct {
		Timestamp    time.Time
		ImportCum    float64
		ExportCum    float64
		ActivePowerW float64
	}

	var allTicks []TickRecord
	cumImport := importOffset
	cumExport := exportOffset

	var sumImportDelta, sumExportDelta float64

	for _, r := range records {
		stepImport := r.Import / 3.0
		stepExport := r.Export / 3.0
		stepNetPowerW := (stepImport - stepExport) * 12000.0

		sumImportDelta += r.Import
		sumExportDelta += r.Export

		intervalStart := r.Timestamp.Add(-15 * time.Minute)

		for i := 0; i < 3; i++ {
			tTick := intervalStart.Add(time.Duration(i*5) * time.Minute)
			cumImport += stepImport
			cumExport += stepExport

			allTicks = append(allTicks, TickRecord{
				Timestamp:    tTick,
				ImportCum:    cumImport,
				ExportCum:    cumExport,
				ActivePowerW: stepNetPowerW,
			})
		}
	}

	dailyMap := make(map[string][]TickRecord)
	for _, tick := range allTicks {
		dayKey := tick.Timestamp.Format("20060102")
		dailyMap[dayKey] = append(dailyMap[dayKey], tick)
	}

	var sortedDays []string
	for k := range dailyMap {
		sortedDays = append(sortedDays, k)
	}
	sort.Strings(sortedDays)

	var lastChargerTotal float64
	var sumChargerEnergy float64

	for _, s := range goeSessions {
		sumChargerEnergy += s.Energy
	}

	for _, dayKey := range sortedDays {
		ticks := dailyMap[dayKey]
		if len(ticks) == 0 {
			continue
		}

		fileName := filepath.Join(outDir, fmt.Sprintf("p1-data-%s.csv", dayKey))
		f, err := os.Create(fileName)
		if err != nil {
			return 0, 0, 0, 0, 0, 0, err
		}

		writer := csv.NewWriter(f)
		writer.Write([]string{"timestamp", "import_kwh", "export_kwh", "active_power_w", "charger_total_kwh", "charger_power_w"})

		for _, tick := range ticks {
			chargerTotal, chargerPowerW := getGoEStatusAt(tick.Timestamp, goeSessions, chargerOffset)
			lastChargerTotal = chargerTotal

			writer.Write([]string{
				tick.Timestamp.Format("2006-01-02 15:04:05"),
				fmt.Sprintf("%.3f", tick.ImportCum),
				fmt.Sprintf("%.3f", tick.ExportCum),
				fmt.Sprintf("%.0f", tick.ActivePowerW),
				fmt.Sprintf("%.3f", chargerTotal),
				fmt.Sprintf("%.0f", chargerPowerW),
			})
		}

		writer.Flush()
		f.Close()
	}

	return cumImport, cumExport, lastChargerTotal, sumImportDelta, sumExportDelta, sumChargerEnergy, nil
}

func getGoEStatusAt(t time.Time, sessions []GoESession, defaultOffset float64) (float64, float64) {
	for _, s := range sessions {
		if (t.Equal(s.Start) || t.After(s.Start)) && (t.Equal(s.End) || t.Before(s.End)) {
			durationHours := s.End.Sub(s.Start).Hours()
			powerW := 0.0
			if durationHours > 0 {
				powerW = (s.Energy / durationHours) * 1000.0
			}
			return s.MeterStart, powerW
		}
	}

	lastMeter := defaultOffset
	for _, s := range sessions {
		if t.After(s.End) && s.MeterEnd > lastMeter {
			lastMeter = s.MeterEnd
		}
	}

	return lastMeter, 0.0
}

func printSummary(
	records []IntervalRecord, goeSessions []GoESession,
	impOffset, expOffset, chgOffset float64,
	totalImp, totalExp, totalChg float64,
	finalImp, finalExp, finalChg float64,
) {
	fmt.Println("\n=======================================================")
	fmt.Println("               P1 CONVERSION SUMMARY                   ")
	fmt.Println("=======================================================")

	if len(records) > 0 {
		fmt.Printf("Timeframe Covered:     %s  -->  %s\n",
			records[0].Timestamp.Add(-15*time.Minute).Format("2006-01-02 15:04"),
			records[len(records)-1].Timestamp.Format("2006-01-02 15:04"),
		)
	}

	fmt.Println("-------------------------------------------------------")
	fmt.Println("PERIOD TOTALS (Energy consumed / generated in file):")
	fmt.Printf("  • Total Grid Import:     %10.3f kWh\n", totalImp)
	fmt.Printf("  • Total Grid Export:     %10.3f kWh\n", totalExp)
	fmt.Printf("  • Total EV Charged:      %10.3f kWh (%d sessions)\n", totalChg, len(goeSessions))

	fmt.Println("-------------------------------------------------------")
	fmt.Println("STARTING OFFSETS & FINAL CUMULATIVE VALUES:")
	fmt.Printf("  • Grid Import  : Start = %10.3f kWh  |  Final = %10.3f kWh\n", impOffset, finalImp)
	fmt.Printf("  • Grid Export  : Start = %10.3f kWh  |  Final = %10.3f kWh\n", expOffset, finalExp)
	fmt.Printf("  • Charger Meter: Start = %10.3f kWh  |  Final = %10.3f kWh\n", chgOffset, finalChg)
	fmt.Println("=======================================================")
}
