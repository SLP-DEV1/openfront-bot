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
nicht von selbst. Fortschritt: [Roadmap](COMPETITIVE_ROADMAP.md),
[P6-Issue #74](https://github.com/SLP-DEV1/openfront-bot/issues/74).
