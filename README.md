# OpenFront Solo AggroBot

**Version 1.21.2** · Tampermonkey-Autopilot für [OpenFront](https://openfront.io/) (Singleplayer, Public, Private).
Der Bot steuert Spawn, Expansion, Wirtschaft, Marine, Verteidigung, Handel und Diplomatie mit Sicherheitsprüfungen vor ausgesendeten Befehlen. **Eine garantierte Impossible- oder echte Multiplayer-Siegquote ist nicht belegt.** Ein Engine-Smoke ersetzt keinen Mehrspieler-Langzeittest.

## Installation und Update

1. Repository aktualisieren: `git pull --ff-only` im **sauberen** Arbeitsbaum; bei lokalen Änderungen erst sichern.
2. Den **vollständigen Inhalt** von [OpenFront_Solo_AggroBot.user.js](./OpenFront_Solo_AggroBot.user.js) in Tampermonkey installieren bzw. ersetzen. Für den bestehenden, separat gebündelten Schema-4-Champion stattdessen [OpenFront_AggroBot_Impossible_Run3.user.js](./OpenFront_AggroBot_Impossible_Run3.user.js) installieren. **Nie beide zugleich aktivieren.**
3. [openfront.io](https://openfront.io/) neu laden, Spielmodus öffnen. Auto-Start reagiert auf das spielbare Match und den EventBus; Replays bleiben gesperrt. Neben dem Spawn Advisor dessen Auto-Spawn, Smart Attack und Auto-Accept Alliances deaktivieren.

**Steuerung:** `Alt+Shift+P` pausiert/startet, `Alt+Shift+X` deaktiviert den Bot samt Auto-Start. Im Panel gibt es einen optionalen **Evidence-Mode** (verworfene Alternative, Reserve-Grund, Worker-Alter, letzte Aktions-IDs) und eine rein lesende **Budget-Zeile**. Der **Duo-Modus** benötigt den lokalen Relay-Prozess aus `Start_Live_Duo.bat`; Relay-Zusagen ersetzen keine im Spiel bestätigte Allianz und keine eigenen Reserve-/Legalitätsprüfungen.

## Stand und Grenzen

- **Run3** ist eine deterministische Ableitung desselben Solo-Quellcodes mit einem unveränderten Schema-4-Modell. Ein Schema-5-Kandidat wird **nicht** als Champion deployed: [trainer/shadow-deploy.mjs](trainer/shadow-deploy.mjs) erzeugt höchstens ein separates, standardmäßig inaktives Shadow-Script zur beobachtenden Auswertung.
- **Diagnose v2** exportiert `summary.json`, `events.jsonl`, `snapshots.jsonl`, `duo.jsonl`. Fehlende/journalisierte Ereignisse oder unbeobachtete Wirkungen dürfen nicht als Erfolg interpretiert werden. [Diagnose-Anleitung](docs/DIAGNOSTIC_V2.md).
- **Tests:** [Scenario-Pack + Evidence](docs/SCENARIO_PACK_EVIDENCE.md), [Benchmark-Hinweise](docs/BENCHMARKS.md). Gegner im scripted Harness sind deterministische Clients, **keine echten Menschen**. Ein Tick-Limit ist kein bestätigter Spielsieg.
- **Replay:** [Visible-state CLI](docs/REPLAY_VISIBLE_CLI.md) akzeptiert nur vollständig gekennzeichnete, bereits aus GameView extrahierte Frames mit festem Engine-SHA. Roh-Replays werden nicht automatisch zu Spieler-Sichtzuständen hochgestuft.
- **Entwicklung:** [laufende Roadmap](docs/COMPETITIVE_ROADMAP.md) · [Master-Issue #75](https://github.com/SLP-DEV1/openfront-bot/issues/75) · [Issue #121](https://github.com/SLP-DEV1/openfront-bot/issues/121). [Historische README vor Aufteilung](docs/README_1.21.1_ARCHIVE.md) und [Versionsarchiv](docs/README_HISTORY.md) sind **keine aktuellen Installationsanweisungen**.

## Entwickler-Checks

Node.js 24; vollständige Prüfung über [GitHub Actions](https://github.com/SLP-DEV1/openfront-bot/actions):

```sh
node tools/build-userscript.cjs --check
node tools/build-run3-bundle.cjs --check
node tests/strategy-regression.cjs
node tests/duo-status-regression.cjs
node tests/shadow-v5-regression.cjs
node tests/scenario-pack-regression.cjs
node tests/benchmark-regression.cjs
```

Offene Abnahmen aus [Issue #12](https://github.com/SLP-DEV1/openfront-bot/issues/12) bleiben als solche markiert; ein grüner CI-Lauf belegt nicht automatisch bessere Gegnerleistung.
