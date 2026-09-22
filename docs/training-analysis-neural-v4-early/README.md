# Neural V4 — Early Survival & Expansion (Kampagnen-Spezifikation)

Kampagnen-Spezifikation für `benchmark-results/neural-v4-early/`
(local, gitignored — Treiber: `tools/benchmark/v4-early-campaign.mjs`,
Launcher: `Start_V4_Early_Campaign.bat`).

**Status: geplant** — dieser Ordner erhält nach dem Lauf die
verdichtete Analyse (`evaluation-summary.json` via `report`-Phase).

## Ziel

Der frühe Spielverlauf (Ticks 2.000–7.200) ist die kritische Phase, in
der gegen Impossible-Gegner das Überleben und die Expansionsbasis
entschieden werden. V4 untersucht, ob ein auf 7.200-Tick-Partien
trainiertes Schema-4-Modell folgende Fähigkeiten gegenüber den
Referenzmodellen robust verbessert:

- früheren Wirtschaftsaufbau (Gold-Einnahmen, Income-Steuerung)
- Fabrikbau (Truppenreserve aufbauen, statt nur zu erobern)
- Verteidigung vor dem gegnerischen Push
- Vermeidung von Gebietsverlusten durch überdehnte Angriffe
  (Kollaps-Guard im Reward: `lostFromPeak`-Strafweight 0.20)

## Startmodell & Champion

- **Startmodell:** A-champ
  (`0b526b7717b5975ebad583d167441f2646b14caa625a2f727783803e33a978a5`)
  — experimenteller Kandidat (bestes Generalisierungsverhalten aus V3).
- **Offizieller Champion bleibt stageC**
  (`84d1f593039166f9e953272524ac1018b4034adcf4304cb4e6c49757d752d2e1`)
  — kein automatischer Live-Bot-Austausch (`autoDeploy=false`).
- Alle V4-Kandidaten müssen im gepaarten Holdout gegen stageC **und**
  A-champ die unveränderte `evaluation-v2`-Promotions-Regel bestehen.

## Trainings-Konfiguration (eingefroren im Treiber)

| Parameter | Wert |
|---|---|
| Engine (gepinnt) | `bb8af015b515b3b717bd4d901074c5f4c16641cb` |
| Bot | `OpenFront_Solo_AggroBot.user.js`, `botSHA256 008c1a25…246` |
| Schema | 4 (24×24×16-tanh, exakt 1000 Gewichte) |
| Schwierigkeit / Karte | Impossible / World |
| Nationen | 1, 4 |
| **Ticks** | **7200** (Fokusfenster; komplettes Reward-Signal liegt im Fenster) |
| Generationen | 10 |
| Population | 6 |
| trainSeeds / evalSeeds | 3 / 4 (disjunkt) |
| sigma | 0.12 |
| Parallel | 16 |
| Reward / Gate | `strategic-held-land-v2` / `evaluation-v2` (beide unverändert) |
| Partien | 58/Generation × 10 = **580** |

7200-Tick-Partien beenden das Reward-Signal im Fokusfenster:
Ticks 2.000–7.200 sind der early-game-Bereich, in dem V4 lernen soll.
Das Holdout bleibt 18.000 Ticks (volles Spiel), um die
Generalisierung über das Trainingsfenster hinaus zu testen.

## Unabhängiger gepaarter Holdout (disjunkte `v4hold-*`-Samen)

- **Modelle:** zero, stageC, run3, A-champ (4 Referenzen) +
  V4-Kandidaten (Provisional, ggf. Champion) → 4–5 Modelle
- **Schwierigkeiten:** Hard **und** Impossible
- **Karten:** World **und** Europe (Kontrolltest)
- **Nationen:** 1, 4
- **Samen:** `v4hold-0…11` (12 Seeds, disjunkt zu allen `v3hold-*`- und
  Trainings-/Eval-Seeds)
- **Setup:** Singleplayer/FFA, 0 scripted, balanced, 18000 Ticks,
  Profil `autonomous`
- **Umfang:** 48 Partien/Modell/Schwierigkeitsgrad
  → **480 Basismatches** (5 Referenzen), bis 576 inkl. V4-Champ
- Pro Partie provenanzverifiziert (Policy-SHA, Bot-SHA, Engine-Commit
  in `run.json`), fehlgeschlagene Partien werden einmal wiederholt;
  der Holdout ist fail-closed.

## Freigabe-Kriterien (Entscheidungs-Regel)

Ein V4-Kandidat wird nur dann als **Kandidat für die Freigabe**
empfohlen (nicht automatisch freigegeben), wenn im gepaarten Holdout
(beide Schwierigkeiten) gegenüber stageC und A-champ gilt:

- **unabhängige Siege** (victory, nicht Tick-Limit) gegen Referenzen
- **robuste Verbesserungen** gemäß `evaluation-v2`
  (regression-freie, über alle Seeds reproduzierbare Gewinne)
- **Kein automatischer Live-Bot-Austausch** — die Freigabe ist
  manuell (Deployment via `deploy.mjs` nach expliziter Entscheidung).

Entscheidungs-Datei: `decision.json` (aus `report`-Phase),
Zusammenfassung: `summary.json` und `evaluation-summary.json`.

## Ausgeführte Phasen

| Phase | Beschreibung |
|---|---|
| setup | Engine-Check, Bot-SHA-Verifikation, `campaign.json` schreiben |
| train | 10 Generationen × 58 Partien (resumierbar) |
| holdout | 480 Partien (5 Modelle × 2 Schwierigkeiten × 24 Partien) |
| report | `evaluation.json` pro Schwierigkeit, `decision.json`, `summary.json` |
| all | alle Phasen der Reihe nach |

## Referenzmodelle (Policy-SHA256)

| Label | SHA256 | Herkunft |
|---|---|---|
| zero | `a1e8b35677991f244e55c7734e21caa5a4f6cb6086192bef9857e3265084127e` | 1000 Nullen |
| stageC | `84d1f593039166f9e953272524ac1018b4034adcf4304cb4e6c49757d752d2e1` | offizieller Champion |
| run3 | `e0fceaef90d542d3811dcd0b261fb3284577cf319912989a2f3eaa7647d39968` | Live-Run3 |
| A-champ | `0b526b7717b5975ebad583d167441f2646b14caa625a2f727783803e33a978a5` | V3 Phase-A-Champion |
