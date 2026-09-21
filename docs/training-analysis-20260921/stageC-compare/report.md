# Stage C – kontrollierter Modellvergleich

Vergleich von **stageC** (Referenz) gegen den **regelbasierten Bot** und die übrigen **unterschiedlichen Champion-Modelle**

## Identische Bedingungen (alle Entitäten, alle 8 Konfigurationen)

| Parameter | Wert |
|---|---|
| Engine-Commit | `bb8af015b515b3b717bd4d901074c5f4c16641cb` |
| Karten / Größe | World, Europe / Compact |
| Nationen (Gegner) | 1 und 4 (AI, Impossible) |
| Seeds | `cmp-<Map>-<Nation>-<A/B>` (8, für alle identisch) |
| Schwierigkeit / Bots | Impossible / 0 |
| Ticks / Profil | 18000 / autonomous |
| Modus / Gegnerprofil | FFA / balanced, scriptedHumans 0 |
| Bot | `OpenFront_Solo_AggroBot.user.js` v1.19.4 (identischer Code) |
| Neural | Champions: `--policy <champion.json>` · regelbasiert: kein Policy |

Bestimmung: identische Karten, Seeds und Gegnerkonfiguration; Bot-Zufallsfolge ist seedfixiert, Engine-Commit gepinnt → direkte Vergleichbarkeit.

## 1) Tatsächliche Siege

| Modell | Siege (bestätigt) | Niederlagen | Unvollständig/Tick-Limit | Eliminiert | Game-Over |
|---|---|---|---|---|---|
| rule-based | 0 | 8 | 0 (0) | 4 | 4 |
| stageC | 0 | 8 | 0 (0) | 3 | 5 |
| runC | 0 | 8 | 0 (0) | 4 | 4 |
| run2 | 0 | 8 | 0 (0) | 2 | 6 |
| run3 | 0 | 8 | 0 (0) | 4 | 4 |
| runD | 0 | 8 | 0 (0) | 3 | 5 |
| runA | 0 | 8 | 0 (0) | 5 | 3 |

Siege = `gameEnd.outcome === "victory"` (bestätigt per Engine-WinUpdate). Ein Tick-Limit ist **kein** Sieg.

## 2) Überlebensdauer (End-Tick)

| Modell | Ø End-Tick | Max End-Tick | Tick-Limits |
|---|---|---|---|
| rule-based | 6.017 | 9191 | 0 |
| stageC | 6.854 | 11071 | 0 |
| runC | 7.030 | 12781 | 0 |
| run2 | 6.525 | 11551 | 0 |
| run3 | 6.282 | 9141 | 0 |
| runD | 5.606 | 9141 | 0 |
| runA | 6.071 | 9238 | 0 |

End-Tick = `run.tick` (letzter gespielter Tick bis zum Endergebnis).

## 3) Landbesitz

| Modell | Ø Peak-Land | Ø Ø-Land | Ø End-Land | Ø Retention (End/Peak) |
|---|---|---|---|---|
| rule-based | 34.612 | 23.001 | 17.598 | 0,37 |
| stageC | 36.335 | 23.369 | 17.898 | 0,41 |
| runC | 32.836 | 23.168 | 14.641 | 0,3 |
| run2 | 32.530 | 21.740 | 17.488 | 0,42 |
| run3 | 37.057 | 23.201 | 15.634 | 0,31 |
| runD | 30.320 | 20.398 | 15.610 | 0,4 |
| runA | 30.929 | 17.935 | 12.320 | 0,26 |

Aus `trajectory.summary` (sichtbare Bot-GameView-Samples, alle 200 Ticks).

## 4) Wirtschaft

| Modell | Ø Gold-Einnahmen | Ø End-Gold | Ø bestätigte Bauten | Bau-Stillstände | Ø Wirtschafts-/Neural-Entscheidungen |
|---|---|---|---|---|---|
| rule-based | 167.606 | 205.462 | 7 | 31,5 | 24,5 |
| stageC | 46.875 | 265.212 | 6,8 | 32,6 | 25,3 |
| runC | 174.224 | 310.148 | 7,8 | 36,6 | 24,1 |
| run2 | 149.530 | 188.031 | 7,4 | 34,5 | 23,1 |
| run3 | 268.112 | 221.436 | 7,5 | 33,6 | 27,9 |
| runD | 65.625 | 255.066 | 5,5 | 30 | 18,9 |
| runA | 173.905 | 181.083 | 6,1 | 32,8 | 22,4 |

`income.gold` (beobachtete Gold-Einnahmen), `finalState.gold` (End-Gold), `recording.counts.build_confirmed`/`build_stalled`, `economy_posture`+`neural_economy_choice`.

## 5) Militärische Entscheidungen

| Modell | Ø Angriffs-Entscheidungen | Angriffs-Bestätigungen | Ø Marine-Entscheidungen | Marine-Ankünfte | Ø Operations-Entscheidungen | Nuklear (Best./Vers.) | Ø errungenes Territorium |
|---|---|---|---|---|---|---|---|
| rule-based | 23,6 | 23,6 | 6,9 | 6,3 | 112 | 0/0 | 0 |
| stageC | 22,6 | 22,6 | 6,6 | 6,1 | 155,6 | 0/0 | 0 |
| runC | 23,6 | 23,6 | 5 | 4,1 | 166 | 0,4/0,4 | 0 |
| run2 | 24 | 24 | 5,6 | 4,9 | 154,1 | 0/0 | 0 |
| run3 | 22 | 22 | 8,4 | 7,9 | 159,6 | 0/0 | 0 |
| runD | 25,6 | 25,6 | 3,8 | 3,1 | 135,5 | 0/0 | 0 |
| runA | 24,4 | 24,4 | 4,3 | 3,5 | 126,9 | 0/0 | 0 |

Aus `recording.counts` (`attack_intent`, `attack_confirmed`, `boat_intent`, `boat_arrived`, `director_decision`), `rockets`, `attackReceipts.territoryGained`.

## Pro-Partie-Detail

| Modell | World-1-A | World-1-B | World-4-A | World-4-B | Europe-1-A | Europe-1-B | Europe-4-A | Europe-4-B |
|---|---|---|---|---|---|---|---|---|
| rule-based | d·4648 | d·3871 | d·6391 | d·5001 | d·7331 | d·9191 | d·7913 | d·3791 |
| stageC | d·3643 | d·4971 | d·4123 | d·5211 | d·7331 | d·9141 | d·11071 | d·9343 |
| runC | d·3681 | d·4845 | d·2733 | d·12781 | d·7331 | d·9151 | d·8825 | d·6891 |
| run2 | d·4261 | d·4426 | d·6771 | d·4911 | d·7331 | d·8721 | d·11551 | d·4227 |
| run3 | d·4609 | d·5251 | d·5629 | d·5581 | d·7331 | d·9141 | d·6185 | d·6531 |
| runD | d·1796 | d·3601 | d·3483 | d·5241 | d·7331 | d·9141 | d·5981 | d·8271 |
| runA | d·4143 | d·1755 | d·4804 | d·5661 | d·7331 | d·9151 | d·9238 | d·6485 |

Zellen: `Outcome-Initial·End-Tick` (v=Victory, d=Defeat, i=Unvollständig).

## Entitäten

| Schlüssel | Beschreibung | Policy |
|---|---|---|
| rule-based | Regelbasierter Bot (ohne Neural-Policy) | — (reine Heuristik) |
| stageC | stageC Champion (Kurrikulum, Impossible) | docs\training-analysis-20260921\schema4-ffa-curriculum-20260921-overnight\stageC\champion.json |
| runC | runC Champion (Hard) | docs\training-analysis-20260921\schema4-hard-world-europe-20260921-runC\champion.json |
| run2 | run2 Champion (Impossible) | docs\training-analysis-20260921\schema4-impossible-world-europe-20260920-run2\champion.json |
| run3 | run3 Champion (Impossible) | docs\training-analysis-20260921\schema4-impossible-world-europe-20260920-run3\champion.json |
| runD | runD Champion (Impossible) | docs\training-analysis-20260921\schema4-impossible-world-europe-20260921-runD\champion.json |
| runA | runA Champion (Medium) | docs\training-analysis-20260921\schema4-medium-world-europe-20260921-runA\champion.json |

---
Erstellt von `tools/benchmark/stagec-compare.mjs`. Rohdaten: `report.json`, Einzelmatches: `benchmark-results/stageC-compare/<modell>/<config>/match.json`.
