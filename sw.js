/* Roadtrip Packliste - Service Worker
   Macht die App offline startbar. Nach jeder Aenderung an den Dateien VERSION
   hochzaehlen, sonst bleiben installierte Geraete auf der alten Fassung. */

const VERSION = "packliste-v4";
const SHELL = VERSION + "-shell";
const RUNTIME = VERSION + "-runtime";

const SHELL_FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./store.js",
  "./data.js",
  "./firebase-config.js",
  "./manifest.webmanifest",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/favicon-32.png"
];

/* Fremde Hosts, deren Dateien sich nicht aendern: Schriften und das Firebase-SDK.
   Firestore selbst (firestore.googleapis.com) steht bewusst NICHT hier - die
   Verbindung muss ungefiltert durchlaufen, sonst bricht die Live-Synchronisierung. */
const THIRD_PARTY = [
  "https://fonts.googleapis.com",
  "https://fonts.gstatic.com",
  "https://www.gstatic.com"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== SHELL && k !== RUNTIME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Seitenaufruf: erst Netz, damit Aenderungen ankommen, sonst aus dem Cache.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put("./index.html", copy));
          return res;
        })
        .catch(() => caches.match("./index.html", { ignoreSearch: true })
          .then((hit) => hit || caches.match("./")))
    );
    return;
  }

  if (THIRD_PARTY.includes(url.origin)) {
    event.respondWith(
      caches.match(req).then((hit) => {
        const net = fetch(req).then((res) => {
          if (res && (res.ok || res.type === "opaque")) {
            const copy = res.clone();
            caches.open(RUNTIME).then((c) => c.put(req, copy));
          }
          return res;
        }).catch(() => hit);
        return hit || net;
      })
    );
    return;
  }

  // Eigene Dateien: erst Netz, bei Fehler aus dem Cache. So zieht ein iPhone
  // Aenderungen an app.js/style.css sofort, funktioniert aber ohne Netz weiter.
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(SHELL).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true }))
    );
  }
});
