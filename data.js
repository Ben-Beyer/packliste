/* Vorlage fuer neue Trips - uebernommen aus Packliste.docx

   Aufbau einer Position:  ["Bezeichnung", "Notiz", "je"]
     - "Notiz" ist die graue Zeile darunter, "" wenn keine
     - "je"    heisst: das muss JEDER einzeln packen (Zahnbuerste, Unterhosen)
       fehlt es, reicht es, wenn EINER es einpackt (Zelt, Kocher, Warndreieck) */

export const TEMPLATE = [
  { icon: "📋", name: "Reisedokumente & Geld", items: [
    ["Personalausweis/Pass", "", "je"],
    ["Kreditkarte(n) & etwas Bargeld", "PLN", "je"],
    ["Fahrzeugdokumente", "Führerschein, Fahrzeugschein, Versicherung", "je"]
  ]},
  { icon: "👕", name: "Kleidung", sub: "September — mild bis warm", items: [
    ["4–5 T-Shirts/Oberteile", "", "je"],
    ["2 längere Oberteile", "für kühlere Abende", "je"],
    ["Skiunterwäsche", "", "je"],
    ["1 leichte Jacke/Fleece", "", "je"],
    ["1 Regenjacke", "", "je"],
    ["2 Jeans/lange Hosen", "", "je"],
    ["1 Shorts", "", "je"],
    ["7 Unterhosen & Socken", "", "je"],
    ["Bequeme Wanderschuhe", "", "je"],
    ["Sneaker/Freizeitschuhe", "", "je"],
    ["Schlafanzug", "", "je"],
    ["Badekleidung", "falls See/Becken geplant", "je"]
  ]},
  { icon: "🧴", name: "Toilettenartikel & Hygiene", items: [
    ["Zahnbürste & Zahnpasta", "", "je"],
    ["Deodorant", "", "je"],
    ["Handtuch", "", "je"],
    ["Medikamente", "persönlich benötigt", "je"],
    ["Kernseife/Duschgel"],
    ["Sonnencreme", "mindestens SPF 30"],
    ["Verbandsmaterial", "Blasenpflaster, Pflaster"],
    ["Klopapier"]
  ]},
  { icon: "📱", name: "Technik & Elektronik", items: [
    ["Handy & Ladekabel", "", "je"],
    ["Powerbank", "", "je"],
    ["Kopfhörer", "", "je"],
    ["Autoladeadapter", "KFZ-Ladegerät"],
    ["Kamera/GoPro", "optional"],
    ["SD-Karten"],
    ["Luftpumpe"]
  ]},
  { icon: "🚗", name: "Auto-Ausrüstung", sub: "einmal fürs Auto, nicht pro Person", items: [
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
    ["Reisetassen für Kaffee", "", "je"],
    ["Wasserflasche", "auffüllbar", "je"],
    ["Geschirr", "", "je"],
    ["Besteck", "", "je"],
    ["Snacks für unterwegs", "Riegel, Nüsse, Obst"],
    ["Sportdrink/Elektrolyte", "optional"],
    ["Kocher"],
    ["Kochtopf/Töpfe"],
    ["Feuerzeug"],
    ["Panzertape"],
    ["Karabiner"],
    ["Schnur/Seil"]
  ]},
  { icon: "📖", name: "Sonstiges", items: [
    ["Schlafsack", "", "je"],
    ["Isomatte", "", "je"],
    ["Kopfkissen", "", "je"],
    ["Hängematte", "", "je"],
    ["Zelt"],
    ["Boot"],
    ["Wasserkanister"],
    ["Müllbeutel"],
    ["USB-Stick", "für gemeinsame Fotos"],
    ["Taschenmesser", "ins Gepäck, nicht ins Handgepäck"]
  ]}
];

/* Slug ohne Punkt und Schraegstrich - die IDs werden als Firestore-Feldnamen
   unter `checks.<id>.<person>` benutzt, und dort trennt ein Punkt die Ebenen. */
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
        note: it[1] || "",
        each: it[2] === "je"
      }))
    };
  });
}

export const EMPTY_SECTIONS = [
  { id: "packliste", icon: "🎒", name: "Packliste", sub: "", items: [] }
];
