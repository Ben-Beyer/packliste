/* Start-Dashboard und Reiseauswahl fuer den TripPlaner.

   Das Dashboard ist die Startseite: zwei grosse Werkzeuge - Packliste und
   TripPlaner -, darunter die naechste Reise im Rampenlicht, Kennzahlen ueber
   alle Reisen und die Reiseliste mit Schnellzugriff auf beide Werkzeuge.

   Alles hier ist Anzeige. Die Daten (Reisen samt Inhalt) holt app.js und
   reicht sie als Liste {code, trip} herein; die Bewegung kommt aus motion.js
   und hat wie ueberall einen stillen Notweg. */

import { formatDate, escapeHtml } from "./mapview.js";
import { reiseTage, routenInfo, skizze, hatOrt } from "./tripplaner.js";
import { kmText } from "./routing.js";

const $ = (id) => document.getElementById(id);

export function initDashboard(ctx) {
  /* Karten neigen sich zum Zeiger und tragen ein Licht mit - nur mit Maus. */
  if (matchMedia("(pointer: fine)").matches && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    document.querySelectorAll(".mod").forEach((k) => {
      k.addEventListener("pointermove", (e) => {
        const r = k.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width;
        const y = (e.clientY - r.top) / r.height;
        k.style.setProperty("--mx", (x * 100).toFixed(1) + "%");
        k.style.setProperty("--my", (y * 100).toFixed(1) + "%");
        k.style.setProperty("--rx", ((.5 - y) * 7).toFixed(2) + "deg");
        k.style.setProperty("--ry", ((x - .5) * 9).toFixed(2) + "deg");
      });
      k.addEventListener("pointerleave", () => {
        k.style.setProperty("--rx", "0deg");
        k.style.setProperty("--ry", "0deg");
      });
    });
  }

  document.querySelectorAll("[data-go]").forEach((b) => {
    b.addEventListener("click", () => { location.hash = b.dataset.go; });
  });

  /* ---------- Startseite ---------- */

  function renderHome(liste, { erstes } = {}) {
    const name = ctx.user;
    const jetzt = new Date();
    const h = jetzt.getHours();
    const gruss = h < 5 ? "Gute Nacht" : h < 11 ? "Guten Morgen" : h < 17 ? "Guten Tag" : h < 22 ? "Guten Abend" : "Gute Nacht";
    $("homeDate").textContent = jetzt.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });
    $("homeGreet").textContent = `${gruss}, ${name.split(" ")[0]}.`;
    $("homeGreet").dataset.split = "";
    $("homeWhoName").textContent = name;
    const av = $("homeWhoAvatar");
    av.replaceWith(Object.assign(ctx.avatar(name), { id: "homeWhoAvatar" }));

    const reisen = liste.filter((x) => x.trip);
    const naechste = waehleNaechste(reisen);

    // Kennzahlen ueber alle Reisen
    let done = 0, total = 0, stationen = 0, km = 0, leute = new Set();
    reisen.forEach(({ code, trip }) => {
      const c = ctx.packCount(trip);
      done += c.done; total += c.total;
      stationen += (trip.stops || []).length;
      km += routenInfo(code, trip).km || 0;
      Object.keys(trip.members || {}).forEach((k) => leute.add(k));
    });
    const pct = total ? Math.round(done / total * 100) : 0;

    $("homeLead").textContent = !reisen.length
      ? "Leg deine erste Reise an – dann packst und planst du sie hier gemeinsam."
      : naechste && naechste.tageBis > 0
        ? `„${naechste.trip.name}“ startet in ${naechste.tageBis === 1 ? "einem Tag" : naechste.tageBis + " Tagen"}. Packen oder planen?`
        : naechste && naechste.laeuft
          ? `Ihr seid unterwegs – „${naechste.trip.name}“ läuft gerade.`
          : "Was steht an – packen oder planen?";

    // Modulkarten
    $("modPackStat").innerHTML = total
      ? `<b data-zahl="${pct}">${pct}</b><span>% gepackt</span><em>${total - done} offen</em>`
      : `<b>${reisen.length}</b><span>${reisen.length === 1 ? "Reise" : "Reisen"}</span><em>bereit zum Packen</em>`;
    $("modPlanStat").innerHTML = stationen
      ? `<b data-zahl="${stationen}">${stationen}</b><span>${stationen === 1 ? "Station" : "Stationen"}</span><em>${km ? kmText(km) + " geplant" : "noch ohne Route"}</em>`
      : `<b>0</b><span>Stationen</span><em>Route, Karte, Entdecken</em>`;
    $("modPackRing").style.setProperty("--p", pct);
    $("modPackRingZahl").textContent = total ? pct + "%" : "–";
    $("modPackRingZahl").dataset.zahl = total ? pct : "";
    $("modPackRingZahl").dataset.suffix = "%";

    // Naechste Reise
    const karte = $("homeNext");
    if (naechste) {
      karte.hidden = false;
      malNaechste(naechste);
    } else {
      karte.hidden = true;
    }

    // Kennzahlen
    const kpis = [
      ["Reisen", reisen.length, "", reisen.length === 1 ? "auf diesem Gerät" : "auf diesem Gerät"],
      ["Gepackt", pct, "%", total ? `${done} von ${total} für dich` : "noch keine Liste"],
      ["Stationen", stationen, "", stationen ? "über alle Reisen" : "noch nichts geplant"],
      ["Strecke", Math.round(km), " km", km ? "Route über alle Reisen" : "plane im TripPlaner"]
    ];
    const kw = $("homeKpis");
    kw.textContent = "";
    kpis.forEach(([k, v, suf, note]) => {
      const d = document.createElement("div");
      d.className = "kpi tilt";
      d.innerHTML = `<span class="kpi-k">${k}</span><b class="kpi-v"><span data-zahl="${v}" data-suffix="${escapeHtml(suf)}">${v.toLocaleString("de-DE")}${suf}</span></b><small>${escapeHtml(note)}</small>`;
      kw.appendChild(d);
    });
    $("homeKpiNote").textContent = leute.size > 1 ? `${leute.size} Leute reisen mit dir.` : "";

    // Reiseliste
    const host = $("homeTrips");
    host.textContent = "";
    $("homeTripsEmpty").hidden = liste.length > 0;
    liste.forEach(({ code, trip }) => host.appendChild(reiseZeile(code, trip)));

    if (ctx.motion) ctx.motion.dashboard($("screenHome"), { erstes });
  }

  function waehleNaechste(reisen) {
    const heute = new Date(); heute.setHours(0, 0, 0, 0);
    const mit = reisen.map((r) => {
      const s = r.trip.start ? new Date(r.trip.start + "T00:00:00") : null;
      const e = r.trip.end ? new Date(r.trip.end + "T00:00:00") : s;
      const tageBis = s ? Math.round((s - heute) / 86400000) : null;
      return { ...r, tageBis, laeuft: s && s <= heute && e >= heute, vorbei: e && e < heute };
    });
    return mit.find((r) => r.laeuft)
      || mit.filter((r) => r.tageBis !== null && r.tageBis >= 0).sort((a, b) => a.tageBis - b.tageBis)[0]
      || mit.find((r) => r.tageBis === null)
      || mit[0] || null;
  }

  function malNaechste(r) {
    const { code, trip } = r;
    const c = ctx.packCount(trip);
    const info = routenInfo(code, trip);
    const tage = reiseTage(trip).length;
    $("nextName").textContent = trip.name || "Reise";
    $("nextWhen").textContent = trip.start
      ? formatDate(trip.start) + (trip.end && trip.end !== trip.start ? " – " + formatDate(trip.end) : "")
      : "Noch kein Zeitraum";
    const zahl = $("nextZahl"), einheit = $("nextEinheit");
    if (r.laeuft) { zahl.textContent = "jetzt"; zahl.dataset.zahl = ""; einheit.textContent = "unterwegs"; }
    else if (r.tageBis !== null && r.tageBis >= 0) {
      zahl.textContent = r.tageBis; zahl.dataset.zahl = r.tageBis;
      einheit.textContent = r.tageBis === 1 ? "Tag bis zur Abfahrt" : r.tageBis === 0 ? "heute geht's los" : "Tage bis zur Abfahrt";
    } else if (r.vorbei) { zahl.textContent = "✓"; zahl.dataset.zahl = ""; einheit.textContent = "Reise vorbei"; }
    else { zahl.textContent = "–"; zahl.dataset.zahl = ""; einheit.textContent = "Zeitraum festlegen"; }

    $("nextRing").style.setProperty("--p", c.pct);
    $("nextRingZahl").textContent = c.pct + "%";
    $("nextRingZahl").dataset.zahl = c.pct;
    $("nextRingZahl").dataset.suffix = "%";
    $("nextFacts").innerHTML =
      `<span><b>${c.done}/${c.total}</b> gepackt</span>`
      + `<span><b>${(trip.stops || []).length}</b> Stationen</span>`
      + `<span><b>${info.km ? kmText(info.km) : "–"}</b> Route</span>`
      + `<span><b>${tage || "–"}</b> ${tage === 1 ? "Tag" : "Tage"}</span>`;
    $("nextSkizze").innerHTML = skizze(trip.stops, 260, 120) || '<span class="next-skizze-leer">Noch keine Route – plane sie im TripPlaner.</span>';
    $("nextPack").onclick = () => { location.hash = "#/trip/" + code; };
    $("nextPlan").onclick = () => { location.hash = "#/planer/" + code; };
    $("homeNext").onclick = (e) => {
      if (e.target.closest("button")) return;
      location.hash = "#/trip/" + code;
    };
  }

  function reiseZeile(code, trip) {
    const row = document.createElement("article");
    row.className = "dash-reise tilt";
    if (!trip) {
      row.classList.add("weg");
      row.innerHTML = `<div class="dr-text"><strong>Reise ${escapeHtml(code)}</strong><small>Nicht gefunden – gelöscht oder falscher Code.</small></div>`;
      return row;
    }
    const c = ctx.packCount(trip);
    const info = routenInfo(code, trip);
    const wann = trip.start ? formatDate(trip.start) + (trip.end && trip.end !== trip.start ? " – " + formatDate(trip.end) : "") : "ohne Zeitraum";
    row.innerHTML =
      `<div class="dr-skizze">${skizze(trip.stops, 96, 56) || '<span class="dr-skizze-leer" aria-hidden="true"></span>'}</div>`
      + `<div class="dr-text"><strong></strong><small>${escapeHtml(wann)} · ${(trip.stops || []).length} Stationen${info.km ? " · " + kmText(info.km) : ""}</small>`
      + `<div class="track"><div class="fill" style="width:${c.pct}%"></div></div></div>`
      + `<div class="dr-knoepfe"><button type="button" class="btn" data-a="pack">Packen <small>${c.done}/${c.total}</small></button>`
      + `<button type="button" class="btn primary" data-a="plan">Planen</button></div>`;
    row.querySelector("strong").textContent = trip.name || "Reise";
    row.querySelector('[data-a="pack"]').addEventListener("click", () => { location.hash = "#/trip/" + code; });
    row.querySelector('[data-a="plan"]').addEventListener("click", () => { location.hash = "#/planer/" + code; });
    return row;
  }

  /* ---------- TripPlaner: welche Reise? ---------- */

  function renderChooser(liste) {
    const host = $("planerList");
    host.textContent = "";
    const reisen = liste.filter((x) => x.trip);
    $("planerEmpty").hidden = reisen.length > 0;
    reisen.forEach(({ code, trip }) => {
      const info = routenInfo(code, trip);
      const stops = trip.stops || [];
      const tage = reiseTage(trip).length;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "pc-karte tilt";
      b.innerHTML =
        `<span class="pc-bild">${skizze(stops, 200, 110) || '<span class="pc-leer">Noch keine Route</span>'}</span>`
        + `<span class="pc-text"><strong></strong>`
        + `<small>${trip.start ? escapeHtml(formatDate(trip.start) + (trip.end && trip.end !== trip.start ? " – " + formatDate(trip.end) : "")) : "ohne Zeitraum"}</small>`
        + `<span class="pc-facts"><span><b>${stops.length}</b> Stationen</span><span><b>${stops.filter(hatOrt).length}</b> mit Ort</span>`
        + `<span><b>${info.km ? kmText(info.km) : "–"}</b></span><span><b>${tage || "–"}</b> ${tage === 1 ? "Tag" : "Tage"}</span></span></span>`
        + `<span class="pc-go" aria-hidden="true">Planen →</span>`;
      b.querySelector("strong").textContent = trip.name || "Reise";
      b.addEventListener("click", () => { location.hash = "#/planer/" + code; });
      host.appendChild(b);
    });
    ctx.stagger(host.children, { y: 24, stagger: .06 });
  }

  return { renderHome, renderChooser };
}
