/**
 * Handles HomeWizard P1 CSV Data Parsing for Daily, Monthly, and Yearly Views
 */

let energyPricesCache = null;

async function fetchEnergyPrices() {
    if (energyPricesCache) return energyPricesCache;

    try {
        const res = await fetch('/p1/energy-prices.csv');
        if (!res.ok) return [];
        const text = await res.text();
        const lines = text.trim().split(/\r?\n/);
        const prices = [];

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#') || trimmed.toLowerCase().startsWith('valid') || trimmed.toLowerCase().startsWith('datum')) continue;
            
            const parts = trimmed.split(',').map(p => p.trim());
            if (parts.length >= 3) {
                const dateStr = parts[0];
                const importPrice = parseFloat(parts[1]) || 0;
                const exportPrice = parseFloat(parts[2]) || 0;
                if (dateStr) {
                    prices.push({
                        date: parseLocalDate(dateStr),
                        dateStr: dateStr,
                        importPrice,
                        exportPrice
                    });
                }
            }
        }
        
        prices.sort((a, b) => a.date - b.date);
        energyPricesCache = prices;
        return prices;
    } catch (e) {
        console.warn("energy-prices.csv konnte nicht geladen werden", e);
        return [];
    }
}

async function getPricesForDate(targetDate) {
    const prices = await fetchEnergyPrices();
    if (prices.length === 0) return { importPrice: 0, exportPrice: 0 };

    let activePrice = prices[0];
    for (const p of prices) {
        if (targetDate >= p.date) {
            activePrice = p;
        } else {
            break;
        }
    }
    return activePrice;
}

function parseP1DailyCSV(csvText) {
    const lines = csvText.trim().split('\n');
    if (lines.length <= 1) return [];

    const records = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line.startsWith('timestamp')) continue;

        const [timestamp, importKWh, exportKWh, activePowerW, chargerTotalKWh, chargerPowerW] = line.split(',');

        if (timestamp) {
            const timeOnly = timestamp.split(' ')[1] ? timestamp.split(' ')[1].substring(0, 5) : timestamp;
            records.push({
                timestamp: timestamp,
                timeOnly: typeof roundTo5Minutes === 'function' ? roundTo5Minutes(timeOnly) : timeOnly,
                import_kwh: parseFloat(importKWh) || 0,
                export_kwh: parseFloat(exportKWh) || 0,
                active_power_w: parseFloat(activePowerW) || 0,
                charger_total_kwh: parseFloat(chargerTotalKWh) || 0,
                charger_power_w: parseFloat(chargerPowerW) || 0
            });
        }
    }
    return records;
}

function parseP1MonthlyCSV(csvText) {
    const lines = csvText.trim().split('\n');
    const dailyTotals = {}; // dayNum -> { import_kwh, export_kwh, charger_kwh }

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line.startsWith('date') || line.startsWith('timestamp')) continue;

        const parts = line.split(',');
        if (parts.length >= 3) {
            const dateStr = parts[0].trim();
            const imp = parseFloat(parts[1]) || 0;
            const exp = parseFloat(parts[2]) || 0;
            const chg = parseFloat(parts[3]) || 0;

            const dayMatch = dateStr.match(/\d{4}-\d{2}-(\d{2})/);
            if (dayMatch) {
                const dayNum = parseInt(dayMatch[1], 10);
                dailyTotals[dayNum] = { import_kwh: imp, export_kwh: exp, charger_kwh: chg };
            }
        }
    }
    return dailyTotals;
}

async function fetchP1DailyData(date) {
    const dateStr = formatDateYYYYMMDD(date);
    const paths = [`/p1/p1-data-${dateStr}.csv`, `/p1/p1_data-${dateStr}.csv`];

    for (const path of paths) {
        try {
            const res = await fetch(path);
            if (res.ok) return parseP1DailyCSV(await res.text());
        } catch (e) {}
    }
    return [];
}

async function fetchP1MonthlyData(year, month) {
    const dateObj = new Date(year, month - 1, 1);
    const yyyymm = formatDateYYYYMM(dateObj);
    const paths = [
        `/p1/p1-data-${yyyymm}.csv`, 
        `/p1/p1_data-${yyyymm}.csv`, 
        `/p1/${year}/p1-data-${yyyymm}.csv`
    ];

    for (const path of paths) {
        try {
            const res = await fetch(path);
            if (res.ok) return parseP1MonthlyCSV(await res.text());
        } catch (e) {}
    }

    // Daily fallback loop removed to improve performance
    return {};
}