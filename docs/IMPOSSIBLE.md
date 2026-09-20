# Impossible Counterplay – Entwicklungsstand und Messplan

## Implementiert in 1.12.0
- Neue Front-Risikoplanung: Spielerangriffe berücksichtigen andere, nicht verbündete Nachbarn und eingehende Angriffe. Ein überwältigender anderer Grenznachbar blockiert Nebenoffensiven.
- Die Front-Risiko- und Reserveprüfung erfolgt erneut nach asynchronen Worker-Legalitätsanfragen.
- Neutrale Expansion bei Bedrohung nur mit kleinem, begrenztem Truppeneinsatz.
- Hafen-Suchplanung startet nach acht erfolglosen Versuchen nach 800 Spiel-Ticks erneut, statt für die gesamte Partie auszusetzen.
- Neue Regressionen für Mehrfronten-Schutz, billige neutrale Expansion und Hafen-Wiederanlauf.

## Reproduzierbare Impossible-Matrix
tools/benchmark/impossible-matrix.mjs führt über den bestehenden offiziellen GameRunner/GameView-Adapter Singleplayer-Partien mit Difficulty Impossible aus.
Standard: World/Compact, eine/vier/acht Impossible-Nationen, keine kleinen Bots, drei Seeds.
Für Vergleichspaare werden identische Seed-, Karten- und Gegnerkonfigurationen mit separat angegebenen alter und neuer Userscript-Datei ausgeführt.
Nur bei bestätigtem game-over/eliminated und victory/defeat zählt ein Lauf als abgeschlossen. Ticklimits und Prozessfehler bleiben unvollständig.

Trockenlauf: node tools/benchmark/impossible-matrix.mjs --dryRun true
Messlauf: node tools/benchmark/impossible-matrix.mjs --engine ../OpenFrontIO --baseline baseline.user.js --candidate OpenFront_Solo_AggroBot.user.js --nations 1,4,8 --bots 0 --seeds impossible-101,impossible-102,impossible-103 --out benchmark-results/impossible-compare-01

## Ungeprüfte und offene Schritte
Der existierende Harness ist auf Engine-Commit 13b403387af01d388f8c8ed8c953b6d3a11d1457 fixiert. Der aktuell untersuchte offizielle Impossible-Code kann neuer sein. Für belastbare Tests gegen die aktuelle Nation-KI müssen die GameView-Adapter zuerst auf deren Commit aktualisiert und dann alle Vergleichspaare auf demselben Commit wiederholt werden.
Hier wurde kein vollständiger Engine-/Browser-Match durchgeführt. Eine höhere Siegquote oder garantierter Sieg gegen Impossible ist nicht nachgewiesen.
Langfristige Frontenplanung, die nächste Generation der Küsten-/Marine-Strategie und direkte Qwen-Policy-Steuerung sind nicht abgeschlossen. Qwen bleibt ausdrücklich Shadow; Modelltext sendet keine Game-Intents.
Ziele wie 90/100 Duellsiege oder 80 % FFA-Siege sind Abnahmekriterien und keine gemessenen Ergebnisse.
