# Roadtrip Packliste

Abhakbare Packliste als kleine Web-App (PWA). Läuft nach dem ersten Laden offline,
die Haken liegen im Browser-Speicher des jeweiligen Geräts.

Inhalt stammt aus `../Packliste.docx` — 8 Bereiche, 69 Positionen.

## Auf dem iPhone installieren

1. Die Adresse in **Safari** öffnen (nicht Chrome — nur Safari darf auf iOS installieren).
2. Teilen-Symbol → **Zum Home-Bildschirm**.
3. Die Liste startet danach im Vollbild wie eine App, auch ohne Netz.

## Bedienung

- Tippen hakt eine Position ab, der Stand wird sofort gespeichert.
- **Erledigte ausblenden** blendet Abgehaktes weg — praktisch beim Packen.
- Bereichskopf antippen klappt den Bereich zu; **Alle einklappen** für alle auf einmal.
- **Liste zurücksetzen** unten braucht zwei Tipps: Der erste bewaffnet den Knopf,
  der zweite löscht. Nach 6 Sekunden ohne Bestätigung bricht er von selbst ab.

## Liste ändern

Positionen stehen als `DATA` oben im `<script>` von `index.html`:

```js
{ icon:"📱", name:"Technik & Elektronik", items:[
  ["Handy & Ladekabel"],
  ["Autoladeadapter","KFZ-Ladegerät"],   // zweiter Eintrag = graue Notiz darunter
]}
```

Nach jeder Änderung **`VERSION` in `sw.js` hochzählen** (`packliste-v1` → `packliste-v2`),
sonst bleiben installierte Geräte auf der alten Fassung aus dem Cache hängen.

Die IDs für den Speicher werden aus Bereichs- und Positionsnamen gebildet. Wird ein
Text umbenannt, verliert diese eine Position ihren Haken — alle anderen bleiben.

## Gespeicherter Stand

Im `localStorage` der Seite, unter `packliste.v1.done` (Haken) und `packliste.v1.ui`
(ausgeblendet/eingeklappt). Das hängt an Gerät und Adresse: Zwei Telefone führen zwei
getrennte Stände, und wer in den iOS-Einstellungen die Website-Daten löscht, startet leer.

## Dateien

| Datei | Zweck |
| --- | --- |
| `index.html` | Komplette App — Liste, Design, Logik in einer Datei |
| `manifest.webmanifest` | Name, Farben und Icons für den Home-Bildschirm |
| `sw.js` | Service Worker, macht die App offline nutzbar |
| `icons/` | App-Icons, erzeugt mit Pillow |
