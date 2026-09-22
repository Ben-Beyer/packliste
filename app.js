/* Packliste - Oberflaeche und Ablauf.
   Der Speicher steckt in store.js und kann geteilt (Firestore) oder nur lokal sein. */

import { TEMPLATE, EMPTY_SECTIONS, buildSections, slug } from "./data.js";
import { createStore, myTrips, rememberTrip, forgetTrip, hasFirebase, memberKey, normalizeMarks } from "./store.js";

const KEY_USER = "packliste.v2.user";
const $ = (id) => document.getElementById(id);

const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>';
const TRASH_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>';

let store = null;
let user = readUser();
let pendingJoin = null;

/* ---------- kleine Helfer ---------- */

function readUser() {
  try { return localStorage.getItem(KEY_USER) || ""; } catch (e) { return ""; }
}
function writeUser(name) {
  user = name;
  try { localStorage.setItem(KEY_USER, name); } catch (e) {}
}

function readUi(code) {
  try {
    const raw = JSON.parse(localStorage.getItem("packliste.v2.ui." + code) || "{}");
    return { hideDone: !!raw.hideDone, collapsed: Array.isArray(raw.collapsed) ? raw.collapsed : [] };
  } catch (e) { return { hideDone: false, collapsed: [] }; }
}
function writeUi(code, ui) {
  try { localStorage.setItem("packliste.v2.ui." + code, JSON.stringify(ui)); } catch (e) {}
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
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

function showScreen(id) {
  ["screenName", "screenTrips", "screenTrip"].forEach((s) => { $(s).hidden = s !== id; });
}

/* Wer hat diese Position abgehakt, als Map Person -> {by, at} */
function marksOf(trip, itemId) {
  return normalizeMarks((trip.checks || {})[itemId]);
}

/* "erledigt" heisst nicht fuer alle Positionen dasselbe:
   - jeder einzeln -> erledigt, sobald ICH sie abgehakt habe
   - einer reicht  -> erledigt, sobald irgendwer sie abgehakt hat
   Der Fortschritt beantwortet damit "was muss ich noch tun". */
function isDone(trip, item, me) {
  const marks = marksOf(trip, item.id);
  return item.each ? !!marks[me] : Object.keys(marks).length > 0;
}

function countOf(trip) {
  const me = memberKey(user);
  let done = 0, total = 0;
  (trip.sections || []).forEach((s) => s.items.forEach((i) => {
    total++;
    if (isDone(trip, i, me)) done++;
  }));
  return { done, total, pct: total ? Math.round(done / total * 100) : 0 };
}

/* Alle, die im Trip mitpacken - Mitglieder plus alle, die schon abgehakt haben */
function roster(trip, marks) {
  const seen = new Set();
  const people = [];
  Object.entries(trip.members || {}).forEach(([k, v]) => {
    seen.add(k); people.push({ key: k, name: v.name });
  });
  Object.entries(marks).forEach(([k, v]) => {
    if (!seen.has(k)) { seen.add(k); people.push({ key: k, name: v.by }); }
  });
  return people;
}

/* ---------- Namensfenster ---------- */

let gateCancel = null;

function openGate({ changing }) {
  $("gateTitle").textContent = changing ? "Namen ändern" : "Wie sollen dich die anderen nennen?";
  $("gateText").textContent = changing
    ? "Neue Haken laufen ab sofort unter diesem Namen. Was du vorher abgehakt hast, behält den alten — das ist ja auch so gewesen."
    : "Dein Name steht an jedem Haken, den du setzt — so sieht jeder im Trip, wer was schon erledigt hat.";
  $("nameSubmit").textContent = changing ? "Speichern" : "Los geht's";
  $("nameInput").value = user || "";
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

/* ---------- Trip-Übersicht ---------- */

async function renderTrips() {
  $("whoName").textContent = user;
  const av = $("whoAvatar");
  av.style.setProperty("--av-h", hue(user));
  av.textContent = initials(user);

  const hint = $("modeHint");
  if (store.mode === "cloud") {
    hint.className = "hint";
    hint.textContent = "Trips werden geteilt: Wer den Code hat, sieht denselben Stand — auch offline gesetzte Haken gehen nach, sobald wieder Netz da ist.";
  } else if (hasFirebase()) {
    hint.className = "hint bad";
    hint.textContent = "Firebase antwortet nicht — die App läuft gerade nur auf diesem Gerät. " + (store.failedCloud || "");
  } else {
    hint.className = "hint bad";
    hint.textContent = "Noch keine Firebase-Zugangsdaten hinterlegt: Trips und Haken bleiben auf diesem Gerät, nichts wird geteilt. Trag die Web-Config in firebase-config.js ein, dann sehen alle dasselbe.";
  }

  const list = $("tripList");
  list.textContent = "";
  const codes = myTrips();
  $("tripsEmpty").hidden = codes.length > 0;

  const trips = await Promise.all(codes.map(async (code) => {
    try { return { code, trip: await store.getTrip(code) }; }
    catch (e) { return { code, trip: null }; }
  }));

  trips.forEach(({ code, trip }) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "trip-card";

    if (!trip) {
      card.innerHTML = '<div class="tc-top"><span class="tc-name"></span><span class="tc-count">weg</span></div>';
      card.querySelector(".tc-name").textContent = "Trip " + code;
      const foot = document.createElement("div");
      foot.className = "tc-foot";
      foot.innerHTML = '<span class="hint" style="margin:0">Nicht gefunden — gelöscht oder falscher Code.</span>';
      card.appendChild(foot);
      card.addEventListener("click", () => {
        forgetTrip(code);
        toast("Aus deiner Liste entfernt.");
        renderTrips();
      });
      list.appendChild(card);
      return;
    }

    const c = countOf(trip);
    card.classList.toggle("full", c.total > 0 && c.done === c.total);
    card.innerHTML =
      '<div class="tc-top"><span class="tc-name"></span><span class="tc-count"></span></div>' +
      '<div class="track"><div class="fill"></div></div>' +
      '<div class="tc-foot"><span class="faces"></span><span class="tc-code"></span></div>';
    card.querySelector(".tc-name").textContent = trip.name || "Trip";
    card.querySelector(".tc-count").textContent = c.done + "/" + c.total;
    card.querySelector(".fill").style.width = c.pct + "%";
    card.querySelector(".tc-code").textContent = code;

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

  showScreen("screenTrips");
}

/* ---------- Trip anlegen / beitreten ---------- */

const dlgNew = $("dlgNew"), dlgJoin = $("dlgJoin"), dlgCode = $("dlgCode");
document.querySelectorAll("[data-close]").forEach((b) => {
  b.addEventListener("click", () => b.closest("dialog").close());
});

$("newTripBtn").addEventListener("click", () => {
  $("newName").value = "";
  $("newErr").hidden = true;
  dlgNew.showModal();
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
    const code = await store.createTrip({ name, sections, by: user });
    rememberTrip(code);
    dlgNew.close();
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
  dlgJoin.showModal();
});

$("joinForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const code = $("joinCode").value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!code) return;
  const btn = $("joinSubmit");
  btn.disabled = true;
  btn.textContent = "Suche …";
  try {
    const trip = await store.getTrip(code);
    if (!trip) {
      $("joinErr").textContent = "Diesen Code gibt es nicht. Groß-/Kleinschreibung ist egal, aber jedes Zeichen zählt.";
      $("joinErr").hidden = false;
      return;
    }
    dlgJoin.close();
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
  try { await store.addMember(code, user); } catch (e) {}
  location.hash = "#/trip/" + code;
  route();
}

/* ---------- Trip-Ansicht ---------- */

let current = { code: null, trip: null, unsub: null, sig: "", ui: null, editing: false, nodes: {}, secNodes: {} };

$("backBtn").addEventListener("click", () => { location.hash = "#/trips"; });

function openTrip(code) {
  if (current.unsub) current.unsub();
  current = { code, trip: null, unsub: null, sig: "", ui: readUi(code), editing: false, nodes: {}, secNodes: {} };
  $("tripName").textContent = "Lädt …";
  $("tripCode").textContent = code;
  $("sections").textContent = "";
  $("hideDone").setAttribute("aria-pressed", current.ui.hideDone ? "true" : "false");
  $("editBtn").setAttribute("aria-pressed", "false");
  $("addSectionBtn").hidden = true;
  showScreen("screenTrip");

  let announced = false;
  current.unsub = store.watchTrip(code, (trip) => {
    if (!trip) {
      $("tripName").textContent = "Nicht gefunden";
      $("sections").innerHTML = '<div class="empty"><p><strong>Diesen Trip gibt es nicht mehr.</strong></p><p>Vielleicht ein Tippfehler im Code, oder er wurde gelöscht.</p></div>';
      return;
    }
    current.trip = trip;
    renderTrip();

    // Wer die Liste offen hat, gehoert dazu - greift auch nach einer Umbenennung
    // oder wenn jemand ueber einen Link statt ueber den Code reingekommen ist.
    if (!announced && !(trip.members || {})[memberKey(user)]) {
      announced = true;
      store.addMember(code, user).catch(() => {});
    }
  });
}

function renderTrip() {
  const trip = current.trip;
  $("tripName").textContent = trip.name || "Trip";
  $("tripCode").textContent = current.code;

  const members = Object.values(trip.members || {}).map((m) => m.name);
  $("tripMembers").textContent = members.length ? members.join(" · ") : "nur du";

  const sync = $("syncNote");
  if (store.mode !== "cloud") {
    sync.className = "sync warn";
    sync.textContent = "nur dieses Gerät";
  } else if (!navigator.onLine) {
    sync.className = "sync warn";
    sync.textContent = "offline — wird nachgereicht";
  } else {
    sync.className = "sync";
    sync.textContent = "live geteilt";
  }

  const sig = JSON.stringify(trip.sections);
  if (sig !== current.sig) {
    current.sig = sig;
    buildList();
  }
  paint();
}

function buildList() {
  const host = $("sections");
  host.textContent = "";
  current.nodes = {};
  current.secNodes = {};

  (current.trip.sections || []).forEach((sec) => {
    const root = document.createElement("section");
    root.className = "section";

    const head = document.createElement("button");
    head.type = "button";
    head.className = "section-head";
    head.innerHTML =
      '<span class="badge" aria-hidden="true"></span>' +
      '<span class="section-title"><span class="name"></span><span class="sub"></span></span>' +
      '<span class="count"></span>' +
      '<svg class="caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
    head.querySelector(".badge").textContent = sec.icon || "🎒";
    head.querySelector(".name").textContent = sec.name;
    const subEl = head.querySelector(".sub");
    if (sec.sub) subEl.textContent = sec.sub; else subEl.hidden = true;

    const list = document.createElement("ul");
    list.id = "list-" + sec.id;
    head.setAttribute("aria-controls", list.id);
    head.addEventListener("click", () => {
      const at = current.ui.collapsed.indexOf(sec.id);
      if (at >= 0) current.ui.collapsed.splice(at, 1); else current.ui.collapsed.push(sec.id);
      writeUi(current.code, current.ui);
      paint();
    });

    sec.items.forEach((item) => list.appendChild(buildRow(sec, item)));

    // Zeile zum Hinzufuegen, nur im Bearbeiten-Modus sichtbar
    const addLi = document.createElement("li");
    addLi.className = "add-li edit-only";
    addLi.hidden = true;
    const addRow = document.createElement("form");
    addRow.className = "add-row";
    addRow.innerHTML =
      '<input class="field" maxlength="60" placeholder="Was fehlt noch?" aria-label="Neue Position">' +
      '<select class="field kind-select" aria-label="Wer muss das packen?">' +
        '<option value="one">einer reicht</option>' +
        '<option value="each">jeder einzeln</option>' +
      '</select>' +
      '<button type="submit" class="btn primary">Hinzufügen</button>';
    addRow.addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = addRow.querySelector("input");
      const label = input.value.trim();
      if (!label) return;
      input.value = "";
      await addItem(sec.id, label, addRow.querySelector("select").value === "each");
    });
    addLi.appendChild(addRow);
    list.appendChild(addLi);

    root.appendChild(head);
    root.appendChild(list);
    host.appendChild(root);
    current.secNodes[sec.id] = { root, head, list, count: head.querySelector(".count") };
  });
}

function buildRow(sec, item) {
  const li = document.createElement("li");

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "row";
  btn.setAttribute("role", "checkbox");
  btn.innerHTML = '<span class="box" aria-hidden="true">' + CHECK_SVG + '</span><span class="label"><span class="text"></span></span>';
  btn.querySelector(".text").textContent = item.label;
  if (item.note) {
    const note = document.createElement("span");
    note.className = "note";
    note.textContent = item.note;
    btn.querySelector(".label").appendChild(note);
  }
  const meta = document.createElement("span");
  meta.className = "meta";
  btn.querySelector(".label").appendChild(meta);
  btn.addEventListener("click", () => { if (!current.editing) toggle(sec, item); });

  const kindBtn = document.createElement("button");
  kindBtn.type = "button";
  kindBtn.className = "kindbtn edit-only";
  kindBtn.hidden = true;
  kindBtn.addEventListener("click", () => setKind(sec.id, item.id));

  const del = document.createElement("button");
  del.type = "button";
  del.className = "del edit-only";
  del.hidden = true;
  del.title = "Position löschen";
  del.setAttribute("aria-label", "„" + item.label + "“ löschen");
  del.innerHTML = TRASH_SVG;
  del.addEventListener("click", () => removeItem(sec.id, item.id));

  const wrap = document.createElement("div");
  wrap.style.display = "flex";
  wrap.style.alignItems = "flex-start";
  wrap.style.gap = "8px";
  wrap.appendChild(btn);
  wrap.appendChild(kindBtn);
  wrap.appendChild(del);
  li.appendChild(wrap);

  current.nodes[item.id] = { li, btn, meta, del, kindBtn };
  return li;
}

function paint() {
  const trip = current.trip;
  const me = memberKey(user);

  (trip.sections || []).forEach((sec) => {
    const sn = current.secNodes[sec.id];
    if (!sn) return;
    let done = 0;

    sec.items.forEach((item) => {
      const n = current.nodes[item.id];
      if (!n) return;

      const marks = marksOf(trip, item.id);
      const mine = !!marks[me];
      const anyone = Object.keys(marks).length > 0;
      const checked = item.each ? mine : anyone;
      if (checked) done++;

      n.btn.setAttribute("aria-checked", checked ? "true" : "false");
      n.li.classList.toggle("is-hidden", current.ui.hideDone && checked && !current.editing);
      n.del.hidden = !current.editing;
      n.kindBtn.hidden = !current.editing;
      n.kindBtn.textContent = item.each ? "je Person" : "einer reicht";
      n.kindBtn.classList.toggle("each", !!item.each);
      n.kindBtn.setAttribute("aria-label", "„" + item.label + "“ umstellen auf " + (item.each ? "einer reicht" : "jeder einzeln"));

      n.meta.textContent = "";
      n.meta.classList.toggle("mine", !item.each && mine);

      if (item.each) {
        n.meta.appendChild(tag("je Person", "each"));
        const people = roster(trip, marks);
        const dots = document.createElement("span");
        dots.className = "dots";
        people.forEach((pp) => {
          const a = avatar(pp.name, marks[pp.key] ? "on" : "off");
          a.title = pp.name + (marks[pp.key] ? " hat's" : " fehlt noch");
          dots.appendChild(a);
        });
        n.meta.appendChild(dots);
        const cnt = document.createElement("span");
        cnt.className = "kind-count";
        cnt.textContent = Object.keys(marks).length + " von " + people.length;
        n.meta.appendChild(cnt);
      } else if (anyone) {
        const mark = Object.values(marks)[0];
        n.meta.appendChild(avatar(mark.by || "?"));
        const who = document.createElement("span");
        who.className = "by-name";
        who.textContent = marks[me] ? "von dir" : mark.by || "jemand";
        n.meta.appendChild(who);
        const w = when(mark.at);
        if (w) {
          const tm = document.createElement("span");
          tm.className = "by-when";
          tm.textContent = "· " + w;
          n.meta.appendChild(tm);
        }
      } else {
        n.meta.appendChild(tag("einer reicht", ""));
      }
    });

    sn.count.textContent = done + "/" + sec.items.length;
    sn.root.classList.toggle("done", sec.items.length > 0 && done === sec.items.length);
    const collapsed = current.ui.collapsed.includes(sec.id) && !current.editing;
    sn.root.classList.toggle("collapsed", collapsed);
    sn.list.hidden = collapsed;
    sn.head.setAttribute("aria-expanded", collapsed ? "false" : "true");
    const addLi = sn.list.querySelector(".add-li");
    if (addLi) addLi.hidden = !current.editing;
  });

  const c = countOf(trip);
  $("tallyDone").textContent = c.done;
  $("tallyTotal").textContent = c.total;
  $("fill").style.width = c.pct + "%";
  $("bar").setAttribute("aria-valuenow", String(c.pct));

  $("resetHint").textContent = store.mode === "cloud"
    ? "Löscht die Haken für alle im Trip, nicht nur bei dir."
    : "Löscht alle Haken in diesem Trip.";

  syncCollapseChip();
}

function tag(text, cls) {
  const el = document.createElement("span");
  el.className = "kind " + cls;
  el.textContent = text;
  return el;
}

async function toggle(sec, item) {
  const me = memberKey(user);
  const raw = (current.trip.checks || {})[item.id];
  const legacy = raw && typeof raw.by === "string";
  const marks = marksOf(current.trip, item.id);
  const mine = !!marks[me];
  const anyone = Object.keys(marks).length > 0;

  try {
    if (item.each) {
      if (legacy) {
        // Einmalig vom alten flachen Format auf die Map umstellen
        if (mine) delete marks[me]; else marks[me] = { by: user, at: Date.now() };
        await store.setMarks(current.code, item.id, marks);
      } else {
        await store.setMark(current.code, item.id, me, mine ? null : user);
      }
    } else if (anyone) {
      // "einer reicht": abwaehlen raeumt die Position ganz ab, egal wer sie gesetzt hat
      await store.setMarks(current.code, item.id, null);
    } else {
      await store.setMark(current.code, item.id, me, user);
    }
  } catch (err) {
    toast("Konnte nicht gespeichert werden.");
  }
}

/* ---------- Liste bearbeiten ---------- */

$("editBtn").addEventListener("click", () => {
  current.editing = !current.editing;
  $("editBtn").setAttribute("aria-pressed", current.editing ? "true" : "false");
  $("addSectionBtn").hidden = !current.editing;
  if (addSectionForm) { addSectionForm.remove(); addSectionForm = null; }
  paint();
});

async function addItem(sectionId, label, each) {
  const sections = structuredClone(current.trip.sections);
  const sec = sections.find((s) => s.id === sectionId);
  if (!sec) return;
  let id = sec.id + "__" + slug(label);
  const taken = new Set(sections.flatMap((s) => s.items.map((i) => i.id)));
  while (taken.has(id)) id += "-" + Math.floor(Math.random() * 100);
  sec.items.push({ id, label, note: "", each: !!each });
  try { await store.setSections(current.code, sections); }
  catch (err) { toast("Konnte nicht gespeichert werden."); }
}

/* Zwischen "jeder einzeln" und "einer reicht" umstellen. Die gesetzten Haken
   bleiben stehen - sie werden nur anders ausgewertet. */
async function setKind(sectionId, itemId) {
  const sections = structuredClone(current.trip.sections);
  const sec = sections.find((s) => s.id === sectionId);
  if (!sec) return;
  const item = sec.items.find((i) => i.id === itemId);
  if (!item) return;
  item.each = !item.each;
  try { await store.setSections(current.code, sections); }
  catch (err) { toast("Konnte nicht gespeichert werden."); }
}

async function removeItem(sectionId, itemId) {
  const sections = structuredClone(current.trip.sections);
  const sec = sections.find((s) => s.id === sectionId);
  if (!sec) return;
  sec.items = sec.items.filter((i) => i.id !== itemId);
  try {
    if ((current.trip.checks || {})[itemId]) await store.setMarks(current.code, itemId, null);
    await store.setSections(current.code, sections);
  } catch (err) { toast("Konnte nicht gespeichert werden."); }
}

let addSectionForm = null;
$("addSectionBtn").addEventListener("click", () => {
  if (addSectionForm) return;
  addSectionForm = document.createElement("form");
  addSectionForm.className = "add-row";
  addSectionForm.style.marginTop = "12px";
  addSectionForm.innerHTML = '<input class="field" maxlength="40" placeholder="Name des Bereichs" aria-label="Name des Bereichs"><button type="submit" class="btn primary">Anlegen</button>';
  addSectionForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = addSectionForm.querySelector("input").value.trim();
    if (!name) return;
    const sections = structuredClone(current.trip.sections);
    let id = slug(name);
    const taken = new Set(sections.map((s) => s.id));
    while (taken.has(id)) id += "-" + Math.floor(Math.random() * 100);
    sections.push({ id, icon: "🎒", name, sub: "", items: [] });
    addSectionForm.remove();
    addSectionForm = null;
    try { await store.setSections(current.code, sections); }
    catch (err) { toast("Konnte nicht gespeichert werden."); }
  });
  $("addSectionBtn").after(addSectionForm);
  addSectionForm.querySelector("input").focus();
});

/* ---------- Werkzeugleiste ---------- */

$("hideDone").addEventListener("click", () => {
  current.ui.hideDone = !current.ui.hideDone;
  $("hideDone").setAttribute("aria-pressed", current.ui.hideDone ? "true" : "false");
  writeUi(current.code, current.ui);
  paint();
});

function allCollapsed() {
  const secs = (current.trip && current.trip.sections) || [];
  return secs.length > 0 && secs.every((s) => current.ui.collapsed.includes(s.id));
}
function syncCollapseChip() {
  const all = allCollapsed();
  $("collapseAll").setAttribute("aria-pressed", all ? "true" : "false");
  $("collapseLabel").textContent = all ? "Alle ausklappen" : "Alle einklappen";
}
$("collapseAll").addEventListener("click", () => {
  const secs = (current.trip && current.trip.sections) || [];
  current.ui.collapsed = allCollapsed() ? [] : secs.map((s) => s.id);
  writeUi(current.code, current.ui);
  paint();
});

/* ---------- Code teilen ---------- */

function shareLink(code) {
  return location.origin + location.pathname + "#/join/" + code;
}

$("codeBtn").addEventListener("click", () => {
  $("codeBig").textContent = current.code;
  $("copyCode").textContent = navigator.share ? "Einladung teilen" : "Link kopieren";
  dlgCode.showModal();
});

$("copyCode").addEventListener("click", async () => {
  const code = current.code;
  const url = shareLink(code);
  const text = `Packliste „${current.trip.name}“ — Code ${code}\n${url}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: "Packliste", text });
    } else {
      await navigator.clipboard.writeText(url);
      toast("Link kopiert.");
    }
    dlgCode.close();
  } catch (e) { /* abgebrochen */ }
});

/* ---------- Zuruecksetzen und verlassen ---------- */

let armed = false, armTimer = null, cancelBtn = null;
function disarm() {
  armed = false;
  clearTimeout(armTimer);
  $("resetBtn").classList.remove("confirm");
  $("resetLabel").textContent = "Alle Haken löschen";
  if (cancelBtn) { cancelBtn.remove(); cancelBtn = null; }
}

$("resetBtn").addEventListener("click", async () => {
  if (!armed) {
    armed = true;
    $("resetBtn").classList.add("confirm");
    $("resetLabel").textContent = store.mode === "cloud" ? "Wirklich — für alle löschen" : "Wirklich alle Haken löschen";
    cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "cancel";
    cancelBtn.textContent = "Abbrechen";
    cancelBtn.addEventListener("click", disarm);
    $("resetRow").appendChild(cancelBtn);
    armTimer = setTimeout(disarm, 6000);
    return;
  }
  disarm();
  try {
    await store.clearChecks(current.code);
    window.scrollTo({ top: 0, behavior: "smooth" });
    toast("Alles wieder offen.");
  } catch (err) { toast("Konnte nicht zurückgesetzt werden."); }
});

$("leaveBtn").addEventListener("click", () => {
  forgetTrip(current.code);
  toast("Aus deiner Liste entfernt. Mit dem Code kommst du wieder rein.");
  location.hash = "#/trips";
});

/* ---------- Routing ---------- */

function route() {
  const hash = location.hash || "#/trips";
  const joinMatch = hash.match(/^#\/join\/([A-Za-z0-9]+)/);

  if (joinMatch) {
    const code = joinMatch[1].toUpperCase();
    if (!user) { pendingJoin = code; openGate({ changing: false }); return; }
    doJoin(code);
    return;
  }
  if (!user) { openGate({ changing: false }); return; }
  if (hash === "#/name") { openGate({ changing: true }); return; }

  const tripMatch = hash.match(/^#\/trip\/([A-Za-z0-9]+)/);
  if (tripMatch) {
    const code = tripMatch[1].toUpperCase();
    if (current.code !== code) openTrip(code);
    else showScreen("screenTrip");
    return;
  }

  if (current.unsub) { current.unsub(); current.unsub = null; current.code = null; }
  renderTrips();
}

window.addEventListener("hashchange", route);
window.addEventListener("online", () => { if (current.trip) renderTrip(); });
window.addEventListener("offline", () => { if (current.trip) renderTrip(); });

(async function start() {
  store = await createStore();
  route();

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
