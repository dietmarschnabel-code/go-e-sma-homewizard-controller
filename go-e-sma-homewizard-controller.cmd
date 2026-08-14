#!/bin/bash

# --- KONFIGURATION ---
CHARGER_IP="#.#.#.#"            # IP of go-eChargers
P1_IP="#.#.#.#"                 # IP of HomeWizard P1 Meters
MAX_POWER_LIMIT_WATTS=10000     # Power limit (only for cost minimizing)
SAFETY_MARGIN_WATTS=300         # Buffer value to avoid issues for short term changes
MAX_AMPERAGE=16                 # Maximum charging amperage (16A)
    
VOLTAGE=230                     # Standard Voltage value
PHASES=3                        # we use by default 3-phase Laden

TARGET_LIMIT_WATTS=$((MAX_POWER_LIMIT_WATTS - SAFETY_MARGIN_WATTS))
WATT_PER_AMP=$((PHASES * VOLTAGE))

i=0
CURRENT_PV_POWER=0
CURRENT_HOUSE_POWER=0

while ( true ) do
  if [ $((i % 180)) = "0" ]
  then
    if [ -f $HOME/sma-bluetooth/tmp/sma-update.log ]
    then
      # Capture the output directly 
      OUTPUT=$(grep "Total Power" "$HOME/sma-bluetooth/tmp/sma-update.log" | cut -d' ' -f15)

      # -n checks if the string has a length greater than zero (replaces [ -s ... ])
 
      if [ -n "$OUTPUT" ]; then
        CURRENT_PV_POWER="$OUTPUT"
      else
        # we are running in sync with pv update - try fix with delay. Old CURRENT_PV_POWER value to be used
        sleep 2
      fi
    fi
    i=0
  fi

  # run load management parts every minute if required.
  CURRENT_HOUSE_POWER=0

  if [ $((i % 6)) = "0" ]
  then
    # 1. check Status of go-eCharger (only lmo, amp, nrg)

    GOE_DATA=$(curl -s --max-time 3 "http://${CHARGER_IP}/api/status?filter=lmo,amp,nrg")
    if [ -n "$GOE_DATA" ] 
    then
      # Wallbox-Leistung aus nrg-Array extrahieren und direkt via jq auf Ganzzahl runden
      CURRENT_EV_POWER=$(echo "$GOE_DATA" | jq -r '.nrg[11] | round // 0')

      # Read charging mode for verification of PV-Charging
      LADEMODUS=$(echo "$GOE_DATA" | jq -r '.lmo // 1')

      # Read actually configured ampere value for comparison with calculated new value. If not available, use 6A as default.
      GOE_AMP=$(echo "$GOE_DATA" | jq -r '.amp // 6')

      if [ "$LADEMODUS" -ne 4 ] || [ "$CURRENT_EV_POWER" -gt 4400 ]
      then
        # 2. Actual total active power from HomeWizard P1 Meter
        P1_DATA=$(curl -s --max-time 3 "http://${P1_IP}/api/v1/data")
        if [ -n "$P1_DATA" ] 
        then
          # For security reasons also with round here if P1 Meter delivers float values
          CURRENT_HOUSE_POWER=$(echo "$P1_DATA" | jq -r '.active_power_w | round // 0')

          # 3. Calculate load management.
          # Calculate other house power (current house power - wallbox power)
          OTHER_HOUSE_POWER=$((CURRENT_HOUSE_POWER - CURRENT_EV_POWER))

          if [ "$OTHER_HOUSE_POWER" -lt 0 ]; then OTHER_HOUSE_POWER=0; fi

          # Available rest budget for charging within our limits
          AVAILABLE_POWER_FOR_EV=$((TARGET_LIMIT_WATTS - OTHER_HOUSE_POWER))

          # Calculate value in Ampere
          NEW_AMP=$((AVAILABLE_POWER_FOR_EV / WATT_PER_AMP))

          if [ "$CURRENT_EV_POWER" -gt 0 ]
          then
            # Calculate Pushup for weaker loading vehicles
            LOAD_DIFF_POWER=$((GOE_AMP * WATT_PER_AMP - CURRENT_EV_POWER))

            if [ "$LOAD_DIFF_POWER" -ge 500 ]; then NEW_AMP=$((NEW_AMP + 1)); fi
          fi

          # Stay with values within limits upper limit 16 A, Lower limit with 6A fixed)
          if [ "$NEW_AMP" -gt $MAX_AMPERAGE ]; then NEW_AMP=$MAX_AMPERAGE; fi
          if [ "$NEW_AMP" -lt 6 ]; then  NEW_AMP=6;  fi  # KEIN Abschalten, minimales Laden läuft weiter

          # 4. go-eCharger set limit
          if [ "$NEW_AMP" -ne "$GOE_AMP" ]; then
            # echo "--> Passe Ladestrom an: ${GOE_AMP}A -> ${NEW_AMP}A (~$((NEW_AMP * WATT_PER_AMP))W)"
            curl -s "http://${CHARGER_IP}/api/set?amp=${NEW_AMP}" > /dev/null
          fi
        fi
      else
         # set limit to 16 Ampere for PV charging if not already set. This is required for PV charging with go-eCharger.
         if [ "$MAX_AMPERAGE" -ne "$GOE_AMP" ]; then
          curl -s "http://${CHARGER_IP}/api/set?amp=$MAX_AMPERAGE" > /dev/null
        fi
      fi
    fi
  fi
   
  # Send data for PV loading only if there is sun energy available.

  if [ "$CURRENT_PV_POWER" -gt "0" ]
  then
    if [ "$CURRENT_HOUSE_POWER" -eq 0 ]; then P1_DATA=$(curl -s --max-time 3 "http://${P1_IP}/api/v1/data"); fi
    if [ -n "$P1_DATA" ] 
    then
      # For security reasons also with round here if P1 Meter delivers float values
      CURRENT_HOUSE_POWER=$(echo "$P1_DATA" | jq -r '.active_power_w | round // 0')

      # Update values for GO-E-charger built in PV loading mainly $CURRENT_HOUSE_POWER
      curl --max-time 10 --retry 2 --silent --output /dev/null --url-query "ids={\"pGrid\":$CURRENT_HOUSE_POWER,\"pPv\":$CURRENT_PV_POWER,\"pAkku\":0}" "http://$CHARGER_IP/api/set"
#      wget -O - --timeout=10 --tries=3 http://$CHARGER_IP/api/set?ids=\{"pGrid":$CURRENT_HOUSE_POWER,\ "pPv":$CURRENT_PV_POWER,\ "pAkku":0\} >/dev/null 2>&1
    fi
  fi
  sleep 5
  i=$((i+1))
done
