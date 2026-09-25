# 2. Actionable Branch Contract — Schema 7 (2026-09-25)

Grundlage: `pipeline-audit.md` §1.5/§1.6. Schema 7 rankt **konkrete, legale,
jetzt-ausführbare Branches** — nicht abstrakte Kandidaten (Schema-6-Stelle).
Der Gewinner wird 1:1 zu `send(kind, args)` (`00-bootstrap.js:1667`).

## 2.1 Branch-Typ (versioniert)

```text
actionableBranch = {
  id: string,            // eindeutig pro Frame, z.B. "attack:<target>" / "build:City:<tile>"
  kind: string,          // Grobkategorie (siehe 2.2)
  subtype: string,       // Feinkategorie (z.B. 'front', 'finisher', 'neutral')
  targetId: number|null, // Engine-Ziel (Spieler-/Struktur-ID) bzw. null
  tile: string|null,     // Ziel-Tile (für Build/Expand)
  legal: boolean,        // Hard-Legality (z.B. me.actions(tile).canAttack)
  safetyApproved: boolean,// Hard-Safety (Reserve, Allianz, Nuke-Regeln)
  executableNow: boolean,// cooldown/budget/pending frei
  ruleUtility: number,   // Regel-Utility des zuständigen Planners (Hilfssignal, §23)
  cost: number|null,     // Truppen-/Gold-Aufwand
  troopCommitment: number,
  reserveAfter: number,  // Heimreserve NACH Ausführung
  cooldownReady: boolean,
  expectedPurpose: string,
  buildType: string|null,// 'City'|'Factory'|'Port'|'SAM Launcher'|'Missile Silo'|'Warship'
  sourceId: number|null, // z.B. Warship-ID bei Warship-Entsendung
}
```

Nur Branches mit `legal && safetyApproved && executableNow === true` werden
von Schema 7 gerankt (§6). `WAIT` ist eine echte Branch, aber **nicht**
automatisch favorisiert (§8): `reason`-Tag `wait_for_budget|reserve|cooldown|
no_target|strategic`.

## 2.2 Branch-Klassen → reale Emitters

| kind | subtype | Emitter (file:line) | send |
|------|---------|---------------------|------|
| EXPAND | neutral | `30-economy-and-defense.js:222` (attack, id===null) | `attack` |
| ATTACK_PLAYER | enemy | `30-economy-and-defense.js:222` (attack, id!==null) | `attack` |
| ATTACK_FRONT | front | `30-economy-and-defense.js:222` (frontRiskPlan) | `attack` |
| FINISH_TARGET | finisher | `30-economy-and-defense.js:222` (operation/duo) | `attack` |
| SEND_TRANSPORT | boat | `40-economy-runner.js:1445` | `boat` |
| SEND_WARSHIP | warship | `40-economy-runner.js:1499` | `warship` |
| BUILD_WARSHIP | warship | `40-economy-runner.js:1543` | `build` |
| NUCLEAR_ATTACK | nuke | `40-economy-runner.js:826` | `build` (NUKE) |
| BUILD_CITY / BUILD_FACTORY / BUILD_PORT / BUILD_SAM / BUILD_SILO | build | `40-economy-runner.js:1` (economy) | `build` |
| SUPPORT_ALLY | donate | `40-economy-runner.js:1753/1806/1828/1837` | `donateTroops`/`donateGold` |
| WAIT | strategic/budget/reserve | (kein `send`, nur `planning.blockReasons`) | — |
| HOLD_RESERVE | reserve | `20-military-and-planning.js:65` (hold/invest) | — |

Keine künstliche Klasse, die im Bot nicht existiert (§7).

## 2.3 Extraktionspunkte (aus `pipeline-audit.md` §1.6)

1. **Combat-Pfad** — nach `strategicDirector`, vor Dispatch-Loop
   (`40-economy-runner.js:~2546`): Branches `{naval | land | hold}` aus
   `ranked` + Live-Legality.
2. **Economy-Pfad** — in `economy()` (`40-economy-runner.js:1`): Build-Branches.
3. **Team-Pfad** — `teamSupport`/`donate` (`40-economy-runner.js:1753+`).

Extraktion = **releasen der Legality-Prüfungen der Planner als reine Funktionen**
(kein `send`, keine Seiteneffekte), sodass dieselbe Branch-Menge in
Train und Runtime entsteht (Parität §11/§41).

## 2.4 Feature-Vertrag (Schema 7)

Nur Features, die im Live-Runtime zuverlässig verfügbar sind (§10).
State-Features: `gamePhase, land, troops, reserveRatio, gold, income,
enemyPressure, activeWars, frontCount, allyPressure, homeThreat, nukeThreat,
recentLandTrend, recentTroopTrend`.
Branch-Features: `kind`-onehot, `subtype`-onehot, `ruleUtility`,
`utilityGapToTop`, `costRatio`, `troopCommitmentRatio`, `reserveAfterRatio`,
`targetStrengthRatio`, `targetLandRatio`, `expectedBuildValue`,
`expectedDefenseValue`, `cooldownReady`, `alreadyActiveOperation`,
`targetReachable`, `isEmergency`, `isFinisher`, `isExpansion`.

Versioniert als `schema:7, featureSchemaVersion:4` (§12), fail-closed bei
unbekannter Version.

## 2.5 Ranking → Emission

```text
alle Roh-Branches → Hard Legality + Safety → sichere Branches
  → Schema 7 bewertet ( Ansatz A: branchScore  |  Ansatz B: Multi-Head, §13 )
  → argmax (sicher) → genau diese Branch wird per send(kind,args) emittiert
```

Hard-Safety bleibt **außerhalb** der Lernentscheidung (§9): das Netz wählt nur
unter den bereits legalen Branches; es kann keine illegale Aktion legal machen.

## 2.6 Machine-readable Contract

Siehe `branch-contract.json` (Schema, Klassen, Extraktionspunkte, Emission).
