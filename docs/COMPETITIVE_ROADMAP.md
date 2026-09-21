# AggroBot: Multiplayer-/Duo-Umbau — lebender Fortschrittstracker

> **Master-Issue:** [#75 – Gesamtübersicht](https://github.com/SLP-DEV1/openfront-bot/issues/75) · **[Vollständiger eingereichter Entwicklungsplan](COMPETITIVE_PLAN_2026-09-22.md)** (neun Abschnitte einschließlich Befunde, Architektur, P0–P6, Messverfahren und Quellen).  
> **Erstellt:** 22.09.2026. Ursprüngliche Analyse: Commit `10e81ee` / 1.20.8; beim Anlegen des Trackers war das GitHub-Hauptskript laut README **1.20.9**; zwischenzeitlich wurde **1.20.10** mit Action-Trace erstellt. **Keine neue Gesamt-Testausführung** für 1.20.9 wurde für diese Plananlage durchgeführt.

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

## P1 – experimenteller Entscheidungsframe (Branch 1.20.11, noch nicht gemergt)

- **[Im separaten Branch, nicht abgenommen]** `decisionFrame()` hält für
  einen Entscheidungszyklus ausschließlich unveränderliche Rohwerte von
  Heimtruppen, Reserve, Incoming, Gold, Land, nachweislich sichtbaren
  Gegnern und der aktuell bestätigten Duo-ID fest. Das ist zunächst
  **Beobachtung/Diagnose**, keine neue Angriffsberechtigung.
- **[Sicherheitskorrektur]** Wenn die asynchrone Grenz-Worker-Abfrage
  über 20 Spielticks alt zurückkommt, bricht der Kampfzyklus ab; ein
  frischer Zyklus wertet die Lage neu. Bestehende Notverteidigung vor
  der Worker-Abfrage bleibt bestehen. Diese Schwelle ist zunächst
  experimentell und benötigt Laufzeitmessungen in echten Matches.
- **[Gezielt getestet]** Standalone-V8-Probe: immutable Frame, rohe
  Truppen-/Goldwerte, gültiger Zustand bis 20 Ticks und Ablehnung
  älterer/vordatierter Frames. Hauptskript, Run3 und Testdatei bestehen
  JavaScript-Syntax; Run3 ist auf diesem Branch quellgleich mit
  dem unveränderten 1.000-Gewichte-Champion.
- **[Noch offen]** Ein vollständiger nativer Node-/CI-Lauf, wirkliche
  Mehrfrontszenarien, mehrfache gegnerische Reaktionsmodelle,
  Wirkung von „Halten“ und die gesamte P1-Abnahme. Bestehende
  P0-Regressionsfehler bleiben dadurch unverändert offen. Die Branch-
  Änderungen nicht als Nachweis eines Multiplayer-Siegs ausgeben.

**Branch:** [feature/competitive-p1-decision-frame-20260922](https://github.com/SLP-DEV1/openfront-bot/tree/feature/competitive-p1-decision-frame-20260922).
**P1-Issue:** [#69](https://github.com/SLP-DEV1/openfront-bot/issues/69).

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
