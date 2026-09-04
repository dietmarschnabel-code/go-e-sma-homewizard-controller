function getMinutesSinceLastRecord(records, serverTime) {
    if (!records || records.length === 0) return Infinity;

    const lastRecord = records[records.length - 1];
    const timeStr = lastRecord.timeOnly;

    if (!timeStr || !timeStr.includes(':')) return Infinity;

    const [hours, minutes] = timeStr.split(':').map(Number);
    const now = serverTime ? new Date(serverTime) : new Date();

    const recordTime = new Date(
        now.getFullYear(), 
        now.getMonth(), 
        now.getDate(), 
        hours, 
        minutes, 
        0
    );

    const diffMs = now.getTime() - recordTime.getTime();
    const diffMins = diffMs / (1000 * 60);

    return diffMins < 0 ? 0 : diffMins;
}

function getSingleLedStatus(ageMins) {
    if (ageMins > 11) return 'led-red';
    if (ageMins > 6) return 'led-yellow';
    return 'led-green';
}

async function updateSystemStatusData() {
    let serverTime = null;

    const [p1Data, pvData] = await Promise.all([
        fetchP1DailyData(new Date()),
        fetchPVDailyData(new Date())
    ]);

    try {
        const response = await fetch(window.location.href, { method: 'HEAD' });
        const serverDateHeader = response.headers.get('date');
        if (serverDateHeader) {
            serverTime = new Date(serverDateHeader);
        }
    } catch (e) {
        serverTime = new Date();
    }

    // 1. Photovoltaic Status Line
    const latestPV = pvData.length > 0 ? pvData[pvData.length - 1] : null;
    const pvTimeEl = document.getElementById('pv-status-time');
    const pvLedEl = document.getElementById('pv-status-led');

    if (latestPV && latestPV.timeOnly) {
        if (pvTimeEl) pvTimeEl.textContent = latestPV.timeOnly;
        const pvAge = getMinutesSinceLastRecord(pvData, serverTime);
        if (pvLedEl) pvLedEl.className = `status-led ${getSingleLedStatus(pvAge)}`;
    } else {
        if (pvTimeEl) pvTimeEl.textContent = '--:--';
        if (pvLedEl) pvLedEl.className = 'status-led led-red';
    }

    // 2. Smart Meter (P1) Status Line
    const latestP1 = p1Data.length > 0 ? p1Data[p1Data.length - 1] : null;
    const p1TimeEl = document.getElementById('p1-status-time');
    const p1LedEl = document.getElementById('p1-status-led');

    if (latestP1 && latestP1.timeOnly) {
        if (p1TimeEl) p1TimeEl.textContent = latestP1.timeOnly;
        const p1Age = getMinutesSinceLastRecord(p1Data, serverTime);
        if (p1LedEl) p1LedEl.className = `status-led ${getSingleLedStatus(p1Age)}`;
    } else {
        if (p1TimeEl) p1TimeEl.textContent = '--:--';
        if (p1LedEl) p1LedEl.className = 'status-led led-red';
    }

    // 3. System Uptime & Counters
    const now = serverTime || new Date();
    const diffTime = Math.abs(now - SYSTEM_START_DATE);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    const daysEl = document.getElementById('status-days');
    if (daysEl) {
        daysEl.textContent = `${diffDays.toLocaleString()} ${t('daysUnit')}`;
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
