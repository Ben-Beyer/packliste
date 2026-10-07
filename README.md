# Reisebuddy

Zwei Werkzeuge in einer App: die **Packliste** zum gemeinsamen Packen und der
**TripPlaner** zum Planen der Route — mit Karte, Tagen, Kilometern und Fahrzeit.
Dazu Fotos in Ordnern, Spots zum Erobern und die gefahrene Route aus den Fotos.

Alles startet direkt beim Öffnen der Adresse. Es gibt kein Backend, das erst
hochgefahren werden muss — auch der TripPlaner läuft komplett im Browser.

Live: **https://ben-beyer.github.io/packliste/**
(Die Adresse behält den alten Namen, damit installierte Geräte weiterlaufen.)

Alles läuft im kostenlosen Firebase-Spark-Tarif und auf GitHub Pages. Keine
bezahlten Dienste, keine Schlüssel mit Kosten, keine Kreditkarte.

## Auf dem iPhone installieren

1. Adresse in **Safari** öffnen (nur Safari darf auf iOS installieren).
2. Teilen-Symbol → **Zum Home-Bildschirm**.
3. Läuft danach im Vollbild wie eine App, auch ohne Netz.

## Dashboard

Die Startseite. Oben der Gruß, darunter die zwei großen Werkzeuge als Karten:
**Packliste** (Fortschritt über alle Reisen) und **TripPlaner** (Stationen und
geplante Kilometer). Dann die nächste Reise im Rampenlicht mit Countdown,
Pack-Ring, Routenskizze und den Knöpfen *Weiterpacken* / *Route planen*, vier
Kennzahlen und die Reiseliste mit Schnellzugriff auf beide Werkzeuge.

Bewegung: Gruß Wort für Wort hinter einer Maske, die Werkzeug-Karten kippen nach
vorn, Ringe und Zahlen laufen hoch, Routen zeichnen sich selbst, im Hintergrund
treiben Farbflächen über Höhenlinien. Mit Maus neigen sich die Karten zum Zeiger.

## TripPlaner

Fest eingebaut, kein Unterpunkt mehr: eigener Vollbild-Arbeitsplatz unter
`#/planer/<code>`, am Rechner Liste links und Karte rechts, am Handy Karte oben.
Er plant **dieselbe Reise** wie die Packliste — gespeichert wird in den
Stationen der Reise, live für alle mit dem Code. Ein Knopf springt jeweils zur
Packliste bzw. zum TripPlaner derselben Reise.

| Bereich | Was drin ist |
| --- | --- |
| **Route** | Tage aus dem Zeitraum, Stationen je Tag mit Etappe (km · Zeit), Verkehrsmittel Auto/Rad/zu Fuß, Reihenfolge optimieren, Tag in Google Maps, Stationen verschieben (Pfeile, Tagwahl, am Rechner ziehen), Merkliste für Ideen ohne Tag |
| **Entdecken** | Ortssuche, zehn Kategorien (Sehenswertes, Museen, Aussicht, Natur, Strand, Essen, Café, Camping, Unterkunft, Tanken) im Kartenausschnitt, mit einem Tipp einplanen |
| **Teilen & Daten** | Google Maps, GPX (Wegpunkte, Route, Straßenspur), Plan als Text, JSON im alten TripPlaner-Format kopieren und einfügen |

Ein Tipp auf die Karte setzt eine Station; der Ortsname wird erst beim
Bestätigen nachgeschlagen. Die Straßenroute kommt von OSRM; antwortet der
Dienst nicht, zeigt der Planer die Luftlinie (×1,3) und sagt das dazu. Die
Reihenfolge wird mit nächstem Nachbarn plus 2-opt optimiert und beginnt am
Ende des Vortags.

**Das alte Uni-Projekt** (Spring Boot auf `localhost:8080`) wird nicht mehr
gebraucht. Unter *Teilen & Daten → Aus dem alten Uni-Projekt holen* lassen sich
alte Sitzungen (`trip-…`) noch übernehmen — nur am Rechner mit laufendem
Backend in Chrome/Edge. Das JSON-Feld geht überall.

## Die sechs Reiter einer Reise

| Reiter | Was drin ist |
| --- | --- |
| **Übersicht** | Zeitraum, Countdown, vier Kennzahlen, Wetteraussicht am Ziel, Mitreisende, Einladungscode |
| **Packen** | Bereiche und Positionen, „je Person“ und „einer reicht“; unter *Ändern & löschen* Positionen und ganze Bereiche löschen (immer mit Rückfrage, nur für diese Reise; die Vorlage bleibt) |
| **Plan** | Stationen mit Datum, Notiz und Ort; Sprung in den TripPlaner |
| **Fotos** | Ordner je Person, Galerie, Großansicht, Ort nachtragen |
| **Spots** | Challenge: schöne Orte markieren, Freunde herausfordern, Rangliste |
| **Karte** | Gefahrene Route aus den Fotos, geplante Stationen, Spots — einzeln einblendbar |

## Warum manche Fotos keinen Ort haben

Das ist der häufigste Stolperstein, und meist liegt es **nicht** an der App:

- **Google Fotos, WhatsApp, Telegram und Signal entfernen die GPS-Angabe**,
  bevor sie ein Bild ausliefern. Im Bild steht dann noch die Uhrzeit, aber kein Ort.
- Ein Bildschirmfoto (PNG) hat nie einen Ort.
- Ein erneut gespeichertes oder zugeschnittenes Bild verliert die Metadaten oft.

Die App sagt deshalb pro Foto im Klartext, **warum** kein Ort da ist, statt
stumm eine Null zu zeigen. Gelesen werden JPEG, **HEIC/HEIF** (iPhone-Originale)
und PNG mit `eXIf`-Block — alles in `exif.js`, ohne Fremdbibliothek.

Damit die Karte trotzdem funktioniert, lässt sich der Ort **nachtragen**: in der
Großansicht für ein Foto, oder im Ordner *Ohne Ort* für alle auf einmal — per
Ortssuche oder mit einem Griff zu einer geplanten Station. Von Hand gesetzte
Orte bekommen einen messingfarbenen Stecknadel-Punkt statt eines grünen.

**Damit der Ort von vornherein drinsteht:** auf dem iPhone unter
*Einstellungen → Datenschutz → Ortungsdienste → Kamera* den Zugriff erlauben,
und die Bilder **direkt aus der Fotomediathek** hochladen statt über einen
Messenger. Beim Teilen über das iOS-Teilen-Menü lässt sich der Ort unter
*Optionen* ausdrücklich mitgeben.

## Ordner

Jede Person, die mitfährt, bekommt automatisch einen eigenen Ordner — auch wenn
sie noch nichts hochgeladen hat. Dazu zwei Sonderordner: **Alle Fotos** und
**Ohne Ort** (erscheint nur, wenn es welche gibt, und erklärt gleich, woran es
liegt). Das erste hochgeladene Foto wird Titelbild der Reise und erscheint in
der Reiseliste.

## Spots — die Challenge

Ein Ort, den die anderen unbedingt sehen sollen. Anlegen geht über die Ortssuche
oder **direkt aus einem Foto**, das schon einen Ort hat — der übliche Weg:
schönes Bild gemacht, Spot daraus gemacht.

- **Herausfordern** setzt alle Mitreisenden auf die Liste.
- **Ich war da!** hakt den Spot für dich ab, mit kleiner Feier.
- Oben steht die **Rangliste**: wer hat wie viele eingesammelt.
- Auf der Karte erscheinen Spots als Stern; erobert = ausgefüllt.

Spots liegen als Feld `challenges` im Reise-Dokument, nicht in einem eigenen
Unterordner — so braucht es keine zusätzliche Firestore-Regel, und weil jeder
Zugriff ein Punktpfad ist (`challenges.<id>.done.<person>`), überschreiben sich
zwei Leute nicht.

## Wer darf was sehen

Jede Reise hat einen achtstelligen Code. Wer den Code hat, ist dabei; wer ihn
nicht hat, kommt nicht heran. Das steckt in den Firestore-Regeln, nicht nur in
der Oberfläche — nachgemessen mit einem angemeldeten Fremdzugriff:

| Versuch | Ergebnis |
| --- | --- |
| Reisen auflisten | **verweigert** (`permission-denied`) |
| Reise mit richtigem Code lesen | erlaubt |
| Reise mit geratenem Code | existiert nicht |
| Zugriff ohne Anmeldung | **verweigert** |
| Reise löschen | erlaubt — aber nur mit Code |

Der Code hat 8 Zeichen aus 32 (ohne 0/O/1/I), gut 1 Billion Möglichkeiten.
Deine Reiseliste liegt nur auf deinem Gerät (`localStorage`) und besteht aus
Codes, nicht aus Daten.

## Fotos und Speicherplatz

Firebase Storage verlangt seit Oktober 2024 den Blaze-Tarif mit Kreditkarte. Die
Bilder liegen deshalb **in Firestore**, das im Spark-Tarif bleibt:

- Jedes Bild wird im Browser auf maximal 1600 px verkleinert (~100–400 KB),
  dazu ein Vorschaubild mit 480 px.
- Vorschau und großes Bild liegen in getrennten Dokumenten. Die Galerie lädt nur
  die Vorschauen.
- Firestore erlaubt 1 MiB pro Dokument; die App komprimiert notfalls weiter.

**Gratis sind 1 GB** — grob 2500–4000 Fotos. Der Reiter *Fotos* zeigt immer die
Belegung.

## Bewegung

GSAP (mit ScrollTrigger und Flip) und Lenis kommen vom CDN. Die Effekte sitzen in
`motion.js` und wirken in der ganzen App, nicht nur auf dem Dashboard:

| Wo | Was passiert |
| --- | --- |
| Überall | Hintergrund mit treibenden Farbflächen und Höhenlinien, ein Lichtschein folgt der Maus, Scroll-Fortschritt als Leiste oben |
| Bildschirmwechsel | Kopfleiste fällt ein, Überschrift steigt Wort für Wort aus einer Maske, Inhalt kommt aus der Unschärfe |
| Reiter | Inhalt baut sich gestaffelt auf, der Marker fließt wie ein Tropfen hinüber, das Symbol hüpft |
| Karten | neigen sich in 3D zum Zeiger und tragen ein Licht (`.tilt`), Hauptknöpfe ziehen sich magnetisch zum Zeiger |
| Jeder Tipp | schlägt eine Welle auf Knöpfen, Chips, Reitern und Karten |
| Dialoge | federn aus der Tiefe herauf |
| Packliste | Funken am Haken, Lichtring und drehendes Symbol bei fertigem Bereich, Konfetti und Banner bei „Alles gepackt!“, Glanz über den Balken, Bereiche gleiten beim Scrollen herein |
| Spots | Gold-Konfetti und Banner „Spot erobert!“ |
| Übersicht einer Reise | großer Countdown, Pack-Ring füllt sich, Routenskizze zeichnet sich, Titelbild zieht langsam heran |
| TripPlaner | Kamerafahrt aus der Weite auf die Route, Stecknadeln fallen mit Ring auf die Karte, Route zeichnet sich, Stationen gleiten beim Umsortieren an ihren Platz (Flip), Kennzahlen zählen hoch |

Zwei Sicherungen: Jedes CDN-Skript hat eine **Frist** (GSAP 6 s, Lenis 4 s) —
antwortet das CDN nicht, startet die App ohne Animation statt gar nicht. Und wer
im Betriebssystem *weniger Bewegung* eingestellt hat, bekommt still den
Endzustand, ohne Konfetti und ohne Neigen. Ein Element wird nur dann
unsichtbar gesetzt, wenn die Animation es auch sicher wieder hervorholt.
Sanftes Scrollen (Lenis) läuft nur mit Maus und Trackpad; auf dem Handy bleibt
das native Scrollen.

## Kostenlose Dienste

| Wofür | Dienst | Schlüssel nötig |
| --- | --- | --- |
| Daten, Anmeldung | Firebase Spark | nein (Web-Config ist öffentlich) |
| Kartenbilder | OpenStreetMap | nein |
| Kartenbibliothek | Leaflet 1.9.4 (cdnjs) | nein |
| Ortssuche | Nominatim | nein |
| Kartenbilder TripPlaner | CARTO Voyager / Dark Matter, notfalls OpenStreetMap | nein |
| Straßenroute | OSRM (routing.openstreetmap.de, router.project-osrm.org) | nein |
| Orte entdecken | Overpass-API (OpenStreetMap) | nein |
| Wetter | Open-Meteo | nein |
| Animation | GSAP 3.13 (cdnjs), Lenis (jsDelivr) | nein |

Nominatim und Overpass werden nur auf Knopfdruck gefragt — deren
Nutzungsordnungen erlauben keine Anfrage pro Tastendruck. Die Route wird nur
neu gerechnet, wenn sich Stationen mit Ort ändern, und im Speicher gemerkt.

## Ändern

Die Startvorlage für neue Reisen steht in `data.js` als `TEMPLATE`:

```js
{ icon:"📱", name:"Technik & Elektronik", items:[
  ["Handy & Ladekabel", "", "je"],       // "je" = jeder einzeln
  ["Autoladeadapter", "KFZ-Ladegerät"],  // ohne "je" = einer reicht
]}                                       // mittlerer Eintrag = graue Notiz darunter
```

Ein vierter Eintrag listet andere Namen, unter denen die Position in einer Reise
schon stehen kann (`["Cap/Sonnenhut", "", "je", ["Kap"]]`). Die Vorlage ist
nach Kategorien sortiert, innerhalb eines Bereichs steht Zusammengehöriges
beieinander.

Wird die Vorlage geändert, **`VORLAGE_STAND` in `data.js` hochzählen**: Laufende
Reisen zeigen dann über der Packliste einmal „Packliste aufräumen & ergänzen“
mit *Übernehmen* / *Nein danke* (`ordneNachVorlage`). Übernehmen

- sortiert jede bekannte Position in ihren Bereich und an ihre Stelle und gibt
  ihr Name und Notiz aus der Vorlage — ID, Art und Haken bleiben,
- legt Doppeltes zusammen (die Haken wandern zur Position, die bleibt),
- ergänzt, was fehlt,
- lässt eigene Positionen in ihrem Bereich.

Die Antwort steht im Reise-Dokument (`vorlage`), damit nicht jeder Mitreisende
erneut gefragt wird.

**Löschen gilt nur für die eine Reise.** Die Vorlage ist der Pool und bleibt
unverändert. Gelöschte Namen stehen in `entfernt` im Reise-Dokument, damit das
Aufräumen sie dort nicht wieder anbietet.

Nach jeder Dateiänderung **`VERSION` in `sw.js` hochzählen** (`reisebuddy-v19`
→ `v20`). Der Service Worker holt eigene Dateien mit `no-cache`, fragt also beim
Server nach — sonst liefert GitHub Pages bis zu zehn Minuten alte Dateien aus,
und neue treffen auf alte Bausteine.

**Fallstricke:**
- Positions-IDs sind Slugs `<bereich>__<position>` ohne Punkt und Schrägstrich,
  weil sie als Firestore-Feldpfad `checks.<id>.<person>` dienen.
- `memberKey` (store.js) und `slug` (data.js) müssen Umlaute gleich umschreiben,
  sonst zerfällt eine Person in zwei.
- Deutsche Anführungszeichen in JavaScript immer als Paar `„…“` schreiben. Ein
  gerades Schlusszeichen beendet die Zeichenkette mitten im Satz — das hat die
  App schon einmal komplett lahmgelegt.
- `.row` gehört der Packliste — keine zweite Bedeutung dafür vergeben.

## Wo was liegt

| Was | Wo |
| --- | --- |
| Dein Name | `localStorage`, `reisebuddy.v1.user` |
| Deine Reiseliste | `localStorage`, `reisebuddy.v1.mytrips` — nur die Codes |
| TripPlaner: Verkehrsmittel, Bereich, Zieltag | `localStorage`, `reisebuddy.v1.planer.<code>` |
| Zuletzt gerechnete Route (für das Dashboard) | `localStorage`, `reisebuddy.v1.route.<code>` |
| Reise, Packliste, Stationen (auch die des TripPlaners), Haken, Spots, Titelbild | Firestore, `trips/<code>` |
| Foto-Eintrag samt Vorschaubild | Firestore, `trips/<code>/photos/<id>` |
| Großes Bild | Firestore, `trips/<code>/photoData/<id>` |

## Dateien

| Datei | Zweck |
| --- | --- |
| `index.html` | Aufbau aller Bildschirme, Reiter und Dialoge |
| `style.css` | Gestaltung, Hell- und Dunkelmodus über Tokens |
| `app.js` | Rahmen: Name, Dashboard, Reiseliste, Reiter, Übersicht, Wetter, Adressen |
| `dashboard.js` | Startseite und Reiseauswahl des TripPlaners |
| `tripplaner.js` | TripPlaner: Tage, Karte, Entdecken, Teilen & Daten |
| `routing.js` | Straßenroute, Orte (Overpass), Ortssuche, Optimierung, GPX |
| `packliste.js` | Packliste |
| `plan.js` | Stationen samt Ortssuche (auch der Bearbeiten-Dialog des TripPlaners) |
| `photos.js` | Hochladen, Verkleinern, Ordner, Galerie, Ort nachtragen |
| `spots.js` | Challenge-Spots und Rangliste |
| `mapview.js` | Karte, Ebenen, Routen, Kilometer |
| `motion.js` | GSAP/Lenis, Intro, Auftritte, Übergänge |
| `weather.js` | Vorhersage von Open-Meteo |
| `exif.js` | Aufnahmeort und -zeit aus JPEG, HEIC und PNG |
| `store.js` | Firestore-Schicht |
| `data.js` | Vorlage für neue Reisen |
| `firebase-config.js` | Projekt-Zugangsdaten |
| `sw.js` | Service Worker |
| `icons/` | App-Icons, erzeugt mit Pillow |
| `_test/` | Testbilder mit und ohne GPS (nicht im Repo) |
