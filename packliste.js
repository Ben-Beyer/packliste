/* Packliste: Bereiche, Positionen, Haken.

   Zwei Arten von Positionen:
     je Person    - erledigt, sobald ICH sie abgehakt habe (Zahnbuerste)
     einer reicht - erledigt, sobald irgendwer sie abgehakt hat (Zelt)
   Der Fortschritt beantwortet damit "was muss ich noch tun". */

import { slug } from "./data.js";
import { memberKey, normalizeMarks } from "./store.js";

const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>';
const TRASH_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>';

const $ = (id) => document.getElementById(id);

export function initPackliste(ctx) {
  const host = $("sections");

  let ui = { hideDone: false, collapsed: [] };
  let sig = "";
  let editing = false;
  let addOpen = null;
  let lastSection = null;
  let nodes = {};
  let secNodes = {};
  let code = null;
  let ersterBau = true;
  let getippt = 0;            // wann ich zuletzt selbst einen Haken gesetzt habe
  let vorher = null;          // Stand beim letzten Malen: {secs: {id: fertig}, alle, pct}

  /* ---- Einstellungen pro Reise, nur auf diesem Geraet ---- */

  function readUi(c) {
    try {
      const raw = JSON.parse(localStorage.getItem("reisebuddy.v1.ui." + c) || "null")
        || JSON.parse(localStorage.getItem("packliste.v2.ui." + c) || "{}");
      return { hideDone: !!raw.hideDone, collapsed: Array.isArray(raw.collapsed) ? raw.collapsed : [] };
    } catch (e) { return { hideDone: false, collapsed: [] }; }
  }
  function writeUi() {
    try { localStorage.setItem("reisebuddy.v1.ui." + code, JSON.stringify(ui)); } catch (e) {}
  }

  /* ---- Aufbau ---- */

  function reset(newCode) {
    code = newCode;
    ui = readUi(newCode);
    sig = "";
    editing = false;
    addOpen = null;
    nodes = {};
    secNodes = {};
    host.textContent = "";
    ersterBau = true;
    vorher = null;
    $("hideDone").setAttribute("aria-pressed", ui.hideDone ? "true" : "false");
    $("editBtn").setAttribute("aria-pressed", "false");
    if (addSectionForm) { addSectionForm.remove(); addSectionForm = null; }
  }

  function render() {
    if (!ctx.trip) return;
    const next = JSON.stringify(ctx.trip.sections || []);
    if (next !== sig) { sig = next; build(); }
    paint();
  }

  function build() {
    host.textContent = "";
    nodes = {};
    secNodes = {};

    (ctx.trip.sections || []).forEach((sec) => {
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
        const at = ui.collapsed.indexOf(sec.id);
        if (at >= 0) ui.collapsed.splice(at, 1); else ui.collapsed.push(sec.id);
        writeUi();
        paint();
      });

      sec.items.forEach((item) => list.appendChild(buildRow(sec, item)));
      list.appendChild(buildAdder(sec));

      root.appendChild(head);
      root.appendChild(list);
      host.appendChild(root);
      secNodes[sec.id] = { root, head, list, count: head.querySelector(".count") };
    });
    // Beim ersten Aufbau gleiten die Bereiche beim Scrollen herein.
    if (ersterBau && ctx.motion) { ersterBau = false; ctx.motion.scrollIn(host.children); }
  }

  function buildAdder(sec) {
    const li = document.createElement("li");
    li.className = "add-li";

    const open = document.createElement("button");
    open.type = "button";
    open.className = "add-open";
    open.innerHTML = '<span class="plus" aria-hidden="true">+</span>Position hinzufügen';

    const form = document.createElement("form");
    form.className = "add-row";
    form.hidden = true;
    form.innerHTML =
      '<input class="field" maxlength="60" placeholder="Was fehlt noch?" aria-label="Neue Position">' +
      '<select class="field kind-select" aria-label="Wer muss das packen?">' +
        '<option value="one">einer reicht</option>' +
        '<option value="each">jeder einzeln</option>' +
      '</select>' +
      '<button type="submit" class="btn primary">Hinzufügen</button>' +
      '<button type="button" class="btn add-done">Fertig</button>';

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = form.querySelector("input");
      const label = input.value.trim();
      if (!label) return;
      input.value = "";
      await addItem(sec.id, label, form.querySelector("select").value === "each");
      input.focus();
    });
    open.addEventListener("click", () => {
      open.hidden = true;
      form.hidden = false;
      addOpen = sec.id;
      form.querySelector("input").focus();
    });
    form.querySelector(".add-done").addEventListener("click", () => closeAdder(sec.id));
    form.addEventListener("keydown", (e) => { if (e.key === "Escape") closeAdder(sec.id); });

    li.appendChild(open);
    li.appendChild(form);
    if (addOpen === sec.id) { open.hidden = true; form.hidden = false; }
    return li;
  }

  function closeAdder(sectionId) {
    const sn = secNodes[sectionId];
    if (!sn) return;
    const li = sn.list.querySelector(".add-li");
    if (!li) return;
    li.querySelector(".add-row").hidden = true;
    li.querySelector(".add-open").hidden = false;
    if (addOpen === sectionId) addOpen = null;
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
    btn.addEventListener("click", () => {
      if (editing) return;
      // Sofort feiern, nicht erst wenn der Speicher antwortet
      if (btn.getAttribute("aria-checked") !== "true" && ctx.motion) {
        const box = btn.querySelector(".box");
        ctx.motion.feiern(box, { menge: 12, weite: .6 });
        ctx.motion.plopp(box, 1.45);
      }
      getippt = Date.now();
      toggle(item);
    });

    const kindBtn = document.createElement("button");
    kindBtn.type = "button";
    kindBtn.className = "kindbtn edit-only";
    kindBtn.hidden = true;
    kindBtn.addEventListener("click", () => setKind(sec.id, item.id));

    const del = document.createElement("button");
    del.type = "button";
    del.className = "del edit-only";
    del.hidden = true;
    del.setAttribute("aria-label", "„" + item.label + "“ löschen");
    del.innerHTML = TRASH_SVG;
    del.addEventListener("click", () => removeItem(sec.id, item.id));

    const wrap = document.createElement("div");
    wrap.className = "row-wrap";
    wrap.appendChild(btn);
    wrap.appendChild(kindBtn);
    wrap.appendChild(del);
    li.appendChild(wrap);

    nodes[item.id] = { li, btn, meta, del, kindBtn };
    return li;
  }

  /* ---- Anzeige ---- */

  function marksOf(itemId) { return normalizeMarks((ctx.trip.checks || {})[itemId]); }

  function isDone(item, me) {
    const marks = marksOf(item.id);
    return item.each ? !!marks[me] : Object.keys(marks).length > 0;
  }

  function roster(marks) {
    const seen = new Set();
    const people = [];
    Object.entries(ctx.trip.members || {}).forEach(([k, v]) => {
      seen.add(k); people.push({ key: k, name: v.name });
    });
    Object.entries(marks).forEach(([k, v]) => {
      if (!seen.has(k)) { seen.add(k); people.push({ key: k, name: v.by }); }
    });
    return people;
  }

  function paint() {
    const trip = ctx.trip;
    const me = memberKey(ctx.user);

    (trip.sections || []).forEach((sec) => {
      const sn = secNodes[sec.id];
      if (!sn) return;
      let done = 0;

      sec.items.forEach((item) => {
        const n = nodes[item.id];
        if (!n) return;

        const marks = marksOf(item.id);
        const mine = !!marks[me];
        const anyone = Object.keys(marks).length > 0;
        const checked = item.each ? mine : anyone;
        if (checked) done++;

        n.btn.setAttribute("aria-checked", checked ? "true" : "false");
        n.li.classList.toggle("is-hidden", ui.hideDone && checked && !editing);
        n.del.hidden = !editing;
        n.kindBtn.hidden = !editing;
        n.kindBtn.textContent = item.each ? "je Person" : "einer reicht";
        n.kindBtn.classList.toggle("each", !!item.each);
        n.kindBtn.setAttribute("aria-label",
          "„" + item.label + "“ umstellen auf " + (item.each ? "einer reicht" : "jeder einzeln"));

        n.meta.textContent = "";
        n.meta.classList.toggle("mine", !item.each && mine);

        if (item.each) {
          n.meta.appendChild(tag("je Person", "each"));
          const people = roster(marks);
          const dots = document.createElement("span");
          dots.className = "dots";
          people.forEach((p) => {
            const a = ctx.avatar(p.name, marks[p.key] ? "on" : "off");
            a.title = p.name + (marks[p.key] ? " hat's" : " fehlt noch");
            dots.appendChild(a);
          });
          n.meta.appendChild(dots);
          const cnt = document.createElement("span");
          cnt.className = "kind-count";
          cnt.textContent = Object.keys(marks).length + " von " + people.length;
          n.meta.appendChild(cnt);
        } else if (anyone) {
          const mark = Object.values(marks)[0];
          n.meta.appendChild(ctx.avatar(mark.by || "?"));
          const who = document.createElement("span");
          who.className = "by-name";
          who.textContent = marks[me] ? "von dir" : mark.by || "jemand";
          n.meta.appendChild(who);
          const w = ctx.when(mark.at);
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
      const collapsed = ui.collapsed.includes(sec.id) && !editing;
      sn.root.classList.toggle("collapsed", collapsed);
      sn.list.hidden = collapsed;
      sn.head.setAttribute("aria-expanded", collapsed ? "false" : "true");
    });

    const c = count();
    feiereUebergaenge(trip, me, c);
    $("tallyDone").textContent = c.done;
    $("tallyTotal").textContent = c.total;
    $("fill").style.width = c.pct + "%";
    $("bar").setAttribute("aria-valuenow", String(c.pct));
    $("resetHint").textContent = "Löscht die Haken für alle in der Reise, nicht nur bei dir.";
    syncCollapseChip();
  }

  /* Ist durch meinen Haken gerade ein Bereich oder die ganze Liste fertig
     geworden? Dann gibt es eine Feier. Haken der anderen kommen still an. */
  function feiereUebergaenge(trip, me, c) {
    const jetzt = { secs: {}, alle: c.total > 0 && c.done === c.total, pct: c.pct };
    (trip.sections || []).forEach((sec) => {
      jetzt.secs[sec.id] = sec.items.length > 0 && sec.items.every((i) => isDone(i, me));
    });
    const frisch = Date.now() - getippt < 5000;
    const m = ctx.motion;
    if (vorher && m) {
      if (frisch && jetzt.alle && !vorher.alle) {
        getippt = 0;
        m.konfetti({ menge: 170 });
        m.banner("Alles gepackt!", "Jetzt kann's losgehen.", "🎒");
      } else if (frisch) {
        Object.keys(jetzt.secs).forEach((id) => {
          if (!jetzt.secs[id] || vorher.secs[id] !== false) return;
          const sn = secNodes[id];
          if (!sn) return;
          const badge = sn.head.querySelector(".badge");
          m.feiern(badge, { menge: 26, weite: 1.3 });
          m.ring(sn.root, null);
          if (m.aktiv()) {
            m.gsap.fromTo(badge, { rotate: -200, scale: .3 }, { rotate: 0, scale: 1, duration: 1, ease: "elastic.out(1, .45)", clearProps: "transform" });
            m.gsap.fromTo(sn.root, { boxShadow: "0 0 0 0 rgba(84,199,149,.75)" }, { boxShadow: "0 0 0 18px rgba(84,199,149,0)", duration: 1.1, ease: "expo.out", clearProps: "boxShadow" });
          }
        });
      }
      if (jetzt.pct !== vorher.pct) {
        const fill = $("fill");
        fill.classList.remove("glanz");
        void fill.offsetWidth;
        fill.classList.add("glanz");
        if (m.aktiv()) m.plopp($("tallyDone"), 1.4);
      }
    }
    vorher = jetzt;
  }

  function tag(text, cls) {
    const el = document.createElement("span");
    el.className = "kind " + cls;
    el.textContent = text;
    return el;
  }

  function count() {
    if (!ctx.trip) return { done: 0, total: 0, pct: 0 };
    const me = memberKey(ctx.user);
    let done = 0, total = 0;
    (ctx.trip.sections || []).forEach((s) => s.items.forEach((i) => {
      total++;
      if (isDone(i, me)) done++;
    }));
    return { done, total, pct: total ? Math.round(done / total * 100) : 0 };
  }

  /* ---- Aendern ---- */

  async function toggle(item) {
    const me = memberKey(ctx.user);
    const raw = (ctx.trip.checks || {})[item.id];
    const legacy = raw && typeof raw.by === "string";
    const marks = marksOf(item.id);
    const mine = !!marks[me];
    const anyone = Object.keys(marks).length > 0;

    try {
      if (item.each) {
        if (legacy) {
          if (mine) delete marks[me]; else marks[me] = { by: ctx.user, at: Date.now() };
          await ctx.store.setMarks(code, item.id, marks);
        } else {
          await ctx.store.setMark(code, item.id, me, mine ? null : ctx.user);
        }
      } else if (anyone) {
        await ctx.store.setMarks(code, item.id, null);
      } else {
        await ctx.store.setMark(code, item.id, me, ctx.user);
      }
    } catch (err) {
      ctx.toast("Konnte nicht gespeichert werden.");
    }
  }

  async function addItem(sectionId, label, each) {
    const sections = structuredClone(ctx.trip.sections);
    const sec = sections.find((s) => s.id === sectionId);
    if (!sec) return;
    let id = sec.id + "__" + slug(label);
    const taken = new Set(sections.flatMap((s) => s.items.map((i) => i.id)));
    while (taken.has(id)) id += "-" + Math.floor(Math.random() * 100);
    const item = { id, label, note: "", each: !!each };
    sec.items.push(item);

    // Die neue Zeile selbst einhaengen und die Signatur vorziehen: Sonst baut
    // der gleich eintreffende Schnappschuss die Liste neu, das Eingabefeld
    // verliert den Fokus und auf dem iPhone klappt die Tastatur weg.
    const sn = secNodes[sectionId];
    if (sn) {
      sig = JSON.stringify(sections);
      sn.list.insertBefore(buildRow(sec, item), sn.list.querySelector(".add-li"));
    }

    try {
      await ctx.store.setSections(code, sections);
    } catch (err) {
      sig = "";
      ctx.toast("Konnte nicht gespeichert werden.");
      render();
    }
  }

  async function removeItem(sectionId, itemId) {
    const sections = structuredClone(ctx.trip.sections);
    const sec = sections.find((s) => s.id === sectionId);
    if (!sec) return;
    sec.items = sec.items.filter((i) => i.id !== itemId);
    try {
      if ((ctx.trip.checks || {})[itemId]) await ctx.store.setMarks(code, itemId, null);
      await ctx.store.setSections(code, sections);
    } catch (err) { ctx.toast("Konnte nicht gespeichert werden."); }
  }

  async function setKind(sectionId, itemId) {
    const sections = structuredClone(ctx.trip.sections);
    const sec = sections.find((s) => s.id === sectionId);
    if (!sec) return;
    const item = sec.items.find((i) => i.id === itemId);
    if (!item) return;
    item.each = !item.each;
    try { await ctx.store.setSections(code, sections); }
    catch (err) { ctx.toast("Konnte nicht gespeichert werden."); }
  }

  /* ---- Werkzeugleiste ---- */

  $("hideDone").addEventListener("click", () => {
    ui.hideDone = !ui.hideDone;
    $("hideDone").setAttribute("aria-pressed", ui.hideDone ? "true" : "false");
    writeUi();
    paint();
  });

  function allCollapsed() {
    const secs = (ctx.trip && ctx.trip.sections) || [];
    return secs.length > 0 && secs.every((s) => ui.collapsed.includes(s.id));
  }
  function syncCollapseChip() {
    const all = allCollapsed();
    $("collapseAll").setAttribute("aria-pressed", all ? "true" : "false");
    $("collapseLabel").textContent = all ? "Alle ausklappen" : "Alle einklappen";
  }
  $("collapseAll").addEventListener("click", () => {
    const secs = (ctx.trip && ctx.trip.sections) || [];
    ui.collapsed = allCollapsed() ? [] : secs.map((s) => s.id);
    writeUi();
    paint();
  });

  $("editBtn").addEventListener("click", () => {
    editing = !editing;
    $("editBtn").setAttribute("aria-pressed", editing ? "true" : "false");
    if (addSectionForm) { addSectionForm.remove(); addSectionForm = null; }
    paint();
  });

  /* ---- Position ueber den Dialog ---- */

  const dlgAdd = $("dlgAdd");
  $("addItemBtn").addEventListener("click", () => {
    const sel = $("addSection");
    sel.textContent = "";
    (ctx.trip.sections || []).forEach((sec) => {
      const opt = document.createElement("option");
      opt.value = sec.id;
      opt.textContent = (sec.icon ? sec.icon + "  " : "") + sec.name;
      sel.appendChild(opt);
    });
    if (lastSection && sel.querySelector(`option[value="${lastSection}"]`)) sel.value = lastSection;
    $("addLabel").value = "";
    $("addErr").hidden = true;
    dlgAdd.showModal();
    $("addLabel").focus();
  });

  $("addForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const label = $("addLabel").value.trim();
    if (!label) return;
    const sectionId = $("addSection").value;
    const sec = (ctx.trip.sections || []).find((x) => x.id === sectionId);
    lastSection = sectionId;

    const at = ui.collapsed.indexOf(sectionId);
    if (at >= 0) { ui.collapsed.splice(at, 1); writeUi(); }

    $("addLabel").value = "";
    await addItem(sectionId, label, $("addKind").value === "each");
    $("addLabel").focus();
    ctx.toast("„" + label + "“ steht jetzt unter " + (sec ? sec.name : "der Liste") + ".");
  });

  /* ---- Bereich anlegen ---- */

  let addSectionForm = null;
  $("addSectionBtn").addEventListener("click", () => {
    if (addSectionForm) return;
    addSectionForm = document.createElement("form");
    addSectionForm.className = "add-row";
    addSectionForm.style.marginTop = "12px";
    addSectionForm.innerHTML =
      '<input class="field" maxlength="40" placeholder="Name des Bereichs" aria-label="Name des Bereichs">' +
      '<button type="submit" class="btn primary">Anlegen</button>';
    addSectionForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = addSectionForm.querySelector("input").value.trim();
      if (!name) return;
      const sections = structuredClone(ctx.trip.sections);
      let id = slug(name);
      const taken = new Set(sections.map((s) => s.id));
      while (taken.has(id)) id += "-" + Math.floor(Math.random() * 100);
      sections.push({ id, icon: "🎒", name, sub: "", items: [] });
      addSectionForm.remove();
      addSectionForm = null;
      try { await ctx.store.setSections(code, sections); }
      catch (err) { ctx.toast("Konnte nicht gespeichert werden."); }
    });
    $("addSectionBtn").after(addSectionForm);
    addSectionForm.querySelector("input").focus();
  });

  /* ---- Zuruecksetzen ---- */

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
      $("resetLabel").textContent = "Wirklich — für alle löschen";
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
      await ctx.store.clearChecks(code);
      ctx.toast("Alles wieder offen.");
    } catch (err) { ctx.toast("Konnte nicht zurückgesetzt werden."); }
  });

  return { render, reset, count };
}
