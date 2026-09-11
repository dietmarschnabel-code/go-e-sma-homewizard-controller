/**
 * Handles SMA PV CSV Data Parsing for Daily, Monthly, and Yearly Views
 */

// CONFIGURATION: Set time offset in minutes ONLY for PV data alignment.
// Positive values shift PV data forward (+15 moves 12:00 -> 12:15).
// Negative values shift PV data backward (-15 moves 12:15 -> 11:45).
const PV_TIME_OFFSET_MINUTES = -10;

let pvDistributionPromise = null;

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

function parseDistributionCSV(csvText, type) {
    const result = {};
    const lines = csvText.split(/\r?\n/);

    lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;

        const delimiter = trimmed.includes(';') ? ';' : (trimmed.includes('\t') ? '\t' : ',');
        const parts = trimmed.split(delimiter).map(part => part.trim());
        if (parts.length < 2) return;

        const keyMatch = type === 'daily'
            ? parts[0].match(/(?:^|\s)(\d{1,2})(?::\d{2})?/)
            : parts[0].match(/^(\d{1,2})$/);
        if (!keyMatch) return;

        const key = parseInt(keyMatch[1], 10);
        const value = parseFloat(parts[parts.length - 1].replace(',', '.'));
        const validKey = type === 'daily' ? key >= 0 && key <= 23 : key >= 1 && key <= 12;
        if (validKey && Number.isFinite(value) && value >= 0) result[key] = value;
    });

    const total = Object.values(result).reduce((sum, value) => sum + value, 0);
    if (type === 'daily' && total > 0) {
        Object.keys(result).forEach(key => { result[key] /= total; });
    }
    return result;
}

async function deriveDailyDistribution(referenceDate = new Date()) {
    const dates = [];
    for (let daysAgo = 1; daysAgo <= 7; daysAgo++) {
        const date = new Date(referenceDate);
        date.setHours(0, 0, 0, 0);
        date.setDate(date.getDate() - daysAgo);
        dates.push(date);
    }

    const dailyRecords = await Promise.all(dates.map(date => fetchPVDailyData(date)));
    const hourlyProduction = {};
    dailyRecords.flat().forEach(record => {
        const hour = parseInt(record.timeOnly.substring(0, 2), 10);
        if (!Number.isInteger(hour) || record.pv_power_w <= 0) return;
        hourlyProduction[hour] = (hourlyProduction[hour] || 0) + record.pv_power_w;
    });

    const totalProduction = Object.values(hourlyProduction).reduce((sum, value) => sum + value, 0);
    if (totalProduction <= 0) return {};
    Object.keys(hourlyProduction).forEach(hour => {
        hourlyProduction[hour] /= totalProduction;
    });
    return hourlyProduction;
}

async function deriveYearlyDistribution(referenceDate = new Date()) {
    const monthlyProduction = {};
    const monthCounts = {};
    const firstYear = referenceDate.getFullYear() - 5;
    const years = Array.from({ length: 5 }, (_, index) => firstYear + index);
    const monthlyResults = await Promise.all(years.flatMap(year =>
        Array.from({ length: 12 }, (_, monthIndex) =>
            fetchPVMonthlyData(year, monthIndex + 1).then(values => ({ month: monthIndex + 1, values }))
        )
    ));

    monthlyResults.forEach(({ month, values }) => {
        const monthTotal = Object.values(values).reduce((sum, value) => sum + value, 0);
        if (monthTotal > 0) {
            monthlyProduction[month] = (monthlyProduction[month] || 0) + monthTotal;
            monthCounts[month] = (monthCounts[month] || 0) + 1;
        }
    });

    Object.keys(monthlyProduction).forEach(month => {
        monthlyProduction[month] /= monthCounts[month];
    });
    return monthlyProduction;
}

async function fetchPVDistributions() {
    if (!pvDistributionPromise) {
        pvDistributionPromise = Promise.all([
            fetch('/pv/daily-distribution.csv').then(response => response.ok ? response.text() : ''),
            fetch('/pv/yearly-distribution.csv').then(response => response.ok ? response.text() : '')
        ]).then(async ([dailyText, yearlyText]) => {
            const [daily, yearly] = await Promise.all([
                dailyText ? parseDistributionCSV(dailyText, 'daily') : deriveDailyDistribution(),
                yearlyText ? parseDistributionCSV(yearlyText, 'yearly') : deriveYearlyDistribution()
            ]);
            return { daily, yearly };
        }).catch(() => ({ daily: {}, yearly: {} }));
    }
    return pvDistributionPromise;
}
