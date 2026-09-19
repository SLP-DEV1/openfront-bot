# OpenFront Solo AggroBot

Autonomer Bot für **Singleplayer, Public und Private** als Tampermonkey-Userscript für [OpenFront](https://openfront.io/).

**Aktuelle installierbare Datei:** [`OpenFront_Solo_AggroBot.user.js`](./OpenFront_Solo_AggroBot.user.js), Version **1.10.2**. Die veraltete Datei `OpenFront_Solo_AggroBot_1.9.0.js` wurde aus `main` entfernt.

## Installation

1. In Tampermonkey ein **neues Skript** erstellen und den gesamten Inhalt von `OpenFront_Solo_AggroBot.user.js` einfügen. In einem privaten GitHub-Repository darf man sich nicht darauf verlassen, dass Tampermonkey einen GitHub-Raw-Link ohne Anmeldung automatisch aktualisieren kann.
2. Alle älteren Solo-AggroBot-Skripte deaktivieren.
3. Wenn der Spawn Advisor 10.4.0 parallel läuft, dort **Auto-Spawn**, **Smart Attack** und **Auto-Accept Alliances** ausschalten.
4. OpenFront neu laden, eine Singleplayer-, Public- oder Private-Partie starten und den Bot im Menü **manuell** einschalten. Ein zusätzlicher Multiplayer-Schalter ist nicht mehr erforderlich.

**Not-Aus:** `Alt+Shift+X`. **Start/Pause:** `Alt+Shift+P`. Nach jedem Seitenladen und beim Wechsel in ein neues Match bleibt der Bot aus, bis du ihn startest. **Public/Private-Multiplayer benötigt keinen separaten Testschalter mehr; Replays und unbekannte Spieltypen bleiben gesperrt.** Beachte vor dem Einsatz die Regeln der jeweiligen Lobby bzw. des Servers.

## Strategie & Diagnose

Strategie-, Wirtschafts-, Marine-, Diplomatie-, Nuke- und SAM-Planung sind vorhanden. Der Bot kann Befehle senden; daraus folgt **keine garantierte Gewinnrate auf „Unmöglich“**. Ein vollständiger Live-Test ist noch nicht erfolgt. „Diagnose JSON“ im Bot-Menü zeichnet unter anderem Gebietsänderungen, Truppenlage, Bauaufträge und Allianzantworten auf. Bitte den Export vor dem Neuladen erstellen.

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