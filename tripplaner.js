/* Bruecke zum TripPlaner.

   Der TripPlaner ist eine eigene Anwendung mit Spring-Boot-Backend auf
   localhost:8080. Reisebuddy laeuft dagegen als Webseite - meist auf dem Handy,
   wo es kein localhost gibt. Deshalb zwei Wege:

     direkt   Sitzungs-ID eintippen, Reisebuddy holt die POIs selbst ab.
              Geht nur auf dem Rechner, auf dem das TripPlaner-Backend laeuft,
              und nur in Chrome/Edge - Safari verbietet den Griff von einer
              https-Seite auf http://localhost.

     ueber die Zwischenablage
              JSON aus dem TripPlaner einfuegen. Geht ueberall, auch am Handy.

   Am TripPlaner selbst wird nichts geaendert. */

const BACKEND = "http://localhost:8080";
const FRONTEND = "http://localhost:3000";
const $ = (id) => document.getElementById(id);

export function initTripPlaner(ctx) {
  const dlg = $("dlgPlaner");
  const openBtn = $("planerBtn");
  const idFeld = $("planerId");
  const holen = $("planerFetch");
  const jsonFeld = $("planerJson");
  const uebernehmen = $("planerImport");
  const exportFeld = $("planerExport");
  const kopieren = $("planerCopy");
  const oeffnen = $("planerOpen");
  const err = $("planerErr");
  const info = $("planerInfo");

  openBtn.addEventListener("click", () => {
    err.hidden = true;
    info.hidden = true;
    idFeld.value = "";
    jsonFeld.value = "";
    exportFeld.value = JSON.stringify(exportDaten(), null, 1);
    dlg.showModal();
  });

  /* ---- Reisebuddy -> TripPlaner ---- */

  function exportDaten() {
    const t = ctx.trip || {};
    return {
      quelle: "reisebuddy",
      reise: t.name || "",
      von: t.start || "",
      bis: t.end || "",
      stationen: (t.stops || []).map((s) => ({
        name: s.name,
        datum: s.date || "",
        notiz: s.note || "",
        latitude: typeof s.lat === "number" ? s.lat : null,
        longitude: typeof s.lat === "number" ? s.lon : null
      }))
    };
  }

  kopieren.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(exportFeld.value);
      ctx.toast("Stationen kopiert — im TripPlaner einfügen.");
    } catch (e) {
      exportFeld.select();
      ctx.toast("Markiert — mit Strg+C kopieren.");
    }
  });

  oeffnen.addEventListener("click", () => {
    const mitOrt = ((ctx.trip && ctx.trip.stops) || []).filter((s) => typeof s.lat === "number");
    let url = FRONTEND;
    if (mitOrt.length) {
      const mitte = mitOrt.reduce((a, s) => ({ lat: a.lat + s.lat / mitOrt.length, lon: a.lon + s.lon / mitOrt.length }), { lat: 0, lon: 0 });
      url += `/?lat=${mitte.lat.toFixed(5)}&lng=${mitte.lon.toFixed(5)}`;
    }
    window.open(url, "_blank", "noopener");
    info.textContent = "Der TripPlaner öffnet sich in einem neuen Tab. Läuft dort nichts, starte erst das Backend (./mvnw spring-boot:run) und das Frontend.";
    info.hidden = false;
  });

  /* ---- TripPlaner -> Reisebuddy ---- */

  holen.addEventListener("click", async () => {
    const id = idFeld.value.trim();
    if (!id) {
      zeigeFehler("Trag die Sitzungs-ID ein — die steht im TripPlaner in der Adresszeile und fängt mit „trip-“ an.");
      return;
    }
    holen.disabled = true;
    holen.textContent = "Hole …";
    err.hidden = true;
    try {
      const res = await fetch(`${BACKEND}/api/sessions/${encodeURIComponent(id)}/pois`, {
        headers: { Accept: "application/json" }
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const pois = await res.json();
      await importiere(pois);
    } catch (e) {
      zeigeFehler("Das TripPlaner-Backend war nicht erreichbar. Läuft es auf localhost:8080? Auf dem iPhone geht dieser Weg gar nicht — nimm dort das Einfügen-Feld darunter.");
    } finally {
      holen.disabled = false;
      holen.textContent = "Holen";
    }
  });

  uebernehmen.addEventListener("click", async () => {
    const roh = jsonFeld.value.trim();
    if (!roh) { zeigeFehler("Erst den Text aus dem TripPlaner einfügen."); return; }
    let daten;
    try { daten = JSON.parse(roh); }
    catch (e) { zeigeFehler("Das ist kein gültiges JSON. Kopier den Text nochmal komplett."); return; }
    await importiere(daten);
  });

  async function importiere(daten) {
    const roh = Array.isArray(daten) ? daten
      : (daten && Array.isArray(daten.pois)) ? daten.pois
      : (daten && Array.isArray(daten.stationen)) ? daten.stationen
      : (daten && Array.isArray(daten.stops)) ? daten.stops
      : null;

    if (!roh) { zeigeFehler("In den Daten steckt keine Liste von Orten."); return; }

    const neu = roh.map((p) => {
      const lat = zahl(p.latitude ?? p.lat);
      const lon = zahl(p.longitude ?? p.lon ?? p.lng);
      const name = String(p.name || p.title || "Ohne Namen").slice(0, 60);
      const eintrag = {
        id: "s" + Date.now().toString(36) + Math.floor(Math.random() * 100000).toString(36),
        name,
        date: String(p.datum || p.date || "").slice(0, 10),
        note: String(p.notiz || p.description || p.category || "").slice(0, 120)
      };
      if (lat !== null && lon !== null) {
        eintrag.lat = lat; eintrag.lon = lon;
        eintrag.place = String(p.place || p.category || "").slice(0, 80);
      }
      return eintrag;
    }).filter((s) => s.name);

    if (!neu.length) { zeigeFehler("Es war kein einziger brauchbarer Ort dabei."); return; }

    const vorhanden = ((ctx.trip && ctx.trip.stops) || []).map((s) => s.name.toLowerCase());
    const frisch = neu.filter((s) => !vorhanden.includes(s.name.toLowerCase()));
    const alle = ((ctx.trip && ctx.trip.stops) || []).concat(frisch);

    try {
      await ctx.store.setStops(ctx.code, sortiere(alle));
      dlg.close();
      const doppelt = neu.length - frisch.length;
      ctx.toast(`${frisch.length === 1 ? "1 Station" : frisch.length + " Stationen"} übernommen`
        + (doppelt ? ` · ${doppelt === 1 ? "1 war" : doppelt + " waren"} schon da` : ""));
    } catch (e) {
      zeigeFehler("Konnte nicht gespeichert werden.");
    }
  }

  function zahl(v) {
    const n = typeof v === "string" ? parseFloat(v) : v;
    return typeof n === "number" && isFinite(n) ? Math.round(n * 1e6) / 1e6 : null;
  }

  function zeigeFehler(text) {
    err.textContent = text;
    err.hidden = false;
  }

  document.querySelectorAll("#dlgPlaner [data-close]").forEach((b) =>
    b.addEventListener("click", () => dlg.close()));

  return {};
}

/* Nach Datum sortieren, Stationen ohne Datum hinten anstellen. */
function sortiere(stops) {
  return stops.slice().sort((a, b) => {
    if (a.date && b.date) return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    if (a.date) return -1;
    if (b.date) return 1;
    return 0;
  });
}
