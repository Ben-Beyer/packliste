/* Reisebuddy - Aufbau und Ablauf.

   Drei Bildschirme: Name, Reiseliste, eine Reise. Die Reise selbst hat sechs
   Reiter, die als eigene Module danebenliegen (packliste, plan, photos, spots,
   mapview). Der Speicher steckt in store.js, die Animationen in motion.js. */

import { TEMPLATE, EMPTY_SECTIONS, buildSections } from "./data.js";
import { createStore, myTrips, rememberTrip, forgetTrip, memberKey } from "./store.js";
import { initPackliste } from "./packliste.js";
import { initPlan } from "./plan.js";
import { initPhotos } from "./photos.js";
import { initSpots } from "./spots.js";
import { initMap, formatDate, haversine } from "./mapview.js";
import { initTripPlaner } from "./tripplaner.js";
import { initMotion } from "./motion.js";
import { holeWetter, passendeTage, beschreibung, symbol } from "./weather.js";

const KEY_USER = "reisebuddy.v1.user";
const KEY_USER_ALT = "packliste.v2.user";
const $ = (id) => document.getElementById(id);

/* ---- gemeinsamer Zustand, den die Module lesen ---- */
const ctx = {
  store: null,
  motion: null,
  user: "",
  code: null,
  trip: null,
  photos: [],
  spots: [],
  toast,
  avatar,
  when,
  openPhoto: null,
  stagger: () => {},
  reveal: () => {},
  openLightbox: (d) => d.showModal(),
  feiern: () => {}
};

let pendingJoin = null;
let modules = null;
let tab = "overview";
let unsubTrip = null;
let unsubPhotos = null;
let announced = false;
let coverUrl = null;

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
  if (ctx.motion && ctx.motion.aktiv()) {
    ctx.motion.gsap.fromTo(el, { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: .38, ease: "expo.out" });
  }
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3600);
}

function showScreen(id) {
  ["screenName", "screenTrips", "screenTrip", "screenError"].forEach((s) => {
    const el = $(s);
    const zeigen = s === id;
    if (zeigen && el.hidden && ctx.motion) ctx.motion.screenIn(el);
    el.hidden = !zeigen;
  });
  if (ctx.motion) ctx.motion.scrollTop();
}

function packCount(trip) {
  const t = trip || ctx.trip;
  if (!t) return { done: 0, total: 0, pct: 0 };
  const me = memberKey(ctx.user);
  const checks = t.checks || {};
  let done = 0, total = 0;
  (t.sections || []).forEach((s) => s.items.forEach((i) => {
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

function blobUrl(bytes) {
  return URL.createObjectURL(new Blob([bytes.toUint8Array()], { type: "image/jpeg" }));
}

/* ---------- Namensfenster ---------- */

let gateCancel = null;

function openGate({ changing }) {
  $("gateTitle").textContent = changing ? "Namen ändern" : "Wie sollen dich die anderen nennen?";
  $("gateText").textContent = changing
    ? "Neue Haken, Fotos und Spots laufen ab sofort unter diesem Namen. Was vorher war, behält den alten — das ist ja auch so gewesen."
    : "Dein Name steht an jedem Haken, an jedem Foto und an jedem Spot — so sieht jeder in der Reise, wer was gemacht hat.";
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
  if (ctx.motion) {
    ctx.motion.stagger([$("gateTitle"), $("gateText"), $("nameForm")], { y: 18, stagger: .07 });
  }
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
  if (ctx.motion) ctx.motion.zeilen($("tripsHeadline"));

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
      card.classList.add("weg");
      card.innerHTML = '<div class="tc-body"><div class="tc-top"><span class="tc-name"></span><span class="tc-count">weg</span></div>'
        + '<p class="hint" style="margin:6px 0 0">Nicht gefunden — gelöscht oder falscher Code. Antippen entfernt sie aus deiner Liste.</p></div>';
      card.querySelector(".tc-name").textContent = "Reise " + code;
      card.addEventListener("click", () => {
        forgetTrip(code);
        toast("Aus deiner Liste entfernt.");
        renderTrips();
      });
      list.appendChild(card);
      return;
    }

    const c = packCount(trip);
    card.classList.toggle("full", c.total > 0 && c.done === c.total);

    if (trip.cover) {
      const bild = document.createElement("span");
      bild.className = "tc-bild";
      const img = document.createElement("img");
      img.alt = "";
      img.loading = "lazy";
      img.src = blobUrl(trip.cover);
      bild.appendChild(img);
      card.appendChild(bild);
      card.classList.add("mit-bild");
    }

    const body = document.createElement("div");
    body.className = "tc-body";
    body.innerHTML =
      '<div class="tc-top"><span class="tc-name"></span><span class="tc-count"></span></div>' +
      '<div class="tc-when"></div>' +
      '<div class="track"><div class="fill"></div></div>' +
      '<div class="tc-foot"><span class="faces"></span><span class="tc-code"></span></div>';
    body.querySelector(".tc-name").textContent = trip.name || "Reise";
    body.querySelector(".tc-count").textContent = c.done + "/" + c.total;
    body.querySelector(".fill").style.width = c.pct + "%";
    body.querySelector(".tc-code").textContent = code;

    const span = rangeText(trip.start, trip.end);
    const whenEl = body.querySelector(".tc-when");
    if (span) whenEl.textContent = span; else whenEl.hidden = true;

    const faces = body.querySelector(".faces");
    const members = Object.values(trip.members || {});
    members.slice(0, 4).forEach((m) => faces.appendChild(avatar(m.name)));
    if (members.length > 4) {
      const more = document.createElement("span");
      more.className = "more";
      more.textContent = "+" + (members.length - 4);
      faces.appendChild(more);
    }
    card.appendChild(body);

    card.addEventListener("click", () => { location.hash = "#/trip/" + code; });
    list.appendChild(card);
  });

  if (ctx.motion) ctx.motion.stagger(list.children, { y: 26, stagger: .06 });
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
      name, start: $("newStart").value, end: $("newEnd").value, sections, by: ctx.user
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
  ctx.spots = [];
  announced = false;

  $("tripName").textContent = "Lädt …";
  $("tripCode").textContent = code;
  $("tripMembers").textContent = "";
  setCover(null);
  modules.pack.reset(code);
  modules.photos.zurueckZuOrdnern();
  setTab("overview", true);
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
    // Spots stecken als Feld in der Reise - hier einmal in eine Liste bringen,
    // neueste zuerst, damit die Module nichts davon wissen muessen.
    ctx.spots = Object.entries(trip.challenges || {})
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => (b.at || 0) - (a.at || 0));
    renderTrip();

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
  setCover(null);
  ctx.code = null;
  ctx.trip = null;
  ctx.photos = [];
  ctx.spots = [];
}

function setCover(bytes) {
  const el = $("tripCover");
  if (coverUrl) { URL.revokeObjectURL(coverUrl); coverUrl = null; }
  if (!bytes) {
    el.style.backgroundImage = "";
    el.classList.remove("hat");
    return;
  }
  coverUrl = blobUrl(bytes);
  el.style.backgroundImage = `url(${coverUrl})`;
  el.classList.add("hat");
}

function renderTrip() {
  const trip = ctx.trip;
  $("tripName").textContent = trip.name || "Reise";
  $("tripCode").textContent = ctx.code;
  if (trip.cover) setCover(trip.cover);

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
  modules.spots.render();
  modules.map.render();
  renderOverview();
}

function renderOverview() {
  const trip = ctx.trip;
  if (!trip) return;

  $("tripWhen").textContent = rangeText(trip.start, trip.end) || "Kein Zeitraum eingetragen";

  const countdown = $("tripCountdown");
  countdown.textContent = countdownText(trip.start, trip.end);
  countdown.hidden = !countdown.textContent;

  const c = packCount();
  const m = ctx.motion;
  if (m) m.count($("tilePackDone"), c.done); else $("tilePackDone").textContent = c.done;
  $("tilePackAll").textContent = c.total;
  $("tilePackNote").textContent = c.total && c.done === c.total ? "alles erledigt" : "für dich erledigt";

  const stops = trip.stops || [];
  const mitOrt = stops.filter((s) => typeof s.lat === "number").length;
  if (m) m.count($("tileStops"), stops.length); else $("tileStops").textContent = stops.length;
  $("tileStopsNote").textContent = mitOrt ? mitOrt + " mit Ort" : "geplant";

  const located = ctx.photos.filter((p) => typeof p.lat === "number");
  if (m) m.count($("tilePhotos"), ctx.photos.length); else $("tilePhotos").textContent = ctx.photos.length;
  $("tilePhotosNote").textContent = ctx.photos.length
    ? (located.length ? located.length + " mit Ort" : "keins mit Ort")
    : "hochgeladen";

  const me = memberKey(ctx.user);
  const offen = ctx.spots.filter((s) => !(s.done || {})[me]).length;
  if (m) m.count($("tileSpots"), ctx.spots.length); else $("tileSpots").textContent = ctx.spots.length;
  $("tileSpotsNote").textContent = ctx.spots.length
    ? (offen ? offen + " noch offen" : "alle erobert")
    : "zu erobern";

  const people = $("tripPeople");
  people.textContent = "";
  Object.values(trip.members || {}).forEach((mm) => {
    const chip = document.createElement("span");
    chip.className = "person";
    chip.appendChild(avatar(mm.name));
    const n = document.createElement("span");
    n.textContent = mm.name + (memberKey(mm.name) === me ? " (du)" : "");
    chip.appendChild(n);
    people.appendChild(chip);
  });

  $("codeBigInline").textContent = ctx.code;
  zeigeWetter();
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

/* ---------- Wetter ---------- */

let wetterFuer = null;

async function zeigeWetter() {
  const trip = ctx.trip;
  if (!trip) return;
  const ziel = (trip.stops || []).find((s) => typeof s.lat === "number")
    || ctx.photos.find((p) => typeof p.lat === "number")
    || ctx.spots.find((s) => typeof s.lat === "number");

  const karte = $("weatherCard");
  if (!ziel) { karte.hidden = true; wetterFuer = null; return; }

  const key = `${ziel.lat.toFixed(2)},${ziel.lon.toFixed(2)}`;
  if (wetterFuer === key) return;
  wetterFuer = key;

  $("weatherWo").textContent = "· " + (ziel.place || ziel.placeName || ziel.name || "am Ziel");

  try {
    const daten = await holeWetter(ziel.lat, ziel.lon);
    const tage = passendeTage(daten, trip.start, trip.end);
    const reihe = $("weatherRow");
    reihe.textContent = "";

    if (!tage.length) {
      karte.hidden = false;
      $("weatherNote").textContent = "Die Vorhersage reicht sieben Tage — für euren Zeitraum gibt es noch nichts.";
      return;
    }

    tage.slice(0, 6).forEach((t) => {
      const d = document.createElement("div");
      d.className = "wtag";
      const tag = document.createElement("span");
      tag.className = "wtag-tag";
      tag.textContent = new Date(t.tag + "T00:00:00").toLocaleDateString("de-DE", { weekday: "short" });
      const ico = document.createElement("span");
      ico.className = "wtag-ico";
      ico.innerHTML = symbol(t.code);
      ico.title = beschreibung(t.code);
      const grad = document.createElement("span");
      grad.className = "wtag-grad";
      grad.innerHTML = `<b>${t.max}°</b><small>${t.min}°</small>`;
      d.appendChild(tag); d.appendChild(ico); d.appendChild(grad);
      if (t.regen != null && t.regen >= 40) {
        const r = document.createElement("span");
        r.className = "wtag-regen";
        r.textContent = t.regen + " %";
        d.appendChild(r);
      }
      reihe.appendChild(d);
    });

    $("weatherNote").textContent = "Vorhersage von Open-Meteo, kostenlos und ohne Anmeldung.";
    karte.hidden = false;
    if (ctx.motion) ctx.motion.stagger(reihe.children, { y: 12, stagger: .05 });
  } catch (e) {
    karte.hidden = true;
    wetterFuer = null;
  }
}

/* ---------- Reiter ---------- */

const PANELS = {
  overview: "panelOverview",
  pack: "panelPack",
  plan: "panelPlan",
  photos: "panelPhotos",
  spots: "panelSpots",
  map: "panelMap"
};

function setTab(name, sofort) {
  if (!PANELS[name]) name = "overview";
  tab = name;
  Object.entries(PANELS).forEach(([key, id]) => { $(id).hidden = key !== name; });
  document.querySelectorAll(".tab").forEach((b) => {
    const on = b.dataset.tab === name;
    b.classList.toggle("on", on);
    if (on) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current");
  });
  document.body.classList.toggle("map-open", name === "map");
  markerZuTab(name, sofort);
  if (!sofort && ctx.motion) ctx.motion.panelIn($(PANELS[name]));
  if (name === "map") modules.map.activate();
  if (ctx.motion) ctx.motion.scrollTop();
}

function markerZuTab(name, sofort) {
  const marker = $("tabMarker");
  const btn = document.querySelector(`.tab[data-tab="${name}"]`);
  if (!marker || !btn) return;
  const x = btn.offsetLeft + btn.offsetWidth / 2 - 14;
  if (sofort || !ctx.motion || !ctx.motion.aktiv()) {
    marker.style.transform = `translateX(${x}px)`;
  } else {
    ctx.motion.gsap.to(marker, { x, duration: .45, ease: "expo.out", overwrite: true });
  }
}

document.querySelectorAll(".tab").forEach((b) => {
  b.addEventListener("click", () => setTab(b.dataset.tab));
});
document.querySelectorAll("[data-goto]").forEach((b) => {
  b.addEventListener("click", () => setTab(b.dataset.goto));
});
window.addEventListener("resize", () => markerZuTab(tab, true));

/* ---------- Reise bearbeiten, teilen, verlassen, löschen ---------- */

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
      name, start: $("editStart").value || "", end: $("editEnd").value || ""
    });
    wetterFuer = null;
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
  const text = `Reise „${ctx.trip.name}“ — Code ${code}\n${shareLink(code)}`;
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

let killArmed = false, killTimer = null;
$("deleteTripBtn").addEventListener("click", async () => {
  const btn = $("deleteTripBtn");
  if (!killArmed) {
    killArmed = true;
    btn.textContent = "Wirklich — für alle löschen, endgültig";
    killTimer = setTimeout(() => {
      killArmed = false;
      btn.textContent = "Reise endgültig löschen";
    }, 6000);
    return;
  }
  clearTimeout(killTimer);
  killArmed = false;
  btn.textContent = "Lösche …";
  btn.disabled = true;
  const code = ctx.code;
  const name = (ctx.trip && ctx.trip.name) || "Die Reise";
  try {
    const photos = await ctx.store.deleteTrip(code, (done, total) => {
      btn.textContent = `Lösche Fotos … ${done}/${total}`;
    });
    forgetTrip(code);
    const mitFotos = photos ? ` — samt ${photos === 1 ? "einem Foto" : photos + " Fotos"}` : "";
    toast(`„${name}“ ist gelöscht${mitFotos}.`);
    location.hash = "#/trips";
  } catch (err) {
    toast("Löschen hat nicht geklappt: " + (err && err.code || err));
  } finally {
    btn.disabled = false;
    btn.textContent = "Reise endgültig löschen";
  }
});

$("leaveBtn").addEventListener("click", () => {
  forgetTrip(ctx.code);
  toast("Aus deiner Liste entfernt. Mit dem Code kommst du wieder rein.");
  location.hash = "#/trips";
});

/* Dialoge halten das sanfte Scrollen an, sonst ruckelt der Hintergrund. */
document.querySelectorAll("dialog").forEach((d) => {
  const beobachter = new MutationObserver(() => {
    if (!ctx.motion) return;
    if (d.open) ctx.motion.scrollStop(); else ctx.motion.scrollStart();
  });
  beobachter.observe(d, { attributes: true, attributeFilter: ["open"] });
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

function schritt(name) {
  window.__schritt = name;
  try { document.documentElement.dataset.schritt = name; } catch (e) {}
}

(async function start() {
  schritt("start");
  ctx.user = readUser();

  schritt("motion");
  ctx.motion = await initMotion();
  schritt("motion-fertig");
  ctx.stagger = (nodes, o) => ctx.motion.stagger(nodes, o);
  ctx.reveal = (el, o) => ctx.motion.reveal(el, o);
  ctx.openLightbox = (d, from) => ctx.motion.openLightbox(d, from);
  ctx.feiern = (el) => ctx.motion.feiern(el);

  schritt("speicher");
  try {
    // Mit Frist: haengt die Anmeldung, soll die App das sagen statt ewig zu laden.
    ctx.store = await Promise.race([
      createStore(),
      new Promise((_, ab) => setTimeout(
        () => ab(new Error("Die Anmeldung hat zu lange gedauert.")), 20000))
    ]);
  } catch (err) {
    $("errorText").textContent = String(err && err.message || err) +
      " Prüfe die Internetverbindung; wenn das bleibt, stimmt in der Firebase-Einrichtung etwas nicht.";
    ctx.motion.intro(() => showScreen("screenError"));
    return;
  }

  schritt("speicher-fertig");
  // Jeder Baustein einzeln, damit ein Fehler benannt werden kann statt die App
  // stumm im Ladebildschirm haengen zu lassen.
  try {
    modules = {
      pack: initPackliste(ctx),
      plan: initPlan(ctx),
      photos: initPhotos(ctx),
      spots: initSpots(ctx),
      map: initMap(ctx),
      planer: initTripPlaner(ctx)
    };
  } catch (err) {
    console.error("Baustein defekt:", err);
    $("errorText").textContent = "Ein Baustein der App ließ sich nicht starten: "
      + (err && err.message || err) + " — bitte neu laden.";
    ctx.motion.intro(() => showScreen("screenError"));
    return;
  }

  ctx.openPhoto = (p) => {
    setTab("photos");
    modules.photos.show(p);
  };

  schritt("module-fertig");
  ctx.motion.intro(() => { schritt("bereit"); route(); });

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
