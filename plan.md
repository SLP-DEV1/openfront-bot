# OpenFront AggroBot — Implementierungsplan Neural / Learning auf nachweisbares Niveau

> **Arbeitsauftrag für Qwen Code (lokal)**  
> Repository: `https://github.com/SLP-DEV1/openfront-bot`  
> Ziel: Eine **hybride, lernfähige Policy** bauen, die vollständige, legale Aktionskandidaten bewertet, gegen verschiedene vollständige Gegner lernt und **nur nach überprüfbarer Verbesserung** schrittweise aktiviert wird.  
> Stand dieser Planungsgrundlage: 23.09.2026. **Vor jeder Änderung den tatsächlichen aktuellen Git-/Code-Stand prüfen.** Dieses Dokument ist ein Implementierungsplan, kein Ergebnisbericht und keine Behauptung, die beschriebenen Aufgaben seien schon erledigt.

## 0. Arbeitsmodus — sofort beachten

Du bist Qwen Code und sollst **implementieren, nicht nur beraten**. Arbeite die Phasen in sinnvoll getrennten, nachvollziehbaren Commits ab; aktualisiere dieses Dokument anhand des tatsächlichen Stands. Nutze das vorhandene Repo und implementiere keinen parallelen, inkompatiblen Bot. Priorisiere valide, testbare kleine Änderungen vor großen Rewrites.

1. Prüfe zuerst `git status --short`, `git branch --show-current`, `git log -1 --oneline`, `README.md`, `docs/COMPETITIVE_ROADMAP.md`, `docs/COMPETITIVE_PLAN_2026-09-22.md`, `docs/MODULAR_BUILD_AND_SHADOW.md`, `docs/LEAGUE_RUNNER.md`, `docs/EXPERIMENT_PROTOCOL.md`, die `trainer/`-Quellen und die aktuelle CI. Das Repository kann nach diesem Planungsdatum geändert worden sein; die **ausführbaren Quellen** gehen historischen Dokumentangaben vor.
2. **Lokale Änderungen niemals verwerfen.** Kein `git reset --hard`, kein `git clean -fd`, kein blindes `git pull` über einen schmutzigen Arbeitsbaum. Bei Bedarf eigenes `git worktree`/Feature-Branch benutzen. Keine Branches oder offenen Änderungen anderer Arbeiten überschreiben.
3. Die kanonischen Quellen unter `src/userscript/` bearbeiten; `OpenFront_Solo_AggroBot.user.js` und `OpenFront_AggroBot_Impossible_Run3.user.js` ausschließlich über die vorhandenen Build-/Bundle-Werkzeuge synchron halten. Run3 bleibt derselbe Spielcode **mit unverändertem, gesondert versioniertem Schema-4-Champion**, bis eine neue Policy die Freigabe tatsächlich bestanden hat. **Niemals beide Userscripts zugleich im Browser aktivieren.**
4. Keine Behauptung über neue Siege, Human-Transfer, Echtzeit, Teamkoordination, Lernfortschritt oder bestandenes Gate ohne tatsächlich ausgeführte und gespeicherte Nachweise. Nicht ausgeführte Tests ausdrücklich `not run` nennen.
5. Keine „magischen“ Erfolgssignale: `tick-limit`, `unknown`, nicht bestätigte Aktionen, verschwundene Boote oder verlorene Telemetrie sind **keine bestätigten Siege oder eindeutigen Misserfolge**. Eine Partie ist die statistische Einheit; zwei Duo-Exports derselben Partie sind keine zwei Ergebnisse.
6. **Hard safety:** Eigentum, bestätigte aktuelle Allianzen/Teams, `me.actions()`-/Engine-Legalität, aktueller Zustand, Mindest-/Notreserven, Budget/Worker-Limits, Nukes gegen eigene/verbündete Gebiete, Aktionsrate und Match-Berechtigung dürfen von Neural nicht umgangen werden. Strategische Heuristiken wie ein pauschaler hoher Reserve-Slider dürfen nur innerhalb expliziter sicherer Bereiche verbessert werden.
7. Bevor du einen bestehenden Pfad umstellst, vergleiche dessen Verhalten mit `rule-basis` und `run3-schema4` **auf demselben Spielcode**. Isoliere Änderungen pro Entscheidungskomponente. Kein stiller Champion-Austausch.
8. Qwen/llama.cpp darf während Planung/Codearbeit helfen, aber **nicht** in jedem Engine-Tick und **nicht** als unprüfbarer Ausführer von Befehlen. Offline-Training und Live-Inferenz müssen ohne Qwen-Server funktionieren.
9. Wenn du etwas nicht ausführen kannst (fehlender sauberer OpenFrontIO-Checkout, Ressourcen, Browser, nicht rekonstruierbares Replay), implementiere und teste die zugänglichen Bausteine, dokumentiere exakt den Blocker und markiere die reale Abnahme offen. **Keine synthetischen Matchdaten als echten Nachweis ausgeben.**

## 1. Ausgangslage im Repository — vor Ausführung erneut bestätigen

| Baustein | Stand der Planungsgrundlage | Konsequenz |
|---|---|---|
| `trainer/strategic-policy-v4.cjs` | Schema 4, 24×24×16, **1.000 Gewichte**, beeinflusst vorhandene Planer | Als alte Baseline erhalten, keine unkontrollierte weitere Mutation |
| `trainer/candidate-policy-v5.cjs` | Schema 5, 32×20×2, **702 Gewichte**, `heldGain` und `lossRisk` | **Diesen** vorhandenen Prototyp als ersten trainierbaren Kandidaten verwenden |
| `trainer/shadow-deploy.mjs` + `docs/MODULAR_BUILD_AND_SHADOW.md` | Schema-5-Shadow: beobachtendes Ranking ohne Intent-Einfluss | Weiterverwenden und mit echten Labels/Logs ergänzen |
| `trainer/deploy.mjs` | Freigabe für bekannte ältere Schemas; Schema 5 wird absichtlich nicht still eingebettet | Nur nach explizitem neuem Release-Gate öffnen |
| `tools/benchmark/engine-multibot.mjs` | 2–8 vollständige, getrennte Bot-GameViews/VMs in **einer** offiziellen Engine | Grundlage für echte Bot-Gegner, FFA und 2v2, nicht zwei echte Browser |
| `tools/benchmark/league.cjs` | Aufstellungs-/Liga-Runner; `--execute` erforderlich | Zu versionierter Gegner-/Trainingsliga ausbauen |
| `trainer/promotion-gate-v5.cjs` | Advisory-/fail-closed-Holdout-Gate gegen `rule-basis` und `run3-schema4` | Rohbelege und Statistik ergänzen, nicht umgehen |
| `tools/benchmark/replay-visible-state.cjs` / `replay-cli.cjs` | Prüfung bereits aus GameView extrahierter sichtbarer Frames | Vollständige Replay-Rekonstruktion separat nachweisen |
| `docs/DIAGNOSTIC_V2.md` | `summary.json`, `events.jsonl`, `snapshots.jsonl`, `duo.jsonl` | Entscheidungs-, Alternativen- und Wirkungsdaten ergänzen |

Die vorhandenen `docs/training-analysis-20260921/holdout/holdout-finalD.json`-Ergebnisse zeigen für Run3 und Null-Policy **je 0/8 bestätigte Siege**. Unterschiede der durchschnittlichen Überlebensdauer sind kein Nachweis für Spielstärke. **Achtung:** Historische Trainingsdokumente nennen teils fälschlich 9.216 statt 1.000 Schema-4-Gewichten; als Referenz den tatsächlich validierten Code benutzen. Vorhandene **„Neural V6 collapse campaign“**-Artefakte/Dateinamen prüfen und nicht mit einer neuen Model-Schema-6-Version verwechseln oder überschreiben.

## 2. Architekturvertrag

```text
GameView / bestätigte eigene Aktionen / bestätigte Partnerinformationen
   -> zeitlich konsistenter beobachtbarer Zustand + Unsicherheitsmasken
   -> regelbasiert generierte legale Kandidaten:
      attack, expand, invest, naval, defend, aid, diplomacy, HOLD, CANCEL
   -> Neural Candidate Scorer + kurze gegnerische Antwortszenarien
   -> Ressourcen- und Operationsbudget (Truppen, Gold, Zeit, Duo)
   -> FRISCHER Engine-/Allianz-/Reserve-/Budgetcheck
   -> tatsächlicher Intent
   -> Quittung / Ausführung / beobachtbare Wirkung / Match-Ergebnis
   -> versionierte Trainingsdaten (nicht direkt live die Champion-Gewichte ändern)
```

**Neural darf nur bewerten, nicht Befehle erfinden.** Die alte Regelbasis ist sowohl Baseline als auch robuster Fallback. Die Null-/deaktivierte Policy darf keine versteckten Verhaltensänderungen verursachen. `HOLD` und `CANCEL` müssen echte vergleichbare Kandidaten sein; ein nur auf Angriff ausgerichteter Scorer erzeugt sonst künstliche Aggression. Ein verzögert wirkender Bau muss gegenüber einem Sofortangriff fair nach Zeit und Kosten bewertet werden.

## 3. Phasen mit konkreten Arbeitsaufträgen und Definition of Done

### P0 — Datenvertrag, saubere Baselines, Diagnose [zuerst]

**Implementieren**

- [x] Exakte Baselines einfrieren: gleiche Bot-Spiellogik, `rule-basis` ohne Modell und `run3-schema4` mit dokumentiertem unverändertem Modell; Engine-Commit, Skript-/Modell-/Options-Hash, Karten, Seeds, Spieleranzahl, GameMode und Gegner speichern. Browser-Lernen deaktivieren oder versioniert/resetbar halten. *(Bestanden: Solo 1.21.2 byte-exakter Build als rule-basis; Run3-Champion unverändert via `bundled-run3-regression.cjs` (Champion-SHA fest); Engine-Pin `bb8af015` in allen Engine-Workflows; Provenienz via `experiment-manifest.cjs`; Browser-Lernen versioniert (`of-aggrobot-learning-v1`, Schema 1) und per Option/Generation resetbar.)*
- [x] Kanonischen `DecisionFrame` definieren: `matchId`, `clientId`, `decisionId`, `tick`, Zeit-/Datenalter, `observations`, `missingMask`, `legalCandidates`, `ruleChoice`, `modelScores`, `modelChoice`, `actualIntent`, `blockReasons`, `actionReceipt`, `observedEffects`, `outcomeStatus`, alle Provenienz-Hashes. *(Bestanden: `planningState` trägt alle Felder; `dataAge`/`missingMask`/`provenance` (Bot-Version, Engine-Commit, GameMode) ergänzt; Frames begrenzt auf die letzten 16, export via `diagnosticSnapshot.decisionFrames`.)*
- [x] In der Diagnose **auch die verworfenen legalen Kandidaten** erfassen (begrenzte Anzahl und Datenmenge). Verknüpfe `decisionId -> intent -> confirmed -> effect`, mit Beobachtungshorizonten beispielsweise 120/360/600 Ticks; bei nicht erreichten Horizonten `unknown`/`censored`. *(Bestanden: `rejectedCandidates` (≤7) im Frame; `decisionId -> intent -> confirmed -> effect` über `actionLedger`; Horizonten 120/600; abwesende Wirkung bleibt `unknown` und wird nie 0 gesetzt; Nachweis `tests/decision-frame-regression.cjs`.)*
- [x] Eine getroffene Entscheidung nicht mit der späteren hypothetischen Wirkung einer **nicht** getroffenen Alternative labeln. Counterfactuals nur durch separate kontrollierte Simulationsarme oder validierte Methoden. *(Bestanden: nur tatsächlich emittierte Intents (`actualIntents`/`actionReceipt`) werden an den Frame gehängt; verworfene Kandidaten tragen keine Wirkungslabel.)*
- [x] Die Normalisierung gegen Engine- und Browser-Zustand testen. Große absolute Werte relativ/logarithmisch normalisieren; Maskierung statt 0 bei unbekannter Gegner-/Routeninformation. *(Bestanden: `missingMask` maskiert statt 0 (Border-Staleness, unbekannte Gegnertroops, Modell-Status); Schema-5-Featureparität/Masking abgedeckt von `candidate-policy-v5-regression.cjs`.)*
- [x] `match` als Stichprobeneinheit festhalten. `player eliminated` von `team lost` trennen. Keine Teamkollegen in `enemyLand`/`enemyTroops`. *(Bestanden: `matchId` pro Frame; `personalEliminated`/`teamOutcomePending` trennt Elimination und Teamergebnis; Teamkollegen via `isOnSameTeam` aus Feind-Listen ausgeschlossen.)*

**Relevante Stellen:** `docs/DIAGNOSTIC_V2.md`, `src/userscript/*`, `tools/benchmark/engine-match.mjs`, `tools/benchmark/engine-multibot.mjs`, `tools/benchmark/experiment-manifest.cjs`, `tests/`.

**DoD:** Mindestens ein reproduzierbarer kleiner Engine-Test/Fixture zeigt: Kandidaten + echte Wahl + bestätigte Wirkung werden korrekt verbunden; nicht vorhandene Wirkung bleibt unbekannt; Solo/Run3-Bundle-Checks bestehen. Kein Gameplay-Change im P0-Diagnose-PR.

**Status (23.09.2026): DoD bestanden, CI grün, gemergt.** `tests/decision-frame-regression.cjs` (Fixture auf dem gebündelten Solo-Userskript) zeigt: Kandidaten + tatsächliche Wahl + bestätigte Wirkung korrekt verknüpft; abwesende Wirkung bleibt `unknown` (nie 0); Solo-/Run3-Bundle-Checks bestehen (`build-userscript.cjs --check`, `build-run3-bundle.cjs --check`, `bundled-run3-regression.cjs`). Kein Gameplay-Change: P0 ergänzt nur Diagnosefelder und die Horizon-Auflösung; die einzige sichtbare Seiteneffekt-Änderung ist das planmäßige Ausblenden von Teamkollegen in der Feind-Liste des Status-Fields. [PR #136](https://github.com/SLP-DEV1/openfront-bot/pull/136): alle fünf Workflows auf dem PR-Head erfolgreich (Verify AggroBot, Deterministic Scenario Pack, Full-Bot FFA League Smoke, Impossible Paired Evaluation, Impossible Engine Smoke); gemergt als [27f785a](https://github.com/SLP-DEV1/openfront-bot/commit/27f785a).

### P1 — Gegnerliga aus vollständigen Bots

**Implementieren**

- [ ] Reuse `engine-multibot.mjs` und `league.cjs`: vollständige Client-Instanzen mit getrennten GameViews, VM-/Speicher-/Worker-Zuständen und gemeinsamer offizieller Engine.
- [ ] Versionierte Gegner-Archetypen mit tatsächlicher abweichender Strategie und überprüfbarem Verhaltensprofil: `rush`, `turtle`, `economy`, `opportunist`, `diplomat`, `naval`, `nuke`, `duo`, `legacy`, `champion`. **Nicht** nur denselben Bot unter zehn Namen bzw. Sliderwerten starten.
- [ ] Allianz-/Diplomatie-Szenarien einschließlich Beziehungsänderung mit bestätigter Team-/Allianzsemantik. Team und lokalem Duo-Relay nicht verwechseln. Für einen Allianzbruch gelten neue aktuelle Zustände, niemals eine alte Freund-/Feind-Cacheliste.
- [ ] Separates 1v1-, FFA- und offizielles 2v2-Protokoll; Rotation von Karte, Position, Teampartner, Profil und Seed. Ergebnisse nicht in eine undifferenzierte Gesamtquote werfen.
- [ ] Jede Gegner-/Profilversion und den Liga-Snapshot einfrieren; Legacy-/Champion-Snapshots erhalten, statt sie bei neuem Training still zu ersetzen.
- [ ] Szenario-Pack: Cap-Stall, zerstörte City, kollabierendes Einkommen, Einkesselung, Angriffslücke/War-Lock, Boot verschwindet, zweiter Gegner greift an, falsch ablaufende Partnerzusage, Nuke-/SAM-Risiko, Teamspende bei Heimgefahr.
- [ ] `--smoke` strikt von echten vollständig gelaufenen Liga- und Langzeitpartien trennen; Gegner muss verifiziert gespawnt und mit echtem eigenen Bot-Hash ausgewiesen sein.

**DoD:** Mindestens ein nachweislich ausgeführter kurzer FFA- und ein 2v2-Smoke mit vollständigen gegnerischen Bot-Clients; Logs belegen unterschiedliche Strategien und Spielzustand; ohne echte Suite **keine** breite Spielstärke behaupten.

### P2 — Menschliche Replays als korrektes Curriculum

**Implementieren**

- [ ] Replay-Import nur akzeptieren, wenn passender offizieller Engine-Pin, ausreichend Anfangs-/Aktionsdaten und der **damals sichtbare** `GameView` rekonstruiert werden können. Sonst nur unverbindliche Szenarioidee, **kein** Lernpaar.
- [ ] Mehrere Spieler und unterschiedliche Siege **und** Niederlagen nutzen; das vorhandene ProfessorSployer-Beispiel ist nur ein Datenpunkt.
- [ ] Einfache Ereignistags für `early-rush`, `alliance-change`, `counterattack`, `nuke-timing`, `naval-landing`, `duo-synchronized`, `retreat`, `rebuild`, `hold`, `failed-attack`. Tags mit `source`, Tick, Beobachtung und Validitätsstatus protokollieren.
- [ ] Daten nach **ganzer Partie** und möglichst Spieler/Stil separieren; niemals nahe Frames derselben Partie auf Train und Holdout verteilen. Keine versteckten Engine-Wahrheiten als Features.
- [ ] Fehlende Real-Replays als Blocker dokumentieren; nicht ohne Datengrundlage „menschliches Verhalten gelernt“ melden.

**DoD:** Der Import weist ein unvollständiges Roh-Replay reproduzierbar ab und akzeptiert eine gültige sichtbare Testsequenz; tatsächliche Humandaten nur mit Provenienz und Zustimmung/Nutzungsrecht speichern.

### P3 — Schema-5-Prototyp wirklich trainieren

**Implementieren**

- [ ] Mit `trainer/candidate-policy-v5.cjs` beginnen: 32 Inputs × 20 Hidden × 2 Outputs = **702 trainierbare Parameter**. Erst prüfen, welche Merkmale im echten Runtime-Frame zuverlässig verfügbar sind; nicht verfügbare Features maskieren und eine neue featurisierte Schema-Version sauber migrieren.
- [ ] Targets klar operationalisieren: `heldGain` = innerhalb festem Horizont beobachteter und noch gehaltener territorialer Nettoeffekt relativ zum Ausgangszustand; `lossRisk` = vorab definierte tatsächlich beobachtete Verlust-/Eliminations-/Abbruchereignisse. Investition, Marine, Hilfe und Angriff brauchen sinnvoll vergleichbare Nutzen-/Kostenhorizonte; notfalls separate Heads/skalierte Nutzwerte.
- [ ] Labels nur für ausgeführte, nachweisbar beobachtete Aktionen und erreichte Horizonte bilden; Unbekanntes nicht als 0. Für Replay-Imitation separate `behaviorChoice`-Labels und deren Selektionsbias kennzeichnen.
- [ ] Zunächst Offline-Supervised/Imitation (nur valide Daten), dann outcome-basiertes Fine-Tuning auf Engine-Ligapartien. Nicht einfach eine 10× größere, vollständig derivative-free mutierte Gewichtsliste als Lernfortschritt darstellen.
- [ ] Prüfungen: Shape/Schema, numerische Stabilität, fehlende Features, Seed-/Hash-/Split-Reproduzierbarkeit, Kalibrierung von Risiko-Prognosen, Label-Horizonte, Nullmodell- und Regelmodell-Ablation.
- [ ] Lernkurven/Validierungsmetrik gegen konstantes Modell, Schema 4 und unveränderte Heuristik zeigen; Train-Performance **nicht** als Holdout-Gewinn melden.
- [ ] Das vorhandene Shadow-Ranking an tatsächlich trainierte Version anschließen, ohne Spielintents zu ändern.

**Nur bei belegtem Underfitting** eine zusätzliche *neue*, gesondert versionierte Architektur prüfen, beispielsweise 48→64→32→3 = **5.315 Parameter**. Das ist ein Modellarchitektur-Vorschlag, **kein** Auftrag, bestehende „V6 collapse campaign“-Arbeiten oder Schema-5-Artefakte still zu überschreiben. Größeres Modell gegen 702er, Nullmodell und Regelwerk ablationieren; höhere Parameterzahl ist kein Erfolgskriterium.

**DoD:** Deterministischer Training-/Checkpoint-/Resume-Pfad, echte validierte Trainings- und Validation-Splits, reproduzierbares Modellfile mit SHA und Runtime-Featureparität; kein Live-Deployment durch Training allein.

### P4 — Curriculum, League Training und Self-Play

**Curriculum (Reihenfolge, nicht notwendigerweise starre Schwierigkeitszahlen)**

1. Mechanik, legaler Ausbau und geringe Gegnerzahl; vermeiden, dass der Bot beim Cap stillsteht.
2. 1v1 mit früher Aggression, Verteidigung und Gegenschlag.
3. Wirtschaft, Marine, Nuke/SAM sowie zwischenzeitlich unterbrochene Operationen.
4. FFA: Dritte Parteien, Diplomatie, Allianzänderungen, lange Partien.
5. 2v2: Rollen, bestätigte Zusagen, getrennte Ressourcenbudgets, koordinierte/abgebrochene Angriffe.
6. Gemischte, **vorher eingefrorene** Gegnerliga mit unbekannten Karten-/Seed-/Stilkombinationen.

**Implementieren**

- [ ] Gegner-Mix aus aktuellen, eingefrorenen Legacy- und mehreren alten Champion-Policies. Nicht ausschließlich gegen das jeweils jüngste eigene Modell trainieren (Overfitting/Collapse).
- [ ] Ausgewogene Abdeckung der Kategorien; schwierige oder seltene Fälle gezielt einspeisen, ohne das unabhängige Final-Set anzutasten.
- [ ] In jedem Schritt auf passives `HOLD`-Spamming, blindes Rushen, Goldhorten, ausbleibenden City-Bau, Allianzfehler, endlosen War-Lock, scheinbar „sichere“ reine Überlebensstrategie und fehlerhafte Marine-ETAs prüfen.
- [ ] Trainingsreward von Promotion trennen: bestätigtes Match-Ergebnis maßgeblich für Release; gehaltenes Land, wirtschaftliche Wirkung, Truppenverluste und Überleben nur sachgerecht definierte zusätzliche Suchsignale. Tick-Limit als zensiert behandeln.
- [ ] Jede Stufe mit eigener Modell-/Engine-/Opponent-/Dataset-Version speichern und nach Fehlern wiederaufnehmen können.

**DoD:** Reale protokollierte Trainings-/Validierungsläufe auf unterschiedlichen Gegnerstilen, dokumentierte fehlschlagende Kategorien und Regressionen; kein Erfolg aus nur einer „leichten“ Liga ableiten.

### P5 — Shadow, unabhängiger Holdout und Promotion

**Implementieren**

- [ ] `trainer/shadow-deploy.mjs` beibehalten: Modellentscheidung vs. Regelentscheidung als `wouldPrefer` aufzeichnen; `changedIntent:false` muss nachweisbar gelten. Die spätere beobachtete Wirkung der nicht gewählten Alternative bleibt unbekannt.
- [ ] Mindestens drei getrennte Arme auf **gleichem Bot-Code**: `rule-basis`, `run3-schema4`, `candidate-v5`. Vorregistrierte Szenarien inkl. Modus/Karte/Gegner/Seed/Rollenrotation und unveränderliche Bot-/Modell-Hashes.
- [ ] Bestehendes `trainer/promotion-gate-v5.cjs` als Mindestbasis weiterverwenden: alle drei Arme pro Szenario, eindeutige echte Match-Seeds je Szenario, vollständige geprüfte Reports, 2+ Karten, 2+ Gegner, keine ignorierten fehlenden Partien. Das bisherige Gate ist **advisory** und keine statistische Spielstärkegarantie.
- [ ] Zusätzlich gepaarte Effekte + Unsicherheitsintervalle auf **Match-Ebene** berechnen. Zuerst kurze CI-/Smoke-Tests zur Fehlersuche, dann vorher festgelegte größere Stichprobe (Orientierung: mindestens ca. 100 gepaarte Begegnungen pro Kernformat; bei hoher Varianz mehr). Ergebnisse pro 1v1/FFA/2v2 separat berichten.
- [ ] Echte vom Training bislang unangetastete Final-Holdouts. Nicht iterativ nach jedem Fehlversuch neue Gewichte gegen das Final-Set auswählen; verbrauchtes Final-Set zur Modellselektion umklassifizieren und neues einfrieren.
- [ ] Negative Gates: unbestätigter Sieg; Allianz-/Nuke-Illegalität; untragbare Regression in einem festgelegten Szenario; nicht reproduzierbare Engine/Policy; fehlende Ausführungs-/Sichtzustandsdaten; Live-Latenz zu hoch; diskrepante Browser-/Engine-Inferenz.
- [ ] Bestehendes `eligible` bedeutet nur „zur manuellen Prüfung geeignet“. Roh-Matchartefakte verifizieren und Freigabe getrennt dokumentieren. Auf Wunsch können die tatsächlichen Schwellen später vorregistriert verschärft werden; **nicht nachträglich zugunsten eines Kandidaten anpassen**.

**DoD:** Reproduzierbare Reports + gepaarte Vergleiche gegen **beide** Baselines; Promotion nur nach nachgewiesener Verbesserung und nicht verletzten Sicherheits-/Regressionsgates. Bei 0/0 oder nicht unterscheidbaren Ergebnissen **keine Promotion**.

### P6 — Kontrolliertes Deployment und Rollback

**Implementieren**

- [ ] Kein automatischer Austausch der bestehenden Run3-Gewichte durch `train.mjs`; `trainer/deploy.mjs` unterstützt Kandidatenmodell erst mit explizitem, geprüftem Schema-/Runtime-/Feature-/SHA-Vertrag und durchlaufenem Release-Gate.
- [ ] Erst gesondertes Shadow-Skript, dann ausdrücklich opt-in begrenzte Kandidatensteuerung, dann optional als Default nach gesonderter echter Human-/Browser-Abnahme.
- [ ] Stufenweises Rollout, Fail-closed: bei ungültigem Modell, Feature-Drift, Worker-Timeout, fehlendem sichtbaren Zustand, fehlender Legalität → deterministischer regelbasierter Fallback. Notverteidigung wird nicht durch Modelllatenz verzögert.
- [ ] Modell-/Skript-/Engine-Hash im Panel und Export sichtbar; Rollback zur unveränderten Referenz möglich. Vorhandenes Solo/Run3-Generierungsverfahren und beide Userscripts auf gemeinsame Logik prüfen.
- [ ] Echte Browser-Matches und offizielle Team-Matches separat evaluieren. Der In-Process-Runner ersetzt **keine** Zwei-Browser-/Human-Multiplayer-Prüfung.

**DoD:** Verifizierte, optionale Live-Aktivierung mit bekanntem Rollback; der alte Champion bleibt unangetastet; keine neuen Sicherheitsverletzungen oder unerklärte Diskrepanzen zwischen Test-/Live-Featurevektoren.

## 4. Relevante bestehende Kommandos — tatsächliche CLI vorher prüfen

```powershell
# Repo nicht blind über lokale Änderungen aktualisieren:
git status --short
git log -1 --oneline

# Quell-/Build-Parität und grundlegende Regressionen:
node tools/build-userscript.cjs --check
node tools/build-run3-bundle.cjs --check
node tests/strategy-regression.cjs
node tests/neural-regression.cjs
node tests/candidate-policy-v5-regression.cjs
node tests/shadow-v5-regression.cjs
node tests/promotion-gate-v5-regression.cjs
node tests/league-plan-regression.cjs
node tests/benchmark-regression.cjs
node tests/scenario-pack-regression.cjs

# Liga-Plan, NOCH OHNE Matchausführung:
node tools/benchmark/league.cjs --engine ../OpenFrontIO --engineCommit bb8af015b515b3b717bd4d901074c5f4c16641cb --out benchmark-results/league-plan

# Kurzer vorhandener Full-Bot-Smoke (nur mit explizitem --execute,
# sauberem EXAKT passenden Engine-Checkout und passend neuer Ausgabedatei):
node tools/benchmark/league.cjs --engine ../OpenFrontIO --engineCommit bb8af015b515b3b717bd4d901074c5f4c16641cb --out benchmark-results/neural-v5-smoke --smoke --execute

# Bestehender V5-Gate: verlangt reale, vollständig validierte Berichte.
node trainer/promotion-gate-v5.cjs .\holdout-evidence.json
```

Den im Repo tatsächlich verwendeten Engine-Pin nach `git`-Prüfung bestimmen. Den oben dokumentierten Referenz-Commit nicht ungeprüft gegen eine inzwischen neuere Engine verwenden. `--execute` nur bewusst und niemals durch einen Dry-Run ersetzen, dessen Ergebnisse anschließend wie echte Partien erscheinen. Keine erfundenen neuen Trainer-CLI-Flags benutzen: zuerst implementieren und `--help`/Tests ergänzen.

## 5. PR-/Commit-Plan für Qwen

| PR | Inhalt | Muss getrennt bleiben von |
|---|---|---|
| 1 | P0 `DecisionFrame`, Merkmale/Missingness, Diagnose, Baseline-Freeze, Tests | Gameplay-/Neural-Steuerung |
| 2 | P1 Gegnerprofile, Liga-Snapshots, Szenarien, FFA/2v2-Harness | Neues Policy-Gewicht |
| 3 | P2 Replay-Import/Validität/Datensplits/Tags | Unbelegte „Menschentraining“-Ergebnisse |
| 4 | P3 v5-Trainings-/Checkpoint-/Loss-/Calibration-Pipeline | Default-Deployment |
| 5 | P4 Curriculum-/Liga-/Self-Play-Runner + Collapse-Wächter | Unabhängiger Final-Holdout |
| 6 | P5 Shadow-/Holdout-/Promotion-Evidence und Tests | Automatische Champion-Freigabe |
| 7 | P6 gated Live-Runtime, Bundle-Parität, Rollback | Vorzeitiger Run3-Austausch |

Nach **jedem** PR: relevante Tests tatsächlich laufen lassen, Resultate dokumentieren, Build-Artefakte/Hashes prüfen, `docs/COMPETITIVE_ROADMAP.md` und ggf. verwandte Issues aktualisieren. Nur abgeschlossene **Code-Arbeiten** als erledigt markieren; Langzeit-/Liga-/Human-Wirkungsnachweise separat offen halten. `README.md` und Trainingsanleitungen auf aktuellen tatsächlichen Modell-/CLI-Stand bringen.

## 6. Standardbericht nach jeder Arbeitseinheit

```text
Phase / Teilaufgabe:
Commit(s) / PR(s):
Geänderte Dateien:
Implementiert:
Tests ausgeführt und Ergebnis:
Nicht ausgeführt / Blocker:
Engine-Commit / Bot-SHA / Policy-SHA / Seed / Modus (falls Match):
Reale Nachweise und Artefaktpfade:
Regressionen / Datenqualität / offene Unsicherheit:
Nächster kleinster implementierbarer Schritt:
```

## 7. Gesamtabnahme — nicht mit „Code existiert“ verwechseln

- [ ] Gleiches aktuelles Bot-Verhalten ohne Neural bzw. mit identischer alter Run3-Policy reproduzierbar.
- [ ] Vollständige Gegnerliga mit tatsächlichen **verschieden spielenden** Bot-Clients läuft nachweislich, einschließlich FFA und 2v2.
- [ ] Verlässliche sichtbare Trainingsdaten ohne Engine-Informationsleakage und ohne Doppelzählung von Duo-Matches.
- [ ] Schema-5-Modell besitzt reale Trainings-, Validation- und Holdout-Ergebnisse, nicht nur 702 oder mehr Gewichte.
- [ ] Shadow verändert keinerlei gesendeten Intent; Beobachtung ist vollständig und richtig als nicht-kausal beschriftet.
- [ ] Kandidat übertrifft **vorab festgelegte** Baselines im unabhängigen gepaarten Match-Test ohne sicherheitskritische Regression; andernfalls alte Policy behalten.
- [ ] Nur ausdrücklich freigegebener Kandidat live; Fallback/Rollback und Solo/Run3-Builds verifiziert.
- [ ] Ergebnisse unterscheiden klar: **implementiert / Tests bestanden / echte Engine-Matches bestanden / reale Human-Multiplayer-Abnahme bestanden**.

**Priorität:** P0 → P1 → P3 (bereits mit Engine-Daten möglich) und parallel P2, sobald vollständige menschliche Replay-Daten verfügbar sind → P4 → P5 → P6. Ein größeres Netz ist eine optional begründete spätere Erweiterung, nicht der erste Schritt.
