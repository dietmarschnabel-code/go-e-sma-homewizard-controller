/* ==========================================================================
   Solar Energy Dashboard - Main Application Logic (app.js)
   ========================================================================== */

let currentView = 'daily'; // 'daily', 'monthly', 'yearly', 'total'
let chartInstance = null;
let statusClockInterval = null;

// Target Start Date of PV System (Year, Month - 1, Day) -> Sept 27, 2011
const SYSTEM_START_DATE = new Date(2011, 8, 27); 

// Helper for i18n fallback if translation function is not present
function translate(key) {
    return (typeof t === 'function') ? t(key) : key;
}

// Parse date input string "YYYY-MM-DD" safely without UTC timezone shifts
function parseLocalDate(dateString) {
    if (!dateString) return new Date();
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
}

// Populate Year Selector Dropdown
function initYearSelector() {
    const yearSelect = document.getElementById('year-select');
    if (!yearSelect) return;
    
    const currentYear = new Date().getFullYear();
    yearSelect.innerHTML = '';
    
    for (let y = currentYear; y >= 2011; y--) {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        yearSelect.appendChild(opt);
    }
}

// --- THEME MANAGEMENT ---
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    setTheme(savedTheme, false);
}

function setTheme(theme, redraw = true) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);

    const darkBtn = document.getElementById('theme-btn-dark');
    const lightBtn = document.getElementById('theme-btn-light');

    if (darkBtn && lightBtn) {
        darkBtn.classList.toggle('active', theme === 'dark');
        lightBtn.classList.toggle('active', theme === 'light');
    }

    if (redraw) {
        updateDashboard();
    }
}

function switchView(viewMode) {
    currentView = viewMode;

    document.querySelectorAll('.view-toggle .toggle-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`btn-${viewMode}`);
    if (activeBtn) activeBtn.classList.add('active');

    const dateSelect = document.getElementById('date-select');
    const monthSelect = document.getElementById('month-select');
    const yearSelect = document.getElementById('year-select');
    const dateNavContainer = document.querySelector('.date-picker-container');

    if (dateSelect) dateSelect.classList.add('hidden');
    if (monthSelect) monthSelect.classList.add('hidden');
    if (yearSelect) yearSelect.classList.add('hidden');

    if (dateNavContainer) {
        if (viewMode === 'total') {
            dateNavContainer.classList.add('hidden');
        } else {
            dateNavContainer.classList.remove('hidden');
        }
    }

    if (viewMode === 'daily' && dateSelect) dateSelect.classList.remove('hidden');
    if (viewMode === 'monthly' && monthSelect) monthSelect.classList.remove('hidden');
    if (viewMode === 'yearly' && yearSelect) yearSelect.classList.remove('hidden');

    updateDashboard();
}

// --- DATE NAVIGATION LOGIC ---
function navigateDate(direction) {
    if (currentView === 'daily') {
        const datePicker = document.getElementById('date-select');
        const currentDate = parseLocalDate(datePicker.value);
        currentDate.setDate(currentDate.getDate() + direction);
        
        const yyyy = currentDate.getFullYear();
        const mm = String(currentDate.getMonth() + 1).padStart(2, '0');
        const dd = String(currentDate.getDate()).padStart(2, '0');
        datePicker.value = `${yyyy}-${mm}-${dd}`;
    } else if (currentView === 'monthly') {
        const monthPicker = document.getElementById('month-select');
        const [yearStr, monthStr] = monthPicker.value.split('-');
        let year = parseInt(yearStr, 10);
        let month = parseInt(monthStr, 10) - 1 + direction;

        const targetDate = new Date(year, month, 1);
        const yyyy = targetDate.getFullYear();
        const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
        monthPicker.value = `${yyyy}-${mm}`;
    } else if (currentView === 'yearly') {
        const yearPicker = document.getElementById('year-select');
        const currentYear = parseInt(yearPicker.value, 10);
        const targetYear = currentYear + direction;
        
        const optionExists = Array.from(yearPicker.options).some(opt => parseInt(opt.value, 10) === targetYear);
        if (optionExists) {
            yearPicker.value = targetYear;
        }
    }

    updateDashboard();
}

async function updateDashboard() {
    if (currentView === 'daily') {
        await renderDailyView();
    } else if (currentView === 'monthly') {
        await renderMonthlyView();
    } else if (currentView === 'yearly') {
        await renderYearlyView();
    } else if (currentView === 'total') {
        await renderTotalView();
    }
}

// --- DAILY VIEW ---
async function renderDailyView() {
    const datePicker = document.getElementById('date-select');
    const selectedDate = parseLocalDate(datePicker.value);
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth() + 1;
    const day = selectedDate.getDate();

    const [p1Data, pvData, pvMonthly] = await Promise.all([
        fetchP1DailyData(selectedDate),
        fetchPVDailyData(selectedDate),
        fetchPVMonthlyData(year, month)
    ]);

    document.getElementById('kpi-pv-title').textContent = translate('pvGenToday');
    document.getElementById('kpi-grid-title').textContent = translate('gridActivePower');
    document.getElementById('kpi-import-title').textContent = translate('importToday');
    document.getElementById('kpi-export-title').textContent = translate('exportToday');
    document.getElementById('kpi-charger-title').textContent = translate('chargerToday');

    const dailyPVTotal = pvMonthly[day] || 0;
    document.getElementById('pv-metric').textContent = `${dailyPVTotal.toFixed(1)} kWh`;

    const latestP1 = p1Data.length > 0 ? p1Data[p1Data.length - 1] : null;
    const firstP1 = p1Data.length > 0 ? p1Data[0] : null;

    const gridPower = latestP1 ? latestP1.active_power_w : 0;
    const gridEl = document.getElementById('grid-metric');
    const statusEl = document.getElementById('grid-status');
    
    gridEl.textContent = `${Math.abs(gridPower)} W`;
    gridEl.style.color = gridPower > 0 ? 'var(--import-red)' : (gridPower < 0 ? 'var(--export-green)' : 'var(--text-main)');
    
    statusEl.textContent = gridPower > 0 ? translate('importingFromGrid') : (gridPower < 0 ? translate('exportingToGrid') : translate('balanced'));

    const importToday = (latestP1 && firstP1) ? Math.max(0, latestP1.import_kwh - firstP1.import_kwh) : 0;
    const exportToday = (latestP1 && firstP1) ? Math.max(0, latestP1.export_kwh - firstP1.export_kwh) : 0;
    const chargerToday = (latestP1 && firstP1) ? Math.max(0, (latestP1.charger_total_kwh || 0) - (firstP1.charger_total_kwh || 0)) : 0;

    document.getElementById('import-metric').textContent = `${importToday.toFixed(1)} kWh`;
    document.getElementById('export-metric').textContent = `${exportToday.toFixed(1)} kWh`;
    document.getElementById('charger-metric').textContent = `${chargerToday.toFixed(1)} kWh`;

    const timeMap = new Map();
    
    pvData.forEach(d => {
        const timeKey = typeof roundTo5Minutes === 'function' ? roundTo5Minutes(d.timeOnly) : d.timeOnly;
        const existing = timeMap.get(timeKey) || { pv: null, grid: null, charger: null, gridSum: 0, chargerSum: 0, count: 0 };
        existing.pv = d.pv_power_w;
        timeMap.set(timeKey, existing);
    });

    p1Data.forEach(d => {
        const timeKey = typeof roundTo5Minutes === 'function' ? roundTo5Minutes(d.timeOnly) : d.timeOnly;
        const existing = timeMap.get(timeKey) || { pv: null, grid: null, charger: null, gridSum: 0, chargerSum: 0, count: 0 };
        
        existing.gridSum = (existing.gridSum || 0) + d.active_power_w;
        existing.chargerSum = (existing.chargerSum || 0) + (d.charger_power_w || 0);
        existing.count = (existing.count || 0) + 1;
        existing.grid = Math.round(existing.gridSum / existing.count);
        existing.charger = Math.round(existing.chargerSum / existing.count);

        timeMap.set(timeKey, existing);
    });

    const labels = Array.from(timeMap.keys()).sort();
    
    drawChart(labels, [
        { 
            label: translate('pvGenLabelW'), 
            data: labels.map(t => {
                const val = timeMap.get(t).pv;
                return (val && val > 0) ? val : null;
            }), 
            backgroundColor: 'rgba(245, 158, 11, 0.45)', 
            hoverBackgroundColor: '#f59e0b',
            type: 'bar',
            barPercentage: 1.0,
            categoryPercentage: 1.0
        },
        { 
            label: translate('gridPowerLabelW'), 
            data: labels.map(t => timeMap.get(t).grid), 
            borderColor: '#ef4444', 
            borderWidth: 1.5,
            pointRadius: 0,
            pointHoverRadius: 4,
            type: 'line', 
            fill: false, 
            tension: 0.15 
        },
        { 
            label: translate('chargerPowerLabelW'), 
            data: labels.map(t => timeMap.get(t).charger), 
            borderColor: '#3b82f6', 
            borderWidth: 1.5,
            pointRadius: 0,
            pointHoverRadius: 4,
            type: 'line', 
            fill: false, 
            tension: 0.15 
        }
    ], translate('unitWatts'));
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
    const chargerSeries = [];

    let totalPV = 0, totalImport = 0, totalExport = 0, totalCharger = 0;

    for (let day = 1; day <= daysInMonth; day++) {
        labels.push(`${day}`);
        const pv = pvMonthly[day] || 0;
        const p1 = p1Monthly[day] || { import_kwh: 0, export_kwh: 0, charger_kwh: 0 };

        pvSeries.push(pv);
        importSeries.push(p1.import_kwh);
        exportSeries.push(p1.export_kwh);
        chargerSeries.push(p1.charger_kwh);

        totalPV += pv;
        totalImport += p1.import_kwh;
        totalExport += p1.export_kwh;
        totalCharger += p1.charger_kwh;
    }

    document.getElementById('kpi-pv-title').textContent = translate('pvGenMonth');
    document.getElementById('kpi-grid-title').textContent = translate('selfConsumptionRate');
    document.getElementById('kpi-import-title').textContent = translate('importMonth');
    document.getElementById('kpi-export-title').textContent = translate('exportMonth');
    document.getElementById('kpi-charger-title').textContent = translate('chargerMonth');

    document.getElementById('pv-metric').textContent = `${totalPV.toFixed(1)} kWh`;
    document.getElementById('import-metric').textContent = `${totalImport.toFixed(1)} kWh`;
    document.getElementById('export-metric').textContent = `${totalExport.toFixed(1)} kWh`;
    document.getElementById('charger-metric').textContent = `${totalCharger.toFixed(1)} kWh`;

    const selfConsumed = Math.max(0, totalPV - totalExport);
    const selfConsumedPct = totalPV > 0 ? ((selfConsumed / totalPV) * 100).toFixed(1) : '0.0';
    document.getElementById('grid-metric').textContent = `${selfConsumedPct} %`;
    document.getElementById('grid-metric').style.color = 'var(--text-main)';
    
    document.getElementById('grid-status').textContent = `${selfConsumed.toFixed(1)} ${translate('usedLocally')}`;

    drawChart(labels, [
        { label: translate('pvGenLabelKwh'), data: pvSeries, backgroundColor: '#f59e0b', type: 'bar' },
        { label: translate('importLabelKwh'), data: importSeries, backgroundColor: '#ef4444', type: 'bar' },
        { label: translate('exportLabelKwh'), data: exportSeries, backgroundColor: '#10b981', type: 'bar' },
        { label: translate('chargerLabelKwh'), data: chargerSeries, backgroundColor: '#3b82f6', type: 'bar' }
    ], translate('unitKwhPerDay'));
}

// --- YEARLY VIEW ---
async function renderYearlyView() {
    const year = parseInt(document.getElementById('year-select').value, 10);
    
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
    const chargerSeries = [];

    let totalPV = 0, totalImport = 0, totalExport = 0, totalCharger = 0;

    monthlyResults.forEach(([pvMonth, p1Month]) => {
        let mPV = 0, mImport = 0, mExport = 0, mCharger = 0;

        Object.values(pvMonth).forEach(val => mPV += val);
        Object.values(p1Month).forEach(val => {
            mImport += val.import_kwh;
            mExport += val.export_kwh;
            mCharger += (val.charger_kwh || 0);
        });

        pvSeries.push(mPV);
        importSeries.push(mImport);
        exportSeries.push(mExport);
        chargerSeries.push(mCharger);

        totalPV += mPV;
        totalImport += mImport;
        totalExport += mExport;
        totalCharger += mCharger;
    });

    document.getElementById('kpi-pv-title').textContent = translate('pvGenYear');
    document.getElementById('kpi-grid-title').textContent = translate('selfConsumptionRate');
    document.getElementById('kpi-import-title').textContent = translate('importYear');
    document.getElementById('kpi-export-title').textContent = translate('exportYear');
    document.getElementById('kpi-charger-title').textContent = translate('chargerYear');

    document.getElementById('pv-metric').textContent = `${totalPV.toFixed(0)} kWh`;
    document.getElementById('import-metric').textContent = `${totalImport.toFixed(0)} kWh`;
    document.getElementById('export-metric').textContent = `${totalExport.toFixed(0)} kWh`;
    document.getElementById('charger-metric').textContent = `${totalCharger.toFixed(0)} kWh`;

    const selfConsumed = Math.max(0, totalPV - totalExport);
    const selfConsumedPct = totalPV > 0 ? ((selfConsumed / totalPV) * 100).toFixed(1) : '0.0';
    document.getElementById('grid-metric').textContent = `${selfConsumedPct} %`;
    document.getElementById('grid-metric').style.color = 'var(--text-main)';
    
    document.getElementById('grid-status').textContent = `${selfConsumed.toFixed(0)} ${translate('usedLocally')}`;

    drawChart(monthNames, [
        { label: translate('pvGenLabelKwh'), data: pvSeries, backgroundColor: '#f59e0b', type: 'bar' },
        { label: translate('importLabelKwh'), data: importSeries, backgroundColor: '#ef4444', type: 'bar' },
        { label: translate('exportLabelKwh'), data: exportSeries, backgroundColor: '#10b981', type: 'bar' },
        { label: translate('chargerLabelKwh'), data: chargerSeries, backgroundColor: '#3b82f6', type: 'bar' }
    ], translate('unitKwhPerMonth'));
}

// --- OPTIMIZED TOTAL VIEW WITH LOCAL STORAGE CACHING ---
async function renderTotalView() {
    const currentYear = new Date().getFullYear();
    const startYear = SYSTEM_START_DATE.getFullYear();
    const years = [];
    
    for (let y = startYear; y <= currentYear; y++) {
        years.push(y);
    }

    // Retrieve cached totals for historical years
    const cachedTotals = JSON.parse(localStorage.getItem('solar_annual_totals') || '{}');

    const pvSeries = [];
    const importSeries = [];
    const exportSeries = [];
    const chargerSeries = [];

    let totalPV = 0, totalImport = 0, totalExport = 0, totalCharger = 0;

    // Process each year sequentially or via cached lookup
    for (const year of years) {
        let yPV = 0, yImport = 0, yExport = 0, yCharger = 0;

        // Use cache for past years, always fetch live for the current year
        if (year < currentYear && cachedTotals[year]) {
            yPV = cachedTotals[year].pv;
            yImport = cachedTotals[year].import;
            yExport = cachedTotals[year].export;
            yCharger = cachedTotals[year].charger;
        } else {
            // Fetch 12 months for this year
            const monthlyPromises = [];
            for (let m = 1; m <= 12; m++) {
                monthlyPromises.push(Promise.all([
                    fetchPVMonthlyData(year, m), 
                    fetchP1MonthlyData(year, m)
                ]));
            }

            const monthlyResults = await Promise.all(monthlyPromises);

            monthlyResults.forEach(([pvMonth, p1Month]) => {
                Object.values(pvMonth).forEach(val => yPV += val);
                Object.values(p1Month).forEach(val => {
                    yImport += val.import_kwh;
                    yExport += val.export_kwh;
                    yCharger += (val.charger_kwh || 0);
                });
            });

            // Cache closed historical years permanently
            if (year < currentYear) {
                cachedTotals[year] = { pv: yPV, import: yImport, export: yExport, charger: yCharger };
                localStorage.setItem('solar_annual_totals', JSON.stringify(cachedTotals));
            }
        }

        pvSeries.push(yPV);
        importSeries.push(yImport);
        exportSeries.push(yExport);
        chargerSeries.push(yCharger);

        totalPV += yPV;
        totalImport += yImport;
        totalExport += yExport;
        totalCharger += yCharger;
    }

    // Update UI Elements
    document.getElementById('kpi-pv-title').textContent = translate('pvGenTotal');
    document.getElementById('kpi-grid-title').textContent = translate('selfConsumptionRate');
    document.getElementById('kpi-import-title').textContent = translate('importTotal');
    document.getElementById('kpi-export-title').textContent = translate('exportTotal');
    document.getElementById('kpi-charger-title').textContent = translate('chargerTotal');

    document.getElementById('pv-metric').textContent = `${(totalPV / 1000).toFixed(1)} MWh`;
    document.getElementById('import-metric').textContent = `${(totalImport / 1000).toFixed(1)} MWh`;
    document.getElementById('export-metric').textContent = `${(totalExport / 1000).toFixed(1)} MWh`;
    document.getElementById('charger-metric').textContent = `${(totalCharger / 1000).toFixed(1)} MWh`;

    const selfConsumed = Math.max(0, totalPV - totalExport);
    const selfConsumedPct = totalPV > 0 ? ((selfConsumed / totalPV) * 100).toFixed(1) : '0.0';
    document.getElementById('grid-metric').textContent = `${selfConsumedPct} %`;
    document.getElementById('grid-metric').style.color = 'var(--text-main)';
    
    document.getElementById('grid-status').textContent = `${(selfConsumed / 1000).toFixed(1)} MWh ${translate('usedLocally')}`;

    drawChart(years.map(String), [
        { label: translate('pvGenLabelKwh'), data: pvSeries, backgroundColor: '#f59e0b', type: 'bar' },
        { label: translate('importLabelKwh'), data: importSeries, backgroundColor: '#ef4444', type: 'bar' },
        { label: translate('exportLabelKwh'), data: exportSeries, backgroundColor: '#10b981', type: 'bar' },
        { label: translate('chargerLabelKwh'), data: chargerSeries, backgroundColor: '#3b82f6', type: 'bar' }
    ], translate('unitKwhPerYear'));
}

// Chart Rendering Engine with Dynamic Theme Integration
function drawChart(labels, datasets, yAxisTitle) {
    const canvas = document.getElementById('energyChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (chartInstance) chartInstance.destroy();

    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const style = getComputedStyle(document.documentElement);

    const textColor = style.getPropertyValue('--chart-text').trim() || (isLight ? '#475569' : '#8e9bb0');
    const mainTextColor = style.getPropertyValue('--text-main').trim() || (isLight ? '#0f172a' : '#f8fafc');
    const gridColor = style.getPropertyValue('--chart-grid').trim() || (isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.05)');
    const tooltipBg = style.getPropertyValue('--chart-tooltip-bg').trim() || (isLight ? '#ffffff' : '#0f172a');
    const tooltipBorder = style.getPropertyValue('--border-color').trim() || (isLight ? '#cbd5e1' : '#26334d');

    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: { labels: labels, datasets: datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: { 
                    grid: { color: gridColor, drawBorder: false }, 
                    ticks: { color: textColor, font: { family: 'Century Gothic', size: 12 }, maxRotation: 0 } 
                },
                y: { 
                    grid: { color: gridColor, drawBorder: false }, 
                    ticks: { color: textColor, font: { family: 'Century Gothic', size: 12 } },
                    title: { display: true, text: yAxisTitle, color: textColor, font: { size: 12, weight: 'bold' } } 
                }
            },
            plugins: { 
                legend: { 
                    labels: { color: mainTextColor, font: { family: 'Century Gothic', size: 13 }, usePointStyle: true, padding: 20 } 
                },
                tooltip: {
                    backgroundColor: tooltipBg,
                    titleColor: mainTextColor,
                    bodyColor: textColor,
                    borderColor: tooltipBorder,
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

function toggleChartFullscreen() {
    const chartSec = document.getElementById('chart-section');
    if (!chartSec) return;

    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        if (chartSec.requestFullscreen) {
            chartSec.requestFullscreen();
        } else if (chartSec.webkitRequestFullscreen) {
            chartSec.webkitRequestFullscreen();
        } else {
            chartSec.classList.add('is-fullscreen');
        }
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        }
        chartSec.classList.remove('is-fullscreen');
    }
}

// --- STATUS MODAL LOGIC ---
async function toggleStatusModal() {
    const modal = document.getElementById('status-modal');
    if (!modal) return;
    
    modal.classList.toggle('hidden');
    
    if (!modal.classList.contains('hidden')) {
        await updateSystemStatusData();
    }
}

function startStatusClock() {
    const clockEl = document.getElementById('status-clock');
    if (!clockEl) return;
    
    const updateTime = () => {
        const now = new Date();
        clockEl.textContent = now.toLocaleTimeString();
    };
    updateTime();
    
    if (statusClockInterval) clearInterval(statusClockInterval);
    statusClockInterval = setInterval(updateTime, 1000);
}

async function updateSystemStatusData() {
    const now = new Date();
    
    const diffTime = Math.abs(now - SYSTEM_START_DATE);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    const daysEl = document.getElementById('status-days');
    if (daysEl) {
        daysEl.textContent = `${diffDays.toLocaleString()} ${translate('daysUnit')}`;
    }

    const [p1Data, pvData] = await Promise.all([
        fetchP1DailyData(now),
        fetchPVDailyData(now)
    ]);

    const latestP1 = p1Data.length > 0 ? p1Data[p1Data.length - 1] : null;
    const latestPV = pvData.length > 0 ? pvData[pvData.length - 1] : null;

    const grandTotalImport = latestP1 ? latestP1.import_kwh : 0;
    const grandTotalExport = latestP1 ? latestP1.export_kwh : 0;
    const grandTotalPV = latestPV ? (latestPV.pv_total_kwh || latestPV.total_kwh || 0) : 0;
    const grandTotalCharger = latestP1 ? (latestP1.charger_total_kwh || 0) : 0;

    const statusPvEl = document.getElementById('status-pv-total');
    const statusImpEl = document.getElementById('status-import-total');
    const statusExpEl = document.getElementById('status-export-total');
    const statusChargerEl = document.getElementById('status-charger-total');

    if (statusPvEl) statusPvEl.textContent = `${Math.round(grandTotalPV).toLocaleString()} kWh`;
    if (statusImpEl) statusImpEl.textContent = `${Math.round(grandTotalImport).toLocaleString()} kWh`;
    if (statusExpEl) statusExpEl.textContent = `${Math.round(grandTotalExport).toLocaleString()} kWh`;
    if (statusChargerEl) statusChargerEl.textContent = `${Math.round(grandTotalCharger).toLocaleString()} kWh`;
}

// Initialization & Event Binding
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initYearSelector();
    startStatusClock();

    const datePicker = document.getElementById('date-select');
    const monthPicker = document.getElementById('month-select');
    const yearPicker = document.getElementById('year-select');

    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');

    if (datePicker) datePicker.value = `${yyyy}-${mm}-${dd}`;
    if (monthPicker) monthPicker.value = `${yyyy}-${mm}`;
    if (yearPicker) yearPicker.value = yyyy;

    if (datePicker) datePicker.addEventListener('change', updateDashboard);
    if (monthPicker) monthPicker.addEventListener('change', updateDashboard);
    if (yearPicker) yearPicker.addEventListener('change', updateDashboard);

    updateDashboard();

    setInterval(() => { 
        if (currentView === 'daily') updateDashboard(); 
    }, 5 * 60 * 1000);
});

// Keyboard Navigation Support
document.addEventListener('keydown', (e) => {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

    if (e.key === 'ArrowLeft') {
        navigateDate(-1);
    } else if (e.key === 'ArrowRight') {
        navigateDate(1);
    }
});
