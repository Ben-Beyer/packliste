/* Fotos: hochladen, Ordner je Person, Galerie, Grossansicht, Ort nachtragen.

   Jedes Bild wird im Browser verkleinert, bevor es rausgeht - einmal klein als
   Vorschau fuer die Galerie, einmal in Ansichtsgroesse.

   Aufnahmeort und -zeit kommen aus den Metadaten (exif.js). Sehr viele Bilder
   haben keinen Ort, weil Google Fotos, WhatsApp und Co. ihn beim Ausliefern
   entfernen. Deshalb sagt die App pro Foto, woran es liegt, und man kann den
   Ort von Hand nachtragen - einzeln oder fuer einen ganzen Ordner. */

import { readPhotoMeta, GRUND, GRUND_TEXT } from "./exif.js";
import { memberKey } from "./store.js";

const THUMB_SIDE = 480;
const THUMB_LIMIT = 70 * 1024;
const FULL_SIDE = 1600;
const FULL_LIMIT = 700 * 1024;   // Firestore laesst 1 MiB pro Dokument zu

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const $ = (id) => document.getElementById(id);

export function initPhotos(ctx) {
  const albumGrid = $("albumGrid");
  const albumView = $("albumView");
  const gridView = $("gridView");
  const grid = $("photoGrid");
  const empty = $("photoEmpty");
  const input = $("photoInput");
  const addBtn = $("photoAddBtn");
  const progress = $("photoProgress");
  const progressBar = $("photoProgressBar");
  const progressText = $("photoProgressText");
  const stats = $("photoStats");
  const title = $("photoTitle");
  const back = $("photoBack");
  const placeAllBtn = $("placeAllBtn");
  const gridActions = $("gridActions");

  const box = $("lightbox");
  const boxImg = $("lightboxImg");
  const boxMeta = $("lightboxMeta");
  const boxSpin = $("lightboxSpin");
  const boxDelete = $("lightboxDelete");
  const boxPlace = $("lightboxPlace");
  const boxPlaceBtn = $("lightboxPlaceBtn");

  const urls = new Map();      // Foto-ID -> Object-URL des Vorschaubilds
  let fullUrl = null;
  let open = null;             // gerade gezeigtes Foto
  let busy = false;
  let folder = null;           // null = Ordneruebersicht, sonst Ordner-Schluessel

  addBtn.addEventListener("click", () => input.click());
  input.addEventListener("change", async () => {
    const files = [...input.files];
    input.value = "";
    if (files.length) await upload(files);
  });
  back.addEventListener("click", () => { folder = null; render(); });

  /* ---- Hochladen ---- */

  async function upload(files) {
    if (busy) return;
    busy = true;
    addBtn.disabled = true;
    progress.hidden = false;
    progressBar.style.width = "0%";

    let done = 0;
    const gruende = {};
    let erstesThumb = null;

    for (const file of files) {
      progressText.textContent = `Foto ${done + 1} von ${files.length} …`;
      progressBar.style.width = Math.round(done / files.length * 100) + "%";
      try {
        const fertig = await prepare(file, ctx.user);
        await ctx.store.addPhoto(ctx.code, fertig.payload);
        if (!erstesThumb) erstesThumb = fertig.payload.thumb;
        gruende[fertig.grund] = (gruende[fertig.grund] || 0) + 1;
        done++;
      } catch (err) {
        const schluessel = err && err.code === "heic" ? "heic" : "fehler";
        gruende[schluessel] = (gruende[schluessel] || 0) + 1;
      }
    }

    // Titelbild der Reise setzen, wenn noch keins da ist
    if (erstesThumb && ctx.trip && !ctx.trip.cover) {
      try { await ctx.store.setCover(ctx.code, erstesThumb); } catch (e) {}
    }

    progressBar.style.width = "100%";
    progress.hidden = true;
    addBtn.disabled = false;
    busy = false;

    const teile = [];
    if (done) teile.push(done === 1 ? "1 Foto hochgeladen" : `${done} Fotos hochgeladen`);
    const ohneOrt = (gruende[GRUND.KEIN_GPS] || 0) + (gruende[GRUND.KEINE_METADATEN] || 0) + (gruende[GRUND.FORMAT] || 0);
    if (ohneOrt) teile.push(`${ohneOrt} ohne Ort`);
    if (gruende.heic) teile.push(`${gruende.heic} × HEIC, hier nicht anzeigbar`);
    if (gruende.fehler) teile.push(`${gruende.fehler} nicht lesbar`);
    ctx.toast(teile.join(" · ") || "Nichts hochgeladen.");
  }

  async function prepare(file, user) {
    const istHeic = /\.(heic|heif)$/i.test(file.name) || /hei[cf]/i.test(file.type || "");
    const meta0 = await readPhotoMeta(file);

    let bitmap;
    try {
      bitmap = await toBitmap(file);
    } catch (e) {
      const err = new Error("nicht lesbar");
      if (istHeic) err.code = "heic";
      throw err;
    }

    try {
      const thumb = await encodeUnder(bitmap, THUMB_SIDE, THUMB_LIMIT, 0.62);
      const full = await encodeUnder(bitmap, FULL_SIDE, FULL_LIMIT, 0.78);

      const meta = {
        name: file.name.slice(0, 120),
        by: user,
        byKey: memberKey(user),
        at: meta0.takenAt || file.lastModified || Date.now(),
        hasExifTime: Boolean(meta0.takenAt),
        grund: meta0.grund || GRUND.DEFEKT,
        w: full.w,
        h: full.h
      };
      if (typeof meta0.lat === "number") { meta.lat = meta0.lat; meta.lon = meta0.lon; }

      return { grund: meta.grund, payload: { meta, thumb: thumb.bytes, full: full.bytes } };
    } finally {
      if (bitmap.close) bitmap.close();
    }
  }

  /* ---- Ordner ---- */

  function ordner() {
    const liste = [];
    const nach = new Map();
    Object.values((ctx.trip && ctx.trip.members) || {}).forEach((m) => {
      nach.set(memberKey(m.name), { key: memberKey(m.name), name: m.name, fotos: [] });
    });
    (ctx.photos || []).forEach((p) => {
      const k = p.byKey || memberKey(p.by || "gast");
      if (!nach.has(k)) nach.set(k, { key: k, name: p.by || "Unbekannt", fotos: [] });
      nach.get(k).fotos.push(p);
    });
    nach.forEach((v) => liste.push(v));
    liste.sort((a, b) => b.fotos.length - a.fotos.length || a.name.localeCompare(b.name, "de"));
    return liste;
  }

  function fotosVon(key) {
    if (key === "__alle") return ctx.photos || [];
    if (key === "__ohne") return (ctx.photos || []).filter((p) => typeof p.lat !== "number");
    return (ctx.photos || []).filter((p) => (p.byKey || memberKey(p.by || "gast")) === key);
  }

  function ordnerName(key) {
    if (key === "__alle") return "Alle Fotos";
    if (key === "__ohne") return "Ohne Ort";
    const o = ordner().find((x) => x.key === key);
    return o ? o.name : "Ordner";
  }

  /* ---- Anzeige ---- */

  function render() {
    const photos = ctx.photos || [];

    // Nicht mehr vorhandene Vorschaubilder freigeben
    const live = new Set(photos.map((p) => p.id));
    for (const [id, url] of urls) {
      if (!live.has(id)) { URL.revokeObjectURL(url); urls.delete(id); }
    }

    let bytes = 0, mitOrt = 0;
    const gruende = {};
    photos.forEach((p) => {
      bytes += p.bytes || 0;
      if (typeof p.lat === "number") mitOrt++;
      else gruende[p.grund || GRUND.KEIN_GPS] = (gruende[p.grund || GRUND.KEIN_GPS] || 0) + 1;
    });

    const pct = Math.min(100, Math.round(bytes / (1024 * 1024 * 1024) * 100));
    stats.textContent = photos.length
      ? `${photos.length === 1 ? "1 Foto" : photos.length + " Fotos"} · ${mitOrt} mit Ort · ${formatSize(bytes)} von 1 GB belegt (${pct} %)`
      : "";
    stats.classList.toggle("bad", pct >= 80);

    empty.hidden = photos.length > 0 || folder !== null;

    if (folder === null) {
      albumView.hidden = false;
      gridView.hidden = true;
      title.textContent = "Fotos";
      zeichneOrdner(photos, gruende);
    } else {
      albumView.hidden = true;
      gridView.hidden = false;
      title.textContent = ordnerName(folder);
      zeichneGitter(fotosVon(folder));
    }
  }

  function zeichneOrdner(photos, gruende) {
    albumGrid.textContent = "";
    if (!photos.length && !ordner().length) return;

    const ohneOrt = photos.filter((p) => typeof p.lat !== "number");

    if (photos.length) {
      albumGrid.appendChild(ordnerKarte({ key: "__alle", name: "Alle Fotos", fotos: photos, klasse: "alle" }));
    }
    if (ohneOrt.length) {
      albumGrid.appendChild(ordnerKarte({
        key: "__ohne", name: "Ohne Ort", fotos: ohneOrt, klasse: "ohne",
        hinweis: hauptGrund(gruende)
      }));
    }
    ordner().forEach((o) => albumGrid.appendChild(ordnerKarte(o)));
    ctx.stagger(albumGrid.children, { y: 40, scale: .92, stagger: .07 });
  }

  function hauptGrund(gruende) {
    let best = null, n = 0;
    Object.entries(gruende).forEach(([k, v]) => { if (v > n) { n = v; best = k; } });
    return best && GRUND_TEXT[best] ? GRUND_TEXT[best] : "";
  }

  function ordnerKarte(o) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "album tilt " + (o.klasse || "");

    const mosaik = document.createElement("span");
    mosaik.className = "album-mosaik";
    const vier = o.fotos.slice(-4);
    if (!vier.length) {
      mosaik.classList.add("leer");
      mosaik.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="6" width="18" height="14" rx="2"/><path d="M8 6l1.5-2h5L16 6"/><circle cx="12" cy="13" r="3.2"/></svg>';
    } else {
      vier.forEach((p) => {
        const img = document.createElement("img");
        img.loading = "lazy";
        img.alt = "";
        img.src = thumbUrl(p);
        mosaik.appendChild(img);
      });
      if (vier.length === 1) mosaik.classList.add("eins");
      else if (vier.length < 4) mosaik.classList.add("zwei");
    }
    card.appendChild(mosaik);

    const foot = document.createElement("span");
    foot.className = "album-foot";
    if (!o.klasse) foot.appendChild(ctx.avatar(o.name));
    const txt = document.createElement("span");
    txt.className = "album-text";
    const n = document.createElement("strong");
    n.textContent = o.name;
    const c = document.createElement("small");
    c.textContent = o.fotos.length === 1 ? "1 Foto" : o.fotos.length + " Fotos";
    txt.appendChild(n); txt.appendChild(c);
    foot.appendChild(txt);
    card.appendChild(foot);

    if (o.hinweis) {
      const h = document.createElement("span");
      h.className = "album-hinweis";
      h.textContent = o.hinweis;
      card.appendChild(h);
    }

    card.addEventListener("click", () => { folder = o.key; render(); });
    return card;
  }

  function zeichneGitter(photos) {
    grid.textContent = "";
    gridActions.hidden = folder !== "__ohne" || !photos.length;

    photos.forEach((p) => {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "shot";
      cell.dataset.id = p.id;
      cell.setAttribute("aria-label", `Foto von ${p.by || "jemand"} anzeigen`);

      const img = document.createElement("img");
      img.loading = "lazy";
      img.alt = "";
      img.src = thumbUrl(p);
      cell.appendChild(img);

      const marke = document.createElement("span");
      if (typeof p.lat === "number") {
        marke.className = "shot-pin" + (p.placedBy ? " hand" : "");
        marke.title = p.placedBy ? "Ort von Hand gesetzt" : "Ort aus dem Bild";
        marke.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>';
      } else {
        marke.className = "shot-pin fehlt";
        marke.title = "kein Ort hinterlegt";
        marke.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M4 4l16 16"/><path d="M12 21s7-8 7-13a7 7 0 0 0-11.6-5.4"/></svg>';
      }
      cell.appendChild(marke);

      const who = document.createElement("span");
      who.className = "shot-who";
      who.textContent = p.by || "";
      cell.appendChild(who);

      cell.addEventListener("click", () => show(p, cell));
      grid.appendChild(cell);
    });

    ctx.stagger(grid.children, { y: 26, scale: .8, stagger: .025 });
  }

  function thumbUrl(p) {
    let url = urls.get(p.id);
    if (!url) {
      url = URL.createObjectURL(new Blob([p.thumb.toUint8Array()], { type: "image/jpeg" }));
      urls.set(p.id, url);
    }
    return url;
  }

  /* ---- Grossansicht ---- */

  async function show(p, ausElement) {
    open = p;
    boxImg.removeAttribute("src");
    boxImg.hidden = true;
    boxSpin.hidden = false;
    zeigeMeta(p);
    boxDelete.hidden = false;
    ctx.openLightbox(box, ausElement);

    try {
      const bytes = await ctx.store.loadPhotoData(ctx.code, p.id);
      if (open !== p) return;                 // inzwischen weitergeblättert
      if (fullUrl) URL.revokeObjectURL(fullUrl);
      if (!bytes) throw new Error("keine Bilddaten");
      fullUrl = URL.createObjectURL(new Blob([bytes], { type: "image/jpeg" }));
      boxImg.src = fullUrl;
      boxImg.hidden = false;
    } catch (err) {
      boxImg.hidden = true;
      ctx.toast("Das Bild ließ sich nicht laden.");
    } finally {
      boxSpin.hidden = true;
    }
  }

  function zeigeMeta(p) {
    boxMeta.textContent = "";
    const who = document.createElement("strong");
    who.textContent = p.by || "jemand";
    boxMeta.appendChild(who);
    const when = document.createElement("span");
    when.textContent = " · " + new Date(p.at).toLocaleString("de-DE",
      { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
      + (p.hasExifTime === false ? " (Dateidatum)" : "");
    boxMeta.appendChild(when);

    boxPlace.textContent = "";
    if (typeof p.lat === "number") {
      const ort = document.createElement("span");
      ort.className = "lb-ort";
      ort.textContent = (p.placeName || `${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}`)
        + (p.placedBy ? " · von Hand gesetzt" : "");
      boxPlace.appendChild(ort);
      boxPlaceBtn.textContent = "Ort ändern";
    } else {
      const warum = document.createElement("span");
      warum.className = "lb-warum";
      warum.textContent = GRUND_TEXT[p.grund] || GRUND_TEXT[GRUND.KEIN_GPS];
      boxPlace.appendChild(warum);
      boxPlaceBtn.textContent = "Ort setzen";
    }
  }

  boxPlaceBtn.addEventListener("click", () => {
    if (!open) return;
    ortDialog([open], (place) => {
      if (open) zeigeMeta({ ...open, ...(place || { lat: undefined, lon: undefined }), placedBy: place ? ctx.user : null });
    });
  });

  placeAllBtn.addEventListener("click", () => {
    const liste = fotosVon("__ohne");
    if (liste.length) ortDialog(liste);
  });

  boxDelete.addEventListener("click", async () => {
    if (!open) return;
    const p = open;
    if (boxDelete.dataset.armed !== "1") {
      boxDelete.dataset.armed = "1";
      boxDelete.textContent = "Wirklich löschen";
      setTimeout(() => {
        boxDelete.dataset.armed = "0";
        boxDelete.textContent = "Löschen";
      }, 5000);
      return;
    }
    boxDelete.dataset.armed = "0";
    boxDelete.textContent = "Löschen";
    box.close();
    try {
      await ctx.store.deletePhoto(ctx.code, p.id);
      ctx.toast("Foto gelöscht.");
    } catch (err) {
      ctx.toast("Löschen hat nicht geklappt.");
    }
  });

  box.addEventListener("close", () => {
    open = null;
    boxImg.removeAttribute("src");
    if (fullUrl) { URL.revokeObjectURL(fullUrl); fullUrl = null; }
  });
  $("lightboxClose").addEventListener("click", () => box.close());

  /* ---- Ort nachtragen ---- */

  const dlg = $("dlgPlace");
  const feld = $("placeQuery");
  const suchen = $("placeSearch");
  const treffer = $("placeResults");
  const stationen = $("placeStops");
  const fehler = $("placeErr");
  const zahl = $("placeCount");
  const entfernen = $("placeClear");
  let ziele = [];
  let danachTun = null;

  function ortDialog(liste, danach) {
    ziele = liste;
    danachTun = danach || null;
    zahl.textContent = liste.length === 1
      ? "Für dieses Foto"
      : `Für ${liste.length} Fotos ohne Ort`;
    feld.value = "";
    treffer.textContent = "";
    treffer.hidden = true;
    fehler.hidden = true;
    entfernen.hidden = !(liste.length === 1 && typeof liste[0].lat === "number");

    stationen.textContent = "";
    const mitOrt = ((ctx.trip && ctx.trip.stops) || []).filter((s) => typeof s.lat === "number");
    stationen.parentElement.hidden = !mitOrt.length;
    mitOrt.forEach((s) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "hit";
      b.textContent = s.name + (s.place ? " — " + s.place : "");
      b.addEventListener("click", () => uebernehmen({ lat: s.lat, lon: s.lon, placeName: s.place || s.name }));
      stationen.appendChild(b);
    });

    dlg.showModal();
  }

  suchen.addEventListener("click", async () => {
    const q = feld.value.trim();
    if (q.length < 3) {
      fehler.textContent = "Mindestens drei Zeichen zum Suchen.";
      fehler.hidden = false;
      return;
    }
    fehler.hidden = true;
    suchen.disabled = true;
    suchen.textContent = "Sucht …";
    treffer.textContent = "";
    treffer.hidden = true;
    try {
      const res = await fetch(`${NOMINATIM}?format=jsonv2&limit=5&accept-language=de&q=${encodeURIComponent(q)}`,
        { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error("nicht erreichbar");
      const hits = await res.json();
      if (!hits.length) {
        fehler.textContent = "Dazu wurde nichts gefunden.";
        fehler.hidden = false;
        return;
      }
      hits.forEach((hit) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "hit";
        b.textContent = hit.display_name;
        b.addEventListener("click", () => uebernehmen({
          lat: Math.round(parseFloat(hit.lat) * 1e6) / 1e6,
          lon: Math.round(parseFloat(hit.lon) * 1e6) / 1e6,
          placeName: hit.display_name.split(",").slice(0, 3).join(",").trim()
        }));
        treffer.appendChild(b);
      });
      treffer.hidden = false;
    } catch (e) {
      fehler.textContent = "Die Ortssuche war nicht erreichbar.";
      fehler.hidden = false;
    } finally {
      suchen.disabled = false;
      suchen.textContent = "Suchen";
    }
  });

  entfernen.addEventListener("click", () => uebernehmen(null));

  async function uebernehmen(place) {
    const liste = ziele;
    dlg.close();
    let n = 0;
    for (const p of liste) {
      try { await ctx.store.placePhoto(ctx.code, p.id, place, ctx.user); n++; }
      catch (e) { /* weiter mit dem naechsten */ }
    }
    if (danachTun) danachTun(place);
    ctx.toast(place
      ? (n === 1 ? "Ort gesetzt." : `${n} Fotos verortet.`)
      : "Ort entfernt.");
  }

  document.querySelectorAll("#dlgPlace [data-close]").forEach((b) =>
    b.addEventListener("click", () => dlg.close()));

  return {
    render,
    show,
    zurueckZuOrdnern: () => { folder = null; render(); }
  };
}

/* ---- Bildverarbeitung ---- */

async function toBitmap(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch (e) {
    // Aeltere Browser kennen die Option nicht - dann ueber ein <img>, das der
    // Browser von sich aus richtig herum dreht.
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = "async";
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = () => rej(new Error("Bild nicht lesbar"));
        img.src = url;
      });
      return await createImageBitmap(img);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/* Verkleinert und komprimiert, bis das Ergebnis unter das Limit passt. */
async function encodeUnder(bitmap, maxSide, limit, startQuality) {
  let quality = startQuality;
  let side = maxSide;
  let last = null;

  for (let attempt = 0; attempt < 7; attempt++) {
    last = await draw(bitmap, side, quality);
    if (last.bytes.byteLength <= limit) return last;
    if (quality > 0.42) quality -= 0.12;
    else { quality = 0.6; side = Math.round(side * 0.75); }
  }
  return last;   // Notnagel: das Kleinste, was herauskam
}

async function draw(bitmap, maxSide, quality) {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext("2d");
  c.drawImage(bitmap, 0, 0, w, h);

  const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
  if (!blob) throw new Error("Bild ließ sich nicht kodieren");
  return { bytes: new Uint8Array(await blob.arrayBuffer()), w, h };
}

export function formatSize(bytes) {
  if (bytes >= 1024 * 1024 * 1024) return (bytes / 1024 / 1024 / 1024).toFixed(2) + " GB";
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + " MB";
  return Math.round(bytes / 1024) + " KB";
}
