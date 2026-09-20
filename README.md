# OpenFront Solo AggroBot

Autonomer Bot für **Singleplayer, Public und Private** als Tampermonkey-Userscript für [OpenFront](https://openfront.io/).

**Aktuelle installierbare Datei:** [`OpenFront_Solo_AggroBot.user.js`](./OpenFront_Solo_AggroBot.user.js), Version **1.11.1**. Die veraltete Datei `OpenFront_Solo_AggroBot_1.9.0.js` wurde aus `main` entfernt.

## AggroBot 2.0 – erster lokaler Brain-Baustein (v1.11.0)

**Tampermonkey bleibt die Spielsteuerung.** Optionaler lokaler Node.js-24-Brain mit SQLite-Gedächtnis, abgesicherten aggregierten Beobachtungen, eng begrenzten Strategieempfehlungen und einem Engine-Trainings-/Import-Werkzeug. Das autonome Userscript spielt bei nicht erreichbarem Brain mit seinen bisherigen Regeln weiter. Kein automatischer Start, keine direkten Game-Intents durch den Brain und keine Selbstlern-Gewinnratenbehauptung.

Start: `node brain/server.cjs`, Token aus der Terminalausgabe im Tampermonkey-Panel einfügen, `Lernen`, `Vollautonom` und `🧠 Lokaler Brain` einschalten und dann den Bot im Match manuell starten. Das neue Brain-Feature ist nach der Aktualisierung zunächst **AUS**.

[Einrichtung, Sicherheit und Trainingsbefehle](docs/BRAIN.md) · [Bestehendes Browser-Lernen](docs/LEARNING.md)

**Optionale Qwen-Beratung:** Der lokale Brain kann dein bestehendes llama.cpp unter `127.0.0.1:8080` mit Modell-Alias `qwen38-27b-gsq-mtp` verwenden. Qwen wird ausschließlich bei Stagnation und zum Spielende für validierte, gespeicherte Strategievorschläge im **Shadow-Modus** aufgerufen; keine direkten Spielaktionen oder ungetestete Strategieübernahme. Im Brain-Terminal vor `node brain/server.cjs`: `$env:AGGROBOT_QWEN_ENABLED="1"`; optional `$env:AGGROBOT_QWEN_API_KEY="local"`. Details und Status-Abfrage stehen in [BRAIN.md](docs/BRAIN.md).


## Installation

1. In Tampermonkey ein **neues Skript** erstellen und den gesamten Inhalt von `OpenFront_Solo_AggroBot.user.js` einfügen. In einem privaten GitHub-Repository darf man sich nicht darauf verlassen, dass Tampermonkey einen GitHub-Raw-Link ohne Anmeldung automatisch aktualisieren kann.
2. Alle älteren Solo-AggroBot-Skripte deaktivieren.
3. Wenn der Spawn Advisor 10.4.0 parallel läuft, dort **Auto-Spawn**, **Smart Attack** und **Auto-Accept Alliances** ausschalten.
4. OpenFront neu laden, eine Singleplayer-, Public- oder Private-Partie starten und den Bot im Menü **manuell** einschalten. Ein zusätzlicher Multiplayer-Schalter ist nicht mehr erforderlich.

**Not-Aus:** `Alt+Shift+X`. **Start/Pause:** `Alt+Shift+P`. Nach jedem Seitenladen und beim Wechsel in ein neues Match bleibt der Bot aus, bis du ihn startest. **Public/Private-Multiplayer benötigt keinen separaten Testschalter mehr; Replays und unbekannte Spieltypen bleiben gesperrt.** Beachte vor dem Einsatz die Regeln der jeweiligen Lobby bzw. des Servers.

## Strategie & Diagnose

Strategie-, Wirtschafts-, Marine-, Diplomatie-, Nuke- und SAM-Planung sind vorhanden. Der Bot kann Befehle senden; daraus folgt **keine garantierte Gewinnrate auf „Unmöglich“**. Ein echter Public-Team-Lauf liegt vor; für eine belastbare Gewinnrate und weitere Karten-/Moduspfade reicht ein einzelnes Match nicht. „Diagnose JSON“ im Bot-Menü zeichnet unter anderem Gebietsänderungen, Truppenlage, Bauaufträge und Allianzantworten auf. Bitte den Export vor dem Neuladen erstellen.

### Änderung 1.11.1 – Verteidigungslehre aus dem Public-FFA-Lauf

- **Marinepfad live bestätigt:** Im Labyrinth/Compact/Public/FFA-Mitschnitt wurden 9/9 Transportbefehle als Schiffe erkannt und 9/9 Landungen am aufgelösten Küstenziel bestätigt. Ein Hafen und ein Kriegsschiff wurden ebenfalls tatsächlich im Spielzustand bestätigt.
- **Angriffsdruck bleibt in Erinnerung:** Ein großer eingehender Angriff hält den Bot nach dem sichtbaren Ende der Angriffswelle noch 220 Ticks im Wiederaufbau. Eine kurze Lücke zwischen zwei Wellen löst nicht sofort wieder TECH oder ASSAULT aus.
- **Keine Flottenoffensive neben Übermacht:** Spielerlandungen werden ausgesetzt, wenn der stärkste Grenznachbar mindestens 85 % der Heimtruppen besitzt oder innerhalb der letzten 260 Ticks erheblicher Angriffsdruck bestand.
- **Beobachteter Auslöser:** Der 1.10.10-Bot startete bei Tick 3216 noch eine Landung mit 281.592 Truppen. Vier Ticks später erkannte er den starken Nachbarn; ab Tick 3288 folgten Angriffswellen bis über 1,5 Mio. Truppen. Der spätere bestätigte Rückzug kam erst nach erheblichem Gebietsverlust.
- **Lernen funktioniert, Ergebnis fehlt:** Zwölf begrenzte Kontext-Updates wurden gespeichert. Der Export entstand vor `gameOver`, daher bleibt `lastResult` leer und dieser Lauf darf nicht als Sieg oder Niederlage trainiert beziehungsweise gezählt werden.

### Änderung 1.10.10 – Befunde aus einem echten Public-Team-Match

- **Umgeleitete Landungen erkannt:** OpenFront verschiebt ein angeklicktes Inland-Ziel intern auf eine erreichbare Küste. Der Bot bestätigt einen neuen eigenen Transport deshalb nun anhand seiner ID, speichert dessen tatsächliches `targetTile` und prüft die Landung dort statt am ursprünglichen Inland-Ziel.
- **Eine Marinefront statt Zielroulette:** Eine bestätigte Spielerlandung wird als Hauptkriegsziel gebunden. Ohne bestehende Front werden nur 30 % der Heimtruppen beziehungsweise 36 % der verfügbaren Reserve eingesetzt; nach unbestätigten oder gescheiterten Landungen gilt zusätzlich eine globale Pause.
- **Küstenziele bevorzugt:** Vor Spawn- und Gebäudepunkten werden die tatsächlichen Küsten-Grenzfelder des Gegners geprüft. Der Worker bleibt die letzte Instanz für die Erreichbarkeit.
- **Hafensuche rotiert:** Fehlgeschlagene Workerprüfungen wiederholen nicht mehr nur dieselben bestbewerteten Küstenpunkte, sondern wandern durch die Kandidatenliste.
- **Siegerereignis gepuffert:** Das kurzlebige `SendWinnerEvent` wird während des Spiels gespeichert. Der Diagnoseexport kann Sieg oder Niederlage damit auch dann bestimmen, wenn `updatesSinceLastTick()` beim späteren `gameOver()`-Check bereits den nächsten Tick enthält.
- **Live-Befund:** Im Russland/Normal/Public/Team-Mitschnitt wurden strategischer Spawn, 22/22 bestätigte Angriffe, neun Gebäude/Upgrades und 3/3 Raketenstarts beobachtet. Die alte Marineauswertung meldete dagegen nur 5/22 Transporte sichtbar und keine bestätigte Landung; genau dieser Pfad wurde korrigiert. Ein weiterer Live-Lauf mit 1.10.10 ist für die Bestätigung nötig.

### Änderung 1.10.9 – echte Match-Tests und daraus bestätigte Fehlerbehebungen

- **Automatischer Engine-Test:** `tools/benchmark/engine-match.mjs` verwendet die echte OpenFront-Engine, Produktionskarten, Gegner und `GameView` mit reproduzierbarer Uhr und dokumentiertem Seed. Befehle und Entscheidungen werden vollständig gespeichert. Das ist kein Mock-Kampftest, aber auch kein Browser-/Multiplayer-Nachweis.
- **Browser-Controller:** `tools/benchmark/serve-browser.mjs` startet eine lokale Testoberfläche für den originalen Client und Worker. Ein Klick startet die Partie und Aufzeichnung. Dieser Pfad ist hier noch nicht Ende zu Ende geprüft: Der Cloud-Browser blockierte Loopback.
- **Parametersuche:** `tools/benchmark/suite.mjs` vergleicht Profile auf Trainingsstarts und prüft die Auswahl auf getrennten Starts. Zeitlimits bleiben offen; keine automatische Übernahme unbelegter Verbesserungen.
- **Kriegsschiffe repariert:** Der Worker liefert mit `canBuild` den Starthafen. Der Bau-Intent benötigt dagegen das geprüfte Wasser-/Patrouillenfeld. Im gleichen Engine-Szenario: vorher 72 Anfragen / 0 bestätigte Schiffe, danach 3 / 3.
- **Siegerkennung repariert:** `WinUpdate.winner` enthält Client-IDs, nicht Player-IDs. Ein tatsächlich gewonnenes Testspiel wurde zuvor als Niederlage ausgegeben.
- **Bau-Intent:** Behält den ursprünglich geprüften Zielpunkt bei; der vorhergesagte Bauplatz dient der Bestätigung. So wird die Standortsuche nicht versehentlich von einem bereits verschobenen Punkt wiederholt.
- **Diagnose:** Ereignistyp, Sequenz und Tick können nicht mehr durch Zusatzdaten überschrieben werden; vorher wurde beispielsweise `build_confirmed` zu `build` oder `upgrade`. Kumulative Zähler bleiben trotz begrenztem UI-Puffer erhalten.
- **Ergebnisse:** Kleine Testserie mit Siegen, einer Impossible-Niederlage und unvollständigen Partien. Kein besseres Parameterprofil belegt; Vollautomatik bleibt Standard. **Issue #12 bleibt offen.**

[Einrichtung und Befehle](docs/BENCHMARKS.md) · [Gemessene Ergebnisse und Grenzen](docs/benchmarks/2026-09-20.md)

### Änderung 1.10.8 – Issue #12: Flugbahn-/Bahnprüfung und überprüfbare Live-Daten

- **SAM gegen Nukes:** Statt nur der geraden Verbindung werden die Bézier-Kontrollpunkte aus OpenFront `PathFinder.Parabola.getParabolaControlPoints` nachgebildet. Beide möglichen Flugrichtungen und ein kleiner Rundungspuffer werden geprüft. Risiko bedeutet **mögliche Abwehr**, nicht sicherer Treffer; die Engine entscheidet.
- **Bahn-Bauplatzbewertung:** Innerhalb des offiziellen Stationsabstands prüft der Bot nun bis zu drei begrenzte Korridore auf zusammenhängendes eigenes, passierbares Land. Ein bloßer Luftlinien-Treffer zählt nicht mehr automatisch als erreichbare Bahnverbindung. Die echte serverseitige `RailNetwork.findStationsPath`-Route ist im Browser-`GameView` nicht zugänglich; die Methode heißt bewusst `owned-corridor-proxy`.
- **Angriffsprognose:** Die Diagnose nennt `config.attackLogic` versus `rough-proxy`. Sie vergleicht die geschätzten Verluste mit einer tatsächlich beobachteten Netto-Abnahme des eigenen Angriffsverbands, wenn ein passender Verband im Spielzustand sichtbar bleibt. Diese Nettoänderung ist **keine isolierte Gefechtsverlustmessung**.
- **Einkommensprüfung:** 120 Ticks nach bestätigter City/Factory/Port werden die Veränderungen der sichtbaren Bahn- und Schiff-Goldwerte erfasst. Der Datensatz ist ein Intervallvergleich – kein Beweis, dass das konkrete Gebäude den Zuwachs verursacht hat.
- **Match-Report:** `node tools/match-report.cjs --json path/zur/Diagnose.json ...` extrahiert nur beobachtete Siege/Niederlagen, bestätigte Angriffe, Häfen, Flotte, Einkommensdaten und Endgebiet. Ein Versionsvergleich wird **nur** bei explizit identischem Seed, Karte, Kartengröße, Modus und Schwierigkeit erzeugt; unbekannte Seeds ergeben keine erfundenen Vergleichspaare. Die offizielle `GameConfigSchema` hat standardmäßig kein `seed`-Feld; wenn eine reproduzierbare private/Test-Lobby den Seed extern kennt, ist er nur als ausdrücklich dokumentierte zusätzliche Exportmetadaten sinnvoll.
- **Weiter offen:** Vollständige echte Browser-Partien auf verschiedenen Karten/Seeds, End-to-End-Szenarien (Allianz, MIRV, Marine, Replay/GameView-Wechsel) und empirisch belegte Gewinnraten wurden damit **nicht durchgeführt**. Diese Kriterien von #12 dürfen nicht als abgeschlossen markiert werden.

### Änderung 1.10.7 – Multiplayer-Fenster und Live-Validierung

- **Gegner kämpfen anderswo:** Spieler-Intelligenz unterscheidet numerische OpenFront-`smallID`-Angriffe gegen uns von Truppen, die ein echter Gegner gegen *Dritte* gebunden hat. Bei einem sichtbar anderweitig engagierten menschlichen Gegner sinkt der benötigte Truppenvorteil **nur moderat**; nach der asynchronen Workerprüfung bleiben die Heimreserve gegen andere Nachbarn und die Frontbindung verbindlich.
- **Neutrale Eröffnung:** Wenn unbesetztes Land erreichbar und unsere Region noch klein ist, sinkt die Priorität eines nicht exponierten menschlichen Angriffsziels. Eine tatsächlich exponierte Person kann trotzdem eine Gelegenheitsoption sein. Es gibt keinen pauschalen Aufruf zum frühen Spielerkrieg.
- **Keine Scheinschwäche:** Ein Gegner zählt nicht deshalb als „von anderen angegriffen“, weil nur *unser eigener* Angriff in seinen Incoming-Stacks erscheint. Ausgehende Stapel, die gegen uns gerichtet sind, gelten nicht als anderweitig gebunden.
- **Marine-Allianzschutz:** Während `me.actions()` veralten Informationen. Direkt vor der Landung werden der aktuelle Zielspieler, Bündnis-/Teamstatus, Eigentümer des Küstenfelds, War-Lock, eingehende Angriffe und frische Truppenreserve erneut geprüft. Kein zweiter Landungskrieg gegen einen neuen Verbündeten.
- **Diagnose:** `opportunity_attack` und `naval_allied_skip` dokumentieren die neuen Entscheidungen. VM-Regressionen testen Drittfronten, frühe Expansionspriorität, einen starken zweiten Nachbarn, neue Allianzen und Eigentümer-/Armeeänderungen während Workerabfragen.
- **Grenze:** Issue [#12](https://github.com/SLP-DEV1/openfront-bot/issues/12) bleibt offen: Regressionstests beweisen keinen realen Multiplayer-Sieg. Für belastbare Optimierung bitte komplette Diagnose-JSONs aus mehreren Karten-/Team-/FFA-Partien exportieren. Regeln der Lobby beachten.

### Änderung 1.10.6 – Issue #16: echte OpenFront-Angriffs-IDs

- **Korrekte ID-Typen:** `AttackUpdate.targetID` und `attackerID` sind numerische `smallID`-Werte, während `PlayerView.id()` und botinterne Kriegsziele String-`PlayerID`-Werte sind. Eine gemeinsame Umrechnung über `playerBySmallID` beziehungsweise `PlayerView.smallID()` verhindert direkte Vergleiche verschiedener ID-Räume.
- **Strategie/Verteidigung:** Aktive Angriffs-Stacks bestätigen die tatsächlich angeforderte Offensive; ein laufender Krieg wird nicht aufgrund der Typverwechslung freigegeben. Die Übernahme bereits laufender Angriffe speichert ein String-Kriegsziel. Frontschutz beim Not-Rückzug, Vorher-/Nachher-Vergleiche von Angriffs-Stacks und die Diplomatie-Konfliktprüfung berücksichtigen die numerischen Ziel-IDs.
- **Aufräumen:** Die nie belegte `combatAwaiting`-Variable und ihr toter Block sind entfernt; `pendingAttack` bleibt der bestätigte Pending-Zustand.
- **Regression:** Die simulierten OpenFront-Ausgangsangriffe verwenden jetzt numerische Ziel-IDs; ergänzende Tests prüfen die Zuordnung, Angriffsbestätigung, auslaufende War-Locks, Schlachtauswertung, Rückzugsreihenfolge und Allianz-Konflikte. Ein kompletter Live-Multiplayer-Test steht weiter unter Issue #12 aus.

### Änderung 1.10.5 – Hafen, Schiffe und echte Marine-Nachweise

- **Erster Hafen:** Nach mindestens einer City und Factory sucht ein eigenständiger, rotierender Küsten-Scan auf **eigenem Land** bis zu 72 Hafen-Kandidaten; der OpenFront-Worker bestimmt den tatsächlich legalen Bauplatz. Die Ersthafen-Priorität liegt vor dem Silo-Sparziel. Reale eingehende Angriffe und unmittelbarer SAM-Bedarf bleiben ausgenommen. Nach acht gezielt gescheiterten Worker-Suchen blockiert der Hafen-Meilenstein den Silo-Fonds nicht mehr auf Dauer; weitere normale Hafenversuche bleiben möglich.
- **Kriegsschiffe:** Mit fertiggestelltem Hafen werden bis zu zwei eigene Kriegsschiffe für Küstenschutz planmäßig geprüft, statt ausschließlich auf einen bereits eingehenden Feindtransport zu reagieren. Bei akuter Landung sind bis zu drei möglich. Der Bot prüft Wasserfelder um eigene Häfen (Worker + Gold + Reglement), statt nur sechs starre Offsets.
- **Transport-Nachweise:** Ein ausgehender Transport wartet auf ein tatsächlich sichtbares Schiff. Nur bei danach eigenem Zielgebiet wird die Landung als beobachtet markiert; ohne neues Schiff beziehungsweise bei verschollenem Schiff lautet die Diagnose `unconfirmed`/`unresolved`, nicht Erfolg. Ein offener Transport und Gegner-Cooldowns verhindern die wiederholten Blindlandungen aus dem Live-Log.
- **Marine-Diagnose:** `port_probe`, `port_intent`, `port_confirmed`, `warship_intent`, `warship_confirmed`, `warship_unconfirmed`, `boat_intent`, `boat_confirmed`, `boat_arrived`, `boat_unconfirmed`/`boat_unresolved` plus Zähler und eigene Hafen-/Schiffsanzahl im Snapshot.
- **Handel:** OpenFront spawnt Handelsschiffe über aktive Häfen automatisch, wenn ein passender, per Wasser erreichbarer Handelspartner einen Hafen hat; der Bot verspricht keinen direkten Handelsschiff-Bau-Intent. Kein Hafen ohne geeignete Küste bedeutet weiterhin keine sichere marine Infrastruktur.
- Vollständige Live-Partien und tatsächliche Marine-Kampf-/Handelserfolge müssen nach dem Merge anhand eines neuen Diagnoseexports überprüft werden.

### Änderung 1.10.4 – Multiplayer-Spawn startet nicht (Live-Fix)

- **EventBus im selben Match:** Neue Listener/EventBus-Instanzen dürfen nicht mehr den Game-Reset auslösen. Der Reset schaltet den Bot normalerweise absichtlich AUS; bei gleicher GameView werden jetzt nur EventBus und Konstruktoren aktualisiert.
- **PlayerView beim Spawn ausstehend:** Der Standort darf schon gesucht und der Spawn-Intent gesendet werden, auch wenn `myPlayer()` noch `null` ist. Sobald der Spielerzustand vorhanden ist, wird die Spawn-Auswahl bestätigt.
- **Früher senden:** Wenn ein guter gültiger Standort gefunden ist, wartet der Bot nicht mehr bis zum Abschluss der gesamten Kartensuche. Ab 110 Rest-Ticks sendet er den besten bisher verfügbaren Standort, auch wenn noch geprüft wird. Spawn-Befehle sind während der Spawnphase nicht am gewöhnlichen Kampf-Aktionsbudget gesperrt.
- **Reale Fehlerdiagnose:** `spawn_blocked` benennt fehlenden EventBus/Spawn-Intent, ausgeschalteten Auto-Spawn, Zufallsspawn, veraltete/belegte Position oder einen fehlgeschlagenen Befehl. `spawn_bus_rebind` und `spawn_intent` trennen Bot-Stopp, Intent-Ausgabe und bestätigte Spawn-Übernahme.
- Die Auswahlheuristik aus v1.10.3 bleibt erhalten. Ohne eine neue Multiplayer-Spawn-Diagnose ist nicht bekannt, welcher Fehlerzweig in deiner konkreten Partie ausgelöst wurde.

### Änderung 1.10.3 – Strategischer Auto-Spawn im Multiplayer

- **Richtiger Zeitpunkt:** Auto-Spawn funktioniert nur während der Spawnphase, nach manuellem Bot-Start und bei verfügbarem `SendSpawnIntentEvent`; Random-Spawn sowie Replay bleiben ausgeschlossen. Standard-Multiplayer hat laut offizieller Config 200 Spawn-Ticks. Ab 55 verbleibenden Ticks wählt der Bot eine gültige bisher gefundene Position; bei spätem Start gibt es eine sofortige, etwas gelockerte Deadline-Suche. Er kann **nicht** nach abgelaufener Spawnphase beitreten.
- **Strategische Position:** Bewertet die tatsächliche Spawnfläche (Radius vier), drei weitere Wachstumsringe, unbesetzte passierbare Ebene/Hochland-Flächen, Kartenränder und erreichbare Küste. Kleine Inseln/Halbinseln werden gegenüber zusammenhängendem freiem Expansionsland abgewertet. Der Küstenbonus bleibt klein.
- **Multiplayer-Rivalen und Teams:** Beobachtete Spawnpositionen anderer Spieler werden live vor dem Senden erneut bewertet. Der Gegnerabstand folgt dem offiziellen `minDistanceBetweenPlayers()` als Sicherheitsuntergrenze (Manhattan); Teamkameraden werden nicht als Feinde behandelt, aber direktes Team-Spawnen auf demselben Fleck wird ebenfalls vermieden.
- **Zuverlässigkeit:** Begrenzter, in UI-Zeitscheiben laufender Grid-Scan und lokale Verfeinerung der besten Kandidaten. Wenn das Ziel belegt wird oder ein Intent 30 Ticks lang nicht bestätigt wird, versucht der Bot eine Alternative. Spawnversuche, Dichte, Punktewert, verstrichene Suche und erkannter tatsächlicher Spawn werden protokolliert.
- **Grenzen:** Die Wertung schätzt strategische Erreichbarkeit über Gelände-Stichproben, nicht vollständige spätere Konflikt-/Bahnnetzpfade. Bei Random Spawn entscheidet weiterhin der Server. Es gibt keine Garantie für den global besten Spawn oder ein gewonnenes Multiplayer-Spiel.

### Änderung 1.10.2 – Public/Medium-Live-Test (Diagnose 1.10.1)

- **Kriegsdirektor:** Die Hauptfrontbindung hängt jetzt an der aktivierten Kriegskoordination (`impossibleMode`-Option), **nicht** an der Lobby-Schwierigkeit. Damit gelten Front-Lock, Zweitfrontreserve und spätere Worker-Nachprüfung auch in Public/Medium. Die auf Impossible abgestimmten Truppenquoten bleiben schwierigkeitsabhängig.
- **Angriffe auf neue Verbündete verhindern:** Normale Angriffe und Verteidigungs-Gegenangriffe prüfen nach jeder asynchronen Worker-Rückgabe nochmals, ob das Ziel aktuell lebt, feindlich und die eigene Hauptfront ist. Heimreserve und reale eingehende Truppen werden vor Gegenangriffen neu berechnet.
- **Wirtschaft:** Die passive Defense-Post-Zielzahl wird gedeckelt; akute Invasionen können weiterhin bis zu zehn Posts begründen. Frühe City-/Factory-Investitionen haben Vorrang vor nicht akuten Posts. Bei mehrfach erfolglosen Standortprüfungen werden begrenzt mehr Standorte pro Gebäudeart geprüft.
- **SAM:** Mehr Bauplatzproben um ungeschützte Cities/Factories/Silos; SAM-Reichweite wird bei der Bewertung aus der Spiel-Config gelesen. Neben beobachteten Silos/Raketen gibt es ab einer ausgebauten Wirtschaft eine kleine, goldgebundene **proaktive** Abdeckung für ungeschützte Infrastruktur. Ohne erkannte Nukes ist das eine vorsichtige Vorsorgeentscheidung, keine Garantie für ausreichende Abwehr.
- **Live-Diagnose:** Historische Snapshots werden beim Schreiben tief kopiert. Bei Spielende wird nach dem offiziellen `WinUpdate.winner` gesucht, der je nach Spielmodus Spieler-/Team-IDs enthält. Nur ein tatsächlich erkannter Eintrag erlaubt `victory` oder `defeat`; ohne Siegerinformationen bleibt `unknown`, bei einem explizit siegerlosen Ende `incomplete`. Die Diagnose nennt außerdem SAM-Bedarf, beobachtete Silos/Raketen und offene Assets.
- **Validierung:** Zusätzliche Simulationstests reproduzieren Public/Medium-Frontbindung, Allianzwechsel während Worker-Abfragen, historische Diagnosewerte und die neue Wirtschaft. Ein neuer kompletter Live-Multiplayer-Test bleibt notwendig.

### Änderung 1.10.1 – Restpunkte aus Issue #10

- **AFK-Targeting:** Offen als disconnected gemeldete Gegner erhalten einen Zielbonus und eine moderat angepasste Angriffsquote. Ein starker AFK-Gegner bleibt durch die Mindest-Heimreserve und die Zweitfront-Prüfung geschützt; Wiederverbindung ist möglich.
- **Kontrollierter Gegenangriff:** Bei tatsächlich eingehendem Angriff greift der Bot über den vorhandenen `defense()`-Pfad nur bei ausreichenden Truppen zurück an. Die dynamische Heimreserve wird jetzt explizit nach dem Gegenschlag geprüft. `emergencyRetreat()` ist eine andere Funktion: Sie ruft eigene Verbände zurück.
- **Verbündeten-Assistenz:** Ausdrückliche `ally.targets()` und Team-Zielmarkierungen erhalten einen Bonus, sofern das Ziel feindlich ist. Weder Zielmarkierungen noch AFK heben den War-Director, die Reserve- oder die workerseitige Angriffsprüfung auf.
- **Fallout:** Saubere neutrale Grenzflächen zuerst; nur wenn keine saubere neutrale Grenze im geprüften Batch liegt, wird Fallout als Fallback angezeigt. Dieser benötigt einen hohen Heimtruppenstand, keine eingehenden Angriffe, keinen starken Zweitnachbarn und eine kleinere Angriffssumme. Verstrahlung wird **nicht** pauschal als günstiger bewertet.
- **Neutrale Insel-Expansion:** Rotierender, begrenzter Küstenscan für unbesetztes, nicht verstrahltes Land. Landungen werden erst nach Worker-Prüfung des Transport-Ziels und bei ausreichendem Heimvorrat ausgelöst; laufender Krieg und gewöhnliche neutrale Landgrenzen haben Vorrang. Die Stichprobe kann kleine Inseln in einem Durchlauf verpassen.
- **Prüfung:** Mock-Regressionen für AFK, Zielmarkierungen, Reserve, clean/Fallout-Auswahl, Insel-Suche und worker-verifizierte neutrale Landung. Der vollständige Browser-/Impossible-Match-Test aus Issue #12 bleibt nötig.

### Änderung 1.10.0 – Engine-nahe Autonomie (experimentell)

- **Kampfkosten:** Probeweise `config.attackLogic()` für erreichbare Frontier-Tiles statt reiner Truppenverhältnis-Heuristik. Wenn die Engine-Methode im Client fehlt, nur konservative Gelände-/Defense-Post-Abschätzung. Keine Zusage, dass die simulierten Zukunftstiles exakt der echten Front entsprechen.
- **Spielmodus/Ziel:** FFA/Team, Team-Landanteil, mögliche Siegschwelle, Lobby-Timer und Doomsday werden – sofern der Client sie liefert – gemessen. Fehlende Werte bleiben in Diagnose/Panel ausdrücklich *unbekannt*.
- **Neutraler Fallout:** Verstrahlte neutrale Randfelder werden nicht als gewöhnliche Expansionsziele eingeplant; stark angegriffene Gegner erhalten nur einen Zielbonus unter den bestehenden Reserveschranken.
- **Marine:** Bei erster Aktivierung der 1.10-Serie schaltet Vollautomatik auch `boats` ein; manuell lässt es sich weiterhin ausschalten. Marine prüft mehrere Zielpunkte eines Inselgegners. Beobachtete feindliche Transporte lösen Kriegsschiff-Bewegungen bzw. worker-validierte Kriegsschiff-Bauversuche aus; eigene Transporte zu nun verbündeten Zielen können abgebrochen werden, sofern die Event-Konstruktoren erkannt werden.
- **Handel/Bahnbau:** Der Client liefert kumulatives `trainGold()` und `tradeGold()`; der Bot misst deren Differenz je 60 Sekunden. Gebäude erhalten einen Reichweiten-Score mit `trainStationMinRange()`/`trainStationMaxRange()`. Dies beweist weder eine reale Zugroute noch garantiert es künftigen Ertrag; unproduktive zusätzliche Factories werden weniger priorisiert.
- **Nukes:** Echte `nukeMagnitudes` für Atom/Hydrogen, MIRV-Kandidaten, begrenzte SAM-Flugweg-Proxy-Bewertung, Worker-Kosten und vorberechnete Bulk-Atombomben zur SAM-Überlastung nur bei genügenden Abschussröhren und Rücklagen; mehrteilige Starts werden einzeln bestätigt. Der Proxy ist **keine** genaue parabelförmige Flugbahnsimulation.
- **Teams/Bündnisse:** Gemeinsamer Landstand, transitive Zielhinweise, begrenzte Truppenspende an tatsächlich bedrängte Teammitglieder, optionaler Goldtransfer und Allianzverlängerung bei vorhandenem Spiel-Event. Kein blindes Spenden an beliebige Allianzpartner.
- **Kompatibilität:** Public/Private/Singleplayer bleiben ohne MP-Test-Schalter nutzbar; der Bot startet nach Seiten-/Match-Wechsel weiterhin AUS, Replays bleiben gesperrt. Für die aktuelle v1.10.2-Datei lautet der Export `OpenFront_AggroBot_1.10.2_Diagnose.json`.
- **Validierung:** Unit-/VM-Regressionen decken die Heuristiken und asynchronen Events ab. Ein browserseitiger End-to-End-Match-Benchmark über verschiedene Maps und Seeds steht weiterhin aus. Es gibt keine garantierte Impossible- oder Multiplayer-Gewinnquote.

### Änderung 1.9.9 – Intent-Diagnose (Issue #9)

- Beim Erkennen des EventBus meldet der Bot **0–8 von 8 Intents** und nennt fehlende Event-Konstruktoren. Fehlen Spawn, Attack oder Build, erscheint im Bot-Menü eine rote Warnung **„KERNFUNKTION EINGESCHRÄNKT“**.
- Fehlende Intents werden beim ersten blockierten Befehl im Log und Diagnoseexport gemeldet; wiederholte Versuche spammen die Warnung nicht. Wenn der EventBus erst später vollständig registriert wird, prüft der Bot die fehlenden Kern-Intents gelegentlich erneut.
- Die bereits gelöschte 1.9.0-Datei wird **nicht** wieder eingecheckt. Das Upgrade-Intent verwendet bewusst alle drei Parameter: `unitId`, `unitType`, `amount = 1` (offizielle OpenFront-API).
- Regressionstests für **0/8**, teilweise und vollständig erkannte Intents sowie geblockte Bauaktionen. Kein automatischer Spielstart; kein vollständiger Live-Test durch die Node-CI.

### Änderung 1.9.8 – Multiplayer ohne Zusatzsperre

- **Public und Private** funktionieren nach einem Klick auf **▶ BOT STARTEN** direkt, ohne vorheriges MP-TEST-Opt-in.
- Der MP-TEST-Schalter und alle zugehörigen Konsent-/Persistenzpfade wurden entfernt. Der Spieltyp wird weiter geprüft; Replays und unbekannte Spieltypen bleiben gesperrt.
- Der Bot startet nach Reload oder Spielwechsel nicht automatisch. **Alt+Shift+X** beendet ihn jederzeit.
- Regressionstests umfassen Public-/Private-Befehle, Notrückzüge, Replay-Sperre, unbekannte Spieltypen und manuelles Stoppen.
- Der Bot ist weiterhin nicht als Live-Multiplayer-Sieger verifiziert. Beachte die Spiel-/Lobbyregeln.

### Änderung 1.9.7 – bisheriger Multiplayer-Test

- Ursprünglich wurde Multiplayer nur nach zusätzlichem Opt-in aktiviert; dieser Schalter ist seit v1.9.8 entfernt. Replays sind weiterhin gesperrt.

### Änderung 1.9.6 – strategische Planung

- **Wachstumsorientierte neutrale Expansion:** Wenn die Truppen nahe dem Cap stehen, keine feindlichen Angriffe eingehen und kein großer Grenznachbar droht, setzt der Bot kontrolliert mehr freie Truppen zur Landnahme ein. Die Reserve für wirkliche Bedrohungen bleibt erhalten. Diagnose: `growthPotential` als theoretischer Rekrutierungswert.
- **Lokale Zielbewertung:** Erreichbare Cities, Factories und Ports steigern den Wert eines gegnerischen Grenzziels. Nahe Defense Posts und hohe gegnerische Truppendichte senken den Wert. Das ist eine Heuristik; der Worker bestätigt weiterhin die Legalität.
- **Wirtschaftlicher Engpass:** Hohe Truppenauslastung erhöht die Priorität von Cities. Factories werden bevorzugt in Reichweite eigener City-/Port-Infrastruktur platziert; tatsächliche Bahnverbindungen werden nicht behauptet oder automatisch gebaut.
- **Proaktive Diplomatie:** Bei EXPAND und ASSAULT sind Angebote an ausreichend starke, nicht bekämpfte Grenznachbarn möglich, um die andere Front zu stabilisieren.
- **Nukes:** Wertvolle Ziele des aktiven Kriegspartners werden gegenüber unbeteiligten Gegnern bevorzugt, die bestehenden SAM- und Freundschutzfilter bleiben bestehen.
- **Spawn:** Eine nutzbare Küste gibt einen kleinen Bonus, während Landdichte und Abstand zu anderen Spawns wichtiger bleiben.
- Neue Simulationstests für Expansion, Reserve, Infrastruktur-Bewertung, Diplomatie und Atomzielwahl. Die Berechnungen sind noch kein Beleg für Live-Siege auf „Unmöglich“.

### Änderung 1.9.5 – PR #1 und Issues #2–#5

- **PR #1:** Eine schwache Grenznation kann auch neben einem stärkeren Gegner als Ziel dienen, wenn nach dem Angriff die nötige **unbegrenzte, gegnerabhängige Heimreserve** verbleibt. Kein Angriff bei gefährlichem eingehendem Angriff. Baufehlersuche unterscheidet unzureichendes Gold, ungültiges Bauland, illegale Bauoptionen und Prioritäts-/Reservesperren.
- **Issue #2:** `nukeAttempts` zählt nur abgegebene Startbefehle, `nukeShots` nur im Spielzustand beobachtete Raketen. Nicht bestätigte Befehle halten den Fonds für die erste Bombe weiterhin aktiv.
- **Issue #3:** Ein Rückzug gilt erst bei `retreating:true` als beobachtet. Ein verschwundener Angriff wird als **unklar** erfasst, nicht als zurückgewonnene Truppen; Timeouts bleiben separat.
- **Issue #4:** Marineabfragen verwenden den tatsächlichen OpenFront-Einheitentyp `Transport` statt `Transport Ship`. Marine-Fixtures prüfen die echte Worker-Antwort.
- **Issue #5:** Ein lediglich starker Nachbar ohne aktuellen Angriff gibt Silo-/Bomben-Ersparnisse nicht mehr zur allgemeinen Ausgabe frei. Akute Angriffe und eingehende Raketen behalten Vorrang.
- 43 simulierte Regressionstests beim PR-Review; sie beweisen **keine garantierte Live-Gewinnrate auf „Unmöglich“**.

### Änderung 1.9.4

- **Vollautonom AN (Standard):** Aggressivität, Grundreserve, Aktionen pro Minute und Zielprüfungen werden abhängig von Strategie, gegnerischen Angriffen, Truppenkapazität und Worker-Latenz **gemeinsam** angepasst. Eine akute Verteidigung schaltet sofort um, normale Änderungen nutzen 45 Spielticks Hysterese.
- **Manuelle Werte bleiben erhalten:** Die vier Slider zeigen im Vollautomatikmodus die aktuell tatsächlich verwendeten Werte und sind gesperrt. „Vollautonom AUS“ stellt die zuvor gespeicherten manuellen Werte wieder her.
- **Auto-Strategie gehört dazu:** „Vollautonom AN“ aktiviert auch Auto-Strategie. Das Diagnose-JSON dokumentiert die verwendeten Parameter und ihre Begründung.
- Mehr Zielprüfungen werden nur bei flüssigen Worker-Abfragen eingesetzt. Ein langsamer Spiel-Worker reduziert Prüfungen und Aktionstempo statt zusätzlichen Druck aufzubauen.
- Der Modus bleibt ausschließlich im Singleplayer aktiv. **Keine garantierte Gewinnquote ohne echte Live-Tests.**

### Änderung 1.9.3

- **Notverteidigung:** Bei gefährlichen eingehenden Angriffen werden bereits gebundene eigene Truppen gezielt zurückgerufen, bevor auf die Grenzberechnung gewartet wird. Neutrale Angriffe haben Vorrang, damit nicht unnötig der Rückzugsverlust von **25 %** bei Angriffen gegen Spieler anfällt. Rückrufe sind begrenzt und werden im Diagnose-JSON geprüft.
- **Keine Selbstschwächung:** Gegen starke Angriffswellen schickt der Bot nicht blind neue Gegentruppen los, sondern hält seine Heimtruppen und schützt die Verteidigungsboni.
- **Defense Posts:** Bauplätze werden innerhalb der tatsächlichen Schutzreichweite von **30 Kartenfeldern** bewertet; bevorzugt werden noch ungeschützte gegnerische Grenzabschnitte. Auf großen gefährdeten Fronten sind mehr als vier Posts möglich.
- **Event-Erkennung:** Rückzugs-Events werden auch erkannt, wenn die Event-Liste aus einer anderen JavaScript-Umgebung stammt.
- **Regressionen:** zusätzliche Tests für Rückzüge, Aktionslimit, Nicht-Spam, Bauabdeckung und Multiplayer-Sperre. Die Simulation ersetzt keinen Live-Sieg.

### Änderung 1.9.2

- Priorisiert **erste Stadt und erste Fabrik** vor nicht dringenden Verteidigungsposten.
- Ab zwei Städten und zwei Fabriken spart die Wirtschaft im Late Game gezielt auf den **ersten Raketensilo (1,15 Mio. Gold)**; danach kann sie Gold für eine **Atombombe (1,1 Mio. Gold)** vorhalten. Eingehende Raketen und starke Angriffe haben Vorrang.
- Statt im Late Game bei voller Armee und stärkeren Grenznachbarn ausschließlich zu verteidigen, meldet der Bot **TECH** und finanziert die nächste Angriffstechnologie.
- Nach längerer erfolgloser Inaktivität wird ein blockiertes Hauptkriegsziel neu bewertet.
- Diagnoseexport enthält jetzt auch den **Spielmodus** und das **wirtschaftliche Sparziel**.
- Einstellungen aus 1.9.1 werden übernommen; der Bot startet nach Seitenwechsel weiterhin **ausgeschaltet**.

### Änderung 1.9.1

- Marine verwendet die **vollständige Grenzbedrohung** bei der Reservenberechnung und respektiert das Hauptkriegsziel.

## Entwickler-Checks

Mit Node.js (keine npm-Abhängigkeiten):

```bash
node --check OpenFront_Solo_AggroBot.user.js
node tests/strategy-regression.cjs
```

Die Regressionstests verwenden simulierte Spielobjekte und ersetzen **keine vollständige Partie** in einem echten Browser. Vor jeder neuen Version insbesondere Multiplayer-Sperre, Not-Aus, Event-Erkennung, Wirtschaft, Allianzen und Nukes erneut testen.

**Keine automatische GitHub-Raw-Update-URL:** Dieses Repository ist privat.
