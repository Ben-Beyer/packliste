# Packliste

Gemeinsame Packlisten als kleine Web-App (PWA). Jeder gibt beim ersten Start seinen
Namen ein, legt Trips an oder tritt mit einem Code bei — und an jedem Haken steht,
wer ihn gesetzt hat und wann.

Live: **https://ben-beyer.github.io/packliste/**

Die Roadtrip-Vorlage (8 Bereiche, 69 Positionen) stammt aus `../Packliste.docx`.

## Auf dem iPhone installieren

1. Adresse in **Safari** öffnen (nur Safari darf auf iOS installieren, Chrome nicht).
2. Teilen-Symbol → **Zum Home-Bildschirm**.
3. Läuft danach im Vollbild wie eine App, auch ohne Netz.

## Bedienung

- **Start:** Name eingeben. Steht später an jedem Haken. Über den Namens-Knopf oben
  rechts änderbar — alte Haken behalten den alten Namen, die sind ja so passiert.
- **Trip anlegen:** Name vergeben, Roadtrip-Vorlage oder leere Liste wählen. Der Trip
  bekommt einen sechsstelligen Code.
- **Mitfahrer einladen:** Code oben rechts antippen → teilen. Wer den Code eingibt
  (oder den Link öffnet), packt dieselbe Liste mit.
- **Abhaken:** Tippen. Erscheint auf allen Geräten im Trip, mit Name und Uhrzeit.
- **Liste bearbeiten:** Positionen und Bereiche hinzufügen oder löschen — gilt für alle.
- **Alle Haken löschen:** Unten, zweistufig. Betrifft alle im Trip, nicht nur dich.

## Firebase einrichten

Ohne Firebase läuft die App im Einzelmodus: alles bleibt auf dem eigenen Gerät,
nichts wird geteilt. Für den geteilten Betrieb einmalig einrichten:

1. **Projekt anlegen** auf <https://console.firebase.google.com> → *Projekt hinzufügen*.
   Google Analytics kann man abwählen.
2. **Firestore anlegen:** *Build → Firestore Database → Datenbank erstellen*,
   Produktionsmodus, Region `eur3` oder `europe-west3`.
3. **Anonyme Anmeldung einschalten:** *Build → Authentication → Sign-in method →
   Anonym → aktivieren*. Die App meldet sich damit unsichtbar an, damit die
   Firestore-Regeln fremde Zugriffe abweisen können.
4. **Domain freigeben:** *Authentication → Settings → Authorized domains* →
   `ben-beyer.github.io` hinzufügen. Ohne das schlägt die Anmeldung fehl.
5. **Web-App registrieren:** *Projekteinstellungen (Zahnrad) → Allgemein → Meine Apps
   → Web `</>`*. Die angezeigte `firebaseConfig` in **`firebase-config.js`** eintragen.
6. **Regeln setzen:** *Firestore Database → Regeln*, Inhalt ersetzen durch:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /trips/{tripId} {
      allow get, create, update: if request.auth != null;
      allow list, delete: if false;          // niemand kann Trips auflisten
    }
  }
}
```

`list: false` ist der eigentliche Schutz: Ohne den Code findet niemand einen Trip,
auch nicht durch Herumprobieren in der Datenbank. Wer den Code hat, darf lesen und
schreiben — genau wie bei einem geteilten Link.

Die Werte in `firebase-config.js` sind **keine Geheimnisse**. Sie stehen in jeder
Firebase-Web-App offen im Quelltext; geschützt wird über die Regeln oben.

Kosten: Der Gratis-Tarif deckt 50.000 Lesevorgänge pro Tag ab. Ein Trip ist ein
einziges Dokument, eine Handvoll Leute kommt auf ein paar hundert am Tag.

## Liste ändern

Die Startvorlage für neue Trips steht in `data.js` als `TEMPLATE`:

```js
{ icon:"📱", name:"Technik & Elektronik", items:[
  ["Handy & Ladekabel"],
  ["Autoladeadapter","KFZ-Ladegerät"],   // zweiter Eintrag = graue Notiz darunter
]}
```

Das ändert nur **neue** Trips. Bestehende Trips bearbeitet man in der App selbst,
über *Liste bearbeiten*.

Nach jeder Dateiänderung **`VERSION` in `sw.js` hochzählen** (`packliste-v2` →
`packliste-v3`), sonst bleiben installierte Geräte auf der alten Fassung.

## Wo was gespeichert wird

| Was | Wo |
| --- | --- |
| Dein Name | `localStorage`, `packliste.v2.user` — pro Gerät |
| Deine Trip-Liste | `localStorage`, `packliste.v2.mytrips` — nur die Codes |
| Ein-/ausgeklappt, ausgeblendet | `localStorage`, `packliste.v2.ui.<code>` |
| Trips, Listen, Haken | Firestore, ein Dokument pro Trip unter `trips/<code>` |
| dasselbe im Einzelmodus | `localStorage`, `packliste.v2.trip.<code>` |

Haken werden als Punktpfad geschrieben (`checks.<positions-id>`), deshalb überschreiben
sich zwei Leute nicht, die gleichzeitig verschiedene Positionen abhaken.

Offline gesetzte Haken liegen in Firestores lokaler Warteschlange und gehen raus,
sobald wieder Netz da ist.

## Dateien

| Datei | Zweck |
| --- | --- |
| `index.html` | Aufbau der drei Ansichten und der Dialoge |
| `style.css` | Gestaltung, Hell- und Dunkelmodus über Tokens |
| `app.js` | Ablauf: Name, Trips, Abhaken, Bearbeiten, Routing |
| `store.js` | Speicher-Schicht — Firestore oder nur lokal, gleiche Methoden |
| `data.js` | Vorlage für neue Trips |
| `firebase-config.js` | Deine Firebase-Zugangsdaten (leer = Einzelmodus) |
| `sw.js` | Service Worker, macht die App offline startbar |
| `icons/` | App-Icons, erzeugt mit Pillow |
