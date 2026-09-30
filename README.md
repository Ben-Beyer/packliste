# Reisebuddy

Reisen planen, gemeinsam packen, Fotos in Ordnern sammeln, Spots erobern — und
aus den Aufnahmeorten der Fotos wird eine Karte mit der gefahrenen Route.

Live: **https://ben-beyer.github.io/packliste/**
(Die Adresse behält den alten Namen, damit installierte Geräte weiterlaufen.)

Alles läuft im kostenlosen Firebase-Spark-Tarif und auf GitHub Pages. Keine
bezahlten Dienste, keine Schlüssel mit Kosten, keine Kreditkarte.

## Auf dem iPhone installieren

1. Adresse in **Safari** öffnen (nur Safari darf auf iOS installieren).
2. Teilen-Symbol → **Zum Home-Bildschirm**.
3. Läuft danach im Vollbild wie eine App, auch ohne Netz.

## Die sechs Reiter

| Reiter | Was drin ist |
| --- | --- |
| **Übersicht** | Zeitraum, Countdown, vier Kennzahlen, Wetteraussicht am Ziel, Mitreisende, Einladungscode |
| **Packen** | Bereiche und Positionen, „je Person“ und „einer reicht“ |
| **Plan** | Stationen mit Datum, Notiz und Ort; Brücke zum TripPlaner |
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

## TripPlaner-Brücke

Der TripPlaner ist ein eigenes Projekt mit Spring-Boot-Backend auf `localhost`.
**An ihm wurde nichts geändert.** Die Brücke sitzt komplett in Reisebuddy, im
Reiter *Plan*:

| Richtung | Weg | Wo es funktioniert |
| --- | --- | --- |
| TripPlaner → Reisebuddy | Sitzungs-ID (`trip-…`) eintippen, Reisebuddy holt die POIs | nur am Rechner, Backend auf `localhost:8080`, Chrome/Edge |
| TripPlaner → Reisebuddy | JSON einfügen | überall, auch am iPhone |
| Reisebuddy → TripPlaner | Stationen kopieren oder TripPlaner öffnen | am Rechner |

Doppelte Namen werden beim Übernehmen übersprungen. Safari verbietet einer
https-Seite den Zugriff auf `http://localhost` — deshalb geht der direkte Weg
dort nicht. Das Einfügen-Feld geht immer.

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

GSAP (mit ScrollTrigger und Flip) und Lenis kommen vom CDN. Vorhang beim Start,
Auftritte mit Versatz, laufende Zähler, ein Bild das aus der Kachel in die
Großansicht fliegt, eine Route die sich selbst zeichnet, ein wandernder
Reiter-Marker.

Zwei Sicherungen: Jedes CDN-Skript hat eine **Frist** (GSAP 6 s, Lenis 4 s) —
antwortet das CDN nicht, startet die App ohne Animation statt gar nicht. Und wer
im Betriebssystem *weniger Bewegung* eingestellt hat, bekommt still den
Endzustand. Sanftes Scrollen (Lenis) läuft nur mit Maus und Trackpad; auf dem
Handy bleibt das native Scrollen.

## Kostenlose Dienste

| Wofür | Dienst | Schlüssel nötig |
| --- | --- | --- |
| Daten, Anmeldung | Firebase Spark | nein (Web-Config ist öffentlich) |
| Kartenbilder | OpenStreetMap | nein |
| Kartenbibliothek | Leaflet 1.9.4 (cdnjs) | nein |
| Ortssuche | Nominatim | nein |
| Wetter | Open-Meteo | nein |
| Animation | GSAP 3.13 (cdnjs), Lenis (jsDelivr) | nein |

Nominatim wird nur auf Knopfdruck gefragt — deren Nutzungsordnung erlaubt keine
Anfrage pro Tastendruck.

## Ändern

Die Startvorlage für neue Reisen steht in `data.js` als `TEMPLATE`:

```js
{ icon:"📱", name:"Technik & Elektronik", items:[
  ["Handy & Ladekabel", "", "je"],       // "je" = jeder einzeln
  ["Autoladeadapter", "KFZ-Ladegerät"],  // ohne "je" = einer reicht
]}                                       // mittlerer Eintrag = graue Notiz darunter
```

Nach jeder Dateiänderung **`VERSION` in `sw.js` hochzählen** (`reisebuddy-v13`
→ `v14`). Der Service Worker holt eigene Dateien mit `no-cache`, fragt also beim
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
| Reise, Packliste, Stationen, Haken, Spots, Titelbild | Firestore, `trips/<code>` |
| Foto-Eintrag samt Vorschaubild | Firestore, `trips/<code>/photos/<id>` |
| Großes Bild | Firestore, `trips/<code>/photoData/<id>` |

## Dateien

| Datei | Zweck |
| --- | --- |
| `index.html` | Aufbau aller Bildschirme, Reiter und Dialoge |
| `style.css` | Gestaltung, Hell- und Dunkelmodus über Tokens |
| `app.js` | Rahmen: Name, Reiseliste, Reiter, Übersicht, Wetter, Routing |
| `packliste.js` | Packliste |
| `plan.js` | Stationen samt Ortssuche |
| `photos.js` | Hochladen, Verkleinern, Ordner, Galerie, Ort nachtragen |
| `spots.js` | Challenge-Spots und Rangliste |
| `mapview.js` | Karte, Ebenen, Routen, Kilometer |
| `motion.js` | GSAP/Lenis, Intro, Auftritte, Übergänge |
| `weather.js` | Vorhersage von Open-Meteo |
| `tripplaner.js` | Brücke zum TripPlaner |
| `exif.js` | Aufnahmeort und -zeit aus JPEG, HEIC und PNG |
| `store.js` | Firestore-Schicht |
| `data.js` | Vorlage für neue Reisen |
| `firebase-config.js` | Projekt-Zugangsdaten |
| `sw.js` | Service Worker |
| `icons/` | App-Icons, erzeugt mit Pillow |
| `_test/` | Testbilder mit und ohne GPS (nicht im Repo) |
