# ⚔️ OpenFront AggroBot

**Automate the battlefield. Experiment with smarter strategies. Take OpenFront automation further.**

An experimental **OpenFront bot and Tampermonkey userscript** that handles expansion, economy, warfare, naval operations, defense, and diplomacy — with optional neural strategy models and local Duo coordination.

[![Star this project](https://img.shields.io/badge/Star-this%20project-181717?style=for-the-badge&logo=github)](https://github.com/SLP-DEV1/openfront-bot)
[![Public Preview](https://img.shields.io/badge/Download-v1.21.7-blue?style=for-the-badge&logo=github)](https://github.com/SLP-DEV1/openfront-bot/releases/tag/v1.21.7)
[![Userscript](https://img.shields.io/badge/platform-Tampermonkey-orange?style=for-the-badge)](https://www.tampermonkey.net/)

**[Download v1.21.7](https://github.com/SLP-DEV1/openfront-bot/releases/tag/v1.21.7)** · **[Get started](#-quick-start)** · **[Explore features](#-what-can-it-do)** · **[How it works](#-built-for-tinkering)** · **[Report a bug or suggest a feature](https://github.com/SLP-DEV1/openfront-bot/issues)**

> ⭐ **Enjoy experimenting with AggroBot? [Star this repository](https://github.com/SLP-DEV1/openfront-bot) to support its development and help other OpenFront players discover it.**

## 🚀 Why AggroBot?

AggroBot goes beyond a single auto-attack script. It combines multiple game systems into **one configurable autopilot**, with strategy decisions constrained by game-state and safety checks.

- 🗺️ **Hands-off expansion** — automatic spawn selection and territorial growth.
- 🏙️ **Economy & upgrades** — resource management, development, and investment planning.
- ⚔️ **Combat & naval strategy** — target selection, troop reserves, transports, and late-game offense.
- 🛡️ **Defense first** — invasion awareness and defensive responses, including anti-nuke planning.
- 🤝 **Diplomacy & teamwork** — alliances, team support, and optional local two-browser Duo coordination.
- 🧠 **Experimental neural policies** — investigate how learned candidate ranking interacts with rule-based decisions.
- 🔎 **Diagnostics & benchmarking** — inspect actions, capture match evidence, and run reproducible engine scenarios.

The bot is an **experiment, not a guaranteed win button**: neural features are research-oriented, and benchmark outcomes do not prove success against human players.

## ⚡ Quick start

**No Node.js setup is required to install the normal browser userscript.**

1. Install [Tampermonkey](https://www.tampermonkey.net/) in your browser.
2. Choose **one** script below from the **[v1.21.7 public preview](https://github.com/SLP-DEV1/openfront-bot/releases/tag/v1.21.7)**. Download the file and import it into Tampermonkey, or paste its complete contents into a new Tampermonkey script:

   | Script | Best for |
   | --- | --- |
   | **[Download OpenFront Solo AggroBot](https://github.com/SLP-DEV1/openfront-bot/releases/download/v1.21.7/OpenFront_Solo_AggroBot.user.js)** | Standard automation and customizable strategy settings |
   | **[Download Impossible Run3 Neural](https://github.com/SLP-DEV1/openfront-bot/releases/download/v1.21.7/OpenFront_AggroBot_Impossible_Run3.user.js)** | Experimental variant with the fixed, bundled Schema 4 champion model |

3. Save the script, open **[openfront.io](https://openfront.io/)**, and enter a playable match.
4. Use the in-game AggroBot panel to control the autopilot.

**Important:** Activate only **one** AggroBot variant at a time. When using Spawn Advisor, disable overlapping automatic features such as auto-spawn, smart attack, and auto-accept alliances. The bot waits for a playable match and event-bus readiness; it does not automate replays.

### Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Alt + Shift + P` | Pause or resume |
| `Alt + Shift + X` | Disable the bot and automatic start |

## 🎮 What can it do?

| System | Capabilities |
| --- | --- |
| **Territory** | Spawn automation, expansion planning, target evaluation |
| **Military** | Combat planning, troop allocation, reserve checks |
| **Navy** | Port and transport planning, naval operations |
| **Economy** | Resource budgeting, structures, upgrades, investment priorities |
| **Defense** | Threat awareness, emergency responses, defensive structures |
| **Diplomacy** | Alliance interactions, team-oriented support and coordination |
| **Research** | Neural candidate ranking, match diagnostics, benchmarking |

**Local Duo mode:** Run `Start_Live_Duo.bat` with **Node.js 24+**, then enable Duo in two separate browser instances in the same match using the same room code. The relay is restricted to `127.0.0.1:8767`. It does not override actual in-game alliance status, legality checks, or reserve rules. Read the [Duo setup guide](docs/LOCAL_DUO.md).

## 🧪 Built for tinkering

Want to tune the strategy, compare experimental models, or investigate what the bot actually did? The repository includes the canonical userscript source, deterministic build scripts, regression tests, local diagnostics, and benchmarking tools.

**Node.js 24+** is recommended for the development tools:

```sh
node tools/build-userscript.cjs --check
node tools/build-run3-bundle.cjs --check
node tests/strategy-regression.cjs
node tests/duo-status-regression.cjs
node tests/shadow-v5-regression.cjs
node tests/scenario-pack-regression.cjs
node tests/benchmark-regression.cjs
```

Edit the modules in `src/userscript/` rather than editing generated scripts directly. Rebuild the standard script with `node tools/build-userscript.cjs --write` and the Run3 bundle with `node tools/build-run3-bundle.cjs --write`.

The reviewed Run3 Schema 4 model is kept at `trainer/run3-champion.json`. Historical raw training datasets and bulk benchmark outputs are intentionally excluded from the public source tree. Always check [GitHub Actions](https://github.com/SLP-DEV1/openfront-bot/actions) for the latest CI status. The pinned compatibility suite verifies reproducibility; the separate [daily latest-upstream check](.github/workflows/upstream-latest.yml) detects new OpenFront engine/API changes.

**Technical docs:** [Benchmarks](docs/BENCHMARKS.md) · [Neural training](docs/NEURAL_TRAINING.md) · [Experiment protocol](docs/EXPERIMENT_PROTOCOL.md) · [Diagnostics](docs/DIAGNOSTIC_V2.md)

## 🤝 Help the project grow

If you find AggroBot interesting, there are easy ways to contribute:

- ⭐ **[Star the repository](https://github.com/SLP-DEV1/openfront-bot)** to help others find it.
- 🐛 **[Open an issue](https://github.com/SLP-DEV1/openfront-bot/issues)** with clear reproduction steps for a bug.
- 💡 Share a strategy idea or a measurable improvement — especially with reproducible evidence.
- 🔗 Share the project with people interested in OpenFront bots, game automation, JavaScript, or experimental AI strategy.

## ⚠️ Project status & responsible use

AggroBot is an independent community project **not affiliated with or endorsed by OpenFront**. It is experimental: the existence of neural models, successful tests, or a completed simulation does **not** demonstrate a particular win rate against humans or Impossible opponents. Follow OpenFront's rules and terms; automated play in online matches may be restricted.

Do not publish credentials, private replay exports, player identifiers, or personal diagnostic ZIPs. Keep local tools bound to loopback and review shared logs for sensitive data. See [SECURITY.md](SECURITY.md). Deleted files can still exist in old Git commits, forks, or caches.

---

**Built for OpenFront strategy experiments.** ⭐ [Star AggroBot](https://github.com/SLP-DEV1/openfront-bot) if you want to support the project.
