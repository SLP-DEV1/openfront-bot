# Vollständige Bot-Liga mit einer gemeinsamen OpenFront-Engine (P6)

`tools/benchmark/engine-multibot.mjs` lädt **2–8 vollständige Userscripts** mit
getrennten Client-IDs, GameViews, Terrainzuständen, lokalen Speichern,
Event-Bussen, JavaScript-VMs und Schedulern. Alle Clients bekommen dieselben
Updates **eines einzigen offiziellen GameRunners**. Ihre Befehle werden mit
der jeweiligen Client-ID für den nächsten Engine-Tick zusammengeführt.
Es sind keine geskripteten Spieler, sofern `--scripted` nicht ausdrücklich
gewählt wird. Die Botzyklen werden seriell ausgeführt, nicht parallel in
echten Browserprozessen.

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
