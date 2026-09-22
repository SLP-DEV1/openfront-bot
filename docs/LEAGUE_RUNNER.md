# Reproduzierbare Benchmark-Liga (P6, implementierter Runner)

Dieser Runner startet den **bestehenden** GameView-/OpenFront-Engine-Harness in
separaten Partien mit Seeds, Bot-Einstellungen und verschiedenen
*skriptgesteuerten* Gegnerprofilen. Die Gegner sind **keine vollständigen
AggroBots**. Er enthält keine Zwei-Client-/Duo-Matches und ist kein Beleg für
menschliche Multiplayer-Stärke. Ein Liga-Plan oder eine Ergebnisdatei behauptet
keine Siege, wenn kein Spiel ausgeführt wurde.

```powershell
node tools/benchmark/league.cjs --engine ../OpenFrontIO --engineCommit <EXAKTER_40_ZEICHEN_COMMIT> --out benchmark-results/league-20260922
# Erst mit --execute werden Partien tatsächlich ausgeführt:
node tools/benchmark/league.cjs --engine ../OpenFrontIO --engineCommit <EXAKTER_40_ZEICHEN_COMMIT> --out benchmark-results/league-executed --execute
```

Optionen: `--seeds league-001,league-002`,
`--profiles autonomous,balanced,cautious,expansion`,
`--opponents rush,balanced,defender,opportunist`,
`--ticks 18000`, `--map World`, `--size Compact`, `--difficulty Impossible`,
`--bot OpenFront_Solo_AggroBot.user.js`. Die offizielle Engine muss im
sauberen Checkout auf exakt `--engineCommit` stehen. Das Tool schreibt
`league.json` mit Engine-Commit, Bot-SHA256, Seed und genau einem Eintrag je
Partie; nach `--execute` kommen je Partie `match.json`, `events.jsonl`
und `turns.jsonl` aus dem bestehenden Harness hinzu. Fehlende oder
abgebrochene Partien bleiben `unknown`/ `failed` statt fiktiver Ergebnisse.

**Nicht durchgeführt:** Langzeit-, vollständige Zwei-Client-, Liga- oder
Wirkungstests auf Nutzerwunsch. Die Dateien beschreiben Funktionen, keine
neuen Messergebnisse. Für eine Liga **vollständiger Bot-Gegner** müsste der
Harness zusätzlich mehrere echte GameViews, Busse, Worker und Bots mit
getrennten Client-IDs pro Partie instanziieren; der Runner behauptet das nicht.
