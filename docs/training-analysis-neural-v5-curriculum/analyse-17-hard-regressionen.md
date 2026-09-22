# Analyse: 17 Hard-Regressionsfälle V5-V4-prov vs. stageC

**Zweck:** Gezielte Situationsanalyse der 17 Paare, in denen V5-V4-prov gegen
stageC im gepaarten Hard-Holdout (evaluation-v2, N=48) als Regression
klassifiziert wurde. Grundlage für das V6-Design (Richtung: Kollaps-Situationen
beheben, nicht erneut Aggressivität erhöhen).

**Daten:**
- `holdout/difficulty-Hard/evaluation.json` — Zeilen aller 34 Partien
  (17 Paare × stageC + V5-V4-prov); Gate-Klassifikation 1:1 reproduziert
  (improved 24 / regressed 17 / tied 7 = `decision.json`).
- `matches/<Modell>/<seed>-<Karte>-<Nation>/match.json` — Trajektorie
  (Samples ~alle 200–600 Ticks), `military` (Reserve/Incoming/Incidenten),
  `defense`, `fleet`, `victoryThreat`, `marine`, `gameEnd`, `finalState`.
- `events.jsonl` — Stichproben (Collapse-Dynamik, Krisenmeldungen).

---

## 1. Die 17 Fälle in drei Situationstypen

### Typ A — Frühe Total-Auslöschung (6/17)

V5 baut 15–42k Land auf und wird mit **0 Land** durch Tick ~4300–5650
eliminiert. stageC überlebt dieselben Partien meist bis >10000 Ticks.

| Paar | stageC | V5 | Auslöser |
|---|---|---|---|
| v5hold-2 Europe\|4 | Defeat 13101 / 9k | **Wipe 4900** (Peak 15.5k@4200) | Einzelangriff 1.66M |
| v5hold-3 Europe\|4 | Defeat 7320 / 0 | **Wipe 5063** (Peak 15.1k@1000) | Einzelangriff 1.63M |
| v5hold-5 World\|1 | incomplete 18000 / 105k | **Wipe 5648** (Peak 31.6k@3000) | Einzelangriff 1.66M |
| v5hold-11 World\|1 | Defeat 11971 / 25k | **Wipe 4791** (Peak 31.2k@3800) | verteilte Abnutzung (Home 1.5M→391k) |
| v5hold-4 World\|4 | Defeat 5891 / 315 | **Wipe 4291** (Peak 41.7k@3600) | schlechter Spawn, beide sterben früh |
| v5hold-5 Europe\|4 | Defeat 10892 / 0 | **Wipe 4682** (Peak 15.1k@4200) | Angriff 266k + Abnutzung |

**Mechanismus (4 der 6):** Ein einzelner massiver Angriff von **1.6–1.9M
Truppen** erreicht die Heimatbasis, während V5 sich weiter ausdehnt
(neutrale Landungen 10–15, Transporte 12–15 gleichzeitig). End-Zustand:
Home-Ratio 0.08–0.82, Defense-Status „Keine rückrufbaren Angriffe" —
der Rückrufzeitpunkt wurde verpasst. Die Reserve-Floor-Logik
(`reserveReason: "incomingFloor"`) war aktiv, aber unzureichend: Der Bot
kommitierte weiter Truppen trotz des eintreffenden Mega-Angiffs.
In 3 Fällen sind die Angreifer-Truppen fast identisch (~1.63–1.66M) —
das ist das Muster „Nation mit voller Streitmacht", eine
charakteristische Hard-Situation, die der Bot systematisch nicht
verteidigt.

### Typ B — Spät-Spiel-Kollaps nach massivem Peak (2/17, beide Europe, beide Seed 0)

| Paar | V5 | stageC |
|---|---|---|
| v5hold-0 Europe\|1 | Peak **301k@9600** → c50@12400, Defeat 12451 / 109k (Retention 36%) | Peak 318k@13200 → **incomplete 18000 / 274k** (86%) |
| v5hold-0 Europe\|4 | Peak **158k@6200** → c50@9600, Defeat 11561 / 27.7k (17%) | Peak 393k@15600 → **incomplete 18000 / 369k** (94%) |

**Mechanismus:** V5's Expansionskurve erreicht ihr Maximum **3600–9000
Ticks früher** als stageC's und fällt danach ab (Europe\|1: Incoming 2.5M
beim Tod; Russia 80%/455k). stageC wächst langsamer, aber das Maximum
liegt später und die Kette hält. V5 hat in diesen Partien das mit Abstand
höchste Peak-Land des gesamten Holdouts — und lässt es fast komplett
fallen. Das ist die globale Signatur in einem Satz: V5 hat die höchsten
Hard-Peaks (67.6k Ø), aber die **niedrigste Retention (0.454)** und die
**größte Peak-Abgabe (−30.7k Ø)** aller sieben Modelle.

### Typ C — Tod 1600–4200 Ticks früher als stageC (8/17) + ein Spät-Territoriumsdefizit (1/17)

Beide Modelle sterben (bzw. beide erreichen 18000), V5 nur deutlich
früher bzw. mit weniger Land:

| Paar | V5 → stageC | Anmerkung |
|---|---|---|
| v5hold-0 World\|1 | Defeat 12001/28.6k → **victory 11341/129.5k** | V5 verliert eine Partie, die stageC gewinnt (Iran 80.5%) |
| v5hold-1 Europe\|1 | 8541/71k → 9941/50k | V5 früher tot, aber mehr Land (dT−1400) |
| v5hold-1 Europe\|4 | 7776/0 (Peak 23k@4600) → 11201/25k | |
| v5hold-2 World\|1 | 7561/4.4k (Peak 35.9k@3600) → 10491/31k | China 80% |
| v5hold-3 World\|1 | 8191/24.5k → 15421/31k | beide an Sudan (80%) |
| v5hold-3 World\|4 | 12471/29.9k (Peak 86.3k, −56k) → 16701/29.7k | Incoming 4.06M |
| v5hold-6 World\|4 | 8211/17.3k → incomplete 18000/28.8k | Zambia 82% |
| v5hold-10 Europe\|4 | 9991/19.4k → 12506/0 | dT−2515 |
| v5hold-4 World\|1 | **incomplete 18000/81k → 18000/106k** | kein Tod; reiner Spät-Territoriumsdefizit (−24%) |

Gemeinsam: V5's Peak liegt (14/17 Paare insgesamt) **vor** stageC's Peak
— V5 brennt seine Expansion früh ab (Peaks bei 2800–8800), stageC's
Peaks liegen später (7800–15600) und die Abgaben sind moderat.

---

## 2. Querschnitts-Befunde (quantitativ)

1. **Peak-Timing:** In **14/17** Paaren erreicht V5 sein Peak-Land früher
   als stageC (V5-Median ≈ 4200, stageC ≈ 8400 Ticks). Die
   Regressionsursache ist kein „zu wenig Land aufbauen", sondern
   „**Peak zu früh, dann Absacken**".
2. **Mega-Angregiffs-Regime:** In **8/17** Partien ist beim Tod ein
   Einzelangriff ≥ 1M Truppen eingehend (1.06–4.06M); Home-Ratio 0.08–0.97.
   Die Reserve-Floor-Logik erkennt das Regime (`incomingFloor`), verhält
   sich aber nicht konsequent verteidigend.
3. **Victory-Threat:** In **11/17** Partien steht die drohende Nation
   beim Tod von V5 bei **≥ 80 %** Fortschritt (Sieg-Schwelle) — V5
   expandiert derweil woanders. stageC steht in denselben Partien oft
   vor derselben Bedrohung, überlebt aber länger (höhere Retention,
   späterer Peak).
4. **Logistik ist nicht der Auslöser:** `bridgeheadLost = 0` in allen 17
   Fällen; `transportArrived` 12–36 (funktioniert); `warshipSent` 0–3
   (niedrig, aber vergleichbar mit stageC). Der Kollaps ist ein
   **Reserve-/Verteidigungsversagen**, kein Logistikversagen.
5. **Zell-Konzentration:** Europe\|4 = 6/12 (50 %), World\|1 = 6/12
   (50 %) — die beiden schwächsten Zellen des Grids. Europe\|1: 2/12,
   World\|4: 3/12. Europe\|4 ist das früheste Regime (Wipes bei
   4291–5063), World\|1 das mittlere (7561–12001).
6. **Fleet-Status:** 9/17 enden mit „Küstenschutz: Hafen fehlt" — Folge
   der Landverluste (Häfen stehen auf Land), nicht Primärursache.

## 3. Was V5 hält — das zu Behaltende

**4 Siege (alle World):** v5hold-5 World\|4 (t16661), v5hold-7 World\|4
(t13211), v5hold-9 World\|1 (t6951), v5hold-10 World\|1 (t9071) —
zwei schnelle Eliminationen. stageC gewinnt 2/48 (World\|1 t11341,
World\|1 t8411); V5 gewinnt die Paar-Partie v5hold-10 World\|1, in der
stageC nur überlebt.

**24 Verbesserungen:** 3 Rang-Verbesserungen (2× defeat→victory,
1× incomplete→victory), 1× defeat→incomplete (V5 überlebt bis 18000),
20 Paar-Verbesserungen über Überlebensdauer +240…+9830 Ticks
(v. a. Europe\|4: +9830, +4522; World\|4: +5740, +9074). **Außerhalb
der 17 Zellen ist V5 generisch robuster als stageC** — die 17 Fälle
sind konzentrierte Failure-Modi, keine allgemeine Degradation.

## 4. Implikationen für V6 (zielgerichtet, nicht „aggressiver")

Die 17 Fälle definieren vier trainierbare Situationen:

1. **Kollaps-Kurriculum auf den 17 Zellen** (Europe\|4, World\|1, World\|4,
   Europe\|1). **Methodischer Hinweis:** Die 17 Seeds (`v5hold-*`) sind
   Holdout-Seeds — V6 sollte auf **neuen Seeds** (`v6train-*`) derselben
   Zellen trainieren und die 17 Originalzellen als Dev-Set verwenden,
   damit das Promotion-Grid disjunkt bleibt.
2. **Reward-Shaping gegen Peak-then-Collapse** (der Kern): Das aktuelle
   `strategic-held-land-v2` belohnt Höhe, bestraft aber nicht das
   Absacken. V6 braucht: (a) Penalty auf `lostFromPeak`/Retention,
   (b) Belohnung für **Spät-Wachstum** (Land bzw. Wachstumsrate bei
   t ≥ 12000 — die Typ-B-Partien zeigen, dass stageC dort noch +100k
   Land gewinnt, wo V5 −192k verliert), (c) harter Wipe-Penalty
   (Land→0). Der Fast-Win-Bonus (frühe Elimination) bleibt, damit die
   vier World-Siege nicht verloren gehen.
3. **Mega-Angregiffs-Verteidigung:** Im Regime „Incoming ≥ ~1M Truppen"
   muss der Reserve-Floor konsequent greifen: Rückruf/Kein-Commitment,
   bis die Bedrohung gebannt ist. 8/17 zeigen, dass der Bot genau dann
   weiter expandiert (neutrale Landungen, Attacken), wenn der Mega-
   Angriff eintreffet. Das ist eine isolierte, in den 17 Partien
   reichlich vertretene Situation — gut trainierbar.
4. **Threat-Response-Schwelle:** Bei ≥ 70–80 % Fortschritt der
   drohenden Nation: Prioritätsschalter von Expansion auf Reaktion
   (Angriff auf die Bedrohung oder Befestigung). 11/17 zeigen
   ≥ 80 % zum Todeszeitpunkt.
5. **Gate-Budget:** Das Gate verlangt `candidateWins > incumbentWins`,
   `regressed ≤ 12` und `net ≥ 0`. V5 steht bei 4 Wins / 17 Regressions
   / Net +7. V6-Ziel: **≥ 3 Wins behalten, ≥ 5 (ideal: alle 6) der 17
   Regressions beheben**, Net ≥ 0. Typ A ist das billigste Gewinnfeld
   (frühe Total-Wipes sind deterministische Failure-Modi mit klarem
   Reward-Signal).
6. **Startpunkt:** Stammbaum V5-V4-prov als Basis (Sieg-Chancen bleiben),
   mit dem A-Champ-Profil (Retention 0.598, Eliminations 5/48 — bestes
   Gebiets-Halten des Holdouts) als Verhaltens-Referenz, die der Reward
   abbildet. Alternativ: zweites Experiment von A-champ mit
   victory-weightetem Reward, um die beiden Linien zu „kreuzen".

## 5. Datenlage / Nachvollziehbarkeit

- Gate-Reproduktion: `evaluation.json`-Zeilen + `evaluation-v2`-Regel →
  exakt 24/17/7 (übereinstimmend mit `decision.json`).
- Alle Aussagen pro Fall aus `match.json` der jeweiligen Partie
  (Trajektorie + End-Zustand); keine Schätzungen aus Aggregate.
- Auswertungsskript: `tools/benchmark/analyse-17-hard-regressionen.cjs`
  (wiederverwendbar für V6-Holdouts).
