/**
 * Handles SMA PV CSV Data Parsing for Daily, Monthly, and Yearly Views
 */

// CONFIGURATION: Set time offset in minutes ONLY for PV data alignment.
// Positive values shift PV data forward (+15 moves 12:00 -> 12:15).
// Negative values shift PV data backward (-15 moves 12:15 -> 11:45).
const PV_TIME_OFFSET_MINUTES = -10;

function formatDateYYYYMMDD(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return yyyy + mm + dd;
}

function formatDateYYYYMM(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    return yyyy + mm;
}

// Standard 5-minute rounding with optional offset (defaults to 0 so P1 data stays untouched)
function roundTo5Minutes(timeStr, offsetMinutes = 0) {
    if (!timeStr || !timeStr.includes(':')) return timeStr;
    const parts = timeStr.split(':');
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    if (isNaN(hours) || isNaN(minutes)) return timeStr;
    
    // Apply minute offset
    let totalMinutes = hours * 60 + minutes + offsetMinutes;
    
    // Handle 24-hour day wrap-around
    while (totalMinutes < 0) {
        totalMinutes += 24 * 60;
    }
    totalMinutes = totalMinutes % (24 * 60);

    const rounded = Math.round(totalMinutes / 5) * 5;
    const h = Math.floor((rounded % (24 * 60)) / 60);
    const m = rounded % 60;
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

// Parse daily 5-min intervals
function parsePVDailyCSV(csvText) {
    const lines = csvText.trim().split('\n');
    const records = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line.startsWith('sep=') || line.startsWith('Version') || line.startsWith(';') || line.startsWith('dd.MM.yyyy')) {
            continue;
        }

        const parts = line.split(';');
        if (parts.length >= 3) {
            const rawDateTime = parts[0].trim(); // "17.08.2026 00:00:00"
            const totalKWhStr = parts[1].trim().replace(',', '.'); // Column 2: Cumulative Yield
            const kwStr = parts[2].trim().replace(',', '.');       // Column 3: Instantaneous Power (kW)

            const totalKWh = parseFloat(totalKWhStr);
            const powerKW = parseFloat(kwStr);

            if (!isNaN(powerKW)) {
                const timeOnly = rawDateTime.split(' ')[1] ? rawDateTime.split(' ')[1].substring(0, 5) : rawDateTime;
                // Explicitly pass PV_TIME_OFFSET_MINUTES ONLY for PV records
                records.push({
                    timeOnly: roundTo5Minutes(timeOnly, PV_TIME_OFFSET_MINUTES),
                    pv_power_w: Math.round(powerKW * 1000),
                    pv_total_kwh: !isNaN(totalKWh) ? totalKWh : 0
                });
            }
        }
    }
    return records;
}

// Parse monthly summary CSV (daily totals for a given month)
function parsePVMonthlyCSV(csvText) {
    const lines = csvText.trim().split('\n');
    const dailyTotals = {}; // key: day number (1-31), value: kWh

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line.startsWith('sep=') || line.startsWith('Version') || line.startsWith(';') || line.startsWith('dd.MM.yyyy')) {
            continue;
        }

        const parts = line.split(';');
        if (parts.length >= 3) {
            const dateStr = parts[0].trim(); // "17.08.2026 00:00:00" or "17.08.2026"
            const dailyKWhStr = parts[2].trim().replace(',', '.');
            const dailyKWh = parseFloat(dailyKWhStr);

            const dayMatch = dateStr.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
            if (dayMatch && !isNaN(dailyKWh)) {
                const dayNum = parseInt(dayMatch[1], 10);
                dailyTotals[dayNum] = dailyKWh;
            }
        }
    }
    return dailyTotals;
}

async function fetchPVDailyData(date) {
    const dateStr = formatDateYYYYMMDD(date);
    const paths = ['/pv/pv_data-' + dateStr + '.csv', '/pv/pv-data-' + dateStr + '.csv'];

    for (const path of paths) {
        try {
            const res = await fetch(path);
            if (res.ok) return parsePVDailyCSV(await res.text());
        } catch (e) {}
    }
    return [];
}

async function fetchPVMonthlyData(year, month) {
    const dateObj = new Date(year, month - 1, 1);
    const yyyymm = formatDateYYYYMM(dateObj);
    const paths = [
        '/pv/pv_data-' + yyyymm + '.csv',
        '/pv/' + year + '/pv_data-' + yyyymm + '.csv',
        '/pv/' + year + '/MyPlant-' + yyyymm + '.csv',
        '/pv/MyPlant-' + yyyymm + '.csv'
    ];

    for (const path of paths) {
        try {
            const res = await fetch(path);
            if (res.ok) return parsePVMonthlyCSV(await res.text());
        } catch (e) {}
    }
    return {};
}
