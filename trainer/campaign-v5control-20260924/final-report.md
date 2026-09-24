# V5 Control Kampagne – Finaler Bericht (§5–§10)

- Kampagne: `trainer/campaign-v5control-20260924/` (OpenFront Neural Schema 5 – Controller-Varianten)
- Engine-Pin: `13b403387af01d388f8c8ed8c953b6d3a11d1457`
- Bot-Datei (identisch in allen Armen): `OpenFront_Solo_AggroBot.user.js`, SHA-256 `f2b4c2286ab2d26c0a09a352a18597d717c24cb16d02d1030423258764fbea1d`
- Schema-5 Kandidatenmodell: `trainer/campaign-v5rank-20260924/candidate-model.json` (policySHA256 `16b686d291addf4e9c14c7c03e80308b6cb7474fd90dbd5efb60065c9a2b4f93`, Modelldatei SHA-256 `a0bcf6439bee6274c17ef2101a8457b4bc89c1cd6af814cca0e96a90258f010f`)
- Run3 Champion (schema-4): `docs/training-analysis-20260921/schema4-impossible-world-europe-20260920-run3/champion.json` (policySHA256 `e0fceaef90d542d3811dcd0b261fb3284577cf319912989a2f3eaa7647d39968`)
- Hinweis zur Provenienz: `botSHA256` in den Match-Reports ist der Digest der **effektiven Quelle**. Für die Armen A–G wird das Schema-5-Modell per `SHADOW_V5_BUNDLED_MODEL` in die Bot-Quelle eingebettet, bevor gehasht wird (→ `eaf778bdfbdfa2eb760aaf22e141b9acf3c3de00e8befd95636c821470271daf`); rule-basis und run3-schema4 zeigen die unveränderte Datei (`f2b4c228…`). Die `.user.js`-Datei selbst ist in allen Armen identisch.

## §5 – Controller-Varianten (implementiert, getestet, verifiziert)

`candidateControlVariant()` in `src/runtime/decision-kernels.cjs` mit fünf Modi (raw / calibrated / adaptive / rank / gated), verdrahtet durch `00-bootstrap.js`, `20-military-and-planning.js`, `engine-match.mjs`, `tools/benchmark/common.cjs`. Alle harten Sicherheitschecks bleiben wirksam; nur bereits-legale Kandidaten werden neu sortiert. Pro Frame werden `controlMode`, `controlCapGain`, `controlConfidenceRef`, `controlMargin` im `planningFrame` exponiert (in dieser Session ergänzt und per Smoke-Match verifiziert, z. B. `controlMode="calibrated"`). Details: `controller-variants.json`.

## §6 – Echte Engine-Vergleiche (9 Armen × 12 Szenarien = 108 Matches)

Protocol: v5di-Seed-Namespace (disjunkt zu Training/Holdout), 3 Modi (1v1 / official-2v2 / ffa-duo) × 2 Karten (World/Europe) × 2 Gegner (balanced/rush), 18000 Ticks, Compact/Medium. Gleicher Seed pro Szenario isoliert den Effekt von Modell/Mapping. Artefakte: `controller-comparison/` (108× `match.json`), `controller-comparison/capture-manifest.json`, `controller-comparison/decision-impact.json`, `engine-comparison.json`.

| Arm | meanEndLand | changedRate | blockedRate | W/L (bestätigt) | Paired vs rule-basis |
|---|---|---|---|---|---|
| rule-basis | 95605.6 | 0 % | 0 % | 2/5 | – |
| run3-schema4 | 92793.8 | 0 % | 0 % | 3/7 | 5+ / 6− / 1= (Ø −2811.8) |
| A (raw 18) | 95605.6 | 2.01 % | 43.64 % | 2/5 | **0+ / 0− / 12=** |
| B (raw 60) | 95605.6 | 10.67 % | 34.98 % | 2/5 | **0+ / 0− / 12=** |
| C (calibrated) | 95605.6 | 15.18 % | 30.47 % | 2/5 | **0+ / 0− / 12=** |
| D (adaptive) | 95605.6 | 6.68 % | 38.96 % | 2/5 | **0+ / 0− / 12=** |
| E (hybrid 4+5) | 92793.8 | 2.70 % | 41.28 % | 3/7 | 5+ / 6− / 1= (== run3 in 12/12) |
| F (rank 60) | 95605.6 | 29.07 % | 16.57 % | 2/5 | **0+ / 0− / 12=** |
| G (gated) | 95605.6 | 6.10 % | 39.54 % | 2/5 | **0+ / 0− / 12=** |

### Entschiedene Beobachtungen

1. **Der Candidate-Control-Kanal ist in dieser Architektur provbar neutral.** A–D, F, G landen in **allen 12 Szenarien exakt** auf dem rule-basis-endLand (paired Delta = 0 in 12/12), E exakt auf run3-schema4. Das Modell sortiert die beschränkte Kandidatenliste neu, aber die ausgeführte Aktion – und damit das Land – ändert sich nie.
2. **Qualität der geänderten Frames:** Bei jedem Arm gehen 95–99 % der Changes auf Kandidaten mit **niedrigerer** Regel-Nutzen (0 nach oben), Ø-Nutzungsverlust 11.6–22.1 pro Flip, systematische Bias Richtung `naval` (und `invest` bei A/E). Der Modell-Score ist selbst leicht negativ (Ø ≈ −0.56 bei A–D/F/G, −0.53 bei E) – das Modell bewertet die Kandidaten selbst unterhalb der Nulllinie.
3. **Verwerfungsregel angewendet:** „Verwerfe Varianten, die mehr Entscheidungen verändern, aber schlechter spielen“ – die Arm mit den meisten Changes (F 29 %, C 15 %, B 11 %) kaufen **kein** Land gegenüber dem minimal-change-Arm A (2 %).
4. **run3-schema4 unter rule-basis im Dev-Set:** Ø −2811.8, in 6/12 Szenarien negativ (1 gleich), bestätigtes W/L 3/7 vs. 2/5. Kein klarer Vorteil in eine Richtung – der Hybrid E fügt run3 nichts hinzu.

## §7 – Fine-Tuning-Entscheidung

**Bedingung erfüllt:** Das Modell bevorzugt systematisch Kandidaten mit niedrigerer Regel-Nutzen (95–99 % der Changes nach unten, naval/invest-Bias, Ø-Score < 0) – das ist genau das „sinnlose Kandidaten“-Signal der Bedingung.

**Entscheidung:** Feinjustierung ist der **nächste Hebel**, aber kein Promotionspfad in diesem Zyklus. Grund: §6 zeigt, dass der Live-Steuerkanal bei Gain 18 land-neutral ist – selbst ein perfekt kalibriertes Modell würde bei der aktuellen Offline-to-Live-Bindungs-Lücke (der Live-Gate lässt ~2 % der offline entschiedenen Changes durch) kein Land bewegen. Eine Feinjustierung (Score-Alignierung an realisierte Regel-Nutzen, naval/invest-Bias entfernen) lohnt sich erst in Kombination mit der Schließung der Bindungs-Lücke (höherer wirksamer Gain / engere Safety-Schwelle), das ist das nächste Experiment.

## §8 – Fresh Holdout

**Nicht ausgelöst.** Regel: nur bei klarem Dev-Vorteil gegenüber rule-basis. Keiner der sieben Controller-Varianten schlägt rule-basis (A–D, F, G exakt gleich; E unter rule-basis und exakt gleich run3). Dokumentation: `holdout-manifest.json`.

## §9 – Artefakte und Hashes (SHA-256, erste 16 hex)

| Artefakt | SHA-256 |
|---|---|
| `trainer/campaign-v5control-20260924/binding-analysis.md` | `02e7ada4a8a8142c…` |
| `trainer/campaign-v5control-20260924/binding-analysis.json` | `78df338987f3cf99…` |
| `trainer/campaign-v5control-20260924/controller-variants.json` | `5379ae0b9a42c8d9…` |
| `trainer/campaign-v5control-20260924/engine-comparison.json` | `5ba03352ee57864c…` |
| `trainer/campaign-v5control-20260924/controller-comparison/capture-manifest.json` | `c8bdddf697e7c3e5…` |
| `trainer/campaign-v5control-20260924/controller-comparison/decision-impact.json` | `365023e227f785a5…` |
| `trainer/campaign-v5control-20260924/holdout-manifest.json` | `6ee4541f650a47d9…` |
| `trainer/campaign-v5control-20260924/promotion-decision.json` | `88f38a3c5456cf4b…` |
| `trainer/campaign-v5rank-20260924/candidate-model.json` (Datei) | `a0bcf6439bee6274…` |
| `trainer/campaign-v5rank-20260924/training-manifest.json` | `9dd8be0782a0cee4…` |
| `trainer/campaign-v5rank-20260924/holdout-manifest.json` | `0b107972ec2f2de1…` |
| `docs/…/run3/champion.json` (Datei) | `65589febcf8a376c…` |
| `OpenFront_Solo_AggroBot.user.js` | `f2b4c2286ab2d26c…` |

Modell-Digests (policySHA256-Form, `digest(JSON.stringify(parsed))`): Schema-5 Kandidat `16b686d291addf4e…`, Run3 Champion `e0fceaef90d542d3…`.

## §10 – Champion-Entscheidung (gated)

**Kein neuer Champion. Run3 (schema-4) bleibt ACTIVE.**

Begründung: Ein neuer Champion muss **beide** Baselines schlagen (rule-basis UND Run3) plus Safety und negative Gates. Keiner der sieben Controller-Varianten schlägt rule-basis (A–D, F, G land-identisch in 12/12; E land-identisch run3 und unter rule-basis). Ohne Regelvorteil gibt es keine gated Ersetzung. Die Schema-5-Infrastruktur (fünf Mapping-Modi, pro-Frame-Binding, Sicherheitsstack) bleibt als verifizierte Basis im Code; die zwei entscheidenden Hebel für den nächsten Zyklus sind (1) die Offline-to-Live-Bindungs-Lücke und (2) die Modell-Kalibrierung (§7).
