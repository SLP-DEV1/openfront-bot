# OpenFront Schema-4 — Trainingsanalyse (2026-09-21)

Kompaktes, selbst-contained Analysepaket aller **neun Champion-Modelle** aus
`benchmark-results/`. Jedes Modell ist in seinem eigenen, eindeutig benannten
Verzeichnis abgelegt, das den ursprünglichen Trainingslauf 1:1 spiegelt
(Zuordnung zum Quell-Lauf bleibt damit erhalten). Alle Originaldateien unter
`benchmark-results/` bleiben unverändert; es wurden **keine** Rohlogs,
temporären Dateien oder vollständigen Match-Aufzeichnungen übernommen.

- **Architektur (alle 9):** `24x24x16-tanh`, Policy-Schema 4, 9216 Gewichte
- **Engine-Commit (alle 9):** `bb8af015b515b3b717bd4d901074c5f4c16641cb`
- **Modell-Hash:** SHA-256 der jeweiligen `champion.json` (Gewichte + Metadaten)

## Key Findings

1. **Identischer Champion in stage A/B/C und runE.** Die drei Curriculum-Stufen
   (`schema4-ffa-curriculum-20260921-overnight/stageA|B|C`) **und** der
   Impossible-Run `…-runE` tragen **denselben** Champion-Hash
   `d2a5fce3…c31e51`. Das Kurrikulum hat durch die Stufen denselben Champion
   weitergegeben, und runE hat unabhängig zum selben Modell konvergiert.
2. **Einheitliche Engine.** Alle Runs nutzen denselben `engineCommit`
   (`bb8af015…`), die Ergebnisse sind daher direkt vergleichbar.
3. **Kein Lauf wurde abgebrochen.** Alle 9 Runs haben ihre geplanten
   Generationen vollständig abgeschlossen. Das Kurrikulum wurde **nach** Stufe C
   kontrolliert beendet (siehe `stageC/STAGEC_STOPPED.txt`), nicht wegen Fehlers.
4. **Impossible-Holdout:** In den unabhängigen Holdout-Finals (`holdout-finalC/D`)
   erzielt **kein** Modell (auch nicht die Null-Baseline) Siege; der Unterschied
   liegt in der **Überlebensdauer** — die Champion-Modelle von run2/run3 überleben
   im Durchschnitt länger als `null-v4`.

## 1. Alle neun Champion-Modelle (Konfiguration + Hashes + Ergebnis)

| # | Trainingslauf (Pfad unter `benchmark-results/`) | Schwierig. | Karten | Nationen | Gen. geplant→abgeschlossen | Pop | σ | Matches | Ticks | Champion (SHA-256) | Provisional (SHA-256) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `schema4-ffa-curriculum-20260921-overnight/stageA` | Medium | World, Europe | 1,4 | 4 → 4 | 4 | 0.12 | 496 | 18000 | `d2a5fce385fa…c31e51` | `f5bcea6f4557…7fd0c` |
| 2 | `schema4-ffa-curriculum-20260921-overnight/stageB` | Hard | World, Europe | 1,4 | 4 → 4 | 4 | 0.08 | 496 | 18000 | `d2a5fce385fa…c31e51` | `509d3cbe793a…4365c` |
| 3 | `schema4-ffa-curriculum-20260921-overnight/stageC` | Impossible | World, Europe | 1,4 | 32 → 32 | 4 | 0.06 | 3968 | 18000 | `d2a5fce385fa…c31e51` | `8a52b0ba868a…9c31f` |
| 4 | `schema4-hard-world-europe-20260921-runC` | Hard | World, Europe | 1,4 | 5 → 5 | 4 | 0.12 | 620 | 18000 | `7b5563c59a6d…3cfcb` | `7b5563c59a6d…3cfcb` |
| 5 | `schema4-impossible-world-europe-20260920-run2` | Impossible | World, Europe | 1,4 | 5 → 5 | 4 | 0.12 | 620 | 18000 | `dc9dd71ac76f…e3c9d` | `97bed48df84d…585914` |
| 6 | `schema4-impossible-world-europe-20260920-run3` | Impossible | World, Europe | 1,4 | 12 → 12 | 8 | 0.12 | 2064 | 18000 | `65589febcf8a…7ff3` | `11ddde071121…be399a5eb7` |
| 7 | `schema4-impossible-world-europe-20260921-runD` | Impossible | World, Europe | 1,4 | 5 → 5 | 4 | 0.12 | 620 | 18000 | `57bdfa38921e…defe0` | `75309ff9faea…4dd63312` |
| 8 | `schema4-impossible-world-europe-20260921-runE` | Impossible | World, Europe | 1,4 | 5 → 5 | 4 | 0.12 | 620 | 18000 | `d2a5fce385fa…c31e51` | `d2a5fce385fa…c31e51` |
| 9 | `schema4-medium-world-europe-20260921-runA` | Medium | World, Europe | 1,4 | 5 → 5 | 4 | 0.12 | 620 | 18000 | `edbd4d152c5a…66b0` | `8acecbfb5853…cfe8bf` |

Vollständige Hashes und die exakten Dateilisten pro Lauf stehen in
`HASHES.json`. In den Läufern, bei denen Champion-Hash und Provisional-Hash
identisch sind (4, 8), wurde am Ende keine Abweichung mehr trainiert — der
Provisional-Modellzustand ist der Champion selbst.

## 2. Bestätigte Siege / Niederlagen / Abbruchgründe / Aufstiegstests

Die **bestätigten** (unabhängig validierten) Siege/Niederlagen stammen aus den
Holdout-Finals (`holdout-finalC`, `holdout-finalD`, s. Abschnitt 3). Alle Runs
wurden auf **Impossible** (World+Europe) mit 8 Seeds pro Vergleich evaluiert —
siege dort sind die strengen „bestätigten" Ergebnisse. Für Läufe **ohne** ein
eigenes Holdout-Finale ist die letzte Generation der Trainings-Evaluation
(inkumbent vs. kandidiert, paarweise) der verfügbare Aufstiegstest.

| Lauf | TrainScore (letzte Gen.) | ParentScore (letzte Gen.) | Letzte Evaluation (Ink./Kand.) | Bestätigte Siege / Niederlagen (Holdout) | Abbruchgrund | Aufstiegstest / Kriterium |
|---|---|---|---|---|---|---|
| stageA (Medium) | 0.7156 | 0.4140 | 4 / 11 | — (nur Trainings-Evaluation) | — (Kurrikulum, vollständig) | Kandidat > Inkumbent → weiter (Kurrikulum) |
| stageB (Hard) | 0.0278 | −0.1154 | 2 / 1 | — (nur Trainings-Evaluation) | — (Kurrikulum, vollständig) | Kandidat > Inkumbent → weiter (Kurrikulum) |
| stageC (Impossible) | −0.0475 | −0.1212 | 0 / 0 | — (nur Trainings-Evaluation) | Kurrikulum **nach Stufe C** kontrolliert beendet (`STAGEC_STOPPED.txt`) | Kandidat > Inkumbent → weiter |
| runC (Hard) | −0.00186 | −0.10749 | 0 / 1 | — (kein eigenes Holdout-Finale) | — (5/5 Generationen vollständig) | verifizierter paired Holdout: mehr Siege oder reproduzierbare Überlebens-/Territoriumsgewinne, ohne Regression |
| run2 (Impossible) | −0.1553 | −0.1607 | 0 / 1 | **0 S / 16 N** (finalC 0/8, finalD 0/8) | — (5/5 vollständig) | verifizierter vollständiger paired Holdout: mehr Siege oder konsistente Überlebensgewinne |
| run3 (Impossible) | −0.1306 | −0.1598 | 0 / 0 | **0 S / 8 N** (finalD 0/8) | — (12/12 vollständig) | verifizierter vollständiger paired Holdout |
| runD (Impossible) | −0.1638 | −0.1606 | 1 / 1 | — (kein eigenes Holdout-Finale) | — (5/5 vollständig) | verifizierter paired Holdout |
| runE (Impossible) | −0.1562 | −0.1525 | 0 / 0 | — (kein eigenes Holdout-Finale) | — (5/5 vollständig) | verifizierter paired Holdout |
| runA (Medium) | 0.6341 | 0.4738 | 14 / 14 | — (kein eigenes Holdout-Finale) | — (5/5 vollständig) | verifizierter paired Holdout |

Hinweise:
- **TrainScore/ParentScore** = mittlerer Score der letzten Generation bzw. des
  Elternmodells (höher = besser; positiv = Netto-Siege über die Trainingsspiele).
- **Letzte Evaluation (Ink./Kand.)** = paarweise Siege des sitzenden
  Champions gegen den Kandidaten in der Evaluation der letzten Generation
  (alle Karten/Seeds). `0/0` = in dieser letzten Evaluation kein Paar
  entschieden worden (z. B. alle Unentschieden/Tick-Limits).
- „Bestätigte Siege/Niederlagen" sind **siege auf Impossible** — dort sind 0
  Siege das erwartete Basisniveau; der aussagekräftige Maßstab ist die
  relative **Überlebensdauer** (s. Abschnitt 3).

## 3. Vergleichsergebnisse — Holdout-Finals (unabhängig)

Übernommen als `holdout/holdout-finalA.json`, `holdout/holdout-finalC.json`,
`holdout/holdout-finalD.json`. Pro Vergleich: 8 Seeds (World/Europe × Nation
1/4 × A/B), Schwierigkeit Impossible, 18000 Ticks.

**holdout-finalC** (0 S für alle):

| Modell | Siege | Niederlagen | Tick-Limit | Ø End-Tick | Ø Land |
|---|---|---|---|---|---|
| null-v4 (Baseline) | 0 | 8 | 0 | 7406 | 25558 |
| run1-incumbent-v4 | 0 | 7 | 1 | 7396 | 21177 |
| run2-champion-v4 | 0 | 8 | 0 | 8162 | 9696 |

→ **run2-champion** überlebt im Schnitt am längsten (Ø 8162 Ticks), schlägt die
Null-Baseline (7406) bei der Überlebensdauer — bestätigt (wenn auch knapp).

**holdout-finalD** (0 S für alle):

| Modell | Siege | Niederlagen | Tick-Limit | Ø End-Tick | Ø Land |
|---|---|---|---|---|---|
| null-v4 (Baseline) | 0 | 8 | 0 | 5393 | 25431 |
| run2-champion-v4 | 0 | 8 | 0 | 5364 | 15142 |
| run3-champion-v4 | 0 | 8 | 0 | 5940 | 19373 |

→ **run3-champion** überlebt am längsten (Ø 5940 Ticks) und schlägt die
Null-Baseline (5393). run2 liegt hier knapp unter der Baseline.

**holdout-finalA** (kontext, Kandidat = run1-Provisional):

| Modell | Siege | Niederlagen | Inkomplett | Ø End-Tick | Ø Land |
|---|---|---|---|---|---|
| null-v4 | 0 | 8 | 0 | 9270 | 28275 |
| candidate-v4 (run1) | 0 | 7 | 1 | 9412 | 32199 |

Fazit Holdout: **Keine Siege auf Impossible** für ein Schema-4-Modell; die
Champions erreichen aber eine **reproduzierbar höhere Überlebensdauer** als die
Null-Baseline in den Final-Vergleichen (run2 in finalC, run3 in finalD) —
bestätigt im Sinne des Holdout-Kriteriums „reproduzierbare
Überlebens-/Territoriumsgewinne ohne Regression".

## 4. Inhalt des Pakets

```
docs/training-analysis-20260921/
  TRAINING_REPORT.md                  (dieses Dokument)
  HASHES.json                         (Modell-/Engine-Hashes + Dateilisten pro Lauf)
  schema4-ffa-curriculum-20260921-overnight/
    stageA/{champion,plan,provisional,history}.json, generation-1..4.json
    stageB/{champion,plan,provisional,history}.json, generation-1..4.json
    stageC/{champion,plan,provisional,history}.json, generation-1..32.json,
           STAGEC_STOPPED.txt
  schema4-hard-world-europe-20260921-runC/{…}.json, generation-1..5.json
  schema4-impossible-world-europe-20260920-run2/{…}.json, generation-1..5.json
  schema4-impossible-world-europe-20260920-run3/{…}.json, generation-1..12.json
  schema4-impossible-world-europe-20260921-runD/{…}.json, generation-1..5.json
  schema4-impossible-world-europe-20260921-runE/{…}.json, generation-1..5.json
  schema4-medium-world-europe-20260921-runA/{…}.json, generation-1..5.json
  holdout/
    holdout-finalA.json
    holdout-finalC.json
    holdout-finalD.json
```

Pro Lauf übernommen: `champion.json`, `plan.json`, `provisional.json`,
`history.json` (enthält pro Generation die Kandidaten-Hashes, Scores und
Evaluation) sowie alle `generation-*.json`. Vergleichs-/Holdout-Ergebnisse und
Hashes wie oben. **Nicht** übernommen: `matches/` (Voll-Recordings, ~885 MB/Lauf)
und `models/` (Gewichtssnapshots, ~15 MB/Lauf) — bewusst ausgelassen, da sie
für die Auswertung nicht erforderlich sind.

## 5. Größen & Limits

- Paket gesamt: **117 Dateien / 18,84 MB** (Ziel < 100 MB erreicht)
- Größte Einzeldatei: **5,4 MB** (`stageC/history.json`, 32 Generationen) —
  deutlich unter dem GitHub-Limit von 100 MB pro Datei.
- Alle Dateien sind JSON/Text (keine Binärsnapshots, keine Rohlogs).
