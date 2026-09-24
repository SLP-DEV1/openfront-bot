# Modell-Inventar — overnight-20260924-v6 (Plan §1)

Stand: 2026-09-24T03:12Z · alle policy- und file-SHA256 in dieser Session
neu berechnet und verifiziert. `policySHA256 = sha256(JSON.stringify({schema,arch,weights}))`,
`fileSHA256 = sha256(rote Bytes)`.

## Begriffsklärung (wichtig — nicht vermischen)

- **„Schema 4"** = Architektur `24×24×16-tanh`, exakt **1000 Gewichte**.
  Primäre „Strategische Policy v4 (24 Signale)" im Runtime
  (`neuralChannel`/`neuralActionDelta`). **Aktiver Champion = run3 (Schema 4).**
- **„Schema 5"** = Architektur `32×20×2`, **702 Gewichte**. Shadow-
  Kandidaten-Ranker („Schema-5 Shadow AN/AUS", `shadowV5Model`/`changedIntent`).
  Das ist die **v5-v2-Linie** — eine *andere* Architektur als der Champion.
- **„V6"** = eine **Trainings-Generation** auf Schema-4-Basis (Collapse-
  Prevention), **kein** `schema:6`. Die V6-Kandidaten sind Schema-4/1000.
- **„v5-v2"** = Experiment-/Architektur-Label der Schema-5-Linie (nicht „V5").
- **„bot-version"** = SHA des `.user.js`-Bundles (Run3/Posture/Solo) —
  unabhängig vom Modell.
- **„active champion"** = run3 (im Live-Run3-Bot deployed) ≠
  **„official champion"** = stageC (promoted Policy-Champion).

Beide Architekturen werden vom aktuellen `main`-Runtime geladen (Schema 4 als
primäre Policy, Schema 5 als optionale Shadow-Control).

## Engine

- Aktuell auf Platte / `common.ENGINE_COMMIT`: `13b403387af01d388f8c8ed8c953b6d3a11d1457`
- Schema-4-Linien (V5/V6) **trainiert** auf: `bb8af015b515b3b717bd4d901074c5f4c16641cb`
- Fairer Vergleich: alle NEUEN Arme (Kandidat, Regelbasis, run3, stageC, V5-Referenzen)
  auf **gleicher Engine + gleichem Bot-Code** (aktuell 13b40338), damit
  apples-to-apples — auch wenn V5/V6 auf bb8af015 trainiert wurden.

## Modell-Inventar

| ID | Linie | Rolle | policySHA256 (12) | fileSHA256 (12) | Status |
|---|---|---|---|---|---|
| **run3** | Schema-4 | **AKTIVER Champion** (Live-Run3-Bot) | `e0fceaef90d5` | `65589febcf8a` | deployed — **nicht überschreiben** |
| **stageC** | Schema-4 | offizieller Champion | `84d1f5930391` | `d2a5fce385fa` | **nicht überschreiben** |
| **V6-A-prov** | Schema-4 (V6-Linie A) | Kandidat, neueste LINIE | `7f0af2cd675d` | `944199a47b1a` | trainiert, Validierung unvollständig |
| **V6-V4-prov** | Schema-4 (V6-Linie V4) | Kandidat, neueste LINIE | `439255d7e9b0` | `6c011762c733` | trainiert, Validierung unvollständig |
| **V6-V4-champ** | Schema-4 (V6 in-loop) | Kandidat, neueste LINIE | `df32e024cc22` | `5aac40cab27c` | trainiert, Validierung unvollständig |
| V5-A-prov | Schema-4 (V5-Referenz) | Gate-Referenz | `baad08d1eef3` | `dee265307548` | Referenz |
| V5-V4-prov | Schema-4 (V5-Referenz) | Gate-Referenz; V6-baseline-newbot | `c5268942dbd8` | `2c39fd70748c` | Referenz |
| V4-prov | Schema-4 | Referenz | `8dfcdcea8dc6` | `bba7e7152e05` | Referenz |
| A-champ | Schema-4 (V3) | Referenz | `0b526b7717b5` | `84883f303428` | Referenz |
| **v5-v2-lr0.2-e200** | **Schema-5 (702)** | neuestes Datum (09-24), validiert → NOT-ELIGIBLE | `5041e9aaeb37` | `5041e9aaeb37` | trainiert + validiert, abgelehnt |

Vollständige Pfade + Engine-/Bot-Pins: `inventory.json`.

## Bot-Dateien (Pins)

| Bot | SHA256 | Rolle |
|---|---|---|
| `OpenFront_AggroBot_Impossible_Run3.user.js` | `beb1ada0…` | **LIVE Run3** (deployt run3) |
| `OpenFront_Solo_AggroBot.user.js` (main) | `9cff544d…` | main solo (kein Posture-FSM) |
| `OpenFront_AggroBot_Monitor.user.js` | `c3151fa8…` | Monitor (read-only) |
| `.worktrees/neural-v6/OpenFront_Solo_AggroBot.user.js` | `57775ec7…` | **V6 „Posture-Bot"** (mit `defense-posture.cjs` FSM) — V6 trainiert darauf |

## Ausgangspunkt-Entscheidung (Plan §3/§6)

**Entscheidung: von der V6-Collapse / Schema-4-Linie starten
(V6-V4-champ / V6-V4-prov / V6-A-prov), NICHT vom Schema-5 v5-v2-Modell.**

Begründung (evidenzbasiert, aus realen Artefakten):

1. **Neueste LINIE** = V6-Collapse (2026-09-22), architektur-kompatibel mit dem
   aktiven Champion (Schema-4-Primary-Path).
2. **Neuestes Datum** = v5-v2 (Schema-5, 2026-09-24) — aber genau die Linie, auf
   die der vorherige Auftrag laut Korrektur **falsch fixiert** war, und die letzte
   Nacht bereits **voll validiert** ist (NOT-ELIGIBLE).
3. **V6-Kandidaten sind trainiert, aber noch nicht unabhängig validiert**: die
   `holdout/difficulty-*/matches/`-Ordner sind **leer** (0 Partien), die
   per-Kandidaten-Collapse-Jobs wurden nicht gefahren, es gibt kein
   `decision.json`. ⇒ Die Kampagne muss sie **zuerst validieren** (vollständiger
   disjunkter Holdout + per-Kandidaten-Collapse + Gate) gegen
   stageC/run3/V4-prov/V5-A-prov/V5-V4-prov — **gleiche Engine + gleicher
   Bot-Code, frische nie-verwendete Holdout-Seeds** — und erst dann neue
   Varianten auf der besten validierten Basis trainieren.
4. **Bot-Kompatibilität / Caveat:** V6 wurde auf dem **Posture-Bot**
   (`57775ec7`, mit `defense-posture.cjs` FSM) trainiert. Der main-Live-Solo-Bot
   (`9cff544d`) hat dieses FSM evtl. nicht ⇒ V6-Kandidaten könnten out-of-
   distribution sein, wenn sie auf einem Bot ohne FSM laufen. Alle Vergleichs-
   Arme laufen deshalb auf dem **gleichen** Bot-Code (fairer Vergleich), und der
   Caveat wird in `diagnosis.md` dokumentiert.

**Aktiver Champion, der unverändert bleibt (Pin):** run3 Schema-4 —
policy `e0fceaef…`, file `65589feb…`, Bot `beb1ada0…`. Kein Auto-Deploy.
