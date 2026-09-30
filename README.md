# Reisebuddy

Reisen planen, gemeinsam packen, Fotos sammeln — und aus den Aufnahmeorten der
Fotos wird eine Karte mit der gefahrenen Route.

Live: **https://ben-beyer.github.io/packliste/**
(Die Adresse behält den alten Namen, damit installierte Geräte weiterlaufen.)

Alles läuft im kostenlosen Firebase-Spark-Tarif und auf GitHub Pages. Es gibt
keine bezahlten Dienste, keine Schlüssel mit Kosten und keine Kreditkarte.

## Auf dem iPhone installieren

1. Adresse in **Safari** öffnen (nur Safari darf auf iOS installieren, Chrome nicht).
2. Teilen-Symbol → **Zum Home-Bildschirm**.
3. Läuft danach im Vollbild wie eine App, auch ohne Netz.

## Aufbau

Beim ersten Start fragt die App nach einem Namen. Der steht später an jedem Haken
und an jedem Foto. Danach: **Deine Reisen** — jede Reise hat fünf Reiter.

| Reiter | Was drin ist |
| --- | --- |
| **Übersicht** | Zeitraum, Countdown, vier Kennzahlen, Mitreisende, Einladungscode |
| **Packliste** | Bereiche und Positionen, „je Person" und „einer reicht" (siehe unten) |
| **Plan** | Stationen mit Datum, Notiz und Ort aus der OpenStreetMap-Suche |
| **Fotos** | Hochladen, Galerie, Großansicht; Bilder werden vorher verkleinert |
| **Karte** | Route aus den Foto-Standorten, dazu die geplanten Stationen |

## Wer darf was sehen

Jede Reise hat einen achtstelligen Code. Wer den Code hat, ist dabei; wer ihn
nicht hat, kommt nicht heran. Das ist im Firestore verankert, nicht nur in der
Oberfläche — nachgemessen mit einem angemeldeten Fremdzugriff:

| Versuch | Ergebnis |
| --- | --- |
| Reisen auflisten | **verweigert** (`permission-denied`) |
| Reise mit richtigem Code lesen | erlaubt |
| Reise mit geratenem Code | existiert nicht |
| Reise löschen | **verweigert** |
| Fotos einer Reise ohne Code finden | unmöglich, dafür braucht es den Reisepfad |
| Zugriff ohne Anmeldung | **verweigert** |

Der Code hat 8 Zeichen aus 32 (ohne 0/O/1/I), also gut 1 Billion Möglichkeiten.
Durchprobieren scheitert an den Kontingenten des Gratis-Tarifs, lange bevor es
etwas bringt. Wer die Reise trotzdem nicht mehr sehen soll: neue Reise anlegen,
neuer Code.

Deine eigene Reiseliste liegt nur auf deinem Gerät (`localStorage`) — sie besteht
aus Codes, nicht aus Daten. Auf einem neuen Handy trägst du den Code einmal ein.

## Zwei Arten von Positionen

| | Bedeutung | Anzeige |
| --- | --- | --- |
| **je Person** | Muss jeder für sich packen — Zahnbürste, Unterhosen, Schlafsack | Punktreihe mit allen Mitreisenden: ausgefüllt = hat's, gestrichelt = fehlt noch |
| **einer reicht** | Einmal für die Gruppe — Zelt, Kocher, Warndreieck | Nach dem Abhaken: wer es gepackt hat und wann |

Der Fortschritt beantwortet **„was muss ich noch tun"**: *je Person* zählt erst
mit deinem eigenen Haken, *einer reicht* sobald irgendwer hakt. Umstellen geht
über *Ändern & löschen*, gesetzte Haken bleiben dabei stehen.

## Fotos und Speicherplatz

Firebase Storage verlangt seit Oktober 2024 den Blaze-Tarif mit hinterlegter
Kreditkarte. Die Bilder liegen deshalb **in Firestore**, das im Spark-Tarif
bleibt. Damit das aufgeht:

- Jedes Bild wird im Browser auf maximal 1600 px verkleinert (~100–400 KB) und
  zusätzlich als Vorschaubild mit 480 px abgelegt.
- Vorschau und großes Bild liegen in getrennten Dokumenten. Die Galerie lädt nur
  die Vorschauen, das große Bild erst beim Antippen.
- Firestore erlaubt 1 MiB pro Dokument; die App komprimiert notfalls weiter
  herunter, bis ein Bild sicher hineinpasst.

**Das Gratis-Kontingent sind 1 GB.** Das reicht für grob 2500–4000 Fotos. Im
Reiter *Fotos* steht immer, wie viel schon belegt ist. Kommt ihr an die Grenze,
lassen sich alte Fotos löschen — oder ihr hebt den Tarif an, dann kostet es.

Aufnahmeort und -zeit liest die App selbst aus den EXIF-Daten (`exif.js`, ohne
Fremdbibliothek). **Auf dem iPhone muss der Ortszugriff für die Kamera aktiv
sein**, sonst steht im Bild kein Ort und es taucht nicht auf der Karte auf. Beim
Teilen über das iOS-Teilen-Menü lässt sich der Ort ausdrücklich mitgeben.

## Karte und Ortssuche

- Kartenbilder: OpenStreetMap, kein Schlüssel nötig.
- Kartenbibliothek: Leaflet 1.9.4, wird erst geladen, wenn der Reiter aufgeht.
- Ortssuche: Nominatim (OpenStreetMap), ebenfalls ohne Schlüssel. Gesucht wird
  nur auf Knopfdruck — deren Nutzungsordnung erlaubt keine Anfrage pro Tastendruck.

Die Kilometerangabe ist Luftlinie zwischen aufeinanderfolgenden Aufnahmen, keine
Fahrstrecke.

## Firebase-Einrichtung (ist erledigt)

Projekt **bachelorabschluss-tour**, Spark-Tarif, Firestore in `europe-west3`,
anonyme Anmeldung aktiv, `ben-beyer.github.io` als autorisierte Domain.
Die Web-Config steht in `firebase-config.js` — das sind keine Geheimnisse, sie
stehen in jeder Firebase-Web-App offen im Quelltext. Geschützt wird über die
Regeln:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /trips/{tripId} {
      allow get, create, update: if request.auth != null;
      allow list, delete: if false;
      match /photos/{photoId} {
        allow read, write: if request.auth != null;
      }
      match /photoData/{photoId} {
        allow read, write: if request.auth != null;
      }
    }
  }
}
```

## Ändern

Die Startvorlage für neue Reisen steht in `data.js` als `TEMPLATE`:

```js
{ icon:"📱", name:"Technik & Elektronik", items:[
  ["Handy & Ladekabel", "", "je"],       // "je" = jeder einzeln
  ["Autoladeadapter", "KFZ-Ladegerät"],  // ohne "je" = einer reicht
]}                                       // mittlerer Eintrag = graue Notiz darunter
```

Das ändert nur **neue** Reisen; bestehende bearbeitet man in der App.

Nach jeder Dateiänderung **`VERSION` in `sw.js` hochzählen**
(`reisebuddy-v6` → `v7`), sonst bleiben installierte Geräte auf der alten Fassung.

Fallstrick: Positions-IDs sind Slugs `<bereich>__<position>` ohne Punkt und
Schrägstrich, weil sie als Firestore-Feldpfad `checks.<id>.<person>` dienen.
`memberKey` in `store.js` und `slug` in `data.js` schreiben Umlaute beide als
ae/oe/ue/ss um — das muss gleich bleiben, sonst zerfällt eine Person in zwei.

## Wo was liegt

| Was | Wo |
| --- | --- |
| Dein Name | `localStorage`, `reisebuddy.v1.user` |
| Deine Reiseliste | `localStorage`, `reisebuddy.v1.mytrips` — nur die Codes |
| Ein-/ausgeklappt, ausgeblendet | `localStorage`, `reisebuddy.v1.ui.<code>` |
| Reise, Packliste, Stationen, Haken | Firestore, `trips/<code>` |
| Foto-Eintrag samt Vorschaubild | Firestore, `trips/<code>/photos/<id>` |
| Großes Bild | Firestore, `trips/<code>/photoData/<id>` |

Offline gesetzte Haken und hochgeladene Fotos liegen in Firestores lokaler
Warteschlange und gehen raus, sobald wieder Netz da ist.

## Dateien

| Datei | Zweck |
| --- | --- |
| `index.html` | Aufbau aller Bildschirme, Reiter und Dialoge |
| `style.css` | Gestaltung, Hell- und Dunkelmodus über Tokens |
| `app.js` | Rahmen: Name, Reiseliste, Reiter, Übersicht, Routing |
| `packliste.js` | Packliste |
| `plan.js` | Stationen samt Ortssuche |
| `photos.js` | Hochladen, Verkleinern, Galerie, Großansicht |
| `mapview.js` | Karte, Routen, Kilometer |
| `exif.js` | Aufnahmeort und -zeit aus JPEGs |
| `store.js` | Firestore-Schicht |
| `data.js` | Vorlage für neue Reisen |
| `firebase-config.js` | Projekt-Zugangsdaten |
| `sw.js` | Service Worker, macht die App offline startbar |
| `icons/` | App-Icons, erzeugt mit Pillow |
