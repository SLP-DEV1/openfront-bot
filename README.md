# OpenFront Solo AggroBot

**Version 1.19.3** · Tampermonkey-Autopilot für [OpenFront](https://openfront.io/) · Singleplayer, Public und Private · [offene Validierungspunkte](https://github.com/SLP-DEV1/openfront-bot/issues/12)

Der Bot erkennt neue spielbare Matches, wählt bei manuellem Spawn eine Position und steuert Expansion, Verteidigung, Wirtschaft, Flotte, Handel und Diplomatie. Die trainierte Neural-Policy kann optional *begrenzt* mitentscheiden; es gibt keine localhost-Brain- oder Live-Qwen-Anbindung mehr. **Es gibt keine belegte garantierte Impossible- oder Multiplayer-Siegquote.**

## Schnellstart / Update

**1.19.3:** Externen localhost-Brain und Qwen-Live-Berater samt Token/UI aus dem Bot und lokalen Benchmark entfernt. Neural-Policy, Browser-Lernen und eigenständiges Offline-Training bleiben erhalten; das frühere Qwen-Trainingsreview wurde anschließend ebenfalls entfernt. Ein möglicherweise noch laufender alter Brain-Prozess wird durch ein Git-Update nicht automatisch beendet.

**1.19.2 – Korrekturen aus der NYC-Diagnose:** Eingehende Friedensangebote können bei militärischem Druck trotz aktivem Konflikt angenommen werden. Moderate, anhaltende oder durch starke Gegner gestützte Angriffe geben das Verteidigungsbudget früher frei. Ein zentrales Befehlsjournal unterscheidet korrelierte Bot-Angriffe von Angriffen ungeklärter Herkunft. Details und Prüfgrenzen: [Diagnosekorrekturen 1.19.2](docs/DIAGNOSE_FIXES_1.19.2.md).

**1.19.1 – Korrekturen aus der Aegean-Diagnose:** SAM-Preise werden auch bei fehlendem Gold aus Worker-Antworten gelesen und angespart. Unbezahlbare Standorte werden nicht als ungültig zwischengespeichert. Bei bezahlbaren, wiederholt abgelehnten SAM-Standorten wird nach 180 Ticks die übrige Wirtschaft freigegeben; die Suche läuft weiter. Akute Bodenangriffe sperren neue Wirtschafts-/Hafenbauten einschließlich Upgrades. Neue Seelandungen pausieren nach jüngsten Gebiets-/Gebäudeverlusten oder bei beobachteten eingehenden Nukes. Sichtbare Kriegsschiffe entlang eines geraden Routenkorridors erfordern örtliche Begleitung; dieser Korridor ist nur eine Näherung an den tatsächlichen Weg. Zielübernahme und mindestens 120 Ticks gehaltener Brückenkopf werden getrennt protokolliert. Hafenbesitz allein erzeugt kein Marineprofil; neue Profile beginnen mit geringer Konfidenz. Details und Prüfgrenzen: [Diagnosekorrekturen 1.19.1](docs/DIAGNOSE_FIXES_1.19.1.md).

1. Repository aktualisieren: `git pull --ff-only` (nur bei sauberem lokalen Arbeitsbaum; eigene nicht versionierte Dateien vorher sichern). Für den normalen Browser-Betrieb sind nur Browser und Tampermonkey nötig.
2. Den **gesamten Inhalt von [OpenFront_Solo_AggroBot.user.js](./OpenFront_Solo_AggroBot.user.js)** in Tampermonkey installieren bzw. das vorhandene Skript damit aktualisieren. Bei einem privaten Repository funktioniert ein anonymer GitHub-Raw-Autoupdate-Link nicht verlässlich.
3. Alte Solo-AggroBot-Userscripts deaktivieren, damit nicht zwei Instanzen gleichzeitig Befehle senden. Falls parallel der Spawn Advisor 10.4.0 läuft: dort Auto-Spawn, Smart Attack und Auto-Accept Alliances deaktivieren.
4. [openfront.io](https://openfront.io/) neu laden und eine Partie öffnen. **Auto-Start ist standardmäßig an**: Nach Erkennung von spielbarem Spielzustand und EventBus startet der Bot auch in Public/Private automatisch. Replays und unbekannte Modi bleiben gesperrt. Einsatz- und Lobbyregeln beachten.

**Bedienung:** `Alt+Shift+P` startet/pausiert; `Alt+Shift+X` ist der Not-Aus und deaktiviert zusätzlich Auto-Start, bis du ihn wieder im Panel einschaltest. Eine gewöhnliche Pause gilt bis zum nächsten Match. Der Bot kann schon während der Spawnphase reagieren; bei Zufallsspawn kann er keine Position auswählen.

**Varianten:** [Neural W](./OpenFront_Solo_AggroBot_Neural_W.user.js) entspricht der normalen World-Eröffnung, [Neural O](./OpenFront_Solo_AggroBot_Neural_O.user.js) verwendet die ältere 1000-Tick-Eröffnung. Die Namen bedeuten **nicht**, dass schon ein trainiertes Champion-Modell mitgeliefert wird. Die drei Userscripts werden aus einer Quelle über `node tools/generate-neural-variants.cjs` synchronisiert; `--check` prüft Abweichungen.

## Was der Bot aktuell kann

| Bereich | Verhalten und Grenzen |
| --- | --- |
| **Vollautomatik** | Dynamische Aggressivität, Truppenreserve, Aktionen/Minute und Zielprüfungen. Manuelle Slider bleiben gespeichert; Notverteidigung und zulässige Aktionen haben Vorrang. |
| **Eröffnung & Wirtschaft** | Auto-Spawn, sichere neutrale Expansion, Bau/Upgrades von Städten, Fabriken, Häfen und Schutzgebäuden; Standort- und Goldprüfung vor dem Intent. |
| **Kampf & Schutz** | Hauptfront, eingehende Angriffe, Rückzüge, SAMs, Raketensilos, Nukes und konservativer Freund-/Allianzschutz – nach asynchronen Worker-Abfragen erneut validiert. |
| **Marine & Handel** | Transport-/Landungsplanung, Kriegsschiffe, frühe Häfen, Bahn-/Schiffseinnahmen und begrenzte Unterstützung von Teampartnern. Gesendete Befehle sind nicht automatisch bestätigte Erfolge. |
| **Gegnerprofile (1.19)** | Früher Angreifer, Wirtschaftsaufbauer, Gelegenheitsangreifer, Marinefokus oder unbekannt. Nur sichtbare Beobachtungen **dieser Partie**; angezeigte Sicherheit ist eine Heuristik, keine kalibrierte Wahrscheinlichkeit. |
| **Operationen (1.19)** | Ziel, Einsatzzweck, Truppenbudget, Gebietskriterium, Frist und Abbruchgrund. Bestehende Reserve, Diplomatie und Worker-Legalität gelten zusätzlich. |
| **Ranked 2v2 (1.19)** | Partnerfront, Ziel, Hilfebedarf und eigene Bereitschaft aus *beobachtetem* Spielzustand. **Kein direkter Bot-zu-Bot-Nachrichtenkanal** und keine angenommene Zustimmung des Partners. |
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
node tools/generate-neural-variants.cjs --check
node tests/strategy-regression.cjs
node tests/autostart-regression.cjs
node tests/learning-regression.cjs
node tests/neural-regression.cjs
node tests/holdout-regression.cjs
~~~

GitHub Actions führt zusätzlich Benchmark- und Offline-Trainer-Prüfungen sowie gepinnte Engine-/Paired-Workflows aus: [Actions](https://github.com/SLP-DEV1/openfront-bot/actions). Ein grüner Workflow oder ein Tick-Limit ist **kein bestätigter Spielsieg**. Ein reiner Engine-Harness ersetzt nicht den öffentlichen Browser mit echten Web-Workern, Latenzen und Menschen.

**Noch offene Abnahme:** [Issue #12 – reproduzierbare vollständige Matches, Browser-Szenarien, Rail-/Attack-Proxies](https://github.com/SLP-DEV1/openfront-bot/issues/12). Alte Versionsnotizen stehen im [README-Archiv](docs/README_HISTORY.md) und sind **keine aktuellen Installationsanweisungen**.
