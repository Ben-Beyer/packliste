/* Plan: die Stationen der Reise - Name, Datum, Notiz und ein Ort.

   Der Ort kommt aus der Ortssuche von OpenStreetMap (Nominatim, ohne Schluessel
   und kostenlos). Gesucht wird nur auf Knopfdruck, damit die Anfragen selten
   bleiben - so verlangt es deren Nutzungsordnung. */

import { formatDate } from "./mapview.js";

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const $ = (id) => document.getElementById(id);

export function initPlan(ctx) {
  const list = $("stopList");
  const empty = $("stopEmpty");
  const addBtn = $("stopAddBtn");

  const dlg = $("dlgStop");
  const form = $("stopForm");
  const fName = $("stopName");
  const fDate = $("stopDate");
  const fNote = $("stopNote");
  const fQuery = $("stopQuery");
  const searchBtn = $("stopSearch");
  const results = $("stopResults");
  const placeLine = $("stopPlace");
  const clearPlace = $("stopPlaceClear");
  const delBtn = $("stopDelete");
  const title = $("stopDlgTitle");
  const err = $("stopErr");

  let editing = null;      // ID der Station, die gerade bearbeitet wird
  let picked = null;       // { lat, lon, place }

  addBtn.addEventListener("click", () => openDialog(null));

  /* `vorgabe` fuellt eine neue Station vor - der TripPlaner gibt so den Tag mit. */
  function openDialog(stop, vorgabe = {}) {
    editing = stop ? stop.id : null;
    title.textContent = stop ? "Station bearbeiten" : "Neue Station";
    fName.value = stop ? stop.name : "";
    fDate.value = stop && stop.date ? stop.date : (vorgabe.date || "");
    fNote.value = stop && stop.note ? stop.note : "";
    fQuery.value = "";
    results.textContent = "";
    results.hidden = true;
    err.hidden = true;
    delBtn.hidden = !stop;
    delBtn.dataset.armed = "0";
    delBtn.textContent = "Löschen";
    picked = (stop && typeof stop.lat === "number")
      ? { lat: stop.lat, lon: stop.lon, place: stop.place || "" }
      : null;
    paintPlace();
    dlg.showModal();
    fName.focus();
  }

  function paintPlace() {
    if (picked) {
      placeLine.hidden = false;
      placeLine.querySelector("span").textContent =
        picked.place || `${picked.lat.toFixed(4)}, ${picked.lon.toFixed(4)}`;
    } else {
      placeLine.hidden = true;
    }
  }

  clearPlace.addEventListener("click", () => { picked = null; paintPlace(); });

  searchBtn.addEventListener("click", async () => {
    const q = fQuery.value.trim();
    if (q.length < 3) {
      err.textContent = "Mindestens drei Zeichen zum Suchen.";
      err.hidden = false;
      return;
    }
    err.hidden = true;
    searchBtn.disabled = true;
    searchBtn.textContent = "Sucht …";
    results.textContent = "";
    results.hidden = true;
    try {
      const res = await fetch(`${NOMINATIM}?format=jsonv2&limit=5&accept-language=de&q=${encodeURIComponent(q)}`,
        { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error("Suche nicht erreichbar");
      const hits = await res.json();
      if (!hits.length) {
        err.textContent = "Dazu wurde nichts gefunden. Anders schreiben oder Ort weglassen.";
        err.hidden = false;
        return;
      }
      hits.forEach((hit) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "hit";
        b.textContent = hit.display_name;
        b.addEventListener("click", () => {
          picked = {
            lat: Math.round(parseFloat(hit.lat) * 1e6) / 1e6,
            lon: Math.round(parseFloat(hit.lon) * 1e6) / 1e6,
            place: hit.display_name.split(",").slice(0, 3).join(",").trim()
          };
          if (!fName.value.trim()) fName.value = hit.display_name.split(",")[0].trim();
          results.hidden = true;
          paintPlace();
        });
        results.appendChild(b);
      });
      results.hidden = false;
    } catch (e) {
      err.textContent = "Die Ortssuche war nicht erreichbar. Du kannst die Station auch ohne Ort speichern.";
      err.hidden = false;
    } finally {
      searchBtn.disabled = false;
      searchBtn.textContent = "Suchen";
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = fName.value.trim();
    if (!name) return;

    const stops = ((ctx.trip && ctx.trip.stops) || []).map((s) => ({ ...s }));
    // Felder, die dieser Dialog nicht kennt (z. B. die Kategorie aus dem
    // TripPlaner), bleiben erhalten.
    const alt = stops.find((s) => s.id === editing) || {};
    const entry = {
      ...alt,
      id: editing || "s" + Date.now().toString(36) + Math.floor(Math.random() * 1000),
      name,
      date: fDate.value || "",
      note: fNote.value.trim()
    };
    delete entry.lat; delete entry.lon; delete entry.place;
    if (picked) { entry.lat = picked.lat; entry.lon = picked.lon; entry.place = picked.place; }

    const at = stops.findIndex((s) => s.id === editing);
    if (at >= 0) stops[at] = entry; else stops.push(entry);

    try {
      await ctx.store.setStops(ctx.code, sortStops(stops));
      dlg.close();
    } catch (e2) {
      err.textContent = "Konnte nicht gespeichert werden.";
      err.hidden = false;
    }
  });

  delBtn.addEventListener("click", async () => {
    if (delBtn.dataset.armed !== "1") {
      delBtn.dataset.armed = "1";
      delBtn.textContent = "Wirklich löschen";
      setTimeout(() => { delBtn.dataset.armed = "0"; delBtn.textContent = "Löschen"; }, 5000);
      return;
    }
    const stops = ((ctx.trip && ctx.trip.stops) || []).filter((s) => s.id !== editing);
    try {
      await ctx.store.setStops(ctx.code, stops);
      dlg.close();
    } catch (e) {
      err.textContent = "Löschen hat nicht geklappt.";
      err.hidden = false;
    }
  });

  document.querySelectorAll("#dlgStop [data-close]").forEach((b) => {
    b.addEventListener("click", () => dlg.close());
  });

  /* ---- Liste ---- */

  function render() {
    const stops = (ctx.trip && ctx.trip.stops) || [];
    empty.hidden = stops.length > 0;
    list.textContent = "";

    stops.forEach((s, i) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "stop tilt";

      const num = document.createElement("span");
      num.className = "stop-num";
      num.textContent = String(i + 1);
      row.appendChild(num);

      const body = document.createElement("span");
      body.className = "stop-body";

      const name = document.createElement("span");
      name.className = "stop-name";
      name.textContent = s.name;
      body.appendChild(name);

      const bits = [];
      if (s.date) bits.push(formatDate(s.date));
      if (s.place) bits.push(s.place);
      else if (typeof s.lat === "number") bits.push(`${s.lat.toFixed(3)}, ${s.lon.toFixed(3)}`);
      if (bits.length) {
        const meta = document.createElement("span");
        meta.className = "stop-meta";
        meta.textContent = bits.join(" · ");
        body.appendChild(meta);
      }
      if (s.note) {
        const note = document.createElement("span");
        note.className = "stop-note";
        note.textContent = s.note;
        body.appendChild(note);
      }
      row.appendChild(body);

      if (typeof s.lat !== "number") {
        const warn = document.createElement("span");
        warn.className = "stop-flag";
        warn.title = "ohne Ort - erscheint nicht auf der Karte";
        warn.textContent = "kein Ort";
        row.appendChild(warn);
      }

      row.addEventListener("click", () => openDialog(s));
      list.appendChild(row);
    });

    ctx.stagger(list.children, { y: 24, stagger: .06 });
  }

  return { render, open: openDialog };
}

/* Nach Datum sortieren, Stationen ohne Datum hinten anstellen. */
function sortStops(stops) {
  return stops.slice().sort((a, b) => {
    if (a.date && b.date) return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    if (a.date) return -1;
    if (b.date) return 1;
    return 0;
  });
}
