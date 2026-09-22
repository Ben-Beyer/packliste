/* Speicher-Schicht mit zwei Betriebsarten.

   cloud  - Firestore. Alle Mitfahrer sehen denselben Stand, Aenderungen kommen
            live an, offline gesetzte Haken werden beim naechsten Netz nachgereicht.
   local  - Nur dieses Geraet. Greift, solange in firebase-config.js nichts steht,
            damit die App auch ohne Firebase-Projekt benutzbar ist.

   Beide bieten dieselben Methoden, die Oberflaeche kennt den Unterschied nicht. */

import { FIREBASE_CONFIG } from "./firebase-config.js";

const SDK = "https://www.gstatic.com/firebasejs/11.6.0";
const KEY_TRIPS = "packliste.v2.mytrips";

/* Mitglieder werden unter einem bereinigten Schluessel abgelegt, damit derselbe
   Name in beiden Betriebsarten dieselbe Zeile trifft. */
export function memberKey(name) {
  return String(name).toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]/g, "") || "gast";
}

/* Ein Haken wird als Map Person -> {by, at} abgelegt, damit bei Positionen, die
   jeder einzeln packt, mehrere Leute nebeneinander abhaken koennen. Ganz frueh
   angelegte Trips haben dort noch flach {by, at} stehen - das wird hier gerade
   gebogen, damit alte und neue Trips gleich behandelt werden. */
export function normalizeMarks(raw) {
  if (!raw) return {};
  if (typeof raw.by === "string") return { [memberKey(raw.by)]: { by: raw.by, at: raw.at } };
  const out = {};
  Object.keys(raw).forEach((k) => { if (raw[k] && typeof raw[k].by === "string") out[k] = raw[k]; });
  return out;
}

/* Ohne 0/O/1/I - der Code wird abgetippt und vorgelesen. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newCode(len = 6) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/* ---- Die Trips, die auf diesem Geraet in der Liste stehen ---- */

export function myTrips() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY_TRIPS) || "[]");
    return Array.isArray(raw) ? raw.filter((c) => typeof c === "string") : [];
  } catch (e) { return []; }
}

export function rememberTrip(code) {
  const list = myTrips().filter((c) => c !== code);
  list.unshift(code);
  try { localStorage.setItem(KEY_TRIPS, JSON.stringify(list)); } catch (e) {}
}

export function forgetTrip(code) {
  try { localStorage.setItem(KEY_TRIPS, JSON.stringify(myTrips().filter((c) => c !== code))); } catch (e) {}
}

/* ---- Einzelmodus ---- */

function localStore() {
  const key = (code) => "packliste.v2.trip." + code;
  const watchers = new Map();

  function read(code) {
    try {
      const raw = localStorage.getItem(key(code));
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function write(trip) {
    try { localStorage.setItem(key(trip.code), JSON.stringify(trip)); } catch (e) {}
    const set = watchers.get(trip.code);
    if (set) set.forEach((cb) => cb(trip));
  }
  function patch(code, fn) {
    const trip = read(code);
    if (!trip) return;
    fn(trip);
    write(trip);
  }

  return {
    mode: "local",
    async createTrip({ name, sections, by }) {
      const code = newCode();
      write({
        code, name, sections,
        createdAt: Date.now(), createdBy: by,
        checks: {}, members: { [memberKey(by)]: { name: by, at: Date.now() } }
      });
      return code;
    },
    async getTrip(code) { return read(code); },
    watchTrip(code, cb) {
      if (!watchers.has(code)) watchers.set(code, new Set());
      watchers.get(code).add(cb);
      cb(read(code));
      return () => watchers.get(code).delete(cb);
    },
    async setMark(code, itemId, mkey, by) {
      patch(code, (t) => {
        const cur = normalizeMarks(t.checks[itemId]);
        if (by) cur[mkey] = { by, at: Date.now() };
        else delete cur[mkey];
        if (Object.keys(cur).length) t.checks[itemId] = cur;
        else delete t.checks[itemId];
      });
    },
    async setMarks(code, itemId, marks) {
      patch(code, (t) => {
        if (marks && Object.keys(marks).length) t.checks[itemId] = marks;
        else delete t.checks[itemId];
      });
    },
    async clearChecks(code) { patch(code, (t) => { t.checks = {}; }); },
    async setSections(code, sections) { patch(code, (t) => { t.sections = sections; }); },
    async addMember(code, name) {
      patch(code, (t) => {
        t.members = t.members || {};
        t.members[memberKey(name)] = { name, at: Date.now() };
      });
    },
    async rename(code, name) { patch(code, (t) => { t.name = name; }); }
  };
}

/* ---- Geteilter Modus ---- */

async function cloudStore() {
  const [{ initializeApp }, auth, fs] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-firestore.js`)
  ]);

  const app = initializeApp(FIREBASE_CONFIG);

  // Lokaler Cache: die App startet offline aus dem Cache, Schreibvorgaenge
  // ohne Netz stehen in der Warteschlange und gehen spaeter raus.
  const db = fs.initializeFirestore(app, {
    localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() })
  });

  // Anonyme Anmeldung, damit die Firestore-Regeln fremde Zugriffe abweisen
  // koennen. Kein Login-Dialog, laeuft im Hintergrund.
  await auth.signInAnonymously(auth.getAuth(app));

  const ref = (code) => fs.doc(db, "trips", code);
  const clean = (snap) => (snap.exists() ? { code: snap.id, checks: {}, members: {}, ...snap.data() } : null);

  return {
    mode: "cloud",
    async createTrip({ name, sections, by }) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = newCode();
        const existing = await fs.getDoc(ref(code));
        if (existing.exists()) continue;
        await fs.setDoc(ref(code), {
          name, sections,
          createdAt: Date.now(), createdBy: by,
          checks: {}, members: { [memberKey(by)]: { name: by, at: Date.now() } }
        });
        return code;
      }
      throw new Error("Es liess sich kein freier Trip-Code finden. Bitte nochmal versuchen.");
    },
    async getTrip(code) { return clean(await fs.getDoc(ref(code))); },
    watchTrip(code, cb) {
      return fs.onSnapshot(ref(code), (snap) => cb(clean(snap)), () => cb(null));
    },
    async setMark(code, itemId, mkey, by) {
      // Punktpfad bis auf die Person hinunter: Zwei Leute, die gleichzeitig
      // dieselbe Position fuer sich abhaken, ueberschreiben sich nicht.
      await fs.updateDoc(ref(code), {
        [`checks.${itemId}.${mkey}`]: by ? { by, at: Date.now() } : fs.deleteField()
      });
    },
    async setMarks(code, itemId, marks) {
      await fs.updateDoc(ref(code), {
        ["checks." + itemId]: (marks && Object.keys(marks).length) ? marks : fs.deleteField()
      });
    },
    async clearChecks(code) { await fs.updateDoc(ref(code), { checks: {} }); },
    async setSections(code, sections) { await fs.updateDoc(ref(code), { sections }); },
    async addMember(code, name) {
      await fs.updateDoc(ref(code), { ["members." + memberKey(name)]: { name, at: Date.now() } });
    },
    async rename(code, name) { await fs.updateDoc(ref(code), { name }); }
  };
}

export function hasFirebase() {
  return Boolean(FIREBASE_CONFIG && FIREBASE_CONFIG.projectId && FIREBASE_CONFIG.apiKey);
}

export async function createStore() {
  if (!hasFirebase()) return localStore();
  try {
    return await cloudStore();
  } catch (err) {
    console.warn("Firebase nicht erreichbar, Einzelmodus:", err);
    const s = localStore();
    s.failedCloud = String(err && err.message || err);
    return s;
  }
}
