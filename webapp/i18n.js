/**
 * Multilingual Translation System (i18n)
 */
const translations = {
    en: {
        title: "Solar Energy Dashboard",
        daily: "Daily",
        monthly: "Monthly",
        yearly: "Yearly",
        total: "Total",
        fullscreen: "⛶ Fullscreen",
        pvGen: "PV Generation",
        gridPower: "Grid Active Power",
        loading: "Loading...",
        importToday: "Import Today",
        exportToday: "Export Today",
        chargerToday: "EV Charged Today",
        
        pvGenToday: "PV Generation (Today)",
        pvGenMonth: "PV Generation (Month)",
        pvGenYear: "PV Generation (Year)",
        pvGenTotal: "PV Generation (Total)",
        gridActivePower: "Grid Active Power",
        selfConsumptionRate: "Self-Consumption Rate",
        importMonth: "Import (Month)",
        exportMonth: "Export (Month)",
        importYear: "Import (Year)",
        exportYear: "Export (Year)",
        importTotal: "Import (Total)",
        exportTotal: "Export (Total)",
        chargerMonth: "EV Charged (Month)",
        chargerYear: "EV Charged (Year)",
        chargerTotal: "EV Charged (Total)",

        importingFromGrid: "Importing from Grid",
        exportingToGrid: "Exporting to Grid",
        balanced: "Balanced",
        usedLocally: "kWh used locally",

        systemStatusBtn: "Status",
        systemStatus: "Actual Status / Counters",
        systemDataStatus: "Data Status:",
        themeLabel: "Dashboard Theme",
        themeDark: "Dark",
        themeLight: "Light",
        localTime: "Local Time:",
        operatingDays: "System Uptime:",
        totalPvGen: "Total PV Generation:",
        totalImport: "Total Grid Import:",
        totalExport: "Total Grid Export:",
        totalCharger: "Total EV Charged:",
        daysUnit: "days",

        pvGenLabelW: "PV Generation (W)",
        gridPowerLabelW: "Grid Active Power (W)",
        chargerPowerLabelW: "EV Charger Power (W)",
        pvGenLabelKwh: "PV Generation (kWh)",
        importLabelKwh: "Grid Import (kWh)",
        exportLabelKwh: "Grid Export (kWh)",
        chargerLabelKwh: "EV Charged (kWh)",
        unitWatts: "Watts (W)",
        unitKwhPerDay: "kWh / day",
        unitKwhPerMonth: "kWh / month",
        unitKwhPerYear: "kWh / year",

        import: "Import",
        export: "Export",
        pvPower: "PV Power",
        gridPowerLabel: "Grid Power"
    },
    de: {
        title: "Solar-Energie-Dashboard",
        daily: "Täglich",
        monthly: "Monatlich",
        yearly: "Jährlich",
        total: "Gesamt",
        fullscreen: "⛶ Vollbild",
        pvGen: "PV-Erzeugung",
        gridPower: "Netz-Wirkleistung",
        loading: "Laden...",
        importToday: "Netzbezug heute",
        exportToday: "Einspeisung heute",
        chargerToday: "E-Auto geladen heute",

        pvGenToday: "PV-Erzeugung (Heute)",
        pvGenMonth: "PV-Erzeugung (Monat)",
        pvGenYear: "PV-Erzeugung (Jahr)",
        pvGenTotal: "PV-Erzeugung (Gesamt)",
        gridActivePower: "Netz-Wirkleistung",
        selfConsumptionRate: "Eigenverbrauchsquote",
        importMonth: "Netzbezug (Monat)",
        exportMonth: "Einspeisung (Monat)",
        importYear: "Netzbezug (Jahr)",
        exportYear: "Einspeisung (Jahr)",
        importTotal: "Netzbezug (Gesamt)",
        exportTotal: "Einspeisung (Gesamt)",
        chargerMonth: "E-Auto geladen (Monat)",
        chargerYear: "E-Auto geladen (Jahr)",
        chargerTotal: "E-Auto geladen (Gesamt)",

        importingFromGrid: "Netzbezug",
        exportingToGrid: "Netzeinspeisung",
        balanced: "Ausgeglichen",
        usedLocally: "kWh eigenverbraucht",

        systemStatusBtn: "Status",
        systemStatus: "Status / Zähler",
        systemDataStatus: "Datenstatus:",
        themeLabel: "Dashboard Design",
        themeDark: "Dunkel",
        themeLight: "Hell",
        localTime: "Lokale Uhrzeit:",
        operatingDays: "Laufzeit Anlage:",
        totalPvGen: "Gesamterzeugung PV:",
        totalImport: "Gesamt Netzbezug:",
        totalExport: "Gesamt Einspeisung:",
        totalCharger: "Gesamt E-Auto Geladen:",
        daysUnit: "Tage",

        pvGenLabelW: "PV-Erzeugung (W)",
        gridPowerLabelW: "Netz-Wirkleistung (W)",
        chargerPowerLabelW: "E-Auto Ladeleistung (W)",
        pvGenLabelKwh: "PV-Erzeugung (kWh)",
        importLabelKwh: "Netzbezug (kWh)",
        exportLabelKwh: "Einspeisung (kWh)",
        chargerLabelKwh: "E-Auto geladen (kWh)",
        unitWatts: "Watt (W)",
        unitKwhPerDay: "kWh / Tag",
        unitKwhPerMonth: "kWh / Monat",
        unitKwhPerYear: "kWh / Jahr",

        import: "Netzbezug",
        export: "Einspeisung",
        pvPower: "PV-Leistung",
        gridPowerLabel: "Netzleistung"
    }
};

function getPreferredLanguage() {
    const userLangs = navigator.languages || [navigator.language || navigator.userLanguage || 'en'];
    for (const lang of userLangs) {
        const code = lang.toLowerCase().split('-')[0];
        if (code === 'de') return 'de';
        if (code === 'en') return 'en';
    }
    return 'en';
}

const currentLang = getPreferredLanguage();

function t(key) {
    return (translations[currentLang] && translations[currentLang][key]) 
        || (translations['en'] && translations['en'][key]) 
        || key;
}

function applyTranslations() {
    document.documentElement.lang = currentLang;
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        const translation = t(key);
        if (element.tagName === 'INPUT' && element.type === 'placeholder') {
            element.placeholder = translation;
        } else {
            element.textContent = translation;
        }
    });
}

document.addEventListener('DOMContentLoaded', applyTranslations);
