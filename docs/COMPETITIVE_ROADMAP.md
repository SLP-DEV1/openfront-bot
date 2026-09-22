# AggroBot: Multiplayer-/Duo-Umbau — lebender Fortschrittstracker

> **Master-Issue:** [#75 – Gesamtübersicht](https://github.com/SLP-DEV1/openfront-bot/issues/75) · **[Vollständiger eingereichter Entwicklungsplan](COMPETITIVE_PLAN_2026-09-22.md)** (neun Abschnitte einschließlich Befunde, Architektur, P0–P6, Messverfahren und Quellen).  
> **Erstellt:** 22.09.2026. Ursprüngliche Analyse: Commit `10e81ee` / 1.20.8; beim Anlegen des Trackers war das GitHub-Hauptskript laut README **1.20.9**; zwischenzeitlich wurde **1.20.10** mit Action-Trace erstellt. **Keine neue Gesamt-Testausführung** für 1.20.9 wurde für diese Plananlage durchgeführt.

## Aktueller Umsetzungsstand – Teilpaket 1.20.11 (22.09.2026)

**Keine der sieben Gesamtphasen ist abgenommen.** Der historische
1.20.8-Analysebefund und die früheren simulierten/nativen Testergebnisse
bleiben als historischer Stand sichtbar. Die folgenden Änderungen sind
kleine, einzeln prüfbare Schritte; ein vollständiger Live-Duo-/Holdout-
Vergleich liegt noch nicht vor.

| Phase | In diesem Paket umgesetzt | Nachweis / weiterhin offen |
| --- | --- | --- |
| **P0** | Run3 aus dem aktuellen 1.20.11-Hauptskript mit **unverändertem 1.000-Gewichte-Champion** synchronisiert; Syntax/Quellparität und Relay-Payload gezielt geprüft. | [Bundle-Commit](https://github.com/SLP-DEV1/openfront-bot/commit/c7632f342e2e2835305e5272b5cf1acbc5d7be3f); gesamter nativer CI-/Engine-Nachweis und Triage der bestehenden Fehler offen. |
| **P1** | Worker-Grenzergebnis bei Match-/Spielerwechsel oder mehr als 40 Ticks Verzögerung verwerfen, statt alte Ziele als aktuelle Entscheidung auszuführen. | [Quelländerung](https://github.com/SLP-DEV1/openfront-bot/commit/4a947b633c971573a408b2c5254c40473bc19526), [gezielter Regressionstest](https://github.com/SLP-DEV1/openfront-bot/commit/fc1ef43aa236f9af12dd187e2551921c3b80afd6). Vollständiger Snapshot und Antwortszenarien offen. |
| **P2** | Kontobewegung als **signierte Nettogoldänderung** samt getrennten Bahn-/Schiffszählern erfassen. Käufe/Spenden dürfen nicht als Null-Einkommen umgedeutet werden. | [Quelländerung](https://github.com/SLP-DEV1/openfront-bot/commit/4a947b633c971573a408b2c5254c40473bc19526), [Regression](https://github.com/SLP-DEV1/openfront-bot/commit/fc1ef43aa236f9af12dd187e2551921c3b80afd6). Vollständige Transaktionszuordnung und Grenznutzen offen. |
| **P3** | Beobachteten Gebietsfortschritt mit Zeit und explizit **nicht kausalem** Beleg speichern; experimentell lange untätige Operation nach Schutzprüfung freigeben. | [Quelländerung](https://github.com/SLP-DEV1/openfront-bot/commit/8689669a9dc2b2227a4161ca5e8295662842be50), [gezielter Test](https://github.com/SLP-DEV1/openfront-bot/commit/fbc6e245b1060f7e24c0679b38d1b8e736c63a40). Default-Regel bleibt unverändert; Kampfsimulation/Kalibrierung offen. |
| **P4** | Duo-Plan erhält eine deterministische **Beobachtungs-ID**, Angriffstick und begrenztes Ablaufdatum im Relay; ungültige Laufzeiten werden abgewiesen. | [Bot/Plan](https://github.com/SLP-DEV1/openfront-bot/commit/8689669a9dc2b2227a4161ca5e8295662842be50), [Relay](https://github.com/SLP-DEV1/openfront-bot/commit/eac21058803e63a00f469e5f0d71ff012e8198a2), [Validierung](https://github.com/SLP-DEV1/openfront-bot/commit/47f6fb15516259f4e41751b2fbacce7eef2385ed). Plan-ID derzeit **Diagnose, kein verbindlicher gegenseitiger ACK**; zwei vollständige Clients offen. |
| **P5** | Embargo nur bei **beobachteten** eigenen/eingehenden Kämpfen statt bloßer Kriegsabsicht; eigene Bot-Embargos nach Ende der Kämpfe wieder öffnen. | [Quelländerung](https://github.com/SLP-DEV1/openfront-bot/commit/4a947b633c971573a408b2c5254c40473bc19526), [gezielter Test](https://github.com/SLP-DEV1/openfront-bot/commit/fc1ef43aa236f9af12dd187e2551921c3b80afd6). Handelssimulation, Marine-ETA und Einkommenswirkung offen. |
| **P6** | Reproduzierbares Experiment-Manifest mit Commit-/Options-/Quell-/Bundle-/Champion-Hashes, Match als Stichprobeneinheit und ausdrücklich unbekanntem Ausgang. | [Generator](https://github.com/SLP-DEV1/openfront-bot/commit/c0d40984fb1be45a2d78be30d0b18e41cbeea254), [Tests](https://github.com/SLP-DEV1/openfront-bot/commit/9fe60ca6a96ddb0a76c0153701e87ad9d9f99648), [Protokoll](EXPERIMENT_PROTOCOL.md). Kein Matchrunner, keine Gegnerliga oder neue Siegnachweise. |

**Gezielte lokale Test-Auswertung dieses Teilpakets:** drei neue
P1/P2/P5-Fälle und zwei P3-Fälle im isolierten JavaScript-Test-Harness
bestanden; Syntax beider Userscripts, aller geänderten JS-Dateien,
bytegleiche Run3-Ableitung und Relay-Planvalidierung geprüft.
Der vollständige native `node tests/strategy-regression.cjs`-Lauf
und echte Engine-/Multiplayer-Spiele **sind damit nicht ersetzt**.
Die CI führt jetzt auch den Manifest-Test aus; ein grüner neuer
Workflow-Durchlauf ist erst nach GitHub-Resultat belegt.

## P1 – Entscheidungssnapshot auf aktuellem 1.20.11-Stand (PR #77)

- Unveränderlicher, rein diagnostischer `decisionFrame` hält aktuelle Rohtruppen, Reserve, Gold (BigInt-sicher), Land, beobachtete Gegner und bestätigte Duo-ID fest; keine neue Aktionsfreigabe.
- Bestehender Worker-Stale-Guard bleibt der einzige Guard und verwirft ab **mehr als 20 Ticks** sowie bei zurückliegendem Tick oder gewechseltem Player; Notverteidigung bleibt vor dem await.
- Snapshot wird in der periodischen Diagnose erfasst und beim Match-Reset gelöscht. Solo und deterministisches Run3-Bundle werden zusammen aktualisiert.
- Regression zu Freeze, Rohwerten, 20-Tick-Grenze, Spielerwechsel sowie bestehendem Guard; vollständige P1- und Live-Duo-Abnahme weiterhin separat.

## Aktualisierung nach PR #77, #79 und #80 — 22.09.2026

- **P0 / #68:** `#79` ist mit erfolgreich abgeschlossenen `Verify AggroBot`, `Impossible Engine Smoke` und `Impossible Paired Evaluation` gemergt; #80 ergänzt den erfolgreichen nativen SAM-90%-Regressionstest. Der verifizierte CI-Stand gilt für die jeweiligen PR-Commits; keine Behauptung eines separaten Live-Zwei-Browser-Duo-Matches.
- **P1 / #69:** `#77` ist nach Rebase und erfolgreichen drei CI-Gates gemergt: gefrorener Diagnose-Frame und ein einzelner 20-Tick-Worker-Stale-Guard. Dieser Folgeschritt markiert zusätzlich `requestedTick`, `tick` (tatsächliche Beobachtung) und `borderAgeTicks`, und exportiert den Frame in der Diagnosedatei. **Kein** vollständiger P1-Abschluss oder Nachweis der 50-ms-P95-Zielgröße.
- **P2 / #70:** SAM-Fonds, City-Cap und erstes Port-Fenster sind durch #79/#80 regressionsgeschützt. Die wirtschaftliche Grenznutzen-/Bauzeit-Evaluation ist weiter offen.
- **P3–P5 / #71–#73:** Teilfixe für Frontabklingen, Worker-Emission, Duo-Planablauf und Readiness sind vorhanden. Echte Zwei-Client-FFA-/2v2-, Gelände-, Marine- und Wirkungs-Nachweise fehlen.
- **P6 / #74:** Experiment-Manifest, Schema-4-Baseline und gepaarte CI-Auswertung sind vorhanden; keine vollständige Gegnerliga, keine reproduzierbare menschliche Replay-Rekonstruktion oder Promotion auf unabhängiger Holdout-Liga.
- **Master #75:** 0/7 *Gesamtphasen* vollständig abgenommen. Dieses Update überschreibt die historischen Abschnitte unterhalb nicht; dort genannte ältere fehlgeschlagene Tests beschreiben nur deren damaligen Commit.

## P5 – zeitlich/lokal begrenzte Marineunsicherheit (Implementierung ohne Matchtests)

- `marineStats.transportUnresolved` bleibt als kumulative **Diagnosezahl**, nicht als globale, niemals auslaufende Freigabesperre.
- Jüngste ungeklärte Landungen gelten höchstens 900 Spielticks und nur im 115-Koordinateneinheiten-Umfeld von Start oder Ziel der aktuell geprüften Route als Eskorte-Hinweis. Nach altem Vorfall oder an einer anderen Küste darf die übrige Marineplanung wieder selbst entscheiden.
- Der vorhandene konservative direkte Warship-Korridor, die 3-Fehler-Pause, Ziel-Cooldowns, aktuelle Invasions- und Allianzprüfungen bleiben erhalten; dies ist **kein** fertiges Wasser-Pathfinding, ETA-Modell oder Brückenkopf-Nachschubsystem.
- **P4 / #72:** Bei getrennten bestätigten Landfronten wird ein eigenständiger, budget-/reservesensitiver Rollenhinweis mit `separatedFronts` und `strikeStatus: independent-fronts` angezeigt. Es wird **kein** gemeinsamer Starttick und keine Angriffsfreigabe ohne die vorhandenen individuellen Engine-/Allianzchecks erzeugt.
- **Auf Nutzerwunsch ohne Langzeit-, Zwei-Client-, Liga- oder Wirkungstests umgesetzt.** Keine Aussage über neue Siegquote, Marineerfolg oder P5-Gesamtabnahme. Der unveränderte Champion wird weiterhin deterministisch gebündelt.

## P0/P6 – langlebiger Live-Monitor (Issue #84, PR #85)

- Der optionale Monitor behält höchstens 48 **aktive** Session-Zustände im Speicher; fertige Matches beziehungsweise 30 Minuten inaktive Sessions dürfen den Arbeitsspeicher verlassen. Ereignisdateien bleiben erhalten. Bei ausschließlich aktiven Sessions antwortet er mit HTTP 503 statt eines fälschlichen 400-Payloadfehlers.
- Eine später wiederaufgenommene Session liest den letzten bestätigten Sequenzzähler und das ursprüngliche Verzeichnis aus `status.json`, damit alte Ereignisse nicht doppelt protokolliert werden. Vollständige ID wird trotz gekürztem Verzeichnis-Hash überprüft.
- Regression für 51 nacheinander beendete Matches bei parallel aktiver alter Session und für Replay/Wiederaufnahme ergänzt. CI-/Integrationsergebnis siehe PR #85; keine Behauptung zu Engine-/Multiplayer- oder gesamten P0/P6-Abnahmen.

## P0/P5 – Marine-Regression nach lokaler Beobachtung (PR #87)

- Der historische Marine-Test hat die frühere globale Sperre durch den kumulativen `transportUnresolved`-Zähler verlangt; der aktuell implementierte Schutz basiert dagegen auf frischen, örtlich zuordenbaren `landingFailure`-Beobachtungen. Die Regression prüft jetzt nahes Risiko, eigene Eskorte, andere Routen und Ablauf nach 900 Ticks.
- [PR #87](https://github.com/SLP-DEV1/openfront-bot/pull/87), [vollständig grüner Verify-Workflow](https://github.com/SLP-DEV1/openfront-bot/actions/runs/35672532125) und [Merge c85b998](https://github.com/SLP-DEV1/openfront-bot/commit/c85b998529fbd70622b1266ef4d981f063a18d1a). Diese Regression ist keine Abnahme des vollständigen P0/P5-Engine- und Multiplayerpakets.

## P4–P6 Implementierungsnachtrag (ohne angeforderte Langzeit-/Wirkungstests)

- **P4 / #72:** `duoTeamDecision()` liefert getrennte Heim-/Partnerbudgets, Reserven, eingehende Angriffe, Rollen `support/defend/joint-attack/independent-front/hold/build` und Begründung. Das ist eine **beratende** gemeinsame Entscheidung, keine zusätzliche Berechtigung zum Senden. Bestätigte Allianz, Frische und lokale Engine-Legalität bleiben maßgeblich.
- **P5 / #73:** `navalRouteEstimate()` sucht begrenzt auf Wasserfeldern mit vier Nachbarn bis zu 1.800 geprüften Feldern und verwendet den berechneten Weg für sichtbare Warship-Nähe. Bei unbekannter Route bleibt die konservative direkte Prüfung. Das ETA-Intervall ist ausdrücklich eine **unkalibrierte Wasserweg-Heuristik**, keine behauptete Engine-Geschwindigkeit oder gesicherte Landungszeit.
- **P6 / #74:** `tools/benchmark/league.cjs` erstellt reproduzierbare Paarungen und kann die vorhandene Engine/GameView-Benchmark nach Profil und skriptgesteuertem Gegnertyp ausführen; jede Partie erhält Seed, Engine-Pin, Bot-Hash und eigenes Ergebnis. **Noch keine Liga aus vollständigen Bot-Gegnern**, kein automatischer Modellaufstieg und keine Siege ohne durchgeführte Partien.
- **Auf Nutzerwunsch wurden keine Langzeit-, Zwei-Client-, Liga- oder Wirkungstests durchgeführt.** Auch P4–P6 sind als Gesamtphasen noch nicht abgenommen.

## Status-Legende und Abnahmeregel

- **Im Code vorhanden:** Ein bereits implementierter Baustein; **nicht** dass die Phase abgeschlossen ist.
- **In Arbeit:** Mindestens ein Teil wurde umgesetzt oder geplant; vollständige Abnahme steht aus.
- **Offen:** Phase als Gesamtpaket bislang nicht abgenommen. Bestehende Einzelbausteine sind im Feld „Vorhanden“ notiert.
- **Abgenommen:** Checkbox im Phasen-Issue nur nach verlinktem Commit, fachlich begründeten Tests und nachvollziehbaren Vergleichsdaten schließen. Keine grünen Assertions durch bloßes Verbiegen der Erwartung.

**Abgenommen: 0/7 Phasen (noch keine neue Abnahme durch diesen Tracker).** Die historische Angabe „265 bestanden / 17 fehlgeschlagen“ stammt ausschließlich von `10e81ee` / 1.20.8 aus dem Originalplan. Sie darf nicht als aktueller CI-Status oder Ergebnis von 1.20.9 erscheinen.

## P0 – erster überprüfter Arbeitsstand (GitHub 1.20.9, 22.09.2026)

- **[Im Code + lokal quellgleich geprüft]** `tools/build-run3-bundle.cjs` erzeugt die Impossible-Run3-Datei deterministisch aus Hauptskript und unverändertem Champion; `--check` ist read-only, `--write` explizit. Commits: [Generator](https://github.com/SLP-DEV1/openfront-bot/commit/4455cd5d2a899cdaa19fb6c77eb7a3917de2f67b), [gemeinsamer Paritätstest](https://github.com/SLP-DEV1/openfront-bot/commit/287f784fdc8f0b4de189747e7f9f4dd41e7cbbdb), [CI-Gate](https://github.com/SLP-DEV1/openfront-bot/commit/dfffda3815001758d828740ee8a4a8620644b9aa).
- **[Geprüft, kein vollständiger CI-Lauf]** Hauptskript und Bundle sind syntaktisch gültig; aus dem gegenwärtig gebündelten 1.000-Gewichte-Modell wird die vorhandene 1.20.9-Run3-Datei **bytegenau** generiert. Die bestehende Bundle-Regression vergleicht zusätzlich mit `champion.json`; der gesamte CI-Job muss noch auf GitHub grün bestätigt werden.
- **[Im Code, Abnahme offen]** Die 1.20.9-Korrektur koppelt Kapazitätsstau an City/Upgrade, nicht Factory. Vorhandene Tests enthalten Kapazitäts- und Russia-Plateau-Fälle. Die zum Live-Commit passende **echte Engine-Kapazitätsprobe** und die fachliche Klassifikation aller historischen Fehler stehen aus.
- **[In Prüfung, noch kein nativer Node-/CI-Nachweis]** [1.20.9-Regressionstriage](P0_REGRESSION_TRIAGE_2026-09-22.md): im nachgebildeten Testlauf 271 grün/19 rot. Drei rote Fälle sind spezifisch für die fehlenden Node-Funktionen/Dateien im Nachbau; 16 Fälle (SAM-, Silo-, Hafen-, Neural-/Duo-Verhalten) sind bewusst **nicht** als Produktfehler oder veraltete Assertions klassifiziert. Native Node- und Engine-Referenzläufe sind noch nötig.
- **[Geprüft]** Das ursprüngliche `champion.json` aus GitHub selbst (Schema 4, 1.000 Gewichte) ergibt mit dem Quellskript 1.20.9 ebenfalls ein **bytegenaues** Run3-Bundle; kein Modellwechsel.
- **[Offen]** Durchgängige Action-/Decision-IDs, reproduzierbares Match-Metadatenprotokoll, vollständiger CI-/Live-Nachweis und die restliche P0-Definition-of-Done.

**Fortschritt und offene Nachweise:** [P0-Issue #68](https://github.com/SLP-DEV1/openfront-bot/issues/68). Die P0-/Master-Checkboxen bleiben bis zur Abnahme bewusst offen.

## P0 – nächste konkrete Umsetzung (GitHub 1.20.10)

- **[Im Code + gezielter Test bestanden]** Jede erfolgreich ausgesendete Bot-Aktion erhält eine pro Match eindeutige `actionId` und eine `decisionId` aus Session und Tick. Angriffe und Bau-/Upgrade-Aufträge führen diese ID in Pending-Status und beobachtete Bestätigung bzw. Nichtbeobachtung weiter. `action` meldet ausdrücklich `effect: unconfirmed`; eine sichtbare Folge ist kein Kausalitätsbeweis. [Implementierung](https://github.com/SLP-DEV1/openfront-bot/commit/6ceced049c7daa61ce4108b9408019a108acd18e), [gezielter Regressionstest](https://github.com/SLP-DEV1/openfront-bot/commit/e522d3f1e2c639acb8184c2c7c46cae6e1baf121), [neues Neural-Bundle](https://github.com/SLP-DEV1/openfront-bot/commit/8f1515c3f3034d573604cc5a437262ff0290db01).
- **[Im isolierten V8-Nachbau, nicht nativem Node]** 291 vorhandene Strategieregressionen durchlaufen: 272 bestanden, 19 fehlgeschlagen. Davon sind zwei durch die simulierte Laufzeit (`setImmediate`, `../tools/match-report.cjs`) nicht ausführbar; 17 weitere Fälle bleiben offen. Das ist **kein aktueller grüner CI-Nachweis** und keine fachliche Entwarnung; insbesondere SAM-/Silo-/Port-Konkurrenz, Neural-Ranking, README-Erwartung und Duo-Termin noch einzeln mit unverfälschtem Node/Engine-Test klassifizieren.
- **[Syntax/Parität jeweils separat nachprüfen]** Die reguläre und die Run3-Datei tragen 1.20.10 und Run3 wurde aus demselben Quellskript mit dem unveränderten Schema-4-Champion synchronisiert. GitHub Actions und lokal vollständiger `node tests/bundled-run3-regression.cjs` sind noch nicht nachgewiesen.
- **[Referenzformel geprüft, integrierter Engine-Test offen]**
  [`tests/capacity-reference-regression.cjs`](../tests/capacity-reference-regression.cjs)
  prüft die Formel aus dem zu den Exporten passenden offiziellen
  [Config.ts-Commit](https://github.com/openfrontio/OpenFrontIO/blob/7c27263390d8f1976566e5c5ad9adf6fcad311b6/src/core/configuration/Config.ts#L1021):
  fertiggestellte City-Level erhöhen die Kapazität um je 250.000
  Engine-Truppen bei Humans, Factory/Port und unfertige Cities nicht.
  Der Russia-Fall mit 13.044 Feldern und einem City-Level ergibt
  **939.219 Engine-Truppen** nach Rundung. Der isolierte
  V8-Referenztest bestand; das ist **kein ausgeführtes echtes
  OpenFront-Engine-Szenario**. [Testcommit](https://github.com/SLP-DEV1/openfront-bot/commit/7a3fddbf5714efc9feb22f0ae302e0949c96bf56).
- **[Offen]** Der Action-Trace deckt nicht automatisch alle Spenden-/Schiffs-/Nuke-Wirkungsnachweise ab. Auch Quell-/Optionshash, tatsächliche Engine-Szenarien, historische Regressionstriage und zwei vollständige Bot-Clients fehlen weiterhin. **P0 bleibt offen.**

## Phasenstatus – die zentrale Abarbeitungsansicht

| Phase | Status | Schon vorhanden / begonnen | Noch offen bis „fertig“ | Aufgaben |
| --- | --- | --- | --- | --- |
| **P0 · Referenzstand & Mechanik** | **In Arbeit; nicht abgenommen** | 1.20.9 beschreibt City-/City-Upgrade statt Factory für Kapazität; Bundle-Regression und CI-Datei existieren. | Fehlgeschlagene Fälle fachlich klassifizieren; Engine-Szenarien gegen passendes Commit, Bundle-/Modellhash, Adapter und Aktionswirkungsnachweis prüfen. | [#68](https://github.com/SLP-DEV1/openfront-bot/issues/68) |
| **P1 · Zustand, Reserve & Entscheidung** | **Offen** | `military`, `frontPressureForecast`, Gegnerbeobachtung, Schutzregeln und Aktionsranking existieren. | Konsistenter Snapshot, mehrere Reaktionsszenarien, Risiko + Stillstandskosten gemeinsam werten; Prognosegüte und Laufzeit nachweisen. | [#69](https://github.com/SLP-DEV1/openfront-bot/issues/69) |
| **P2 · Wirtschaft & Eröffnung** | **Offen** | City-Kapazitätskorrektur laut 1.20.9; Wirtschaft, Port/Bahn, Spawn und Einkommensbeobachtung existieren. | Jede Investition nach tatsächlichem Grenznutzen, Bauzeit, Erreichbarkeit und Kosten nachweisen; Ausgaben/Einnahmen korrekt trennen. | [#70](https://github.com/SLP-DEV1/openfront-bot/issues/70) |
| **P3 · Taktik & Initiative** | **Offen** | Angriffsprognose, Operationsplan, Folgewellen, Verteidigung und Rückzugsansätze existieren. | Mehrere echte Operationsoptionen, Reaktionszeiten, Stagnation, Abbruch und gehaltene Wirkung kalibrieren. | [#71](https://github.com/SLP-DEV1/openfront-bot/issues/71) |
| **P4 · Duo als gemeinsamer Entscheider** | **Offen** | Localhost-Relay, Partnerkennung, abgestimmte Fronten, Verteidigungswarnung und Spenden/Hilfe laut 1.20.8. | Plan-ID und Ablauf, Budgetwirkung, getrennte Fronten, Rollen, verzögerte Nachrichten und **zwei vollständige Bot-Clients** belegen. | [#72](https://github.com/SLP-DEV1/openfront-bot/issues/72) |
| **P5 · Marine, Technik & Diplomatie** | **Offen** | Häfen/Schiffe, SAM/Nukes, Allianz- und Embargo-Intents sowie automatischer Hafenhandel laut 1.20.8. | Reichweite/ETA, Schutz- und Handelswirkung, Allianzwechsel, echte Landung und Wirkung 120/600 Ticks prüfen. | [#73](https://github.com/SLP-DEV1/openfront-bot/issues/73) |
| **P6 · Gegnerliga & Lernen** | **Offen** | Trainer, Neural-Schema-4-Modell, Holdouts und ein Engine-Harness sind vorhanden. | Vollständige Gegner/Partner, Engine-Pins, Replay-Zustände, gepaarte Holdouts und Modell-Promotion gegen Regelbasis nachweisen. | [#74](https://github.com/SLP-DEV1/openfront-bot/issues/74) |

**P0-Hinweis:** City/Factory als Codeänderung ist nicht identisch mit einer vollständigen historischen oder aktuellen Engine-Abnahme. Die fehlenden oder lokalen Belegdateien des eingereichten Reports wurden **nicht** durch das bloße Einchecken des Plans zu Repository-Artefakten.

## Abhakbare Übergaben – globale Qualitäts-Gates

- [x] Vollständigen eingereichten Plan als historisches Dokument unverändert abgelegt: [COMPETITIVE_PLAN_2026-09-22.md](COMPETITIVE_PLAN_2026-09-22.md).
- [x] Für P0–P6 getrennte [Issues #68–#74](https://github.com/SLP-DEV1/openfront-bot/issues/75) mit jeweiligen Checkboxen, Abnahmekriterien und Originalabschnitten angelegt.
- [x] Gesamtübersicht über [Master-Issue #75](https://github.com/SLP-DEV1/openfront-bot/issues/75) eingerichtet.
- [ ] P0: auf **demselben festgehaltenen Commit** alle relevanten Regressionen laufen lassen; jeden Fehlschlag klassifizieren (Produktfehler / alte Erwartung / ungenügende Simulation).
- [ ] P0: Bundle-Parität, tatsächlichen Modellhash und gleiche Spielregeln in beiden Userscripts automatisiert prüfen.
- [ ] P0: City erhöht Kapazität in einem passenden Engine-Szenario; Factory allein tut dies nicht; Russia-Kapazitätsplateau nachstellen.
- [ ] Zwei vollständig getrennte AggroBot-Clients in derselben Engine-Partie mit FFA-Allianz und 2v2 testen; [bestehendes Match-Gate #12](https://github.com/SLP-DEV1/openfront-bot/issues/12) nicht durch rein simulierte Einzel-Tests ersetzen.
- [ ] Jede größere Strategieveränderung gegen eingefrorene Regelbasis und Neural-Aus/An vergleichen, mit Seed, Karte, Spieleranzahl, Engine/Modell/Bot-Version und Konfiguration.
- [ ] Ergebnisse mit tatsächlich gehaltenem Land, Wirkung, Verlusten und unbestätigten Aktionen bewerten – nicht nur gesendete Intents oder Überlebensdauer.

## Entwicklungsreihenfolge aus dem Originalplan

| Paket | Umfangsschätzung **aus dem eingereichten Plan**, keine Lieferzusage |
| --- | --- |
| P0 Regressionen, Bundle, Gebäudemechanik | 2–4 Arbeitstage |
| Zwei vollständige Clients, passende Engine, Aufzeichnung | 3–6 Arbeitstage |
| Kapazität und wirtschaftlicher Zusatznutzen | 3–6 Arbeitstage |
| Gemeinsame Aktions-/Reservebewertung | 5–10 Arbeitstage |
| Duo-Rollen und Hilfewirkung | 3–6 Arbeitstage |
| Marine, Technik, Diplomatie | 5–10 Arbeitstage |
| Gegnerliga, Replays, Lernen und Evaluation | zunächst 1–3 Wochen |

Für die tatsächliche Abarbeitung ist **P0 die erste Abnahme**, auch wenn bereits Code für P2/P4/P5 existiert. Nach jedem fachlich abgeschlossenen Teil diesen Tracker und die zugehörige Issue-Checkbox aktualisieren. Die Reihenfolge der vollständigen Phasen kann von den parallel laufenden Teilpaketen abweichen, muss dann aber anhand von Tests begründet werden.

## Gemeinsames Mess- und Auswertungsprotokoll

1. Referenz vor Tests einfrieren: vollständiger Bot-Commit, Hash beider Userscripts, Modellhash/Regelbasis, Engine-Pin, Optionen, Karte, Größe, Gegner und Spawn/Seed.
2. Reproduzierbares Szenariopaket, dann im Originalplan vorgeschlagen etwa **20 gepaarte vollständige Engine-Spiele** als frühes Gate; für einen ernsthaften Vergleich **mindestens 100 gepaarte Begegnungen pro gewähltem Kernformat** als Ausgangspunkt, je nach Streuung mehr.
3. Getrennte Berichte für **1v1, offizielles 2v2 und FFA**; FFA-Duo-Allianz ist kein offizielles Teamsieg-Signal. Zwei Partnerexports derselben Partie zählen als **ein Match**.
4. Tick-Limit als zensiert/offen kennzeichnen, nicht als Sieg. Gehaltenes Land/Einnahmen, ungenutzte Kapazität, gehaltene Brückenköpfe, beobachtete Transferwirkung, Prognosefehler und relevante Reaktionszeit messen.
5. Neurale Änderungen nur mit eigener Baseline, gefrorenem Training-/Validierungs-/Holdout-Split und Promotion-Gate übernehmen; Daten alter Engine-/Bot-Versionen nicht als aktuelle Siegquote ausgeben.
6. Bei fehlender Engine-Rekonstruktion Replays nur als Hypothesenquelle behandeln, nicht als vollwertige Zustands-/Aktions-Trainingspaare.

## P0 Native-Audit zum Einsammeln der echten Fehlermeldungen

**Neu:** [`tools/p0-audit.cjs`](../tools/p0-audit.cjs) ist ein
schreibgeschützter Teststarter für Node 24. Er führt Syntax-, Bundle-,
Strategie-, Duo-, Neural-, Benchmark- und weitere Repository-Suiten
einzeln aus, speichert **jede** stdout/stderr-Ausgabe als eigene
`.log` und schreibt Hashes der wichtigsten Dateien sowie
`git status --porcelain` in `report.json`.
Sein eigener Report sagt ausdrücklich `engineMatchesExecuted:false`
und `fullMultiplayerMatchesExecuted:false`; ein isolierter
Unit-Testlauf ist keine echte Match-Abnahme.

```powershell
# Im getrennten, sauberen Git-Worktree mit Node 24
node tools/p0-audit.cjs
# Der angezeigte Ordner liegt unter benchmark-results/p0-audit-...
```

**Status:** Der Starter wurde auf Syntax geprüft und eingecheckt,
aber nicht in einer vollständigen lokalen Node-Arbeitskopie ausgeführt.
Seine tatsächlichen Testausgaben stehen deshalb noch aus. Bei
fehlgeschlagenen Prüfungen wird ein Exit-Code 1 gesetzt; bereits
gesammelte Logs und report.json bleiben erhalten. Bitte den
Original-WIP-Ordner nicht durch reset/clean gefährden.

## Direkt ausführbare Repository-Prüfungen (im **sauberen** Arbeitsordner)

```powershell
node --check OpenFront_Solo_AggroBot.user.js
node --check OpenFront_AggroBot_Impossible_Run3.user.js
node tests/strategy-regression.cjs
node tests/bundled-run3-regression.cjs
node tests/duo-relay-regression.cjs
node tests/neural-regression.cjs
node tests/neural-v2-regression.cjs
node tests/benchmark-regression.cjs
```

Die Liste beschreibt **auszuführende** Checks, nicht in dieser Roadmap neu ausgeführte Tests. Weitere Gates stehen in [CI verify.yml](../.github/workflows/verify.yml).

## Git-Hinweis: lokaler Stand ≠ GitHub-`main`

Der lokale Windows-Ordner enthält laut letzter PowerShell-Meldung geänderte und unversionierte Dateien. Der Commit in `origin/main` sagt nichts darüber aus, welche davon in der lokalen Qwen-/Trainings-Arbeitskopie fertig sind. **Kein** `git reset --hard`, `git clean -fd` oder blindes `git pull`. Für den Abgleich nach `git fetch origin` ein separates Worktree oder eine gezielte, überprüfte Zusammenführung verwenden; vor dem Merge die lokalen WIP-Dateien sichern/committen.

## Quellen und Grenzen

- [Originalanalyse mit vollständigen Befunden, Phasen, Abnahme und Quellen](COMPETITIVE_PLAN_2026-09-22.md), geprüft auf `10e81ee` / 1.20.8.
- [OpenFront-Engine Config.ts zum Diagnosecommit](https://github.com/openfrontio/OpenFrontIO/blob/7c27263390d8f1976566e5c5ad9adf6fcad311b6/src/core/configuration/Config.ts#L1021) für die City-/Kapazitätsannahme.
- [Aktueller README](../README.md), beim Erstellen dieser Seite 1.20.9.
- [Bereits bestehendes Match-Validierungsissue #12](https://github.com/SLP-DEV1/openfront-bot/issues/12); [PlayerID-vs-smallID-Issue #16](https://github.com/SLP-DEV1/openfront-bot/issues/16).
- Der Plan nennt `docs/COMPETITIVE_PLAN_EVIDENCE_2026-09-22.json` und lokale Diagnose-JSONs. **Diese Evidenzdatei war beim Anlegen dieses Trackers nicht im GitHub-Repository gefunden;** sie darf nicht als veröffentlichter Beleg bezeichnet werden.

**Nächster konkreter Schritt:** [P0 #68](https://github.com/SLP-DEV1/openfront-bot/issues/68) auf dem aktuellen, isolierten Git-Stand nachmessen, die früheren 17 Fehlschläge fachlich zuordnen, Bundle/Engine-Pin prüfen und dann die tatsächliche Arbeit an P1/P2 priorisieren.
