/**
 * Multilingual Translation System (i18n)
 * Automatically defaults to German ('de') if listed as preferred by the browser.
 */
const translations = {
    en: {
        // Base Page Labels
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
        
        // Dynamic KPI Card Titles
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

        // Grid & Status Indicators
        importingFromGrid: "Importing from Grid",
        exportingToGrid: "Exporting to Grid",
        balanced: "Balanced",
        usedLocally: "kWh used locally",

        // Status Modal & Theme Switcher Labels
        systemStatusBtn: "Status",
        systemStatus: "System Status",
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

        // Chart Legends & Axis Labels
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

        // Legacy / Generic Labels
        import: "Import",
        export: "Export",
        pvPower: "PV Power",
        gridPowerLabel: "Grid Power"
    },
    de: {
        // Base Page Labels
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

        // Dynamic KPI Card Titles
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

        // Grid & Status Indicators
        importingFromGrid: "Netzbezug",
        exportingToGrid: "Netzeinspeisung",
        balanced: "Ausgeglichen",
        usedLocally: "kWh eigenverbraucht",

        // Status Modal & Theme Switcher Labels
        systemStatusBtn: "Status",
        systemStatus: "Systemstatus",
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

        // Chart Legends & Axis Labels
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

        // Legacy / Generic Labels
        import: "Netzbezug",
        export: "Einspeisung",
        pvPower: "PV-Leistung",
        gridPowerLabel: "Netzleistung"
    }
};

/**
 * Checks browser preferred language priority list.
 * Returns 'de' if German is listed before English or is the primary language.
 */
function getPreferredLanguage() {
    const userLangs = navigator.languages || [navigator.language || navigator.userLanguage || 'en'];
    
    for (const lang of userLangs) {
        const code = lang.toLowerCase().split('-')[0];
        if (code === 'de') return 'de';
        if (code === 'en') return 'en';
    }
    return 'en'; // Default fallback
}

const currentLang = getPreferredLanguage();

/**
 * Returns translated string for a given key, defaulting to English or key name
 */
function t(key) {
    return (translations[currentLang] && translations[currentLang][key]) 
        || (translations['en'] && translations['en'][key]) 
        || key;
}

/**
 * Applies translations to all HTML elements containing [data-i18n]
 */
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
