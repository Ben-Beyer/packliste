/* Rechenwerk des TripPlaners: Strassenroute, Orte in der Naehe, beste
   Reihenfolge, GPX.

   Alles laeuft im Browser gegen freie Dienste ohne Schluessel - kein Backend,
   nichts, was erst hochgefahren werden muss:

     Route    OSRM auf routing.openstreetmap.de (Auto, Rad, zu Fuss),
              fuer das Auto notfalls der OSRM-Demoserver
     Orte     Overpass-API (OpenStreetMap), mit Ausweichserver
     Suche    Nominatim - nur auf Knopfdruck, so verlangt es deren Ordnung

   Antwortet ein Dienst nicht, faellt der Planer auf die Luftlinie zurueck und
   sagt das auch. Er bleibt also immer benutzbar. */

import { haversine } from "./mapview.js";

export const PROFILE = {
  car:  { label: "Auto", kmh: 70, urls: [
    "https://routing.openstreetmap.de/routed-car/route/v1/driving",
    "https://router.project-osrm.org/route/v1/driving"
  ] },
  bike: { label: "Rad", kmh: 16, urls: ["https://routing.openstreetmap.de/routed-bike/route/v1/driving"] },
  foot: { label: "Zu Fuß", kmh: 4.5, urls: ["https://routing.openstreetmap.de/routed-foot/route/v1/driving"] }
};

const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter"
];
const NOMINATIM = "https://nominatim.openstreetmap.org";

/* Kategorien fuer "Entdecken". `q` sind Overpass-Filter, die jeweils noch auf
   Orte mit Namen eingeschraenkt werden. */
export const KATEGORIEN = [
  { id: "sehens", label: "Sehenswert", icon: "★", q: ['["tourism"="attraction"]', '["historic"~"^(castle|monument|ruins|fort|city_gate|palace|archaeological_site)$"]'] },
  { id: "museum", label: "Museen", icon: "🏛", q: ['["tourism"~"^(museum|gallery)$"]'] },
  { id: "aussicht", label: "Aussicht", icon: "⛰", q: ['["tourism"="viewpoint"]', '["natural"="peak"]'] },
  { id: "natur", label: "Natur", icon: "🌲", q: ['["leisure"="nature_reserve"]', '["natural"~"^(waterfall|cave_entrance|spring)$"]', '["leisure"="park"]["wikidata"]'] },
  { id: "wasser", label: "Strand & See", icon: "🌊", q: ['["natural"="beach"]', '["leisure"~"^(beach_resort|swimming_area)$"]'] },
  { id: "essen", label: "Essen", icon: "🍽", q: ['["amenity"="restaurant"]'] },
  { id: "cafe", label: "Café", icon: "☕", q: ['["amenity"~"^(cafe|ice_cream)$"]'] },
  { id: "camping", label: "Camping", icon: "⛺", q: ['["tourism"~"^(camp_site|caravan_site)$"]'] },
  { id: "schlafen", label: "Unterkunft", icon: "🛏", q: ['["tourism"~"^(hotel|guest_house|hostel|apartment|chalet)$"]'] },
  { id: "tanken", label: "Tanken & Laden", icon: "⛽", q: ['["amenity"~"^(fuel|charging_station)$"]'] }
];

export const KAT = Object.fromEntries(KATEGORIEN.map((k) => [k.id, k]));

/* ---------- Hilfen ---------- */

function mitFrist(ms) {
  const ctl = new AbortController();
  const uhr = setTimeout(() => ctl.abort(), ms);
  return { signal: ctl.signal, fertig: () => clearTimeout(uhr) };
}

async function holeJson(url, opts = {}, frist = 12000) {
  const f = mitFrist(frist);
  try {
    const res = await fetch(url, { ...opts, signal: f.signal });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.json();
  } finally { f.fertig(); }
}

const rund = (n, s = 1e5) => Math.round(n * s) / s;

/* ---------- Route ---------- */

const routenCache = new Map();

/* Strassenroute durch alle Punkte in dieser Reihenfolge.
   Ergebnis: { quelle: "strasse"|"luftlinie", legs: [{km, min}], km, min, linie: [[lat,lon], ...] }
   `linie` ist bei der Luftlinie einfach die Punktfolge. */
export async function route(punkte, profil = "car") {
  const p = PROFILE[profil] || PROFILE.car;
  if (punkte.length < 2) return { quelle: "leer", legs: [], km: 0, min: 0, linie: punkte.map((x) => [x.lat, x.lon]) };

  const key = profil + "|" + punkte.map((x) => rund(x.lat) + "," + rund(x.lon)).join(";");
  if (routenCache.has(key)) return routenCache.get(key);

  // OSRM nimmt viele Punkte, aber die freien Server moegen lange Adressen nicht.
  // In Stuecken zu 24 Punkten fragen und die Stuecke aneinanderhaengen.
  const STUECK = 24;
  const teile = [];
  for (let i = 0; i < punkte.length - 1; i += STUECK - 1) teile.push(punkte.slice(i, i + STUECK));

  try {
    const legs = [];
    const linie = [];
    for (const teil of teile) {
      const r = await osrm(teil, p.urls);
      r.legs.forEach((l) => legs.push(l));
      r.linie.forEach((pt, i) => { if (!(linie.length && i === 0)) linie.push(pt); });
    }
    const ergebnis = {
      quelle: "strasse",
      legs,
      km: legs.reduce((a, l) => a + l.km, 0),
      min: legs.reduce((a, l) => a + l.min, 0),
      linie
    };
    routenCache.set(key, ergebnis);
    return ergebnis;
  } catch (e) {
    return luftlinie(punkte, profil);
  }
}

async function osrm(punkte, urls) {
  const coords = punkte.map((x) => rund(x.lon, 1e6) + "," + rund(x.lat, 1e6)).join(";");
  let letzter = null;
  for (const base of urls) {
    try {
      const d = await holeJson(`${base}/${coords}?overview=full&geometries=geojson&steps=false`, {}, 12000);
      if (d.code !== "Ok" || !d.routes || !d.routes[0]) throw new Error(d.code || "keine Route");
      const r = d.routes[0];
      const linie = r.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
      const stuecke = teileLinie(linie, (d.waypoints || []).map((w) => [w.location[1], w.location[0]]), r.legs.length);
      return {
        legs: r.legs.map((l, i) => ({ km: l.distance / 1000, min: l.duration / 60, linie: stuecke[i] })),
        linie
      };
    } catch (e) { letzter = e; }
  }
  throw letzter || new Error("Route nicht erreichbar");
}

/* Die Gesamtlinie an den Wegpunkten zerschneiden, damit jeder Abschnitt in der
   Farbe seines Tages gezeichnet werden kann. OSRM legt die eingerasteten
   Wegpunkte als Stuetzpunkte in die Linie - der naechstgelegene Stuetzpunkt
   hinter dem vorigen Schnitt ist also die Grenze. */
function teileLinie(linie, wps, anzahl) {
  if (wps.length !== anzahl + 1) return Array.from({ length: anzahl }, () => null);
  const schnitte = [0];
  let ab = 0;
  for (let w = 1; w < wps.length - 1; w++) {
    let best = ab, bestD = Infinity;
    for (let i = ab; i < linie.length; i++) {
      const dl = (linie[i][0] - wps[w][0]) ** 2 + (linie[i][1] - wps[w][1]) ** 2;
      if (dl < bestD) { bestD = dl; best = i; }
      if (dl === 0) break;
    }
    schnitte.push(best);
    ab = best;
  }
  schnitte.push(linie.length - 1);
  const out = [];
  for (let i = 0; i < anzahl; i++) out.push(linie.slice(schnitte[i], schnitte[i + 1] + 1));
  return out;
}

/* Notweg ohne Netz: Luftlinie mal 1,3 fuer Umwege, Zeit ueber eine typische
   Reisegeschwindigkeit. Reicht fuer einen Ueberblick, und es steht dran. */
export function luftlinie(punkte, profil = "car") {
  const kmh = (PROFILE[profil] || PROFILE.car).kmh;
  const legs = [];
  for (let i = 1; i < punkte.length; i++) {
    const km = haversine(punkte[i - 1], punkte[i]) * 1.3;
    legs.push({ km, min: km / kmh * 60, linie: [[punkte[i - 1].lat, punkte[i - 1].lon], [punkte[i].lat, punkte[i].lon]] });
  }
  return {
    quelle: "luftlinie",
    legs,
    km: legs.reduce((a, l) => a + l.km, 0),
    min: legs.reduce((a, l) => a + l.min, 0),
    linie: punkte.map((x) => [x.lat, x.lon])
  };
}

/* ---------- Beste Reihenfolge ----------

   Naechster Nachbar als Anfang, dann 2-opt, bis sich nichts mehr verbessert.
   `fest` ist ein optionaler Startpunkt davor (z. B. das Ende des Vortags),
   der selbst nicht umsortiert wird. Bei einer Handvoll Stationen pro Tag ist
   das praktisch immer die beste Loesung und rechnet in Millisekunden. */
export function optimiere(stopps, fest = null) {
  if (stopps.length < 3 && !fest) return stopps.slice();
  const d = (a, b) => haversine(a, b);

  const rest = stopps.slice();
  const weg = [];
  let jetzt = fest;
  if (!jetzt) { jetzt = rest.shift(); weg.push(jetzt); }
  while (rest.length) {
    let best = 0;
    for (let i = 1; i < rest.length; i++) if (d(jetzt, rest[i]) < d(jetzt, rest[best])) best = i;
    jetzt = rest.splice(best, 1)[0];
    weg.push(jetzt);
  }

  const kette = fest ? [fest, ...weg] : weg;
  const start = 1;   // der erste Punkt bleibt immer, wo er ist
  let besser = true;
  let runden = 0;
  while (besser && runden++ < 50) {
    besser = false;
    for (let i = start; i < kette.length - 1; i++) {
      for (let k = i + 1; k < kette.length; k++) {
        const a = kette[i - 1], b = kette[i], c = kette[k], e = kette[k + 1];
        const vorher = d(a, b) + (e ? d(c, e) : 0);
        const nachher = d(a, c) + (e ? d(b, e) : 0);
        if (nachher + 1e-9 < vorher) {
          const stueck = kette.slice(i, k + 1).reverse();
          kette.splice(i, stueck.length, ...stueck);
          besser = true;
        }
      }
    }
  }
  return fest ? kette.slice(1) : kette;
}

export function wegLaenge(punkte) {
  let s = 0;
  for (let i = 1; i < punkte.length; i++) s += haversine(punkte[i - 1], punkte[i]);
  return s;
}

/* ---------- Orte in der Naehe (Overpass) ---------- */

/* `bereich` = {s, w, n, e}. Ist der Ausschnitt zu gross, wird stattdessen im
   Umkreis von 12 km um die Mitte gesucht - sonst laeuft Overpass in die Frist
   und liefert Tausende Treffer. */
export async function entdecke(katId, bereich) {
  const kat = KAT[katId];
  if (!kat) return [];
  const mitte = { lat: (bereich.s + bereich.n) / 2, lon: (bereich.w + bereich.e) / 2 };
  const gross = (bereich.n - bereich.s) > 0.5 || (bereich.e - bereich.w) > 0.8;
  const wo = gross
    ? `(around:12000,${rund(mitte.lat)},${rund(mitte.lon)})`
    : `(${rund(bereich.s)},${rund(bereich.w)},${rund(bereich.n)},${rund(bereich.e)})`;

  const teile = kat.q.map((f) => `nwr${f}["name"]${wo};`).join("");
  const ql = `[out:json][timeout:20];(${teile});out center tags 150;`;

  let daten = null;
  let letzter = null;
  for (const url of OVERPASS) {
    try {
      daten = await holeJson(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: "data=" + encodeURIComponent(ql)
      }, 25000);
      break;
    } catch (e) { letzter = e; }
  }
  if (!daten) throw letzter || new Error("Overpass nicht erreichbar");

  const gesehen = new Set();
  return (daten.elements || [])
    .map((el) => {
      const lat = el.lat ?? (el.center && el.center.lat);
      const lon = el.lon ?? (el.center && el.center.lon);
      const t = el.tags || {};
      if (typeof lat !== "number" || typeof lon !== "number" || !t.name) return null;
      return {
        id: el.type + "/" + el.id,
        name: String(t.name).slice(0, 60),
        kat: katId,
        lat: rund(lat, 1e6),
        lon: rund(lon, 1e6),
        art: artText(t),
        adresse: [t["addr:street"] && (t["addr:street"] + (t["addr:housenumber"] ? " " + t["addr:housenumber"] : "")), t["addr:city"]].filter(Boolean).join(", "),
        web: t.website || t["contact:website"] || "",
        zeiten: t.opening_hours || "",
        km: haversine(mitte, { lat, lon })
      };
    })
    .filter((x) => {
      if (!x) return false;
      const k = x.name.toLowerCase() + "|" + x.lat.toFixed(3) + "|" + x.lon.toFixed(3);
      if (gesehen.has(k)) return false;
      gesehen.add(k);
      return true;
    })
    .sort((a, b) => a.km - b.km)
    .slice(0, 60);
}

const ARTEN = {
  attraction: "Sehenswürdigkeit", castle: "Burg / Schloss", monument: "Denkmal", ruins: "Ruine",
  fort: "Festung", city_gate: "Stadttor", palace: "Palast", archaeological_site: "Ausgrabung",
  museum: "Museum", gallery: "Galerie", viewpoint: "Aussichtspunkt", peak: "Gipfel",
  nature_reserve: "Naturschutzgebiet", waterfall: "Wasserfall", cave_entrance: "Höhle", spring: "Quelle",
  park: "Park", beach: "Strand", beach_resort: "Strandbad", swimming_area: "Badestelle",
  restaurant: "Restaurant", cafe: "Café", ice_cream: "Eiscafé", camp_site: "Campingplatz",
  caravan_site: "Stellplatz", hotel: "Hotel", guest_house: "Pension", hostel: "Hostel",
  apartment: "Ferienwohnung", chalet: "Ferienhaus", fuel: "Tankstelle", charging_station: "Ladestation"
};

function artText(t) {
  const roh = t.tourism || t.historic || t.natural || t.leisure || t.amenity || "";
  let s = ARTEN[roh] || "";
  if (t.cuisine && roh === "restaurant") s += " · " + t.cuisine.split(";")[0].replace(/_/g, " ");
  if (t.ele && roh === "peak") s += " · " + Math.round(parseFloat(t.ele)) + " m";
  return s;
}

/* ---------- Ortssuche ---------- */

export async function sucheOrt(q) {
  const hits = await holeJson(`${NOMINATIM}/search?format=jsonv2&limit=6&accept-language=de&q=${encodeURIComponent(q)}`,
    { headers: { Accept: "application/json" } }, 10000);
  return hits.map((h) => ({
    name: h.display_name.split(",")[0].trim(),
    place: h.display_name.split(",").slice(0, 3).join(",").trim(),
    voll: h.display_name,
    lat: rund(parseFloat(h.lat), 1e6),
    lon: rund(parseFloat(h.lon), 1e6),
    box: h.boundingbox ? h.boundingbox.map(parseFloat) : null   // [s, n, w, e]
  }));
}

export async function ortVon(lat, lon) {
  try {
    const h = await holeJson(`${NOMINATIM}/reverse?format=jsonv2&zoom=16&accept-language=de&lat=${lat}&lon=${lon}`,
      { headers: { Accept: "application/json" } }, 8000);
    const a = h.address || {};
    const name = h.name || a.attraction || a.tourism || a.road || a.village || a.town || a.city || "";
    const ort = a.village || a.town || a.city || a.municipality || a.county || "";
    return {
      name: String(name || ort || "Punkt auf der Karte").slice(0, 60),
      place: [name, ort, a.country].filter((x, i, arr) => x && arr.indexOf(x) === i).join(", ").slice(0, 80)
    };
  } catch (e) {
    return { name: "Punkt auf der Karte", place: `${lat.toFixed(4)}, ${lon.toFixed(4)}` };
  }
}

/* ---------- Ausgabe ---------- */

const xml = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* GPX mit Wegpunkten, geplanter Route und - falls berechnet - der echten
   Strassenlinie als Spur. Laesst sich in Komoot, OsmAnd, Garmin & Co. laden. */
export function gpx(name, stopps, linie) {
  const mitOrt = stopps.filter((s) => typeof s.lat === "number");
  const wpt = mitOrt.map((s) =>
    `  <wpt lat="${s.lat}" lon="${s.lon}"><name>${xml(s.name)}</name>${s.date ? `<time>${s.date}T09:00:00Z</time>` : ""}${s.note ? `<desc>${xml(s.note)}</desc>` : ""}</wpt>`).join("\n");
  const rte = mitOrt.map((s) => `    <rtept lat="${s.lat}" lon="${s.lon}"><name>${xml(s.name)}</name></rtept>`).join("\n");
  const trk = linie && linie.length > 1
    ? `\n  <trk><name>${xml(name)} – Straßenroute</name><trkseg>\n${linie.map(([la, lo]) => `    <trkpt lat="${rund(la, 1e6)}" lon="${rund(lo, 1e6)}"/>`).join("\n")}\n  </trkseg></trk>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Reisebuddy TripPlaner" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${xml(name)}</name></metadata>
${wpt}
  <rte><name>${xml(name)}</name>
${rte}
  </rte>${trk}
</gpx>
`;
}

/* Link fuer Google Maps - die nehmen hoechstens neun Zwischenziele. */
export function googleLink(stopps, profil = "car") {
  const p = stopps.filter((s) => typeof s.lat === "number");
  if (p.length < 1) return "";
  const ll = (s) => `${s.lat},${s.lon}`;
  const modus = profil === "bike" ? "bicycling" : profil === "foot" ? "walking" : "driving";
  if (p.length === 1) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ll(p[0]))}`;
  const mitte = p.slice(1, -1).slice(0, 9).map(ll).join("|");
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(ll(p[0]))}`
    + `&destination=${encodeURIComponent(ll(p[p.length - 1]))}`
    + (mitte ? `&waypoints=${encodeURIComponent(mitte)}` : "")
    + `&travelmode=${modus}`;
}

/* ---------- Anzeige ---------- */

export function kmText(km) {
  if (!km) return "0 km";
  if (km < 10) return km.toFixed(1).replace(".", ",") + " km";
  return Math.round(km).toLocaleString("de-DE") + " km";
}

export function zeitText(min) {
  const m = Math.round(min || 0);
  if (m < 60) return m + " min";
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h + " h" + (r ? " " + String(r).padStart(2, "0") : "");
}
