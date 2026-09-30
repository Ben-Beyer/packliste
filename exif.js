/* Minimaler EXIF-Leser: Aufnahmeort und Aufnahmezeit aus einem JPEG.

   Bewusst selbst geschrieben statt einer Fremdbibliothek - gebraucht werden nur
   vier Felder, und so haengt die App an keinem weiteren CDN. */

const TAG_EXIF_IFD = 0x8769;
const TAG_GPS_IFD = 0x8825;
const TAG_DATETIME = 0x0132;          // IFD0, Aenderungsdatum
const TAG_DATETIME_ORIGINAL = 0x9003; // Exif-IFD, Aufnahmedatum
const TAG_ORIENTATION = 0x0112;

const GPS_LAT_REF = 1, GPS_LAT = 2, GPS_LON_REF = 3, GPS_LON = 4, GPS_ALT = 6;

const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

/* Liest die EXIF-Daten aus dem Anfang einer JPEG-Datei.
   Gibt { lat, lon, alt, takenAt, orientation } zurueck - Felder fehlen,
   wenn sie nicht im Bild stehen. Bei allem anderen: null. */
export function readExif(buffer) {
  try {
    const view = new DataView(buffer);
    if (view.byteLength < 4 || view.getUint16(0) !== 0xFFD8) return null; // kein JPEG

    let offset = 2;
    while (offset + 4 <= view.byteLength) {
      const marker = view.getUint16(offset);
      if ((marker & 0xFF00) !== 0xFF00) break;      // aus dem Takt geraten
      if (marker === 0xFFDA || marker === 0xFFD9) break; // ab hier kommen Bilddaten
      const size = view.getUint16(offset + 2);
      if (size < 2) break;

      if (marker === 0xFFE1 && offset + 10 <= view.byteLength) {
        // APP1 - hier steckt EXIF, erkennbar an der Kennung "Exif\0\0"
        if (view.getUint32(offset + 4) === 0x45786966 && view.getUint16(offset + 8) === 0) {
          return parseTiff(view, offset + 10);
        }
      }
      offset += 2 + size;
    }
  } catch (e) { /* kaputtes oder unbekanntes Format - dann eben ohne Ort */ }
  return null;
}

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
        if (Array.isArray(alt) === false && typeof alt === "number") out.alt = Math.round(alt);
      }
    }
  }

  return Object.keys(out).length ? out : null;
}

function readIfd(view, tiff, dir, little) {
  if (dir + 2 > view.byteLength) return null;
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

/* Liest den Wert eines Eintrags. Einzelwerte kommen als Zahl oder String zurueck,
   mehrteilige als Array. */
function value(view, tiff, tag, little) {
  if (!tag) return null;
  const unit = TYPE_SIZE[tag.type];
  if (!unit) return null;
  const bytes = unit * tag.count;
  // Bis vier Byte stehen direkt im Eintrag, sonst zeigt er auf eine Stelle im TIFF
  let at = tag.entry + 8;
  if (bytes > 4) {
    at = tiff + view.getUint32(tag.entry + 8, little);
    if (at + bytes > view.byteLength) return null;
  }

  if (tag.type === 2) { // ASCII
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
