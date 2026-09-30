/* Karte: wo wart ihr schon, wo soll es hin, und welche Spots warten noch.

   Drei Ebenen, einzeln abschaltbar:
     Fotos  - die tatsaechlich gelaufene Route aus den Aufnahmeorten
     Plan   - die geplanten Stationen, gestrichelt
     Spots  - die Challenge-Orte

   Kartenbilder kommen von OpenStreetMap, dafuer braucht es keinen Schluessel. */

const LEAFLET = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4";
const $ = (id) => document.getElementById(id);

let loading = null;

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
    js.onerror = () => reject(new Error("Karte ließ sich nicht laden"));
    document.head.appendChild(js);
  });
  return loading;
}

export function initMap(ctx) {
  const host = $("mapCanvas");
  const note = $("mapNote");
  const statLine = $("mapStats");
  const fitBtn = $("mapFit");

  let map = null;
  let layers = null;
  let failed = false;
  const urls = new Map();
  const an = { fotos: true, plan: true, spots: true };

  fitBtn.addEventListener("click", () => fit());

  document.querySelectorAll("[data-ebene]").forEach((b) => {
    b.addEventListener("click", () => {
      const k = b.dataset.ebene;
      an[k] = !an[k];
      b.setAttribute("aria-pressed", an[k] ? "true" : "false");
      render();
      requestAnimationFrame(fit);
    });
  });

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
      map.setView([51.34, 12.37], 5);
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
     erst nachdem der Browser das Layout gerechnet hat. */
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

  function render() {
    if (!map) return;
    const L = window.L;
    layers.clearLayers();

    const fotos = an.fotos
      ? (ctx.photos || [])
          .filter((p) => typeof p.lat === "number" && typeof p.lon === "number")
          .slice().sort((a, b) => (a.at || 0) - (b.at || 0))
      : [];

    const stops = an.plan
      ? ((ctx.trip && ctx.trip.stops) || []).filter((s) => typeof s.lat === "number")
      : [];

    const spots = an.spots
      ? (ctx.spots || []).filter((s) => typeof s.lat === "number")
      : [];

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
    let linie = null;
    if (fotos.length > 1) {
      linie = L.polyline(fotos.map((p) => [p.lat, p.lon]), {
        color: "#0F6E4F", weight: 4, opacity: .9
      }).addTo(layers);
    }
    fotos.forEach((p) => {
      bounds.push([p.lat, p.lon]);
      const marker = L.marker([p.lat, p.lon], { icon: photoIcon(L, p) }).addTo(layers);
      marker.on("click", () => ctx.openPhoto && ctx.openPhoto(p));
    });

    // Challenge-Spots
    spots.forEach((s) => {
      bounds.push([s.lat, s.lon]);
      const erledigt = Object.keys(s.done || {}).length > 0;
      L.marker([s.lat, s.lon], { icon: spotIcon(L, erledigt) })
        .bindPopup(`<strong>${escapeHtml(s.title)}</strong>${s.placeName ? "<br>" + escapeHtml(s.placeName) : ""}<br><em>Spot von ${escapeHtml(s.by || "jemand")}</em>`)
        .addTo(layers);
    });

    if (linie) zeichneRoute(linie);

    if (bounds.length) {
      map.__bounds = L.latLngBounds(bounds);
      note.hidden = true;
    } else {
      map.__bounds = null;
      note.hidden = false;
      note.textContent = (ctx.photos || []).length
        ? "Keins der Fotos hat eine Ortsangabe. Im Reiter Fotos kannst du sie im Ordner „Ohne Ort“ nachtragen — dann erscheint hier eure Route."
        : "Noch nichts zu zeigen. Lade Fotos mit Ortsangabe hoch, plane Stationen oder leg einen Spot an.";
    }

    const km = routeKm(fotos);
    const teile = [];
    if (fotos.length) teile.push(`${fotos.length === 1 ? "1 Foto" : fotos.length + " Fotos"} mit Ort · rund ${km} km Luftlinie`);
    if (stops.length) teile.push(stops.length === 1 ? "1 geplante Station" : `${stops.length} geplante Stationen`);
    if (spots.length) teile.push(spots.length === 1 ? "1 Spot" : `${spots.length} Spots`);
    statLine.textContent = teile.join(" · ");
  }

  /* Die Route zeichnet sich einmal von vorn nach hinten selbst. */
  function zeichneRoute(linie) {
    const el = linie.getElement && linie.getElement();
    const g = ctx.motion && ctx.motion.gsap;
    if (!el || !g || !ctx.motion.aktiv() || !el.getTotalLength) return;
    const len = el.getTotalLength();
    if (!len) return;
    g.fromTo(el,
      { strokeDasharray: len, strokeDashoffset: len },
      { strokeDashoffset: 0, duration: 1.6, ease: "power2.inOut",
        onComplete: () => { el.style.strokeDasharray = ""; el.style.strokeDashoffset = ""; } });
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

  function spotIcon(L, erledigt) {
    return L.divIcon({
      className: "",
      html: `<span class="map-spot${erledigt ? " hat" : ""}"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z"/></svg></span>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    });
  }

  return { render, activate };
}

/* Luftlinie zwischen aufeinanderfolgenden Aufnahmen, grob gerundet. */
function routeKm(points) {
  let sum = 0;
  for (let i = 1; i < points.length; i++) sum += haversine(points[i - 1], points[i]);
  return sum < 10 ? sum.toFixed(1) : Math.round(sum);
}

export function haversine(a, b) {
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
