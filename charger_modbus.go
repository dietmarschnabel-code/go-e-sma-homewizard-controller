package main

import (
	"encoding/binary"
	"fmt"
	"log"
	"net"
	"strconv"
	"sync"

	"github.com/goburrow/modbus"
)

// Register addresses are the 0-based values from the go-e API v2 Modbus map:
// https://github.com/goecharger/go-eCharger-API-v2/blob/main/modbus-en.md
// Gemini, Gemini flex, Gemini 2.0, CORE, and PRO share this map.
// The charger must have Modbus enabled (HTTP key men=true). Default port is 502,
// unit ID is 1. Writes use function 16. Function 6 is not implemented.
const (
	defaultChargerPort = 502
	defaultChargerUnit = 1

	// AMPERE_VOLATILE is the PWM current in whole amps. go-e documents it for
	// energy control. It is not stored in EEPROM, so the load loop can update
	// it without using the roughly 100,000 EEPROM write cycles of register 300.
	regAmpereVolatile uint16 = 299
	// PHASE_SWITCH_MODE matches HTTP key psm: 0=auto, 1=1-phase, 2=3-phase.
	regPhaseSwitchMode uint16 = 332
	// POWER_TOTAL is a uint32 in 0.01 W. 360000 means 3.6 kW.
	regPowerTotal uint16 = 120
	// ENERGY_TOTAL is a uint32 in 0.1 kWh. 360 means 36 kWh.
	regEnergyTotal uint16 = 128
)

// modbusSession is one TCP connection. The main loop and the CSV logger share it.
type modbusSession struct {
	mu      sync.Mutex
	addr    string
	unit    byte
	handler *modbus.TCPClientHandler
	client  modbus.Client
}

var chargerModbus modbusSession

func chargerEndpoint(cfg Config) (string, byte) {
	port := cfg.ChargerPort
	if port == 0 {
		port = defaultChargerPort
	}
	unit := cfg.ChargerUnit
	if unit == 0 {
		unit = defaultChargerUnit
	}
	return net.JoinHostPort(cfg.ChargerIP, strconv.Itoa(port)), byte(unit)
}

func (s *modbusSession) closeLocked() {
	if s.handler != nil {
		s.handler.Close()
	}
	s.handler = nil
	s.client = nil
}

func (s *modbusSession) ensureLocked(addr string, unit byte) error {
	if s.client != nil && s.addr == addr && s.unit == unit {
		return nil
	}
	s.closeLocked()
	handler := modbus.NewTCPClientHandler(addr)
	handler.Timeout = CurlTimeout
	handler.SlaveId = unit
	if err := handler.Connect(); err != nil {
		return err
	}
	s.addr = addr
	s.unit = unit
	s.handler = handler
	s.client = modbus.NewClient(handler)
	return nil
}

func withCharger(cfg Config, fn func(modbus.Client) error) error {
	addr, unit := chargerEndpoint(cfg)
	chargerModbus.mu.Lock()
	defer chargerModbus.mu.Unlock()
	if err := chargerModbus.ensureLocked(addr, unit); err != nil {
		return err
	}
	if err := fn(chargerModbus.client); err != nil {
		chargerModbus.closeLocked()
		return err
	}
	return nil
}

// decodePowerW converts POWER_TOTAL (0.01 W per count) to watts.
func decodePowerW(raw uint32) int {
	return int(raw / 100)
}

// decodeEnergyWh converts ENERGY_TOTAL (0.1 kWh per count) to watt-hours.
func decodeEnergyWh(raw uint32) float64 {
	return float64(raw) * 100
}

func readChargerModbus(cfg Config) (ChargerStatus, error) {
	var status ChargerStatus
	err := withCharger(cfg, func(client modbus.Client) error {
		ampRaw, err := client.ReadHoldingRegisters(regAmpereVolatile, 1)
		if err != nil {
			return fmt.Errorf("ampere: %w", err)
		}
		psmRaw, err := client.ReadHoldingRegisters(regPhaseSwitchMode, 1)
		if err != nil {
			return fmt.Errorf("phase mode: %w", err)
		}
		powerRaw, err := client.ReadInputRegisters(regPowerTotal, 2)
		if err != nil {
			return fmt.Errorf("power: %w", err)
		}
		energyRaw, err := client.ReadInputRegisters(regEnergyTotal, 2)
		if err != nil {
			return fmt.Errorf("energy: %w", err)
		}
		if len(ampRaw) < 2 || len(psmRaw) < 2 || len(powerRaw) < 4 || len(energyRaw) < 4 {
			return fmt.Errorf("short Modbus response")
		}
		amp := int(binary.BigEndian.Uint16(ampRaw))
		psm := int(binary.BigEndian.Uint16(psmRaw))
		status.Amp = &amp
		status.Psm = &psm
		status.PowerW = decodePowerW(binary.BigEndian.Uint32(powerRaw))
		status.EnergyWh = decodeEnergyWh(binary.BigEndian.Uint32(energyRaw))
		return nil
	})
	return status, err
}

func writeHoldingUint16(cfg Config, address uint16, value int) error {
	if value < 0 || value > 65535 {
		return fmt.Errorf("register %d value %d out of range", address, value)
	}
	var buf [2]byte
	binary.BigEndian.PutUint16(buf[:], uint16(value))
	return withCharger(cfg, func(client modbus.Client) error {
		_, err := client.WriteMultipleRegisters(address, 1, buf[:])
		return err
	})
}

func setChargerAmperage(cfg Config, amperage int) error {
	if err := writeHoldingUint16(cfg, regAmpereVolatile, amperage); err != nil {
		return err
	}
	debugLog(cfg, "Set charger amperage to %dA via Modbus register %d", amperage, regAmpereVolatile)
	return nil
}

func setChargerPhaseMode(cfg Config, phaseMode int) error {
	if err := writeHoldingUint16(cfg, regPhaseSwitchMode, phaseMode); err != nil {
		return err
	}
	debugLog(cfg, "Set charger phase mode to psm=%d via Modbus register %d", phaseMode, regPhaseSwitchMode)
	return nil
}

func closeChargerModbus() {
	chargerModbus.mu.Lock()
	defer chargerModbus.mu.Unlock()
	chargerModbus.closeLocked()
}

// logChargerTransport announces the Modbus endpoint once at startup.
func logChargerTransport(cfg Config) {
	addr, unit := chargerEndpoint(cfg)
	log.Printf("[INFO] Charger Modbus TCP %s unit %d (Gemini, CORE, and PRO)", addr, unit)
}
