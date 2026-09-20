# Impossible: 1.18.0 – Strategie und experimentelle Policy v4

Der Bot erreicht mit diesem Stand **keine nachgewiesene Impossible-Gewinnstärke**.
Die bereits bestehende 1.17.2-Baseline verlor auf World/Europe, Compact,
jeweils vier Impossible-Nationen und Seeds `impossible-101,102` alle vier
bestätigt beendeten Spiele. Ein erfolgreicher GitHub-Workflow ist nicht gleich
einem Sieg. Bei 1.18 unbedingt die im PR verlinkte *paired evaluation* mit
denselben Seeds, dem Engine-Commit, den `outcome`-Feldern und den Endticks
vergleichen. Nicht abgeschlossene Matches sind weder Siege noch Niederlagen.

**Sicherer Standard:** Die experimentelle, noch nicht siegreiche Mehrfront-/Spawn-/Kriegs-Neuplanung ist über den GUI-Schalter **Impossible AI Test** ausdrücklich opt-in (`impossibleExperiment=false` auf einer frischen Installation). Hafen-/SAM-Fehlerbehebungen, Investitionswertung, Worker- und Marine-Bestätigung bleiben unabhängig davon aktiv. So wird eine im Paarvergleich schlechter abschneidende Strategie nicht stillschweigend zur Standardpolicy.\n\n## Veränderte Spielplanung

- Aus sichtbaren feindlichen Fronten, eigener Entwicklung und eingehenden
  Angriffen ergibt sich eine **konservative Frontprognose**. Zusätzliche
  Reserven greifen bei tatsächlicher beobachteter Bedrohung; rein benachbarte
  Nationen dürfen die neutrale Eröffnungsphase nicht vollständig blockieren.
- Kriegsziele werden nach einer erfolglosen Offensive bei **separat als legal
  und sicher bewerteten** Alternativen neu geprüft. Der Hauptkriegs-/Allianz-
  und Worker-Schutz ist unverändert bindend.
- Die Standortsuche berücksichtigt die hinter der aktiven Front gehaltene
  Verteidigungsreichweite sowie eigene Gebietsverluste. Kein Standort wird
  als dauerhaft sicher garantiert: der tatsächliche Spielserver kann die
  Front bereits während der Bauzeit verschieben.
- Die erste Hafen-Suche darf dringende SAM-Kandidaten und die sofortige
  Landverteidigung **nicht aus dem Worker-Budget filtern**. Wirtschaftsoptionen
  berücksichtigen beobachtete Bahn-/Handelseinnahmen und bestätigte Baukosten.
  Der Worker bestimmt weiterhin die Bau-Legalität; fehlende Einnahmen sind
  nicht automatisch ein Nachweis, dass ein Standort niemals rentabel wird.
- Die Bauabfragen erhalten nur den tatsächlich geprüften Gebäudetyp. Ein
  frischer Transport wird bevorzugt per passendem Ziel identifiziert; bei
  mehreren zeitgleichen neuen Schiffen wird keine willkürliche Zuordnung
  als bestätigte Landung behauptet.

## Schema 4: optional, trainierbar, nicht automatisch besser

Alte Schema-1/2/3-Modelle bleiben kompatibel. Schema 4 ist ein
`24x24x16-tanh`-Modell mit 1.000 Gewichten. Zusätzlich zu den 16
bisherigen Eingängen erhält es **acht beobachtbare, normierte Signale**:
Zweitfront-Stärke, eigenen Gebietsverlust, Bahn- und Handelsertrag,
ungeschützte Infrastruktur, jüngsten Feinddruck, Verteidigungsposten und
unbestätigte/ungeklärte Marine-Transporte. Die gleichen 16 begrenzten
Ausgänge priorisieren Krieg/Wirtschaft/Marine/Diplomatie, ohne Intents zu
erzeugen oder Legality-/Reserveprüfungen zu umgehen.

```powershell
node trainer/train.mjs --dryRun true --schema 4 --maps World,Europe --nations 1,4
node trainer/train.mjs --schema 4 --engine ../OpenFrontIO --engineCommit bb8af015b515b3b717bd4d901074c5f4c16641cb --maps World,Europe --nations 1,4 --difficulty Impossible --generations 3 --population 4 --trainSeeds 2 --evalSeeds 4 --parallel 2 --ticks 18000 --out benchmark-results/strategic-v4-impossible
```

`Train_Strategic_Neural.bat` startet Schema 4. `trainer/train.mjs`
bleibt aus Kompatibilitätsgründen ohne `--schema` bei Schema 3. Neue
Champion-Gewichte werden ausschließlich über die bestehenden getrennten,
vollständig bestätigten Holdouts veröffentlicht, nicht aufgrund von Reward,
eines unbestätigten Limits oder eines einzelnen Trainingsmatches.
Erst eine tatsächlich erzeugte `champion.json` kann mit
`trainer/deploy.mjs --model ... --out ...` gebündelt werden. Kein
bestehendes Tampermonkey-Userscript wird dabei überschrieben.

## Nachweispflicht vor Qualitätsbehauptungen

Für Impossible sind separate Siege, Niederlagen, Überlebenszeit,
gehaltenes Land, Defizitzeit an den Fronten, bestätigte Hafen-/SAM-Bauten
und maritime Landungsbestätigungen auszuwerten. Seeds und Karten, auf denen
trainiert wurde, gehören nicht zu den Holdouts. Eine neuronale
Architekturerweiterung ist **kein empirischer Gewinnnachweis** und ein
Paarvergleich ohne Siege erlaubt keine Aussage über dominante Spielstärke.
