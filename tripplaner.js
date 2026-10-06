/* TripPlaner - das grosse Planungswerkzeug, fest in Reisebuddy eingebaut.

   Frueher eine eigene Anwendung mit Spring-Boot-Backend auf localhost, die
   erst hochgefahren werden musste und am Handy gar nicht ging. Jetzt laeuft
   alles hier im Browser: Karte, Tagesplan, Strassenroute mit Kilometern und
   Fahrzeit, Orte in der Naehe entdecken, beste Reihenfolge, GPX und Google
   Maps. Gespeichert wird in denselben Stationen (`trip.stops`), die auch der
   Reiter Plan und die Karte zeigen - live fuer alle Mitreisenden.

   Aufbau:
     Tage      ergeben sich aus dem Zeitraum der Reise plus jedem Datum, das an
               einer Station steht. Stationen ohne Datum liegen in der
               Merkliste. Den Tag wechseln heisst: Datum der Station aendern.
     Reihen-   Innerhalb eines Tages zaehlt die Reihenfolge im Feld `stops`.
     folge     Gespeichert wird immer nach Datum sortiert, ohne Datum hinten.
     Route     Wird gerechnet, sobald sich die Stationen mit Ort aendern, und
               fuer die Uebersicht kurz auf dem Geraet gemerkt. */

import { formatDate, escapeHtml } from "./mapview.js";
import {
  PROFILE, KATEGORIEN, KAT, route, luftlinie, optimiere, wegLaenge, entdecke,
  sucheOrt, ortVon, gpx, googleLink, kmText, zeitText
} from "./routing.js";

const LEAFLET = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4";
const BACKEND = "http://localhost:8080";   // altes Uni-Projekt, nur noch zum Uebernehmen
const KEY_UI = "reisebuddy.v1.planer.";
const KEY_ROUTE = "reisebuddy.v1.route.";
const MAX_TAGE = 60;

/* Tagesfarben: kraeftig genug fuer helle und dunkle Karte. */
export const TAG_FARBEN = ["#0E8A62", "#2E7FA8", "#C4862A", "#B8462E", "#7A5BC2", "#1F9494", "#C2577A", "#6E8A1F"];
const GRAU = "#7A8880";

const $ = (id) => document.getElementById(id);

/* ---------- Reine Helfer, auch fuer die Uebersicht ---------- */

export const hatOrt = (s) => typeof s.lat === "number" && typeof s.lon === "number";

function isoPlus(iso, n) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/* Alle Tage der Reise: Zeitraum plus Daten an Stationen ausserhalb davon. */
export function reiseTage(trip) {
  const set = new Set();
  const t = trip || {};
  if (t.start) {
    const ende = t.end && t.end >= t.start ? t.end : t.start;
    for (let i = 0; i < MAX_TAGE; i++) {
      const d = isoPlus(t.start, i);
      if (d > ende) break;
      set.add(d);
    }
  }
  (t.stops || []).forEach((s) => { if (s.date) set.add(s.date); });
  return [...set].sort();
}

/* Welche Stationen faehrt die Route ab? Gibt es Stationen mit Datum und Ort,
   sind es die - die Merkliste ist dann nur ein Ideenspeicher. Sonst alle mit
   Ort in der gespeicherten Reihenfolge. */
export function routenStopps(stops) {
  const mitOrt = (stops || []).filter(hatOrt);
  const datiert = mitOrt.filter((s) => s.date);
  return datiert.length ? datiert : mitOrt;
}

export function routenSignatur(stops, profil) {
  return profil + "|" + routenStopps(stops).map((s) => s.lat.toFixed(4) + "," + s.lon.toFixed(4)).join(";");
}

function leseUi(code) {
  try { return JSON.parse(localStorage.getItem(KEY_UI + code) || "{}") || {}; }
  catch (e) { return {}; }
}

/* Gemerkte Routeninfo fuer die Uebersicht. Passt sie nicht mehr zu den
   Stationen, wird die Luftlinie geschaetzt. */
export function routenInfo(code, trip) {
  const stops = (trip && trip.stops) || [];
  const profil = leseUi(code).profil || "car";
  try {
    const roh = JSON.parse(localStorage.getItem(KEY_ROUTE + code) || "null");
    if (roh && roh.sig === routenSignatur(stops, profil)) return roh;
  } catch (e) {}
  const l = luftlinie(routenStopps(stops), profil);
  return { km: l.km, min: l.min, quelle: l.legs.length ? "luftlinie" : "leer" };
}

/* Kleine Routenskizze als SVG fuer Karten in Listen. */
export function skizze(stops, w = 120, h = 64) {
  const p = routenStopps(stops);
  if (!p.length) return "";
  const lats = p.map((s) => s.lat), lons = p.map((s) => s.lon);
  const minLa = Math.min(...lats), maxLa = Math.max(...lats);
  const minLo = Math.min(...lons), maxLo = Math.max(...lons);
  const sx = (maxLo - minLo) || 1, sy = (maxLa - minLa) || 1;
  const k = Math.min((w - 16) / sx, (h - 16) / sy);
  const ox = (w - sx * k) / 2, oy = (h - sy * k) / 2;
  const xy = p.map((s) => [
    p.length === 1 ? w / 2 : ox + (s.lon - minLo) * k,
    p.length === 1 ? h / 2 : h - (oy + (s.lat - minLa) * k)
  ]);
  const d = xy.map(([x, y], i) => (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1)).join(" ");
  return `<svg class="skizze" viewBox="0 0 ${w} ${h}" aria-hidden="true">`
    + (p.length > 1 ? `<path class="skizze-weg" d="${d}"/>` : "")
    + xy.map(([x, y], i) => `<circle class="skizze-pkt${i === 0 ? " a" : i === xy.length - 1 ? " z" : ""}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${i === 0 || i === xy.length - 1 ? 3.6 : 2.4}"/>`).join("")
    + "</svg>";
}

/* ---------- Leaflet ---------- */

let leafletLaedt = null;
function ladeLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletLaedt) return leafletLaedt;
  leafletLaedt = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href^="${LEAFLET}"]`)) {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = `${LEAFLET}/leaflet.min.css`;
      document.head.appendChild(css);
    }
    const js = document.createElement("script");
    js.src = `${LEAFLET}/leaflet.min.js`;
    js.async = true;
    const uhr = setTimeout(() => { leafletLaedt = null; reject(new Error("Zeitüberschreitung")); }, 12000);
    js.onload = () => { clearTimeout(uhr); resolve(window.L); };
    js.onerror = () => { clearTimeout(uhr); leafletLaedt = null; reject(new Error("Karte ließ sich nicht laden")); };
    document.head.appendChild(js);
  });
  return leafletLaedt;
}

/* ---------- Das Werkzeug ---------- */

export function initTripPlaner(ctx) {
  const el = {
    summe: $("plSumme"),
    status: $("plStatus"),
    profile: $("plProfile"),
    tage: $("plTage"),
    zeitraum: $("plZeitraum"),
    segs: document.querySelectorAll("[data-pl-pane]"),
    panes: { route: $("plPaneRoute"), find: $("plPaneFind"), data: $("plPaneData") },
    karte: $("plMap"),
    kartenNote: $("plMapNote"),
    fit: $("plFit"),
    spotsBtn: $("plSpotsToggle"),
    ziel: $("plZielTag"),
    such: $("plSuche"),
    suchBtn: $("plSucheBtn"),
    treffer: $("plTreffer"),
    katChips: $("plKats"),
    hier: $("plHier"),
    findStatus: $("plFindStatus"),
    funde: $("plFunde"),
    seite: $("plSeite")
  };

  let code = null;
  let ui = {};
  let map = null, L = null;
  let schichten = null;
  let markerVon = new Map();
  let fundMarker = new Map();
  let routeErg = null, routeSig = "", routeLaeuft = 0, routeUhr = null, routeGezeichnet = "";
  let plSig = "";
  let funde = [], katAktiv = null, fundeLaeuft = 0;
  let zeigeSpots = true;
  let ziehe = null;
  let kachelFehler = 0, kachelArt = "", kacheln = null;

  /* ---- Zustand pro Reise, nur auf diesem Geraet ---- */

  function schreibeUi() {
    try { localStorage.setItem(KEY_UI + code, JSON.stringify(ui)); } catch (e) {}
  }

  function reset(neu) {
    code = neu;
    ui = { profil: "car", pane: "route", ziel: null, ...leseUi(neu) };
    if (!PROFILE[ui.profil]) ui.profil = "car";
    routeErg = null; routeSig = ""; routeGezeichnet = ""; plSig = "";
    funde = []; katAktiv = null;
    el.funde.textContent = "";
    el.findStatus.textContent = "";
    el.treffer.textContent = "";
    el.treffer.hidden = true;
    el.such.value = "";
    el.tage.textContent = "";
    el.summe.textContent = "";
    setzeStatus("leer", "Lädt …");
    malKats();
    malProfile();
    setzePane(ui.pane, true);
    if (schichten) Object.values(schichten).forEach((g) => g.clearLayers());
  }

  /* ---- Bereiche: Route / Entdecken / Daten ---- */

  el.segs.forEach((b) => b.addEventListener("click", () => setzePane(b.dataset.plPane)));

  function setzePane(name, still) {
    if (!el.panes[name]) name = "route";
    ui.pane = name;
    if (code) schreibeUi();
    Object.entries(el.panes).forEach(([k, p]) => { p.hidden = k !== name; });
    el.segs.forEach((b) => {
      const an = b.dataset.plPane === name;
      b.setAttribute("aria-selected", an ? "true" : "false");
      b.tabIndex = an ? 0 : -1;
    });
    const marke = $("plSegMarke");
    const aktiv = document.querySelector(`[data-pl-pane="${name}"]`);
    if (marke && aktiv && aktiv.offsetWidth) {
      const x = aktiv.offsetLeft, w = aktiv.offsetWidth;
      if (still || !ctx.motion || !ctx.motion.aktiv()) {
        marke.style.transform = `translateX(${x}px)`;
        marke.style.width = w + "px";
      } else {
        ctx.motion.gsap.to(marke, { x, width: w, duration: .45, ease: "expo.out", overwrite: true });
      }
    }
    if (!still) {
      ctx.stagger(el.panes[name].children, { y: 12, stagger: .035 });
      el.seite.scrollTop = 0;
    }
  }

  /* ---- Verkehrsmittel ---- */

  function malProfile() {
    el.profile.textContent = "";
    Object.entries(PROFILE).forEach(([id, p]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "pl-profil";
      b.setAttribute("aria-pressed", ui.profil === id ? "true" : "false");
      b.innerHTML = PROFIL_SVG[id] + `<span>${p.label}</span>`;
      b.addEventListener("click", () => {
        if (ui.profil === id) return;
        ui.profil = id;
        schreibeUi();
        malProfile();
        plSig = "";
        render();
      });
      el.profile.appendChild(b);
    });
  }

  /* ---- Stationen lesen und schreiben ---- */

  const stopps = () => ((ctx.trip && ctx.trip.stops) || []);

  /* Eimer je Tag in Planreihenfolge, "" = Merkliste. */
  function eimer() {
    const m = new Map(reiseTage(ctx.trip).map((t) => [t, []]));
    m.set("", []);
    stopps().forEach((s) => {
      const k = s.date || "";
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(s);
    });
    return m;
  }

  function flach(m) {
    const keys = [...m.keys()].filter((k) => k).sort();
    return keys.flatMap((k) => m.get(k)).concat(m.get("") || []);
  }

  /* Firestore mag kein `undefined` - leere Felder weglassen. */
  function sauber(s) {
    const o = {};
    Object.entries(s).forEach(([k, v]) => { if (v !== undefined && v !== null) o[k] = v; });
    return o;
  }

  async function speichere(neu, meldung) {
    try {
      await ctx.store.setStops(ctx.code, neu.map(sauber));
      if (meldung) ctx.toast(meldung);
      return true;
    } catch (e) {
      ctx.toast("Konnte nicht gespeichert werden.");
      return false;
    }
  }

  function neueId() {
    return "s" + Date.now().toString(36) + Math.floor(Math.random() * 1e5).toString(36);
  }

  /* Wohin kommt Neues? Gewaehlter Tag, sonst der erste Reisetag, sonst die Merkliste. */
  function zielTag() {
    const tage = reiseTage(ctx.trip);
    if (ui.ziel === "") return "";
    if (ui.ziel && tage.includes(ui.ziel)) return ui.ziel;
    return tage[0] || "";
  }

  function tagName(iso) {
    const i = reiseTage(ctx.trip).indexOf(iso);
    return (i >= 0 ? "Tag " + (i + 1) + " " : "") + "(" + kurzDatum(iso) + ")";
  }

  function geplant(f) {
    return stopps().find((s) => s.name.toLowerCase() === f.name.toLowerCase()
      || (hatOrt(s) && Math.abs(s.lat - f.lat) < 2e-4 && Math.abs(s.lon - f.lon) < 2e-4));
  }

  /* Einen Ort einplanen - aus Entdecken, Ortssuche oder einem Kartentipp. */
  async function einplanen(ort, tag) {
    const schon = geplant(ort);
    if (schon) { ctx.toast(`„${schon.name}“ ist schon geplant.`); return false; }
    const m = eimer();
    const t = tag === undefined ? zielTag() : tag;
    if (!m.has(t)) m.set(t, []);
    const neu = {
      id: neueId(), name: ort.name.slice(0, 60), date: t, note: (ort.note || "").slice(0, 120),
      lat: ort.lat, lon: ort.lon, place: (ort.place || "").slice(0, 80)
    };
    if (ort.kat) neu.kat = ort.kat;
    m.get(t).push(neu);
    return speichere(flach(m), `„${neu.name}“ ${t ? "für " + tagName(t) : "in die Merkliste"} eingeplant.`);
  }

  async function verschiebe(id, schritt) {
    const m = eimer();
    for (const liste of m.values()) {
      const i = liste.findIndex((s) => s.id === id);
      if (i < 0) continue;
      const j = i + schritt;
      if (j < 0 || j >= liste.length) return;
      [liste[i], liste[j]] = [liste[j], liste[i]];
      return speichere(flach(m));
    }
  }

  async function verlege(id, tag, vorId) {
    const m = eimer();
    let stop = null;
    for (const liste of m.values()) {
      const i = liste.findIndex((s) => s.id === id);
      if (i >= 0) { stop = liste.splice(i, 1)[0]; break; }
    }
    if (!stop) return;
    stop = { ...stop, date: tag };
    if (!m.has(tag)) m.set(tag, []);
    const ziel = m.get(tag);
    const at = vorId ? ziel.findIndex((s) => s.id === vorId) : -1;
    if (at >= 0) ziel.splice(at, 0, stop); else ziel.push(stop);
    return speichere(flach(m));
  }

  async function entferne(id) {
    const s = stopps().find((x) => x.id === id);
    return speichere(stopps().filter((x) => x.id !== id), s ? `„${s.name}“ entfernt.` : "");
  }

  /* Letzte Station mit Ort vor diesem Tag - von dort geht es morgens los. */
  function vorgaenger(m, tag) {
    if (!tag) return null;
    const keys = [...m.keys()].filter((k) => k && k < tag).sort();
    for (let i = keys.length - 1; i >= 0; i--) {
      const l = m.get(keys[i]).filter(hatOrt);
      if (l.length) return l[l.length - 1];
    }
    return null;
  }

  async function optimiereTag(tag) {
    const m = eimer();
    const liste = m.get(tag) || [];
    const mit = liste.filter(hatOrt);
    const ohne = liste.filter((s) => !hatOrt(s));
    const vor = vorgaenger(m, tag);
    if (mit.length < (vor ? 2 : 3)) { ctx.toast("Dafür braucht der Tag mehr Stationen mit Ort."); return; }
    const vorher = wegLaenge(vor ? [vor, ...mit] : mit);
    const neu = optimiere(mit, vor);
    const nachher = wegLaenge(vor ? [vor, ...neu] : neu);
    if (nachher >= vorher - 0.05) { ctx.toast("Die Reihenfolge ist schon die kürzeste."); return; }
    m.set(tag, neu.concat(ohne));
    await speichere(flach(m), `Neu sortiert – rund ${kmText(vorher - nachher)} Luftlinie gespart.`);
  }

  /* ---- Darstellen ---- */

  function render() {
    if (!ctx.trip || !code) return;
    const sig = JSON.stringify([ctx.trip.start, ctx.trip.end, stopps(), ui.profil, zeigeSpots, (ctx.spots || []).length]);
    if (sig === plSig) return;
    plSig = sig;
    malZiel();
    malTage();
    malSumme();
    malKarte();
    planeRoute(false);
    if (funde.length) malFunde();
  }

  function kurzDatum(iso) {
    const d = new Date(iso + "T00:00:00");
    return isNaN(d) ? iso : d.toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" });
  }

  function farbeFuer(tag) {
    if (!tag) return GRAU;
    const i = reiseTage(ctx.trip).indexOf(tag);
    return TAG_FARBEN[(i < 0 ? 0 : i) % TAG_FARBEN.length];
  }

  function malZiel() {
    const tage = reiseTage(ctx.trip);
    const jetzt = zielTag();
    el.ziel.textContent = "";
    tage.forEach((t, i) => el.ziel.appendChild(new Option(`Tag ${i + 1} · ${kurzDatum(t)}`, t, false, t === jetzt)));
    el.ziel.appendChild(new Option(tage.length ? "Merkliste (noch ohne Tag)" : "Route", "", false, jetzt === ""));
    el.zeitraum.hidden = !!(ctx.trip && ctx.trip.start);
  }

  el.ziel.addEventListener("change", () => { ui.ziel = el.ziel.value; schreibeUi(); });

  /* Welche Etappe endet an welcher Station? */
  function etappen() {
    const out = new Map();
    if (!routeErg) return out;
    routenStopps(stopps()).forEach((s, i) => {
      if (i > 0 && routeErg.legs[i - 1]) out.set(s.id, routeErg.legs[i - 1]);
    });
    return out;
  }

  function malTage() {
    const m = eimer();
    const tage = reiseTage(ctx.trip);
    const legs = etappen();
    const nummer = new Map(flach(m).map((s, i) => [s.id, i + 1]));
    el.tage.textContent = "";

    tage.concat([""]).forEach((tag, ti) => {
      const liste = m.get(tag) || [];
      if (tag === "" && !liste.length && tage.length) {
        const hin = document.createElement("div");
        hin.className = "pl-merk-leer";
        hin.textContent = "Merkliste leer – Ideen ohne festen Tag landen hier.";
        dropZiel(hin, "");
        el.tage.appendChild(hin);
        return;
      }

      const sek = document.createElement("section");
      sek.className = "pl-tag" + (tag ? "" : " merk");
      sek.style.setProperty("--tag", farbeFuer(tag));
      sek.dataset.tag = tag;

      let km = 0, min = 0;
      liste.forEach((s) => { const l = legs.get(s.id); if (l) { km += l.km; min += l.min; } });

      const kopf = document.createElement("header");
      kopf.className = "pl-tag-kopf";
      const titel = tag ? `Tag ${ti + 1}` : (tage.length ? "Merkliste" : "Route");
      const unter = tag ? kurzDatum(tag) : (tage.length ? "noch ohne Tag" : "ohne Zeitraum");
      kopf.innerHTML =
        `<span class="pl-tag-punkt" aria-hidden="true"></span>`
        + `<span class="pl-tag-titel"><strong>${titel}</strong><small>${escapeHtml(unter)}</small></span>`
        + `<span class="pl-tag-zahl">${liste.length ? (liste.length === 1 ? "1 Stopp" : liste.length + " Stopps") : "frei"}${km ? `<br>${kmText(km)} · ${zeitText(min)}` : ""}</span>`;

      const werk = document.createElement("span");
      werk.className = "pl-tag-werk";
      if (liste.filter(hatOrt).length >= 2) {
        werk.appendChild(knopf("Reihenfolge optimieren", SVG.zauber, () => optimiereTag(tag)));
        const g = googleLink(liste, ui.profil);
        if (g) {
          const a = document.createElement("a");
          a.className = "pl-mini";
          a.href = g; a.target = "_blank"; a.rel = "noopener";
          a.title = "Diesen Tag in Google Maps öffnen";
          a.setAttribute("aria-label", a.title);
          a.innerHTML = SVG.navi;
          werk.appendChild(a);
        }
      }
      werk.appendChild(knopf("Station zu diesem Tag hinzufügen", SVG.plus, () => ctx.editStop && ctx.editStop(null, { date: tag })));
      kopf.appendChild(werk);
      kopf.addEventListener("click", (e) => {
        if (e.target.closest(".pl-tag-werk")) return;
        zeigeAufKarte(liste.filter(hatOrt));
        ui.ziel = tag; schreibeUi(); malZiel();
      });
      sek.appendChild(kopf);

      const ol = document.createElement("ol");
      ol.className = "pl-stopps";
      liste.forEach((s, i) => ol.appendChild(stoppZeile(s, i, liste.length, nummer.get(s.id), legs.get(s.id), tage)));
      if (!liste.length) {
        const leer = document.createElement("li");
        leer.className = "pl-leer";
        leer.textContent = "Noch frei. Tippe auf die Karte oder hol dir Ideen unter „Entdecken“.";
        ol.appendChild(leer);
      }
      sek.appendChild(ol);
      dropZiel(sek, tag);
      el.tage.appendChild(sek);
    });

    ctx.stagger(el.tage.children, { y: 14, stagger: .04 });
  }

  function knopf(titel, svg, fn) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pl-mini";
    b.title = titel;
    b.setAttribute("aria-label", titel);
    b.innerHTML = svg;
    b.addEventListener("click", (e) => { e.stopPropagation(); fn(b); });
    return b;
  }

  function stoppZeile(s, i, n, nr, leg, tage) {
    const li = document.createElement("li");
    li.className = "pl-stopp" + (hatOrt(s) ? "" : " ohne-ort");
    li.dataset.id = s.id;

    if (leg) {
      const e = document.createElement("div");
      e.className = "pl-etappe";
      e.innerHTML = `${PROFIL_SVG[ui.profil]}<span>${kmText(leg.km)} · ${zeitText(leg.min)}</span>`;
      li.appendChild(e);
    }

    const haupt = document.createElement("div");
    haupt.className = "pl-stopp-haupt";

    const num = document.createElement("span");
    num.className = "pl-nr";
    num.textContent = nr;
    haupt.appendChild(num);

    const body = document.createElement("button");
    body.type = "button";
    body.className = "pl-stopp-text";
    const kat = s.kat && KAT[s.kat];
    const unter = [kat ? kat.label : "", s.place || (hatOrt(s) ? "" : "noch kein Ort")].filter(Boolean).join(" · ");
    body.innerHTML = `<strong>${kat ? `<i aria-hidden="true">${kat.icon}</i> ` : ""}${escapeHtml(s.name)}</strong>`
      + (unter ? `<small>${escapeHtml(unter)}</small>` : "")
      + (s.note ? `<em>${escapeHtml(s.note)}</em>` : "");
    body.addEventListener("click", () => {
      if (hatOrt(s)) zeigeStopp(s);
      else if (ctx.editStop) ctx.editStop(s);
    });
    haupt.appendChild(body);

    const werk = document.createElement("span");
    werk.className = "pl-stopp-werk";
    const hoch = knopf("Nach oben", SVG.hoch, () => verschiebe(s.id, -1));
    hoch.disabled = i === 0;
    const runter = knopf("Nach unten", SVG.runter, () => verschiebe(s.id, 1));
    runter.disabled = i === n - 1;
    werk.appendChild(hoch);
    werk.appendChild(runter);

    const wahl = document.createElement("select");
    wahl.className = "pl-tagwahl";
    wahl.title = "Auf einen anderen Tag legen";
    wahl.setAttribute("aria-label", "Tag für " + s.name);
    tage.forEach((t, k) => wahl.appendChild(new Option(`T${k + 1}`, t, false, t === (s.date || ""))));
    wahl.appendChild(new Option("Merk", "", false, !s.date));
    wahl.addEventListener("change", () => verlege(s.id, wahl.value, null));
    wahl.addEventListener("click", (e) => e.stopPropagation());
    werk.appendChild(wahl);

    werk.appendChild(knopf("Bearbeiten", SVG.stift, () => ctx.editStop && ctx.editStop(s)));
    werk.appendChild(knopf("Entfernen", SVG.weg, (b) => {
      if (b.dataset.scharf !== "1") {
        b.dataset.scharf = "1";
        b.classList.add("scharf");
        b.title = "Nochmal tippen zum Entfernen";
        setTimeout(() => { b.dataset.scharf = "0"; b.classList.remove("scharf"); b.title = "Entfernen"; }, 3200);
        return;
      }
      entferne(s.id);
    }));
    haupt.appendChild(werk);
    li.appendChild(haupt);

    // Ziehen und Ablegen am Rechner. Am Handy gibt es die Pfeile und die Tagwahl.
    if (matchMedia("(pointer: fine)").matches) {
      li.draggable = true;
      li.addEventListener("dragstart", (e) => {
        ziehe = s.id;
        li.classList.add("zieht");
        e.dataTransfer.effectAllowed = "move";
        try { e.dataTransfer.setData("text/plain", s.id); } catch (x) {}
      });
      li.addEventListener("dragend", () => {
        ziehe = null;
        li.classList.remove("zieht");
        document.querySelectorAll(".pl-drop-vor,.pl-drop").forEach((x) => x.classList.remove("pl-drop-vor", "pl-drop"));
      });
      li.addEventListener("dragover", (e) => {
        if (!ziehe || ziehe === s.id) return;
        e.preventDefault();
        e.stopPropagation();
        document.querySelectorAll(".pl-drop-vor").forEach((x) => x.classList.remove("pl-drop-vor"));
        li.classList.add("pl-drop-vor");
      });
      li.addEventListener("drop", (e) => {
        if (!ziehe || ziehe === s.id) return;
        e.preventDefault();
        e.stopPropagation();
        const id = ziehe;
        ziehe = null;
        verlege(id, s.date || "", s.id);
      });
    }
    return li;
  }

  function dropZiel(node, tag) {
    node.addEventListener("dragover", (e) => {
      if (!ziehe) return;
      e.preventDefault();
      node.classList.add("pl-drop");
    });
    node.addEventListener("dragleave", (e) => {
      if (!node.contains(e.relatedTarget)) node.classList.remove("pl-drop");
    });
    node.addEventListener("drop", (e) => {
      node.classList.remove("pl-drop");
      if (!ziehe) return;
      e.preventDefault();
      const id = ziehe;
      ziehe = null;
      verlege(id, tag, null);
    });
  }

  function malSumme() {
    const alle = stopps();
    const tage = reiseTage(ctx.trip);
    const km = routeErg ? routeErg.km : 0;
    const min = routeErg ? routeErg.min : 0;
    const zellen = [
      ["Stationen", String(alle.length), alle.filter(hatOrt).length + " mit Ort"],
      ["Strecke", km ? kmText(km) : "–", routeErg ? (routeErg.quelle === "strasse" ? "auf der Straße" : "geschätzt") : "noch keine Route"],
      ["Unterwegs", min ? zeitText(min) : "–", PROFILE[ui.profil].label],
      ["Tage", tage.length ? String(tage.length) : "–", tage.length ? (ctx.trip.start ? "im Zeitraum" : "aus den Daten") : "kein Zeitraum"]
    ];
    el.summe.textContent = "";
    zellen.forEach(([k, v, u]) => {
      const d = document.createElement("div");
      d.className = "pl-zelle";
      d.innerHTML = `<span class="pl-zelle-k">${k}</span><b class="pl-zelle-v">${escapeHtml(v)}</b><small>${escapeHtml(u)}</small>`;
      el.summe.appendChild(d);
    });
  }

  function setzeStatus(art, text) {
    el.status.className = "pl-status " + art;
    el.status.innerHTML = `<i aria-hidden="true"></i><span>${escapeHtml(text)}</span>`;
  }

  /* ---- Route rechnen ---- */

  function planeRoute(sofort) {
    const folge = routenStopps(stopps());
    const sig = routenSignatur(stopps(), ui.profil);
    if (sig === routeSig && routeErg) { malRoute(); return; }
    clearTimeout(routeUhr);
    const nr = ++routeLaeuft;

    if (folge.length < 2) {
      routeErg = null; routeSig = sig;
      setzeStatus("leer", folge.length ? "Eine Station mit Ort – ab zwei gibt es eine Route." : "Noch keine Route – plane mindestens zwei Orte.");
      merkeRoute(sig, null);
      malSumme(); malRoute(); malTage();
      return;
    }

    // Sofort die Luftlinie zeigen, die echte Route kommt hinterher.
    routeErg = luftlinie(folge, ui.profil);
    malSumme(); malRoute();
    setzeStatus("laeuft", "Route wird berechnet …");

    routeUhr = setTimeout(async () => {
      const erg = await route(folge, ui.profil);
      if (nr !== routeLaeuft) return;
      routeErg = erg;
      routeSig = sig;
      setzeStatus(erg.quelle === "strasse" ? "gut" : "warn",
        erg.quelle === "strasse"
          ? `Straßenroute · ${PROFILE[ui.profil].label} · ${kmText(erg.km)} · ${zeitText(erg.min)}`
          : "Routendienst nicht erreichbar – Strecke aus der Luftlinie geschätzt");
      merkeRoute(sig, erg);
      malSumme(); malTage(); malRoute();
    }, sofort ? 0 : 350);
  }

  function merkeRoute(sig, erg) {
    try {
      localStorage.setItem(KEY_ROUTE + code, JSON.stringify(erg
        ? { sig, km: erg.km, min: erg.min, quelle: erg.quelle }
        : { sig, km: 0, min: 0, quelle: "leer" }));
    } catch (e) {}
  }

  /* ---- Karte ---- */

  async function karte() {
    if (map) return map;
    try {
      L = await ladeLeaflet();
      if (map) return map;
      map = L.map(el.karte, { zoomControl: false, attributionControl: true, worldCopyJump: true });
      L.control.zoom({ position: "bottomright" }).addTo(map);
      setzeKacheln();
      map.setView([51.3, 12.4], 5);
      schichten = {
        route: L.layerGroup().addTo(map),
        spots: L.layerGroup().addTo(map),
        funde: L.layerGroup().addTo(map),
        stopps: L.layerGroup().addTo(map)
      };
      map.on("click", kartenKlick);
      matchMedia("(prefers-color-scheme: dark)").addEventListener("change", setzeKacheln);
      el.kartenNote.hidden = true;
    } catch (e) {
      map = null;
      el.kartenNote.hidden = false;
      el.kartenNote.textContent = "Die Karte braucht eine Internetverbindung. Planen geht trotzdem – die Liste funktioniert.";
    }
    return map;
  }

  /* Kartenbilder: CARTO Voyager bzw. Dark Matter - ruhiger als die
     Standardkarte. Liefern die nicht, geht es mit OpenStreetMap weiter. */
  function setzeKacheln() {
    if (!map) return;
    const root = document.documentElement.dataset.theme;
    const dunkel = root === "dark" || (root !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
    const art = kachelFehler >= 5 ? "osm" : (dunkel ? "dark" : "voyager");
    if (art === kachelArt) return;
    kachelArt = art;
    if (kacheln) map.removeLayer(kacheln);
    const url = art === "osm"
      ? "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      : `https://{s}.basemaps.cartocdn.com/${art === "dark" ? "dark_all" : "rastertiles/voyager"}/{z}/{x}/{y}{r}.png`;
    kacheln = L.tileLayer(url, {
      maxZoom: 19,
      subdomains: "abcd",
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        + (art === "osm" ? "" : ' &copy; <a href="https://carto.com/attributions">CARTO</a>')
    }).addTo(map);
    kacheln.on("tileerror", () => {
      if (++kachelFehler === 5 && art !== "osm") setzeKacheln();
    });
  }

  /* Der Bildschirm ist sichtbar geworden: Karte laden bzw. neu vermessen. */
  async function activate() {
    routeGezeichnet = "";
    setzePane(ui.pane, true);
    await karte();
    plSig = "";
    render();
    if (!map) return;
    requestAnimationFrame(() => {
      if (!map) return;
      map.invalidateSize();
      passend(false);
      setzePane(ui.pane, true);
    });
  }

  let resizeUhr = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeUhr);
    resizeUhr = setTimeout(() => {
      if (map) map.invalidateSize();
      if (code) setzePane(ui.pane, true);
    }, 180);
  });

  function malKarte() {
    if (!map) return;
    schichten.stopps.clearLayers();
    markerVon = new Map();
    flach(eimer()).forEach((s, i) => {
      if (!hatOrt(s)) return;
      const mk = L.marker([s.lat, s.lon], {
        icon: L.divIcon({
          className: "",
          html: `<span class="pl-pin${s.date ? "" : " merk"}" style="--tag:${farbeFuer(s.date || "")}"><b>${i + 1}</b></span>`,
          iconSize: [30, 38], iconAnchor: [15, 36], popupAnchor: [0, -32]
        }),
        riseOnHover: true,
        title: s.name
      });
      mk.bindPopup(() => stoppPopup(s), { closeButton: false, className: "pl-popup" });
      mk.addTo(schichten.stopps);
      markerVon.set(s.id, mk);
    });

    schichten.spots.clearLayers();
    if (zeigeSpots) {
      (ctx.spots || []).filter(hatOrt).forEach((s) => {
        L.marker([s.lat, s.lon], {
          icon: L.divIcon({ className: "", html: `<span class="pl-spot">${SVG.stern}</span>`, iconSize: [24, 24], iconAnchor: [12, 12] }),
          title: s.title
        }).bindPopup(() => fundPopup({ name: s.title, lat: s.lat, lon: s.lon, place: s.placeName || "", art: "Spot von " + (s.by || "jemand") }),
          { closeButton: false, className: "pl-popup" })
          .addTo(schichten.spots);
      });
    }
  }

  function malRoute() {
    if (!map) return;
    const rl = schichten.route;
    rl.clearLayers();
    if (!routeErg || !routeErg.legs.length) return;
    const folge = routenStopps(stopps());
    const linien = [];
    routeErg.legs.forEach((leg, i) => {
      const ziel = folge[i + 1];
      if (!ziel) return;
      const pts = leg.linie || [[folge[i].lat, folge[i].lon], [ziel.lat, ziel.lon]];
      const strich = routeErg.quelle === "strasse" ? null : "2 9";
      L.polyline(pts, { className: "pl-routen-rand", color: "#ffffff", weight: 8, opacity: .85, lineCap: "round", lineJoin: "round", interactive: false }).addTo(rl);
      linien.push(L.polyline(pts, { color: farbeFuer(ziel.date || ""), weight: 4.5, opacity: .95, dashArray: strich, lineCap: "round", lineJoin: "round" })
        .bindTooltip(`${kmText(leg.km)} · ${zeitText(leg.min)}`, { sticky: true, className: "pl-tip" })
        .addTo(rl));
    });
    // Beim Oeffnen zeichnet sich die Route einmal selbst. Spaetere Aenderungen
    // erscheinen sofort - sonst flackert sie bei jedem Einplanen.
    if (routeErg.quelle === "strasse" && !routeGezeichnet) {
      routeGezeichnet = "1";
      zeichne(linien);
    }
  }

  function zeichne(linien) {
    const g = ctx.motion && ctx.motion.gsap;
    if (!g || !ctx.motion.aktiv()) return;
    let verz = 0;
    linien.forEach((ln) => {
      const p = ln.getElement && ln.getElement();
      if (!p || !p.getTotalLength) return;
      const len = p.getTotalLength();
      if (!len) return;
      const dauer = Math.min(1.1, .25 + len / 1600);
      g.fromTo(p, { strokeDasharray: len, strokeDashoffset: len },
        { strokeDashoffset: 0, duration: dauer, delay: verz, ease: "power2.inOut",
          onComplete: () => { p.style.strokeDasharray = ""; p.style.strokeDashoffset = ""; } });
      verz += dauer * .55;
    });
  }

  function passend(weich) {
    if (!map) return;
    const pts = stopps().filter(hatOrt).map((s) => [s.lat, s.lon]);
    funde.forEach((f) => pts.push([f.lat, f.lon]));
    if (!pts.length) return;
    if (pts.length === 1) { map.setView(pts[0], 12, { animate: weich }); return; }
    map.fitBounds(L.latLngBounds(pts), { padding: [46, 46], maxZoom: 14, animate: weich });
  }

  function zeigeAufKarte(liste) {
    if (!map || !liste.length) return;
    if (liste.length === 1) { map.flyTo([liste[0].lat, liste[0].lon], 13, { duration: .8 }); return; }
    map.flyToBounds(L.latLngBounds(liste.map((s) => [s.lat, s.lon])), { padding: [50, 50], maxZoom: 14, duration: .8 });
  }

  function zeigeStopp(s) {
    if (!map) return;
    map.flyTo([s.lat, s.lon], Math.max(map.getZoom(), 13), { duration: .7 });
    const mk = markerVon.get(s.id);
    if (mk) setTimeout(() => mk.openPopup(), 720);
  }

  el.fit.addEventListener("click", () => passend(true));
  el.spotsBtn.addEventListener("click", () => {
    zeigeSpots = !zeigeSpots;
    el.spotsBtn.setAttribute("aria-pressed", zeigeSpots ? "true" : "false");
    render();
  });

  function popupKnoepfe(d) {
    const reihe = document.createElement("div");
    reihe.className = "pl-pop-knoepfe";
    d.appendChild(reihe);
    return reihe;
  }

  function stoppPopup(s) {
    const d = document.createElement("div");
    d.className = "pl-pop";
    const kat = s.kat && KAT[s.kat];
    d.innerHTML = `<strong>${escapeHtml(s.name)}</strong>`
      + `<small>${escapeHtml([s.date ? formatDate(s.date) : "Merkliste", kat ? kat.label : ""].filter(Boolean).join(" · "))}</small>`
      + (s.place ? `<small>${escapeHtml(s.place)}</small>` : "")
      + (s.note ? `<em>${escapeHtml(s.note)}</em>` : "");
    const b = document.createElement("button");
    b.type = "button"; b.className = "btn"; b.textContent = "Bearbeiten";
    b.addEventListener("click", () => { map.closePopup(); if (ctx.editStop) ctx.editStop(s); });
    popupKnoepfe(d).appendChild(b);
    return d;
  }

  function fundPopup(f) {
    const d = document.createElement("div");
    d.className = "pl-pop";
    d.innerHTML = `<strong>${escapeHtml(f.name)}</strong>`
      + (f.art ? `<small>${escapeHtml(f.art)}</small>` : "")
      + (f.place || f.adresse ? `<small>${escapeHtml(f.place || f.adresse)}</small>` : "")
      + (f.zeiten ? `<small>Geöffnet: ${escapeHtml(f.zeiten)}</small>` : "");
    const reihe = popupKnoepfe(d);
    const schon = geplant(f);
    const b = document.createElement("button");
    b.type = "button"; b.className = "btn primary";
    b.textContent = schon ? "✓ geplant" : "+ Einplanen";
    b.disabled = !!schon;
    b.addEventListener("click", async () => {
      b.disabled = true;
      if (await einplanen({ name: f.name, lat: f.lat, lon: f.lon, place: f.place || f.adresse || f.art || "", kat: f.kat })) map.closePopup();
      else b.disabled = false;
    });
    reihe.appendChild(b);
    if (f.web && /^https?:\/\//.test(f.web)) {
      const a = document.createElement("a");
      a.className = "btn"; a.href = f.web; a.target = "_blank"; a.rel = "noopener"; a.textContent = "Website";
      reihe.appendChild(a);
    }
    return d;
  }

  /* Tipp auf die Karte: dort eine Station setzen. Der Ortsname wird erst
     beim Bestaetigen nachgeschlagen - eine Anfrage pro Station, nicht pro Tipp. */
  function kartenKlick(e) {
    const { lat, lng } = e.latlng;
    const d = document.createElement("div");
    d.className = "pl-pop";
    const t = zielTag();
    d.innerHTML = `<strong>Hier eine Station?</strong><small>${lat.toFixed(4)}, ${lng.toFixed(4)} · ${escapeHtml(t ? tagName(t) : "Merkliste")}</small>`;
    const b = document.createElement("button");
    b.type = "button"; b.className = "btn primary"; b.textContent = "+ Station setzen";
    b.addEventListener("click", async () => {
      b.disabled = true; b.textContent = "Ort wird gesucht …";
      const la = Math.round(lat * 1e6) / 1e6, lo = Math.round(lng * 1e6) / 1e6;
      const ort = await ortVon(la, lo);
      await einplanen({ name: ort.name, place: ort.place, lat: la, lon: lo });
      map.closePopup();
    });
    popupKnoepfe(d).appendChild(b);
    L.popup({ closeButton: false, className: "pl-popup" }).setLatLng(e.latlng).setContent(d).openOn(map);
  }

  /* ---- Entdecken ---- */

  function malKats() {
    el.katChips.textContent = "";
    KATEGORIEN.forEach((k) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip pl-kat";
      b.setAttribute("aria-pressed", katAktiv === k.id ? "true" : "false");
      b.innerHTML = `<i aria-hidden="true">${k.icon}</i>${k.label}`;
      b.addEventListener("click", () => {
        katAktiv = k.id;
        malKats();
        sucheHier();
      });
      el.katChips.appendChild(b);
    });
  }

  el.hier.addEventListener("click", () => {
    if (!katAktiv) { katAktiv = "sehens"; malKats(); }
    sucheHier();
  });

  async function sucheHier() {
    await karte();
    if (!map) {
      el.findStatus.className = "pl-find-status warn";
      el.findStatus.textContent = "Ohne Karte kein Kartenausschnitt – erst Internet, dann klappt es.";
      return;
    }
    const b = map.getBounds();
    const nr = ++fundeLaeuft;
    el.findStatus.className = "pl-find-status laeuft";
    el.findStatus.textContent = `Suche „${KAT[katAktiv].label}“ im Kartenausschnitt …`;
    el.funde.innerHTML = '<div class="pl-skelett"></div><div class="pl-skelett"></div><div class="pl-skelett"></div>';
    el.hier.disabled = true;
    try {
      const erg = await entdecke(katAktiv, { s: b.getSouth(), w: b.getWest(), n: b.getNorth(), e: b.getEast() });
      if (nr !== fundeLaeuft) return;
      funde = erg;
      el.findStatus.className = "pl-find-status";
      el.findStatus.textContent = erg.length
        ? `${erg.length} Treffer – die nächstgelegenen zuerst`
        : "Hier nichts gefunden. Karte verschieben oder herauszoomen und nochmal suchen.";
      malFunde();
      if (erg.length) map.flyToBounds(L.latLngBounds(erg.map((f) => [f.lat, f.lon])), { padding: [40, 40], maxZoom: 15, duration: .7 });
    } catch (e) {
      if (nr !== fundeLaeuft) return;
      funde = [];
      el.funde.textContent = "";
      el.findStatus.className = "pl-find-status warn";
      el.findStatus.textContent = "Der Ortsdienst von OpenStreetMap antwortet gerade nicht. Gleich nochmal versuchen.";
      malFundMarker();
    } finally {
      if (nr === fundeLaeuft) el.hier.disabled = false;
    }
  }

  function malFunde() {
    el.funde.textContent = "";
    funde.forEach((f) => {
      const k = document.createElement("article");
      k.className = "pl-fund";
      const schon = !!geplant(f);
      k.innerHTML = `<span class="pl-fund-ico" aria-hidden="true">${KAT[f.kat].icon}</span>`
        + `<div class="pl-fund-text"><strong>${escapeHtml(f.name)}</strong>`
        + `<small>${escapeHtml([f.art, f.km < 1 ? Math.round(f.km * 1000) + " m" : kmText(f.km)].filter(Boolean).join(" · "))}</small>`
        + (f.adresse ? `<small>${escapeHtml(f.adresse)}</small>` : "") + "</div>";
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn pl-fund-plus" + (schon ? "" : " primary");
      b.textContent = schon ? "✓" : "+";
      b.disabled = schon;
      b.setAttribute("aria-label", schon ? f.name + " ist schon geplant" : f.name + " einplanen");
      b.addEventListener("click", async (e) => {
        e.stopPropagation();
        b.disabled = true;
        const ok = await einplanen({ name: f.name, lat: f.lat, lon: f.lon, place: f.adresse || f.art || "", kat: f.kat });
        if (ok) { b.textContent = "✓"; b.classList.remove("primary"); ctx.feiern(b); }
        else b.disabled = false;
      });
      k.appendChild(b);
      k.addEventListener("click", () => {
        if (!map) return;
        map.flyTo([f.lat, f.lon], Math.max(map.getZoom(), 15), { duration: .6 });
        const mk = fundMarker.get(f.id);
        if (mk) setTimeout(() => mk.openPopup(), 640);
      });
      el.funde.appendChild(k);
    });
    ctx.stagger(el.funde.children, { y: 10, stagger: .025 });
    malFundMarker();
  }

  function malFundMarker() {
    if (!map) return;
    schichten.funde.clearLayers();
    fundMarker = new Map();
    funde.forEach((f) => {
      if (geplant(f)) return;   // steht schon als Station auf der Karte
      const mk = L.marker([f.lat, f.lon], {
        icon: L.divIcon({ className: "", html: `<span class="pl-fundpin">${KAT[f.kat].icon}</span>`, iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -12] }),
        title: f.name
      }).bindPopup(() => fundPopup(f), { closeButton: false, className: "pl-popup" });
      mk.addTo(schichten.funde);
      fundMarker.set(f.id, mk);
    });
  }

  /* Ortssuche oben im Bereich Entdecken */
  async function suche() {
    const q = el.such.value.trim();
    if (q.length < 3) {
      el.findStatus.className = "pl-find-status warn";
      el.findStatus.textContent = "Mindestens drei Zeichen zum Suchen.";
      return;
    }
    el.suchBtn.disabled = true;
    el.suchBtn.textContent = "Sucht …";
    el.treffer.textContent = "";
    el.treffer.hidden = true;
    try {
      const hits = await sucheOrt(q);
      if (!hits.length) {
        el.findStatus.className = "pl-find-status warn";
        el.findStatus.textContent = "Dazu nichts gefunden – anders schreiben?";
        return;
      }
      el.findStatus.textContent = "";
      hits.forEach((h) => {
        const z = document.createElement("div");
        z.className = "pl-hit";
        const t = document.createElement("button");
        t.type = "button";
        t.className = "pl-hit-text";
        t.innerHTML = `<strong>${escapeHtml(h.name)}</strong><small>${escapeHtml(h.voll)}</small>`;
        t.addEventListener("click", async () => {
          await karte();
          if (!map) return;
          if (h.box) map.flyToBounds([[h.box[0], h.box[2]], [h.box[1], h.box[3]]], { maxZoom: 14, duration: .8 });
          else map.flyTo([h.lat, h.lon], 13, { duration: .8 });
        });
        const plus = document.createElement("button");
        plus.type = "button";
        plus.className = "btn primary pl-fund-plus";
        plus.textContent = "+";
        plus.setAttribute("aria-label", h.name + " einplanen");
        plus.addEventListener("click", async () => {
          plus.disabled = true;
          if (await einplanen({ name: h.name, place: h.place, lat: h.lat, lon: h.lon })) { plus.textContent = "✓"; ctx.feiern(plus); }
          else plus.disabled = false;
        });
        z.appendChild(t);
        z.appendChild(plus);
        el.treffer.appendChild(z);
      });
      el.treffer.hidden = false;
      ctx.stagger(el.treffer.children, { y: 8, stagger: .03 });
    } catch (e) {
      el.findStatus.className = "pl-find-status warn";
      el.findStatus.textContent = "Die Ortssuche war nicht erreichbar.";
    } finally {
      el.suchBtn.disabled = false;
      el.suchBtn.textContent = "Suchen";
    }
  }
  el.suchBtn.addEventListener("click", suche);
  el.such.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); suche(); } });

  /* ---- Daten: hinaus und herein ---- */

  $("plGpx").addEventListener("click", () => {
    const reihe = flach(eimer());
    if (!reihe.some(hatOrt)) { ctx.toast("Noch keine Station mit Ort."); return; }
    const name = (ctx.trip && ctx.trip.name) || "Reise";
    const datei = new Blob([gpx(name, reihe, routeErg && routeErg.quelle === "strasse" ? routeErg.linie : null)], { type: "application/gpx+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(datei);
    a.download = (name.replace(/[^\wäöüÄÖÜß -]/g, "").trim().replace(/\s+/g, "-") || "Reise") + ".gpx";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    ctx.toast("GPX gespeichert – lässt sich in Komoot, OsmAnd oder Garmin laden.");
  });

  $("plGoogle").addEventListener("click", () => {
    const folge = routenStopps(stopps());
    const link = googleLink(folge, ui.profil);
    if (!link) { ctx.toast("Noch keine Station mit Ort."); return; }
    window.open(link, "_blank", "noopener");
    if (folge.length > 11) ctx.toast("Google Maps nimmt nur elf Punkte – für mehr nimm die Knöpfe an den Tagen.");
  });

  $("plTeilen").addEventListener("click", async () => {
    const text = planText();
    try {
      if (navigator.share) await navigator.share({ title: (ctx.trip && ctx.trip.name) || "Reiseplan", text });
      else { await navigator.clipboard.writeText(text); ctx.toast("Reiseplan kopiert."); }
    } catch (e) { /* abgebrochen */ }
  });

  function planText() {
    const m = eimer();
    const tage = reiseTage(ctx.trip);
    const legs = etappen();
    const zeilen = [`${(ctx.trip && ctx.trip.name) || "Reise"} – Reiseplan`];
    if (routeErg && routeErg.km) zeilen.push(`${kmText(routeErg.km)} · ${zeitText(routeErg.min)} (${PROFILE[ui.profil].label})`);
    tage.concat([""]).forEach((t, i) => {
      const l = m.get(t) || [];
      if (!l.length) return;
      zeilen.push("", t ? `Tag ${i + 1} – ${kurzDatum(t)}` : "Merkliste");
      l.forEach((s) => {
        const leg = legs.get(s.id);
        zeilen.push(`• ${s.name}${s.place ? " (" + s.place + ")" : ""}${leg ? ` – ${kmText(leg.km)}, ${zeitText(leg.min)}` : ""}`);
      });
    });
    return zeilen.join("\n");
  }

  /* Austauschformat des alten TripPlaners, damit Daten aus dem Uni-Projekt
     weiter hereinkommen und hinausgehen. */
  $("plKopieren").addEventListener("click", async () => {
    const t = ctx.trip || {};
    const text = JSON.stringify({
      quelle: "reisebuddy",
      reise: t.name || "", von: t.start || "", bis: t.end || "",
      stationen: stopps().map((s) => ({
        name: s.name, datum: s.date || "", notiz: s.note || "",
        latitude: hatOrt(s) ? s.lat : null, longitude: hatOrt(s) ? s.lon : null
      }))
    }, null, 1);
    try { await navigator.clipboard.writeText(text); ctx.toast("Stationen als JSON kopiert."); }
    catch (e) {
      const f = $("plJson");
      f.value = text; f.select();
      ctx.toast("Markiert – mit Strg+C kopieren.");
    }
  });

  $("plImport").addEventListener("click", async () => {
    const roh = $("plJson").value.trim();
    if (!roh) { fehler("Erst Daten einfügen."); return; }
    let daten;
    try { daten = JSON.parse(roh); } catch (e) { fehler("Das ist kein gültiges JSON. Text nochmal komplett kopieren."); return; }
    if (await importiere(daten)) $("plJson").value = "";
  });

  $("plAltHolen").addEventListener("click", async () => {
    const id = $("plAltId").value.trim();
    const btn = $("plAltHolen");
    if (!id) { fehler("Sitzungs-ID eintragen – sie beginnt mit „trip-“."); return; }
    btn.disabled = true; btn.textContent = "Hole …";
    try {
      const res = await fetch(`${BACKEND}/api/sessions/${encodeURIComponent(id)}/pois`, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error("HTTP " + res.status);
      await importiere(await res.json());
    } catch (e) {
      fehler("Das alte Backend auf localhost:8080 war nicht erreichbar. Gebraucht wird es aber nicht mehr – geplant wird jetzt direkt hier.");
    } finally {
      btn.disabled = false; btn.textContent = "Holen";
    }
  });

  function fehler(t) {
    const e = $("plDatenErr");
    e.textContent = t;
    e.hidden = false;
    setTimeout(() => { e.hidden = true; }, 7000);
  }

  async function importiere(daten) {
    const roh = Array.isArray(daten) ? daten
      : (daten && Array.isArray(daten.pois)) ? daten.pois
      : (daten && Array.isArray(daten.stationen)) ? daten.stationen
      : (daten && Array.isArray(daten.stops)) ? daten.stops
      : null;
    if (!roh) { fehler("In den Daten steckt keine Liste von Orten."); return false; }
    const zahl = (v) => {
      const n = typeof v === "string" ? parseFloat(v) : v;
      return typeof n === "number" && isFinite(n) ? Math.round(n * 1e6) / 1e6 : null;
    };
    const neu = roh.map((p) => {
      const lat = zahl(p.latitude ?? p.lat), lon = zahl(p.longitude ?? p.lon ?? p.lng);
      const e = {
        id: neueId(),
        name: String(p.name || p.title || "Ohne Namen").slice(0, 60),
        date: /^\d{4}-\d{2}-\d{2}$/.test(String(p.datum || p.date || "").slice(0, 10)) ? String(p.datum || p.date).slice(0, 10) : "",
        note: String(p.notiz || p.note || p.description || "").slice(0, 120)
      };
      if (lat !== null && lon !== null) { e.lat = lat; e.lon = lon; e.place = String(p.place || p.category || "").slice(0, 80); }
      return e;
    }).filter((s) => s.name);
    if (!neu.length) { fehler("Kein brauchbarer Ort dabei."); return false; }
    const da = stopps().map((s) => s.name.toLowerCase());
    const frisch = neu.filter((s) => !da.includes(s.name.toLowerCase()));
    const m = eimer();
    frisch.forEach((s) => { const k = s.date || ""; if (!m.has(k)) m.set(k, []); m.get(k).push(s); });
    const doppelt = neu.length - frisch.length;
    return speichere(flach(m), `${frisch.length === 1 ? "1 Station" : frisch.length + " Stationen"} übernommen`
      + (doppelt ? ` · ${doppelt === 1 ? "1 war" : doppelt + " waren"} schon da` : ""));
  }

  let leerScharf = false;
  $("plLeeren").addEventListener("click", async () => {
    const b = $("plLeeren");
    if (!stopps().length) { ctx.toast("Es gibt keine Stationen."); return; }
    if (!leerScharf) {
      leerScharf = true;
      b.textContent = "Wirklich alle Stationen löschen?";
      setTimeout(() => { leerScharf = false; b.textContent = "Alle Stationen löschen"; }, 5000);
      return;
    }
    leerScharf = false;
    b.textContent = "Alle Stationen löschen";
    await speichere([], "Alle Stationen gelöscht.");
  });

  $("plZeitraumBtn").addEventListener("click", () => ctx.editTrip && ctx.editTrip());
  $("plNeuBtn").addEventListener("click", () => ctx.editStop && ctx.editStop(null, { date: zielTag() }));

  return { render, activate, reset };
}

/* ---------- Symbole ---------- */

const S = (d, w = 2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

const SVG = {
  hoch: S('<path d="M18 15l-6-6-6 6"/>', 2.4),
  runter: S('<path d="M6 9l6 6 6-6"/>', 2.4),
  stift: S('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  weg: S('<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>'),
  plus: S('<path d="M12 5v14M5 12h14"/>', 2.4),
  zauber: S('<path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8L19 13M17.8 6.2L19 5M3 21l9-9M12.2 6.2L11 5"/>'),
  navi: S('<path d="M3 11l19-9-9 19-2-8z"/>'),
  stern: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z"/></svg>'
};

export const PROFIL_SVG = {
  car: S('<path d="M5 17h14M3 17v-4l2-5a2 2 0 0 1 2-1h10a2 2 0 0 1 2 1l2 5v4"/><circle cx="7.5" cy="17.5" r="1.8"/><circle cx="16.5" cy="17.5" r="1.8"/><path d="M3 13h18"/>'),
  bike: S('<circle cx="6" cy="17" r="3.5"/><circle cx="18" cy="17" r="3.5"/><path d="M6 17l4-8h5l3 8M10 9l-1-3H7M15 9l-3 8"/>'),
  foot: S('<circle cx="13" cy="4" r="1.8"/><path d="M10 21l2-6-2-3 1-5 3 3h3M9 9l-2 3"/>')
};
