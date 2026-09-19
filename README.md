# OpenFront Solo AggroBot

Autonomer Bot für **Singleplayer, Public und Private** als Tampermonkey-Userscript für [OpenFront](https://openfront.io/).

**Aktuelle installierbare Datei:** [`OpenFront_Solo_AggroBot.user.js`](./OpenFront_Solo_AggroBot.user.js), Version **1.9.9**. Die veraltete Datei `OpenFront_Solo_AggroBot_1.9.0.js` wurde aus `main` entfernt.

## Installation

1. In Tampermonkey ein **neues Skript** erstellen und den gesamten Inhalt von `OpenFront_Solo_AggroBot.user.js` einfügen. In einem privaten GitHub-Repository darf man sich nicht darauf verlassen, dass Tampermonkey einen GitHub-Raw-Link ohne Anmeldung automatisch aktualisieren kann.
2. Alle älteren Solo-AggroBot-Skripte deaktivieren.
3. Wenn der Spawn Advisor 10.4.0 parallel läuft, dort **Auto-Spawn**, **Smart Attack** und **Auto-Accept Alliances** ausschalten.
4. OpenFront neu laden, eine Singleplayer-, Public- oder Private-Partie starten und den Bot im Menü **manuell** einschalten. Ein zusätzlicher Multiplayer-Schalter ist nicht mehr erforderlich.

**Not-Aus:** `Alt+Shift+X`. **Start/Pause:** `Alt+Shift+P`. Nach jedem Seitenladen und beim Wechsel in ein neues Match bleibt der Bot aus, bis du ihn startest. **Public/Private-Multiplayer benötigt keinen separaten Testschalter mehr; Replays und unbekannte Spieltypen bleiben gesperrt.** Beachte vor dem Einsatz die Regeln der jeweiligen Lobby bzw. des Servers.

## Strategie & Diagnose

Strategie-, Wirtschafts-, Marine-, Diplomatie-, Nuke- und SAM-Planung sind vorhanden. Der Bot kann Befehle senden; daraus folgt **keine garantierte Gewinnrate auf „Unmöglich“**. Ein vollständiger Live-Test ist noch nicht erfolgt. „Diagnose JSON“ im Bot-Menü zeichnet unter anderem Gebietsänderungen, Truppenlage, Bauaufträge und Allianzantworten auf. Bitte den Export vor dem Neuladen erstellen.

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