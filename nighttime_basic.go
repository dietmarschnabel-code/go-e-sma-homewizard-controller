//go:build !solar

package main

import "time"

// isNightTime uses static hours (21:00-05:00) when solar calculation is excluded.
func isNightTime(lat, lng float64) bool {
	hour := time.Now().Hour()
	return hour >= 21 || hour < 5
}
