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
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/signal"
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
)

// Config holds the execution parameters
type Config struct {
	ChargerIP          string
	P1IP               string
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
}

// HomeWizardData maps the P1 meter API response
type HomeWizardData struct {
	ActivePowerW float64 `json:"active_power_w"`
}

// initConfig parses flags and environment variables
func initConfig() Config {
	c := Config{}
	flag.StringVar(&c.ChargerIP, "charger", "192.168.1.50", "IP address of the go-eCharger")
	flag.StringVar(&c.P1IP, "p1", "192.168.1.60", "IP address of the HomeWizard P1 Meter")
	flag.StringVar(&c.SMALogPath, "sma-log", "C:\\temp\\sma-update.log", "Path to the SMA log file (leave empty to disable)")
	flag.IntVar(&c.MaxPowerLimitWatts, "max-power", 10000, "Maximum power limit in watts")
	flag.IntVar(&c.SafetyMarginWatts, "margin", 300, "Safety margin in watts")
	
	// Set out-of-bounds defaults to detect if they were explicitly configured
	flag.Float64Var(&c.Latitude, "lat", 999.0, "Latitude (set to enable precise sunrise calculation)")
	flag.Float64Var(&c.Longitude, "lng", 999.0, "Longitude (set to enable precise sunrise calculation)")
	
	flag.BoolVar(&c.DebugMode, "debug", false, "Enable debug output")
	flag.Parse()

	// Environment variable overrides
	if env := os.Getenv("CHARGER_IP"); env != "" {
		c.ChargerIP = env
	}
	if env := os.Getenv("P1_IP"); env != "" {
		c.P1IP = env
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
	return c
}

func debugLog(cfg Config, format string, v ...interface{}) {
	if cfg.DebugMode {
		log.Printf("[DEBUG] "+format, v...)
	}
}

// readPVPower extracts the most recent Total Power from the SMA log
func readPVPower(cfg Config) int {
	// Bypass file reading if the path is empty
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
			fields := strings.Fields(line)
			if len(fields) >= 15 {
				lastValidPower = fields[14]
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

func readHousePower(cfg Config) (int, error) {
	resp, err := httpClient.Get(fmt.Sprintf("http://%s/api/v1/data", cfg.P1IP))
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	var data HomeWizardData
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return 0, err
	}
	return int(data.ActivePowerW), nil
}

func readChargerStatus(cfg Config) (ChargerStatus, error) {
	var status ChargerStatus
	resp, err := httpClient.Get(fmt.Sprintf("http://%s/api/status?filter=lmo,amp,nrg", cfg.ChargerIP))
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
	// Skip updates if SMA logging is active but there is no solar power
	if cfg.SMALogPath != "" && pvPowerW <= 0 {
		debugLog(cfg, "No PV power available, skipping update")
		return
	}

	// Disable updates if SMA logging is disabled AND it is nighttime
	// The isNightTime function is automatically wired up during compilation based on your build tags
	if cfg.SMALogPath == "" && isNightTime(cfg.Latitude, cfg.Longitude) {
		debugLog(cfg, "Nighttime detected, skipping update")
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

	ticker := time.NewTicker(LoopIntervalS * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-sigChan:
			log.Println("[INFO] Shutting down gracefully")
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