# OpenFront Solo AggroBot

**Version 1.20.4** · Tampermonkey-Autopilot für [OpenFront](https://openfront.io/) · Singleplayer, Public und Private · [offene Validierungspunkte](https://github.com/SLP-DEV1/openfront-bot/issues/12)

Der Bot erkennt neue spielbare Matches, wählt bei manuellem Spawn eine Position und steuert Expansion, Verteidigung, Wirtschaft, Flotte, Handel und Diplomatie. Die trainierte Neural-Policy kann optional *begrenzt* mitentscheiden; es gibt keine localhost-Brain- oder Live-Qwen-Anbindung mehr. **Es gibt keine belegte garantierte Impossible- oder Multiplayer-Siegquote.**

## Schnellstart / Update

**1.20.4 – Duo-Bündnisse mit Drittspielern:** Die Bots tauschen bestätigte Fremd-Allianzen aus und schützen Verbündete des Partners vor neuen gemeinsamen Angriffen und Nuklear-Kollateralschäden, ohne eine fremde Allianz als eigene auszugeben. Während der Duo-Verbindung werden unabhängige fremde Auto-Allianzen vermieden; einen bereits verbündeten Drittspieler kann der andere Bot durch einen eigenen legalen Bündnisantrag ebenfalls anfragen. Bestehende fremde Allianzen werden nicht automatisch aufgelöst. [Details](docs/LOCAL_DUO.md).

**Duo-Verbindungsfix 1.20.3:** Das Browser-Timeout wurde für die erstmalige Loopback-Freigabe auf 8 Sekunden verlängert. Der Relay protokolliert eintreffende Browser und unterschiedliche Matchkennungen; beide Panels zeigen die berechnete Matchkennung. Der direkte Test `http://127.0.0.1:8767/health` prüft, ob der aktualisierte Relay läuft. In Chrome/Edge gegebenenfalls für openfront.io den Zugriff auf **Apps auf dem Gerät / Loopback-Netzwerk** erlauben. Nach dem Repository-Update den Relay per STRG+C beenden und `Start_Live_Duo.bat` neu starten; siehe [Fehlersuche](docs/LOCAL_DUO.md#wenn-ein-browser-nicht-verbindet).

**1.20.3 – Duo-Verbindungsdiagnose und automatische Partnererkennung für zwei Browser:** Beide Bot-Instanzen erkennen über denselben Raumcode und einen nur auf `127.0.0.1:8767` laufenden Relay automatisch die aktuelle **PlayerID** ihres Partners. Manuelles Eintragen der PlayerID entfällt. Die Browser-Instanzkennung bleibt pro Tab auch bei Neuladen erhalten. Im Panel werden eigene ID, Partner-ID, optionaler Partnername, Raumcode, Verbindung, Partnerziel, Hilfebedarf, verfügbare Truppen, Reserve, Angriffstick und Duo-Timeline angezeigt. Während der Spawnphase wählt ein Bot einen normalen sicheren Spawn, der zweite bevorzugt einen separat legal geprüften Standort in dessen Nähe. Die nur für das aktuelle Match verifizierte Partner-ID ist gegen Friendly Fire geschützt; Bündnisanfragen werden bevorzugt angefragt/angenommen, gelten aber erst nach Bestätigung im echten GameView. Beobachtete Partnerangriffe zählen auch bei bestätigter lokaler FFA-Allianz; spielseitig erlaubte Truppen-/Goldhilfe wahrt eigene Reserven. Gemeinsame Zielhinweise, Rollen und Angriffstick ändern nur die Priorität bereits legaler/sicherer Aktionen; bei Relay-Ausfall spielen beide autonom weiter. Start über `Start_Live_Duo.bat`, Details in [LOCAL_DUO.md](docs/LOCAL_DUO.md).


**1.19.8 – Kapazität und aktive Abwehr:** Bei 85 % Truppenkapazität beginnt die Fabrikpriorität zu steigen; bei dauerhaftem Engpass verdrängt eine vom Worker tatsächlich freigegebene und bezahlbare Fabrik eine nur spekulative Hafen-/Silo-/SAM-Sparabsicht, soweit kein eingehender Nuklearangriff oder unmittelbarer Landnotstand besteht. Die Reserve bleibt unter beobachtetem Druck hoch und entspannt sich nach Abklingen. Der Gegenangriff prüft die tatsächlich verbleibenden gegnerischen Heimtruppen, die eigenen eingehenden Angriffe und den Heimschutz nach dem Einsatz; es gibt keine pauschale 24-%-Sperre mehr. Schema-3/4-Policies ranken jetzt auch *bereits legale* Angriffs-, Wirtschafts- und Marinekandidaten (maximal begrenzter Score-Delta); weder Modell noch Score umgehen Engine, Allianzen, Standort, Kasse oder militärischen Heimschutz. Neue Regressionen prüfen Kapazitätsstau, Hafen-Konkurrenz, Druck, Gegenangriff und nichtnull Schema-4-Aktionsranking. **Ein erfolgreicher vollständiger Live-Multiplayer-Matchtest von 1.19.8 steht weiterhin aus.**


**1.19.6 – Erstes wirtschaftliches Kerngebäude:** Der Bot unterscheidet einen vom Worker bestätigten Preis von einer tatsächlich legalen Baustelle. Bei realer Unterfinanzierung wird der Preis pro City/Factory und der fehlende Betrag gespeichert; unnötige Worker-Abfragen werden bis zur erneuten Finanzierung/Preisprüfung begrenzt. Ein dokumentierter Preis für City/Factory bleibt vor freiwilligen Schiffen, Nukes und Goldspenden geschützt; dringende Verteidigung und SAM-Gefahren haben Vorrang. Baufehler werden nach Preis, Worker-Angebot, Standort und Goldbudget getrennt diagnostiziert. Die Angriffsdiagnose nennt die tatsächlichen Reserveanteile, die Neural-Diagnose die Basis- und Policy-Reihung statt bloß eines Aktions-Deltas. **Diese Änderung erzeugt keine zusätzlichen Gold-Einnahmen, behauptet keinen legalen Standort und garantiert keinen Multiplayer-Sieg.**


## Neural-Live-Version (Impossible Run 3)

Für den **experimentellen Live-Test** steht eine separate Tampermonkey-Datei bereit: [OpenFront_AggroBot_Impossible_Run3.user.js](./OpenFront_AggroBot_Impossible_Run3.user.js). Sie basiert auf AggroBot **1.20.4**, bündelt den [Schema-4-Champion von Impossible Run 3](./docs/training-analysis-20260921/schema4-impossible-world-europe-20260920-run3/champion.json) (1.000 Gewichte) direkt im Userscript und benötigt keinen Brain-Server, Qwen, Trainer oder Modellabruf im Browser. Der normale Bot bleibt unverändert.

Für den Test das **vollständige** Run-3-Userscript in Tampermonkey installieren, alle anderen AggroBot-Userscripts deaktivieren und OpenFront neu laden. Im Panel müssen **Vollautonom** und **Neurales Netz** aktiv sein; unter „Neurales Modell“ muss „Strategische Policy v4 (24 Signale)“ erscheinen. Der Schalter ohne geladenes Modell reicht nicht. Auto-Start und Unmöglich-Taktik sind optionale Bot-Einstellungen. Bei einer neu installierten Policy v4 wird der Neural-Schalter automatisch aktiviert, sofern nicht bereits eine gespeicherte Einstellung vorliegt.

**Hinweis:** Das gebündelte Modell ist weiterhin der unveränderte Impossible-Run3-Champion; die *Bot-Logik* entspricht 1.20.4. Künftige Codeänderungen müssen in beide Userscripts übernommen werden; `tests/bundled-run3-regression.cjs` prüft die Quellcodegleichheit abzüglich Header und Modelldaten. Die bisherigen acht unabhängigen Impossible-Holdout-Spiele von Run 3 endeten ohne Sieg (0/8), mit Ø 5.940 Ticks gegenüber Ø 5.393 Ticks der Null-Policy in demselben Test. Ein Live-Multiplayer-Vorteil ist damit nicht nachgewiesen. Die CI prüft die Datei gegen Quellstand und Modell.


**1.19.5 – Befunde aus drei Live-Diagnosen (1.19.2/1.19.3):** Vorher unsichtbare Landkriegs-Blockaden werden mit konkretem Grund, Heim-/Reservewerten und betroffenen Gegnern im JSON/Timeline protokolliert. Eine festgefahrene Public-/Private-Kriegsfront darf ohne aktiven Angriff und nur bei eigenständig sicherem Alternativziel neu bewertet werden. Ein kurzfristiger belegter Gebiets-/Gebäudeverlust erhöht den defensiven Vorlauf; wiederholt nicht bestätigte Seelandungen erhalten zunehmend längere, zielspezifische Sperren. Nach mehrfachen Bauprüfungen ohne Erfolg werden in ungefährdeten Situationen Stadt/Fabrik gegenüber spekulativem Silo-/Raketenfonds priorisiert; ein echter SAM-Fonds bleibt geschützt. Der Export zeigt Modell-Fingerprint (nicht kryptografisch), Schematyp, Gewichte und tatsächliche Null-/Nichtnull-Inferenz. **Die alten drei Mitschnitte enthalten kein verifiziertes Matchende; dies ist keine gemessene Steigerung der Siegquote.**

**1.19.4 – Audit- und Datenintegrität:** Der optionale lokale Monitor erhält Match-IDs und schreibt verschiedene Partien/Tabs getrennt; aktuelle Entscheidungswerte überschreiben nicht mehr rückwirkend veraltete Snapshots. Die persönliche Eliminierung wird vor dem gesamten Spielende erkannt, im Teamspiel bleibt das offizielle Teamergebnis abwartbar. Wirtschaft, Flotte, Nukes und Goldspenden prüfen gemeinsam ausstehende Ausgaben und den SAM-Fonds; Browsertest-Abschluss und Ereigniswiederholungen sind wiederholbar. Benchmarks koppeln nur identische Gegnerkontexte, der Trainer verwendet einen eingefrorenen Bot-Hash und einen strengen Nachweisprüfer; bei zusätzlichen Siegen ist ebenfalls die dokumentierte No-Regression-Regel verbindlich. **Dies ist keine nachgewiesene Steigerung der Impossible- oder Human-Multiplayer-Siegquote.** Der seit 1.19.3 entfernte localhost-Brain/Qwen-Berater wird nicht wieder eingeführt.

**1.19.3:** Externen localhost-Brain und Qwen-Live-Berater samt Token/UI aus dem Bot und lokalen Benchmark entfernt. Neural-Policy, Browser-Lernen und eigenständiges Offline-Training bleiben erhalten; das frühere Qwen-Trainingsreview wurde anschließend ebenfalls entfernt. Ein möglicherweise noch laufender alter Brain-Prozess wird durch ein Git-Update nicht automatisch beendet.

**1.19.2 – Korrekturen aus der NYC-Diagnose:** Eingehende Friedensangebote können bei militärischem Druck trotz aktivem Konflikt angenommen werden. Moderate, anhaltende oder durch starke Gegner gestützte Angriffe geben das Verteidigungsbudget früher frei. Ein zentrales Befehlsjournal unterscheidet korrelierte Bot-Angriffe von Angriffen ungeklärter Herkunft. Details und Prüfgrenzen: [Diagnosekorrekturen 1.19.2](docs/DIAGNOSE_FIXES_1.19.2.md).

**1.19.1 – Korrekturen aus der Aegean-Diagnose:** SAM-Preise werden auch bei fehlendem Gold aus Worker-Antworten gelesen und angespart. Unbezahlbare Standorte werden nicht als ungültig zwischengespeichert. Bei bezahlbaren, wiederholt abgelehnten SAM-Standorten wird nach 180 Ticks die übrige Wirtschaft freigegeben; die Suche läuft weiter. Akute Bodenangriffe sperren neue Wirtschafts-/Hafenbauten einschließlich Upgrades. Neue Seelandungen pausieren nach jüngsten Gebiets-/Gebäudeverlusten oder bei beobachteten eingehenden Nukes. Sichtbare Kriegsschiffe entlang eines geraden Routenkorridors erfordern örtliche Begleitung; dieser Korridor ist nur eine Näherung an den tatsächlichen Weg. Zielübernahme und mindestens 120 Ticks gehaltener Brückenkopf werden getrennt protokolliert. Hafenbesitz allein erzeugt kein Marineprofil; neue Profile beginnen mit geringer Konfidenz. Details und Prüfgrenzen: [Diagnosekorrekturen 1.19.1](docs/DIAGNOSE_FIXES_1.19.1.md).

1. Repository aktualisieren: `git pull --ff-only` (nur bei sauberem lokalen Arbeitsbaum; eigene nicht versionierte Dateien vorher sichern). Für den normalen Browser-Betrieb sind nur Browser und Tampermonkey nötig.
2. Den **gesamten Inhalt von [OpenFront_Solo_AggroBot.user.js](./OpenFront_Solo_AggroBot.user.js)** in Tampermonkey installieren bzw. das vorhandene Skript damit aktualisieren. Bei einem privaten Repository funktioniert ein anonymer GitHub-Raw-Autoupdate-Link nicht verlässlich.
3. Alte Solo-AggroBot-Userscripts deaktivieren, damit nicht zwei Instanzen gleichzeitig Befehle senden. Falls parallel der Spawn Advisor 10.4.0 läuft: dort Auto-Spawn, Smart Attack und Auto-Accept Alliances deaktivieren.
4. [openfront.io](https://openfront.io/) neu laden und eine Partie öffnen. **Auto-Start ist standardmäßig an**: Nach Erkennung von spielbarem Spielzustand und EventBus startet der Bot auch in Public/Private automatisch. Replays und unbekannte Modi bleiben gesperrt. Einsatz- und Lobbyregeln beachten.

**Bedienung:** `Alt+Shift+P` startet/pausiert; `Alt+Shift+X` ist der Not-Aus und deaktiviert zusätzlich Auto-Start, bis du ihn wieder im Panel einschaltest. Eine gewöhnliche Pause gilt bis zum nächsten Match. Der Bot kann schon während der Spawnphase reagieren; bei Zufallsspawn kann er keine Position auswählen.


## Was der Bot aktuell kann

| Bereich | Verhalten und Grenzen |
| --- | --- |
| **Vollautomatik** | Dynamische Aggressivität, Truppenreserve, Aktionen/Minute und Zielprüfungen. Manuelle Slider bleiben gespeichert; Notverteidigung und zulässige Aktionen haben Vorrang. |
| **Eröffnung & Wirtschaft** | Auto-Spawn, sichere neutrale Expansion, Bau/Upgrades von Städten, Fabriken, Häfen und Schutzgebäuden; Standort- und Goldprüfung vor dem Intent. |
| **Kampf & Schutz** | Hauptfront, eingehende Angriffe, Rückzüge, SAMs, Raketensilos, Nukes und konservativer Freund-/Allianzschutz – nach asynchronen Worker-Abfragen erneut validiert. |
| **Marine & Handel** | Transport-/Landungsplanung, Kriegsschiffe, frühe Häfen, Bahn-/Schiffseinnahmen und begrenzte Unterstützung von Teampartnern. Gesendete Befehle sind nicht automatisch bestätigte Erfolge. |
| **Gegnerprofile (1.19)** | Früher Angreifer, Wirtschaftsaufbauer, Gelegenheitsangreifer, Marinefokus oder unbekannt. Nur sichtbare Beobachtungen **dieser Partie**; angezeigte Sicherheit ist eine Heuristik, keine kalibrierte Wahrscheinlichkeit. |
| **Operationen (1.19)** | Ziel, Einsatzzweck, Truppenbudget, Gebietskriterium, Frist und Abbruchgrund. Bestehende Reserve, Diplomatie und Worker-Legalität gelten zusätzlich. |
| **Duo/Ranked 2v2 (1.20.1)** | Ranked-Teamzustand oder lokale, reziprok verifizierte PlayerIDs; Zielhinweise, tatsächliche Partnerangriffe, Bereitschaft, Angriffstick und begrenzte Hilfe. Relay ersetzt niemals die im Spiel bestätigte Allianz. |
| **Gegnerischer Siegfortschritt (1.19)** | Warnung vor sichtbarem Landfortschritt eines Gegners/Teams, wenn die offizielle Schwelle und der Nenner bekannt sind. Nur Kandidatenpriorität, keine Umgehung von Sicherheitsregeln. |
| **Entscheidungs-Timeline (1.19)** | „Warte, weil …“, verworfene Ziele, Alternativen und Operationsergebnisse im Panel „Gegneranalyse & Operationen“ und im Diagnose-JSON. |

**Wichtige Fehlerkorrekturen seit 1.18.4:** Alliierte oder ausgeschiedene Spieler werden aus gespeicherten Fronten entfernt; ein Gegner mit *bekannt* null Heimtruppen wird nicht pauschal verworfen (ausgehende Angriffe werden berücksichtigt); der Nuklearplaner prüft vor dem Abschuss den aktuellen Freundstatus und den Kollateralbereich nochmals. Ein Sicherheitscheck des Scripts ist keine Garantie für ein bestimmtes Spielergebnis.

## Panel, Diagnose und Live-Monitor

Im Bot-Panel findest du Status, Automatik, Neural-Opt-in und lokales Browser-Lernen, Gegneranalyse, Operationen, 2v2-Fokus, Sieg-Frühwarnung und die letzten Entscheidungen. **„Diagnose JSON“ vor Neuladen/Matchwechsel exportieren**; dort sind Profile, Operation, letzte Timeline-Einträge, Matchzustand und tatsächlich beobachtete Ausführungen dokumentiert.

Für eine lokale Live-Monitor-Ansicht: `Start_Live_Monitor.bat`. Siehe [LIVE_MONITOR.md](docs/LIVE_MONITOR.md). Der sichtbare lokale Browser-Benchmark bleibt ohne Qwen-Berater verfügbar.

## Neural-Modell und Offline-Training

Der Live-Bot benötigt weder einen lokalen Brain-Server noch Qwen, Node.js oder einen Token. Die alten localhost-Brain-/Qwen-Regler wurden aus dem Panel entfernt. Das begrenzte, unabhängige Browser-Lernen über den Schalter „Lernen“ bleibt erhalten: [LEARNING.md](docs/LEARNING.md).

Das experimentelle lokale Training verwendet die **offizielle OpenFront-Engine/GameView**, getrennte Training-/Evaluations-Seeds und überprüfte Modell-/Bot-/Engine-Hashes. Ein Kandidat wird nicht allein wegen hoher Trainingspunkte zum Champion. Vorhandene Ausgabeverzeichnisse dürfen bei Holdouts nicht wiederverwendet werden.

| Einstieg (Windows) | Zweck |
| --- | --- |
| `Start_Training.bat` | Default Schema-3-Trainer gegen Impossible-Nationen; eigener Engine-Checkout `..\OpenFrontIO-Impossible`. |
| `Train_Strategic_Neural.bat` | Schema-4-Strategie mit auswählbarer Nationen-Schwierigkeit Medium/Hard/Impossible. |
| `Train_Multiplayer_Neural.bat 8 FFA` | Schema-4-Harness im Public-FFA-Kontext; vier deterministische scripted Human-Clients. |
| `Train_Multiplayer_Neural.bat 8 Team` | Derselbe lokale Harness im Teamkontext. |

Für die beiden letztgenannten Trainer: Node.js 24, Git und den gepinnten offiziellen Engine-Checkout `..\OpenFrontIO` bereithalten; die Startskripte prüfen/holen den Commit `bb8af015b515b3b717bd4d901074c5f4c16641cb`. Der Trainer kann `--parallel 1..16`, `--schema 3|4` und die dokumentierten Matchparameter verwenden. **Scripted Humans sind Testgegner, keine echten menschlichen Gegner.** Beim Wechsel von Schema, Schwierigkeit oder Matchkontext Ergebnisse nicht ungeprüft paaren. Ein fehlender `champion.json` bedeutet: kein Modell freigegeben.

[Strategische Policy & Training](docs/STRATEGIC_NEURAL_TRAINING.md) · [Benchmarks](docs/BENCHMARKS.md) · [gemessene Beispiel-Läufe](docs/benchmarks/2026-09-20.md)

## Entwickler-Checks

Im Repository mit **Node.js 24**:

~~~bash
node --check OpenFront_Solo_AggroBot.user.js
node tests/strategy-regression.cjs
node tests/autostart-regression.cjs
node tests/learning-regression.cjs
node tests/neural-regression.cjs
node tests/holdout-regression.cjs
~~~

GitHub Actions führt zusätzlich Benchmark- und Offline-Trainer-Prüfungen sowie gepinnte Engine-/Paired-Workflows aus: [Actions](https://github.com/SLP-DEV1/openfront-bot/actions). Ein grüner Workflow oder ein Tick-Limit ist **kein bestätigter Spielsieg**. Ein reiner Engine-Harness ersetzt nicht den öffentlichen Browser mit echten Web-Workern, Latenzen und Menschen.

**Noch offene Abnahme:** [Issue #12 – reproduzierbare vollständige Matches, Browser-Szenarien, Rail-/Attack-Proxies](https://github.com/SLP-DEV1/openfront-bot/issues/12). Alte Versionsnotizen stehen im [README-Archiv](docs/README_HISTORY.md) und sind **keine aktuellen Installationsanweisungen**.
