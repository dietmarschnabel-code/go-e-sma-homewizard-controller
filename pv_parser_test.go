package main

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestReadPVCSVRowsWithDecimalComma(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "pv_data-202501.csv")
	content := "sep=;\nVersion CSV1|Tool SE|Linebreaks CR/LF|Delimiter semicolon|Decimalpoint comma|Precision 3\n\n;SN: 2100514862;SN: 2100514862\n;SB 5000TL-20;SB 5000TL-20\n;2100514862;2100514862\n;Gesamtertrag;Tagesertrag\n;Counter;Analog\ndd.MM.yyyy;kWh;kWh\n27.09.2011;0,457;0,321\n28.09.2011;23,282;22,825\n29.09.2011;49,568;26,286\n30.09.2011;76,143;26,575\n"
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	var total float64
	if err := readPVCSVRows(path, 2, func(row []string, value float64) {
		if _, err := time.Parse("02.01.2006", row[0]); err == nil {
			total += value
		}
	}); err != nil {
		t.Fatal(err)
	}
	if total != 76.007 {
		t.Fatalf("expected 76.007, got %v", total)
	}
}

func TestCreateYearlyPVDistributionWithSMAData(t *testing.T) {
	dir := t.TempDir()
	content := "sep=;\ndd.MM.yyyy;kWh;kWh\n27.09.2021;0,457;0,321\n28.09.2021;23,282;22,825\n"
	if err := os.WriteFile(filepath.Join(dir, "pv_data-202109.csv"), []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	if err := createYearlyPVDistribution(dir, time.Date(2026, 9, 11, 0, 0, 0, 0, time.Local)); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dir, "yearly-distribution.csv")); err != nil {
		t.Fatalf("yearly distribution was not created: %v", err)
	}
}
