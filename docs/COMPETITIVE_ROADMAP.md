# AggroBot: Multiplayer-/Duo-Umbau — lebender Fortschrittstracker

> **Master-Issue:** [#75 – Gesamtübersicht](https://github.com/SLP-DEV1/openfront-bot/issues/75) · **[Vollständiger eingereichter Entwicklungsplan](COMPETITIVE_PLAN_2026-09-22.md)** (neun Abschnitte einschließlich Befunde, Architektur, P0–P6, Messverfahren und Quellen).
> **Erstellt:** 22.09.2026. Ursprüngliche Analyse: Commit `10e81ee` / 1.20.8; beim Anlegen des Trackers war das GitHub-Hauptskript laut README **1.20.9**; zwischenzeitlich wurde **1.20.10** mit Action-Trace erstellt. **Keine neue Gesamt-Testausführung** für 1.20.9 wurde für diese Plananlage durchgeführt.

## P0 — kanonischer DecisionFrame mit Horizon-Auflösung (1.21.2, 23.09.2026)

**[Im Code + lokaler Test + CI bestanden]** Umsetzung des P0-
Teils der neuralen/learning-Planungsgrundlage ([plan.md](../plan.md)) auf dem
aktuellen 1.21.2-Stand:

- **Kanonischer DecisionFrame:** `planningState` trägt pro Planungstick
  `decisionId` (gleiche Kennung, die `send()` auf jede Aktionszeile stempelt),
  `matchId`, `clientId`, `dataAge`/`missingMask` (Maskierung statt 0),
  `provenance` (Bot-Version, Engine-Commit, GameMode), `modelChoice`/
  `modelScores` (Shadow-only), `actualIntents`, `blockReasons`,
  `actionReceipt`, `observedEffects`, `outcomeStatus`, `resolved`.
- **Verworfene Kandidaten:** `rejectedCandidates` (maximal die 7 nach dem
  gewählten Kandidaten) werden erfasst; sie tragen **keine** Wirkungslabel.
- **Horizont-Auflösung:** `resolveDecisionFrames(tick)` verknüpft Frame und
  `actionLedger` über `decisionId`; Wirkungshorizont 120, Auflösungshorizont
  600 Ticks. Nicht erreichte Horizonten bleiben `unknown`/`censored` und
  werden nie 0 gesetzt. Frames sind auf die letzten 16 begrenzt und werden in
  der Diagnose als `decisionFrames` exportiert.
- **Reine Diagnose:** kein neuer Freigabe- oder Sperre-Pfad. Einzige sichtbare
  Änderung: die Feind-Liste des Status-Fields blendet Teamkollegen aus
  (`isOnSameTeam`), wie von P0 gefordert.
- **Nachweis:** `tests/decision-frame-regression.cjs` (Fixture auf dem
  gebündelten Solo-Skript: Kandidaten + echte Wahl + bestätigte Wirkung
  verknüpft; abwesende Wirkung bleibt `unknown`) als eigener CI-Schritt in
  `verify.yml`. `build-userscript.cjs --check`, `build-run3-bundle.cjs --check`
  und `bundled-run3-regression.cjs` bestanden; der **unveränderte** Schema-4-
  1000-Gewichte-Champion bleibt im Run3-Bundle (Champion-SHA geprüft).
- **Weitere Anpassungen in diesem PR:** `tests/live-monitor-regression.cjs`
  verwendet pro Lauf neue Session-IDs (der Monitor behandelt die Festplatte
  als maßgeblich), damit der Test auf lokalen Checkouts idempotent bleibt.

[PR #136](https://github.com/SLP-DEV1/openfront-bot/pull/136) ist mit allen
fünf Workflows auf dem PR-Head erfolgreich: [Verify
AggroBot](https://github.com/SLP-DEV1/openfront-bot/actions/runs/35804282936)
(inklusive des neuen DecisionFrame-Schritts), [Deterministic
Scenario
Pack](https://github.com/SLP-DEV1/openfront-bot/actions/runs/35804282974),
[Full-Bot FFA League
Smoke](https://github.com/SLP-DEV1/openfront-bot/actions/runs/35804282988),
[Impossible Paired
Evaluation](https://github.com/SLP-DEV1/openfront-bot/actions/runs/35804283020)
und [Impossible Engine
Smoke](https://github.com/SLP-DEV1/openfront-bot/actions/runs/35804283090).
Gemergt als [27f785a](https://github.com/SLP-DEV1/openfront-bot/commit/27f785a).

**Nicht durchgeführt (ausdrücklich):** echte Engine-/Multiplayer-Matches mit
DecisionFrame-Daten, lange Beobachtungshorizonte in realen Partien und die
Statistik über `outcomeStatus`. P0 als Gesamtphase damit **nicht**
abgenommen; siehe [#68](https://github.com/SLP-DEV1/openfront-bot/issues/68) und [#75](https://github.com/SLP-DEV1/openfront-bot/issues/75).

## P1 — versionierte, überprüfbare Gegner-Archetypen (23.09.2026)

**Implementiert + Tests bestanden + echte Engine-Matches (FFA- und 2v2-Smoke) ausgeführt.** Kernlücke von P1 („nicht nur denselben Bot unter zehn Namen bzw. Sliderwerten starten"):

- **Gefrorene Archetypmenge `archetype-v1`:** `legacy`, `rush`, `turtle`,
  `economy`, `naval`, `opportunist`, `diplomat`, `nuke`, `duo`, `champion`
  sind in `common.cjs` und `src/userscript/00-bootstrap.js` identisch
  definiert. `archetypePolicy()` ändert die **Kandidaten-Rangfolge** des
  Planers (Angriffs-Timing-Gate, Nutzenverschiebungen, Neu-Rangfolge des
  schwächsten Ziels, erzwungene Subsysteme) — `legacy`/`duo`/`champion`
  sind der exakte Basiswert ohne Zusatzpolitik.
- **Pro-Client-Wahl und Signatur:** der Archetyp wird pro Bot-Client über
  das Bridge-`start()`-Feld `archetype` (whitelist-gesetzt) und je
  `engine-multibot.mjs`-Lineup gesetzt. `archetypeSignature()`
  (`plannedTicks`, `firstAttackTick`, `selectedByKind`,
  `weakestTargetFraction`) wird in `diagnosticSnapshot` und damit in
  `match.json → fullBots[].diagnostics` protokolliert.
- **Tests bestanden:** `tests/archetype-regression.cjs` (6/6) belegt auf dem
  realen Bundle die exakte gefrorene Politik, den Legacy-Fallback, das
  Timing-Gate (turtle hält @300, greift @700 an), die erzwungenen
  Subsysteme und die pro-Tick-Plannerwahl. P0-Test (`decision-frame-
  regression.cjs`, 3/3), Solo-/Run3-Builds und Duo-Relay-Tests weiterhin grün.
- **Echte Engine-Matches bestanden (Smoke):** gegen den gepinnten
  Engine-Checkout `13b403387af01d388f8c8ed8c953b6d3a11d1457` wurden ein kurzer
  FFA-Lauf (2 Partien, `legacy` vs `rush`) und ein kurzer 2v2-Lauf (2 Partien,
  `duo`/`legacy` vs `rush`/`turtle`, vier vollständige Bot-Clients) mit
  `tools/benchmark/league.cjs` ausgeführt. Die Logs belegen **unterschiedliche
  Strategien und Spielzustand**: bei identischem Seed/Profil/Ticks zeigt
  `selectedByKind` pro Client andere Verteilungen (2v2, 124 Planungsticks:
  `duo` {naval 88}, `legacy` {hold 88, naval 33}, `rush` {hold 121},
  `turtle` {invest 102}). Artefakte (lokal, gitignored):
  `benchmark-results/p1-smoke-ffa-run/` und
  `benchmark-results/p1-smoke-2v2-run/`.
- **Nachweis, keine Spielstärke-Behauptung:** Die kurzen Läufe sind
  nachweislich ausgeführte **Smoke**, keine breite Liga und keine lange
  Partie; sie begründen keine Spielstärke- oder Siegquote-Veränderung.

**Weiterhin offen in P1** (nächster kleinster Schritt): Allianz-/Diplomatie-
Szenarien mit garantiert aktuellen (nie veralteten) Freund/Feind-Beziehungen
im Smoke; 1v1/2v2/FFA-Protokoll mit Karten-/Position-/Partner-/Profil-/Seed-
Rotation; Freeze jedes Profil-/Archetyp- und Liga-Snapshots (Legacy/Champion
behalten); die vollständige deterministische Szenario-Paket-Liste
(Cap-Stall, zerstörte City, zusammenbrechendes Einkommen, Einkesselung,
Angriffs-Lücke/War-Lock, fehlendes Boot, zweiter Angreifer, gebrochene
Partner-Zusage, Nuke-/SAM-Risiko, Team-Spende unter Heimbedrohung); strikte
Trennung `--smoke` vs echte volle Liga (Teilweise: Smoke hat feste
Bedingungen). Reale Human-Multiplayer-Abnahme bleibt separat.

## P2 status — Menschliche Replays als korrektes Curriculum (DoD bestanden, 23.09.2026)

**DoD bestanden. Implementiert + Tests bestanden (lokal, grün); echte
Engine-Matches: P2 arbeitet auf sichtbaren Replay-Frames, keine neuen
Multi-Bot-Läufe nötig.**

- **Import-Gate (bereits vorhanden, DoD-Kern):** `tools/benchmark/replay-cli.cjs`
  + `replay-visible-state.cjs` akzeptieren nur Frames mit exakt passendem
  Engine-Pin, sichtbarem `GameView` und gültigen Anfangs-/Aktionsdaten.
  Abgewiesene Frames bleiben unverbindliche **Szenarioideen**
  (`scenarioIdeas[]`), keine Lernpaare; akzeptierte Frames sind
  `kind:'learning-pair'`.
- **10 Event-Tags mit Provenienz** (`tools/benchmark/replay-events.cjs`):
  `early-rush`, `alliance-change`, `counterattack`, `nuke-timing`,
  `naval-landing`, `duo-synchronized`, `retreat`, `rebuild`, `hold`,
  `failed-attack` — jedes Tag trägt `source`, `tick`, `observation`,
  `validity` (`observed`/`inferred`); nur sichtbare Signale, keine
  Engine-Wahrheiten; deterministisch.
- **Per-Partie-Split** (`tools/benchmark/replay-split.cjs`): nahe Frames
  derselben Partie kommen nie auf Train+Holdout; die Zuordnung hängt nur von
  `(seed, matchId)` ab, nie vom Frame-Inhalt (keine versteckten Features);
  deterministisch; stärkere Trennung pro Spieler/Stil via `keyOf`.
- **Provenienz + Zustimmung/Nutzungsrecht** (`replay-visible-state.cjs`,
  `replay-cli.cjs`): `origin:'human-replay'` wird nur mit Provenienz
  (z. B. `gameID`/`clientID`) **und** Nutzungsrecht akzeptiert; sonst Abbruch.
- **Tests bestanden:** `replay-events`, `replay-split`, `replay-curriculum`,
  `replay-visible-state`, `replay-cli` (lokal grün).
- **BLOCKER (Daten):** aktuell genau **ein** menschliches Replay
  (ProfessorSployer `cR8SRtEEcR`). Mehrere Spieler mit Siegen **und**
  Niederlagen sind noch zu sammeln. „Menschliches Verhalten gelernt" wird
  erst ab dieser Datengrundlage behauptet. Inventar + Policy:
  [docs/replays/README.md](replays/README.md).

## P3 status — Schema-5-Prototyp wirklich trainieren (DoD bestanden, 23.09.2026)

**DoD bestanden. Implementiert + Tests bestanden (lokal, grün); keine echten
Engine-Matches mit trainierten Labels (das ist P4); kein Live-Deployment durch
Training allein.**

- **Feature-Audit + Runtime-Parität** (`trainer/v5-features.cjs`): die 32
  Schema-5-Inputs werden gegen den echten Runtime-Frame
  (`src/userscript/20-military-and-planning.js`) geprüft. **13 Features sind
  aktiv verfügbar, 19 sind konstant** und werden mit ihrem Baseline-Wert aus
  `features({},{})` gemaskt. Neue featurisierte Schema-Version
  `featuredSchemaVersion=1` mit index-aligned Manifest. Die Trainingsfeatures
  sind per Konstruktion identisch zu `candidate.features` (Runtime-Parität).
  Nachweis: `tests/v5-features-regression.cjs`.
- **Targets operationalisiert** (`trainer/v5-labels.cjs`): `heldGain` =
  beobachteter territorialer Nettoeffekt im festen Horizont relativ zum
  Ausgangszustand (`clamp01`/`landScale`); `lossRisk` = vorab definierte
  beobachtete Verlust-/Eliminations-/Abbruchereignisse. Beide sind separate
  Heads. Nicht erreichte Horizonte bleiben `null` (Unbekannt ≠ 0). Für
  Replay-Imitation: separates `behaviorChoice`-Label mit `selectionBias`-
  Kennzeichnung. Nachweis: `tests/v5-labels-regression.cjs`.
- **Deterministischer Training-/Checkpoint-/Resume-Pfad**
  (`trainer/train-v5.cjs`): full-batch Gradientenabstieg ohne RNG; analytischer
  Gradient gegen Finite Differenzen abgeglichen (≈7e-12); per-match disjunkte
  Trainings-/Validation-Splits (keine Frame-Leakage); Checkpoint pro Epoche;
  `--resume` reproduziert die Vollausführung mit **identischer Modell-SHA**.
  Shape/Schema validiert (702 Gewichte, \|w\|≤5, endlich); Kalibrierung in
  Bins; Null-/Regel-/Mean-Ablation; `learning-curve.json` (Validierungsloss,
  nie Trainingsperformance als Holdout-Gewinn). Nachweis:
  `tests/train-v5-regression.cjs`.
- **Shadow-Anbindung ohne Intent-Änderung** (`tests/v5-shadow-regression.cjs`):
  ein trainiertes Schema-5-Modell wird über `trainer/shadow-deploy.mjs` an das
  existierende Shadow-Ranking angebunden; das eingebettete Modell ist exakt das
  trainierte (SHA-geprüft), `SHADOW_V5_BUNDLED_MODEL=null` wird ersetzt, der
  Shadow-Block bleibt `changedIntent:false` und der Promotion-Pfad
  (Schema-4-Champion) bleibt unverändert.
- **Reproduzierbares Modellfile mit SHA:** das geschriebene `model.json`
  validiert als Schema-5-Kandidat; `candidate.sha(model)` ist über CLI und
  In-Memory identisch.
- **Tests bestanden (lokal, grün):** `tests/v5-features-regression.cjs`,
  `tests/v5-labels-regression.cjs`, `tests/train-v5-regression.cjs`,
  `tests/v5-shadow-regression.cjs`. Neu in der CI als P3-Schritt in
  `verify.yml`.

**Weiterhin offen in P3 (nächster Schritt P4):** outcome-basiertes
Fine-Tuning auf echten Engine-Ligapartien; reale Human-Multiplayer-Abnahme.
Eine neuere 48→64→32→3=5315-Architektur wird erst bei belegtem Underfitting
gesondert versioniert geprüft (hier **nicht** durchgeführt). Echte
Engine-Matches mit trainierten Labels sind **nicht** behauptet.

## P4 status — Curriculum, Liga, Self-Play und Collapse-Wächter (DoD bestanden, 23.09.2026)

**DoD bestanden. Implementiert + Tests bestanden (lokal, grün); reale
protokollierte Engine-Läufe auf unterschiedlichen Gegnerstilen; dokumentierte
fehlschlagende Kategorie; keine Ableitung aus einer einzelnen „leichten" Liga.**

- **Gefrorene, gestufte Gegnerliga** (`tools/benchmark/curriculum.cjs`): 6
  Stufen (Mechanik/Niedrig-Gegner → 1v1 gegen Champion → Öko-/Marine-/
  Nuke-Spezialisten → FFA → 2v2/Team → gemischte FROZEN-E-Liga) mit je eigenen
  Opponent-/Seed-/Modus-/Schwierigkeits-/Tick-Konfigurationen. Der
  **FROZEN-E Gegner-Mix** nutzt den Run3-Champion-Bot + Legacy + mehrere ältere
  Archetyp-Stile (`mixArchetypes` mit 7 Stilen, `mixVersion`-Hash) **gegen den
  separaten Solo-Modell-Bot** — nicht ausschließlich das jeweils jüngste eigene
  Modell (Overfitting-/Collapse-Vermeidung). Der Plan-Modus (Default) schreibt
  nur `curriculum.json` (18 Matches, 6 Stufen); `--execute` spielt aus.
  Nachweis: `tests/curriculum-regression.cjs`.
- **Collapse-Wächter über alle 8 Kategorien** (`trainer/collapse-watch.cjs`):
  deterministische Erkennung auf echten Diagnostic-Feldern für passives
  `HOLD`-Spamming, blindes Rushen, Goldhorten, ausbleibenden City-Bau,
  Allianzfehler, endlosen War-Lock, scheinbar sichere reine Überlebensstrategie
  und fehlerhafte Marine-ETAs. `teamMode` wird über
  `benchmarkMeta.gameConfig.gameMode` entschieden (FFA-Lineups tragen
  trotzdem `teamIndex` 0/1 → nicht als Team-Signal verwenden). Nachweis:
  `tests/collapse-watch-regression.cjs`.
- **Trainings-/Suchsignal von Promotion getrennt** (P4.5,
  `trainer/collapse-watch.cjs` `assessPromotion`): das **bestätigte
  Match-Ergebnis** ist das release-entscheidende Signal
  (`confirmed-<outcome>`); bei Tick-Limit wird der Outcome als **zensiert**
  behandelt (`censored-tick-limit`, nicht entscheidend). Gehaltene Land-,
  wirtschaftliche, Verlust- und Überlebens-Größen sind nur **auxiliary**
  Suchsignale (`heldLand`, `economicEffect`, `troopLosses`, `survival`) — nie
  allein release-entscheidend.
- **Pro-Stufen-Versions-Pinning + Resume:** `curriculum.json` pinnt
  `model.sha256`, `opponent.mixVersion`, `engineCommit`, `stageVersion` pro
  Stufe. Bereits protokollierte Matches (`status:'recorded'`) werden bei Resume
  übersprungen und neu ausgewertet, ohne die Engine neu zu spielen (idempotent).
- **Reale protokollierte Läufe (DoD):**
  `node tools/benchmark/curriculum.cjs --execute --smoke --engine
  ../OpenFrontIO --out benchmark-results/curriculum-p4` hat 3 Matches gegen
  **3 verschiedene gefrorene Archetyp-Stile** (Legacy, Economy, Naval) an der
  gepinnten Engine (SHA `13b40338`) protokolliert — nicht aus einer einzelnen
  leichten Liga abgeleitet.
- **Dokumentierte fehlschlagende Kategorie:** `missing_city_building` auf allen
  3 Läufen — bei Tick 1200 spart der Bot noch für seine erste City/Factory
  (`coreFunding.missing=["City","Factory"]`, kein pending Bau), eine echte,
  nachvollziehbare Degenerationskategorie, die der Wächter meldet.
- **Tests bestanden (lokal, grün):** `tests/collapse-watch-regression.cjs`
  (alle 8 Kategorien deterministisch + Promotions-/Suchsignal-Trennung,
  Tick-Limit zensiert) und `tests/curriculum-regression.cjs` (18-Match-Plan,
  6 Stufen, gefrorener 7-Stil-Mix, Modell≠Gegner, Versions-Pinning, idempotente
  Replanung, Resume). Neu in der CI als P4-Schritt in `verify.yml`.

**Abgrenzung / weiterhin offen:** Dies ist das gestufte Curriculum + Liga +
Collapse-Wächter (P4). Das **unabhängige** Final-Holdout, Shadow-Ranking und
die Promotion-Gate sind **P5** und hier nicht angefasst. Echte Engine-Matches:
ja (3 protokollierte Läufe). Reale Human-Multiplayer-Abnahme bleibt offen.

## Implementierungsstand 1.21.0 (P0–P6)

### Abschlussprüfung der implementierbaren Roadmap-Aufgaben (22.09.2026)

Die in [ROADMAP_IMPLEMENTATION_P0_P6_1.21.0.md](ROADMAP_IMPLEMENTATION_P0_P6_1.21.0.md)
zugeordneten Codeaufgaben P0–P6 sind implementiert. Der aktuelle native
Verify-Satz bestand lokal vollständig, darunter **308/308** Strategie-
Regressionen, deterministische Quell-/Run3-/Modell-Hashes, Duo-Relay,
Benchmark-/Liga-Identitäten, Replay-Sichtzustand, Candidate-v5 und der
fail-closed Promotion-Gate.

Zwei nach der Integration gemeldete konkrete Restlücken sind im
Abschlusspaket behoben:

- Der Paired-Impossible-Workflow wird auch bei `trainer/**`- und direkten
  Run3-Änderungen eingeplant; ein Regressionstest hält die fachlich relevanten
  Trigger zusammen.
- Der P6-Promotion-Gate akzeptiert kein über Karten oder Gegner
  wiederverwendetes Seed mehr. Vorregistrierte `scenarioId`/`matchSeed`-Blöcke
  sind global eindeutig; nur die drei Vergleichsarme innerhalb desselben
  Blocks teilen exakt denselben Engine-Seed.

Damit sind die implementierbaren Aufgaben administrativ schließbar, sobald
dieses Abschlusspaket in `main` integriert und dessen CI erfolgreich ist.
Nicht durchgeführt bleiben Langzeit-, echte Zwei-Browser-, Liga- sowie
120-/600-Tick-Wirkungstests. Sie gelten ausdrücklich **nicht** als bestanden;
aus dem Roadmap-Abschluss folgt keine neue Siegquote, Modell-Promotion,
P95-Laufzeitzusage oder kausale Wirkungsbehauptung.

Das umfangreiche P0–P6-Codepaket ist in 1.21.0 integriert. Ligaausführung,
Replay-Rekonstruktion aus tatsächlichen sichtbaren Zuständen, trainierte
Kandidaten-Policy und kontrollierte Promotion wurden dabei bewusst nicht als
erfolgreich ausgeführte Versuche behauptet. Die genaue Zuordnung und die
bewusst nicht erzeugten Nachweise stehen im
[P0–P6-Implementierungsprotokoll](ROADMAP_IMPLEMENTATION_P0_P6_1.21.0.md).
Gemäß der aktualisierten Abschlussregel in #75 wurden auf Nutzerwunsch
**keine Langzeit-, Zwei-Client-, Liga- oder Wirkungstests** ausgeführt. Daher
folgt aus diesem Implementierungsabschluss ausdrücklich keine neue Siegquote,
P95-Laufzeitzusage, Modell-Promotion oder behauptete kausale Wirkung. Die
historischen Abschnitte darunter bleiben als zeitlich eingeordnete Dokumentation
früherer Zwischenstände erhalten.

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

## P4–P6: gezielte CI-Regressionen nach Integration (PR #88)

- Nach Merge von [PR #86](https://github.com/SLP-DEV1/openfront-bot/pull/86) wurden in [PR #88](https://github.com/SLP-DEV1/openfront-bot/pull/88) fokussierte Tests für getrennte Duo-Budgets, einen verbundenen Wasser-Umweg samt konservativem Fallback sowie den Liga-Dry-Run mit Engine-Pin, Bot-Hash und unbekannten Resultaten ergänzt.
- **[Verify AggroBot grün](https://github.com/SLP-DEV1/openfront-bot/actions/runs/35672891052)**, Merge [fe119db](https://github.com/SLP-DEV1/openfront-bot/commit/fe119db78f51dafb36f619d7c5acdf20fa2b2a2a). Dies sind isolierte Regressionen; Langzeit-, vollständige Zwei-Client-, Liga- und Wirkungstests stehen weiterhin aus. P4, P5 und P6 bleiben als Gesamtphasen offen.

## Geänderte Schließregel: Implementierung vor lokalen Langzeittests (22.09.2026)

Auf Nutzerwunsch sind lokale Langzeit-, vollständige Zwei-Client-, Liga- und Wirkungstests **keine alleinigen Schließblocker** mehr. Vorhandene CI-/Regressionsergebnisse bleiben dokumentiert; fehlende Tests werden als *nicht durchgeführt* und nicht als erfolgreich gewertet. Ein Phasen-Issue wird geschlossen, sobald seine **relevanten umsetzbaren Entwicklungsaufgaben** erledigt und offene Risiken/ausgelassene Nachweise im Abschluss benannt sind. Die ältere vollständige Phasenabnahme/Siegquotenbewertung bleibt von dieser administrativen Schließung getrennt. Aktuell stehen insbesondere noch Codearbeiten an P1–P3 sowie P4–P6 aus. [PR #89](https://github.com/SLP-DEV1/openfront-bot/pull/89) wurde nach Konfliktauflösung **gemergt** ([Commit 7847517](https://github.com/SLP-DEV1/openfront-bot/commit/7847517fa17ec62df43cbd237971da8e15ef66b7)); die Implementierung ist in `main`. Ausgelassene Langzeit-, Live-Zwei-Browser-, Liga- und Wirkungstests sind ausdrücklich keine bestandenen Nachweise.

## Umsetzung der drei weiteren P4–P6-Bausteine – PR #89

- **P4 / #72:** Gemeinsame Angriffe verlangen jetzt neben dem bestehenden realen Allianz-/Legalitäts-/Budgetcheck die wechselseitige frische Bestätigung derselben `planId` über `ackPlanId`. Der Relay validiert die Zusage, versendet selbst keine Engine-Aktionen. In der vollständigen lokalen Team-Engine-Simulation hat jedes Paar einen separaten In-Process-Relay.
- **P5 / #73:** Für einen noch nicht gesendeten Transport wird der Wasserweg begrenzt näherungsweise geplant, mit der am gepinnten offiziellen Engine-Commit geltenden Rate von einem Bewegungsschritt pro Tick. Für ein im GameView beobachtetes Schiff wird die Ankunft aus dessen **offiziellem `motionPlans()`** mit `startTick`, tatsächlichem Pfad und `ticksPerStep` projiziert. Neue Wege, Gefechte oder Rückzug können diese Projektion ändern.
- **P6 / #74:** `tools/benchmark/engine-multibot.mjs` verwendet 2–8 vollständig getrennte Bot-VMs/GameViews/Worker-Anfragen/Busse innerhalb **eines offiziellen GameRunners**. `tools/benchmark/league.cjs` startet standardmäßig echte Bot-gegen-Bot-FFA beziehungsweise mit `--participants 4 --gameMode Team` vollständige 2v2-Bot-Teams. `--scripted` bleibt expliziter Legacy-Modus; ohne `--execute` werden keine Partien gestartet. Anleitung: [LEAGUE_RUNNER.md](LEAGUE_RUNNER.md).
- **Stand:** Merge [7847517](https://github.com/SLP-DEV1/openfront-bot/commit/7847517fa17ec62df43cbd237971da8e15ef66b7). Automatischer `Verify AggroBot` auf geprüftem PR-Head erfolgreich; keine Langzeit-, echten Zwei-Browser-, Liga- oder Wirkungstests vom Nutzer angefordert oder manuell ausgeführt. Ein vorhandener Runner ist keine belegte Siegquote.

## Implementierungsnachtrag P1–P3 und offizieller P0-Engine-Check

- **P1 / #69:** [PR #90](https://github.com/SLP-DEV1/openfront-bot/pull/90), Merge [3e0e384](https://github.com/SLP-DEV1/openfront-bot/commit/3e0e384be4352e06a31d123a2c63b94da5052cbf): bounded 90-/180-/360-Tick-Gegnerverläufe aus realen Zeitbeobachtungen, im unveränderlichen Frame; fehlende Historie bleibt `null`. [Verify grün](https://github.com/SLP-DEV1/openfront-bot/actions/runs/35674298511).
- **P2 / #70:** [PR #91](https://github.com/SLP-DEV1/openfront-bot/pull/91), Merge [2f6a6ae](https://github.com/SLP-DEV1/openfront-bot/commit/2f6a6ae426d007dfd89d0f8f173809522f32e4ac): konservative Factory-/Port-Einkommenswertung pro fertiggestelltem Gebäude; der beobachtete Gesamtwert ist kein kausaler Grenznutzenbeleg.
- **P3 / #71:** gleicher PR/Commit: normaler Stillstand >900 Ticks, im Experiment >440, gibt eine Operation nur ohne aktive Offensive/Pending Attack/Heimatdruck frei. Bis acht alternative Kandidaten nach sicherem Budget. [Verify grün](https://github.com/SLP-DEV1/openfront-bot/actions/runs/35674533333).
- **P4–P6:** [PR #89](https://github.com/SLP-DEV1/openfront-bot/pull/89), Merge [7847517](https://github.com/SLP-DEV1/openfront-bot/commit/7847517fa17ec62df43cbd237971da8e15ef66b7): explizite gegenseitige Duo-ACK, offizielle MotionPlan-ETA und Mehr-Bot-Engine-Harness mit FFA/2v2-Liga-Runner. **Keine ausgeführten Langzeit-, Zwei-Browser-, Liga- oder Wirkungstests** als Erfolg behaupten; weitere Implementierungsaufgaben bestehen.
- **P0 / #68:** [PR #92](https://github.com/SLP-DEV1/openfront-bot/pull/92) ist als [f0b1ae6](https://github.com/SLP-DEV1/openfront-bot/commit/f0b1ae65f0be8dda15c197dd87e54782e76a7a6c) gemergt. Offizieller Config.maxTroops-/Wachstumstest für City/Factory/Port auf gepinntem Engine-Commit im [Engine-Workflow 35674819769](https://github.com/SLP-DEV1/openfront-bot/actions/runs/35674819769) als eigener Schritt **grün**. Ein kompletter GameRunner-Baubefehl wurde nicht simuliert und die weiteren Workflow-Schritte sind separat zu bewerten.

## P6 Mehr-Bot-Aufzeichnungsfehler und Abschlussstatus dieses Durchlaufs

- [PR #93](https://github.com/SLP-DEV1/openfront-bot/pull/93), Merge [d7b1fb7](https://github.com/SLP-DEV1/openfront-bot/commit/d7b1fb76cc14702faa40f2709139814fa7db1f74): der gemeinsame Mehr-Bot-JSONL-Stream wird gegen die **Summe** aller per-Client-Recordings geprüft, nicht gegen den ersten Client. Unbekannte Zähler, Ereignislücken und Streamfehler bleiben als unvollständig gekennzeichnet. [Verify erfolgreich](https://github.com/SLP-DEV1/openfront-bot/actions/runs/35675062709).
- Der gesamte [offizielle Engine-Smoke für #92](https://github.com/SLP-DEV1/openfront-bot/actions/runs/35674819769) ist **erfolgreich**; die echte `Config.maxTroops`-/Wachstumsprobe bestand bereits als einzelner Schritt. Keine vollständige ausgespielte Gebäude-Baukausalität daraus ableiten.
- Nach #89–#93 aktuell keine offenen Pull Requests. **#68–#75 bleiben als Roadmap offen**, soweit tatsächlich noch Codeaufgaben ausstehen, nicht allein wegen der auf Nutzerwunsch übersprungenen lokalen Langzeit-/2-Browser-/Liga-/Wirkungstests. Der Reststand darf weder als fertiges Gesamtsystem noch als neue Siegquote ausgegeben werden.

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
