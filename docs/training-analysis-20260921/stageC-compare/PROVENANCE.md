# Stage C – Vergleich: Provenienz & Konfiguration

Kontrollierter Vergleich von **stageC** (Referenz) gegen den **regelbasierten Bot** und die übrigen
unterschiedlichen schema-4 Champions. Alle Entitäten spielen alle 8 Konfigurationen unter
**identischen Karten, Seeds und Gegnerkonfigurationen**; Bot-Code ist byte-identisch, nur das
Neural-`--policy` unterscheidet sich.

## Modelle (validierte SHA-256)

Hash-Basis: `sha256(JSON.stringify(validate(champion)))` — identisch zu `benchmarkMeta.policySHA256` in jeder Partie.

| Schlüssel | Modell | validierter SHA-256 | Champion-Datei (relativ) | Datei-Bytes | Datei-Raw-SHA256 (12) |
|---|---|---|---|---|---|
| rule-based | Regelbasierter Bot (ohne Neural-Policy) | `— (reine Heuristik)` | `— (kein Policy)` | — | — |
| stageC | stageC Champion (Kurrikulum, Impossible) | `84d1f593039166f9e953272524ac1018b4034adcf4304cb4e6c49757d752d2e1` | `schema4-ffa-curriculum-20260921-overnight/stageC/champion.json` | 26166 | 7f78459b7d52 |
| runC | runC Champion (Hard) | `500353024e380687ffcd4abdd795e18ebe6e8bfdb11b5731b4fbfbdbd99efcc5` | `schema4-hard-world-europe-20260921-runC/champion.json` | 26301 | 019af1ff2d67 |
| run2 | run2 Champion (Impossible) | `c04c0d5967e33395e13ea74c5d7ab6bba100c744c5ee1ab5524a6aeb4fd67033` | `schema4-impossible-world-europe-20260920-run2/champion.json` | 26301 | 528a70d27b27 |
| run3 | run3 Champion (Impossible) | `e0fceaef90d542d3811dcd0b261fb3284577cf319912989a2f3eaa7647d39968` | `schema4-impossible-world-europe-20260920-run3/champion.json` | 26230 | 3ad94547f868 |
| runD | runD Champion (Impossible) | `1e005aedeb128378a38a0c468f4f9e9447718a7e3ef4f7aaf6564dcba764f0ac` | `schema4-impossible-world-europe-20260921-runD/champion.json` | 26125 | c965569b5180 |
| runA | runA Champion (Medium) | `2c0698d8dcd0493c511860471cf6132295b409fb3396b9696bffc2df8a09647f` | `schema4-medium-world-europe-20260921-runA/champion.json` | 26282 | fc02db69b954 |

- Bot: `OpenFront_Solo_AggroBot.user.js` v1.19.4 — SHA-256 `798fc7ba3805183f2038ef78008d41560c6f9973edf52a64b6a84aeeaba641f0` (in allen 56 Partien identisch).
- Engine-Commit: `bb8af015b515b3b717bd4d901074c5f4c16641cb` (Trainings-Commit, gepinnt).
- stageC == stageA == stageB == runE (identisches Modell, validierter Hash wie oben).

## Seed-Zuordnung (8 Konfigurationen, für jede Entität identisch)

| Config-ID | Map | Nationen | Variante | Seed |
|---|---|---|---|---|
| World-1-A | World | 1 | A | `cmp-World-1-A` |
| World-1-B | World | 1 | B | `cmp-World-1-B` |
| World-4-A | World | 4 | A | `cmp-World-4-A` |
| World-4-B | World | 4 | B | `cmp-World-4-B` |
| Europe-1-A | Europe | 1 | A | `cmp-Europe-1-A` |
| Europe-1-B | Europe | 1 | B | `cmp-Europe-1-B` |
| Europe-4-A | Europe | 4 | A | `cmp-Europe-4-A` |
| Europe-4-B | Europe | 4 | B | `cmp-Europe-4-B` |

Seed-Quelle: `GameStartInfo.gameID` (wird von der Engine zur Kartengenerierung verwendet). Bot-RNG wird aus dem Seed abgeleitet → bei identischem Seed, Engine-Commit, Konfiguration und Policy ist das Ergebnis reproduzierbar.

## Genaue Konfiguration (alle Partien)

| Parameter | Wert |
|---|---|
| Engine | `../OpenFrontIO-Impossible` @ `bb8af015b515b3b717bd4d901074c5f4c16641cb` |
| Schwierigkeit | Impossible |
| Karten-Größe | Compact |
| Karten | World, Europe |
| Nationen (AI) | 1 und 4 |
| Neutrale Bots | 0 |
| Max-Ticks | 18000 |
| Profil | autonomous (fullAuto) |
| Spieltyp / Modus | Singleplayer / FFA |
| Gegnerprofil | balanced |
| Scripted Humans | 0 |
| Bot | `OpenFront_Solo_AggroBot.user.js` v1.19.4 |
| Neural | Champions: `--policy <champion.json>` · regelbasiert: kein Policy |
| Clock / Bot-Zyklen | 100ms-Simulation, serial awaited Bot-Zyklen |

## Pro-Partie-Provenienz (Seed, End-Tick, Outcome, Policy-Hash)

| Entität | Config | Seed | End-Tick | Outcome | Policy-Hash (12) |
|---|---|---|---|---|---|
| rule-based | World-1-A | `cmp-…` (`cmp-World-1-A`) | 4648 | defeat | `none` |
| rule-based | World-1-B | `cmp-…` (`cmp-World-1-B`) | 3871 | defeat | `none` |
| rule-based | World-4-A | `cmp-…` (`cmp-World-4-A`) | 6391 | defeat | `none` |
| rule-based | World-4-B | `cmp-…` (`cmp-World-4-B`) | 5001 | defeat | `none` |
| rule-based | Europe-1-A | `cmp-…` (`cmp-Europe-1-A`) | 7331 | defeat | `none` |
| rule-based | Europe-1-B | `cmp-…` (`cmp-Europe-1-B`) | 9191 | defeat | `none` |
| rule-based | Europe-4-A | `cmp-…` (`cmp-Europe-4-A`) | 7913 | defeat | `none` |
| rule-based | Europe-4-B | `cmp-…` (`cmp-Europe-4-B`) | 3791 | defeat | `none` |
| stageC | World-1-A | `cmp-…` (`cmp-World-1-A`) | 3643 | defeat | `84d1f5930391` |
| stageC | World-1-B | `cmp-…` (`cmp-World-1-B`) | 4971 | defeat | `84d1f5930391` |
| stageC | World-4-A | `cmp-…` (`cmp-World-4-A`) | 4123 | defeat | `84d1f5930391` |
| stageC | World-4-B | `cmp-…` (`cmp-World-4-B`) | 5211 | defeat | `84d1f5930391` |
| stageC | Europe-1-A | `cmp-…` (`cmp-Europe-1-A`) | 7331 | defeat | `84d1f5930391` |
| stageC | Europe-1-B | `cmp-…` (`cmp-Europe-1-B`) | 9141 | defeat | `84d1f5930391` |
| stageC | Europe-4-A | `cmp-…` (`cmp-Europe-4-A`) | 11071 | defeat | `84d1f5930391` |
| stageC | Europe-4-B | `cmp-…` (`cmp-Europe-4-B`) | 9343 | defeat | `84d1f5930391` |
| runC | World-1-A | `cmp-…` (`cmp-World-1-A`) | 3681 | defeat | `500353024e38` |
| runC | World-1-B | `cmp-…` (`cmp-World-1-B`) | 4845 | defeat | `500353024e38` |
| runC | World-4-A | `cmp-…` (`cmp-World-4-A`) | 2733 | defeat | `500353024e38` |
| runC | World-4-B | `cmp-…` (`cmp-World-4-B`) | 12781 | defeat | `500353024e38` |
| runC | Europe-1-A | `cmp-…` (`cmp-Europe-1-A`) | 7331 | defeat | `500353024e38` |
| runC | Europe-1-B | `cmp-…` (`cmp-Europe-1-B`) | 9151 | defeat | `500353024e38` |
| runC | Europe-4-A | `cmp-…` (`cmp-Europe-4-A`) | 8825 | defeat | `500353024e38` |
| runC | Europe-4-B | `cmp-…` (`cmp-Europe-4-B`) | 6891 | defeat | `500353024e38` |
| run2 | World-1-A | `cmp-…` (`cmp-World-1-A`) | 4261 | defeat | `c04c0d5967e3` |
| run2 | World-1-B | `cmp-…` (`cmp-World-1-B`) | 4426 | defeat | `c04c0d5967e3` |
| run2 | World-4-A | `cmp-…` (`cmp-World-4-A`) | 6771 | defeat | `c04c0d5967e3` |
| run2 | World-4-B | `cmp-…` (`cmp-World-4-B`) | 4911 | defeat | `c04c0d5967e3` |
| run2 | Europe-1-A | `cmp-…` (`cmp-Europe-1-A`) | 7331 | defeat | `c04c0d5967e3` |
| run2 | Europe-1-B | `cmp-…` (`cmp-Europe-1-B`) | 8721 | defeat | `c04c0d5967e3` |
| run2 | Europe-4-A | `cmp-…` (`cmp-Europe-4-A`) | 11551 | defeat | `c04c0d5967e3` |
| run2 | Europe-4-B | `cmp-…` (`cmp-Europe-4-B`) | 4227 | defeat | `c04c0d5967e3` |
| run3 | World-1-A | `cmp-…` (`cmp-World-1-A`) | 4609 | defeat | `e0fceaef90d5` |
| run3 | World-1-B | `cmp-…` (`cmp-World-1-B`) | 5251 | defeat | `e0fceaef90d5` |
| run3 | World-4-A | `cmp-…` (`cmp-World-4-A`) | 5629 | defeat | `e0fceaef90d5` |
| run3 | World-4-B | `cmp-…` (`cmp-World-4-B`) | 5581 | defeat | `e0fceaef90d5` |
| run3 | Europe-1-A | `cmp-…` (`cmp-Europe-1-A`) | 7331 | defeat | `e0fceaef90d5` |
| run3 | Europe-1-B | `cmp-…` (`cmp-Europe-1-B`) | 9141 | defeat | `e0fceaef90d5` |
| run3 | Europe-4-A | `cmp-…` (`cmp-Europe-4-A`) | 6185 | defeat | `e0fceaef90d5` |
| run3 | Europe-4-B | `cmp-…` (`cmp-Europe-4-B`) | 6531 | defeat | `e0fceaef90d5` |
| runD | World-1-A | `cmp-…` (`cmp-World-1-A`) | 1796 | defeat | `1e005aedeb12` |
| runD | World-1-B | `cmp-…` (`cmp-World-1-B`) | 3601 | defeat | `1e005aedeb12` |
| runD | World-4-A | `cmp-…` (`cmp-World-4-A`) | 3483 | defeat | `1e005aedeb12` |
| runD | World-4-B | `cmp-…` (`cmp-World-4-B`) | 5241 | defeat | `1e005aedeb12` |
| runD | Europe-1-A | `cmp-…` (`cmp-Europe-1-A`) | 7331 | defeat | `1e005aedeb12` |
| runD | Europe-1-B | `cmp-…` (`cmp-Europe-1-B`) | 9141 | defeat | `1e005aedeb12` |
| runD | Europe-4-A | `cmp-…` (`cmp-Europe-4-A`) | 5981 | defeat | `1e005aedeb12` |
| runD | Europe-4-B | `cmp-…` (`cmp-Europe-4-B`) | 8271 | defeat | `1e005aedeb12` |
| runA | World-1-A | `cmp-…` (`cmp-World-1-A`) | 4143 | defeat | `2c0698d8dcd0` |
| runA | World-1-B | `cmp-…` (`cmp-World-1-B`) | 1755 | defeat | `2c0698d8dcd0` |
| runA | World-4-A | `cmp-…` (`cmp-World-4-A`) | 4804 | defeat | `2c0698d8dcd0` |
| runA | World-4-B | `cmp-…` (`cmp-World-4-B`) | 5661 | defeat | `2c0698d8dcd0` |
| runA | Europe-1-A | `cmp-…` (`cmp-Europe-1-A`) | 7331 | defeat | `2c0698d8dcd0` |
| runA | Europe-1-B | `cmp-…` (`cmp-Europe-1-B`) | 9151 | defeat | `2c0698d8dcd0` |
| runA | Europe-4-A | `cmp-…` (`cmp-Europe-4-A`) | 9238 | defeat | `2c0698d8dcd0` |
| runA | Europe-4-B | `cmp-…` (`cmp-Europe-4-B`) | 6485 | defeat | `2c0698d8dcd0` |

## Bestimmung & Regeneration

Bestimmung: identischer Engine-Commit + identischer Seed + identische Konfiguration + identischer Bot + identische Policy → identische Partie. Alle 56 Partien wurden auf `recording.complete === true` und auf korrekte Seed-/Policy-/Bot-Hashes geprüft.

Diese Pakete enthalten nur **lean** Match-Zusammenfassungen (`matches/<entität>/<config>.json`). Die **vollständigen Rohdaten** bleiben lokal unter `benchmark-results/stageC-compare/<entität>/<config>/` (gitignored): `match.json` (inkl. `decisionTimeline`), `events.jsonl`, `turns.jsonl`, `match.run.log`.

Regenerieren: `node tools/benchmark/stagec-compare.mjs` (feste Grid/Config; `--report-only` baut nur den Report neu).

Verifizierung dieses Exports: alle 56 Partien: Seed, Engine-, Bot- und Policy-Hash sowie recording.complete stimmen überein.
