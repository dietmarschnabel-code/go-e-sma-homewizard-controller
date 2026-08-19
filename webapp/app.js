let currentView = 'daily'; // 'daily', 'monthly', 'yearly'
let chartInstance = null;

// Parse date input string "YYYY-MM-DD" safely without UTC timezone shifts
function parseLocalDate(dateString) {
    if (!dateString) return new Date();
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
}

// Populate Year Selector Dropdown
function initYearSelector() {
    const yearSelect = document.getElementById('year-select');
    const currentYear = new Date().getFullYear();
    yearSelect.innerHTML = '';
    
    for (let y = currentYear; y >= 2011; y--) {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        yearSelect.appendChild(opt);
    }
}

function switchView(viewMode) {
    currentView = viewMode;

    // Toggle button active states
    document.querySelectorAll('.toggle-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`btn-${viewMode}`).classList.add('active');

    // Toggle date pickers
    const dateSelect = document.getElementById('date-select');
    const monthSelect = document.getElementById('month-select');
    const yearSelect = document.getElementById('year-select');

    dateSelect.classList.add('hidden');
    monthSelect.classList.add('hidden');
    yearSelect.classList.add('hidden');

    if (viewMode === 'daily') dateSelect.classList.remove('hidden');
    if (viewMode === 'monthly') monthSelect.classList.remove('hidden');
    if (viewMode === 'yearly') yearSelect.classList.remove('hidden');

    updateDashboard();
}

async function updateDashboard() {
    if (currentView === 'daily') {
        await renderDailyView();
    } else if (currentView === 'monthly') {
        await renderMonthlyView();
    } else if (currentView === 'yearly') {
        await renderYearlyView();
    }
}

// --- DAILY VIEW ---
async function renderDailyView() {
    const datePicker = document.getElementById('date-select');
    const selectedDate = parseLocalDate(datePicker.value);
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth() + 1;
    const day = selectedDate.getDate();

    // Fetch daily interval data AND the monthly summary to get the exact daily PV total
    const [p1Data, pvData, pvMonthly] = await Promise.all([
        fetchP1DailyData(selectedDate),
        fetchPVDailyData(selectedDate),
        fetchPVMonthlyData(year, month)
    ]);

    // Update KPI Card Headers using i18n
    document.getElementById('kpi-pv-title').textContent = t('pvGenToday');
    document.getElementById('kpi-grid-title').textContent = t('gridActivePower');
    document.getElementById('kpi-import-title').textContent = t('importToday');
    document.getElementById('kpi-export-title').textContent = t('exportToday');

    // 1. PV Generation (Daily Total in kWh)
    const dailyPVTotal = pvMonthly[day] || 0;
    document.getElementById('pv-metric').textContent = `${dailyPVTotal.toFixed(1)} kWh`;

    // 2. Grid Active Power (Instantaneous)
    const latestP1 = p1Data.length > 0 ? p1Data[p1Data.length - 1] : null;
    const firstP1 = p1Data.length > 0 ? p1Data[0] : null;

    const gridPower = latestP1 ? latestP1.active_power_w : 0;
    const gridEl = document.getElementById('grid-metric');
    const statusEl = document.getElementById('grid-status');
    
    gridEl.textContent = `${Math.abs(gridPower)} W`;
    gridEl.style.color = gridPower > 0 ? 'var(--import-red)' : (gridPower < 0 ? 'var(--export-green)' : 'var(--text-main)');
    
    // Translated Grid Status
    statusEl.textContent = gridPower > 0 ? t('importingFromGrid') : (gridPower < 0 ? t('exportingToGrid') : t('balanced'));

    // 3. Import & Export (Daily Totals)
    const importToday = (latestP1 && firstP1) ? Math.max(0, latestP1.import_kwh - firstP1.import_kwh) : 0;
    const exportToday = (latestP1 && firstP1) ? Math.max(0, latestP1.export_kwh - firstP1.export_kwh) : 0;
    document.getElementById('import-metric').textContent = `${importToday.toFixed(1)} kWh`;
    document.getElementById('export-metric').textContent = `${exportToday.toFixed(1)} kWh`;

    // Render Line Chart
    const timeMap = new Map();
    pvData.forEach(d => timeMap.set(d.timeOnly, { pv: d.pv_power_w, grid: null }));
    p1Data.forEach(d => {
        const existing = timeMap.get(d.timeOnly) || { pv: null, grid: null };
        existing.grid = d.active_power_w;
        timeMap.set(d.timeOnly, existing);
    });

    const labels = Array.from(timeMap.keys()).sort();
    drawChart(labels, [
        { label: t('pvGenLabelW'), data: labels.map(t => timeMap.get(t).pv), borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.15)', type: 'line', fill: true, tension: 0.2 },
        { label: t('gridPowerLabelW'), data: labels.map(t => timeMap.get(t).grid), borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.15)', type: 'line', fill: false, tension: 0.2 }
    ], t('unitWatts'));
}

// --- MONTHLY VIEW ---
async function renderMonthlyView() {
    const monthPicker = document.getElementById('month-select');
    const [yearStr, monthStr] = monthPicker.value.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const daysInMonth = new Date(year, month, 0).getDate();

    const [pvMonthly, p1Monthly] = await Promise.all([
        fetchPVMonthlyData(year, month),
        fetchP1MonthlyData(year, month)
    ]);

    const labels = [];
    const pvSeries = [];
    const importSeries = [];
    const exportSeries = [];

    let totalPV = 0, totalImport = 0, totalExport = 0;

    for (let day = 1; day <= daysInMonth; day++) {
        labels.push(`${day}`);
        const pv = pvMonthly[day] || 0;
        const p1 = p1Monthly[day] || { import_kwh: 0, export_kwh: 0 };

        pvSeries.push(pv);
        importSeries.push(p1.import_kwh);
        exportSeries.push(p1.export_kwh);

        totalPV += pv;
        totalImport += p1.import_kwh;
        totalExport += p1.export_kwh;
    }

    // Update KPI Card Headers using i18n
    document.getElementById('kpi-pv-title').textContent = t('pvGenMonth');
    document.getElementById('kpi-grid-title').textContent = t('selfConsumptionRate');
    document.getElementById('kpi-import-title').textContent = t('importMonth');
    document.getElementById('kpi-export-title').textContent = t('exportMonth');

    document.getElementById('pv-metric').textContent = `${totalPV.toFixed(1)} kWh`;
    document.getElementById('import-metric').textContent = `${totalImport.toFixed(1)} kWh`;
    document.getElementById('export-metric').textContent = `${totalExport.toFixed(1)} kWh`;

    const selfConsumed = Math.max(0, totalPV - totalExport);
    const selfConsumedPct = totalPV > 0 ? ((selfConsumed / totalPV) * 100).toFixed(1) : '0.0';
    document.getElementById('grid-metric').textContent = `${selfConsumedPct} %`;
    document.getElementById('grid-metric').style.color = 'var(--text-main)';
    
    // Translated status string
    document.getElementById('grid-status').textContent = `${selfConsumed.toFixed(1)} ${t('usedLocally')}`;

    drawChart(labels, [
        { label: t('pvGenLabelKwh'), data: pvSeries, backgroundColor: '#f59e0b', type: 'bar' },
        { label: t('importLabelKwh'), data: importSeries, backgroundColor: '#ef4444', type: 'bar' },
        { label: t('exportLabelKwh'), data: exportSeries, backgroundColor: '#10b981', type: 'bar' }
    ], t('unitKwhPerDay'));
}

// --- YEARLY VIEW ---
async function renderYearlyView() {
    const year = parseInt(document.getElementById('year-select').value, 10);
    
    // Dynamically localized month abbreviations
    const langLocale = (typeof currentLang !== 'undefined' && currentLang === 'de') ? 'de-DE' : 'en-US';
    const monthNames = Array.from({ length: 12 }, (_, i) => 
        new Date(year, i, 1).toLocaleDateString(langLocale, { month: 'short' })
    );

    const monthlyPromises = [];
    for (let m = 1; m <= 12; m++) {
        monthlyPromises.push(Promise.all([fetchPVMonthlyData(year, m), fetchP1MonthlyData(year, m)]));
    }

    const monthlyResults = await Promise.all(monthlyPromises);

    const pvSeries = [];
    const importSeries = [];
    const exportSeries = [];

    let totalPV = 0, totalImport = 0, totalExport = 0;

    monthlyResults.forEach(([pvMonth, p1Month]) => {
        let mPV = 0, mImport = 0, mExport = 0;

        Object.values(pvMonth).forEach(val => mPV += val);
        Object.values(p1Month).forEach(val => {
            mImport += val.import_kwh;
            mExport += val.export_kwh;
        });

        pvSeries.push(mPV);
        importSeries.push(mImport);
        exportSeries.push(mExport);

        totalPV += mPV;
        totalImport += mImport;
        totalExport += mExport;
    });

    // Update KPI Card Headers using i18n
    document.getElementById('kpi-pv-title').textContent = t('pvGenYear');
    document.getElementById('kpi-grid-title').textContent = t('selfConsumptionRate');
    document.getElementById('kpi-import-title').textContent = t('importYear');
    document.getElementById('kpi-export-title').textContent = t('exportYear');

    document.getElementById('pv-metric').textContent = `${totalPV.toFixed(0)} kWh`;
    document.getElementById('import-metric').textContent = `${totalImport.toFixed(0)} kWh`;
    document.getElementById('export-metric').textContent = `${totalExport.toFixed(0)} kWh`;

    const selfConsumed = Math.max(0, totalPV - totalExport);
    const selfConsumedPct = totalPV > 0 ? ((selfConsumed / totalPV) * 100).toFixed(1) : '0.0';
    document.getElementById('grid-metric').textContent = `${selfConsumedPct} %`;
    document.getElementById('grid-metric').style.color = 'var(--text-main)';
    
    // Translated status string
    document.getElementById('grid-status').textContent = `${selfConsumed.toFixed(0)} ${t('usedLocally')}`;

    drawChart(monthNames, [
        { label: t('pvGenLabelKwh'), data: pvSeries, backgroundColor: '#f59e0b', type: 'bar' },
        { label: t('importLabelKwh'), data: importSeries, backgroundColor: '#ef4444', type: 'bar' },
        { label: t('exportLabelKwh'), data: exportSeries, backgroundColor: '#10b981', type: 'bar' }
    ], t('unitKwhPerMonth'));
}

// Chart Rendering Engine with Dark Theme Integration
function drawChart(labels, datasets, yAxisTitle) {
    const ctx = document.getElementById('energyChart').getContext('2d');

    if (chartInstance) chartInstance.destroy();

    chartInstance = new Chart(ctx, {
        type: datasets[0].type || 'line',
        data: { labels: labels, datasets: datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: { 
                    grid: { color: 'rgba(255, 255, 255, 0.05)', drawBorder: false }, 
                    ticks: { color: '#8e9bb0', font: { family: 'Century Gothic', size: 12 } } 
                },
                y: { 
                    grid: { color: 'rgba(255, 255, 255, 0.05)', drawBorder: false }, 
                    ticks: { color: '#8e9bb0', font: { family: 'Century Gothic', size: 12 } },
                    title: { display: true, text: yAxisTitle, color: '#8e9bb0', font: { size: 12, weight: 'bold' } } 
                }
            },
            plugins: { 
                legend: { 
                    labels: { color: '#f8fafc', font: { family: 'Century Gothic', size: 13 }, usePointStyle: true, padding: 20 } 
                },
                tooltip: {
                    backgroundColor: '#0f172a',
                    titleColor: '#f8fafc',
                    bodyColor: '#cbd5e1',
                    borderColor: '#26334d',
                    borderWidth: 1,
                    padding: 12,
                    boxPadding: 6,
                    usePointStyle: true,
                    cornerRadius: 8
                }
            }
        }
    });
}

// Initialization & Event Binding
document.addEventListener('DOMContentLoaded', () => {
    initYearSelector();

    const datePicker = document.getElementById('date-select');
    const monthPicker = document.getElementById('month-select');
    const yearPicker = document.getElementById('year-select');

    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');

    datePicker.value = `${yyyy}-${mm}-${dd}`;
    monthPicker.value = `${yyyy}-${mm}`;
    yearPicker.value = yyyy;

    datePicker.addEventListener('change', updateDashboard);
    monthPicker.addEventListener('change', updateDashboard);
    yearPicker.addEventListener('change', updateDashboard);

    updateDashboard();

    // Auto-refresh daily view every 5 minutes
    setInterval(() => { 
        if (currentView === 'daily') updateDashboard(); 
    }, 5 * 60 * 1000);
});