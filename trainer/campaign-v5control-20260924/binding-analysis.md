# §4 Binding-Analyse (Echte Engine-Kandidaten)

- Engine-Commit: `13b403387af01d388f8c8ed8c953b6d3a11d1457`
- Kandidaten-Modell (SHA): `fnv1a-f7428913-14382`
- Szenarien: 12 (v5di-1v1-world-balanced, v5di-1v1-world-rush, v5di-1v1-europe-balanced, v5di-1v1-europe-rush, v5di-official-2v2-world-balanced, v5di-official-2v2-world-rush, v5di-official-2v2-europe-balanced, v5di-official-2v2-europe-rush, v5di-ffa-duo-world-balanced, v5di-ffa-duo-world-rush, v5di-ffa-duo-europe-balanced, v5di-ffa-duo-europe-rush)
- Entscheidungsfelder: **1473** (alle mit per-Kandidaten-Binding)
- Tatsächlich angewendeter Gain: **18**

## 1. Barrieren vs. Hebel

| Metrik (tatsächliche Werte) | min | p25 | p50 | p75 | p90 | max | Ø |
|---|---|---|---|---|---|---|---|
| Regel-Nutzungs-Gap 1↔2 (Barrier) | 0 | 10 | 31 | 55 | 90 | 641 | 45.3 |
| Modell-Score-Gap Regel↔Modell (Hebel) | 0.000 | 0.000 | 0.001 | 0.220 | 0.558 | 1.978 | 0.190 |

Die Regel-Gaps sind in Einheiten der **integeren Regel-Nutzens**; der Modell-Hebel ist der Score-Unterschied ∈ [-2,2]. Ein Wechsel braucht `Gain × Score-Gap ≥ Regel-Gap`.

## 2. Echter erforderlicher Gain (kein Durchschnitt)

- Felder, in denen das Modell einen **anderen** Kandidaten bevorzugt: **477 / 1473**
- Echter erforderlicher Gain, um den Regel-Pick zu schlagen: min 0.0, p50 538.0, p90 1676654.7, max 530253214.3
- Echter erforderlicher Gain **≤ 18** (sollte bei aktuellem Gain wechseln): **38**
- Tatsächlich gewechselt (changedIntent): **37** (Quote 2.51%)
- Blockiert (safetyBlockReason gesetzt): **596** — Gründe: model-preference-blocked=596
- Legal, vom Modell bevorzugt, aber nicht gewählt: **597**

## 3. Round / Clamping / ID-Mapping / Priorität / Features

- Round() ändert Top-1 (exakt vs. gerundet): **2** Felder
- ID nicht in Binding gemappt: **0**
- ruleChoice ≠ Regel-Rang-0: **0**
- modelChoice ≠ Argmax-Score: **156**
- Felder mit fehlendem modelScore: **0**
- Felder mit fehlendem ruleUtility: **0**

## 4. Verteilung des tatsächlichen Gain-Bedarfs

Kumulativ: wie viele Modell-Präferenz-Felder bei welchem Gain gewechselt hätten.
| erforderlich Gain (kumulativ) | Felder |
|---|---|
| ≤ 1 | 2 |
| ≤ 5 | 7 |
| ≤ 10 | 17 |
| ≤ 18 | 38 |
| ≤ 30 | 68 |
| ≤ 60 | 178 |
| ≤ 150 | 477 |

## 5. Pro Szenario

Notiz: `modelChoice ≠ Argmax-Score` zählt Felder, in denen das globale Raw-Score-Argmax außerhalb der von der Steuerung betrachteten Top-8 liegt (Design-Artefakt, kein Fehler).
| Szenario | Felder | Modell bevorzugt andere | Gain ≤ 18 | gewechselt | blockiert |
|---|---|---|---|---|---|
| v5di-1v1-world-balanced | 179 | 39 | 4 | 4 | 40 |
| v5di-1v1-world-rush | 179 | 55 | 2 | 2 | 68 |
| v5di-1v1-europe-balanced | 179 | 30 | 4 | 4 | 35 |
| v5di-1v1-europe-rush | 93 | 10 | 0 | 0 | 39 |
| v5di-official-2v2-world-balanced | 97 | 36 | 2 | 2 | 51 |
| v5di-official-2v2-world-rush | 53 | 8 | 1 | 0 | 25 |
| v5di-official-2v2-europe-balanced | 43 | 31 | 1 | 0 | 31 |
| v5di-official-2v2-europe-rush | 79 | 15 | 3 | 3 | 22 |
| v5di-ffa-duo-world-balanced | 64 | 24 | 0 | 0 | 34 |
| v5di-ffa-duo-world-rush | 179 | 111 | 5 | 5 | 118 |
| v5di-ffa-duo-europe-balanced | 179 | 64 | 13 | 14 | 55 |
| v5di-ffa-duo-europe-rush | 149 | 54 | 3 | 3 | 78 |

## 6. Interpretation & Entscheidung

- Das Modell bevorzugt in **477** Feldern einen anderen Kandidaten als die Regelbasis.
- Der Score-Unterschied, mit dem es die Regel-Pick überbieten will, ist winzig: p50 ≈ 0.0009, p90 ≈ 0.558. Der Modell-Hebel ist also klein.
- Die Regel-Barrier ist dagegen groß (integer): p50 ≈ 31, p90 ≈ 90.
- Folglich ist der erforderliche Gain riesig: p50 ≈ 538, p90 ≈ 1676655.
- Bei aktuellem Gain 18 wechseln **38** dieser Felder; bei Gain 60 (Cap) **178**; das Median-Feld würde Gain ≈ 538 brauchen (≈ 30× aktuell).
- **Fazit:** Der Engpass ist nicht allein der niedrige Gain — er ist die **Score-Entartung des Modells** (nahezu konstante Scores über die legalen Kandidaten). Ein bloßes Hochsetzen des Gains (Variante B) würde die meisten Präferenzen weiterhin blockiert lassen und ist „der Gain maximal hochgesetzt". Die principled-Fix liegt in einer **Kalibrierung des Score→Utility-Mappings** (Variante C), die den Modell-**Rang** (nicht die Raw-Magnitude) in den Re-Ordering einbringt, bzw. in einer **Konfidenz-Threshold-Steuerung** (Variante G), die nur bei klarer Modell-Präferenz übersteuert.

