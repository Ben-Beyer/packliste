/* ----------------------------------------------------------------------------
   Hier die Web-Config aus deinem Firebase-Projekt eintragen.

   Wo du sie findest:
     console.firebase.google.com  ->  Projekt  ->  Zahnrad "Projekteinstellungen"
     ->  Reiter "Allgemein"  ->  ganz unten "Meine Apps"  ->  Web-App (</>)
     ->  "SDK-Konfiguration"  ->  "Konfiguration"

   Diese Werte sind KEINE Geheimnisse. Sie gehoeren in den Client-Code und sind
   in jeder Firebase-Web-App oeffentlich sichtbar. Was schuetzt, sind die
   Firestore-Regeln - die stehen in der README.

   Solange die Felder leer sind, laeuft die App im Einzelmodus: Trips und Haken
   bleiben nur auf diesem Geraet, nichts wird geteilt.
---------------------------------------------------------------------------- */

export const FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};
