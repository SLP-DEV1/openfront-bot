# Vollständige Bot-Liga mit einer gemeinsamen OpenFront-Engine (P6)

`tools/benchmark/engine-multibot.mjs` lädt **2–8 vollständige Userscripts** mit
getrennten Client-IDs, GameViews, Terrainzuständen, lokalen Speichern,
Event-Bussen, JavaScript-VMs und Schedulern. Alle Clients bekommen dieselben
Updates **eines einzigen offiziellen GameRunners**. Ihre Befehle werden mit
der jeweiligen Client-ID für den nächsten Engine-Tick zusammengeführt.
Es sind keine geskripteten Spieler, sofern `--scripted` nicht ausdrücklich
gewählt wird. Die Botzyklen werden seriell ausgeführt, nicht parallel in
echten Browserprozessen.

## Versionierte Gegner-Archetypen (P1)

`common.cjs` und `src/userscript/00-bootstrap.js` definieren dieselbe,
gefrorene Archetypmenge `archetype-v1`:
`legacy`, `rush`, `turtle`, `economy`, `naval`, `opportunist`, `diplomat`,
`nuke`, `duo`, `champion`. Ein Archetyp ist **kein** anderer Slider-Wert
desselben Bots: `archetypePolicy()` ändert die **Kandidaten-Rangfolge** des
Planers (Angriffs-Timing-Gate, Nutzenverschiebungen pro Strategieart,
Neu-Rangfolge des schwächsten Ziels und erzwungene Subsysteme
`boats`/`diplomacy`/`offerAlliances`/`nukes`). `legacy`/`duo`/`champion`
sind der exakte Basiswert ohne Zusatzpolitik.

Der Archetyp wird pro Bot-Client über das Bridge-`start()`-Feld
`archetype` gesetzt (whitelist-gesetzt in `50-ui-and-entrypoint.js`) und in
`engine-multibot.mjs` über das Lineup-Feld `archetype` je Teilnehmer.
Jede Planungsrunde wird in `archetypeSignature()` protokolliert
(`plannedTicks`, `firstAttackTick`, `selectedByKind`,
`weakestTargetFraction`) und über `diagnosticSnapshot` in
`match.json → fullBots[].diagnostics` gespeichert. Damit ist pro Client
nachweisbar, **welche** Strategie tatsächlich gewählt wurde – nicht nur
unter welchem Namen der Bot gestartet wurde.

`tools/benchmark/league.cjs --smoke` belegt diese Unterschiede bewusst:
FFA-Teilnehmer bekommen `legacy` vs `rush`, die 2v2-Teilnehmer
`duo`/`legacy` gegen `rush`/`turtle`.

## Liga planen – führt keine Partien aus

```powershell
node tools/benchmark/league.cjs --engine ../OpenFrontIO --engineCommit bb8af015b515b3b717bd4d901074c5f4c16641cb --out benchmark-results/league-plan
```

Es entsteht nur `league.json` mit dem Status `not-run`. Separate
Ausgabeordner pro Versuch werden erst bei ausdrücklichem `--execute`
geschrieben. Die Engine muss ein **sauberer Checkout exakt des angegebenen
Commit** sein.

## Vollständige FFA-Liga – Ausführung nur auf ausdrücklichen Aufruf

```powershell
node tools/benchmark/league.cjs --engine ../OpenFrontIO --engineCommit bb8af015b515b3b717bd4d901074c5f4c16641cb --bot OpenFront_Solo_AggroBot.user.js --opponentBot OpenFront_AggroBot_Impossible_Run3.user.js --seeds league-001,league-002 --profiles autonomous,balanced --opponents cautious,expansion --out benchmark-results/league-ffa --execute
```

Jede Kombination erzeugt eine Partie mit **zwei vollständigen Bot-Clients**
(gleiche Partie, verschiedene GameViews). `league.json` enthält pro
Teilnehmer Bot-SHA256, Profil, Spielerkennung, Ergebnis und beobachtetes Land.
`match.json` enthält die getrennten Bot-Diagnosen und den beobachteten
Engine-Winner, `events.jsonl` mit Client-ID und `turns.jsonl` mit
allen gestempelten Befehlen. `unknown` bedeutet nicht „Sieg“.

## 2v2 – zwei vollständige Duo-Paare

```powershell
node tools/benchmark/league.cjs --engine ../OpenFrontIO --engineCommit bb8af015b515b3b717bd4d901074c5f4c16641cb --participants 4 --gameMode Team --profiles autonomous --opponents balanced --seeds duo-001 --out benchmark-results/league-2v2 --execute
```

Pro Partei teilen sich zwei eigene, vollständige Bot-VMs eine bestätigte
Engine-Teamzugehörigkeit. Ein **lokaler, validierter In-Process-Relay**
stellt nur ihre Strategie-/ACK-Nachrichten bereit und erlaubt keine
Engine-Befehle. Die separaten GameViews und die echten Allianz- und
Legalitätsprüfungen bleiben maßgeblich. Das ist **keine echte Zwei-Browser-
oder menschliche Multiplayer-Abnahme**.

## Smoke (P1: kurzer FFA- und 2v2-Lauf mit vollständigen Bot-Clients)

`--smoke` spielt **keine** breite Liga und keine lange Partie: zwei kurze
FFA-Partien (700 Ticks, zwei vollständige Bot-Clients je Partie) mit den
Archetypen `legacy` vs `rush`.

```powershell
node tools/benchmark/league.cjs --smoke --execute --engine ../OpenFrontIO --out benchmark-results/p1-smoke-ffa
```

Ein kurzer 2v2-Lauf (700 Ticks, vier vollständige Bot-Clients,
`duo`/`legacy` gegen `rush`/`turtle`):

```powershell
node tools/benchmark/league.cjs --execute --gameMode Team --participants 4 --seeds p1-smoke-2v2-01,p1-smoke-2v2-02 --profiles autonomous --opponents balanced --ticks 700 --engine ../OpenFrontIO --out benchmark-results/p1-smoke-2v2
```

Beide Läufe sind **nachgewiesen ausgeführt** (Engine-Commit
`13b403387af01d388f8c8ed8c953b6d3a11d1457`): Die Logs belegen
unterschiedliche Strategien und Spielzustand. In `match.json` zeigt
`fullBots[].diagnostics.archetypeSignature.selectedByKind` pro Client
andere Planningsverteilungen bei identischem Seed/Profil/Ticks – z. B. im
2v2-Lauf bei 124 Planungsticks: `duo` {naval 88}, `legacy` {hold 88,
naval 33}, `rush` {hold 121}, `turtle` {invest 102}. Das beweist die
Archetypen als echte, abweichende Strategie – nicht denselben Bot unter
zehn Namen. Eine kurze Smoke begründet **keine** breite Spielstärke.

## Ein einzelnes Match mit expliziter Aufstellung

`lineup.json`:

```json
[
  {"bot":"OpenFront_Solo_AggroBot.user.js","profile":"autonomous","teamIndex":0},
  {"bot":"OpenFront_AggroBot_Impossible_Run3.user.js","profile":"balanced","teamIndex":1}
]
```

```powershell
node tools/benchmark/engine-multibot.mjs --engine ../OpenFrontIO --engineCommit bb8af015b515b3b717bd4d901074c5f4c16641cb --lineup lineup.json --gameType Private --gameMode FFA --bots 0 --nations 0 --scriptedHumans 0 --seed matchup-001 --out benchmark-results/matchup-001
```

`--lineup` nimmt 2–8 Clients; für echte 2v2-Aufstellungen vier Einträge
mit `teamIndex` 0,0,1,1 und `--gameMode Team`.

**Marine-ETA:** Das Browser-Skript verwendet bei einem sichtbaren Transport
die Engine-`motionPlans()` mit tatsächlichem Pfad, `startTick` und
`ticksPerStep`. Für Transporte vor dem Start benutzt es das begrenzte
BFS-Wasserwegmodell mit der am gepinnten Engine-Commit dokumentierten
Bewegungsrate `ticksPerMove = 1`; beides sind Ankunftsprojektionen,
kein garantierter Landungs- oder Siegzeitpunkt.

**Noch keine Ergebnisse:** Auf Nutzerwunsch wurden keine Langzeit-,
Zwei-Browser-, Liga- oder Wirkungstests ausgeführt. Implementierung und
Messnachweis sind getrennt.
