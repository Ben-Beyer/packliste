/* Reisebuddy - Aufbau und Ablauf.

   Drei Bildschirme: Name, Reiseliste, eine Reise. Die Reise selbst hat fuenf
   Reiter, die als eigene Module in packliste.js, plan.js, photos.js und
   mapview.js liegen. Der Speicher steckt in store.js. */

import { TEMPLATE, EMPTY_SECTIONS, buildSections } from "./data.js";
import { createStore, myTrips, rememberTrip, forgetTrip, memberKey } from "./store.js";
import { initPackliste } from "./packliste.js";
import { initPlan } from "./plan.js";
import { initPhotos } from "./photos.js";
import { initMap, formatDate } from "./mapview.js";

const KEY_USER = "reisebuddy.v1.user";
const KEY_USER_ALT = "packliste.v2.user";
const $ = (id) => document.getElementById(id);

/* ---- gemeinsamer Zustand, den die Module lesen ---- */
const ctx = {
  store: null,
  user: "",
  code: null,
  trip: null,
  photos: [],
  toast,
  avatar,
  when,
  openPhoto: null
};

let pendingJoin = null;
let modules = null;
let tab = "overview";
let unsubTrip = null;
let unsubPhotos = null;
let announced = false;

/* ---------- kleine Helfer ---------- */

function readUser() {
  try { return localStorage.getItem(KEY_USER) || localStorage.getItem(KEY_USER_ALT) || ""; }
  catch (e) { return ""; }
}
function writeUser(name) {
  ctx.user = name;
  try { localStorage.setItem(KEY_USER, name); } catch (e) {}
}

function hue(name) {
  let h = 0;
  const s = String(name).toLowerCase();
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}
function initials(name) {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
function avatar(name, cls = "") {
  const el = document.createElement("span");
  el.className = "avatar " + cls;
  el.style.setProperty("--av-h", hue(name));
  el.textContent = initials(name);
  el.setAttribute("aria-hidden", "true");
  return el;
}

function when(ts) {
  if (!ts) return "";
  const diff = Date.now() - ts;
  if (diff < 60000) return "gerade eben";
  if (diff < 3600000) return "vor " + Math.floor(diff / 60000) + " Min";
  const d = new Date(ts);
  if (d.toDateString() === new Date().toDateString()) {
    return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) + " Uhr";
  }
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "short" });
}

let toastTimer = null;
function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}

function showScreen(id) {
  ["screenName", "screenTrips", "screenTrip", "screenError"].forEach((s) => {
    $(s).hidden = s !== id;
  });
}

function packCount() {
  if (!ctx.trip) return { done: 0, total: 0, pct: 0 };
  const me = memberKey(ctx.user);
  const checks = ctx.trip.checks || {};
  let done = 0, total = 0;
  (ctx.trip.sections || []).forEach((s) => s.items.forEach((i) => {
    total++;
    const raw = checks[i.id];
    const marks = !raw ? {} : (typeof raw.by === "string" ? { [memberKey(raw.by)]: raw } : raw);
    const hit = i.each ? !!marks[me] : Object.keys(marks).length > 0;
    if (hit) done++;
  }));
  return { done, total, pct: total ? Math.round(done / total * 100) : 0 };
}

/* ---------- Namensfenster ---------- */

let gateCancel = null;

function openGate({ changing }) {
  $("gateTitle").textContent = changing ? "Namen ändern" : "Wie sollen dich die anderen nennen?";
  $("gateText").textContent = changing
    ? "Neue Haken und Fotos laufen ab sofort unter diesem Namen. Was vorher war, behält den alten — das ist ja auch so gewesen."
    : "Dein Name steht an jedem Haken und an jedem Foto — so sieht jeder in der Reise, wer was gemacht hat.";
  $("nameSubmit").textContent = changing ? "Speichern" : "Los geht's";
  $("nameInput").value = ctx.user || "";
  $("nameErr").hidden = true;

  if (changing && !gateCancel) {
    gateCancel = document.createElement("button");
    gateCancel.type = "button";
    gateCancel.className = "linkish";
    gateCancel.textContent = "Abbrechen";
    gateCancel.addEventListener("click", () => { location.hash = "#/trips"; });
    $("nameForm").after(gateCancel);
  }
  if (gateCancel) gateCancel.hidden = !changing;

  showScreen("screenName");
  if (matchMedia("(pointer: fine)").matches) $("nameInput").focus();
}

$("nameForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("nameInput").value.trim().replace(/\s+/g, " ");
  if (name.length < 2) {
    $("nameErr").textContent = "Mindestens zwei Zeichen, damit man dich erkennt.";
    $("nameErr").hidden = false;
    return;
  }
  writeUser(name);
  if (pendingJoin) {
    const code = pendingJoin;
    pendingJoin = null;
    await doJoin(code);
    return;
  }
  location.hash = "#/trips";
  route();
});

$("whoBtn").addEventListener("click", () => { location.hash = "#/name"; });

/* ---------- Reiseliste ---------- */

async function renderTrips() {
  $("whoName").textContent = ctx.user;
  const av = $("whoAvatar");
  av.style.setProperty("--av-h", hue(ctx.user));
  av.textContent = initials(ctx.user);

  const list = $("tripList");
  list.textContent = "";
  const codes = myTrips();
  $("tripsEmpty").hidden = codes.length > 0;
  showScreen("screenTrips");

  const trips = await Promise.all(codes.map(async (code) => {
    try { return { code, trip: await ctx.store.getTrip(code) }; }
    catch (e) { return { code, trip: null }; }
  }));

  if (location.hash && location.hash !== "#/trips") return;   // inzwischen weitergeklickt
  list.textContent = "";

  trips.forEach(({ code, trip }) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "trip-card";

    if (!trip) {
      card.innerHTML = '<div class="tc-top"><span class="tc-name"></span><span class="tc-count">weg</span></div>';
      card.querySelector(".tc-name").textContent = "Reise " + code;
      const foot = document.createElement("div");
      foot.className = "tc-foot";
      foot.innerHTML = '<span class="hint" style="margin:0">Nicht gefunden — gelöscht oder falscher Code. Antippen entfernt sie aus deiner Liste.</span>';
      card.appendChild(foot);
      card.addEventListener("click", () => {
        forgetTrip(code);
        toast("Aus deiner Liste entfernt.");
        renderTrips();
      });
      list.appendChild(card);
      return;
    }

    const c = tripProgress(trip);
    card.classList.toggle("full", c.total > 0 && c.done === c.total);
    card.innerHTML =
      '<div class="tc-top"><span class="tc-name"></span><span class="tc-count"></span></div>' +
      '<div class="tc-when"></div>' +
      '<div class="track"><div class="fill"></div></div>' +
      '<div class="tc-foot"><span class="faces"></span><span class="tc-code"></span></div>';
    card.querySelector(".tc-name").textContent = trip.name || "Reise";
    card.querySelector(".tc-count").textContent = c.done + "/" + c.total;
    card.querySelector(".fill").style.width = c.pct + "%";
    card.querySelector(".tc-code").textContent = code;

    const span = rangeText(trip.start, trip.end);
    const whenEl = card.querySelector(".tc-when");
    if (span) whenEl.textContent = span; else whenEl.hidden = true;

    const faces = card.querySelector(".faces");
    const members = Object.values(trip.members || {});
    members.slice(0, 4).forEach((m) => faces.appendChild(avatar(m.name)));
    if (members.length > 4) {
      const more = document.createElement("span");
      more.className = "more";
      more.textContent = "+" + (members.length - 4);
      faces.appendChild(more);
    }

    card.addEventListener("click", () => { location.hash = "#/trip/" + code; });
    list.appendChild(card);
  });
}

function tripProgress(trip) {
  const me = memberKey(ctx.user);
  const checks = trip.checks || {};
  let done = 0, total = 0;
  (trip.sections || []).forEach((s) => s.items.forEach((i) => {
    total++;
    const raw = checks[i.id];
    const marks = !raw ? {} : (typeof raw.by === "string" ? { [memberKey(raw.by)]: raw } : raw);
    if (i.each ? !!marks[me] : Object.keys(marks).length > 0) done++;
  }));
  return { done, total, pct: total ? Math.round(done / total * 100) : 0 };
}

function rangeText(start, end) {
  if (!start && !end) return "";
  if (start && end) return formatDate(start) + " – " + formatDate(end);
  return formatDate(start || end);
}

/* ---------- Reise anlegen und beitreten ---------- */

document.querySelectorAll("[data-close]").forEach((b) => {
  b.addEventListener("click", () => b.closest("dialog").close());
});

$("newTripBtn").addEventListener("click", () => {
  $("newName").value = "";
  $("newStart").value = "";
  $("newEnd").value = "";
  $("newErr").hidden = true;
  $("dlgNew").showModal();
});

$("newForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("newName").value.trim();
  if (!name) return;
  const tpl = $("newForm").querySelector('input[name="tpl"]:checked').value;
  const sections = tpl === "roadtrip" ? buildSections(TEMPLATE) : structuredClone(EMPTY_SECTIONS);
  const btn = $("newSubmit");
  btn.disabled = true;
  btn.textContent = "Lege an …";
  try {
    const code = await ctx.store.createTrip({
      name,
      start: $("newStart").value,
      end: $("newEnd").value,
      sections,
      by: ctx.user
    });
    rememberTrip(code);
    $("dlgNew").close();
    location.hash = "#/trip/" + code;
  } catch (err) {
    $("newErr").textContent = "Hat nicht geklappt: " + (err && err.message || err);
    $("newErr").hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = "Anlegen";
  }
});

$("joinTripBtn").addEventListener("click", () => {
  $("joinCode").value = "";
  $("joinErr").hidden = true;
  $("dlgJoin").showModal();
});

$("joinForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const code = $("joinCode").value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!code) return;
  const btn = $("joinSubmit");
  btn.disabled = true;
  btn.textContent = "Suche …";
  try {
    const trip = await ctx.store.getTrip(code);
    if (!trip) {
      $("joinErr").textContent = "Diesen Code gibt es nicht. Groß- und Kleinschreibung ist egal, aber jedes Zeichen zählt.";
      $("joinErr").hidden = false;
      return;
    }
    $("dlgJoin").close();
    await doJoin(code);
  } catch (err) {
    $("joinErr").textContent = "Hat nicht geklappt: " + (err && err.message || err);
    $("joinErr").hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = "Beitreten";
  }
});

async function doJoin(code) {
  rememberTrip(code);
  try { await ctx.store.addMember(code, ctx.user); } catch (e) {}
  location.hash = "#/trip/" + code;
  route();
}

/* ---------- Eine Reise ---------- */

$("backBtn").addEventListener("click", () => { location.hash = "#/trips"; });

function openTrip(code) {
  closeTrip();
  ctx.code = code;
  ctx.trip = null;
  ctx.photos = [];
  announced = false;

  $("tripName").textContent = "Lädt …";
  $("tripCode").textContent = code;
  $("tripMembers").textContent = "";
  modules.pack.reset(code);
  setTab("overview");
  showScreen("screenTrip");

  unsubTrip = ctx.store.watchTrip(code, (trip, err) => {
    if (!trip) {
      ctx.trip = null;
      $("tripName").textContent = err ? "Nicht erreichbar" : "Nicht gefunden";
      $("syncNote").className = "sync warn";
      $("syncNote").textContent = err
        ? "Zugriff verweigert oder keine Verbindung."
        : "Diese Reise gibt es nicht (mehr).";
      return;
    }
    ctx.trip = trip;
    renderTrip();

    // Wer die Reise offen hat, gehoert dazu - greift auch nach einer Umbenennung
    if (!announced && !(trip.members || {})[memberKey(ctx.user)]) {
      announced = true;
      ctx.store.addMember(code, ctx.user).catch(() => {});
    }
  });

  unsubPhotos = ctx.store.watchPhotos(code, (photos, err) => {
    if (err) { ctx.photos = []; return; }
    ctx.photos = photos || [];
    modules.photos.render();
    modules.map.render();
    renderOverview();
  });
}

function closeTrip() {
  if (unsubTrip) { unsubTrip(); unsubTrip = null; }
  if (unsubPhotos) { unsubPhotos(); unsubPhotos = null; }
  ctx.code = null;
  ctx.trip = null;
  ctx.photos = [];
}

function renderTrip() {
  const trip = ctx.trip;
  $("tripName").textContent = trip.name || "Reise";
  $("tripCode").textContent = ctx.code;

  const members = Object.values(trip.members || {}).map((m) => m.name);
  $("tripMembers").textContent = members.length ? members.join(" · ") : "nur du";

  const sync = $("syncNote");
  if (!navigator.onLine) {
    sync.className = "sync warn";
    sync.textContent = "offline — Änderungen gehen später raus";
  } else {
    sync.className = "sync";
    sync.textContent = "live geteilt";
  }

  modules.pack.render();
  modules.plan.render();
  modules.map.render();
  renderOverview();
}

function renderOverview() {
  const trip = ctx.trip;
  if (!trip) return;

  const span = rangeText(trip.start, trip.end);
  $("tripWhen").textContent = span || "Kein Zeitraum eingetragen";

  const countdown = $("tripCountdown");
  countdown.textContent = countdownText(trip.start, trip.end);
  countdown.hidden = !countdown.textContent;

  const c = packCount();
  $("tilePack").textContent = c.done + "/" + c.total;
  $("tilePackNote").textContent = c.total && c.done === c.total ? "alles erledigt" : "für dich erledigt";

  const stops = trip.stops || [];
  $("tileStops").textContent = String(stops.length);
  $("tileStopsNote").textContent = stops.filter((s) => typeof s.lat === "number").length
    ? stops.filter((s) => typeof s.lat === "number").length + " mit Ort"
    : "geplant";

  const located = ctx.photos.filter((p) => typeof p.lat === "number");
  $("tilePhotos").textContent = String(ctx.photos.length);
  $("tilePhotosNote").textContent = located.length ? located.length + " mit Ort" : "hochgeladen";
  $("tileKm").textContent = String(kmBetween(located));

  const people = $("tripPeople");
  people.textContent = "";
  Object.values(trip.members || {}).forEach((m) => {
    const chip = document.createElement("span");
    chip.className = "person";
    chip.appendChild(avatar(m.name));
    const n = document.createElement("span");
    n.textContent = m.name + (memberKey(m.name) === memberKey(ctx.user) ? " (du)" : "");
    chip.appendChild(n);
    people.appendChild(chip);
  });

  $("codeBigInline").textContent = ctx.code;
}

function countdownText(start, end) {
  if (!start) return "";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const from = new Date(start + "T00:00:00");
  const to = end ? new Date(end + "T00:00:00") : from;
  if (isNaN(from)) return "";
  const days = Math.round((from - today) / 86400000);
  if (days > 1) return "noch " + days + " Tage";
  if (days === 1) return "morgen geht's los";
  if (days === 0) return "heute geht's los";
  if (today <= to) return "ihr seid unterwegs";
  return "war im " + from.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
}

function kmBetween(points) {
  const sorted = points.slice().sort((a, b) => (a.at || 0) - (b.at || 0));
  let sum = 0;
  for (let i = 1; i < sorted.length; i++) {
    const R = 6371, rad = (d) => d * Math.PI / 180;
    const a = sorted[i - 1], b = sorted[i];
    const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    sum += 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  }
  return Math.round(sum);
}

/* ---------- Reiter ---------- */

const PANELS = {
  overview: "panelOverview",
  pack: "panelPack",
  plan: "panelPlan",
  photos: "panelPhotos",
  map: "panelMap"
};

function setTab(name) {
  if (!PANELS[name]) name = "overview";
  tab = name;
  Object.entries(PANELS).forEach(([key, id]) => { $(id).hidden = key !== name; });
  document.querySelectorAll(".tab").forEach((b) => {
    const on = b.dataset.tab === name;
    b.classList.toggle("on", on);
    if (on) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current");
  });
  document.body.classList.toggle("map-open", name === "map");
  if (name === "map") modules.map.activate();
  window.scrollTo({ top: 0 });
}

document.querySelectorAll(".tab").forEach((b) => {
  b.addEventListener("click", () => setTab(b.dataset.tab));
});
document.querySelectorAll("[data-goto]").forEach((b) => {
  b.addEventListener("click", () => setTab(b.dataset.goto));
});

/* ---------- Reise bearbeiten, teilen, verlassen ---------- */

$("tripEditBtn").addEventListener("click", () => {
  $("editName").value = ctx.trip.name || "";
  $("editStart").value = ctx.trip.start || "";
  $("editEnd").value = ctx.trip.end || "";
  $("editErr").hidden = true;
  $("dlgTrip").showModal();
});

$("tripForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("editName").value.trim();
  if (!name) return;
  try {
    await ctx.store.updateTrip(ctx.code, {
      name,
      start: $("editStart").value || "",
      end: $("editEnd").value || ""
    });
    $("dlgTrip").close();
  } catch (err) {
    $("editErr").textContent = "Konnte nicht gespeichert werden.";
    $("editErr").hidden = false;
  }
});

function shareLink(code) {
  return location.origin + location.pathname + "#/join/" + code;
}

async function share() {
  const code = ctx.code;
  const url = shareLink(code);
  const text = `Reise „${ctx.trip.name}“ — Code ${code}\n${url}`;
  try {
    if (navigator.share) await navigator.share({ title: "Reisebuddy", text });
    else { await navigator.clipboard.writeText(text); toast("Einladung kopiert."); }
  } catch (e) { /* abgebrochen */ }
}

$("codeBtn").addEventListener("click", () => {
  $("codeBig").textContent = ctx.code;
  $("copyCode").textContent = navigator.share ? "Einladung teilen" : "Einladung kopieren";
  $("dlgCode").showModal();
});
$("copyCode").addEventListener("click", async () => { await share(); $("dlgCode").close(); });
$("shareBtn").addEventListener("click", share);
$("copyCodeBtn").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(ctx.code); toast("Code kopiert."); }
  catch (e) { toast("Kopieren ging nicht — Code: " + ctx.code); }
});

$("leaveBtn").addEventListener("click", () => {
  forgetTrip(ctx.code);
  toast("Aus deiner Liste entfernt. Mit dem Code kommst du wieder rein.");
  location.hash = "#/trips";
});

/* ---------- Routing ---------- */

function route() {
  const hash = location.hash || "#/trips";
  const joinMatch = hash.match(/^#\/join\/([A-Za-z0-9]+)/);

  if (joinMatch) {
    const code = joinMatch[1].toUpperCase();
    if (!ctx.user) { pendingJoin = code; openGate({ changing: false }); return; }
    doJoin(code);
    return;
  }
  if (!ctx.user) { openGate({ changing: false }); return; }
  if (hash === "#/name") { openGate({ changing: true }); return; }

  const tripMatch = hash.match(/^#\/trip\/([A-Za-z0-9]+)/);
  if (tripMatch) {
    const code = tripMatch[1].toUpperCase();
    if (ctx.code !== code) openTrip(code);
    else showScreen("screenTrip");
    return;
  }

  closeTrip();
  renderTrips();
}

window.addEventListener("hashchange", route);
window.addEventListener("online", () => { if (ctx.trip) renderTrip(); });
window.addEventListener("offline", () => { if (ctx.trip) renderTrip(); });

/* ---------- Start ---------- */

(async function start() {
  ctx.user = readUser();
  try {
    ctx.store = await createStore();
  } catch (err) {
    $("errorText").textContent = String(err && err.message || err) +
      " Prüfe die Internetverbindung; wenn das bleibt, stimmt in der Firebase-Einrichtung etwas nicht.";
    showScreen("screenError");
    return;
  }

  modules = {
    pack: initPackliste(ctx),
    plan: initPlan(ctx),
    photos: initPhotos(ctx),
    map: initMap(ctx)
  };
  ctx.openPhoto = (p) => modules.photos.show(p);

  route();

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
