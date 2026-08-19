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
        pvGen: "PV Generation",
        gridPower: "Grid Active Power",
        loading: "Loading...",
        importToday: "Import Today",
        exportToday: "Export Today",
        
        // Dynamic KPI Card Titles
        pvGenToday: "PV Generation (Today)",
        pvGenMonth: "PV Generation (Month)",
        pvGenYear: "PV Generation (Year)",
        gridActivePower: "Grid Active Power",
        selfConsumptionRate: "Self-Consumption Rate",
        importMonth: "Import (Month)",
        exportMonth: "Export (Month)",
        importYear: "Import (Year)",
        exportYear: "Export (Year)",

        // Grid & Status Indicators
        importingFromGrid: "Importing from Grid",
        exportingToGrid: "Exporting to Grid",
        balanced: "Balanced",
        usedLocally: "kWh used locally",

        // Chart Legends & Axis Labels
        pvGenLabelW: "PV Generation (W)",
        gridPowerLabelW: "Grid Active Power (W)",
        pvGenLabelKwh: "PV Generation (kWh)",
        importLabelKwh: "Grid Import (kWh)",
        exportLabelKwh: "Grid Export (kWh)",
        unitWatts: "Watts (W)",
        unitKwhPerDay: "kWh / day",
        unitKwhPerMonth: "kWh / month",

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
        pvGen: "PV-Erzeugung",
        gridPower: "Netz-Wirkleistung",
        loading: "Laden...",
        importToday: "Netzbezug heute",
        exportToday: "Einspeisung heute",

        // Dynamic KPI Card Titles
        pvGenToday: "PV-Erzeugung (Heute)",
        pvGenMonth: "PV-Erzeugung (Monat)",
        pvGenYear: "PV-Erzeugung (Jahr)",
        gridActivePower: "Netz-Wirkleistung",
        selfConsumptionRate: "Eigenverbrauchsquote",
        importMonth: "Netzbezug (Monat)",
        exportMonth: "Einspeisung (Monat)",
        importYear: "Netzbezug (Jahr)",
        exportYear: "Einspeisung (Jahr)",

        // Grid & Status Indicators
        importingFromGrid: "Netzbezug",
        exportingToGrid: "Netzeinspeisung",
        balanced: "Ausgeglichen",
        usedLocally: "kWh eigenverbraucht",

        // Chart Legends & Axis Labels
        pvGenLabelW: "PV-Erzeugung (W)",
        gridPowerLabelW: "Netz-Wirkleistung (W)",
        pvGenLabelKwh: "PV-Erzeugung (kWh)",
        importLabelKwh: "Netzbezug (kWh)",
        exportLabelKwh: "Einspeisung (kWh)",
        unitWatts: "Watt (W)",
        unitKwhPerDay: "kWh / Tag",
        unitKwhPerMonth: "kWh / Monat",

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