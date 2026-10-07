/* Vorlage fuer neue Trips - uebernommen aus Packliste.docx, seitdem erweitert
   und nach Kategorien sortiert. Innerhalb eines Bereichs stehen zusammen-
   gehoerige Dinge beieinander (erst Schlafen, dann Lager, dann Licht ...).

   Aufbau einer Position:  ["Bezeichnung", "Notiz", "je", ["anderer Name", ...]]
     - "Notiz" ist die graue Zeile darunter, "" wenn keine
     - "je"    heisst: das muss JEDER einzeln packen (Zahnbuerste, Unterhosen)
       fehlt es, reicht es, wenn EINER es einpackt (Zelt, Kocher, Warndreieck)
     - die Liste am Ende sind Namen, unter denen die Position in einer Reise
       schon stehen kann ("Kap" fuer "Cap/Sonnenhut") - dann wird sie dort
       erkannt, einsortiert und nicht ein zweites Mal angelegt.

   Die Vorlage ist der Pool: Was in einer Reise geloescht wird, verschwindet
   nur aus dieser Reise (vermerkt in `entfernt`), nie aus der Vorlage.

   Nach jeder Aenderung VORLAGE_STAND hochzaehlen: Laufende Reisen bieten
   dann einmal an, sich auf den neuen Stand zu bringen. */

export const VORLAGE_STAND = 3;

export const TEMPLATE = [
  { icon: "📋", name: "Reisedokumente & Geld", items: [
    ["Personalausweis/Pass", "", "je"],
    ["Kreditkarte(n) & etwas Bargeld", "PLN", "je"],
    ["Fahrzeugdokumente", "Führerschein, Fahrzeugschein, Versicherung", "je"],
    ["Krankenversicherungskarte", "Rückseite gilt in der ganzen EU", "je"],
    ["Auslandskrankenversicherung", "Notrufnummer im Handy speichern", "je"],
    ["Dokumente als Foto im Handy", "Ausweis, Führerschein, Versicherung", "je"],
    ["Notfallnummern & Kontakte", "112 gilt überall in der EU"],
    ["Adressen von Unterkünften & Campingplätzen"]
  ]},
  { icon: "👕", name: "Kleidung", sub: "September — mild bis warm", items: [
    ["4–5 T-Shirts/Oberteile", "", "je"],
    ["2 längere Oberteile", "für kühlere Abende", "je"],
    ["Warmer Pulli/Hoodie", "für Abende am Feuer", "je"],
    ["1 leichte Jacke/Fleece", "", "je"],
    ["1 Regenjacke", "", "je"],
    ["2 Jeans/lange Hosen", "", "je"],
    ["1 Shorts", "", "je"],
    ["7 Unterhosen & Socken", "", "je"],
    ["Dicke Socken", "für kalte Nächte im Zelt", "je"],
    ["Skiunterwäsche", "", "je"],
    ["Schlafanzug", "", "je"],
    ["Badekleidung", "falls See/Becken geplant", "je"],
    ["Bequeme Wanderschuhe", "", "je"],
    ["Sneaker/Freizeitschuhe", "", "je"],
    ["Crocs", "auch als Badeschlappen", "je"],
    ["Cap/Sonnenhut", "", "je", ["Kap", "Cap", "Kappe"]],
    ["Sonnenbrille", "", "je"],
    ["Mütze & dünne Handschuhe", "nachts kann es frisch werden", "je"],
    ["Beutel für Schmutzwäsche"]
  ]},
  { icon: "🧴", name: "Toilettenartikel & Hygiene", sub: "Körperpflege & Gesundheit", items: [
    ["Kulturbeutel", "", "je"],
    ["Zahnbürste & Zahnpasta", "", "je"],
    ["Deodorant", "", "je"],
    ["Handtuch", "", "je"],
    ["Rasierer", "", "je"],
    ["Haarbürste/Kamm", "", "je"],
    ["Lippenpflege", "mit Sonnenschutz", "je"],
    ["Brille/Kontaktlinsen", "falls nötig, mit Ersatz", "je"],
    ["Ohrstöpsel & Schlafmaske", "", "je"],
    ["Kernseife/Duschgel"],
    ["Shampoo"],
    ["Nagelknipser & Pinzette"],
    ["Feuchttücher"],
    ["Taschentücher"],
    ["Desinfektionsgel"],
    ["Klopapier"],
    ["Sonnencreme", "mindestens SPF 30"],
    ["After-Sun"],
    ["Mückenspray & Zeckenschutz"],
    ["Medikamente", "persönlich benötigt", "je"],
    ["Reiseapotheke", "Schmerzmittel, Durchfall, Allergie, Fieber"],
    ["Pflaster & Blasenpflaster", "", "", ["Verbandsmaterial"]],
    ["Zeckenzange"]
  ]},
  { icon: "📱", name: "Technik & Elektronik", items: [
    ["Handy & Ladekabel", "", "je"],
    ["Powerbank", "", "je"],
    ["Kopfhörer", "", "je"],
    ["Ersatz-Ladekabel"],
    ["USB-Netzteil mit mehreren Anschlüssen"],
    ["Mehrfachsteckdose & Verlängerungskabel", "für Strom am Campingplatz"],
    ["CEE-Campingadapter", "blauer Campingstecker auf Schuko, optional"],
    ["Autoladeadapter", "KFZ-Ladegerät"],
    ["Handyhalterung fürs Auto"],
    ["Bluetooth-Adapter fürs Auto", "", "", ["Bluetoothadapter Julian", "Bluetoothadapter"]],
    ["Spannungswandler 12 V → 230 V", "optional"],
    ["Bluetooth-Box (JBL)", "", "", ["JBL Boxen", "JBL Box", "JBL"]],
    ["Kamera/GoPro", "optional"],
    ["Kamera-Akkus & Ladegerät"],
    ["SD-Karten"],
    ["USB-Stick", "für gemeinsame Fotos"],
    ["Ersatzbatterien", "für Lampen & Co."]
  ]},
  { icon: "🚗", name: "Auto-Ausrüstung", sub: "einmal fürs Auto, nicht pro Person", items: [
    ["Vollgetankter Tank"],
    ["Öl prüfen"],
    ["Reifendruck prüfen", "beladen etwas mehr Druck"],
    ["Licht prüfen"],
    ["Scheibenwischer wechseln"],
    ["Scheibenwischwasser"],
    ["Maut klären", "Polen: e-TOLL bzw. Mautstellen auf A1/A2/A4"],
    ["Warnwesten"],
    ["Warndreieck"],
    ["Verbandskasten", "Pflicht im Auto, Haltbarkeit prüfen", "", ["Verbandsmaterial"]],
    ["Feuerlöscher", "empfohlen"],
    ["Ersatzreifen/Reifenpannenset"],
    ["Wagenheber & Radkreuz"],
    ["Starthilfekabel", "optional"],
    ["Abschleppseil"],
    ["Ersatzflüssigkeiten", "Kühlwasser, Öl"],
    ["Handbremsenflüssigkeit", "optional"],
    ["Ersatzsicherungen"],
    ["Ersatzlampen-Set"],
    ["Werkzeug/Multitool"],
    ["Arbeitshandschuhe"],
    ["Taschenlampe fürs Auto", "bleibt im Handschuhfach", "", ["Taschenlampe/Headlamp", "Taschenlampe"]],
    ["Parkscheibe"],
    ["Ersatzschlüssel", "nicht im Auto liegen lassen"]
  ]},
  { icon: "🗺️", name: "Navigation & Planung", items: [
    ["Navi/Handy mit Offline-Karten", "Maps.me, Google Maps Download"],
    ["Papierstraßenkarte"],
    ["Route & Übernachtungen grob geplant"],
    ["Stellplatz-App", "park4night o. ä."],
    ["Tankstellenadressen"],
    ["Übersetzer offline", "Polnisch in Google Übersetzer laden"]
  ]},
  { icon: "🍴", name: "Lebensmittel & Getränke", sub: "Essen, Trinken & Küche", items: [
    ["Snacks für unterwegs", "Riegel, Nüsse, Obst"],
    ["Grundvorrat", "Nudeln, Reis, Konserven, Müsli"],
    ["Kaffee & Tee", "Pulver, Filter oder French Press"],
    ["Salz, Pfeffer, Öl & Gewürze"],
    ["Trinkwasservorrat"],
    ["Sportdrink/Elektrolyte", "optional"],
    ["Wasserflasche", "auffüllbar", "je"],
    ["Reisetassen für Kaffee", "", "je"],
    ["Geschirr", "", "je"],
    ["Besteck", "", "je"],
    ["Kocher"],
    ["Gaskartuschen", "passend zum Kocher, eine als Reserve"],
    ["Feuerzeug"],
    ["Kochtopf/Töpfe"],
    ["Pfanne"],
    ["Kochlöffel & Pfannenwender"],
    ["Schneidebrett & scharfes Messer"],
    ["Dosen- & Flaschenöffner"],
    ["Kühlbox", "12 V oder mit Kühlakkus"],
    ["Frischhaltedosen & Zip-Beutel"],
    ["Alufolie"],
    ["Spülmittel, Schwamm & Geschirrtuch"],
    ["Faltschüssel zum Spülen"],
    ["Grill & Grillkohle", "optional, mit Anzünder"]
  ]},
  { icon: "⛺", name: "Camping & Schlafen", sub: "Schlafen, Lager, Licht, Werkzeug", items: [
    ["Schlafsack", "", "je"],
    ["Isomatte", "", "je"],
    ["Kopfkissen", "", "je"],
    ["Bettdecke", "", "je", ["Bettdecken"]],
    ["Hängematte", "", "je"],
    ["Zelt"],
    ["Heringe & Hammer", "plus ein paar Ersatzheringe"],
    ["Zeltunterlage/Plane"],
    ["Tarp/Sonnensegel", "als Regenschutz überm Lager"],
    ["Campingstühle", "einer pro Person", "", ["Campingstuhl", "Kampingstühle"]],
    ["Campingtisch"],
    ["Picknickdecke"],
    ["Stirnlampe", "", "je", ["Stirnlampen"]],
    ["Fette Taschenlampe", "die große, fürs Lager und Nachtwege"],
    ["Campinglampe/Laterne"],
    ["Lichterkette", "optional"],
    ["Taschenmesser", "ins Gepäck, nicht ins Handgepäck"],
    ["Panzertape"],
    ["Kabelbinder"],
    ["Karabiner"],
    ["Schnur/Seil"],
    ["Wäscheleine & Klammern"],
    ["Klappspaten"],
    ["Axt/Säge", "fürs Feuerholz, optional"],
    ["Flickzeug", "für Isomatte, Zelt und Boot"],
    ["Moskitonetz", "optional"],
    ["Wasserkanister"],
    ["Müllbeutel"]
  ]},
  { icon: "🚣", name: "Boot & Wasser", items: [
    ["Boot"],
    ["Paddel"],
    ["Schwimmwesten"],
    ["Luftpumpe"],
    ["Wasserdichter Packsack"]
  ]},
  { icon: "📖", name: "Sonstiges", sub: "Freizeit & Kleinkram", items: [
    ["Tagesrucksack", "", "je"],
    ["Buch/E-Reader", "optional", "je"],
    ["Kartenspiel/Spiele"],
    ["Fernglas", "optional"],
    ["UV-Lampe"],
    ["Regenschirm"],
    ["Notizbuch & Stift"]
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

/* Bringt die Packliste einer laufenden Reise auf den Stand der Vorlage:
     - jede Position, die die Vorlage kennt (unter ihrem Namen oder einem
       anderen), kommt in ihren Bereich und an ihre Stelle und bekommt Name und
       Notiz aus der Vorlage - ID, Art (je Person/einer reicht) und Haken
       bleiben, wie sie in der Reise sind
     - steht dieselbe Sache doppelt da, bleibt eine (die im passenden Bereich)
     - was fehlt, kommt dazu - ausser es wurde in dieser Reise geloescht
     - eigene Positionen bleiben in ihrem Bereich, hinter denen aus der Vorlage
   `checks` entscheidet bei Doppelten mit, welche bleibt.
   Liefert die neuen Bereiche, die neuen Namen, wie viele umgezogen sind und
   welche Doppelten wegfallen ({id, label, keepId}). */
export function ordneNachVorlage(sections, entfernt, checks) {
  const alt = sections || [];
  const weg = new Set((entfernt || []).map(slug));
  const hatHaken = (id) => !!(checks && checks[id] && Object.keys(checks[id]).length);

  const pool = [];
  alt.forEach((s) => s.items.forEach((item) => pool.push({ item, secId: s.id })));
  const vergeben = new Set();
  const taken = new Set(pool.map((p) => p.item.id));
  const keepBySlug = {};           // Name -> ID der Position, die bleibt
  const neu = [];
  let verschoben = 0;
  const out = [];

  TEMPLATE.forEach((tsec) => {
    const sid = slug(tsec.name);
    const vorher = alt.find((s) => s.id === sid);
    const sec = vorher
      ? { ...vorher, icon: vorher.icon || tsec.icon, sub: vorher.sub || tsec.sub || "", items: [] }
      : { id: sid, icon: tsec.icon || "🎒", name: tsec.name, sub: tsec.sub || "", items: [] };

    tsec.items.forEach((it) => {
      const namen = [it[0]].concat(it[3] || []).map(slug);
      const kandidaten = pool.filter((p) => !vergeben.has(p.item.id) && namen.includes(slug(p.item.label)));
      const pick = kandidaten.find((p) => p.secId === sid)
        || kandidaten.find((p) => hatHaken(p.item.id))
        || kandidaten[0];
      if (pick) {
        vergeben.add(pick.item.id);
        if (pick.secId !== sid) verschoben++;
        // Name und Notiz aus der Vorlage, damit aus "Verbandsmaterial" (zweimal)
        // "Pflaster & Blasenpflaster" und "Verbandskasten" werden
        sec.items.push({ ...pick.item, label: it[0], note: it[1] || "" });
        keepBySlug[slug(pick.item.label)] = keepBySlug[slug(pick.item.label)] || pick.item.id;
        namen.forEach((n) => { keepBySlug[n] = keepBySlug[n] || pick.item.id; });
      } else if (!namen.some((n) => weg.has(n))) {
        let iid = sid + "__" + slug(it[0]);
        while (taken.has(iid)) iid += "-" + Math.floor(Math.random() * 100);
        taken.add(iid);
        sec.items.push({ id: iid, label: it[0], note: it[1] || "", each: it[2] === "je" });
        keepBySlug[slug(it[0])] = keepBySlug[slug(it[0])] || iid;
        neu.push(it[0]);
      }
    });
    out.push(sec);
  });

  // Was die Vorlage nicht kennt: bleibt, wo es war - ausser es ist doppelt
  const doppelt = [];
  const eigene = [];
  pool.forEach((p) => {
    if (vergeben.has(p.item.id)) return;
    const s = slug(p.item.label);
    if (keepBySlug[s]) { doppelt.push({ id: p.item.id, label: p.item.label, keepId: keepBySlug[s] }); return; }
    keepBySlug[s] = p.item.id;
    let ziel = out.find((x) => x.id === p.secId) || eigene.find((x) => x.id === p.secId);
    if (!ziel) {
      const orig = alt.find((x) => x.id === p.secId);
      ziel = { ...orig, items: [] };
      eigene.push(ziel);
    }
    ziel.items.push(p.item);
  });

  // Eigene Bereiche hinten an; leere Bereiche nur behalten, wenn sie schon
  // vorher leer da waren (frisch angelegt, noch nichts drin)
  const ergebnis = out.concat(eigene)
    .concat(alt.filter((s) => !s.items.length && !out.some((x) => x.id === s.id)))
    .filter((s) => s.items.length || alt.some((x) => x.id === s.id && !x.items.length));

  return { sections: ergebnis, neu, verschoben, doppelt };
}

export const EMPTY_SECTIONS = [
  { id: "packliste", icon: "🎒", name: "Packliste", sub: "", items: [] }
];
