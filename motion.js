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

  return api;
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

/* ---------- Bildschirmwechsel ---------- */

function screenIn(el) {
  if (!el || !an()) return;
  gsap.fromTo(el, { opacity: 0, y: 14 },
    { opacity: 1, y: 0, duration: .5, ease: "power3.out", clearProps: "all", overwrite: true });
}

function panelIn(el) {
  if (!el || !an()) return;
  gsap.fromTo(el, { opacity: 0, y: 10 },
    { opacity: 1, y: 0, duration: .42, ease: "power2.out", clearProps: "all", overwrite: true });
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

/* ---------- Kleine Feier ---------- */

function feiern(el) {
  if (!el || !an()) return;
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  const farben = ["#0F6E4F", "#54C795", "#E0B341", "#B33A22", "#2E7FA8"];
  for (let i = 0; i < 16; i++) {
    const p = document.createElement("span");
    p.className = "funke";
    p.style.background = farben[i % farben.length];
    p.style.left = x + "px";
    p.style.top = y + "px";
    document.body.appendChild(p);
    const winkel = (Math.PI * 2 * i) / 16 + Math.random() * .4;
    const weite = 60 + Math.random() * 70;
    gsap.to(p, {
      x: Math.cos(winkel) * weite,
      y: Math.sin(winkel) * weite - 20,
      opacity: 0,
      scale: .4 + Math.random() * .5,
      duration: .7 + Math.random() * .35,
      ease: "power2.out",
      onComplete: () => p.remove()
    });
  }
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
  intro, stagger, reveal, zeilen, screenIn, panelIn,
  openLightbox, count, feiern,
  scrollStop, scrollStart, scrollTop
};

export default api;
