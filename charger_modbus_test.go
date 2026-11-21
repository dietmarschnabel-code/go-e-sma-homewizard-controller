package main

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"testing"
	"time"
)

func TestDecodePowerW(t *testing.T) {
	// go-e: 360000 counts of 0.01 W equal 3.6 kW.
	if got := decodePowerW(360000); got != 3600 {
		t.Fatalf("decodePowerW(360000) = %d, want 3600", got)
	}
	if got := decodePowerW(0); got != 0 {
		t.Fatalf("decodePowerW(0) = %d, want 0", got)
	}
}

func TestDecodeEnergyWh(t *testing.T) {
	// go-e: 360 counts of 0.1 kWh equal 36 kWh, which is 36000 Wh.
	if got := decodeEnergyWh(360); got != 36000 {
		t.Fatalf("decodeEnergyWh(360) = %v, want 36000", got)
	}
}

func TestUint32BigEndianMatchesGoEWordOrder(t *testing.T) {
	// Firmware 59.4 returns ENERGY_TOTAL with the high word first.
	raw := []byte{0x00, 0x01, 0x31, 0x51}
	if got := binary.BigEndian.Uint32(raw); got != 78161 {
		t.Fatalf("big-endian energy = %d, want 78161", got)
	}
	if got := decodeEnergyWh(78161); got != 7816100 {
		t.Fatalf("energy Wh = %v, want 7816100", got)
	}
}

func TestLiveChargerModbusRead(t *testing.T) {
	ip := os.Getenv("GOE_CHARGER_IP")
	if ip == "" {
		t.Skip("GOE_CHARGER_IP not set")
	}
	cfg := Config{ChargerIP: ip, ChargerPort: defaultChargerPort, ChargerUnit: defaultChargerUnit}
	status, err := readChargerModbus(cfg)
	if err != nil {
		t.Fatalf("read charger: %v", err)
	}
	if status.Amp == nil || *status.Amp < 6 || *status.Amp > 32 {
		t.Fatalf("amp = %v, want 6..32", status.Amp)
	}
	if status.Psm == nil || *status.Psm < 0 || *status.Psm > 2 {
		t.Fatalf("psm = %v, want 0..2", status.Psm)
	}
	if status.PowerW < 0 {
		t.Fatalf("power = %d, want >= 0", status.PowerW)
	}
	if status.EnergyWh < 0 {
		t.Fatalf("energy = %v, want >= 0", status.EnergyWh)
	}
	t.Logf("amp=%d psm=%d powerW=%d energyWh=%.0f", *status.Amp, *status.Psm, status.PowerW, status.EnergyWh)

	httpStatus, err := readHTTPChargerSample(ip)
	if err != nil {
		t.Fatalf("http status: %v", err)
	}
	if httpStatus.Amp != nil && *status.Amp != *httpStatus.Amp {
		t.Fatalf("modbus amp %d != http amp %d", *status.Amp, *httpStatus.Amp)
	}
	if httpStatus.Psm != nil && *status.Psm != *httpStatus.Psm {
		t.Fatalf("modbus psm %d != http psm %d", *status.Psm, *httpStatus.Psm)
	}
	if httpStatus.Eto != nil {
		modbusKWh := status.EnergyWh / 1000
		httpKWh := *httpStatus.Eto / 1000
		delta := modbusKWh - httpKWh
		if delta < 0 {
			delta = -delta
		}
		// ENERGY_TOTAL is published in steps of 0.1 kWh.
		if delta > 0.1 {
			t.Fatalf("modbus energy %.3f kWh differs from http %.3f kWh by more than 0.1", modbusKWh, httpKWh)
		}
	}
}

type httpChargerSample struct {
	Amp *int     `json:"amp"`
	Psm *int     `json:"psm"`
	Eto *float64 `json:"eto"`
}

func readHTTPChargerSample(ip string) (httpChargerSample, error) {
	var sample httpChargerSample
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(fmt.Sprintf("http://%s/api/status?filter=amp,psm,eto", ip))
	if err != nil {
		return sample, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return sample, fmt.Errorf("status %s", resp.Status)
	}
	err = json.NewDecoder(resp.Body).Decode(&sample)
	return sample, err
}
