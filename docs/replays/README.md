# Menschliche Replay-Daten – Inventar, Provenienz, Blocker

P2 dokumentiert den aktuellen Stand der **menschlichen** Replay-Daten für das
Curriculum, damit nie ohne Datengrundlage „menschliches Verhalten gelernt“
behauptet wird.

## Aktuelles Inventar

| Replay | Spieler | Modus | Sieg/Niederlage | Provenienz | Status |
| --- | --- | --- | --- | --- | --- |
| `cR8SRtEEcR` | ProfessorSployer (+DARKEYRAS) | Italia Duos, Public/Team | Sieg (Team 1) | `gameID=cR8SRtEEcR`, `clientID=nzSEztci` | einziger aktueller Datenpunkt → [Doku](./professor-sployer-cR8SRtEEcR.md) |

**Erforderlich, aber noch fehlt:** mehrere Spieler **und** ein Mix aus
Siegen UND Niederlagen. Das ProfessorSployer-Beispiel ist ein einzelner
Siegerlauf und belegt keinen kausalen Vorteil eines Parameterwerts.

## Provenienz- und Nutzungsrecht-Regel

Humandaten werden **nur** gespeichert, wenn beides vorliegt (erzwungen in
`tools/benchmark/replay-visible-state.cjs` / `replay-cli.cjs`):

- **Provenienz**: konkrete Herkunft, z. B. `gameID`/`clientID` (bei
  Enginesimulationen genügt stattdessen der exakte Engine-Commit).
- **Zustimmung/Nutzungsrecht**: wie die Daten verwendet werden dürfen
  (z. B. `consent`, `public`, `personal-use`).

Ohne Provenienz **und** Nutzungsrecht wirft der Import für
`origin:'human-replay'` ab. Damit bleibt die Datenbasis kontrollierbar und
reproduzierbar abweisbar.

## Szenarioidee vs. Lernpaar

- Ein akzeptierter Frame (Engine-Pin passt, sichtbarer `GameView`, gültige
  Aktions-/Anfangsdaten) ist ein **Lernpaar** (`kind:'learning-pair'`).
- Ein abgewiesener Frame ist nur eine unverbindliche **Szenarioidee**
  (`scenarioIdeas[]`) – er wird aufbewahrt, aber nicht als Trainingspaar
  behandelt.
- Ereignistags (`tools/benchmark/replay-events.cjs`) tragen immer
  `source`, `tick`, `observation` und `validity` (`observed`/`inferred`).
- Train/Holdout werden **pro ganzer Partie** getrennt
  (`tools/benchmark/replay-split.cjs`); nahe Frames derselben Partie kommen
  nie auf beide Seiten. Features sind nur sichtbare `GameView`-Signale –
  keine versteckten Engine-Wahrheiten.

## Blocker (Daten)

> **BLOCKER:** Es existiert genau **ein** menschliches Replay
> (ProfessorSployer `cR8SRtEEcR`). Bevor mehrere Spieler mit Siegen **und**
> Niederlagen mit Provenienz + Nutzungsrecht vorliegen, wird „menschliches
> Verhalten gelernt“ **nicht** behauptet. Der Import- und Curriculums-Rahmen
> (Gate, Tags, Split, Provenienz) ist bereit und getestet.

**Offen / nächste Schritte:**
1. Weitere offizielle Replay-JSONs mit dokumentierter Provenienz sammeln
   (mehrere Spieler, gemischte Ergebnisse).
2. Pro Replay: Provenienz (`gameID`/`clientID`) + Nutzungsrecht festhalten.
3. Per `replay-cli.cjs` in sichtbare Frames konvertieren, Tags erzeugen und
   per `replay-split.cjs` pro Partie in Train/Holdout trennen.
4. Erst dann Humandaten dem Schema-5-Training (P3) zuführen.
