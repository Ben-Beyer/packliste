/* Vorlage fuer neue Trips - uebernommen aus Packliste.docx */

export const TEMPLATE = [
  { icon: "📋", name: "Reisedokumente & Geld", items: [
    ["Personalausweis/Pass"],
    ["Kreditkarte(n) & etwas Bargeld", "PLN"],
    ["Fahrzeugdokumente", "Führerschein, Fahrzeugschein, Versicherung"]
  ]},
  { icon: "👕", name: "Kleidung", sub: "September — mild bis warm", items: [
    ["4–5 T-Shirts/Oberteile"],
    ["2 längere Oberteile", "für kühlere Abende"],
    ["Skiunterwäsche"],
    ["1 leichte Jacke/Fleece"],
    ["1 Regenjacke"],
    ["2 Jeans/lange Hosen"],
    ["1 Shorts"],
    ["7 Unterhosen & Socken"],
    ["Bequeme Wanderschuhe"],
    ["Sneaker/Freizeitschuhe"],
    ["Schlafanzug"],
    ["Badekleidung", "falls See/Becken geplant"]
  ]},
  { icon: "🧴", name: "Toilettenartikel & Hygiene", items: [
    ["Zahnbürste & Zahnpasta"],
    ["Deodorant"],
    ["Handtuch"],
    ["Kernseife/Duschgel"],
    ["Sonnencreme", "mindestens SPF 30"],
    ["Medikamente", "persönlich benötigt"],
    ["Verbandsmaterial", "Blasenpflaster, Pflaster"],
    ["Klopapier"]
  ]},
  { icon: "📱", name: "Technik & Elektronik", items: [
    ["Handy & Ladekabel"],
    ["Powerbank"],
    ["Autoladeadapter", "KFZ-Ladegerät"],
    ["Kamera/GoPro", "optional"],
    ["Kopfhörer"],
    ["SD-Karten"],
    ["Luftpumpe"]
  ]},
  { icon: "🚗", name: "Auto-Ausrüstung", items: [
    ["Vollgetankter Tank"],
    ["Scheibenwischer wechseln"],
    ["Scheibenwischwasser"],
    ["Öl prüfen"],
    ["Ersatzflüssigkeiten", "Kühlwasser, Scheibenwischwasser"],
    ["Ersatzreifen/Reifenpannenset"],
    ["Warnwesten"],
    ["Warndreieck"],
    ["Taschenlampe/Headlamp"],
    ["Ersatzbatterien"],
    ["Verbandsmaterial"],
    ["Ersatzsicherungen"],
    ["Starthilfekabel", "optional"],
    ["Handbremsenflüssigkeit", "optional"]
  ]},
  { icon: "🗺️", name: "Navigation & Planung", items: [
    ["Navi/Handy mit Offline-Karten", "Maps.me, Google Maps Download"],
    ["Papierstraßenkarte"],
    ["Tankstellenadressen"]
  ]},
  { icon: "🍴", name: "Lebensmittel & Getränke", items: [
    ["Reisetassen für Kaffee"],
    ["Snacks für unterwegs", "Riegel, Nüsse, Obst"],
    ["Wasserflasche", "auffüllbar"],
    ["Sportdrink/Elektrolyte", "optional"],
    ["Geschirr"],
    ["Kocher"],
    ["Kochtopf/Töpfe"],
    ["Besteck"],
    ["Feuerzeug"],
    ["Panzertape"],
    ["Karabiner"],
    ["Schnur/Seil"]
  ]},
  { icon: "📖", name: "Sonstiges", items: [
    ["Müllbeutel"],
    ["USB-Stick", "für gemeinsame Fotos"],
    ["Taschenmesser", "ins Gepäck, nicht ins Handgepäck"],
    ["Boot"],
    ["Schlafsack"],
    ["Isomatte"],
    ["Kopfkissen"],
    ["Hängematten"],
    ["Zelt"],
    ["Wasserkanister"]
  ]}
];

/* Slug ohne Punkt und Schraegstrich - die IDs werden als Firestore-Feldnamen
   unter `checks.<id>` benutzt, und dort trennt ein Punkt die Pfad-Ebenen. */
export function slug(s) {
  return String(s).toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "x";
}

export function buildSections(template) {
  return template.map((sec) => {
    const id = slug(sec.name);
    return {
      id,
      icon: sec.icon || "🎒",
      name: sec.name,
      sub: sec.sub || "",
      items: sec.items.map((it) => ({
        id: id + "__" + slug(it[0]),
        label: it[0],
        note: it[1] || ""
      }))
    };
  });
}

export const EMPTY_SECTIONS = [
  { id: "packliste", icon: "🎒", name: "Packliste", sub: "", items: [] }
];
