# P6 – reproduzierbare Experimente (Teilpaket, keine abgeschlossene Gegnerliga)

Ein Engine-Match ist **eine** unabhängige Beobachtung. Zwei Exporte eines
Duo-Matches sind zwei Spielerperspektiven, **nicht** zwei Siege oder Stichproben.
Ohne vollständiges Match-Ende bleibt der Ausgang `unknown`. Aus einem Replay
ohne rekonstruierbaren GameView entstehen keine legalen Zustand/Aktion-Paare.

## Manifest erzeugen

`tools/benchmark/experiment-manifest.cjs` erstellt ein maschinenlesbares
Manifest mit SHA-256 für Hauptskript, Run3-Bundle, Champion und kanonische
Optionen. Es startet **keine** Partie und behauptet keinen Erfolg.

Eine Eingabedatei `experiment-input.json` muss reale Werte enthalten:

```json
{
  "matchId": "ECHTE_MATCH_ID",
  "seed": "ECHTER_SEED",
  "map": "World",
  "mode": "official-2v2",
  "botCommit": "0123456789012345678901234567890123456789",
  "engineCommit": "0123456789012345678901234567890123456789",
  "settings": {"aggressive": 85, "reserve": 35, "fullAuto": true},
  "participants": ["BOT_A", "BOT_B", "GEGNER_A", "GEGNER_B"],
  "policy": "rule-basis",
  "observedOutcome": "unknown"
}
```

**Die SHA-Zeilen und Teilnehmernamen sind reine Platzhalter** und dürfen
nicht als tatsächlich verwendete Referenzen eingecheckt werden. Nur mit
echten Commit-IDs und Matchmetadaten ausführen:

```powershell
node tools/benchmark/experiment-manifest.cjs .\experiment-input.json > .\experiment-manifest.json
node tests/experiment-manifest-regression.cjs
node tools/build-run3-bundle.cjs --check
```

Die Manifest-Datei neben dem vollständigen Diagnose-/Match-Export sichern.
`sourceSha256`/ `run3Sha256` müssen dem tatsächlich gestarteten Browsercode
entsprechen, nicht nur irgendeinem GitHub-Stand. Trainiertes Modell und
Einstellungen zwischen gepaarten Vergleichsläufen einfrieren.

## Abnahme-/Evaluationsprotokoll

1. **Format getrennt:** 1v1, offizielles 2v2 und FFA mit Duo-Allianz
   nicht in einer Siegquote mischen.
2. **Basis gegen Kandidat:** gleicher Engine-Pin, Karte, Spieleranzahl,
   Seeds, Gegner, Spawn-/Rollenrotation; eigene und Partner-Sessions
   derselben Partie zusammenführen.
3. **Datenqualität:** überholte Engine, fehlender vollständiger Spielzustand,
   nicht bestätigte Aktion, Match-Limit und persönliche Eliminierung
   getrennt erfassen. Keine fehlenden Ergebnisse als Niederlage/Sieg buchen.
4. **Wirkung:** gehaltenes Land, bestätigte Gebäude-/Einkommenswirkung,
   Truppenkosten, aktive Duo-Pläne, bestätigte Starts/Abbrüche sowie
   persönliche und Team-Ergebnisse separat messen.
5. **Beförderung:** vorab definierte Gates und unabhängige Holdouts.
   `0/8` alte Run3-Holdouts sind kein Beleg neuer Multiplayer-Stärke.

**Offen:** zwei vollständige getrennte Bot-Clients in derselben
Enginepartie, Gegnerliga, mehrere echte Replay-GameViews, neue gepaarte
Holdouts und Modell-Promotion. Der Manifest-Generator löst diese Aufgaben
nicht von selbst. Fortschritt: [Roadmap](BENCHMARKS.md),
[P6-Issue #74](https://github.com/SLP-DEV1/openfront-bot/issues/74).


## P6: gepaarter Holdout-Gate für ein Kandidatenmodell

`trainer/promotion-gate-v5.cjs` prüft einen **vorab festgelegten**
Vergleich gegen **beide** unveränderten Arme `rule-basis` und
`run3-schema4`. Aufruf nach dem Erzeugen echter separater Partien:

```powershell
node trainer/promotion-gate-v5.cjs .\holdout-evidence.json
```

Die JSON-Datei enthält `protocol` und `rows`. Im `protocol` stehen
`engineCommit` (40 Hex-Zeichen), je Arm `botSHA256` und
`policySHA256` (je 64 Hex-Zeichen), `modes`, mindestens zwei `maps`,
mindestens zwei `opponents`, `minPairsPerCell` (mindestens 2) und
`scenarios`. Statt eines Seed-Kreuzprodukts enthält `scenarios` für jede
vorregistrierte Partie einen Block aus global eindeutiger
`scenarioId`, global eindeutigem echten Engine-`matchSeed`, `mode`, `map` und
`opponent`. Jeder `rows`-Eintrag ist **eine
Partie eines Arms in einem Szenario**, nicht eine Spielerperspektive:
`arm,matchId,scenarioId,matchSeed,mode,map,opponent,engineCommit,botSHA256,policySHA256,
exitCode,verified,confirmed,recording,outcome,termination,endLand,endTick`.
`recording` benötigt `complete:true,dropped:0,streamErrors:0`.

Für jeden Szenario-Block muss je ein echter Match-Bericht für Kandidat,
Regelbasis und Run3 mit demselben `matchSeed` existieren. Derselbe echte Seed
darf nicht in einem zweiten Szenario-Block erneut verwendet werden. Jede
Modus-/Karten-/Gegner-Zelle benötigt mindestens `minPairsPerCell` solcher
global eindeutigen Blöcke. Ein fehlender,
duplizierter, fremder, abgebrochener oder zensierter Bericht verhindert die
Freigabe. Nur bestätigte Endzustände `victory`/`defeat` zählen;
`tick-limit` und `unknown` sind weder Sieg noch Niederlage. Der
Kandidat darf je Szenariogruppe nicht weniger Siege aufweisen und nicht
unter 95 % des mittleren gehaltenen Endgebiets der jeweiligen Vergleichsbasis
fallen; insgesamt braucht er gegenüber **jedem** Basisarm mindestens einen
zusätzlichen beobachteten Sieg und mindestens dessen mittleres Endgebiet.

**Abgrenzung:** Diese Prüfung validiert die *übergebenen strukturierten
Nachweise*, nicht unabhängig die rohen Engine-Dateien oder die
Vorabregistrierung. `eligible:true` ist eine Empfehlung zur
**manuellen Prüfung**, keine automatische Deployment-Freigabe, kein Beleg
für Spielstärke ohne reale unabhängige Holdouts und keine Änderung der
aktiven Run3-Policy. Der CI-Test verwendet synthetische Fiktionen, um
Fehlerpfade zu prüfen, und veröffentlicht keine neuen Spielergebnisse.
