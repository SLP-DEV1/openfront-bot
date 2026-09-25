# 1. Pipeline-Audit — Schema 7 (2026-09-25)

Ziel (§5): Den vollständigen Pfad vom sichtbaren Zustand bis zum tatsächlich
an die Engine gesendeten Intent kartieren und die **letzte Stelle** bestimmen,
an der noch mehrere legale Optionen existieren, von denen eine unmittelbar
einen **unterschiedlichen Engine-Intent** erzeugt. Genau dort muss Schema 7
eingreifen.

## 1.0 Reproduzierbarkeit

* Repo: `SLP-DEV1/openfront-bot`, Basis-Commit `>= 0b6b8ec`
* Build: `tools/build-userscript.cjs` inlinet `src/userscript/*.js` (Sortierung
  `00-…`, `10-…`, `20-…`, `30-…`, `40-…`, `50-…`) plus den Block zwischen
  `DECISION-KERNELS-BEGIN/END` aus `src/runtime/decision-kernels.cjs`.
* Alle Zeilenangaben beziehen sich auf die **Modular-Quellen** (vor Build).
* Kein Schreibzugriff auf Artefakte; reines Lesen + Belegung der Kausalität.

## 1.1 Gesamtpfad (pro Combat-Turn)

```text
sichtbarer Zustand (game / playerViews / units)
  ↓
rankedTargets(...)                     [20-military-and-planning.js:1815]
  → ranked: Land-Ziele (Feind-Gruppen id!=null, neutrale Tiles id===null) + Score
  ↓
strategicCandidatePlan(...)            [20-military-and-planning.js:57]
  → Candidate-Generierung (Kinds: hold / invest / expand / attack / naval / support)
  → archetypeRankKernel + Rule-Sort → ruleSelected = candidates[0]
  → shadowScoring v5/v6 (shadowV6Model || shadowV5Model) → candidateControlVariant
  → planning.selected = Top-Kandidat NACH Control   ← SCHEMA-5/6 SITZT HIER
  ↓
defenseAssessment / defense / fleetDefense / teamSupport   [40-economy-runner.js:~2528]
  → Early-Return-Safety-Gates (severe Assault, Gegenangriff, Teamhilfe)
  ↓
strategicDirector(...)                 [30-economy-and-defense.js:16]
  → canSail / threatened / recovering / navalFirst → ruleOrder
  → learned = neuralStrategicSignals (Run3 Schema-4: landPriority/navalPriority/holdPriority)
  → planned(channel) = MAX-Utility je Channel   ← ORDNUNGSINVARIENT
  → order = recovering ? ['hold'] : ruleOrder : sort(utility)
  → reason (Block-Reason)
  ↓
Dispatch-Loop                          [40-economy-runner.js:~2546-2561]
  → if order[0]==='hold' → block + return
  → for channel of order:  attack(...) für 'land'  |  naval(...) für 'naval'
  → ERSTER Planner, der true liefert, sendet den Intent
  ↓
send(kind, args)                       [00-bootstrap.js:1667]   ← INTENT-EMISSION
  → new ctors[kind](...args); bus.emit(event)  → Engine
```

## 1.2 Zweiter, separater Pfad: Economy-Scheduler

```text
economyStep()                          [40-economy-runner.js:~2563]
  → eigener Timer (actionBudget, tick-lastEconomy), NICHT im Combat-Loop
  → economy(me, tick, serial, tiles)   [40-economy-runner.js:1]
  → Build-Branches: City/Factory/Port/SAM/Silo  → send('build', …)
```

Wichtig: Build-Entscheidungen laufen **parallel** zum Combat-Pfad und werden
vom `strategicDirector` nicht gesteuert. Schema 7 muss beide Pfade abdecken.

## 1.3 Alle Intent-Emitters (`send(kind, args)`)

| kind | args | Stelle | Branch-Bedeutung |
|------|------|--------|------------------|
| `attack` | `[target, amount]` | `30-economy-and-defense.js:301` (Haupt), `:212` (Gegenangriff) | Land-Expansion / Feind-Attack |
| `boat` | `[dest, troops]` | `40-economy-runner.js:1445` | Marine-Transport |
| `warship` | `[[ship.id()], water]` | `40-economy-runner.js:1499` | Warship-Entsendung |
| `build` | `['Warship', tile]` | `40-economy-runner.js:1543` | Warship bauen |
| `build` | `[kind, …]` (NUKE) | `40-economy-runner.js:826` | Nuklear-Attacke |
| `build` | `[type, tile]` | `40-economy-runner.js:1` (economy) | City/Factory/Port/SAM/Silo |
| `donateTroops` / `donateGold` | `[partner, amount]` | `40-economy-runner.js:1753/1806/1828/1837` | Team-Support |
| — (hold/warten) | kein `send` | `40-economy-runner.js:~2548-2561` | nur `planning.blockReasons` |

`send` ist fail-closed: prüft `ctors[kind]`, `actionBudget`, Burst-Limit (410 ms)
und `permittedMatch`; erst dann `bus.emit`. **Jede dieser Aufrufe = ein konkreter
Engine-Intent = eine actionable Branch.**

## 1.4 Wo das aktuelle Modell sitzt (Schema-5/6) — und warum No-Op

Das v5/v6-Modell re-sortiert `planning.candidates` (abstrakte Kandidaten) via
`candidateControlVariant` (`src/runtime/decision-kernels.cjs`). Das ist eine
**abstrakte Rangfolge**, keine konkrete Aktion. Die Emission ist dieser
Rangfolge gegenüber invariant, aus drei unabhängigen Gründen:

1. **`strategicDirector` nutzt `planned(channel)` = MAX-Utility je Channel**
   (`30-economy-and-defense.js:40-52`) — ein Maximum ist ordnungs-invariant.
   Die Basis-`ruleOrder` kommt aus `canSail / threatened / recovering /
   navalFirst` — alles **modellunabhängig**.
2. **Die Planner lesen `ranked` (vor `strategicCandidatePlan`)** und re-lesen
   den Live-Zustand (`military(me, strategic.groups)`, `legalTarget`,
   `frontRiskPlan`, `offensiveCommitment`) — sie iterieren **nicht**
   `planning.candidates`. (`30-economy-and-defense.js:222+`)
3. **Der gewählte Channel wird erst im Dispatch-Loop mit einem
   `send(kind, args)` besetzt**, dessen Ziel/Menge die Planner selbst aus
   Live-State ableiten — nicht aus der Modell-Reihenfolge.

Folge: internes Re-Ranking (bis ~90 % der Frames) ändert nie die emittierte
Aktion → `differentEmittedActions = 0` → **Category C (NEGATIVE RESULT)**.
Dies ist durch die Live-Engine bestätigt (plan.md §48).

## 1.5 DIE letzte Multi-Choice-Stelle (Antwort auf §5)

Die letzte Stelle, an der noch **mehrere legale Optionen** existieren, die
jeweils einen **anderen Engine-Intent** erzeugen, ist zweistufig:

* **(a) Channel-Priorität** — `strategicDirector.order`
  (`30-economy-and-defense.js:16`): welche Channel-Reihenfolge
  (naval/land/hold). Eine andere Reihenfolge lässt einen anderen Planner
  laufen → anderer `send(...)`.
* **(b) Innerhalb des Channels: der erste legale Planner-Kandidat**
  * `attack`: `ranked[i]` + `amount` (`30-economy-and-defense.js:222+`)
  * `naval`: Destination + troops (`40-economy-runner.js:2100+`)
  * `economy`: Tile + BuildType (`40-economy-runner.js:1+`)
  * `donate`: Partner + amount (`40-economy-runner.js:1753+`)

Der eigentliche **Emission-Punkt** ist `send(kind, args)`
(`00-bootstrap.js:1667`).

## 1.6 Wo Schema 7 eingreift (→ §6 Actionable Branch Contract)

**Nicht** an der abstrakten Candidate-Ebene (Schema-6-Stelle). **Sondern** nach
Hard-Legality/Safety, **vor** `send(...)`: die Menge der aktuell ausführbaren
**konkreten Branches** erzeugen und mit Schema 7 ranken; der Gewinner wird 1:1
zu `send(kind, args)`.

Konkrete Insertionspunkte:

1. **Combat-Pfad** — nach `strategicDirector`, vor dem Dispatch-Loop
   (`40-economy-runner.js:~2546`): Branch-Set aus `{naval | land | hold}` bilden.
2. **Economy-Pfad** — innerhalb `economy()` (`40-economy-runner.js:1`):
   Build-Branches (`City/Factory/Port/SAM/Silo`) als Branches ausweisen.
3. **Team-Pfad** — `teamSupport`/`donate` (`40-economy-runner.js:1753+`) als
   Support-Branches (optional, Phase 2).

**Hard-Safety bleibt AUSSENHALB der Lernentscheidung** (§9): nur Branches mit
`legal === true && safetyApproved === true && executableNow === true` werden
gegengereicht. Das Netz kann keine illegale Aktion legal machen — es wählt nur
unter den bereits legalen Branches.

Branch-Contract (Vorschlag, zu präzisieren in `branch-contract.json`):

```text
actionableBranch = {
  id, kind, subtype, targetId,
  legal, safetyApproved, executableNow,
  ruleUtility, cost, troopCommitment, reserveAfter,
  cooldownReady, expectedPurpose, buildType, sourceId
}
```

## 1.7 Nächste Schritte

1. `branch-contract.md` / `branch-contract.json`: exaktes Branch-Schema +
   Feature-Vertrag (§6, §10) — inkl. WAIT als echte Branch (§8).
2. Reproduzierbarer Branch-Extraktor: aus (a)+(b) die konkrete Branch-Menge
   pro Frame erzeugen (Train-/Runtime-Parität testen, §11/§41).
3. Runtime-Wiring `schema:7` (`candidate-policy-v7` / `action-policy-v7`),
   fail-closed, unbekanntes Schema → fail-closed (§12).
4. Kurze Smoke-Tests + Feature-Parität **vor** Trainingsstart (§29).
5. Erst dann: 10-Stunden-Nachtkampagne (§29), Pre-Gate `differentExecutedTurns > 0`
   (§26), Branch-Funnel (§28).
