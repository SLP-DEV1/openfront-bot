# OpenFront Solo AggroBot

An experimental **Tampermonkey userscript** for [OpenFront](https://openfront.io/) that automates gameplay decisions in single-player, public and private matches.

**Current bundled scripts: v1.21.5.** This is an independent community project and is not affiliated with or endorsed by OpenFront.

## Features

- Automated spawning, territorial expansion, economy, upgrades and defense.
- Combat planning, naval operations, diplomacy, alliances and late-game strategy.
- Configurable safety checks for legality, resource reserves and action budgets.
- Optional local two-browser Duo coordination using a loopback relay.
- Diagnostic event recording and a local, read-only match monitor.
- Experimental neural strategy components and reproducible engine benchmarks.

**Important:** Experimental policies and scripted engine benchmarks do not establish a reliable win rate against human players or on Impossible difficulty. A completed CI job does not mean the bot won a game.

## Install

1. Install a userscript manager such as [Tampermonkey](https://www.tampermonkey.net/).
2. Choose **one** script:
   - [OpenFront_Solo_AggroBot.user.js](./OpenFront_Solo_AggroBot.user.js) — standard bot.
   - [OpenFront_AggroBot_Impossible_Run3.user.js](./OpenFront_AggroBot_Impossible_Run3.user.js) — experimental version with a bundled, fixed Schema 4 model.
3. Copy the **entire contents** of your chosen file into a new Tampermonkey script, save, and open [openfront.io](https://openfront.io/).
4. Only enable one AggroBot variant at a time. If you also use Spawn Advisor, disable its overlapping automatic controls.

The bot waits for a playable match and a ready game event bus before starting. Replay mode is not an automation target.

### Controls

- **Alt + Shift + P** — pause/resume.
- **Alt + Shift + X** — disable the bot and automatic start.
- Use the in-game panel for strategy preferences, diagnostics, evidence mode and optional Duo settings.

### Optional local Duo mode

Run `Start_Live_Duo.bat` with **Node.js 24+** installed, then enable Duo in two separate browser instances in the same game with the same room code. The relay listens only on `127.0.0.1:8767`; it does not replace in-game alliance validation or action safety checks.

See [Local Duo](docs/LOCAL_DUO.md) and [Local monitor](docs/LIVE_MONITOR.md) for details.

## Development and validation

Node.js 24 is recommended for the build and regression tools:

```sh
node tools/build-userscript.cjs --check
node tools/build-run3-bundle.cjs --check
node tests/strategy-regression.cjs
node tests/duo-status-regression.cjs
node tests/shadow-v5-regression.cjs
node tests/scenario-pack-regression.cjs
node tests/benchmark-regression.cjs
```

The scripts are generated from `src/userscript/` and supporting runtime modules. Run `node tools/build-userscript.cjs --write` when editing canonical userscript source.

More information: [Benchmarks](docs/BENCHMARKS.md), [Neural training](docs/NEURAL_TRAINING.md), [Experiment protocol](docs/EXPERIMENT_PROTOCOL.md), and [Issues](https://github.com/SLP-DEV1/openfront-bot/issues).

## Privacy and responsible use

- Do **not** commit diagnostic ZIPs, private replay exports, access tokens, cookies, credentials or local profile/configuration files.
- Logs and diagnostic exports can contain match IDs, player identifiers or other personal information. Review and anonymize all artifacts before sharing.
- Keep the local monitor and Duo relay bound to loopback; do not expose their ports to the internet.
- Publishing a repository does **not** remove sensitive content from past commits or forks. See [Security policy](SECURITY.md).
- Follow OpenFront's applicable rules and terms. Automation in online matches may not be permitted.

Large historical training datasets, simulation logs, and generated benchmark results are **not included** in the public source tree. They can be regenerated locally when needed. The reviewed Schema 4 Run3 model is kept at `trainer/run3-champion.json` so both distributed userscripts remain reproducible.

All experiments are research-grade; their results are not guarantees of performance.
