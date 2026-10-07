/* Challenge: schoene Orte markieren und die anderen herausfordern, auch
   hinzugehen.

   Ein Spot ist ein Ort, den jemand gefunden hat und weiterempfiehlt. Wer
   herausgefordert ist, sieht ihn offen; wer da war, hakt ihn ab. Die Rangliste
   zaehlt einfach, wer die meisten eingesammelt hat.

   Der Ort kommt entweder aus der Ortssuche oder direkt aus einem Foto, das
   schon eine Ortsangabe hat - das ist der uebliche Weg: schoenes Bild
   gemacht, Spot daraus gemacht. */

import { memberKey } from "./store.js";

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const $ = (id) => document.getElementById(id);

export function initSpots(ctx) {
  const list = $("spotList");
  const empty = $("spotsEmpty");
  const addBtn = $("spotAddBtn");
  const board = $("spotBoard");

  const dlg = $("dlgSpot");
  const form = $("spotForm");
  const fTitle = $("spotTitle");
  const fNote = $("spotNote2");
  const fQuery = $("spotQuery2");
  const searchBtn = $("spotSearch2");
  const results = $("spotResults2");
  const placeLine = $("spotPlace2");
  const clearPlace = $("spotPlaceClear2");
  const fromPhotoBtn = $("spotFromPhoto");
  const photoPicker = $("spotPhotoPicker");
  const err = $("spotErr2");

  let picked = null;      // { lat, lon, placeName }
  let pickedPhoto = null; // Foto-ID als Titelbild
  const urls = new Map();

  addBtn.addEventListener("click", () => openDialog());

  /* ---- Anlegen ---- */

  function openDialog() {
    picked = null;
    pickedPhoto = null;
    fTitle.value = "";
    fNote.value = "";
    fQuery.value = "";
    results.textContent = "";
    results.hidden = true;
    photoPicker.hidden = true;
    photoPicker.textContent = "";
    err.hidden = true;
    paintPlace();
    dlg.showModal();
    fTitle.focus();
  }

  function paintPlace() {
    if (picked) {
      placeLine.hidden = false;
      placeLine.querySelector("span").textContent =
        picked.placeName || `${picked.lat.toFixed(4)}, ${picked.lon.toFixed(4)}`;
    } else {
      placeLine.hidden = true;
    }
  }

  clearPlace.addEventListener("click", () => {
    picked = null;
    pickedPhoto = null;
    paintPlace();
  });

  fromPhotoBtn.addEventListener("click", () => {
    const mitOrt = (ctx.photos || []).filter((p) => typeof p.lat === "number");
    photoPicker.textContent = "";
    if (!mitOrt.length) {
      err.textContent = "Es gibt noch kein Foto mit Ortsangabe. Lade eins hoch oder trag den Ort im Reiter Fotos nach.";
      err.hidden = false;
      return;
    }
    err.hidden = true;
    mitOrt.slice().reverse().forEach((p) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "pick";
      const img = document.createElement("img");
      img.alt = "";
      img.src = thumbUrl(p);
      b.appendChild(img);
      b.addEventListener("click", () => {
        picked = { lat: p.lat, lon: p.lon, placeName: p.placeName || "" };
        pickedPhoto = p.id;
        if (!fTitle.value.trim() && p.placeName) fTitle.value = p.placeName.split(",")[0];
        photoPicker.hidden = true;
        paintPlace();
      });
      photoPicker.appendChild(b);
    });
    photoPicker.hidden = false;
  });

  searchBtn.addEventListener("click", async () => {
    const q = fQuery.value.trim();
    if (q.length < 3) {
      err.textContent = "Mindestens drei Zeichen zum Suchen.";
      err.hidden = false;
      return;
    }
    err.hidden = true;
    searchBtn.disabled = true;
    searchBtn.textContent = "Sucht …";
    results.textContent = "";
    results.hidden = true;
    try {
      const res = await fetch(`${NOMINATIM}?format=jsonv2&limit=5&accept-language=de&q=${encodeURIComponent(q)}`,
        { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error("nicht erreichbar");
      const hits = await res.json();
      if (!hits.length) {
        err.textContent = "Dazu wurde nichts gefunden.";
        err.hidden = false;
        return;
      }
      hits.forEach((hit) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "hit";
        b.textContent = hit.display_name;
        b.addEventListener("click", () => {
          picked = {
            lat: Math.round(parseFloat(hit.lat) * 1e6) / 1e6,
            lon: Math.round(parseFloat(hit.lon) * 1e6) / 1e6,
            placeName: hit.display_name.split(",").slice(0, 3).join(",").trim()
          };
          if (!fTitle.value.trim()) fTitle.value = hit.display_name.split(",")[0].trim();
          results.hidden = true;
          paintPlace();
        });
        results.appendChild(b);
      });
      results.hidden = false;
    } catch (e) {
      err.textContent = "Die Ortssuche war nicht erreichbar.";
      err.hidden = false;
    } finally {
      searchBtn.disabled = false;
      searchBtn.textContent = "Suchen";
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = fTitle.value.trim();
    if (!title) return;
    if (!picked) {
      err.textContent = "Ohne Ort wird daraus keine Challenge — such den Ort oder nimm ihn aus einem Foto.";
      err.hidden = false;
      return;
    }
    const spot = {
      title,
      note: fNote.value.trim(),
      lat: picked.lat,
      lon: picked.lon,
      placeName: picked.placeName || "",
      by: ctx.user,
      byKey: memberKey(ctx.user)
    };
    if (pickedPhoto) spot.photoId = pickedPhoto;
    try {
      await ctx.store.addSpot(ctx.code, spot);
      dlg.close();
      ctx.toast(`„${title}“ steht als Challenge drin.`);
    } catch (e2) {
      err.textContent = "Konnte nicht gespeichert werden.";
      err.hidden = false;
    }
  });

  document.querySelectorAll("#dlgSpot [data-close]").forEach((b) =>
    b.addEventListener("click", () => dlg.close()));

  /* ---- Anzeige ---- */

  function leute() {
    return Object.entries((ctx.trip && ctx.trip.members) || {})
      .map(([key, v]) => ({ key, name: v.name }));
  }

  function render() {
    const spots = ctx.spots || [];
    empty.hidden = spots.length > 0;
    list.textContent = "";

    zeichneRangliste(spots);

    spots.forEach((s) => list.appendChild(spotKarte(s)));
    ctx.stagger(list.children, { y: 34, stagger: .08 });
  }

  function zeichneRangliste(spots) {
    board.textContent = "";
    const alle = leute();
    if (!spots.length || alle.length < 1) { board.hidden = true; return; }
    board.hidden = false;

    const zaehler = alle.map((p) => ({
      ...p,
      done: spots.filter((s) => (s.done || {})[p.key]).length,
      offen: spots.filter((s) => !(s.done || {})[p.key]).length
    })).sort((a, b) => b.done - a.done || a.name.localeCompare(b.name, "de"));

    zaehler.forEach((p, i) => {
      const row = document.createElement("div");
      row.className = "board-row" + (memberKey(ctx.user) === p.key ? " ich" : "");
      const rang = document.createElement("span");
      rang.className = "board-rang";
      rang.textContent = p.done > 0 && i === 0 ? "🏆" : String(i + 1);
      row.appendChild(rang);
      row.appendChild(ctx.avatar(p.name));
      const name = document.createElement("span");
      name.className = "board-name";
      name.textContent = p.name;
      row.appendChild(name);
      const zahl = document.createElement("span");
      zahl.className = "board-zahl";
      zahl.textContent = `${p.done}/${spots.length}`;
      row.appendChild(zahl);
      const bar = document.createElement("span");
      bar.className = "board-bar";
      const fill = document.createElement("span");
      fill.style.width = spots.length ? Math.round(p.done / spots.length * 100) + "%" : "0%";
      bar.appendChild(fill);
      row.appendChild(bar);
      board.appendChild(row);
    });
  }

  function spotKarte(s) {
    const me = memberKey(ctx.user);
    const done = s.done || {};
    const dares = s.dares || {};
    const ichWarDa = !!done[me];

    const card = document.createElement("article");
    card.className = "spot tilt" + (ichWarDa ? " erledigt" : "");

    const foto = (ctx.photos || []).find((p) => p.id === s.photoId);
    const head = document.createElement("div");
    head.className = "spot-bild" + (foto ? "" : " ohne");
    if (foto) {
      const img = document.createElement("img");
      img.alt = "";
      img.loading = "lazy";
      img.src = thumbUrl(foto);
      head.appendChild(img);
    } else {
      head.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z"/></svg>';
    }
    if (ichWarDa) {
      const haken = document.createElement("span");
      haken.className = "spot-haken";
      haken.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>';
      head.appendChild(haken);
    }
    card.appendChild(head);

    const body = document.createElement("div");
    body.className = "spot-body";

    const t = document.createElement("h3");
    t.className = "spot-titel";
    t.textContent = s.title;
    body.appendChild(t);

    if (s.placeName) {
      const o = document.createElement("p");
      o.className = "spot-ort";
      o.textContent = s.placeName;
      body.appendChild(o);
    }
    if (s.note) {
      const n = document.createElement("p");
      n.className = "spot-notiz";
      n.textContent = s.note;
      body.appendChild(n);
    }

    const von = document.createElement("div");
    von.className = "spot-von";
    von.appendChild(ctx.avatar(s.by || "?"));
    const vt = document.createElement("span");
    vt.textContent = (s.byKey === me ? "von dir" : "von " + (s.by || "jemand")) + " · " + ctx.when(s.at);
    von.appendChild(vt);
    body.appendChild(von);

    // Wer war schon da
    const reihe = document.createElement("div");
    reihe.className = "spot-leute";
    const alle = leute();
    if (alle.length) {
      alle.forEach((p) => {
        const a = ctx.avatar(p.name, done[p.key] ? "on" : (dares[p.key] ? "" : "off"));
        a.title = p.name + (done[p.key] ? " war da" : (dares[p.key] ? " ist herausgefordert" : " weiß noch nichts davon"));
        if (done[p.key]) a.classList.add("hat");
        reihe.appendChild(a);
      });
      const zahl = document.createElement("span");
      zahl.className = "kind-count";
      zahl.textContent = `${Object.keys(done).length} von ${alle.length} waren da`;
      reihe.appendChild(zahl);
    }
    body.appendChild(reihe);

    const knoepfe = document.createElement("div");
    knoepfe.className = "spot-knoepfe";

    const warDa = document.createElement("button");
    warDa.type = "button";
    warDa.className = "btn" + (ichWarDa ? "" : " primary");
    warDa.textContent = ichWarDa ? "Doch nicht" : "Ich war da!";
    warDa.addEventListener("click", async () => {
      // Punkt vorher merken - nach dem Speichern ist der Knopf neu gebaut.
      const r = warDa.getBoundingClientRect();
      const punkt = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      try {
        await ctx.store.setSpotMark(ctx.code, s.id, "done", me, ichWarDa ? null : { name: ctx.user });
        if (!ichWarDa && ctx.motion) {
          ctx.motion.feiern(punkt, { menge: 30, weite: 1.4, farben: ["#E0B341", "#F2D27A", "#C4862A", "#FFF1C2"] });
          ctx.motion.konfetti({ menge: 90, farben: ["#E0B341", "#F2D27A", "#C4862A", "#FFF1C2", "#0F6E4F"] });
          ctx.motion.banner("Spot erobert!", s.title || "", "⭐");
        }
      } catch (e) { ctx.toast("Konnte nicht gespeichert werden."); }
    });
    knoepfe.appendChild(warDa);

    const offen = alle.filter((p) => !dares[p.key] && !done[p.key] && p.key !== me);
    const fordern = document.createElement("button");
    fordern.type = "button";
    fordern.className = "btn";
    fordern.textContent = offen.length ? `${offen.length} herausfordern` : "Alle sind dran";
    fordern.disabled = !offen.length;
    fordern.addEventListener("click", async () => {
      fordern.disabled = true;
      try {
        for (const p of offen) {
          await ctx.store.setSpotMark(ctx.code, s.id, "dares", p.key, { name: p.name, by: ctx.user });
        }
        ctx.toast(offen.length === 1
          ? `${offen[0].name} ist herausgefordert.`
          : `${offen.length} Leute sind herausgefordert.`);
      } catch (e) { ctx.toast("Konnte nicht gespeichert werden."); }
      finally { fordern.disabled = false; }
    });
    knoepfe.appendChild(fordern);

    const weg = document.createElement("button");
    weg.type = "button";
    weg.className = "spot-weg";
    weg.setAttribute("aria-label", "Spot löschen");
    weg.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>';
    weg.addEventListener("click", async () => {
      if (weg.dataset.armed !== "1") {
        weg.dataset.armed = "1";
        weg.classList.add("armed");
        setTimeout(() => { weg.dataset.armed = "0"; weg.classList.remove("armed"); }, 5000);
        ctx.toast("Nochmal antippen, dann ist der Spot weg.");
        return;
      }
      try { await ctx.store.deleteSpot(ctx.code, s.id); ctx.toast("Spot gelöscht."); }
      catch (e) { ctx.toast("Löschen hat nicht geklappt."); }
    });
    knoepfe.appendChild(weg);

    body.appendChild(knoepfe);
    card.appendChild(body);
    return card;
  }

  function thumbUrl(p) {
    let url = urls.get(p.id);
    if (!url) {
      url = URL.createObjectURL(new Blob([p.thumb.toUint8Array()], { type: "image/jpeg" }));
      urls.set(p.id, url);
    }
    return url;
  }

  return { render };
}
