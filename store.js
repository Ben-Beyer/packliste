/* Speicher-Schicht. Alles liegt in Firestore, ein Dokument pro Reise.

   Wer eine Reise sehen will, braucht ihren Code - auflisten kann sie niemand
   (Regel `allow list: if false`). Der Code ist damit der Schluessel, genau wie
   bei einem geteilten Link.

   Fotos liegen ebenfalls in Firestore statt in Firebase Storage: Storage
   verlangt seit Oktober 2024 den Blaze-Tarif mit hinterlegter Kreditkarte,
   Firestore bleibt im kostenlosen Spark-Tarif. Ein Dokument fasst maximal
   1 MiB, deshalb wird jedes Bild vor dem Hochladen verkleinert, und das grosse
   Bild liegt getrennt vom Vorschaubild - so bleibt die Galerie leicht. */

import { FIREBASE_CONFIG } from "./firebase-config.js";

const SDK = "https://www.gstatic.com/firebasejs/11.6.0";
const KEY_TRIPS = "reisebuddy.v1.mytrips";
const KEY_TRIPS_ALT = "packliste.v2.mytrips";   // Liste aus der Packlisten-Fassung

/* Ohne 0/O/1/I - der Code wird abgetippt und vorgelesen. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newCode(len = 8) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/* Bereinigter Schluessel pro Person. Umlaute werden umgeschrieben wie in
   data.js - beides muss gleich bleiben, sonst zerfaellt jemand in zwei Leute. */
export function memberKey(name) {
  return String(name).toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]/g, "") || "gast";
}

/* Haken werden als Map Person -> {by, at} abgelegt, damit bei Positionen, die
   jeder einzeln packt, mehrere nebeneinander abhaken koennen. Ganz fruehe
   Reisen haben dort noch flach {by, at} stehen - das wird hier geradegebogen. */
export function normalizeMarks(raw) {
  if (!raw) return {};
  if (typeof raw.by === "string") return { [memberKey(raw.by)]: { by: raw.by, at: raw.at } };
  const out = {};
  Object.keys(raw).forEach((k) => { if (raw[k] && typeof raw[k].by === "string") out[k] = raw[k]; });
  return out;
}

/* ---- Welche Reisen auf diesem Geraet in der Liste stehen ---- */

export function myTrips() {
  const read = (key) => {
    try {
      const raw = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(raw) ? raw.filter((c) => typeof c === "string") : [];
    } catch (e) { return []; }
  };
  const list = read(KEY_TRIPS);
  // Reisen aus der alten Packlisten-Fassung einmalig uebernehmen
  const old = read(KEY_TRIPS_ALT).filter((c) => !list.includes(c));
  if (old.length) {
    const merged = list.concat(old);
    try { localStorage.setItem(KEY_TRIPS, JSON.stringify(merged)); } catch (e) {}
    return merged;
  }
  return list;
}

export function rememberTrip(code) {
  const list = myTrips().filter((c) => c !== code);
  list.unshift(code);
  try { localStorage.setItem(KEY_TRIPS, JSON.stringify(list)); } catch (e) {}
}

export function forgetTrip(code) {
  try { localStorage.setItem(KEY_TRIPS, JSON.stringify(myTrips().filter((c) => c !== code))); } catch (e) {}
}

export function hasFirebase() {
  return Boolean(FIREBASE_CONFIG && FIREBASE_CONFIG.projectId && FIREBASE_CONFIG.apiKey);
}

/* ---- Firestore ---- */

export async function createStore() {
  if (!hasFirebase()) {
    throw new Error("In firebase-config.js stehen keine Zugangsdaten.");
  }

  const [{ initializeApp }, auth, fs] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-firestore.js`)
  ]);

  const app = initializeApp(FIREBASE_CONFIG);

  // Lokaler Cache: die App startet offline aus dem Cache, Schreibvorgaenge ohne
  // Netz stehen in der Warteschlange und gehen spaeter raus.
  const db = fs.initializeFirestore(app, {
    localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() })
  });

  // Anonyme Anmeldung, damit die Firestore-Regeln fremde Zugriffe abweisen
  // koennen. Kein Login-Dialog, laeuft im Hintergrund.
  const cred = await auth.signInAnonymously(auth.getAuth(app));

  const tripRef = (code) => fs.doc(db, "trips", code);
  const photosRef = (code) => fs.collection(db, "trips", code, "photos");
  const photoRef = (code, id) => fs.doc(db, "trips", code, "photos", id);
  const dataRef = (code, id) => fs.doc(db, "trips", code, "photoData", id);

  const clean = (snap) => (snap.exists()
    ? { code: snap.id, checks: {}, members: {}, stops: [], sections: [], ...snap.data() }
    : null);

  return {
    uid: cred.user.uid,
    Bytes: fs.Bytes,

    /* ---- Reise ---- */

    async createTrip({ name, start, end, sections, by }) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = newCode();
        if ((await fs.getDoc(tripRef(code))).exists()) continue;
        await fs.setDoc(tripRef(code), {
          name,
          start: start || "",
          end: end || "",
          sections,
          stops: [],
          checks: {},
          members: { [memberKey(by)]: { name: by, at: Date.now() } },
          createdAt: Date.now(),
          createdBy: by
        });
        return code;
      }
      throw new Error("Es liess sich kein freier Code finden. Bitte nochmal versuchen.");
    },

    async getTrip(code) { return clean(await fs.getDoc(tripRef(code))); },

    watchTrip(code, cb) {
      return fs.onSnapshot(tripRef(code), (snap) => cb(clean(snap)), (err) => cb(null, err));
    },

    async updateTrip(code, patch) { await fs.updateDoc(tripRef(code), patch); },

    async addMember(code, name) {
      await fs.updateDoc(tripRef(code), { ["members." + memberKey(name)]: { name, at: Date.now() } });
    },

    /* ---- Packliste ---- */

    async setMark(code, itemId, mkey, by) {
      // Punktpfad bis auf die Person hinunter: Zwei Leute, die gleichzeitig
      // dieselbe Position fuer sich abhaken, ueberschreiben sich nicht.
      await fs.updateDoc(tripRef(code), {
        [`checks.${itemId}.${mkey}`]: by ? { by, at: Date.now() } : fs.deleteField()
      });
    },

    async setMarks(code, itemId, marks) {
      await fs.updateDoc(tripRef(code), {
        ["checks." + itemId]: (marks && Object.keys(marks).length) ? marks : fs.deleteField()
      });
    },

    async clearChecks(code) { await fs.updateDoc(tripRef(code), { checks: {} }); },

    async setSections(code, sections) { await fs.updateDoc(tripRef(code), { sections }); },

    /* ---- Stationen ---- */

    async setStops(code, stops) { await fs.updateDoc(tripRef(code), { stops }); },

    /* ---- Fotos ----
       Das Vorschaubild liegt beim Eintrag, das grosse Bild in einem eigenen
       Dokument. So laedt die Galerie nur ein paar Kilobyte pro Foto. */

    async addPhoto(code, { meta, thumb, full }) {
      const ref = fs.doc(photosRef(code));
      await fs.setDoc(dataRef(code, ref.id), { data: fs.Bytes.fromUint8Array(full) });
      await fs.setDoc(ref, {
        ...meta,
        thumb: fs.Bytes.fromUint8Array(thumb),
        bytes: full.byteLength + thumb.byteLength,
        uploadedAt: Date.now()
      });
      return ref.id;
    },

    watchPhotos(code, cb) {
      const q = fs.query(photosRef(code), fs.orderBy("at", "asc"));
      return fs.onSnapshot(q,
        (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
        (err) => cb(null, err));
    },

    async loadPhotoData(code, id) {
      const snap = await fs.getDoc(dataRef(code, id));
      const raw = snap.exists() ? snap.data().data : null;
      return raw ? raw.toUint8Array() : null;
    },

    async deletePhoto(code, id) {
      await fs.deleteDoc(photoRef(code, id));
      await fs.deleteDoc(dataRef(code, id));
    }
  };
}
