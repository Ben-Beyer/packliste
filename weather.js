/* Wetteraussicht fuer den Zielort.

   Quelle ist Open-Meteo: kostenlos, ohne Schluessel, ohne Anmeldung. Gefragt
   wird nach der ersten Station mit Ort - und nur alle 30 Minuten, der Rest
   kommt aus dem Zwischenspeicher der Sitzung. */

const API = "https://api.open-meteo.com/v1/forecast";
const FRISCH = 30 * 60 * 1000;

/* WMO-Wettercodes, auf das Noetige eingedampft */
const CODES = {
  0:  ["Klar", "sonne"],
  1:  ["Meist klar", "sonne"],
  2:  ["Wolkig", "wolke-sonne"],
  3:  ["Bedeckt", "wolke"],
  45: ["Nebel", "nebel"], 48: ["Reifnebel", "nebel"],
  51: ["Nieselregen", "regen"], 53: ["Niesel", "regen"], 55: ["Starker Niesel", "regen"],
  56: ["Gefrierender Niesel", "regen"], 57: ["Gefrierender Niesel", "regen"],
  61: ["Leichter Regen", "regen"], 63: ["Regen", "regen"], 65: ["Starker Regen", "regen"],
  66: ["Gefrierender Regen", "regen"], 67: ["Gefrierender Regen", "regen"],
  71: ["Leichter Schnee", "schnee"], 73: ["Schnee", "schnee"], 75: ["Starker Schnee", "schnee"],
  77: ["Schneegriesel", "schnee"],
  80: ["Schauer", "regen"], 81: ["Schauer", "regen"], 82: ["Heftige Schauer", "regen"],
  85: ["Schneeschauer", "schnee"], 86: ["Schneeschauer", "schnee"],
  95: ["Gewitter", "gewitter"], 96: ["Gewitter mit Hagel", "gewitter"], 99: ["Gewitter mit Hagel", "gewitter"]
};

const ICON = {
  sonne: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.4M12 19.6V22M2 12h2.4M19.6 12H22M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M19.1 4.9l-1.7 1.7M6.6 17.4l-1.7 1.7"/>',
  "wolke-sonne": '<circle cx="8.5" cy="8.5" r="3"/><path d="M8.5 2.6v1.6M2.6 8.5h1.6M4.3 4.3l1.1 1.1M12.7 4.3l-1.1 1.1"/><path d="M7 19h10.5a3.5 3.5 0 0 0 .2-7 5 5 0 0 0-9.6 1.2A3.4 3.4 0 0 0 7 19z"/>',
  wolke: '<path d="M7 19h10.5a3.5 3.5 0 0 0 .2-7 5 5 0 0 0-9.6 1.2A3.4 3.4 0 0 0 7 19z"/>',
  nebel: '<path d="M4 9h16M3 13h18M5 17h14M7 21h10"/>',
  regen: '<path d="M7 15h10.5a3.5 3.5 0 0 0 .2-7 5 5 0 0 0-9.6 1.2A3.4 3.4 0 0 0 7 15z"/><path d="M9 18.5l-1 2.5M13 18.5l-1 2.5M17 18.5l-1 2.5"/>',
  schnee: '<path d="M7 15h10.5a3.5 3.5 0 0 0 .2-7 5 5 0 0 0-9.6 1.2A3.4 3.4 0 0 0 7 15z"/><path d="M9 19h.01M13 19h.01M17 19h.01M11 21.5h.01M15 21.5h.01"/>',
  gewitter: '<path d="M7 14h10.5a3.5 3.5 0 0 0 .2-7 5 5 0 0 0-9.6 1.2A3.4 3.4 0 0 0 7 14z"/><path d="M13 16l-3 4h4l-2.5 3.5"/>'
};

export function beschreibung(code) {
  return (CODES[code] || ["Unbekannt", "wolke"])[0];
}

export function symbol(code) {
  const art = (CODES[code] || ["", "wolke"])[1];
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[art] || ICON.wolke}</svg>`;
}

export async function holeWetter(lat, lon, start) {
  const key = `wetter:${lat.toFixed(2)},${lon.toFixed(2)}`;
  try {
    const roh = sessionStorage.getItem(key);
    if (roh) {
      const alt = JSON.parse(roh);
      if (Date.now() - alt.geholt < FRISCH) return alt.daten;
    }
  } catch (e) {}

  const url = `${API}?latitude=${lat}&longitude=${lon}`
    + "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max"
    + "&timezone=auto&forecast_days=7";

  const res = await fetch(url);
  if (!res.ok) throw new Error("Wetter nicht erreichbar");
  const json = await res.json();
  const d = json.daily;
  if (!d || !d.time) throw new Error("keine Daten");

  const daten = d.time.map((tag, i) => ({
    tag,
    code: d.weather_code[i],
    max: Math.round(d.temperature_2m_max[i]),
    min: Math.round(d.temperature_2m_min[i]),
    regen: d.precipitation_probability_max ? d.precipitation_probability_max[i] : null
  }));

  try { sessionStorage.setItem(key, JSON.stringify({ geholt: Date.now(), daten })); } catch (e) {}
  return daten;
}

/* Die Vorhersage reicht sieben Tage. Liegt die Reise weiter weg, gibt es noch
   nichts zu zeigen - dann sagen wir das lieber, als irgendetwas anzuzeigen. */
export function passendeTage(daten, start, ende) {
  if (!daten) return [];
  if (!start) return daten.slice(0, 5);
  const von = start;
  const bis = ende || start;
  const drin = daten.filter((d) => d.tag >= von && d.tag <= bis);
  return drin.length ? drin.slice(0, 7) : [];
}
