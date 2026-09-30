/* Fotos: hochladen, Galerie, Grossansicht.

   Jedes Bild wird im Browser verkleinert, bevor es rausgeht - einmal klein als
   Vorschau fuer die Galerie, einmal in Ansichtsgroesse. Aus den EXIF-Daten
   kommen Aufnahmeort und -zeit; die Karte baut daraus die Route. */

import { readExif } from "./exif.js";
import { memberKey } from "./store.js";

const THUMB_SIDE = 480;
const THUMB_LIMIT = 70 * 1024;
const FULL_SIDE = 1600;
const FULL_LIMIT = 700 * 1024;   // Firestore laesst 1 MiB pro Dokument zu

export function initPhotos(ctx) {
  const grid = document.getElementById("photoGrid");
  const empty = document.getElementById("photoEmpty");
  const input = document.getElementById("photoInput");
  const addBtn = document.getElementById("photoAddBtn");
  const progress = document.getElementById("photoProgress");
  const progressBar = document.getElementById("photoProgressBar");
  const progressText = document.getElementById("photoProgressText");
  const stats = document.getElementById("photoStats");

  const box = document.getElementById("lightbox");
  const boxImg = document.getElementById("lightboxImg");
  const boxMeta = document.getElementById("lightboxMeta");
  const boxSpin = document.getElementById("lightboxSpin");
  const boxDelete = document.getElementById("lightboxDelete");

  const urls = new Map();      // Foto-ID -> Object-URL des Vorschaubilds
  let fullUrl = null;          // Object-URL des gerade gezeigten grossen Bilds
  let open = null;             // gerade gezeigtes Foto
  let busy = false;

  addBtn.addEventListener("click", () => input.click());
  input.addEventListener("change", async () => {
    const files = [...input.files];
    input.value = "";
    if (files.length) await upload(files);
  });

  /* ---- Hochladen ---- */

  async function upload(files) {
    if (busy) return;
    busy = true;
    addBtn.disabled = true;
    progress.hidden = false;

    let done = 0, failed = 0, noPlace = 0;
    for (const file of files) {
      progressText.textContent = `Foto ${done + 1} von ${files.length}`;
      progressBar.style.width = Math.round(done / files.length * 100) + "%";
      try {
        const prepared = await prepare(file, ctx.user);
        if (prepared.lat === undefined) noPlace++;
        await ctx.store.addPhoto(ctx.code, prepared.payload);
        done++;
      } catch (err) {
        console.warn("Foto abgelehnt:", file.name, err);
        failed++;
      }
    }

    progressBar.style.width = "100%";
    progress.hidden = true;
    addBtn.disabled = false;
    busy = false;

    const parts = [];
    if (done) parts.push(done === 1 ? "1 Foto hochgeladen" : `${done} Fotos hochgeladen`);
    if (noPlace) parts.push(`${noPlace} ohne Ortsangabe`);
    if (failed) parts.push(`${failed} nicht lesbar`);
    ctx.toast(parts.join(" · ") || "Nichts hochgeladen.");
  }

  async function prepare(file, user) {
    if (!/^image\//.test(file.type) && !/\.(jpe?g|png|webp)$/i.test(file.name)) {
      throw new Error("keine Bilddatei");
    }

    // EXIF steht am Dateianfang - es reicht, den vorderen Teil zu lesen
    const head = await file.slice(0, 256 * 1024).arrayBuffer();
    const exif = readExif(head) || {};

    const bitmap = await toBitmap(file);
    try {
      const thumb = await encodeUnder(bitmap, THUMB_SIDE, THUMB_LIMIT, 0.62);
      const full = await encodeUnder(bitmap, FULL_SIDE, FULL_LIMIT, 0.78);

      const meta = {
        name: file.name.slice(0, 120),
        by: user,
        byKey: memberKey(user),
        at: exif.takenAt || file.lastModified || Date.now(),
        hasExifTime: Boolean(exif.takenAt),
        w: full.w,
        h: full.h
      };
      if (typeof exif.lat === "number") { meta.lat = exif.lat; meta.lon = exif.lon; }

      return {
        lat: meta.lat,
        payload: { meta, thumb: thumb.bytes, full: full.bytes }
      };
    } finally {
      if (bitmap.close) bitmap.close();
    }
  }

  /* ---- Galerie ---- */

  function render() {
    const photos = ctx.photos || [];

    // Nicht mehr vorhandene Vorschaubilder freigeben
    const live = new Set(photos.map((p) => p.id));
    for (const [id, url] of urls) {
      if (!live.has(id)) { URL.revokeObjectURL(url); urls.delete(id); }
    }

    empty.hidden = photos.length > 0;
    grid.textContent = "";

    let bytes = 0, located = 0;
    photos.forEach((p) => {
      bytes += p.bytes || 0;
      if (typeof p.lat === "number") located++;

      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "shot";
      cell.setAttribute("aria-label", `Foto von ${p.by || "jemand"} anzeigen`);

      const img = document.createElement("img");
      img.loading = "lazy";
      img.alt = "";
      img.src = thumbUrl(p);
      cell.appendChild(img);

      if (typeof p.lat === "number") {
        const pin = document.createElement("span");
        pin.className = "shot-pin";
        pin.title = "hat einen Aufnahmeort";
        pin.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>';
        cell.appendChild(pin);
      }

      const who = document.createElement("span");
      who.className = "shot-who";
      who.textContent = p.by || "";
      cell.appendChild(who);

      cell.addEventListener("click", () => show(p));
      grid.appendChild(cell);
    });

    const gb = bytes / (1024 * 1024 * 1024);
    const pct = Math.min(100, Math.round(gb * 100));
    stats.textContent = photos.length
      ? `${photos.length} Fotos · ${located} mit Ort · ${formatSize(bytes)} von 1 GB belegt (${pct} %)`
      : "";
    stats.classList.toggle("bad", pct >= 80);
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

  async function show(p) {
    open = p;
    boxImg.removeAttribute("src");
    boxImg.hidden = true;
    boxSpin.hidden = false;
    boxMeta.textContent = "";
    boxMeta.appendChild(metaLine(p));
    boxDelete.hidden = false;
    box.showModal();

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
      ctx.toast("Das Bild liess sich nicht laden.");
    } finally {
      boxSpin.hidden = true;
    }
  }

  function metaLine(p) {
    const wrap = document.createElement("span");
    const who = document.createElement("strong");
    who.textContent = p.by || "jemand";
    wrap.appendChild(who);
    const when = document.createElement("span");
    when.textContent = " · " + new Date(p.at).toLocaleString("de-DE",
      { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    wrap.appendChild(when);
    if (typeof p.lat === "number") {
      const where = document.createElement("span");
      where.className = "dim";
      where.textContent = ` · ${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}`;
      wrap.appendChild(where);
    } else {
      const where = document.createElement("span");
      where.className = "dim";
      where.textContent = " · kein Ort im Bild";
      wrap.appendChild(where);
    }
    return wrap;
  }

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
  document.getElementById("lightboxClose").addEventListener("click", () => box.close());

  return { render, show };
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
  if (!blob) throw new Error("Bild liess sich nicht kodieren");
  return { bytes: new Uint8Array(await blob.arrayBuffer()), w, h };
}

export function formatSize(bytes) {
  if (bytes >= 1024 * 1024 * 1024) return (bytes / 1024 / 1024 / 1024).toFixed(2) + " GB";
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + " MB";
  return Math.round(bytes / 1024) + " KB";
}
