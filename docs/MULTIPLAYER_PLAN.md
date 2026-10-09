# Plan: AggroBot gegen menschliche Spieler

Stand: 20.09.2026. Grundlage ist der lokale, bereits veränderte Arbeitsstand von `OpenFront_Solo_AggroBot.user.js`, Version **1.18.0**, auf Git-HEAD `101be8d4b9e4e2ace855d67d5c159f8a69b0e71a`. Die folgenden Zeilenangaben beziehen sich auf diesen Arbeitsstand. Dieser Plan ändert keine Spiellogik.

## Aussagekraft der Prüfung

Die Befunde unten sind durch Lesen des Codes belegt. Die Auswirkungen auf menschliche Gegner sind Hypothesen, die gezielt geprüft werden müssen. Es wurde für diese Prüfung kein Match gestartet, kein Spiel bedient und keine neue Testserie ausgeführt.

Der vorliegende Export `%USERPROFILE%/Downloads/OpenFront_AggroBot_1.15.0_Diagnose.json` stammt aus Singleplayer/Medium, erstellt am 20.09.2026 um 14:13:18 MESZ, Zwischenstand Tick 3651. Er enthält kein `gameEnd`. Er belegt 14 `build_stalled`, 13 `build_confirmed`, vier bestätigte Transporte, eine bestätigte Ankunft und drei ungeklärte Transportausgänge. Das sind Hinweise für Messung und Diagnose; weder sind drei versenkte Transporte bewiesen, noch ist damit ein Fehler von Version 1.18.0 nachgewiesen. Die README beschreibt ältere Public-Matches, ist aber bei der aktuellen Versionsangabe noch auf 1.15.0.

## Vorhandene Stärken erhalten

- `attack()` prüft nach asynchroner Worker-Abfrage Truppen, Allianz und Kriegsziel erneut (2110).
- `confirmAttack()`, `pendingEconomy()` und `inspectMarine()` unterscheiden Befehle von beobachteter Ausführung (1476, 2195, 3312).
- `adversaryWindow()` und `opponentTrend()` berücksichtigen Drittkriege und länger anhaltende gegnerische Schwäche (1127, 1170).
- `emergencyRetreat()` reagiert vor der asynchronen Grenzabfrage; `fleetDefense()` kann Transporte abfangen (2027, 3413).
- `allyAssistTarget()`, `teamSupport()` und `renewAlliances()` existieren bereits (1631, 3505, 3532).
- Neuronale Empfehlungen sind begrenzt; im geprüften Hauptskript ist `NEURAL_BUNDLED_MODEL = null` (37).

Der nächste Schritt ist, diese Bausteine konsistent zusammenzuführen und unter passenden Bedingungen zu messen.

## Priorisierte Änderungen

### 1. P0 – Multiplayer-Kontext und gemeinsame Risikoprüfung

**Belegt:** `hardMode()` hängt an `difficulty === 'Impossible'` (403). `observeFronts()` kehrt andernfalls sofort zurück (1308). Der zusätzliche Mehrfrontschutz in `military()` und `frontRiskPlan()` erfordert außerdem teilweise `impossibleExperiment`, standardmäßig aus (1346, 1643). `coordinatedWar()` hängt dagegen allein an `opts.impossibleMode` (406). Der Schwierigkeitsregler steuert damit mehrere unterschiedliche strategische Eigenschaften.

**Hypothese:** In einer Lobby mit Menschen und einem anderen Nationen-Schwierigkeitsgrad fehlen Schutzmechanismen gegen mehrere Gegner; dieselbe Menschenkonstellation kann abhängig von der KI-Einstellung anders behandelt werden.

**Plan:** Einen gemeinsamen Match-Kontext aus FFA/Team, menschlichen Gegnern, Nationen, Karte, Spielphase und sichtbaren Bedrohungen bilden. Frontgedächtnis und Prüfung des verbleibenden Heeres unabhängig vom Nationen-Schwierigkeitsgrad machen. Vor Landangriff, Transport, Truppenspende und größerer Verstärkung dieselbe aktuelle Risikoprüfung verwenden. Die experimentellen Impossible-Koeffizienten dabei nicht ungeprüft übernehmen.

**Abnahme:** Identische sichtbare Menschenfronten erhalten bei verschiedenen Nationen-Schwierigkeitsgraden dieselbe grundlegende Schutzentscheidung. Ein zeitgleich eintreffender Angriff oder Allianzwechsel während einer Worker-Abfrage verhindert eine inzwischen ungeeignete Aktion. Sichere neutrale Expansion bleibt in passenden Szenarien möglich.

### 2. P0 – Entscheidungen vollständig erklären und Versionen zuordnen

**Belegt:** `rankedTargets()` verwirft Kandidaten über zahlreiche frühe Rückgaben, ohne jeweils einen strukturierten Ablehnungsgrund zu speichern (1799). `snapshot` wird regulär erst alle 80 Ticks erzeugt (in `step()`, 3775). Die alte Diagnose und der aktuelle Code haben verschiedene Versionen.

**Plan:** Je Entscheidungszyklus die besten wenigen geprüften Alternativen einschließlich Halten protokollieren: Ziel, beobachtete Stärke, Informationsalter, Einsatz, verbleibende Truppen, Risikogrund, Ablehnungsgrund und Prognoseverfahren. Bei Gefahr und neuen Aktionen zusätzliche Ereignisse erzeugen; unveränderte Wiederholungen zusammenfassen. Export um Skript-Hash, Modell-Hash, Match-ID, FFA/Team, aktive Profile und verfügbare Datenfelder ergänzen. Fehlende Beobachtungen als unbekannt kennzeichnen. Start und Ende des Datenstroms eindeutig quittieren.

**Betroffen:** `telemetry()` (413), `diagnosticSnapshot()` (468), `rankedTargets()`, `attack()`, `naval()`, Monitor-Skript und `tools/live-monitor.cjs`.

**Abnahme:** Für jeden gesendeten Befehl lässt sich die zugehörige Entscheidung finden. Für längere Untätigkeit ist erkennbar, welches Kriterium Aktionen verhindert. Transportverlust, Ankunft und unbekannter Ausgang bleiben getrennt. Speicher und Ereignisrate bleiben begrenzt.

### 3. P1 – Gegnerverhalten und Mehrfrontdruck bewerten

**Belegt:** `observeOpponents()` speichert hauptsächlich einen aktuellen und einen vorherigen Messpunkt, mit regulärem Abstand von 90 Ticks. `military()` orientiert sich wesentlich am stärksten Nachbarn. `frontPressureForecast()` addiert einen begrenzten Anteil des zweitstärksten Gegners. Ein längerfristiges Modell gegnerischer Angriffswellen oder Bündniswechsel ist hier nicht vorhanden.

**Plan:** Pro Gegner einen begrenzten Verlauf sichtbarer Angriffe, Rückzüge, Truppenänderungen, Gebietsänderungen und Allianzereignisse führen. Mehrere Zeitfenster nutzen: unmittelbare Welle, jüngster Konflikt, längerfristige Entwicklung. Tatsächliche Feindseligkeit stärker gewichten als bloße Nachbarschaft. Gemeinsame Angriffe zunächst als zeitliche Korrelation behandeln; daraus keine sichere Absprache ableiten. Reserve für plausible gleichzeitige Angriffe, Rücklauf gegnerischer Verbände und sichtbare Spenden neu bewerten.

**Betroffen:** `observeOpponents()` (1144), `opponentTrend()` (1170), `observeFronts()`, `frontPressureForecast()` (1327), `military()`, `rememberHostilePressure()` (1398), `defenseAssessment()` (1989).

**Abnahme:** Zwei zeitversetzte Angriffswellen führen nicht zu einer großen Offensive in der kurzen Lücke. Ein friedlicher starker Nachbar verursacht keine dauerhafte Blockade. Nach einer nur scheinbaren Schwäche durch ausgehende Truppen berücksichtigt der Bot deren mögliche Rückkehr.

### 4. P1 – Begrenzte Kriegsziele und kontrollierter Ausstieg

**Belegt:** `targetOpportunity()` verwirft Gegner mit null Heimtruppen durch `!(troops > 0)` (1669). `rankedTargets()` lässt grundsätzlich keinen weiteren normalen Gegnerangriff bei einem aktiven Gegnerverband zu. `manageWar()` hält ein Hauptziel über feste Zeitfenster; ein Teil der früheren Neubewertung ist experimentell (1529). `attackForecast()` schätzt anhand einer Stichprobe, teils mit Näherungswerten, und bewertet keine vollständige zukünftige Schlacht (1194).

**Hypothese:** Der Bot kann günstige kurze Chancen verpassen und an einer unprofitablen Front festhalten. Reine Stärkeverhältnisse unterscheiden zu wenig zwischen einem begrenzten Gebietsziel und einer vollständigen Eroberung.

**Plan:** Operationen mit Zweck, Einsatzlimit, gewünschtem Ergebnis, Prüfzeitpunkt und Abbruchgrund einführen. Beispiele: wirtschaftlich wertvolles Gebiet gewinnen, einen Angreifer entlastend zurückdrängen oder ein tatsächlich schwaches Ziel ausschalten. Null Heimtruppen als eigenen Fall prüfen, unter Berücksichtigung ausgehender Verbände, Rekrutierung, Drittfronten und Worker-Legalität. Verstärkungen anhand des laufenden Gefechts bewerten. Zielwechsel erst nach Prüfung gebundener Truppen und anderer Fronten freigeben.

Die vorhandenen Landangriffe adressieren einen Spieler, keine frei wählbare lokale Angriffsroute. Gebäudenähe ist daher ein Nutzenhinweis und kein Beleg, dass genau dieses Gebäude gezielt erobert werden kann.

**Betroffen:** `targetOpportunity()`, `rankedTargets()`, `attackForecast()`, `attack()` (2110), `evaluateLastBattle()` (1426), `manageWar()`.

**Abnahme:** Kein pauschaler Ausschluss eines lebenden Gegners mit null Heimtruppen. Eine festgefahrene Offensive erhält eine dokumentierte Entscheidung zwischen Fortsetzung, Verstärkung, Rückzug und Neubewertung. Jede Entscheidung berücksichtigt den Zustand nach dem geplanten Einsatz.

### 5. P1 – Diplomatie und Teamentscheidungen nach Nutzen

**Belegt:** `diplomacyScore()` lehnt das aktuelle Kriegsziel und aktive Konfliktpartner grundsätzlich ab (3138). Damit fehlt dort ein Pfad für einen sinnvollen Friedensschluss. `renewAlliances()` reagiert auf vorhandene Verlängerungsanfragen (3532). `teamSupport()` wählt zunächst den Partner mit der größten absoluten eingehenden Truppenzahl und prüft danach seine Bedürftigkeit (3505).

**Hypothese:** Ein schwacher, akut gefährdeter Teamkollege kann übersehen werden, wenn ein großer Verbündeter einen absolut größeren, relativ harmlosen Angriff erhält. Ein verlorener Krieg kann diplomatisch unnötig fortgesetzt werden.

**Plan:** FFA-Allianzen nach gesicherter Grenze, wirtschaftlichem Nutzen, Ablauf und verbleibenden Expansionsmöglichkeiten beurteilen. Einen ausdrücklichen Friedenspfad mit Abwicklung laufender Angriffe ergänzen; die bestehenden Allianzprüfungen bei neuen Angriffen erhalten. Verlängerungen vorausschauend prüfen, soweit die Spielschnittstelle dies unterstützt. Teamhilfe nach relativer Notlage, erwarteter Wirkung, eigener Tragfähigkeit und Teamziel ordnen. Die Entscheidung zwischen Truppen- und Goldhilfe aus dem konkreten Bedarf ableiten.

**Abnahme:** Im Szenario mit großem ungefährdetem und kleinem gefährdetem Partner wird die wirksame Hilfe gewählt. Frieden kann einen aussichtslosen Konflikt beenden, ohne dass veraltete Angriffsabsichten anschließend weitergesendet werden. Hilfe wird nach beobachteter Ausführung bewertet.

### 6. P2 – Expansion und Wirtschaft nach erreichbarem Nutzen

**Belegt:** `targetsFromBorder()` gruppiert neutrale Ziele zusammen (1243). `economicNeeds()` leitet viele Gebäude-Sollzahlen aus eigenem Land und festen Schwellen ab (2344); Einnahme- und Investitionsbewertungen ergänzen diese bereits. `lateGame()` nutzt feste Tick-/Landgrenzen (1281).

**Plan:** Eröffnungsphasen stärker aus Platzangebot, Gegnerkontakt, Wirtschaftsstand und Truppenfüllstand ableiten. Bei Spawn und Marine erreichbaren Raum, Küstenzugang und neue gegnerische Kontakte bewerten. Für Landexpansion nur solche räumlichen Unterschiede nutzen, die die echte Angriffsschnittstelle steuern kann. Bau und Upgrade anhand zusätzlichem Ertrag, Rekrutierungsnutzen, Bauzeit, Standortverlust und konkurrierenden Investitionen vergleichen. Fehlende Handelseinnahmen zunächst auf Beobachtungsdauer und Verbindungszustand prüfen.

**Betroffen:** `spawnScore()` (831), `neutralAttackAmount()` (1293), `economicNeeds()`, `investmentValue()` (2328), `siteScore()` (2572), `sampleIncome()` (1109), `lateGame()`.

**Abnahme:** Auf Karten mit und ohne verlässlichen Handel entstehen unterschiedliche wirtschaftliche Entscheidungen. Gebäude werden nicht ausschließlich zur Erfüllung einer Quote gekauft. Eroberter Raum bleibt über mehrere Messpunkte erhalten; reine kurzzeitige Flächenspitzen zählen nicht als Erfolg.

### 7. P2 – Marineoperationen bis nach der Landung planen

**Belegt:** `landingThirdPartyRisk()` prüft vier direkt benachbarte Felder des Ziels (3624). `naval()` bewertet eine Landung vor allem über aktuelle Truppenverhältnisse und erreichbare Küsten (3636). `fleetDefense()` sucht für ein Abfangen einen eigenen Kriegsschiffkandidaten innerhalb einer Distanzgrenze (3413); diese Auswahl beweist keine rechtzeitige Ankunft.

**Plan:** Sichtbare Feindflotten, erreichbare Abfangwege, geschätzte Reisezeit, erwartete Rekrutierung während der Fahrt und den Raum um den Brückenkopf einbeziehen. Ziel nach einer Worker-Umleitung erneut strategisch bewerten. Landung mit anschließendem Halten oder Verstärken verbinden. Mehrere feindliche Transporte nach Ankunftsrisiko ordnen. Reisezeit nur als Schätzung ausweisen, solange keine belastbare Route vorliegt.

**Betroffen:** `naval()`, `navalCommitmentRatio()` (3618), `landingThirdPartyRisk()`, `inspectMarine()` (3312), `fleetDefense()`.

**Abnahme:** Szenarien mit Zielwechsel, neuer Allianz, gegnerischer Erholung während der Fahrt und zwei gleichzeitigen Landungen bestehen. Erfolg bedeutet bestätigte Landung plus gehaltenes Gebiet nach einem definierten Zeitraum; reine Transportbefehle zählen nicht.

### 8. P2 – Führende Gegner und Team-Sieg stärker berücksichtigen

**Belegt:** `victoryPlan()` berechnet eigenen beziehungsweise Team-Fortschritt und Zeitdruck (1071). Es fehlt dort eine entsprechende Fortschrittsbewertung der gegnerischen Spieler und Teams. `nukeTargets()` bewertet bereits Infrastruktur und verbündete Kollateralrisiken (2896).

**Plan:** Sichtbaren Siegesfortschritt und Wachstum der führenden gegnerischen Seite ergänzen. Zwischen eigenem Abschluss, Verteidigung des Vorsprungs und Verhindern eines nahen gegnerischen Sieges unterscheiden. Landkrieg, Wirtschaft, Marine und Nuklearziele auf denselben Zweck ausrichten. Ein führender Gegner darf dabei nicht automatisch jede riskante Aktion rechtfertigen.

**Abnahme:** In einem Szenario mit fast siegreichem Gegner wird dessen Fortschritt in der Entscheidung berücksichtigt, auch wenn ein schwächerer anderer Gegner leichter anzugreifen wäre. Teamfortschritt und eigener Fortschritt bleiben getrennt messbar.

### 9. P3 – Lernen erst auf geeigneter Datengrundlage

**Belegt:** `learnKey()` (208) und `brain/learning.cjs:contextOf()` (18) unterscheiden Modus und Bedrohung, aber weder FFA/Team noch Menschen/Nationen oder Kartenfamilie. `tools/benchmark/engine-match.mjs` setzt Singleplayer/FFA und deaktiviert Spenden (39). `trainer/evaluation.cjs` paart nach Schwierigkeit, Karte, Nationenzahl und Seed (10); die Promotionslogik erlaubt auch konsistente Überlebensverbesserungen ohne zusätzliche Siege.

**Plan:** Lernkontexte und Modellmetadaten nach Spielmodus, Gegnerzusammensetzung und Kartenfamilie trennen. Alte Erfahrungen versionieren und nicht als Multiplayer-Nachweis übernehmen. Den Engine-Harness um mehrere steuerbare Spieler, Teamregeln und Spenden erweitern. Unterschiedliche Testgegner verwenden: früher Angreifer, Wirtschaftsaufbauer, geduldiger Verteidiger, Gelegenheitsangreifer, Marinefokus und abgestimmtes Team. Diese simulieren Verhaltensweisen, ersetzen aber keine Menschenversuche. Neue Modelle zunächst nur mitprotokollieren und gegen die Regelentscheidung vergleichen.

**Abnahme:** Keine gemeinsame Qualitätskennzahl für Singleplayer, FFA und Team. Auswertungen kennzeichnen Sieg, Niederlage, abgebrochene und zeitlich begrenzte Matches separat. Promotion und Dokumentation benennen korrekt, ob Siegquote oder lediglich Überlebenszeit verbessert wurde.

## Umsetzung und Nachweis

1. **Erste Lieferung:** Match-Kontext, gemeinsame Risikoprüfung, Entscheidungsdiagnose. Dazu gezielte Regressionen für mehrere Menschenfronten, veraltete Worker-Ergebnisse und dieselbe Lage bei unterschiedlichen Nationen-Schwierigkeiten.
2. **Zweite Lieferung:** Gegnerverlauf, begrenzte Kriegsziele, Nulltruppen-Fall, Friedenspfad und bedarfsgerechte Teamhilfe. Jede Änderung separat gegen die Ausgangsvariante vergleichen.
3. **Dritte Lieferung:** Wirtschafts-, Marine- und Siegplanung. Je Teilgebiet Szenarien hinzufügen, in denen die bisherige Heuristik eine konkrete Schwäche zeigt.
4. **Vierte Lieferung:** Breitere Engine-Vergleiche und private Testpartien mit menschlichen Mitspielern. Erst danach Multiplayer-Modelle trainieren und kontrolliert übernehmen.

Für reproduzierbare Engine-Vergleiche denselben Engine-Commit, Karte, Spawnbedingungen, Gegnerprofile und Seed verwenden; Trainings- und Prüfgruppen trennen. Die Paaridentität um Bot-/Modellversion, Teamkonfiguration und Gegnerprofile ergänzen. Bestehende Strategieregressionen erweitern, statt den gesamten Bot umzuschreiben.

Bei Menschenpartien verändern Erfahrung und Reaktionen den Ablauf: Derselbe Seed allein ergibt keinen sauberen Paarvergleich. Varianten deshalb in wechselnder Reihenfolge mit vergleichbaren Mitspielern und Bedingungen testen. Ein erster Pilot kann aus etwa 20 abgeschlossenen FFA- und 20 Team-Partien insgesamt bestehen; er dient zum Finden grober Fehler und ist kein ausreichender Beleg für kleine Siegquotenverbesserungen. Für belastbare Aussagen anschließend die Stichprobe anhand der beobachteten Streuung und gewünschten Verbesserung planen.

Vor jeder Vergleichsserie Erfolgsgrößen festlegen: bestätigte Siegquote mit Unsicherheit, frühe Ausscheidungen, gehaltenes Land, Wirkung von Teamhilfe, Landungsqualität, Blockadezeiten trotz geeigneter Kandidaten und Laufzeit der Entscheidungsschleifen. Timeout- und Abbruchquote zusätzlich offen ausweisen, damit eine Variante mit vielen unvollständigen Partien nicht besser erscheint. Ein Sicherheitskriterium bleibt: keine neuen Aktionen gegen inzwischen verbündete Spieler und keine Überschreitung des zum Sendezeitpunkt geltenden gemeinsamen Einsatzbudgets.

**Empfohlener Start:** Zuerst die Lieferung 1 und anschließend Kriegsabschluss/Teamhilfe umsetzen. Mehr Aggression oder ein größeres neuronales Netz allein adressieren die belegten Lücken nicht.
