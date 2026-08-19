/**
 * Handles HomeWizard P1 CSV Data Parsing for Daily, Monthly, and Yearly Views
 */

function parseP1DailyCSV(csvText) {
    const lines = csvText.trim().split('\n');
    if (lines.length <= 1) return [];

    const records = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line.startsWith('timestamp')) continue;

        const [timestamp, importKWh, exportKWh, activePowerW] = line.split(',');

        if (timestamp) {
            const timeOnly = timestamp.split(' ')[1] ? timestamp.split(' ')[1].substring(0, 5) : timestamp;
            records.push({
                timestamp: timestamp,
                timeOnly: timeOnly,
                import_kwh: parseFloat(importKWh) || 0,
                export_kwh: parseFloat(exportKWh) || 0,
                active_power_w: parseFloat(activePowerW) || 0
            });
        }
    }
    return records;
}

function parseP1MonthlyCSV(csvText) {
    const lines = csvText.trim().split('\n');
    const dailyTotals = {}; // dayNum -> { import_kwh, export_kwh }

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line.startsWith('date') || line.startsWith('timestamp')) continue;

        const parts = line.split(',');
        if (parts.length >= 3) {
            const dateStr = parts[0].trim();
            const imp = parseFloat(parts[1]) || 0;
            const exp = parseFloat(parts[2]) || 0;

            const dayMatch = dateStr.match(/\d{4}-\d{2}-(\d{2})/);
            if (dayMatch) {
                const dayNum = parseInt(dayMatch[1], 10);
                dailyTotals[dayNum] = { import_kwh: imp, export_kwh: exp };
            }
        }
    }
    return dailyTotals;
}

async function fetchP1DailyData(date) {
    const dateStr = formatDateYYYYMMDD(date);
    const paths = [`/p1/p1_data-${dateStr}.csv`, `/p1/p1-data-${dateStr}.csv`];

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
    const paths = [`/p1/p1_data-${yyyymm}.csv`, `/p1/p1-data-${yyyymm}.csv`, `/p1/${year}/p1-data-${yyyymm}.csv`];

    for (const path of paths) {
        try {
            const res = await fetch(path);
            if (res.ok) return parseP1MonthlyCSV(await res.text());
        } catch (e) {}
    }

    // Fallback: Aggregate daily P1 files for the month
    const daysInMonth = new Date(year, month, 0).getDate();
    const result = {};
    const promises = [];

    for (let day = 1; day <= daysInMonth; day++) {
        const d = new Date(year, month - 1, day);
        promises.push(
            fetchP1DailyData(d).then(readings => {
                if (readings.length > 0) {
                    const first = readings[0];
                    const last = readings[readings.length - 1];
                    result[day] = {
                        import_kwh: Math.max(0, last.import_kwh - first.import_kwh),
                        export_kwh: Math.max(0, last.export_kwh - first.export_kwh)
                    };
                }
            })
        );
    }

    await Promise.all(promises);
    return result;
}