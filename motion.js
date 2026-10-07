/* Bewegung: Intro, Auftritte, Bilduebergang, Zaehler, kleine Feier.

   GSAP und Lenis kommen vom CDN und werden beim Start geladen. Klappt das
   nicht - kein Netz, gesperrtes CDN -, laeuft die App ohne Animation weiter:
   jede Funktion hier hat einen stillen Notweg, der einfach den Endzustand
   setzt. Die App darf nie an der Deko haengenbleiben.

   Wer "weniger Bewegung" im Betriebssystem eingestellt hat, bekommt ebenfalls
   den Endzustand ohne Gewackel. */

const GSAP = "https://cdnjs.cloudflare.com/ajax/libs/gsap/3.13.0";
const LENIS = "https://cdn.jsdelivr.net/npm/lenis@1.3.11/dist/lenis.min.js";

let gsap = null;
let ScrollTrigger = null;
let lenis = null;
let sparsam = false;

/* Animieren nur, wenn es auch laufen kann: GSAP geladen, der Nutzer will
   Bewegung, und das Fenster ist sichtbar. Ist es verdeckt oder im Hintergrund,
   steht requestAnimationFrame still - dann duerfen wir nichts auf "unsichtbar"
   setzen, was danach nie wieder eingeblendet wird. */
const an = () => gsap && !sparsam && !document.hidden;

/* Ein Skript vom CDN holen - mit Frist. Ohne die Frist haengt die ganze App im
   Ladebildschirm, sobald ein CDN langsam oder gesperrt ist (Firmennetz,
   Werbeblocker, schlechtes Netz). Deko darf nie die App aufhalten. */
function script(src, frist = 6000) {
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    let fertig = false;
    const uhr = setTimeout(() => {
      if (fertig) return;
      fertig = true;
      rej(new Error("Zeitüberschreitung: " + src));
    }, frist);
    s.src = src;
    s.async = true;
    s.onload = () => { if (fertig) return; fertig = true; clearTimeout(uhr); res(); };
    s.onerror = () => { if (fertig) return; fertig = true; clearTimeout(uhr); rej(new Error(src)); };
    document.head.appendChild(s);
  });
}

export async function initMotion() {
  sparsam = matchMedia("(prefers-reduced-motion: reduce)").matches;

  try {
    await script(`${GSAP}/gsap.min.js`);
    // Die Zusaetze sind Kuer - schlagen sie fehl, laeuft der Rest trotzdem.
    await Promise.allSettled([
      script(`${GSAP}/ScrollTrigger.min.js`),
      script(`${GSAP}/Flip.min.js`)
    ]);
    gsap = window.gsap || null;
    ScrollTrigger = window.ScrollTrigger || null;
    if (gsap && ScrollTrigger) gsap.registerPlugin(ScrollTrigger);
  } catch (e) {
    gsap = window.gsap || null;   // notfalls ohne Animation weiter
  }

  // Sanftes Scrollen nur mit Maus/Trackpad. Auf dem Handy bleibt das native
  // Scrollen - alles andere fuehlt sich dort falsch an.
  if (gsap && !sparsam && !matchMedia("(pointer: coarse)").matches) {
    try {
      await script(LENIS, 4000);
      if (window.Lenis) {
        lenis = new window.Lenis({
          duration: 1.05,
          easing: (t) => 1 - Math.pow(1 - t, 4),
          smoothWheel: true
        });
        lenis.on("scroll", () => ScrollTrigger && ScrollTrigger.update());
        gsap.ticker.add((t) => lenis.raf(t * 1000));
        gsap.ticker.lagSmoothing(0);
      }
    } catch (e) { lenis = null; }
  }

  erlebnis();
  return api;
}

/* ---------- Was ueberall wirkt ----------

   Ein paar Effekte haengen nicht an einem Bildschirm, sondern an allem:
     Hintergrund   Farbflaechen und Hoehenlinien, ein Lichtschein folgt der Maus
     Fortschritt   duenne Leiste oben, wie weit die Seite gescrollt ist
     Neigung       Karten mit .tilt kippen zum Zeiger und tragen ein Licht
     Magnet        Hauptknoepfe ziehen sich leicht zum Zeiger
     Welle         jeder Tipp auf einen Knopf schlaegt eine Welle
   Alles per Ereignis-Delegation: neue Elemente machen von selbst mit. Wer
   "weniger Bewegung" will, bekommt nichts davon. */

const WELLE = ".btn, .chip, .tab, .tile, .icon-btn, .pl-seg button, .pl-profil, .trip-card, .stop, .pl-fund, .pl-export-k, .pc-karte, .row, .section-head, .who, .code-chip, .pl-sprung, .pl-float, .planer-btn, .album, .hit";
const MAGNET = ".btn.primary, .icon-btn, .who, .code-chip, .pl-sprung";

function erlebnis() {
  if (sparsam) return;
  const maus = matchMedia("(pointer: fine)").matches;

  // Lichtschein und leichte Tiefe im Hintergrund
  const licht = document.getElementById("ambLicht");
  const orbs = [...document.querySelectorAll(".amb .orb")];
  if (maus && licht) {
    const lx = gsap ? gsap.quickTo(licht, "x", { duration: .9, ease: "power3.out" }) : null;
    const ly = gsap ? gsap.quickTo(licht, "y", { duration: .9, ease: "power3.out" }) : null;
    window.addEventListener("pointermove", (e) => {
      if (lx) { lx(e.clientX); ly(e.clientY); }
      else licht.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      const dx = e.clientX / window.innerWidth - .5, dy = e.clientY / window.innerHeight - .5;
      orbs.forEach((o, i) => { o.style.translate = `${dx * (i + 1) * -26}px ${dy * (i + 1) * -22}px`; });
    }, { passive: true });
  }

  // Scroll-Fortschritt
  const balken = document.getElementById("fortschritt");
  if (balken) {
    let tick = false;
    const setze = () => {
      tick = false;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 40 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      balken.style.transform = `scaleX(${p})`;
      balken.style.opacity = p > 0.005 ? "1" : "0";
    };
    window.addEventListener("scroll", () => { if (!tick) { tick = true; requestAnimationFrame(setze); } }, { passive: true });
    window.addEventListener("hashchange", () => setTimeout(setze, 60));
  }

  // Neigung und Magnet - nur mit Maus
  if (maus) {
    let gekippt = null, gezogen = null;
    const loesen = (k) => { k.style.setProperty("--rx", "0deg"); k.style.setProperty("--ry", "0deg"); k.classList.remove("tilt-an"); };
    document.addEventListener("pointermove", (e) => {
      const k = e.target.closest && e.target.closest(".tilt");
      if (gekippt && gekippt !== k) loesen(gekippt);
      gekippt = k;
      if (k) {
        const r = k.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        const staerke = Math.max(.35, Math.min(1, 380 / Math.max(r.width, r.height)));
        k.style.setProperty("--mx", (x * 100).toFixed(1) + "%");
        k.style.setProperty("--my", (y * 100).toFixed(1) + "%");
        k.style.setProperty("--rx", ((.5 - y) * 8 * staerke).toFixed(2) + "deg");
        k.style.setProperty("--ry", ((x - .5) * 10 * staerke).toFixed(2) + "deg");
        k.classList.add("tilt-an");
      }
      const m = e.target.closest && e.target.closest(MAGNET);
      if (gezogen && gezogen !== m) gezogen.style.translate = "";
      gezogen = m;
      if (m && !m.disabled) {
        const r = m.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        m.style.translate = `${(dx * .18).toFixed(1)}px ${(dy * .28).toFixed(1)}px`;
      }
    }, { passive: true });
    document.addEventListener("pointerleave", () => {
      if (gekippt) loesen(gekippt);
      if (gezogen) gezogen.style.translate = "";
      gekippt = gezogen = null;
    });
  }

  // Welle bei jedem Tipp
  document.addEventListener("pointerdown", (e) => {
    const k = e.target.closest && e.target.closest(WELLE);
    if (!k || k.disabled) return;
    const r = k.getBoundingClientRect();
    const d = Math.max(r.width, r.height) * 2.2;
    const w = document.createElement("span");
    w.className = "welle";
    w.style.width = w.style.height = d + "px";
    w.style.left = e.clientX - r.left - d / 2 + "px";
    w.style.top = e.clientY - r.top - d / 2 + "px";
    k.classList.add("welle-traeger");
    k.appendChild(w);
    setTimeout(() => w.remove(), 750);
  }, { passive: true });
}

/* ---------- Intro ---------- */

/* Der Vorhang ist reine Deko. Er haelt die App nicht auf: Die App startet
   dahinter sofort weiter, und der Vorhang verschwindet, wenn die Animation
   durch ist - spaetestens aber nach der Notfrist. Animationen laufen ueber
   requestAnimationFrame, und das steht still, solange ein Fenster verdeckt oder
   im Hintergrund ist. Ohne diese Frist bliebe die App dann im Vorhang haengen. */
function intro() {
  const loader = document.getElementById("loader");
  if (!loader) return;

  const weg = () => { if (loader.isConnected) loader.remove(); };
  const notfrist = setTimeout(weg, 4000);

  if (!an()) { clearTimeout(notfrist); weg(); return; }

  const tl = gsap.timeline({
    onComplete: () => { clearTimeout(notfrist); weg(); }
  });
  tl.to("#loaderMark", { scale: 1, opacity: 1, duration: .7, ease: "expo.out" })
    .to("#loaderLine", { scaleX: 1, duration: .9, ease: "expo.inOut" }, "-=.45")
    .to("#loaderWord span", { yPercent: 0, opacity: 1, duration: .8, ease: "expo.out", stagger: .045 }, "-=.7")
    .to("#loaderMark", { scale: 1.08, duration: .5, ease: "power2.inOut" }, "+=.15")
    .to(loader, { clipPath: "inset(0 0 100% 0)", duration: .9, ease: "expo.inOut" }, "-=.25");
}

/* ---------- Auftritte ---------- */

function stagger(nodes, opts = {}) {
  const els = [...(nodes || [])];
  if (!els.length) return;
  if (!an()) { if (gsap) gsap.set(els, { clearProps: "all", opacity: 1 }); return; }
  gsap.killTweensOf(els);
  gsap.fromTo(els,
    { y: opts.y ?? 22, opacity: 0, scale: opts.scale ?? 1 },
    {
      y: 0, opacity: 1, scale: 1,
      duration: opts.duration ?? .72,
      ease: "expo.out",
      stagger: opts.stagger ?? .045,
      overwrite: true,
      clearProps: "transform"
    });
}

function reveal(el, opts = {}) {
  if (!el || !an()) return;
  gsap.fromTo(el, { y: 18, opacity: 0 },
    { y: 0, opacity: 1, duration: .6, ease: "expo.out", overwrite: true, clearProps: "transform", ...opts });
}

/* Ueberschriften zeilenweise hinter einer Maske hervorschieben. */
function zeilen(el) {
  if (!el || !an() || el.dataset.split === "1") return;
  const text = el.textContent;
  el.dataset.split = "1";
  el.textContent = "";
  const wrap = document.createElement("span");
  wrap.className = "zeile";
  const inner = document.createElement("span");
  inner.textContent = text;
  wrap.appendChild(inner);
  el.appendChild(wrap);
  gsap.fromTo(inner, { yPercent: 115 }, { yPercent: 0, duration: 1, ease: "expo.out" });
}

/* Ueberschrift Wort fuer Wort hinter einer Maske hervorschieben. Der Text
   bleibt dabei derselbe (Leerzeichen stehen als Textknoten dazwischen), die
   Woerter sind nur eingepackt. Wird der Text spaeter von aussen ersetzt,
   teilt der naechste Aufruf einfach neu. */
function worte(el, { verz = 0, dauer = 1.05 } = {}) {
  if (!el || !an()) return;
  const text = el.textContent.trim();
  if (!text) return;
  if (!(el.querySelector(":scope > .wort") && el.dataset.wortText === text)) {
    el.textContent = "";
    text.split(/\s+/).forEach((w, i) => {
      if (i) el.appendChild(document.createTextNode(" "));
      const h = document.createElement("span");
      h.className = "wort";
      const innen = document.createElement("span");
      innen.textContent = w;
      h.appendChild(innen);
      el.appendChild(h);
    });
    el.dataset.wortText = text;
  }
  gsap.fromTo(el.querySelectorAll(":scope > .wort > span"),
    { yPercent: 118, rotate: 5 },
    { yPercent: 0, rotate: 0, duration: dauer, stagger: .065, ease: "expo.out", delay: verz, overwrite: true });
}

/* ---------- Bildschirmwechsel ----------

   Ein Bildschirm kommt wie eine Filmszene: Kopfleiste faellt von oben ein,
   die grosse Ueberschrift steigt Wort fuer Wort aus der Maske, der Inhalt
   folgt weich aus der Unschaerfe. */

function screenIn(el) {
  if (!el || !an()) return;
  const tl = gsap.timeline();
  tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: .45, ease: "power2.out", clearProps: "opacity" }, 0);
  const kopf = el.querySelector(":scope > .topbar, :scope > .pl-bar, :scope > .dash-top");
  if (kopf) {
    tl.fromTo(kopf, { y: -24, opacity: 0 }, { y: 0, opacity: 1, duration: .8, ease: "expo.out", clearProps: "transform,opacity" }, 0);
  }
  el.querySelectorAll(":scope > .topbar h1, :scope > .pl-bar h1, .gate-card h1").forEach((h) => worte(h, { verz: .1 }));
  const inhalt = el.querySelector(":scope > main:not([hidden]), :scope > .pl-shell, .gate-card");
  if (inhalt) {
    tl.fromTo(inhalt, { y: 34, opacity: 0, filter: "blur(8px)" },
      { y: 0, opacity: 1, filter: "blur(0px)", duration: .9, ease: "expo.out", clearProps: "transform,opacity,filter" }, .08);
  }
}

/* Reiterwechsel: Inhalt baut sich Stueck fuer Stueck auf. */
function panelIn(el) {
  if (!el || !an()) return;
  const teile = [...el.children].filter((k) => !k.hidden && k.offsetParent !== null);
  gsap.fromTo(teile, { y: 30, opacity: 0, filter: "blur(6px)" },
    { y: 0, opacity: 1, filter: "blur(0px)", duration: .85, stagger: .06, ease: "expo.out",
      clearProps: "transform,opacity,filter", overwrite: true });
  el.querySelectorAll(".panel-title").forEach((h) => worte(h, { verz: .05, dauer: .9 }));
}

/* Dialoge federn aus der Tiefe herauf. */
function dialogIn(d) {
  if (!d || !an()) return;
  const box = d.querySelector(".dlg");
  if (!box) return;
  gsap.fromTo(box, { y: 46, scale: .9, opacity: 0, rotateX: 10, transformPerspective: 900, filter: "blur(6px)" },
    { y: 0, scale: 1, opacity: 1, rotateX: 0, filter: "blur(0px)", duration: .75, ease: "expo.out",
      clearProps: "transform,opacity,filter" });
  gsap.fromTo([...box.children].slice(0, 8), { y: 14, opacity: 0 },
    { y: 0, opacity: 1, duration: .6, stagger: .035, delay: .1, ease: "expo.out", clearProps: "transform,opacity" });
}

/* ---------- Beim Scrollen einblenden ----------

   Ueber den IntersectionObserver statt ScrollTrigger: der merkt auch, wenn
   ein Reiter erst spaeter sichtbar wird, und braucht kein Nachmessen. Ein
   Element wird nur dann unsichtbar gesetzt, wenn der Beobachter es auch
   wieder hervorholen kann. */
let beobachter = null;
function scrollIn(nodes) {
  const els = [...(nodes || [])];
  if (!els.length || !an() || !("IntersectionObserver" in window)) return;
  if (!beobachter) {
    beobachter = new IntersectionObserver((eintraege) => {
      const sichtbar = eintraege.filter((e) => e.isIntersecting).map((e) => e.target);
      sichtbar.forEach((t) => beobachter.unobserve(t));
      if (!sichtbar.length) return;
      if (!an()) { gsap.set(sichtbar, { clearProps: "transform,opacity" }); return; }
      gsap.to(sichtbar, { y: 0, opacity: 1, rotateX: 0, duration: .9, stagger: .07, ease: "expo.out",
        clearProps: "transform,opacity" });
    }, { rootMargin: "0px 0px -6% 0px", threshold: .05 });
  }
  els.forEach((e) => {
    gsap.set(e, { y: 40, opacity: 0, rotateX: 8, transformPerspective: 900 });
    beobachter.observe(e);
  });
}

/* Stationen gleiten an ihren neuen Platz (GSAP Flip). */
function flip(zustand, ziele) {
  const Flip = window.Flip;
  if (!zustand || !Flip || !an()) return false;
  if (!flip.an) { gsap.registerPlugin(Flip); flip.an = true; }
  Flip.from(zustand, {
    targets: ziele, duration: .75, ease: "expo.inOut", nested: true, prune: true,
    onEnter: (el) => gsap.fromTo(el, { opacity: 0, scale: .85, y: -10 }, { opacity: 1, scale: 1, y: 0, duration: .6, ease: "back.out(1.8)", clearProps: "transform,opacity" })
  });
  return true;
}
function flipZustand(els) {
  const Flip = window.Flip;
  if (!Flip || !an()) return null;
  if (!flip.an) { gsap.registerPlugin(Flip); flip.an = true; }
  return Flip.getState(els);
}

/* ---------- Grossansicht: Bild fliegt aus der Kachel ---------- */

function openLightbox(dialog, fromEl) {
  dialog.showModal();
  if (!an()) return;

  const inner = dialog.querySelector(".lb-inner");
  const stage = dialog.querySelector(".lb-stage");
  const quelle = fromEl && fromEl.querySelector("img");

  gsap.fromTo(inner, { opacity: 0, scale: .96, y: 12 },
    { opacity: 1, scale: 1, y: 0, duration: .45, ease: "expo.out", clearProps: "all" });

  if (!quelle || !stage) return;

  const von = quelle.getBoundingClientRect();
  requestAnimationFrame(() => {
    const nach = stage.getBoundingClientRect();
    if (!nach.width || !nach.height) return;

    const geist = document.createElement("img");
    geist.src = quelle.src;
    geist.className = "geist";
    Object.assign(geist.style, {
      left: von.left + "px", top: von.top + "px",
      width: von.width + "px", height: von.height + "px"
    });
    document.body.appendChild(geist);

    gsap.to(geist, {
      left: nach.left, top: nach.top, width: nach.width, height: nach.height,
      borderRadius: 14, duration: .5, ease: "expo.inOut",
      onComplete: () => {
        const bild = dialog.querySelector("img[id]");
        const weg = () => gsap.to(geist, { opacity: 0, duration: .25, onComplete: () => geist.remove() });
        if (bild && !bild.hidden && bild.complete) weg();
        else if (bild) { bild.addEventListener("load", weg, { once: true }); setTimeout(weg, 2500); }
        else weg();
      }
    });
  });
}

/* ---------- Zaehler ---------- */

function count(el, bis, suffix = "") {
  if (!el) return;
  const ziel = Number(bis) || 0;
  const von = Number(String(el.textContent).replace(/[^\d]/g, "")) || 0;

  // Erst den richtigen Wert hinschreiben, dann erst hochzaehlen lassen. So
  // stimmt die Zahl auch, wenn die Animation gar nicht laeuft.
  el.textContent = ziel + suffix;
  if (!an() || von === ziel) return;

  const o = { v: von };
  gsap.to(o, {
    v: ziel, duration: .9, ease: "power3.out", overwrite: true,
    onUpdate: () => { el.textContent = Math.round(o.v) + suffix; },
    onComplete: () => { el.textContent = ziel + suffix; }
  });
}

/* ---------- Feiern ----------

   Drei Stufen: ein Funkenregen am Knopf, ein Lichtring, und fuer die ganz
   grossen Momente Konfetti ueber den ganzen Bildschirm samt Banner. Alles
   liegt ueber der App, faengt keine Klicks und raeumt sich selbst weg. */

const FARBEN = ["#0F6E4F", "#54C795", "#E0B341", "#B33A22", "#2E7FA8", "#F2D27A"];
const GOLD = ["#E0B341", "#F2D27A", "#C4862A", "#FFF1C2"];

function mitte(el) {
  if (!el) return null;
  if (typeof el.x === "number" && typeof el.y === "number" && !el.getBoundingClientRect) return el;
  const r = el.getBoundingClientRect();
  if (!r.width && !r.height) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function feiern(el, { menge = 18, farben = FARBEN, weite = 1 } = {}) {
  if (!an()) return;
  const m = mitte(el);
  if (!m) return;
  for (let i = 0; i < menge; i++) {
    const p = document.createElement("span");
    p.className = "funke" + (i % 3 === 0 ? " eckig" : "");
    p.style.background = farben[i % farben.length];
    p.style.left = m.x + "px";
    p.style.top = m.y + "px";
    document.body.appendChild(p);
    const winkel = (Math.PI * 2 * i) / menge + Math.random() * .5;
    const w = (55 + Math.random() * 75) * weite;
    gsap.to(p, {
      x: Math.cos(winkel) * w,
      y: Math.sin(winkel) * w - 24,
      rotate: Math.random() * 360,
      opacity: 0,
      scale: .4 + Math.random() * .6,
      duration: .75 + Math.random() * .45,
      ease: "power3.out",
      onComplete: () => p.remove()
    });
  }
  ring(m, farben[0]);
}

/* Ein Lichtring, der sich von einem Punkt ausbreitet. */
function ring(el, farbe) {
  if (!an()) return;
  const m = mitte(el);
  if (!m) return;
  const r = document.createElement("span");
  r.className = "lichtring";
  r.style.left = m.x + "px";
  r.style.top = m.y + "px";
  if (farbe) r.style.borderColor = farbe;
  document.body.appendChild(r);
  gsap.fromTo(r, { scale: .2, opacity: .9 }, { scale: 3.2, opacity: 0, duration: .9, ease: "expo.out", onComplete: () => r.remove() });
}

/* Konfetti von oben ueber den ganzen Bildschirm. */
function konfetti({ menge = 140, farben = FARBEN } = {}) {
  if (!an()) return;
  const b = window.innerWidth, h = window.innerHeight;
  for (let i = 0; i < menge; i++) {
    const p = document.createElement("span");
    p.className = "konfetto";
    p.style.background = farben[i % farben.length];
    p.style.left = Math.random() * b + "px";
    p.style.top = "-20px";
    p.style.width = 6 + Math.random() * 7 + "px";
    p.style.height = 9 + Math.random() * 9 + "px";
    document.body.appendChild(p);
    gsap.to(p, {
      y: h + 60,
      x: (Math.random() - .5) * 260,
      rotate: (Math.random() - .5) * 900,
      rotateX: Math.random() * 720,
      duration: 2 + Math.random() * 1.8,
      delay: Math.random() * .7,
      ease: "power1.in",
      onComplete: () => p.remove()
    });
  }
}

/* Grosses Banner in der Mitte, das nach kurzer Zeit wieder geht. */
function banner(titel, unter = "", symbol = "🎉") {
  if (!an()) return;
  const el = document.createElement("div");
  el.className = "fx-banner";
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = `<div class="fx-banner-in"><span class="fx-banner-sym">${symbol}</span><strong></strong><small></small></div>`;
  el.querySelector("strong").textContent = titel;
  el.querySelector("small").textContent = unter;
  document.body.appendChild(el);
  const inn = el.querySelector(".fx-banner-in");
  const tl = gsap.timeline({ onComplete: () => el.remove() });
  tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: .3 })
    .fromTo(inn, { scale: .5, y: 40, rotate: -6 }, { scale: 1, y: 0, rotate: 0, duration: .9, ease: "elastic.out(1, .55)" }, 0)
    .fromTo(el.querySelector(".fx-banner-sym"), { scale: 0, rotate: -90 }, { scale: 1, rotate: 0, duration: .8, ease: "back.out(2.5)" }, .15)
    .to(inn, { scale: .9, y: -30, opacity: 0, duration: .5, ease: "power2.in" }, "+=1.5")
    .to(el, { opacity: 0, duration: .35 }, "<.15");
  worte(el.querySelector("strong"), { verz: .15, dauer: .9 });
}

/* Ein Element kurz aufploppen lassen. */
function plopp(el, staerke = 1.25) {
  if (!el || !an()) return;
  gsap.fromTo(el, { scale: staerke }, { scale: 1, duration: .7, ease: "elastic.out(1.1, .4)", clearProps: "transform" });
}

/* Zahl am Anfang eines Textes hochzaehlen ("14 km", "1.240 km", "7").
   Kommazahlen bleiben stehen. Der Endwert steht immer sofort drin. */
function zaehle(el) {
  if (!el || !an()) return;
  const t = el.textContent;
  const m = t.match(/^(\d{1,3}(?:\.\d{3})*|\d+)(?![\d,])(.*)$/s);
  if (!m) return;
  const ziel = Number(m[1].replace(/\./g, ""));
  if (!isFinite(ziel) || ziel < 2) return;
  const rest = m[2];
  const o = { v: 0 };
  gsap.to(o, {
    v: ziel, duration: 1.1, ease: "power3.out", overwrite: true,
    onUpdate: () => { el.textContent = Math.round(o.v).toLocaleString("de-DE") + rest; },
    onComplete: () => { el.textContent = t; }
  });
}

/* ---------- Dashboard ----------

   Eine Zeitleiste fuer die Startseite: Gruss Wort fuer Wort hinter einer
   Maske, die beiden Werkzeuge kippen nach vorn, Ring und Zahlen laufen hoch,
   die Route auf der Planer-Karte zeichnet sich. Ohne GSAP steht einfach alles
   im Endzustand da - die Seite ist von Anfang an vollstaendig. */

function dashboard(root) {
  if (!root || !an()) return;
  const q = (s) => [...root.querySelectorAll(s)];

  // Gruss in Woerter zerlegen (jedes Mal neu, der Text aendert sich)
  const gruss = root.querySelector("#homeGreet");
  if (gruss) {
    const worte = gruss.textContent.split(" ");
    gruss.textContent = "";
    worte.forEach((w, i) => {
      const huelle = document.createElement("span");
      huelle.className = "wort";
      const innen = document.createElement("span");
      innen.textContent = w + (i < worte.length - 1 ? " " : "");
      huelle.appendChild(innen);
      gruss.appendChild(huelle);
    });
  }

  const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
  tl.fromTo(q(".dash-top > *"), { y: -14, opacity: 0 }, { y: 0, opacity: 1, duration: .7, stagger: .06, clearProps: "transform" }, 0)
    .fromTo(q("#homeDate"), { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: .7 }, .05)
    .fromTo(q("#homeGreet .wort > span"), { yPercent: 110 }, { yPercent: 0, duration: 1.05, stagger: .07 }, .1)
    .fromTo(q("#homeLead"), { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: .8 }, .35)
    .fromTo(q(".mod"), { y: 46, opacity: 0, rotateX: 9, transformPerspective: 900 },
      { y: 0, opacity: 1, rotateX: 0, duration: 1.15, stagger: .12, clearProps: "transform,opacity" }, .3)
    .fromTo(q(".art-tick"), { scale: 0, opacity: 0, transformOrigin: "50% 50%" },
      { scale: 1, opacity: 1, duration: .5, stagger: .12, ease: "back.out(2.4)" }, .75)
    .fromTo(q(".art-bar"), { scaleX: 0, transformOrigin: "0% 50%" }, { scaleX: 1, duration: .8, stagger: .08 }, .7)
    .fromTo(q(".art-pin"), { y: -18, opacity: 0 }, { y: 0, opacity: 1, duration: .6, stagger: .14, ease: "back.out(2)" }, 1.0)
    .fromTo(q("#homeNext:not([hidden]), .kpi, .dash-reise, .dash-sektion-kopf"), { y: 26, opacity: 0 },
      { y: 0, opacity: 1, duration: .9, stagger: .05, clearProps: "transform,opacity" }, .55);

  // Routen sich selbst zeichnen lassen
  q(".art-route, #nextSkizze .skizze-weg, .dash-reise .skizze-weg").forEach((p, i) => {
    if (!p.getTotalLength) return;
    const len = p.getTotalLength();
    tl.fromTo(p, { strokeDasharray: len, strokeDashoffset: len },
      { strokeDashoffset: 0, duration: 1.5, ease: "power2.inOut",
        onComplete: () => { p.style.strokeDasharray = ""; p.style.strokeDashoffset = ""; } }, .8 + i * .05);
  });

  // Ringe fuellen sich
  q("#modPackRing, #nextRing").forEach((r) => {
    const ziel = parseFloat(getComputedStyle(r).getPropertyValue("--p")) || 0;
    tl.fromTo(r, { "--p": 0 }, { "--p": ziel, duration: 1.6, ease: "power3.out" }, .7);
  });

  // Zahlen laufen hoch. Der richtige Wert steht schon drin - laeuft die
  // Animation nicht, bleibt er einfach stehen.
  q("[data-zahl]").forEach((z) => {
    const ziel = Number(z.dataset.zahl);
    if (!isFinite(ziel) || z.dataset.zahl === "") return;
    const suffix = z.dataset.suffix || "";
    const o = { v: 0 };
    tl.to(o, {
      v: ziel, duration: 1.4, ease: "power3.out",
      onUpdate: () => { z.textContent = Math.round(o.v).toLocaleString("de-DE") + suffix; },
      onComplete: () => { z.textContent = ziel.toLocaleString("de-DE") + suffix; }
    }, .75);
  });
}

/* ---------- Scrollen steuern ---------- */

function scrollStop() { if (lenis) lenis.stop(); }
function scrollStart() { if (lenis) lenis.start(); }
function scrollTop() {
  if (lenis) lenis.scrollTo(0, { immediate: true });
  else window.scrollTo({ top: 0 });
}

const api = {
  get gsap() { return gsap; },
  aktiv: () => an(),
  intro, stagger, reveal, zeilen, worte, screenIn, panelIn, dialogIn, scrollIn,
  flip, flipZustand, openLightbox, count, zaehle, feiern, ring, konfetti, banner, plopp, dashboard,
  scrollStop, scrollStart, scrollTop
};

export default api;
