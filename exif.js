/* Aufnahmeort und -zeit aus einer Bilddatei lesen.

   Gelesen werden JPEG (EXIF in APP1), HEIC/HEIF (iPhone-Originale, EXIF steckt
   dort als eigener Eintrag im meta-Kasten) und PNG (eXIf-Block, selten).

   Bewusst selbst geschrieben statt einer Fremdbibliothek - gebraucht werden nur
   vier Felder, und so haengt die App an keinem weiteren CDN.

   Wichtig fuer die Fehlersuche: Sehr viele Bilder haben schlicht keine
   Ortsangabe, weil Google Fotos, WhatsApp und Co. sie beim Ausliefern
   entfernen. Deshalb gibt diese Datei immer einen `grund` zurueck, damit die
   App sagen kann, WARUM ein Foto keinen Ort hat. */

const TAG_EXIF_IFD = 0x8769;
const TAG_GPS_IFD = 0x8825;
const TAG_DATETIME = 0x0132;          // IFD0, Aenderungsdatum
const TAG_DATETIME_ORIGINAL = 0x9003; // Exif-IFD, Aufnahmedatum
const TAG_ORIENTATION = 0x0112;

const GPS_LAT_REF = 1, GPS_LAT = 2, GPS_LON_REF = 3, GPS_LON = 4, GPS_ALT = 6;

const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

const HEAD = 512 * 1024;   // so viel vom Dateianfang reicht fuer die Kopfdaten

/* Warum hat ein Foto keinen Ort? Diese Gruende zeigt die App im Klartext an. */
export const GRUND = {
  OK: "ok",
  KEIN_GPS: "kein-gps",        // Metadaten da, aber ohne Ortsangabe
  KEINE_METADATEN: "keine",    // gar kein Metadaten-Block
  FORMAT: "format",            // Dateiformat ohne Metadaten (z. B. PNG-Screenshot)
  DEFEKT: "defekt"
};

export const GRUND_TEXT = {
  [GRUND.KEIN_GPS]: "Die Datei hat Metadaten, aber keine Ortsangabe. Das passiert, wenn das Bild über Google Fotos, WhatsApp oder einen Messenger kam — die entfernen den Ort.",
  [GRUND.KEINE_METADATEN]: "In der Datei stehen überhaupt keine Metadaten. Meist ein erneut gespeichertes oder heruntergeladenes Bild.",
  [GRUND.FORMAT]: "Dieses Dateiformat trägt keine Ortsangabe (z. B. ein Bildschirmfoto).",
  [GRUND.DEFEKT]: "Die Metadaten ließen sich nicht lesen."
};

/* ------------------------------------------------------------------ */

export async function readPhotoMeta(file) {
  try {
    const head = await slice(file, 0, Math.min(HEAD, file.size));
    const view = new DataView(head);

    if (isJpeg(view)) {
      const at = jpegExifStart(view);
      if (at < 0) return { grund: GRUND.KEINE_METADATEN };
      return done(parseTiff(view, at));
    }

    if (isHeif(view)) {
      const loc = heifExifExtent(view);
      if (!loc) return { grund: GRUND.KEINE_METADATEN };
      const buf = await slice(file, loc.offset, loc.offset + loc.length);
      const v = new DataView(buf);
      if (v.byteLength < 12) return { grund: GRUND.KEINE_METADATEN };
      // Der Eintrag beginnt mit einem 4-Byte-Abstand bis zum TIFF-Kopf
      let start = 4 + v.getUint32(0);
      if (start + 8 <= v.byteLength && v.getUint32(start) === 0x45786966) start += 6;
      if (start + 8 > v.byteLength) return { grund: GRUND.KEINE_METADATEN };
      return done(parseTiff(v, start));
    }

    if (isPng(view)) {
      const at = pngExifStart(view);
      if (at < 0) return { grund: GRUND.FORMAT };
      return done(parseTiff(view, at));
    }

    return { grund: GRUND.FORMAT };
  } catch (e) {
    return { grund: GRUND.DEFEKT };
  }
}

function done(data) {
  if (!data) return { grund: GRUND.KEINE_METADATEN };
  if (typeof data.lat !== "number") return { ...data, grund: GRUND.KEIN_GPS };
  return { ...data, grund: GRUND.OK };
}

function slice(file, from, to) {
  return file.slice(from, to).arrayBuffer();
}

/* ---------------- JPEG ---------------- */

const isJpeg = (v) => v.byteLength > 3 && v.getUint16(0) === 0xFFD8;

function jpegExifStart(view) {
  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset);
    if ((marker & 0xFF00) !== 0xFF00) break;          // aus dem Takt geraten
    if (marker === 0xFFDA || marker === 0xFFD9) break; // ab hier Bilddaten
    const size = view.getUint16(offset + 2);
    if (size < 2) break;
    if (marker === 0xFFE1 && offset + 10 <= view.byteLength
        && view.getUint32(offset + 4) === 0x45786966 && view.getUint16(offset + 8) === 0) {
      return offset + 10;
    }
    offset += 2 + size;
  }
  return -1;
}

/* ---------------- PNG ---------------- */

const isPng = (v) => v.byteLength > 8 && v.getUint32(0) === 0x89504E47;

function pngExifStart(view) {
  let p = 8;
  while (p + 8 <= view.byteLength) {
    const len = view.getUint32(p);
    const type = fourcc(view, p + 4);
    if (type === "eXIf") {
      let start = p + 8;
      if (start + 8 <= view.byteLength && view.getUint32(start) === 0x45786966) start += 6;
      return start;
    }
    if (type === "IDAT" || type === "IEND") break;
    p += 12 + len;   // Laenge + Typ + Daten + Pruefsumme
  }
  return -1;
}

/* ---------------- HEIC / HEIF ----------------
   Der Aufbau ist eine Kiste voller Kisten. Gesucht wird der Eintrag vom Typ
   "Exif": `iinf` sagt, welche Eintragsnummer er hat, `iloc` sagt, wo in der
   Datei er liegt. */

function isHeif(v) {
  if (v.byteLength < 12) return false;
  if (fourcc(v, 4) !== "ftyp") return false;
  const brands = ["heic", "heix", "hevc", "heim", "heis", "hevm", "mif1", "msf1", "avif", "avis"];
  if (brands.includes(fourcc(v, 8))) return true;
  // sonst die Liste der kompatiblen Marken durchsehen
  const size = v.getUint32(0);
  for (let p = 16; p + 4 <= Math.min(size, v.byteLength); p += 4) {
    if (brands.includes(fourcc(v, p))) return true;
  }
  return false;
}

function heifExifExtent(view) {
  let meta = null;
  walk(view, 0, view.byteLength, (type, from, to) => {
    if (type === "meta") { meta = { from: from + 4, to }; return false; }  // FullBox: 4 Byte Version/Flags
  });
  if (!meta) return null;

  let exifId = -1;
  let extent = null;

  walk(view, meta.from, meta.to, (type, from, to) => {
    if (type === "iinf") exifId = findExifItemId(view, from, to);
  });
  if (exifId < 0) return null;

  walk(view, meta.from, meta.to, (type, from, to) => {
    if (type === "iloc") extent = findItemExtent(view, from, to, exifId);
  });
  return extent;
}

function walk(view, start, end, cb) {
  let p = start;
  while (p + 8 <= end) {
    let size = view.getUint32(p);
    const type = fourcc(view, p + 4);
    let head = 8;
    if (size === 1) {
      if (p + 16 > end) break;
      size = view.getUint32(p + 8) * 4294967296 + view.getUint32(p + 12);
      head = 16;
    } else if (size === 0) {
      size = end - p;
    }
    if (size < head || p + size > end + 8) break;
    if (cb(type, p + head, Math.min(p + size, end)) === false) return;
    p += size;
  }
}

function findExifItemId(view, from, to) {
  const version = view.getUint8(from);
  let p = from + 4;
  let count;
  if (version === 0) { count = view.getUint16(p); p += 2; }
  else { count = view.getUint32(p); p += 4; }

  let found = -1;
  walk(view, p, to, (type, f) => {
    if (type !== "infe") return;
    const v = view.getUint8(f);
    let q = f + 4;
    let id;
    if (v < 3) { id = view.getUint16(q); q += 2; }
    else { id = view.getUint32(q); q += 4; }
    q += 2;                       // protection_index
    if (v >= 2 && fourcc(view, q) === "Exif") { found = id; return false; }
  });
  return found;
}

function findItemExtent(view, from, to, wantedId) {
  const version = view.getUint8(from);
  let p = from + 4;

  const b1 = view.getUint8(p++), b2 = view.getUint8(p++);
  const offsetSize = b1 >> 4, lengthSize = b1 & 15;
  const baseSize = b2 >> 4, indexSize = version >= 1 ? (b2 & 15) : 0;

  let count;
  if (version < 2) { count = view.getUint16(p); p += 2; }
  else { count = view.getUint32(p); p += 4; }

  for (let i = 0; i < count && p < to; i++) {
    let id;
    if (version < 2) { id = view.getUint16(p); p += 2; }
    else { id = view.getUint32(p); p += 4; }
    if (version === 1 || version === 2) p += 2;   // construction_method
    p += 2;                                       // data_reference_index
    const base = readInt(view, p, baseSize); p += baseSize;
    const extents = view.getUint16(p); p += 2;

    for (let e = 0; e < extents; e++) {
      if (indexSize) p += indexSize;
      const off = readInt(view, p, offsetSize); p += offsetSize;
      const len = readInt(view, p, lengthSize); p += lengthSize;
      if (id === wantedId && e === 0) return { offset: base + off, length: len };
    }
  }
  return null;
}

function readInt(view, p, size) {
  if (size === 0) return 0;
  if (size === 4) return view.getUint32(p);
  if (size === 8) return view.getUint32(p) * 4294967296 + view.getUint32(p + 4);
  if (size === 2) return view.getUint16(p);
  if (size === 1) return view.getUint8(p);
  return 0;
}

function fourcc(view, p) {
  if (p + 4 > view.byteLength) return "";
  return String.fromCharCode(view.getUint8(p), view.getUint8(p + 1), view.getUint8(p + 2), view.getUint8(p + 3));
}

/* ---------------- TIFF / EXIF ---------------- */

function parseTiff(view, tiff) {
  if (tiff + 8 > view.byteLength) return null;
  const order = view.getUint16(tiff);
  let little;
  if (order === 0x4949) little = true;
  else if (order === 0x4D4D) little = false;
  else return null;
  if (view.getUint16(tiff + 2, little) !== 0x002A) return null;

  const ifd0 = readIfd(view, tiff, tiff + view.getUint32(tiff + 4, little), little);
  if (!ifd0) return null;

  const out = {};

  const orientation = value(view, tiff, ifd0.get(TAG_ORIENTATION), little);
  if (orientation) out.orientation = Number(orientation);

  // Aufnahmezeit: erst das echte Aufnahmedatum, sonst das Aenderungsdatum
  const exifPtr = value(view, tiff, ifd0.get(TAG_EXIF_IFD), little);
  let stamp = null;
  if (exifPtr) {
    const exifIfd = readIfd(view, tiff, tiff + Number(exifPtr), little);
    if (exifIfd) stamp = value(view, tiff, exifIfd.get(TAG_DATETIME_ORIGINAL), little);
  }
  if (!stamp) stamp = value(view, tiff, ifd0.get(TAG_DATETIME), little);
  const taken = parseStamp(stamp);
  if (taken) out.takenAt = taken;

  // Ort
  const gpsPtr = value(view, tiff, ifd0.get(TAG_GPS_IFD), little);
  if (gpsPtr) {
    const gps = readIfd(view, tiff, tiff + Number(gpsPtr), little);
    if (gps) {
      const lat = toDegrees(value(view, tiff, gps.get(GPS_LAT), little), value(view, tiff, gps.get(GPS_LAT_REF), little), "S");
      const lon = toDegrees(value(view, tiff, gps.get(GPS_LON), little), value(view, tiff, gps.get(GPS_LON_REF), little), "W");
      if (lat !== null && lon !== null && (lat !== 0 || lon !== 0)) {
        out.lat = lat;
        out.lon = lon;
        const alt = value(view, tiff, gps.get(GPS_ALT), little);
        if (typeof alt === "number") out.alt = Math.round(alt);
      }
    }
  }

  return out;
}

function readIfd(view, tiff, dir, little) {
  if (dir + 2 > view.byteLength || dir < tiff) return null;
  const count = view.getUint16(dir, little);
  if (dir + 2 + count * 12 > view.byteLength) return null;
  const tags = new Map();
  for (let i = 0; i < count; i++) {
    const entry = dir + 2 + i * 12;
    tags.set(view.getUint16(entry, little), {
      type: view.getUint16(entry + 2, little),
      count: view.getUint32(entry + 4, little),
      entry
    });
  }
  return tags;
}

/* Liest den Wert eines Eintrags. Einzelwerte kommen als Zahl oder Text zurueck,
   mehrteilige als Liste. */
function value(view, tiff, tag, little) {
  if (!tag) return null;
  const unit = TYPE_SIZE[tag.type];
  if (!unit) return null;
  const bytes = unit * tag.count;
  // Bis vier Byte stehen direkt im Eintrag, sonst zeigt er auf eine Stelle im TIFF
  let at = tag.entry + 8;
  if (bytes > 4) {
    at = tiff + view.getUint32(tag.entry + 8, little);
    if (at < 0 || at + bytes > view.byteLength) return null;
  }

  if (tag.type === 2) {
    let s = "";
    for (let i = 0; i < tag.count; i++) {
      const c = view.getUint8(at + i);
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s;
  }

  const read = (i) => {
    const p = at + i * unit;
    switch (tag.type) {
      case 1: case 7: return view.getUint8(p);
      case 3: return view.getUint16(p, little);
      case 4: return view.getUint32(p, little);
      case 9: return view.getInt32(p, little);
      case 5: {
        const den = view.getUint32(p + 4, little);
        return den === 0 ? 0 : view.getUint32(p, little) / den;
      }
      case 10: {
        const den = view.getInt32(p + 4, little);
        return den === 0 ? 0 : view.getInt32(p, little) / den;
      }
      default: return 0;
    }
  };

  if (tag.count === 1) return read(0);
  const arr = [];
  for (let i = 0; i < tag.count; i++) arr.push(read(i));
  return arr;
}

/* Grad, Minuten, Sekunden -> Dezimalgrad */
function toDegrees(dms, ref, negativeRef) {
  if (!Array.isArray(dms) || dms.length < 2) return null;
  const [d = 0, m = 0, s = 0] = dms;
  let deg = d + m / 60 + s / 3600;
  if (!isFinite(deg)) return null;
  if (typeof ref === "string" && ref.trim().toUpperCase().startsWith(negativeRef)) deg = -deg;
  if (Math.abs(deg) > 180) return null;
  return Math.round(deg * 1e6) / 1e6;
}

/* "2026:09:14 17:32:08" -> Zeitstempel. EXIF kennt keine Zeitzone,
   die Zeit gilt also als Ortszeit der Kamera. */
function parseStamp(s) {
  if (typeof s !== "string") return null;
  const m = s.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  const t = d.getTime();
  if (!isFinite(t) || +m[1] < 1990) return null;
  return t;
}
