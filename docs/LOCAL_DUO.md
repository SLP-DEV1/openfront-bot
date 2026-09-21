# AggroBot 1.20.1 – lokaler Duo-Modus (zwei Browser, ein PC)

**Zweck:** Zwei separat laufende OpenFront-Userscripts können Beobachtungen über denselben
localhost-Relay austauschen. Jeder Browser kontrolliert **nur den eigenen Spieler**.
Ein Plan aus dem Relay ist **kein** gültiger Angriff, keine Bündnisbestätigung und
kein Ersatz für Worker-Aktionsprüfung, Eigentumskontrolle oder Heimreserve.

## Windows-Schnellstart

1. Node.js 24 installieren. Im Repository `Start_Live_Duo.bat` doppelklicken.
   Das Fenster offen lassen. Der Relay lauscht **nur** auf `127.0.0.1:8767`.
2. In zwei voneinander getrennten Browsern/Profilen (z. B. Chrome und Firefox)
   jeweils **nur eine** AggroBot-Variante in Tampermonkey aktivieren und derselben
   OpenFront-Lobby beitreten. Entweder zweimal das normale
   `OpenFront_Solo_AggroBot.user.js` oder zweimal
   `OpenFront_AggroBot_Impossible_Run3.user.js` mit eingebettetem Modell.
3. In **beiden Panels** `🤝 Duo-Modus` öffnen. Den Partnernamen optional als Anzeigehilfe eintragen; die tatsächliche PlayerID bleibt für die Zuordnung verbindlich. Die im eigenen Panel gezeigte
   **eigene Spieler-ID** in das Feld **Partner-Spieler-ID** des jeweils anderen
   Browsers eintragen. **Nicht den Anzeigenamen** verwenden. Beide tragen
   **denselben** Raumcode ein, z. B. `KITSU_DUO_128` (6–64 Zeichen, Buchstaben,
   Zahlen, Minus, Unterstrich). Dann **Lokales Duo AN**, den Bot einschalten
   beziehungsweise Auto-Start benutzen.
4. Im Panel `Verbindung · <Partner-ID>` abwarten. Die gegenseitige PlayerID
   wird im Relay geprüft; zusätzlich muss der andere Spieler im aktuellen
   GameView existieren. Bei einem neuen Match können sich PlayerIDs ändern:
   beide Werte dann erneut austauschen.

## Was passiert im Spiel?

- **Spawn:** Die niedriger sortierte PlayerID veröffentlicht eine sichere
  Startposition. Die zweite sucht in einem eigenen, begrenzten Umkreis
  legalen, nicht überlappenden Land-Spawn mit getrenntem Entwicklungsspielraum.
  Spawn-Phase/Server-Minimalabstand/Gelände/Belegung haben Vorrang. Ist der
  Relay offline oder läuft die Spawnzeit ab, greift die normale eigene
  Spawnstrategie; ein gemeinsamer Start ist nicht garantiert.
- **Bündnis:** Ein reciprocally bestätigter Partner ist schon während der
  Anfrage als Angriffsziel geschützt. Der Bot beantwortet dessen echte
  eingehende Allianz-Anfrage bevorzugt und versucht andernfalls einen
  Spiel-Worker-geprüften Antrag. Die Anzeige „Bündnis aktiv“ folgt **nur**
  dem echten GameView/Teamstatus. Wenn Allianzen serverseitig deaktiviert
  oder nicht legal sind, sendet der Bot keine erzwungene Anfrage.
- **Gemeinsame Operation:** Übertragen werden Ziel-ID, gemeinsamer Angriffstick, Bereitschaft,
  Hilfebedarf, freie Truppen, Heimreserve und Rollenhinweis. Nur nach
  sichtbarer Allianz können solche Hinweise die Priorität eines
  unabhängig **legalen und sicheren** Ziels verändern. Eine angekündigte
  Partnerarmee gilt **nicht** als tatsächlich eingesetzte Truppe; allein
  sichtbare Angriffe dürfen dazu gerechnet werden. Das gilt nun auch für eine lokal bestätigte FFA-Allianz. Wenn beide bereit sind, gibt die niedrigere PlayerID einen Angriffstick vor; die zweite übernimmt ihn. Akute Verteidigung und ein bereits aktiver Krieg gehen vor. Soweit das Spiel es erlaubt, können beide sich mit Truppen oder Gold helfen, ohne eigene Heim-/Goldreserven zu verletzen. Der Partner kann bei
  Bedrohung verteidigen, während der andere weiter aufbaut.
- **Ausfall:** Nach wenigen Sekunden ohne validierte Partnerdaten werden
  keine Relay-Operationshinweise mehr verwendet; beide Bots bleiben autonom.
  Die explizit hinterlegte Partner-ID bleibt vom Angriff ausgenommen.

## Schutz und Datenschutz

Der Relay hat **keine** OpenFront-Accounts, Passwörter oder Browser-Sitzungen
und keine Funktion zum Senden von Spielaktionen. Er läuft nur über TCP auf
`127.0.0.1`, akzeptiert CORS nur von `https://openfront.io` und deren
Subdomains, prüft wechselseitige PlayerIDs, Roomcode und Match-Fingerprint
und entfernt alte Daten nach zehn Sekunden. Er ist **kein** gegen lokale
Programme abgesicherter Authentifizierungsdienst: andere Prozesse auf
demselben PC können den Loopback-Port kontaktieren. Raumcode nicht öffentlich
teilen. Bei Browserfehlern in DevTools prüfen, ob lokaler HTTP-Zugriff
(PNA/Mixed Content/CORS) erlaubt und der Node-Relay gestartet ist.

**Validierung:** Automatisierte Relay-, Spielzustands- und Spawntests sind
reproduzierbar; ein kompletter Live-Duo-Multiplayer-Sieg oder die sofortige
Allianz in jeder OpenFront-Lobby ist damit nicht belegt.
