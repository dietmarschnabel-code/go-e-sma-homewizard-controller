#!/bin/bash

################################################################################
# go-e-sma-homewizard-controller
#
# Linux bash script to provide data for a go-e-charger with support for load
# management to avoid higher Austrian net charges for above 10KW house power.
# Includes sample connection to SMA inverter via Bluetooth.
#
# License: GPL-3.0 (see LICENSE file)
# Usage: bash go-e-sma-homewizard-controller.sh [--debug]
# 
# Configuration: Edit CHARGER_IP, P1_IP, and MAX_POWER_LIMIT_WATTS below
################################################################################

set -euo pipefail  # Exit on error, undefined vars, pipe failures

# ============================================================================
# CONFIGURATION FILE PATHS
# ============================================================================

readonly CONFIG_DIRS=(
    "/etc/go-e-sma-homewizard-controller"
    "$HOME/.config/go-e-sma-homewizard-controller"
    "$(dirname "$0")"
)
readonly CONFIG_FILE_NAME="go-e-sma-homewizard-controller.conf"

# ============================================================================
# CONFIGURATION - Default values (can be overridden by config file or env vars)
# ============================================================================

CHARGER_IP="#.#.#.#"              # IP of go-eCharger
P1_IP="#.#.#.#"                   # IP of HomeWizard P1 Meter
MAX_POWER_LIMIT_WATTS=10000        # Power limit in watts
SAFETY_MARGIN_WATTS=300            # Buffer to avoid short-term issues

# ============================================================================
# CONFIGURATION FILE LOADING
# ============================================================================

find_config_file() {
    local dir
    for dir in "${CONFIG_DIRS[@]}"; do
        local config_path="$dir/$CONFIG_FILE_NAME"
        if [[ -f "$config_path" && -r "$config_path" ]]; then
            echo "$config_path"
            return 0
        fi
    done
    return 1
}

# Parse INI-style config file
# Format: KEY=VALUE (lines starting with # are ignored, as are empty lines)
load_config_file() {
    local config_file="$1"
    
    if [[ ! -f "$config_file" ]]; then
        debug "Config file not found: $config_file"
        return 1
    fi
    
    info "Loading configuration from: $config_file"
    
    local line
    while IFS='=' read -r key value || [[ -n "$key" ]]; do
        # Skip comments and empty lines
        [[ "$key" =~ ^#.*$ ]] && continue
        [[ -z "$key" ]] && continue
        
        # Trim whitespace
        key=$(echo "$key" | xargs)
        value=$(echo "$value" | xargs)
        
        case "$key" in
            CHARGER_IP)
                CHARGER_IP="$value"
                debug "Config: CHARGER_IP=$CHARGER_IP"
                ;;
            P1_IP)
                P1_IP="$value"
                debug "Config: P1_IP=$P1_IP"
                ;;
            MAX_POWER_LIMIT_WATTS)
                MAX_POWER_LIMIT_WATTS="$value"
                debug "Config: MAX_POWER_LIMIT_WATTS=$MAX_POWER_LIMIT_WATTS"
                ;;
            SAFETY_MARGIN_WATTS)
                SAFETY_MARGIN_WATTS="$value"
                debug "Config: SAFETY_MARGIN_WATTS=$SAFETY_MARGIN_WATTS"
                ;;
            *)
                debug "Unknown config key: $key"
                ;;
        esac
    done < "$config_file"
    
    return 0
}

# Initialize configuration: config file → environment variables → defaults
init_config() {
    local config_file
    
    # Try to find and load config file
    if config_file=$(find_config_file); then
        load_config_file "$config_file"
    else
        debug "No configuration file found in: ${CONFIG_DIRS[*]}"
    fi
    
    # Environment variables override config file
    CHARGER_IP="${CHARGER_IP_ENV:-$CHARGER_IP}"
    P1_IP="${P1_IP_ENV:-$P1_IP}"
    MAX_POWER_LIMIT_WATTS="${MAX_POWER_LIMIT_WATTS_ENV:-$MAX_POWER_LIMIT_WATTS}"
    SAFETY_MARGIN_WATTS="${SAFETY_MARGIN_WATTS_ENV:-$SAFETY_MARGIN_WATTS}"
}

# ============================================================================
# CONSTANTS
# ============================================================================

readonly VOLTAGE=230                                        # Standard voltage value
readonly PHASES=3                                           # Default 3-phase
readonly LOOP_INTERVAL_S=5                                  # Main loop sleep interval
readonly PV_UPDATE_INTERVAL_S=180                           # Update PV every 180 iterations
readonly METER_CHECK_INTERVAL_S=6                           # Check meter every 6 iterations
readonly MIN_AMPERAGE=6                                     # Minimum charging amperage (6A)
readonly MAX_AMPERAGE=16                                    # Maximum charging amperage (16A)
readonly PV_MODE=4                                          # PV loading mode value
readonly LOAD_DIFF_THRESHOLD=500                            # Watts threshold for load adjustment
readonly CURL_TIMEOUT=3                                     # Curl timeout for API calls
readonly SMA_LOG_FILE="$HOME/sma-bluetooth/tmp/sma-update.log"

# Derived constants (will be recalculated after config load)
TARGET_LIMIT_WATTS=$((MAX_POWER_LIMIT_WATTS - SAFETY_MARGIN_WATTS))
WATT_PER_AMP=$((PHASES * VOLTAGE))

# ============================================================================
# STATE VARIABLES
# ============================================================================

loop_counter=0
pv_power_w=0
house_power_w=0
debug_mode=false

# ============================================================================
# LOGGING & DEBUG
# ============================================================================

log() {
    local level="$1"
    shift
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$level] $*" >&2
}

debug() {
    if [[ "$debug_mode" == true ]]; then
        log "DEBUG" "$@"
    fi
}

info() {
    log "INFO" "$@"
}

error() {
    log "ERROR" "$@"
}

# ============================================================================
# API HELPERS
# ============================================================================

# Call curl with standard timeout and error handling
curl_api() {
    local url="$1"
    local response
    
    if ! response=$(curl -s --max-time "$CURL_TIMEOUT" "$url" 2>/dev/null); then
        debug "curl_api failed for: $url"
        return 1
    fi
    
    echo "$response"
}

# Extract JSON field with fallback value
jq_safe() {
    local filter="$1"
    local fallback="$2"
    
    jq -r "$filter // $fallback" 2>/dev/null || echo "$fallback"
}

# ============================================================================
# PV POWER READING
# ============================================================================

read_pv_power() {
    local power=0
    
    if [[ ! -f "$SMA_LOG_FILE" ]]; then
        debug "SMA log file not found: $SMA_LOG_FILE"
        return 0
    fi
    
    # Extract "Total Power" value from SMA log (column 15)
    local output
    output=$(grep "Total Power" "$SMA_LOG_FILE" 2>/dev/null | tail -1 | cut -d' ' -f15)
    
    if [[ -n "$output" && "$output" =~ ^[0-9]+$ ]]; then
        power="$output"
    else
        debug "Failed to parse PV power from SMA log"
    fi
    
    echo "$power"
}

# ============================================================================
# CHARGER STATUS
# ============================================================================

read_charger_status() {
    local response
    response=$(curl_api "http://${CHARGER_IP}/api/status?filter=lmo,amp,nrg") || return 1
    
    if [[ -z "$response" ]]; then
        debug "Empty charger response"
        return 1
    fi
    
    echo "$response"
}

get_charger_power_w() {
    local charger_data="$1"
    jq_safe '.nrg[11] | round' '0' <<<"$charger_data"
}

get_charger_amperage() {
    local charger_data="$1"
    jq_safe '.amp' '6' <<<"$charger_data"
}

get_charger_mode() {
    local charger_data="$1"
    jq_safe '.lmo' '1' <<<"$charger_data"
}

# ============================================================================
# METER STATUS
# ============================================================================

read_house_power() {
    local response
    response=$(curl_api "http://${P1_IP}/api/v1/data") || return 1
    
    if [[ -z "$response" ]]; then
        debug "Empty meter response"
        return 1
    fi
    
    # Extract active power with rounding
    jq_safe '.active_power_w | round' '0' <<<"$response"
}

# ============================================================================
# LOAD MANAGEMENT CALCULATION
# ============================================================================

calculate_new_amperage() {
    local house_power="$1"
    local charger_power="$2"
    local current_amp="$3"
    
    # Calculate other house power (excluding EV)
    local other_power=$((house_power - charger_power))
    if [[ $other_power -lt 0 ]]; then
        other_power=0
    fi
    
    # Calculate available power budget
    local available_power=$((TARGET_LIMIT_WATTS - other_power))
    
    # Convert to amperage
    local new_amp=$((available_power / WATT_PER_AMP))
    
    # Adjust for power delivery efficiency (push-up for weaker chargers)
    if [[ $charger_power -gt 0 ]]; then
        local load_diff=$((current_amp * WATT_PER_AMP - charger_power))
        if [[ $load_diff -ge $LOAD_DIFF_THRESHOLD ]]; then
            new_amp=$((new_amp + 1))
        fi
    fi
    
    # Enforce min/max limits
    if [[ $new_amp -gt $MAX_AMPERAGE ]]; then
        new_amp=$MAX_AMPERAGE
    fi
    if [[ $new_amp -lt $MIN_AMPERAGE ]]; then
        new_amp=$MIN_AMPERAGE
    fi
    
    echo "$new_amp"
}

# ============================================================================
# CHARGER CONTROL
# ============================================================================

set_charger_amperage() {
    local amperage="$1"
    local url="http://${CHARGER_IP}/api/set?amp=${amperage}"
    
    if curl_api "$url" >/dev/null; then
        debug "Set charger amperage to ${amperage}A"
        return 0
    else
        error "Failed to set charger amperage"
        return 1
    fi
}

send_pv_data() {
    local house_power="$1"
    local pv_power="$2"
    
    local data="{\"pGrid\":${house_power},\"pPv\":${pv_power},\"pAkku\":0}"
    local url="http://${CHARGER_IP}/api/set"
    
    if curl -s --max-time 10 --retry 2 --output /dev/null --url-query "ids=$data" "$url"; then
        debug "Sent PV data to charger"
        return 0
    else
        error "Failed to send PV data"
        return 1
    fi
}

# ============================================================================
# LOAD MANAGEMENT LOGIC
# ============================================================================

run_load_management() {
    local charger_response
    charger_response=$(read_charger_status) || return 1
    
    local charger_power
    charger_power=$(get_charger_power_w "$charger_response")
    
    local charger_mode
    charger_mode=$(get_charger_mode "$charger_response")

    local charger_amp
    charger_amp=$(get_charger_amperage "$charger_response")
    
    # Only run load management if NOT in PV mode or power is high
    if [[ $charger_mode -ne $PV_MODE ]] || [[ $charger_power -gt 4400 ]]; then
        local house_power
        house_power=$(read_house_power) || return 1
        
        local new_amp
        new_amp=$(calculate_new_amperage "$house_power" "$charger_power" "$charger_amp")
        
        # Update charger if amperage changed
        if [[ $new_amp -ne $charger_amp ]]; then
            info "Adjusting charger: ${charger_amp}A → ${new_amp}A (~$((new_amp * WATT_PER_AMP))W)"
            set_charger_amperage "$new_amp"
        fi
    else
        # PV mode: set to maximum if value has changed
        if [[ $charger_amp -ne $MAX_AMPERAGE ]]; then
          set_charger_amperage "$MAX_AMPERAGE"
        fi
    fi
}

# ============================================================================
# PV CHARGING SUPPORT
# ============================================================================

run_pv_charging() {
    if [[ $pv_power_w -le 0 ]]; then
        debug "No PV power available, skipping PV charging update"
        return 0
    fi
    
    local house_power
    house_power=$(read_house_power) || return 1
    
    if [[ -z "$house_power" || $house_power -eq 0 ]]; then
        debug "Skipping PV charging: invalid house power"
        return 1
    fi
    
    send_pv_data "$house_power" "$pv_power_w"
}

# ============================================================================
# MAIN LOOP
# ============================================================================

main() {
    # Initialize configuration from file and environment
    init_config
    
    # Recalculate derived constants after loading config
    TARGET_LIMIT_WATTS=$((MAX_POWER_LIMIT_WATTS - SAFETY_MARGIN_WATTS))
    WATT_PER_AMP=$((PHASES * VOLTAGE))
    
    info "Starting go-e-sma-homewizard-controller"
    info "Charger IP: $CHARGER_IP | Meter IP: $P1_IP"
    info "Power limit: ${TARGET_LIMIT_WATTS}W | Watt/Amp: ${WATT_PER_AMP}W"
    
    # Validate configuration
    if [[ "$CHARGER_IP" == "#.#.#.#" ]] || [[ "$P1_IP" == "#.#.#.#" ]]; then
        error "Please configure CHARGER_IP and P1_IP addresses!"
        error "Edit configuration file or set environment variables:"
        error "  - $CONFIG_FILE_NAME in ${CONFIG_DIRS[0]}"
        error "  - Or set: CHARGER_IP_ENV and P1_IP_ENV"
        return 1
    fi
    
    while true; do
        # Update PV power every PV_UPDATE_INTERVAL_S
        if [[ $((loop_counter % $((PV_UPDATE_INTERVAL_S / LOOP_INTERVAL_S)))) -eq 0 ]]; then
            pv_power_w=$(read_pv_power)
            debug "Updated PV power: ${pv_power_w}W"
        fi
        
        # Run load management every METER_CHECK_INTERVAL_S
        if [[ $((loop_counter % $((METER_CHECK_INTERVAL_S / LOOP_INTERVAL_S)))) -eq 0 ]]; then
            run_load_management || debug "Load management cycle failed"
        fi
        
        # Send PV data if available
        run_pv_charging || debug "PV charging update failed"
        
        loop_counter=$((loop_counter + 1))
        sleep "$LOOP_INTERVAL_S"
    done
}

# ============================================================================
# CLEANUP & ENTRY POINT
# ============================================================================

cleanup() {
    info "Shutting down gracefully"
    exit 0
}

trap cleanup SIGTERM SIGINT

# Parse command-line arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --debug)
            debug_mode=true
            info "Debug mode enabled"
            ;;
        *)
            echo "Usage: $0 [--debug]"
            exit 1
            ;;
    esac
    shift
done

# Run main loop
main "$@"
