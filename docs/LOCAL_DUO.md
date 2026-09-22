# AggroBot 1.21.0 – lokaler Duo-Modus (zwei Browser, ein PC)

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
3. In **beiden Panels** `🤝 Duo-Modus` öffnen. Beide tragen **denselben**
   Raumcode ein, z. B. `KITSU_DUO_01` (6–64 Zeichen; Buchstaben, Zahlen,
   Minus, Unterstrich). Optional den Partnernamen als reine Anzeigehilfe
   eintragen. **Lokales Duo AN** und den Bot einschalten bzw. Auto-Start verwenden.
   Die PlayerID wird nicht mehr eingetragen.
4. Im Panel `Erkannt · <PlayerID>` abwarten. Der Relay koppelt genau zwei
   unterschiedliche Instanzen pro Raum und Match-Fingerprint. Der Browser
   prüft zusätzlich, dass die automatisch erhaltene PlayerID im eigenen
   aktuellen GameView vorhanden ist. Bei jedem Matchstart werden die
   wechselnden PlayerIDs automatisch neu entdeckt; bei fehlender
   Verbindung oder mehr als zwei Instanzen spielen die Bots autonom.



## Wenn ein Browser nicht verbindet

1. Beide Userscripts und den Repository-Ordner aktualisieren. Den **alten**
   Duo-Relay mit STRG+C beenden und `Start_Live_Duo.bat` neu starten.
   Das Fenster muss `v1.21.0` zeigen; ein altes Relay wird nicht automatisch
   durch die neue Browser-Version ersetzt.
2. In **beiden** Browsern `http://127.0.0.1:8767/health` direkt in der
   Adresszeile öffnen. Erwartet wird eine JSON-Antwort mit
   `"ok":true` und `"version":"1.21.0"`. Dieser direkte Aufruf
   prüft nur den lokalen Server, **nicht** die Freigabe für OpenFront.
3. Bei Chrome/Edge für `https://openfront.io` die Website-Berechtigung
   für **Apps auf dem Gerät / Loopback-Netzwerk** erlauben; eine eventuell
   angezeigte Zugriffsanfrage bestätigen. Kein Browser-Schutz sollte
   pauschal deaktiviert werden. Zwei verschiedene Browserprofile benötigen
   gegebenenfalls jeweils eine eigene Freigabe.
4. Die beiden `Matchkennung:`-Zeilen im Duo-Panel vergleichen. Bei
   `Raumcode gleich, aber Match-Kennung unterscheidet sich` laufen die
   Browser nicht unter derselben berechneten Partiekennung. Die
   Node-Konsole protokolliert dann die von beiden Browsern empfangenen
   Kennungen. Bei **nur einem** Browser-Eintrag erreicht der andere die
   lokale Schnittstelle nicht; die DevTools-Konsole (F12) zeigt
   gegebenenfalls die konkrete Browser-Blockierung.
5. Ein `Browser-Timeout (8s)` ist **keine** bestätigte Server-Abschaltung.
   Es kann auch auftreten, wenn die Browser-Berechtigung noch aussteht.
   Bei einem HTTP-Fehler nennt das Panel nun den Relay-Fehlercode.


## Plan-Telemetrie und Teststand 1.20.11

Die Duo-Payload enthält optional eine deterministische Plan-ID,
Starttick und Ablaufzeitpunkt. Der Relay weist unplausible Fristen ab.
**Das ist derzeit Diagnostik, keine verbindliche gegenseitige
Zusage/ACK und kein Ersatz für die echte Allianz-/Worker-Prüfung.**

Für die neue Version `Start_Live_Duo.bat` nach dem Update neu starten;
ein bereits laufender lokaler Relay lädt geänderten Code nicht selbst.
Nur die Dateien im **aktualisierten** Ordner verwenden, nicht Skripte
mit lokalem, ungeklärtem Git-Merge-Zustand.

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
- **Abweichende Bündnisse mit Dritten (1.20.4):** Beide Bots übertragen höchstens
  16 **im eigenen GameView bestätigte** Drittspieler-Allianzen als PlayerIDs.
  Ein gültiger Partnerbericht setzt diese Spieler beim anderen Bot auf die
  **Nicht-angreifen-Liste**, inklusive Zielauswahl und Nuklear-Kollateralschutz.
  Das macht den Spieler **nicht automatisch** zu einem tatsächlichen
  Bündnispartner des anderen Bots; nur dessen eigener Spielzustand kann das
  bestätigen. Solange die Duo-Verbindung aktiv ist, schließen die Bots nicht
  unabhängig neue fremde Auto-Bündnisse: Eingehende Drittangebote werden nur
  bei bestätigter eigener Duo-Allianz und bereits beim Partner bestehendem
  Bündnis (ohne eigenen laufenden Konflikt) angenommen. Der andere Bot kann
  das Partnerbündnis über einen **eigenen legalen Worker-geprüften Antrag**
  angleichen; ob der fremde Spieler ihn annimmt, entscheidet das Spiel.
  Bestehende abweichende Bündnisse werden nicht aufgekündigt. Greift ein
  fremder Partner-Verbündeter einen Bot an, verbleibt dessen eigene
  Notverteidigung aktiv; ein gemeinsamer Angriff auf ihn wird nicht geplant.
- **Gemeinsame Offensive (1.20.5):** Beide Bots melden bis zu 16
  aktuell erreichbare **Grenzgegner**, eigenes Heimheer, eingehende
  Angriffe, verfügbare Truppen und ihre unabhängig berechnete Reserve.
  Der Relay schlägt niemals eigenmächtig einen Spielbefehl vor. Erst bei
  einer im GameView bestätigten gegenseitigen Allianz, einem tatsächlich
  gemeinsamen Grenzgegner und zwei ausreichend großen **geschützten**
  Teilbudgets legt die niedrigere PlayerID Ziel und Angriffstick fest.
  Der Partner bestätigt Ziel und Tick; jeder Browser prüft seine
  vollständige eigene Front-, Reserve- und Worker-Legalität direkt vor
  dem tatsächlichen Angriff nochmals. Wird der erste Einsatz bereits
  im Spielzustand sichtbar, darf der zweite ihn vorsichtig berücksichtigen
  und dem begonnenen Angriff noch beitreten. Inaktive, veraltete
  Solo-Kriegsziele weichen dann einem sicheren gemeinsamen Ziel; laufende
  Angriffe werden nicht zwangsweise abgebrochen. Der Duo-Plan zeigt
  beide Teilbudgets und die erforderliche Zielstärke.
  **Keine pauschale Reservesenkkung:** Eine 88-%-Frontprognose bleibt
  bestehen, wenn echte Übermacht, aktuelle Angriffe oder Gebietsverluste
  sie erforderlich machen. Unterschiedliche Landesgrenzen, unzureichende
  Truppen oder ein unsicherer Partner führen zu eigenständigem Spiel.
- **Stabiler Duo-Angriff (1.20.6):** Ein gemeinsam bestätigtes Ziel und sein
  Angriffstick bleiben gegen reine ECONOMY/TECH/RECOVER-Wechsel bis 110 Ticks
  nach dem Starttermin bestehen. Bei einem echten Heimangriff, einer
  bestätigten kritischen Partnerwarnung, verlorenem Bündnis oder
  verschwundener gemeinsamer Front wird die Bindung aufgehoben. Wird ein
  geschütztes Teilbudget vorübergehend zu klein, bleibt der Plan nur
  vorgemerkt: **kein Angriff** ohne aktuelle beidseitige Freigabe,
  Eigentümer-/Allianzprüfung und rechtmäßige Worker-Aktion.
- **Gemeinsame Frühwarnung:** Die Partner tauschen Stufen 0 (ruhig),
  1 (beobachtete leichte Angriffe oder starker Nachbar) und 2
  (beobachtete Invasion oder relevante Gebiets-/Anlagenverluste) aus.
  Ein beobachteter Angreifer auf den Partner wird frühzeitig als mögliches
  Entlastungsziel geprüft. Helfende Truppen werden höchstens in engen,
  separat abgesicherten Kontingenten gegeben; bei eigener Frontwarnung
  sendet der Bot keine automatische Truppenspende. Eine Warnung
  verändert **nicht** die Truppen-Sicherheitsreserve nach unten.
- **Bündnisse aktiv anbieten:** Der Bot sucht den Allianz-Intent auch nach
  Matchstart erneut. Wenn OpenFront den Konstruktor im EventBus nicht
  verfügbar macht, kann er nur über das **tatsächliche, für das aktuelle
  Spiel bestätigte OpenFront-Spielerpanel** auf dessen offizielle
  Allianz-Aktion zugreifen. Gibt es weder den echten Intent noch diese
  überprüfte UI-Aktion, meldet das Panel, dass Angebote noch nicht
  verfügbar sind; es wird kein fremder Intent erfunden. Im Duo kann
  die niedrigere PlayerID konfliktfreie neue Allianzen anbieten; der
  andere Bot folgt erst, wenn das Bündnis für den ersten im GameView
  sichtbar bestätigt wurde. Bei aktuell bekämpften Partnergegnern
  wird kein eigener Allianz-Antrag erzeugt.
- **Truppenzahlen:** JSON und Engine verwenden Rohwerte; das
  Spiel-/Bot-Panel zeigt für Duo-Budgets die Rohwerte / 10. Das ist
  nur eine Anzeigeumrechnung, **keine** Korrektur der Angriffslogik.
- **Handel und Embargos (1.20.8):** OpenFront startet Hafenhandel
  automatisch zu handelbaren Spielern. Der Bot erzeugt deshalb keinen
  erfundenen Handelsrouten-Intent. Er hält stattdessen Handel mit im
  Spiel bestätigten Verbündeten offen, setzt bei einem tatsächlich
  aktiven Kriegsgegner ein eigenes Embargo und hebt **nur seine selbst
  gesetzten** Embargos nach Konfliktende wieder auf. Wenn der EventBus
  den offiziellen `SendEmbargoIntentEvent` nicht offenlegt, darf nur
  das verifizierte aktuelle OpenFront-Spielerpanel als Fallback verwendet
  werden. Neutrale Spieler werden nicht vorsorglich embargoiert.
  Besitzt der bestätigte Duo-Partner bereits einen fertigen Hafen, bekommt
  der erste eigene legale Hafen zusätzliche Wirtschaftspriorität.
- **Gegenseitige Truppenhilfe (1.20.8):** Die Spendenentscheidung verwendet
  weiterhin nur den im echten Spiel bestätigten Partner und
  `canDonateTroops`. Bei Warnstufe 1/2 wird der Prüf-Cooldown verkürzt;
  bei einer kritischen Partnerlage darf ein etwas größeres, aber separat
  begrenztes Kontingent geschickt werden. Eigene Warnstufe > 0 blockiert
  die Spende vollständig. Nach dem Transfer müssen eigene Reserve,
  Frontdruck und Mindest-Heimtruppen weiterhin erfüllt sein. Bei einer
  Partnerkrise ohne laufenden Angriff ist eine einmalige
  Wiederaufbau-Verstärkung nur erlaubt, wenn der Spender deutlich stärker
  ist; dadurch sollen symmetrische Hin-und-her-Spenden vermieden werden.
- **Ausfall:** Nach wenigen Sekunden ohne validierte Partnerdaten werden
  keine Relay-Operationshinweise mehr verwendet; beide Bots bleiben autonom.
  Nur die für das aktuelle Match verifizierte Partner-ID ist vom Angriff ausgenommen; eine alte ID wird nicht übernommen.

## Schutz und Datenschutz

Der Relay hat **keine** OpenFront-Accounts, Passwörter oder Browser-Sitzungen
und keine Funktion zum Senden von Spielaktionen. Er läuft nur über TCP auf
`127.0.0.1`, akzeptiert CORS nur von `https://openfront.io` und deren
Subdomains, prüft Raumcode, Match-Fingerprint sowie zwei verschiedene Browser-Instanzen (der Browser prüft die Peer-ID zusätzlich im eigenen GameView)
und entfernt alte Daten nach zehn Sekunden. Er ist **kein** gegen lokale
Programme abgesicherter Authentifizierungsdienst: andere Prozesse auf
demselben PC können den Loopback-Port kontaktieren. Raumcode nicht öffentlich
teilen. Bei Browserfehlern in DevTools prüfen, ob lokaler HTTP-Zugriff
(PNA/Mixed Content/CORS) erlaubt und der Node-Relay gestartet ist.

**Validierung:** Automatisierte Relay-, Spielzustands- und Spawntests sind
reproduzierbar; ein kompletter Live-Duo-Multiplayer-Sieg oder die sofortige
Allianz in jeder OpenFront-Lobby ist damit nicht belegt.

**Wichtig:** Auto-Pairing braucht zwei getrennte Browserprofile bzw. zwei
getrennte Tabs mit eigenen Instanzen und denselben Raumcode. Verwendest du
denselben Raum für mehrere gleichzeitig laufende Duo-Matches, ist das keine
eindeutige Zuordnung; nutze pro gleichzeitigem Duo einen anderen Raumcode.
Der lokale Relay ist kein Schutz vor anderen lokalen Programmen.
