/**
 * Weather forecast panel (toggleable)
 * Data: Open-Meteo.com (free, no API key, CORS enabled)
 *
 * Location (first match wins):
 *   1. Browser override:  localStorage.setItem('weather_lat', '48.12'); localStorage.setItem('weather_lon', '14.73');
 *   2. Optional file weather-config.json next to index.html:  {"lat": 48.12, "lon": 14.73}
 *      (keeps the location out of this script, so updating weather.js never resets it)
 *   3. The built-in defaults below
 */

const WEATHER_DEFAULT_LAT = 48.12;
const WEATHER_DEFAULT_LON = 14.73;
const WEATHER_CONFIG_FILE = 'weather-config.json';   // optional, same folder as index.html
const WEATHER_REFRESH_MS = 30 * 60 * 1000;   // refresh interval while panel is visible
const WEATHER_HOURS_SHOWN = 24;              // hourly strip length
const WEATHER_CACHE_KEY = 'weather_cache_v1';
const WEATHER_VISIBLE_KEY = 'weather_visible';

let weatherRefreshTimer = null;
let weatherConfigPromise = null;

function isValidCoordinate(lat, lon) {
    return Number.isFinite(lat) && Number.isFinite(lon)
        && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

/* Reads the optional weather-config.json once; resolves to {lat, lon} or null */
function loadWeatherConfig() {
    if (!weatherConfigPromise) {
        weatherConfigPromise = fetch(WEATHER_CONFIG_FILE, { cache: 'no-cache', credentials: 'same-origin' })
            .then(res => (res.ok ? res.json() : null))
            .then(cfg => {
                if (!cfg) return null;
                const lat = parseFloat(cfg.lat);
                const lon = parseFloat(cfg.lon);
                return isValidCoordinate(lat, lon) ? { lat, lon } : null;
            })
            .catch(() => null);   // missing or invalid file -> use defaults
    }
    return weatherConfigPromise;
}

async function getWeatherLocation() {
    // 1. per-browser override
    const lsLat = parseFloat(localStorage.getItem('weather_lat'));
    const lsLon = parseFloat(localStorage.getItem('weather_lon'));
    if (isValidCoordinate(lsLat, lsLon)) return { lat: lsLat, lon: lsLon };

    // 2. optional external config file
    const cfg = await loadWeatherConfig();
    if (cfg) return cfg;

    // 3. built-in defaults
    return { lat: WEATHER_DEFAULT_LAT, lon: WEATHER_DEFAULT_LON };
}

function weatherTimeZone() {
    return (typeof getAppTimeZone === 'function') ? getAppTimeZone() : 'Europe/Vienna';
}

function weatherLocale() {
    return (typeof currentLang !== 'undefined' && currentLang === 'de') ? 'de-AT' : 'en-GB';
}

/* WMO weather code -> emoji + translation key */
function wxInfo(code, isDay) {
    const day = isDay !== 0;
    if (code === 0) return { icon: day ? '☀️' : '🌙', key: 'wxClear' };
    if (code === 1) return { icon: day ? '🌤️' : '🌙', key: 'wxMostlyClear' };
    if (code === 2) return { icon: day ? '⛅' : '☁️', key: 'wxPartly' };
    if (code === 3) return { icon: '☁️', key: 'wxOvercast' };
    if (code === 45 || code === 48) return { icon: '🌫️', key: 'wxFog' };
    if (code >= 51 && code <= 55) return { icon: '🌦️', key: 'wxDrizzle' };
    if (code === 56 || code === 57 || code === 66 || code === 67) return { icon: '🌧️', key: 'wxFreezing' };
    if (code >= 61 && code <= 65) return { icon: '🌧️', key: 'wxRain' };
    if (code >= 71 && code <= 77) return { icon: '🌨️', key: 'wxSnow' };
    if (code >= 80 && code <= 82) return { icon: '🌦️', key: 'wxShowers' };
    if (code === 85 || code === 86) return { icon: '🌨️', key: 'wxSnowShowers' };
    if (code >= 95) return { icon: '⛈️', key: 'wxThunder' };
    return { icon: '❔', key: 'wxClear' };
}

function readWeatherCache(lat, lon) {
    try {
        const cached = JSON.parse(localStorage.getItem(WEATHER_CACHE_KEY));
        if (cached && cached.lat === lat && cached.lon === lon && cached.data) return cached;
    } catch (e) {}
    return null;
}

function writeWeatherCache(lat, lon, data) {
    try {
        localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify({ ts: Date.now(), lat, lon, data }));
    } catch (e) {}
}

async function loadWeather(force = false) {
    const { lat, lon } = await getWeatherLocation();
    const cached = readWeatherCache(lat, lon);
    if (!force && cached && Date.now() - cached.ts < WEATHER_REFRESH_MS) return cached.data;

    const params = new URLSearchParams({
        latitude: lat,
        longitude: lon,
        current: 'temperature_2m,apparent_temperature,weather_code,cloud_cover,wind_speed_10m,is_day',
        hourly: 'temperature_2m,precipitation_probability,weather_code,is_day',
        daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunshine_duration',
        timezone: weatherTimeZone(),
        forecast_days: 7
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    try {
        const res = await fetch('https://api.open-meteo.com/v1/forecast?' + params.toString(), {
            signal: controller.signal
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        writeWeatherCache(lat, lon, data);
        return data;
    } catch (e) {
        console.warn('Weather fetch failed', e);
        return cached ? cached.data : null;   // fall back to stale data if available
    } finally {
        clearTimeout(timeoutId);
    }
}

function renderWeather(data) {
    const body = document.getElementById('weather-body');
    if (!body) return;

    if (!data || !data.current || !data.hourly || !data.daily) {
        body.innerHTML = `<p class="status-text">${t('weatherError')}</p>`;
        return;
    }

    const c = data.current;
    const now = wxInfo(c.weather_code, c.is_day);

    // --- Current conditions ---
    const nowHtml = `
        <div class="wx-now">
            <span class="wx-now-icon">${now.icon}</span>
            <div>
                <div class="wx-now-temp">${Math.round(c.temperature_2m)}°C</div>
                <div class="wx-now-desc">${t(now.key)}</div>
                <div class="wx-now-meta">${t('weatherFeels')} ${Math.round(c.apparent_temperature)}° · ${t('weatherClouds')} ${Math.round(c.cloud_cover)}% · ${t('weatherWind')} ${Math.round(c.wind_speed_10m)} km/h</div>
            </div>
        </div>`;

    // --- Hourly strip (starting with the current hour) ---
    const h = data.hourly;
    const currentHourKey = (c.time || '').slice(0, 13);
    let startIdx = h.time.findIndex(ts => ts.slice(0, 13) >= currentHourKey);
    if (startIdx < 0) startIdx = 0;

    let hoursHtml = '';
    for (let i = startIdx; i < Math.min(startIdx + WEATHER_HOURS_SHOWN, h.time.length); i++) {
        const info = wxInfo(h.weather_code[i], h.is_day[i]);
        const rain = h.precipitation_probability[i];
        const label = i === startIdx ? t('weatherNow') : h.time[i].slice(11, 16);
        hoursHtml += `
            <div class="wx-hour">
                <span class="wx-time">${label}</span>
                <span class="wx-ico" title="${t(info.key)}">${info.icon}</span>
                <span class="wx-temp">${Math.round(h.temperature_2m[i])}°</span>
                <span class="wx-rain">${rain > 0 ? '💧' + Math.round(rain) + '%' : ''}</span>
            </div>`;
    }

    // --- Daily row ---
    const d = data.daily;
    let daysHtml = '';
    for (let i = 0; i < d.time.length; i++) {
        const [y, m, day] = d.time[i].split('-').map(Number);
        const dateObj = new Date(y, m - 1, day);
        const label = i === 0
            ? t('weatherToday')
            : dateObj.toLocaleDateString(weatherLocale(), { weekday: 'short' });
        const info = wxInfo(d.weather_code[i], 1);
        const sunHours = (d.sunshine_duration[i] || 0) / 3600;
        const rain = d.precipitation_probability_max[i];
        daysHtml += `
            <div class="wx-day">
                <span class="wx-time">${label}</span>
                <span class="wx-ico" title="${t(info.key)}">${info.icon}</span>
                <span class="wx-temp"><strong>${Math.round(d.temperature_2m_max[i])}°</strong> <span class="wx-min">${Math.round(d.temperature_2m_min[i])}°</span></span>
                <span class="wx-rain">${rain > 0 ? '💧' + Math.round(rain) + '%' : ''}</span>
                <span class="wx-sun">☀ ${sunHours.toFixed(1)} h</span>
            </div>`;
    }

    body.innerHTML = `
        <div class="weather-top">
            ${nowHtml}
            <div class="wx-hours">${hoursHtml}</div>
        </div>
        <div class="wx-days">${daysHtml}</div>`;
}

async function refreshWeather(force = true) {
    const section = document.getElementById('weather-section');
    if (!section || section.classList.contains('hidden')) return;
    const data = await loadWeather(force);
    renderWeather(data);
}

function setWeatherVisible(visible) {
    const section = document.getElementById('weather-section');
    const btn = document.getElementById('btn-weather');
    if (!section) return;

    section.classList.toggle('hidden', !visible);
    // NOTE: uses 'wx-on' (not 'active') because switchView() clears 'active' on all view buttons
    if (btn) btn.classList.toggle('wx-on', visible);
    try { localStorage.setItem(WEATHER_VISIBLE_KEY, visible ? '1' : '0'); } catch (e) {}

    if (weatherRefreshTimer) {
        clearInterval(weatherRefreshTimer);
        weatherRefreshTimer = null;
    }

    if (visible) {
        refreshWeather(false);
        weatherRefreshTimer = setInterval(() => refreshWeather(true), WEATHER_REFRESH_MS);
    }
}

function toggleWeather() {
    const section = document.getElementById('weather-section');
    if (!section) return;
    setWeatherVisible(section.classList.contains('hidden'));
}

document.addEventListener('DOMContentLoaded', () => {
    // Restore last state (default: hidden)
    setWeatherVisible(localStorage.getItem(WEATHER_VISIBLE_KEY) === '1');
});
