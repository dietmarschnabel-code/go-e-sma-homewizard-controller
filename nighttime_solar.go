//go:build solar

package main

import (
	"time"

	"github.com/nathan-osman/go-sunrise"
)

// isNightTime uses precise solar calculation or falls back to static hours.
func isNightTime(lat, lng float64) bool {
	now := time.Now()

	// Fallback to static time window if coordinates were not provided
	if lat == 999.0 || lng == 999.0 {
		hour := now.Hour()
		return hour >= 21 || hour < 5
	}

	// Use exact solar calculation
	rise, set := sunrise.SunriseSunset(lat, lng, now.Year(), now.Month(), now.Day())
	return now.Before(rise) || now.After(set)
}
