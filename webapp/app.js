/**
 * Solar Energy Dashboard - Main Application Script (app.js)
 */

const SYSTEM_START_DATE = new Date('2011-09-27T00:00:00');

// State Management
const state = {
    currentView: 'daily', // 'daily', 'monthly', 'yearly', 'status'
    selectedDate: new Date(),
    theme: localStorage.getItem('theme') || 'dark',
    lang: localStorage.getItem('lang') || 'de'
};

// Language Dictionary
const i18n = {
    de: {
        pvTotal: 'PV Erzeugung',
        gridImport: 'Netzbezug',
        gridExport: 'Einspeisung',
        chargerTotal: 'Wallbox',
        daysUnit: 'Tage',
        dailyView: 'Tagesansicht',
        monthlyView: 'Monatsansicht',
        yearlyView: 'Jahresansicht',
        statusView: 'Systemstatus',
        noData: 'Keine Daten verfügbar'
    },
    en: {
        pvTotal: 'PV Generation',
        gridImport: 'Grid Import',
        gridExport: 'Grid Export',
        chargerTotal: 'EV Charger',
        daysUnit: 'days',
        dailyView: 'Daily View',
        monthlyView: 'Monthly View',
        yearlyView: 'Yearly View',
        statusView: 'System Status',
        noData: 'No data available'
    }
};

function translate(key) {
    return (i18n[state.lang] && i18n[state.lang][key]) || (i18n.en[key] || key);
}

/**
 * Returns single LED color class based on age in minutes and customizable thresholds.
 * @param {number} ageMins - Record age in minutes relative to system time.
 * @param {number} yellowThreshold - Age in minutes before switching to yellow (default 6).
 * @param {number} redThreshold - Age in minutes before switching to red (default 11).
 */
function getSingleLedStatus(ageMins, yellowThreshold = 6, redThreshold = 11) {
    if (ageMins > redThreshold) return 'led-red';
    if (ageMins > yellowThreshold) return 'led-yellow';
    return 'led-green';
}

/**
 * Calculates age in minutes between latest data timestamp and reference system time.
 * @param {Array} dataArray - Dataset containing log items.
 * @param {Date} referenceTime - System reference time.
 */
function getMinutesSinceLastRecord(dataArray, referenceTime = new Date()) {
    if (!dataArray || dataArray.length === 0) return Infinity;
    const lastRecord = dataArray[dataArray.length - 1];
    if (!lastRecord || (!lastRecord.timestamp && !lastRecord.timeOnly)) return Infinity;

    let recordDate;
    if (lastRecord.timestamp) {
        recordDate = new Date(lastRecord.timestamp);
    } else {
        const [hours, minutes] = lastRecord.timeOnly.split(':').map(Number);
        recordDate = new Date(referenceTime);
        recordDate.setHours(hours, minutes, 0, 0);
    }

    const diffMs = referenceTime.getTime() - recordDate.getTime();
    return Math.max(0, Math.floor(diffMs / (1000 * 60)));
}

// Data API Services
async function fetchP1DailyData(date) {
    try {
        const dateStr = date.toISOString().split('T')[0];
        const res = await fetch(`/api/p1/daily?date=${dateStr}`);
        if (!res.ok) throw new Error('Failed to fetch P1 data');
        return await res.json();
    } catch (err) {
        console.error('Error fetching P1 daily data:', err);
        return [];
    }
}

async function fetchPVDailyData(date) {
    try {
        const dateStr = date.toISOString().split('T')[0];
        const res = await fetch(`/api/pv/daily?date=${dateStr}`);
        if (!res.ok) throw new Error('Failed to fetch PV data');
        return await res.json();
    } catch (err) {
        console.error('Error fetching PV daily data:', err);
        return [];
    }
}

// System Status and LED Logic Update
async function updateSystemStatusData() {
    let serverTime = null;

    const [p1Data, pvData] = await Promise.all([
        fetchP1DailyData(new Date()),
        fetchPVDailyData(new Date())
    ]);

    // Retrieve system server time via HEAD request with a strict 2-second timeout guard
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        
        const response = await fetch(window.location.href, { 
            method: 'HEAD',
            cache: 'no-store',
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        const serverDateHeader = response.headers.get('date');
        if (serverDateHeader) {
            serverTime = new Date(serverDateHeader);
        }
    } catch (e) {
        console.warn('Server time fetch bypassed or timed out, using local clock', e);
        serverTime = new Date();
    }

    // 1. Photovoltaic Line (Generous thresholds: Yellow > 31m, Red > 46m)
    const latestPV = pvData.length > 0 ? pvData[pvData.length - 1] : null;
    const pvTimeEl = document.getElementById('pv-status-time');
    const pvLedEl = document.getElementById('pv-status-led');

    if (latestPV && (latestPV.timeOnly || latestPV.timestamp)) {
        if (pvTimeEl) {
            pvTimeEl.textContent = latestPV.timeOnly || new Date(latestPV.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        const pvAge = getMinutesSinceLastRecord(pvData, serverTime);
        if (pvLedEl) pvLedEl.className = `status-led ${getSingleLedStatus(pvAge, 31, 46)}`;
    } else {
        if (pvTimeEl) pvTimeEl.textContent = '--:--';
        if (pvLedEl) pvLedEl.className = 'status-led led-red';
    }

    // 2. Smart Meter (P1) Line (Standard thresholds: Yellow > 6m, Red > 11m)
    const latestP1 = p1Data.length > 0 ? p1Data[p1Data.length - 1] : null;
    const p1TimeEl = document.getElementById('p1-status-time');
    const p1LedEl = document.getElementById('p1-status-led');

    if (latestP1 && (latestP1.timeOnly || latestP1.timestamp)) {
        if (p1TimeEl) {
            p1TimeEl.textContent = latestP1.timeOnly || new Date(latestP1.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        const p1Age = getMinutesSinceLastRecord(p1Data, serverTime);
        if (p1LedEl) p1LedEl.className = `status-led ${getSingleLedStatus(p1Age, 6, 11)}`;
    } else {
        if (p1TimeEl) p1TimeEl.textContent = '--:--';
        if (p1LedEl) p1LedEl.className = 'status-led led-red';
    }

    // 3. Totals & System Days Counter
    const now = serverTime || new Date();
    const diffTime = Math.abs(now - SYSTEM_START_DATE);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    const daysEl = document.getElementById('status-days');
    if (daysEl) {
        daysEl.textContent = `${diffDays.toLocaleString()} ${translate('daysUnit')}`;
    }

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

// Chart Rendering Engine
function renderChart(p1Data, pvData) {
    const canvas = document.getElementById('dashboard-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Chart rendering logic for time-series energy metrics
}

// Main View Renderer
async function renderDashboard() {
    if (state.currentView === 'status') {
        await updateSystemStatusData();
        return;
    }

    const [p1Data, pvData] = await Promise.all([
        fetchP1DailyData(state.selectedDate),
        fetchPVDailyData(state.selectedDate)
    ]);

    renderChart(p1Data, pvData);
}

// Application Lifecycle & Event Binding
function initApp() {
    // Set Initial Theme
    document.documentElement.setAttribute('data-theme', state.theme);

    // Service Worker Registration for PWA Support
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(err => {
            console.warn('Service Worker registration skipped/failed:', err);
        });
    }

    // View Navigation Buttons
    document.querySelectorAll('[data-view]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const view = e.target.getAttribute('data-view');
            if (!view) return;
            state.currentView = view;
            document.querySelectorAll('[data-view]').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            renderDashboard();
        });
    });

    // Dark/Light Theme Switching
    const themeBtn = document.getElementById('theme-toggle');
    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            state.theme = state.theme === 'dark' ? 'light' : 'dark';
            localStorage.setItem('theme', state.theme);
            document.documentElement.setAttribute('data-theme', state.theme);
        });
    }

    // Language Selector
    const langBtn = document.getElementById('lang-toggle');
    if (langBtn) {
        langBtn.addEventListener('click', () => {
            state.lang = state.lang === 'de' ? 'en' : 'de';
            localStorage.setItem('lang', state.lang);
            renderDashboard();
        });
    }

    // Initial Dashboard Execution
    renderDashboard();

    // Auto-refresh System Status view every 60 seconds
    setInterval(() => {
        if (state.currentView === 'status') {
            updateSystemStatusData();
        }
    }, 60000);
}

// DOM Ready Handler
document.addEventListener('DOMContentLoaded', initApp);
