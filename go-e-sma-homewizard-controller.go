/*
   go-e-sma-homewizard-controller
   Copyright (C) 2026  Dietmar Schnabel

   This program is free software: you can redistribute it and/or modify
   it under the terms of the GNU General Public License as published by
   the Free Software Foundation, either version 3 of the License, or
   (at your option) any later version.

   This program is distributed in the hope that it will be useful,
   but WITHOUT ANY WARRANTY; without even the implied warranty of
   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
   GNU General Public License for more details.

   You should have received a copy of the GNU General Public License
   along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

package main

import (
	"bufio"
	"encoding/csv"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"
)

// Constants derived from the original configuration
const (
	Voltage             = 230
	Phases              = 3
	LoopIntervalS       = 5
	PVUpdateIntervalS   = 180
	MeterCheckIntervalS = 6
	MinAmperage         = 6
	MaxAmperage         = 16
	PVMode              = 4
	LoadDiffThreshold   = 500
	CurlTimeout         = 3 * time.Second
	P1CSVLogInterval    = 5 * time.Minute
)

// Config holds the execution parameters
type Config struct {
	ChargerIP          string
	P1IP               string
	P1CSVPath          string
	SMALogPath         string
	MaxPowerLimitWatts int
	SafetyMarginWatts  int
	Latitude           float64
	Longitude          float64
	DebugMode          bool
}

// Global state variables
var (
	loopCounter int
	pvPowerW    int
	httpClient  = &http.Client{Timeout: CurlTimeout}
)

// ChargerStatus maps the go-eCharger API response
type ChargerStatus struct {
	Lmo *int      `json:"lmo"`
	Amp *int      `json:"amp"`
	Nrg []float64 `json:"nrg"`
	Eto *float64  `json:"eto"` // Lifetime charged energy in 0.1 kWh steps
}

// HomeWizardData maps the complete P1 meter API response
type HomeWizardData struct {
	ActivePowerW        float64 `json:"active_power_w"`
	TotalPowerImportKWh float64 `json:"total_power_import_kwh"`
	TotalPowerExportKWh float64 `json:"total_power_export_kwh"`
}

// loadLinuxConfig attempts to read /etc/go-e-sma-homewizard-controller on Linux systems.
func loadLinuxConfig() {
	if runtime.GOOS != "linux" {
		return
	}

	configPath := "/etc/go-e-sma-homewizard-controller/go-e-sma-homewizard-controller.conf"
	file, err := os.Open(configPath)
	if err != nil {
		return
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		parts := strings.SplitN(line, "=", 2)
		if len(parts) == 2 {
			key := strings.TrimSpace(parts[0])
			value := strings.TrimSpace(parts[1])
			value = strings.Trim(value, `"'`)
			os.Setenv(key, value)
		}
	}
}

// initConfig parses flags and environment variables
func initConfig() Config {
	loadLinuxConfig()

	c := Config{}
	flag.StringVar(&c.ChargerIP, "charger", "192.168.1.50", "IP address of the go-eCharger")
	flag.StringVar(&c.P1IP, "p1", "192.168.1.60", "IP address of the HomeWizard P1 Meter")
	flag.StringVar(&c.P1CSVPath, "p1-csv", "p1_data.csv", "Base path to the output P1 CSV log file (leave empty to disable)")
	flag.StringVar(&c.SMALogPath, "sma-log", "C:\\temp\\sma-update.log", "Path to the SMA log file (leave empty to disable)")
	flag.IntVar(&c.MaxPowerLimitWatts, "max-power", 10000, "Maximum power limit in watts")
	flag.IntVar(&c.SafetyMarginWatts, "margin", 300, "Safety margin in watts")

	flag.Float64Var(&c.Latitude, "lat", 999.0, "Latitude (set to enable precise sunrise calculation)")
	flag.Float64Var(&c.Longitude, "lng", 999.0, "Longitude (set to enable precise sunrise calculation)")

	flag.BoolVar(&c.DebugMode, "debug", false, "Enable debug output")
	flag.Parse()

	if env := os.Getenv("CHARGER_IP"); env != "" {
		c.ChargerIP = env
	}
	if env := os.Getenv("P1_IP"); env != "" {
		c.P1IP = env
	}
	if env := os.Getenv("P1_CSV_FILE"); env != "" {
		c.P1CSVPath = env
	}
	if env := os.Getenv("SMA_LOG_FILE"); env != "" {
		c.SMALogPath = env
	}
	if env := os.Getenv("MAX_POWER_LIMIT_WATTS"); env != "" {
		if val, err := strconv.Atoi(env); err == nil {
			c.MaxPowerLimitWatts = val
		}
	}
	if env := os.Getenv("SAFETY_MARGIN_WATTS"); env != "" {
		if val, err := strconv.Atoi(env); err == nil {
			c.SafetyMarginWatts = val
		}
	}
	if env := os.Getenv("LATITUDE"); env != "" {
		if val, err := strconv.ParseFloat(env, 64); err == nil {
			c.Latitude = val
		}
	}
	if env := os.Getenv("LONGITUDE"); env != "" {
		if val, err := strconv.ParseFloat(env, 64); err == nil {
			c.Longitude = val
		}
	}

	return c
}

func debugLog(cfg Config, format string, v ...interface{}) {
	if cfg.DebugMode {
		log.Printf("[DEBUG] "+format, v...)
	}
}

// readPVPower extracts the most recent Total Power from the SMA log
func readPVPower(cfg Config) int {
	if cfg.SMALogPath == "" {
		return 0
	}

	file, err := os.Open(cfg.SMALogPath)
	if err != nil {
		debugLog(cfg, "SMA log file unreadable (%v), retaining last valid power: %dW", err, pvPowerW)
		return pvPowerW
	}
	defer file.Close()

	var lastValidPower string
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.Contains(line, "Total Power") {
			parts := strings.Split(line, "=")
			if len(parts) >= 2 {
				valFields := strings.Fields(parts[1])
				if len(valFields) >= 1 {
					lastValidPower = valFields[0]
				}
			}
		}
	}

	if lastValidPower != "" {
		if power, err := strconv.Atoi(lastValidPower); err == nil {
			return power
		}
	}

	debugLog(cfg, "Failed to parse PV power, retaining last valid value: %dW", pvPowerW)
	return pvPowerW
}

func fetchP1Data(cfg Config) (HomeWizardData, error) {
	var data HomeWizardData
	resp, err := httpClient.Get(fmt.Sprintf("http://%s/api/v1/data", cfg.P1IP))
	if err != nil {
		return data, err
	}
	defer resp.Body.Close()

	err = json.NewDecoder(resp.Body).Decode(&data)
	return data, err
}

func readHousePower(cfg Config) (int, error) {
	data, err := fetchP1Data(cfg)
	if err != nil {
		return 0, err
	}
	return int(data.ActivePowerW), nil
}

// getDailyCSVPath inserts "-YYYYMMDD" right before the file extension
func getDailyCSVPath(basePath string, t time.Time) string {
	dateStr := t.Format("-20060102")
	extIdx := strings.LastIndex(basePath, ".")
	if extIdx != -1 {
		return basePath[:extIdx] + dateStr + basePath[extIdx:]
	}
	return basePath + dateStr + ".csv"
}

// getMonthlyCSVPath inserts "-YYYYMM" right before the file extension
func getMonthlyCSVPath(basePath string, t time.Time) string {
	dateStr := t.Format("-200601")
	extIdx := strings.LastIndex(basePath, ".")
	if extIdx != -1 {
		return basePath[:extIdx] + dateStr + basePath[extIdx:]
	}
	return basePath + dateStr + ".csv"
}

// writeDailyCSVRow appends raw 5-minute interval data to the daily CSV file
func writeDailyCSVRow(targetPath string, now time.Time, data HomeWizardData, chargerPowerW int, chargerTotalKWh float64, cfg Config) {
	fileExists := true
	if _, err := os.Stat(targetPath); os.IsNotExist(err) {
		fileExists = false
	}

	file, err := os.OpenFile(targetPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		debugLog(cfg, "[P1 CSV] Failed to open daily CSV file %s: %v", targetPath, err)
		return
	}
	defer file.Close()

	writer := csv.NewWriter(file)
	defer writer.Flush()

	if !fileExists {
		writer.Write([]string{"timestamp", "import_kwh", "export_kwh", "active_power_w", "charger_power_w", "charger_total_kwh"})
	}

	timestamp := now.Truncate(time.Minute).Format("2006-01-02 15:04:05")
	record := []string{
		timestamp,
		strconv.FormatFloat(data.TotalPowerImportKWh, 'f', 3, 64),
		strconv.FormatFloat(data.TotalPowerExportKWh, 'f', 3, 64),
		strconv.FormatFloat(data.ActivePowerW, 'f', 0, 64),
		strconv.Itoa(chargerPowerW),
		strconv.FormatFloat(chargerTotalKWh, 'f', 1, 64),
	}

	if err := writer.Write(record); err != nil {
		debugLog(cfg, "[P1 CSV] Failed to write daily CSV row to %s: %v", targetPath, err)
	} else {
		debugLog(cfg, "[P1 CSV] Recorded reading in %s at %s (%dW active)", targetPath, timestamp, chargerPowerW)
	}
}

// getStartOfDayReadings fetches the first reading from today's daily CSV file
func getStartOfDayReadings(dailyPath string) (float64, float64, float64, error) {
	file, err := os.Open(dailyPath)
	if err != nil {
		return 0, 0, 0, err
	}
	defer file.Close()

	reader := csv.NewReader(file)
	records, err := reader.ReadAll()
	if err != nil || len(records) < 2 {
		return 0, 0, 0, fmt.Errorf("insufficient records in daily CSV %s", dailyPath)
	}

	firstRow := records[1]
	if len(firstRow) < 3 {
		return 0, 0, 0, fmt.Errorf("malformed row in daily CSV %s", dailyPath)
	}

	imp, err1 := strconv.ParseFloat(firstRow[1], 64)
	exp, err2 := strconv.ParseFloat(firstRow[2], 64)

	var chg float64
	if len(firstRow) >= 6 {
		chg, _ = strconv.ParseFloat(firstRow[5], 64)
	} else if len(firstRow) == 5 {
		chg, _ = strconv.ParseFloat(firstRow[4], 64)
	}

	if err1 != nil || err2 != nil {
		return 0, 0, 0, fmt.Errorf("failed to parse start values in daily CSV %s", dailyPath)
	}

	return imp, exp, chg, nil
}

// updateMonthlyCSV upserts a single daily delta row for today in the monthly CSV
func updateMonthlyCSV(monthlyPath string, dateStr string, importKWh, exportKWh, chargerKWh float64, cfg Config) {
	var records [][]string

	if file, err := os.Open(monthlyPath); err == nil {
		reader := csv.NewReader(file)
		if existingRecords, err := reader.ReadAll(); err == nil {
			records = existingRecords
		}
		file.Close()
	}

	if len(records) == 0 || len(records[0]) == 0 || records[0][0] != "date" {
		records = append([][]string{{"date", "import_kwh", "export_kwh", "charger_kwh"}}, records...)
	}

	impStr := strconv.FormatFloat(importKWh, 'f', 3, 64)
	expStr := strconv.FormatFloat(exportKWh, 'f', 3, 64)
	chgStr := strconv.FormatFloat(chargerKWh, 'f', 1, 64)
	newRow := []string{dateStr, impStr, expStr, chgStr}

	updated := false
	for i := 1; i < len(records); i++ {
		if len(records[i]) > 0 && records[i][0] == dateStr {
			records[i] = newRow
			updated = true
			break
		}
	}

	if !updated {
		records = append(records, newRow)
	}

	file, err := os.OpenFile(monthlyPath, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0644)
	if err != nil {
		debugLog(cfg, "[P1 CSV] Failed to open monthly CSV file %s: %v", monthlyPath, err)
		return
	}
	defer file.Close()

	writer := csv.NewWriter(file)
	if err := writer.WriteAll(records); err != nil {
		debugLog(cfg, "[P1 CSV] Failed to write monthly CSV %s: %v", monthlyPath, err)
	} else {
		debugLog(cfg, "[P1 CSV] Updated monthly row in %s for %s: import=%s, export=%s, charger=%s", monthlyPath, dateStr, impStr, expStr, chgStr)
	}
}

func logP1ToCSV(cfg Config) {
	if cfg.P1CSVPath == "" {
		return
	}

	data, err := fetchP1Data(cfg)
	if err != nil {
		debugLog(cfg, "[P1 CSV] Failed to query meter: %v", err)
		return
	}

	var chargerPowerW int
	var chargerTotalKWh float64

	if status, err := readChargerStatus(cfg); err == nil {
		if len(status.Nrg) > 11 {
			chargerPowerW = int(status.Nrg[11])
		}
		if status.Eto != nil {
			chargerTotalKWh = *status.Eto / 1000.0
		}
	} else {
		debugLog(cfg, "[P1 CSV] Failed to query charger status: %v", err)
	}

	now := time.Now()
	dailyPath := getDailyCSVPath(cfg.P1CSVPath, now)

	// 1. Log raw reading to Daily CSV
	writeDailyCSVRow(dailyPath, now, data, chargerPowerW, chargerTotalKWh, cfg)

	// 2. Read baseline reading (start of day / 00:00)
	startImport, startExport, startCharger, err := getStartOfDayReadings(dailyPath)
	if err != nil {
		startImport = data.TotalPowerImportKWh
		startExport = data.TotalPowerExportKWh
		startCharger = chargerTotalKWh
	}

	// Calculate net daily consumption, production, and charger energy so far
	dailyImport := data.TotalPowerImportKWh - startImport
	if dailyImport < 0 {
		dailyImport = 0
	}
	dailyExport := data.TotalPowerExportKWh - startExport
	if dailyExport < 0 {
		dailyExport = 0
	}
	dailyCharger := chargerTotalKWh - startCharger
	if dailyCharger < 0 {
		dailyCharger = 0
	}

	// 3. Update single row for today in Monthly CSV
	monthlyPath := getMonthlyCSVPath(cfg.P1CSVPath, now)
	dateStr := now.Format("2006-01-02")
	updateMonthlyCSV(monthlyPath, dateStr, dailyImport, dailyExport, dailyCharger, cfg)
}

func startP1CSVLogger(cfg Config, stopChan <-chan struct{}) {
	if cfg.P1CSVPath == "" {
		return
	}

	log.Printf("[INFO] P1 CSV Logging active -> %s (Daily interval & Monthly daily totals)", cfg.P1CSVPath)

	for {
		now := time.Now()
		nextInterval := now.Truncate(P1CSVLogInterval).Add(P1CSVLogInterval)
		sleepDuration := time.Until(nextInterval)

		select {
		case <-stopChan:
			return
		case <-time.After(sleepDuration):
			logP1ToCSV(cfg)
		}
	}
}

func readChargerStatus(cfg Config) (ChargerStatus, error) {
	var status ChargerStatus
	resp, err := httpClient.Get(fmt.Sprintf("http://%s/api/status?filter=lmo,amp,nrg,eto", cfg.ChargerIP))
	if err != nil {
		return status, err
	}
	defer resp.Body.Close()

	if err := json.NewDecoder(resp.Body).Decode(&status); err != nil {
		return status, err
	}
	return status, nil
}

func setChargerAmperage(cfg Config, amperage int) error {
	url := fmt.Sprintf("http://%s/api/set?amp=%d", cfg.ChargerIP, amperage)
	resp, err := httpClient.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	debugLog(cfg, "Set charger amperage to %dA", amperage)
	return nil
}

func sendPVData(cfg Config, housePower, pvPower int) error {
	v := url.Values{}
	v.Add("ids", fmt.Sprintf(`{"pGrid":%d,"pPv":%d,"pAkku":0}`, housePower, pvPower))

	reqUrl := fmt.Sprintf("http://%s/api/set?%s", cfg.ChargerIP, v.Encode())
	resp, err := httpClient.Get(reqUrl)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	debugLog(cfg, "Sent grid/PV data to charger: pGrid=%d, pPv=%d", housePower, pvPower)
	return nil
}

func runLoadManagement(cfg Config, targetLimitWatts, wattPerAmp int) {
	status, err := readChargerStatus(cfg)
	if err != nil {
		debugLog(cfg, "Failed to read charger status: %v", err)
		return
	}

	chargerMode := 1
	if status.Lmo != nil {
		chargerMode = *status.Lmo
	}
	chargerAmp := 6
	if status.Amp != nil {
		chargerAmp = *status.Amp
	}
	chargerPower := 0
	if len(status.Nrg) > 11 {
		chargerPower = int(status.Nrg[11])
	}

	if chargerMode != PVMode || chargerPower > 4400 {
		housePower, err := readHousePower(cfg)
		if err != nil {
			debugLog(cfg, "Failed to read house power: %v", err)
			return
		}

		otherPower := housePower - chargerPower
		if otherPower < 0 {
			otherPower = 0
		}

		availablePower := targetLimitWatts - otherPower
		newAmp := availablePower / wattPerAmp

		if chargerPower > 0 {
			loadDiff := (chargerAmp * wattPerAmp) - chargerPower
			if loadDiff >= LoadDiffThreshold {
				newAmp++
			}
		}

		if newAmp > MaxAmperage {
			newAmp = MaxAmperage
		}
		if newAmp < MinAmperage {
			newAmp = MinAmperage
		}

		if newAmp != chargerAmp {
			log.Printf("[INFO] Adjusting charger: %dA -> %dA (~%dW)", chargerAmp, newAmp, newAmp*wattPerAmp)
			setChargerAmperage(cfg, newAmp)
		}
	} else {
		if chargerAmp != MaxAmperage {
			setChargerAmperage(cfg, MaxAmperage)
		}
	}
}

func runPVCharging(cfg Config) {
	if cfg.SMALogPath != "" && pvPowerW <= 0 {
		debugLog(cfg, "No PV power available, skipping update")
		return
	}

	housePower, err := readHousePower(cfg)
	if err != nil {
		debugLog(cfg, "Skipping charger update: invalid house power (%v)", err)
		return
	}

	sendPVData(cfg, housePower, pvPowerW)
}

func main() {
	cfg := initConfig()
	targetLimitWatts := cfg.MaxPowerLimitWatts - cfg.SafetyMarginWatts
	wattPerAmp := Phases * Voltage

	log.Println("[INFO] Starting Cross-Platform Controller...")
	log.Printf("[INFO] Charger IP: %s | Meter IP: %s", cfg.ChargerIP, cfg.P1IP)
	log.Printf("[INFO] Power limit: %dW | Watt/Amp: %dW", targetLimitWatts, wattPerAmp)
	if cfg.SMALogPath == "" {
		log.Println("[INFO] SMA Log parsing is DISABLED")
	}
	if cfg.Latitude != 999.0 && cfg.Longitude != 999.0 {
		log.Printf("[INFO] Coordinates supplied: %.4f, %.4f", cfg.Latitude, cfg.Longitude)
	}

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	stopCSVChan := make(chan struct{})
	go startP1CSVLogger(cfg, stopCSVChan)

	ticker := time.NewTicker(LoopIntervalS * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-sigChan:
			log.Println("[INFO] Shutting down gracefully")
			close(stopCSVChan)
			return
		case <-ticker.C:
			if loopCounter%PVUpdateIntervalS == 0 {
				pvPowerW = readPVPower(cfg)
				if cfg.SMALogPath != "" {
					debugLog(cfg, "Updated PV power: %dW", pvPowerW)
				}
			}

			if loopCounter%MeterCheckIntervalS == 0 {
				runLoadManagement(cfg, targetLimitWatts, wattPerAmp)
			}

			runPVCharging(cfg)

			loopCounter++
		}
	}
}
