/* Karte: wo wart ihr schon, und wo soll es noch hin.

   Die zurueckgelegte Route entsteht aus den Aufnahmeorten der Fotos, nach
   Aufnahmezeit sortiert. Die geplante Route sind die Stationen aus dem Plan.
   Kartenbilder kommen von OpenStreetMap, dafuer braucht es keinen Schluessel. */

const LEAFLET = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4";

let loading = null;

/* Leaflet erst laden, wenn die Karte wirklich gebraucht wird. */
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (loading) return loading;

  loading = new Promise((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = `${LEAFLET}/leaflet.min.css`;
    document.head.appendChild(css);

    const js = document.createElement("script");
    js.src = `${LEAFLET}/leaflet.min.js`;
    js.async = true;
    js.onload = () => resolve(window.L);
    js.onerror = () => reject(new Error("Karte liess sich nicht laden"));
    document.head.appendChild(js);
  });
  return loading;
}

export function initMap(ctx) {
  const host = document.getElementById("mapCanvas");
  const note = document.getElementById("mapNote");
  const statLine = document.getElementById("mapStats");
  const fitBtn = document.getElementById("mapFit");

  let map = null;
  let layers = null;
  let failed = false;
  const urls = new Map();

  fitBtn.addEventListener("click", () => fit());

  // Drehen des Geraets oder ein Fensterwechsel aendert die Containergroesse.
  // Kurz warten, sonst misst Leaflet die alte Breite.
  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (map) map.invalidateSize(); }, 180);
  });

  async function ensure() {
    if (map || failed) return map;
    try {
      const L = await loadLeaflet();
      map = L.map(host, { zoomControl: true, attributionControl: true });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      }).addTo(map);
      map.setView([51.34, 12.37], 5);   // Startbild, bis Daten da sind
      layers = L.layerGroup().addTo(map);
    } catch (err) {
      failed = true;
      note.hidden = false;
      note.textContent = "Die Karte braucht beim ersten Mal eine Internetverbindung.";
    }
    return map;
  }

  /* Wird aufgerufen, wenn der Reiter sichtbar wird. Vorher ist der Container
     ausgeblendet und hat keine Groesse - Leaflet muss also neu messen, und zwar
     erst nachdem der Browser das Layout gerechnet hat. Deshalb das rAF. */
  async function activate() {
    await ensure();
    if (!map) return;
    render();
    requestAnimationFrame(() => {
      if (!map) return;
      map.invalidateSize();
      fit();
    });
  }

  async function render() {
    if (!map) return;   // erst wenn der Reiter mal offen war
    const L = window.L;
    layers.clearLayers();

    const photos = (ctx.photos || [])
      .filter((p) => typeof p.lat === "number" && typeof p.lon === "number")
      .slice()
      .sort((a, b) => (a.at || 0) - (b.at || 0));

    const stops = ((ctx.trip && ctx.trip.stops) || [])
      .filter((s) => typeof s.lat === "number" && typeof s.lon === "number");

    const bounds = [];

    // Geplante Route: gestrichelt, im Hintergrund
    if (stops.length > 1) {
      L.polyline(stops.map((s) => [s.lat, s.lon]), {
        color: "#7A8880", weight: 3, opacity: .75, dashArray: "7 8"
      }).addTo(layers);
    }
    stops.forEach((s, i) => {
      bounds.push([s.lat, s.lon]);
      L.marker([s.lat, s.lon], { icon: stopIcon(L, i + 1) })
        .bindPopup(`<strong>${escapeHtml(s.name)}</strong>${s.date ? "<br>" + escapeHtml(formatDate(s.date)) : ""}${s.note ? "<br>" + escapeHtml(s.note) : ""}`)
        .addTo(layers);
    });

    // Gelaufene Route aus den Fotos
    if (photos.length > 1) {
      L.polyline(photos.map((p) => [p.lat, p.lon]), {
        color: "#0F6E4F", weight: 4, opacity: .85
      }).addTo(layers);
    }
    photos.forEach((p) => {
      bounds.push([p.lat, p.lon]);
      const marker = L.marker([p.lat, p.lon], { icon: photoIcon(L, p) }).addTo(layers);
      marker.on("click", () => ctx.openPhoto && ctx.openPhoto(p));
    });

    if (bounds.length) {
      map.__bounds = L.latLngBounds(bounds);
      note.hidden = true;
    } else {
      map.__bounds = null;
      note.hidden = false;
      note.textContent = "Noch nichts zu zeigen. Lade Fotos mit Ortsangabe hoch oder gib Stationen im Plan einen Ort.";
    }

    const km = routeKm(photos);
    const stopText = stops.length === 1 ? "1 geplante Station" : `${stops.length} geplante Stationen`;
    statLine.textContent = photos.length
      ? `${photos.length === 1 ? "1 Foto" : photos.length + " Fotos"} mit Ort · rund ${km} km Luftlinie zwischen den Aufnahmen${stops.length ? " · " + stopText : ""}`
      : (stops.length ? stopText : "");
  }

  function fit() {
    if (!map || !map.__bounds) return;
    map.fitBounds(map.__bounds, { padding: [34, 34], maxZoom: 15 });
  }

  function photoIcon(L, p) {
    let url = urls.get(p.id);
    if (!url) {
      url = URL.createObjectURL(new Blob([p.thumb.toUint8Array()], { type: "image/jpeg" }));
      urls.set(p.id, url);
    }
    return L.divIcon({
      className: "",
      html: `<span class="map-shot"><img src="${url}" alt=""></span>`,
      iconSize: [40, 40],
      iconAnchor: [20, 20]
    });
  }

  function stopIcon(L, n) {
    return L.divIcon({
      className: "",
      html: `<span class="map-stop">${n}</span>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13]
    });
  }

  return { render, activate };
}

/* Luftlinie zwischen aufeinanderfolgenden Aufnahmen, grob aufgerundet. */
function routeKm(points) {
  let sum = 0;
  for (let i = 1; i < points.length; i++) sum += haversine(points[i - 1], points[i]);
  return sum < 10 ? sum.toFixed(1) : Math.round(sum);
}

function haversine(a, b) {
  const R = 6371;
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "numeric" });
}

export function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
