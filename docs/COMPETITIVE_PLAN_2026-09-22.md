<!-- Vom Nutzer eingereichter Entwicklungsplan; ursprüngliche Analyse inhaltlich unverändert. -->

> **Historische Analyse auf `10e81ee` / 1.20.8, keine heutige Test- oder Fertigstellungsaussage.** Die laufende Übersicht steht in [COMPETITIVE_ROADMAP.md](COMPETITIVE_ROADMAP.md).

# AggroBot: Entwicklungsplan für starkes menschliches Multiplayer

Stand der Analyse: 22.09.2026. Geprüfter GitHub-Commit: `10e81ee` (Hauptskript 1.20.8). Die Analyse verwendet eine separate Arbeitskopie; währenddessen eingehende GitHub-Änderungen sind nicht eingeschlossen.

## 1. Empfehlung

Der Bot besitzt bereits viele notwendige Bausteine: bestätigte Aktionen, Verteidigung, Ausgabenreservierung, Gegnerbeobachtung, Wirtschaft, Marine, Diplomatie, Duo-Abstimmung und eine begrenzte Neural-Policy. Sein größter Engpass ist nach dieser Prüfung die **Qualität der gemeinsamen Entscheidung**: Was bringt unter der aktuellen Lage mehr als weiteres Abwarten, mit welchem Einsatz und welchem Ausstiegsplan?

Ich empfehle einen schrittweisen Umbau mit fünf Schwerpunkten:

1. **Spielmechanik und verlässlichen Referenzstand herstellen.** Insbesondere Kapazitätsplanung, fehlgeschlagene Regressionen und auseinanderlaufende Userscripts.
2. **Angriffe, Reserve und Abwarten gemeinsam bewerten.** Aktuell verhindern mehrere unabhängige Schwellen viele Kandidaten bereits vor dem Ranking.
3. **Wirtschaft nach zusätzlichem Nutzen planen.** Kapazität, Rekrutierung, Einkommen, Erreichbarkeit und Schutz eines Standorts getrennt berechnen.
4. **Duo, Marine und Diplomatie als zusammenhängende Operationen steuern.** Ein Zielhinweis oder eine einzelne Welle reicht nicht.
5. **Gegen vollständige, vielfältige Gegner lernen und messen.** Erst anschließend komplexere Modelle trainieren und ihren Mehrwert nachweisen.

Eine realistische Chance gegen sehr gute Menschen ist ein anspruchsvolles Entwicklungsziel. Der aktuelle Datenbestand erlaubt keine belastbare Siegquotenprognose. Die unten genannten Abnahmekriterien sind vorgeschlagene Entwicklungsziele, keine bereits erreichten Ergebnisse.

## 2. Was tatsächlich geprüft wurde

- Aktueller Quellstand von `OpenFront_Solo_AggroBot.user.js`, relevante Unterschiede zum Run3-Skript, strategische und wirtschaftliche Entscheider, Duo, Handel, Marine, Neural-Eingaben sowie Trainer und Engine-Harness.
- Fünf neueste lokale Exporte von 1.20.2 und 1.20.5: **zwei Matches, vier Spieler-Sessions**. Drei Yenisei-Dateien enthalten zwei Perspektiven und einen Wiederholungsexport; zwei Russia-Dateien die beiden Bot-Perspektiven.
- Vorhandene Trainingsberichte und Holdout-Daten, einschließlich des Neural-v2-Vergleichs. Diese entstanden mit älteren Bot-Versionen und belegen keine Spielstärke von 1.20.8.
- Originale `Config.ts` der in den Live-Diagnosen genannten OpenFront-Version `7c27263390d8f1976566e5c5ad9adf6fcad311b6`, direkt aus dem offiziellen Repository gelesen.
- Lokale Strategie-, Bundle-, Neural-, Neural-v2- und Benchmark-Regressionen sowie Syntaxprüfung des Hauptskripts.

**Nicht geprüft:** Ein neues vollständiges Live-Match von 1.20.8 gegen Menschen. Keine neue Trainingskampagne, keine vollständige Sicherheitsprüfung aller Hilfsdienste. Die Partie wurde nicht bedient und der Bot-Code nicht verändert.

### Ergebnis der ausgeführten Prüfungen

| Prüfung | Ergebnis auf `10e81ee` |
| --- | --- |
| Hauptskript: Syntax | Bestanden |
| `tests/strategy-regression.cjs` | **265 bestanden, 17 fehlgeschlagen** |
| `tests/bundled-run3-regression.cjs` | **Fehlgeschlagen**, Bundle entspricht nicht dem aktuellen Hauptskript |
| `tests/neural-regression.cjs` | Bestanden |
| `tests/neural-v2-regression.cjs` | Bestanden |
| `tests/benchmark-regression.cjs` | Bestanden |

Die 17 fehlgeschlagenen Strategietests sind **nicht automatisch 17 verschiedene Produktfehler**: Ein Teil kann auf überholte Erwartungen nach Strategieänderungen zurückgehen. Auffällig sind SAM-/Silo-/Port-Prioritäten, ein Zugriff auf ein fehlendes Allianzpanel, Neural-Aktionsranking und eine Duo-Termin-Erwartung. Jeder Fall muss gegen die beabsichtigte Regel und die echte Engine entschieden werden; bloßes Anpassen der Assertions wäre keine Lösung.

## 3. Konkrete Befunde

### A. Belegt: Kapazitätsengpass wird mit dem falschen Gebäudetyp verknüpft

`economicNeeds()` setzt bei hoher Truppenfüllung `capStalled`, erhöht insbesondere den Factory-Score und nennt die Investition „Truppenlimit: Fabrik/Upgrade priorisiert“. `spendBudget()` gibt hierfür zusätzliche Factory-Ausgaben frei. Der Regressionstest ab Zeile 3059 erwartet ausdrücklich eine Fabrik bei voller Armee.

In der zum Diagnoseexport passenden originalen Engine erhöht `maxTroops()` die Truppenkapazität durch Land und fertiggestellte **City-Level**. Eine Factory kommt in dieser Formel nicht vor. Eine Fabrik kann einen wirtschaftlichen Nutzen haben; sie ist jedoch keine unmittelbare Kapazitätserweiterung.

**Konkrete Diagnose:** Russia, Spieler `9y7ftbl9`, Tick 2569: 13.044 Felder, 925.552 Heimtruppen bei 939.219 Kapazität, also 98,54 %; eine City und eine Factory. Angezeigte Investition: Fabrik wegen Truppenlimit. Tick 2774 wird erneut eine Factory gewählt, Tick 2781 bestätigt. In diesem Auswahlereignis wählen sowohl Regel- als auch Policy-Ranking Factory; der protokollierte zusätzliche Aktions-Delta ist null.

**Bewertung:** Die unzutreffende Verknüpfung ist im Code und in der Engine belegt. Dass eine andere Investition die Partie gewonnen hätte, ist nicht belegt. Hier beginnt die Umsetzung: einen tatsächlichen Kapazitätsbedarf über City/Upgrade beziehungsweise erreichbare Expansion behandeln und Factory nach Einkommen bewerten.

Betroffen: `economicNeeds()` (3408), `spendBudget()` (3579), `investmentValue()` (3376), `economy()` (3822), Kapazitätstests.

Originalquelle: [OpenFront Config.ts, passender Live-Commit](https://github.com/openfrontio/OpenFrontIO/blob/7c27263390d8f1976566e5c5ad9adf6fcad311b6/src/core/configuration/Config.ts#L1021); dort `maxTroops()` ab 1021 und `troopIncreaseRate()` ab 1055.

### B. Belegt: lange Wachstumsplateaus vor dem Zusammenbruch

Russia, Spieler `9y7ftbl9`:

| Tick | Beobachtung |
| --- | --- |
| 1096–2077 | In den regelmäßigen Snapshots unverändert 12.676 Felder; Heimtruppen wachsen von 347.063 auf 712.138. |
| 2129 | Ein Spielerangriff im Befehlsjournal. Insgesamt sind dort zehn neutrale und ein Spielerangriff dokumentiert. |
| 2157–3064 | Snapshots bei 13.044 Feldern; Heimtruppen wachsen von 788.135 auf 938.472. |
| 2581 | Kein Landkriegsziel freigegeben. 926.506 Heimtruppen, 342.807 verfügbar, 63 % Reserve. Zwei Nachbarn mit 1.171.474 und 1.297.353 Heimtruppen werden wegen zu geringer verfügbarer Stärke verworfen. |
| 3147 | 661.241 eingehende Truppen, Modus RECOVER. |
| 3227 | 1.415.918 eingehende Truppen, 10.603 Felder. |
| 3433 | Persönliche Eliminierung mit null Feldern im Export belegt. |

Beim Partner `e9dfqef9` stehen im letzten Export Tick 3574 noch 79 Felder. Dort ist kein Spielende protokolliert. Vier Transporte sind bestätigt, drei Landungen und drei zunächst gehaltene Brückenköpfe dokumentiert; ein Transport bleibt ungeklärt. Auch erfolgreiche Einzelaktionen führen also nicht automatisch zu nachhaltigem Wachstum.

**Hypothese:** Der Bot gerät wirtschaftlich und territorial zurück, während er auf eine sehr klare militärische Überlegenheit wartet. Der Angriff bei Tick 2581 ist dadurch nicht als sinnvoll bewiesen: Beide Nachbarn waren stärker. Nötig ist die Prüfung früherer Alternativen – Kapazitätsausbau, günstiger Raumgewinn, wirksame Allianz, gemeinsame Front oder erreichbare Landung – bevor die Lage kippt.

Die Exporte halten nur die letzten 1.400 Ereignisse vor; ein Teil der frühen Ereignisse ist verworfen. Regelmäßige Snapshots beweisen keine lückenlose Gleichheit zwischen den Messpunkten. Truppenzahlen oben sind Engine-Einheiten; das aktuelle Panel zeigt sie geteilt durch zehn.

### C. Belegt: viele Schutzregeln entscheiden vor dem eigentlichen Ranking

`military()` bildet das Maximum mehrerer Reserveschwellen. Danach folgen `frontRiskPlan()`, `targetOpportunityCheck()`, `rankedTargets()` und `offensiveCommitment()`. `strategicDirector()` erlaubt bei RECOVER/DEFEND ausschließlich Halten. Die Neural-Policy kann einen zuvor ausgeschlossenen Kandidaten nicht zurückholen.

Ein Rechenbeispiel zeigt die Größenordnung: Bei 63 % Reserve bleiben 37 % für Angriffe. Verlangt eine normale frühe Gelegenheit das 1,55-Fache gegnerischer Truppen, müsste die eigene Heimatarmee bereits etwa **4,19-mal** so groß sein, um allein diese Schwelle zu erfüllen. Das gilt nur für diese Kombination ohne Partnerkredit, besondere Gelegenheit oder Neural-Anpassung; weitere Prüfungen kommen hinzu.

**Hypothese:** Die Kombination begünstigt klare Übermacht und kann gewinnbringende begrenzte Aktionen gegen ähnlich starke Menschen übersehen. Zugleich können dieselben Reserven gegenüber mehreren koordinierten Gegnern unzureichend sein. Ein einzelner niedrigerer Reserve-Regler löst beides nicht.

### D. Belegt: Vorhersage und Operationen bleiben vereinfachte Näherungen

- `attackForecast()` prüft höchstens zwölf Frontfelder und extrapoliert auf höchstens 80 Felder. Das ist keine Simulation einer vollständigen Schlacht mit Reaktionen, Rekrutierung und Rückzügen.
- `frontPressureForecast()` verwendet den stärksten Gegner plus einen begrenzten Anteil des zweitstärksten und jüngste Verluste. Angriffswahrscheinlichkeit, Reaktionszeit und gegenseitige Bindung der Gegner werden nicht als kalibrierte Verteilung modelliert.
- `planOperation()` nutzt unter anderem ein festes 1.100-Tick-Fenster und meist zehn Prozent weniger gegnerisches Land als Erfolgskriterium. Die Auswahl bevorzugt vorhandene Kriegsbindung vor mehreren Alternativen.
- `sameFrontFollowUp()` lässt inzwischen eine zweite Welle zu. Ihre Zulassung bleibt an feste Bedingungen gebunden, unter anderem genau einen aktiven Gegnerverband, mindestens 70 % Kapazität und keinen jüngsten Heimdruck.

**Folgerung:** Das Fundament für Operationen ist vorhanden. Es sollte um laufend aktualisierte Zielwerte, Prognosefehler und begründete Ausstiegsentscheidungen erweitert werden.

### E. Belegt: Duo-Koordination ist vorhanden, aber eng gefasst

`duoJointOpportunity()` verlangt eine gemeinsame Landfront, aktuelle gegenseitige Bestätigung und jeweils eigene geschützte Budgets. Bereits beobachtete Partnerangriffe werden berücksichtigt. Seit 1.20.6 bleibt ein abgestimmtes Zeitfenster über harmlose Strategiewechsel stabil; 1.20.8 erweitert Handel und Truppenhilfe.

Damit fehlen nicht „Duo-Funktionen insgesamt“. Der nächste Schritt sind unterschiedliche Rollen und Alternativen, wenn kein gemeinsamer Grenzgegner vorhanden ist: einer hält, einer investiert; einer bindet, einer landet; Ressourcenhilfe für einen konkret berechneten Bedarf. In den alten Russia-Snapshots können beide „bereit“ sein, während `strikeTick` und `joint` leer bleiben. Bereitschaft braucht deshalb getrennte, verständliche Zustände.

### F. Belegt: Marine bewertet Raum und Zeit noch unzureichend

`navalRouteRisk()` verwendet einen geraden Korridor. Nach einem ungeklärten Transport bleibt ein globaler Escort-Bedarf über den kumulativen Zähler bestehen. `globalNavalHomeGuard()` berücksichtigt den stärksten sichtbaren anderen Spieler auch ohne Nachweis kurzfristiger Erreichbarkeit. `landingThirdPartyRisk()` untersucht vier direkte Nachbarfelder des Landepunkts.

**Hypothese:** Der Bot kann zugleich ungefährliche entfernte Macht überschätzen und tatsächliche Abfang- oder Brückenkopfgefahren unterschätzen. Lokale Geometrie, Fahrtzeit und Verstärkungsfähigkeit gehören in denselben Plan.

### G. Belegt: Trainingsumgebung und Live-Aufgabe unterscheiden sich stark

`scriptedHumanIntents()` in `tools/benchmark/engine-match.mjs` erzeugt feste Rush/Balanced/Defender/Opportunist-Landangriffe beziehungsweise neutrale Expansion. Diese Clients entwickeln keine eigene Wirtschafts-, Flotten-, Nuklear- oder Diplomatiestrategie. Das Harness startet einen AggroBot, keine zwei vollständigen kooperierenden AggroBots. Der Team-Schalter allein testet deshalb keinen echten Duo-Betrieb.

Weitere Unterschiede:

- `scriptedHumans` ist aktuell auf zwölf begrenzt; die neuen Live-Exporte enthalten Phasen mit deutlich mehr Menschen.
- Das Harness setzt bei scripted Humans Zufallsspawn; die Live-Diagnosen enthalten eigene Spawn-Intents.
- Die Adapterliste enthält derzeit keine Embargo-Events für die neue Handelslogik.
- Serielle, abgewartete Botzyklen bilden Browser-Verzögerungen und gleichzeitig laufende Scheduler nur eingeschränkt ab.
- Engine-Pins der Benchmarks (`13b4033…` beziehungsweise `bb8af01…`) unterscheiden sich vom in diesen Live-Diagnosen genannten `7c27263…`.

**Folgerung:** Mehr Durchläufe derselben Umgebung würden zunächst Leistung für diese Umgebung optimieren. Ein Transfer gegen sehr gute Menschen muss separat gemessen werden.

### H. Belegt: „Neural aktiv“ ist bisher kein Stärkenachweis

Die Schema-4-Policy hat 24 Eingaben, 24 versteckte Einheiten, 16 Ausgaben und **1.000 Gewichte**. Sie beeinflusst feste Planer. Gold wird ab einer Million, eigenes Land ab 20.000 Feldern auf dem jeweiligen Eingang gesättigt. Damit sind auf diesen Eingängen beispielsweise eine und acht Millionen Gold ununterscheidbar. Ein Gedächtnis über mehrere Zustände besitzt dieses Netz nicht.

In `holdout-finalD.json` hat Run3 **0/8 Siege**, ebenso die Null-Policy. Die mittlere End-Tickzahl ist 5.940 gegenüber 5.393. Das ist eine beschreibende Überlebensdifferenz in einer kleinen Stichprobe, kein belegter Vorteil gegen Menschen. Im älteren Neural-v2-Holdout ist auf Hard die Null-Policy mit zwei Siegen erfolgreicher als die gezeigten Kandidaten mit null beziehungsweise einem Sieg. Unterschiedliche Versionen und Testkontexte dürfen daraus nicht zu einer gemeinsamen Siegquote verrechnet werden.

Die Trainingsdokumentation enthält zudem veraltete beziehungsweise widersprüchliche Angaben, etwa 9.216 statt tatsächlich 1.000 Gewichten und abweichende Beschreibungen der inzwischen geänderten Aufstiegsregel. Quellen und ausführbarer Stand müssen gemeinsam versioniert werden.

## 4. Zielarchitektur

Die bewährten Schnittstellen zur Engine bleiben die Ausführungsebene. Darüber entstehen klar getrennte, testbare Bausteine:

```text
GameView + bestätigte eigene Aktionen + bestätigte Partnerdaten
                         ↓
             Zeitlich konsistenter Zustandsbericht
                         ↓
       Raum, Wirtschaft, Gegner und laufende Operationen
                         ↓
       Aktionskandidaten inklusive Halten und Abbrechen
                         ↓
    Vergleich mehrerer plausibler gegnerischer Antworten
                         ↓
      Gemeinsame Zuteilung von Truppen, Gold und Zeit
                         ↓
         Aktueller Engine-/Allianzcheck vor Ausführung
                         ↓
     Bestätigung, Wirkung und Prognosefehler zurückmelden
```

**Wichtige Trennung:** Engine-Legalität, verbündete Ziele, bereits gebundene Ressourcen und ungültige Daten bleiben verbindliche Grenzen. Strategische Regeln wie „63 % Reserve“, „nur ein Kriegsziel“ oder „bei DEFEND immer halten“ sind dagegen überprüfbare Annahmen. Sie werden nach und nach durch belegte Risikobewertungen ersetzt, nicht pauschal abgeschaltet.

Die Umstellung erfolgt in kleinen Schritten hinter experimentellen Schaltern. Zuerst geben neue Module nur Empfehlungen aus, während die bisherige Logik spielt. Dann werden einzelne Entscheidungsbereiche umgestellt. Eine vollständige Neuschreibung würde den Vergleich und die Fehlersuche unnötig erschweren.

## 5. Priorisierter Umsetzungsplan

### Phase 0 – Verlässliche Basis und Mechanik, höchste Priorität

**Arbeitspakete**

1. Fehlgeschlagene Regressionen einzeln auf Produktfehler, veraltete Erwartung oder unzureichende Simulation untersuchen; insbesondere Allianzpanel ohne vorhandenes DOM-Element und konkurrierende Bauprioritäten.
2. Einen einzigen Quellstand als Grundlage beider Userscripts verwenden. Run3-Datei automatisiert mit Modell erzeugen; Version, Inhalt und Modellhash im Release gemeinsam prüfen.
3. City-/Factory-Zuordnung korrigieren. Für Gebäudeeffekte, Kosten, Bauzeit, Kapazität, Truppenwachstum und Angriffskosten kleine Referenzszenarien gegen die passende offizielle Engine aufbauen.
4. Engine-Adapter und neue Handelsereignisse angleichen. Live- und Testkonfiguration eindeutig mit Bot-, Modell-, Engine- und Einstellungs-Hash speichern.
5. Jeder gesendeten Aktion eine Entscheidungs-ID geben; Ausgaben, Truppenabfluss, Ausführung und beobachtete Wirkung getrennt zuordnen. Fehlende Wirkung bleibt unbekannt.

**Betroffene Stellen:** `economicNeeds`, `spendBudget`, `allianceOfferPath`, `telemetry`, `diagnosticSnapshot`, `send`, Run3-Bundle, `tests/strategy-regression.cjs`, `tests/bundled-run3-regression.cjs`, `tools/benchmark/engine-match.mjs`, CI.

**Abnahme:** Alle relevanten Regressionen bestehen mit fachlich begründeten Erwartungen. Ein Factory-Bau verändert in einem isolierten Kapazitätstest die maximale Truppenmenge nicht; ein fertiggestellter City-Bau beziehungsweise ein Upgrade tut dies entsprechend der Engine. Beide ausgelieferten Skripte tragen identische Spiellogik. Jeder ausgewertete Lauf ist exakt zuordenbar.

### Phase 1 – Einheitlicher Zustand, Reserve und Entscheidung

**Arbeitspakete**

1. Einen Snapshot je Entscheidungszyklus mit Tick, Datenalter, eigenen Ressourcen, laufenden Armeen, Fronten und bestätigten Beziehungen erstellen. Nach einer langsamen Worker-Abfrage aktualisieren oder verwerfen.
2. Pro erreichbarem Gegner sichtbare Truppenverläufe, Angriffe, Rückzüge, Landänderungen und jüngste Feindseligkeit führen. Mehrere Zeitfenster statt nur eines aktuellen Etiketts.
3. Drei zunächst einfache Antwortszenarien vergleichen: Gegner hält; Gegner greift zurück; zusätzlicher erreichbarer Gegner nutzt den Einsatz aus. Stärke und Zeitpunkt aus beobachteten Grenzen ableiten, Unsicherheit kennzeichnen.
4. Die minimale tragfähige Heimatreserve aus diesen Szenarien bestimmen. Rückkehr eigener und gegnerischer Verbände zeitlich berücksichtigen; fremde gebundene Truppen nicht gleichzeitig als sofortige Heimatverteidigung und sofortigen Gegenangriff zählen.
5. Aktionen mit dem Zustand nach Halten vergleichen: erwartetes gehaltenes Land, Infrastruktur, Rekrutierung und Einkommen sowie Verlustschwere. Auch Kosten weiteren Stillstands berücksichtigen.
6. Anfänglich nur die besten fünf bis acht Kandidaten prüfen. Planung im Worker oder in unterbrechbaren Abschnitten; Notverteidigung darf nicht auf Suche warten.

**Betroffene Stellen:** `military`, `frontPressureForecast`, `frontRiskPlan`, `strategy`, `strategicDirector`, `targetOpportunityCheck`, `rankedTargets`, `offensiveCommitment`, `step`.

**Abnahme:** Ein starker, friedlicher Nachbar führt nicht ohne weitere Bewertung zu endlosem Stillstand. Eine tatsächlich drohende zweite Welle verhindert einen zu großen Einsatz. Jeder längere Stillstand erklärt die beste verworfene Alternative und die erwartete Entwicklung beim Warten. Prognosefehler werden gegen beobachtete Ergebnisse gemessen.

**Leistungsbudget:** Als Startziel weniger als 50 ms zusätzliche Planung im 95. Perzentil auf dem Testrechner; bei Überschreitung weniger Kandidaten und kürzerer Horizont. Dies ist ein Messziel, keine zugesicherte Browserleistung.

### Phase 2 – Wirtschaft und Eröffnung mit messbarem Nutzen

**Arbeitspakete**

1. Kapazität, aktuelles Truppenwachstum und Einkommen separat bewerten. Ein Kapazitätsengpass verlangt eine andere Investition als fehlendes Gold oder eine zerstörte Handelsverbindung.
2. Für jede legale Bau-/Upgradeoption den Zusatznutzen über mehrere Horizonte schätzen: Bauzeit, zusätzlichen Ertrag, zusätzliche Truppen, exponierten Standort, Ersatzkosten und konkurrierende Käufe.
3. Cities und Upgrades bei echter Kapazitätssättigung vergleichen; Factories über die tatsächliche Bahn-/Wirtschaftsmechanik, Ports über erreichbare Handelsbeziehungen oder benötigte Marinefähigkeit bewerten.
4. Sparziele mit Preisquelle, erreichbarer Baustelle, voraussichtlichem Finanzierungszeitpunkt und Ablauf versehen. Ein nicht realisierbarer Technikplan darf günstigen produktiven Aufbau nicht unbegrenzt verdrängen.
5. Aus `sampleIncome()` eine Ausgaben-/Einnahmenrechnung entwickeln: Veränderungen des Goldbestands, Handel, Bahn, Spenden und Eroberungen auseinanderhalten. Ein Kauf darf nicht als Einkommenseinbruch missverstanden werden.
6. Spawnauswahl um zusammenhängenden erreichbaren Raum und spätere neue Fronten ergänzen. Ringstichproben allein beweisen keine Verbindung. Im Duo ausreichend gemeinsamen Spielraum und getrennte sichere Bauflächen bewerten.
7. Neutrale Expansion nach Kosten, Dauer und neu geöffneten Fronten dosieren. Nur räumliche Ziele optimieren, die die echte Angriffsschnittstelle steuern kann; ein Spielerangriff besitzt keine beliebig wählbare Landroute.

**Betroffene Stellen:** `economicNeeds`, `investmentValue`, `siteScore`, `economicAnchors`, `railCorridor`, `spendBudget`, `sampleIncome`, `spawnScore`, `duoSpawnCandidate`, `neutralAttackAmount`, `targetsFromBorder`.

**Abnahme:** In isolierten Tests wird der jeweilige Engpass tatsächlich kleiner. Kapazitätsleerlauf sinkt gegenüber der unveränderten Basis, ohne dass frühe Eliminierungen steigen. Hafen, Factory und City bekommen abhängig von Erreichbarkeit und Ressourcen unterschiedliche begründete Werte. Gebäudeverlust vor Amortisation wird separat ausgewiesen.

### Phase 3 – Taktischer Kampf und Initiative

**Arbeitspakete**

1. Begrenzte Ziele unterscheiden: Raum gewinnen, Gegner ausschalten, Partner entlasten, eine Front binden, Zugang herstellen. Für jedes Ziel Einsatz, Zeitfenster, erwarteten Gewinn und Abbruchkriterien festlegen.
2. `attackForecast()` gegen tatsächliche Schlachtverläufe kalibrieren. Frontgeometrie, Gelände, Defense Posts und Rekrutierung gemeinsam berücksichtigen. Fehlende exakte Engine-Prognose ausdrücklich als Näherung behandeln.
3. Laufende Operationen regelmäßig zwischen Fortsetzen, Verstärken, Pausieren und Rückzug vergleichen. Eine zweite Welle vom erwarteten zusätzlichen Nutzen ableiten, nicht allein von Kapazitätsquote und festem Abstand.
4. Vorzeitigen Zielwechsel erlauben, wenn die Hauptoperation feststeckt und eine bessere zulässige Alternative existiert; bereits gebundene Armeen und neue Flanken bleiben berücksichtigt.
5. Gegenangriffe nach der entblößten gegnerischen Heimat, eigener Verteidigungswirkung und Rückkehrzeiten bewerten. Nicht jeder eingehende Angriff rechtfertigt einen Gegenangriff.
6. Nationale Schwierigkeitsboni von Menschenlogik trennen: Eine identische menschliche Front soll nicht allein wegen der Lobby-Nationen-Schwierigkeit eine andere pauschale Stärkeanforderung erhalten.

**Betroffene Stellen:** `planOperation`, `manageWar`, `attackForecast`, `sameFrontFollowUp`, `targetOpportunityCheck`, `attack`, `defense`, `evaluateLastBattle`, `enemyOpportunityRatio`.

**Abnahme:** Szenarien mit leeren gegnerischen Heimtruppen, Rückkehr einer Armee, zweiteiliger Angriffswelle, stockender Offensive und neuem Bündnis bestehen. Ein Angriffserfolg zählt als gehaltener Gewinn beziehungsweise erreichtes Operationsziel, nicht als gesendeter Befehl.

### Phase 4 – Duo als gemeinsamer Entscheider

**Arbeitspakete**

1. Gemeinsame Kandidatenliste mit getrennten Rollen: gemeinsamer Angriff, halten/aufbauen, entlasten, flankieren, landen und gezielte Hilfe.
2. Die Gesamtlage beider Partner bewerten; wer baut, wer kämpft und wer kann eine kurzfristige Schwäche verkraften? Die eigene Reserve jedes Bots bleibt Bestandteil des gemeinsamen Plans, wird aber nicht doppelt gegen dieselbe Bedrohung gerechnet.
3. Bereitschaft aufteilen in Verbindung vorhanden, echte Allianz bestätigt, Ziel erreichbar, Budget vorhanden, Partner zugesagt und Ausführung beobachtet. Gründe für fehlenden Starttick anzeigen.
4. Einen Plan mit ID, Ablauf, Einzelbudgets, geplantem Start und Abbruchbedingungen austauschen. Verzögerte Nachrichten und Verbindungsverlust dürfen keine veralteten Starts auslösen.
5. Truppen-/Goldhilfe nach **Wirkung** bewerten: Verhindert der Transfer den erwarteten Fall? Finanziert er ein tatsächlich fehlendes, rechtzeitig fertiges Gebäude? Ist eigener Aufbau wertvoller?
6. Für getrennte Grenzen einen alternativen Teamplan zulassen, statt nur auf einen gemeinsamen Grenzgegner zu warten. Land- und Seefronten gemeinsam betrachten.

**Betroffene Stellen:** `duoState`, `duoPublish`, `duoJointOpportunity`, `coordinateDuo`, `teamSupport`, `duoSpawnCandidate`, `tools/duo-relay.cjs`.

**Abnahme:** Zwei vollständige Bot-Instanzen spielen dieselbe Engine-Partie. Tests umfassen verlorene Nachrichten, verspätete Bestätigung, unterschiedlich starke Partner, getrennte Fronten und Partnerinvasion. FFA-Allianz-Duo und offizielles 2v2 werden getrennt ausgewertet; Spielresultat und persönliche Eliminierung bleiben getrennt.

### Phase 5 – Marine, Technik und Diplomatie

**Marine:** Wasserverbindungen und geschätzte Fahrtzeit bestimmen; Abfangrisiko zeitlich statt über einen geraden Korridor bewerten. Zielstärke bei Ankunft schätzen. Eine Landung benötigt Plan für Halten, Nachschub und Anschlussraum. Frühere ungeklärte Landungen erzeugen lokale, zeitlich begrenzte Unsicherheit; ein Vorfall sperrt nicht dauerhaft alle anderen Routen. Ein weit entfernter Großspieler bindet nur dann hohe Heimatreserve, wenn er im Planungshorizont wirksam werden kann.

**Technik:** SAM-Abdeckung, bedrohte Anlagen, Fertigstellungszeit und beobachtete gegnerische Abschussfähigkeit gegen wirtschaftliche Opportunitätskosten bewerten. Nuklearangriffe anhand erwarteter Wirkung und anschließender nutzbarer Operation vergleichen; Treffer, Schaden und strategischer Nutzen getrennt messen. Schutz verbündeter Ziele und endgültiger Engine-Check bleiben verbindlich.

**Diplomatie/Handel:** Gesicherte Grenzen, tatsächliche Handelswirkung, Ablauf eines Bündnisses, verbleibende Expansion und Gegnerführung bewerten. Ein Embargo kann beiden Seiten Einkommen kosten; nicht allein aus einem Zielmarker auf seine wirtschaftliche Vorteilhaftigkeit schließen. Eingehende Friedensangebote und Verlängerungen zeitnah behandeln. Verhalten eines Gegners nur aus beobachteten Aktionen dieser Partie ableiten; keine automatische Übertragung von Namen auf andere Menschen.

**Betroffene Stellen:** `naval`, `navalRouteRisk`, `globalNavalHomeGuard`, `landingThirdPartyRisk`, `inspectMarine`, `fleetDefense`, `nuclearIntel`, `nukeTargets`, `nukeSalvoPlan`, `diplomacyScore`, `renewAlliances`, `tradePolicy`.

**Abnahme:** Insel-/Küsten-/Binnenkarten, Umwege, mehrere Transporte, Flottenabwehr, Landungen während gegnerischer Rekrutierung, SAM-Schutz und Allianzänderungen werden geprüft. Marineerfolg wird nach 120 und nochmals nach 600 Ticks bewertet, wenn das Spiel so lange weiterläuft. Eine ausbleibende Beobachtung bleibt unbekannt.

### Phase 6 – Gegnerliga, Replays und sinnvolles Lernen

**Zuerst die Gegner verbessern**

- Einen vollständigen AggroBot als Gegner aus separater GameView/Client-Perspektive betreiben; danach mehrere Instanzen und beide Duo-Partner.
- Archivierte Bot-Versionen und unterschiedliche vollständige Strategien in einer Liga behalten: früher Druck, defensiver Wirtschaftsaufbau, koordinierte Mehrfrontangriffe, opportunistischer Gegenangriff, Marine und Technik.
- Schwierige Teilzustände gesondert trainieren: Ausbruch aus Einkesselung, Gebäude nach Verlust ersetzen, am Kapazitätslimit reagieren, zeitversetzte Angriffe, Rückzug und Nachschub.
- Menschliche Replays mit genauer Engine-Version und allen nötigen Startdaten rekonstruieren, soweit möglich. Nur aus dem zum Entscheidungszeitpunkt sichtbaren Zustand lernen. Reine Intent-Listen ohne rekonstruierten Zustand reichen nicht für zuverlässige Zustands-/Aktionspaare.
- Mehrere gute Spieler sowie Siege und Niederlagen berücksichtigen. Das vorhandene an anonymized replay participant-Replay ist wertvolle Anregung, aber ein einzelnes positives Beispiel.

**Dann das Modell verändern**

1. Als Vergleich die reine Regelbasis und die bisherige Schema-4-Policy behalten. Bessere Ergebnisse müssen auf demselben neuen Code verglichen werden.
2. Eingaben erweitern: relative Wirtschaftsleistung, tatsächliche Kapazitätswirkung, Bau-/Upgrade-Level, erreichbare Fronten, gegnerisch gebundene Truppen, zeitliche Verläufe und Partnerbedarf. Große Werte logarithmisch beziehungsweise relativ sinnvoll skalieren; Migration als neues Modellschema.
3. Für jede konkrete Aktion eigene Merkmale auswerten: Ziel, Einsatz, Restarmee, Zeit, Schutzkosten und erwarteter Nutzen. Ein gemeinsamer Land-Prioritätswert kann diese Unterschiede nur begrenzt ausdrücken.
4. Zuerst ein kleines Modell für Kandidatenbewertung beziehungsweise Prognose trainieren. Es erhält messbare Lernziele: zukünftiger gehaltener Gewinn, Ressourcenwirkung und Verlustwahrscheinlichkeit. Nicht sofort alle Regeln durch ein großes Netz ersetzen.
5. Kurze gegnerische Antwortszenarien zur Auswahl der besten Kandidaten nutzen. Ein größeres zeitliches Modell oder aufwendigeres Reinforcement Learning ist erst sinnvoll, wenn Daten, Gegner und Suchbudget tragen.
6. Jede wesentliche Policy-Änderung als Vergleich mit und ohne diese Änderung messen. Eine aktive Inferenz oder ein großer Score-Delta ist kein Erfolgskriterium.

**Betroffene Stellen:** `tools/benchmark/engine-match.mjs`, `trainer/train.mjs`, `trainer/reward.cjs`, `trainer/evaluation-v2.cjs`, `trainer/strategic-policy-v4.cjs`, `neuralStrategicSignals`, `neuralActionDelta`.

**Abnahme:** Ein Kandidat schlägt im vorab festgelegten Testverfahren die aktuelle Regelbasis und einen festen Gegner-Mix. Ein gegen eine einzige Gegnervariante trainiertes Modell bekommt keinen allgemeinen Multiplayer-Stärkenachweis.

## 6. Wie Spielstärke nachgewiesen wird

### Drei getrennte Wettbewerbe

| Format | Hauptziel | Wichtige Zusatzwerte |
| --- | --- | --- |
| 1v1 | Siege gegen definierte Gegner | Zeitpunkt wirtschaftlicher Führung, wirksame Angriffe, vermeidbare Niederlagen |
| Offizielles 2v2 | Bestätigte Teamsiege | Koordinationsrate, Hilfewirkung, beide Partner überleben kritische Phasen |
| Größere FFA-Lobbys | Siege und Platzierung relativ zur vergleichbaren Basis | Erreichen später Phasen, gehaltenes Land, Infrastruktur, Einfluss auf Führende |

Ein Sieganteil von 50 % ist für eine große FFA-Lobby kein sinnvoller allgemeiner Sollwert. FFA-Duo mit freiwilliger Allianz ist außerdem kein offizielles Teamspiel und erhält eigene Berichte.

### Versuchsdesign

1. Referenz einfrieren: Bot, Modell, Engine, Einstellungen, Karten, Größen, Spieleranzahl und Gegnerliga. Browser-Lernen entweder deaktivieren oder identisch versioniert zurücksetzen, damit Varianten vergleichbar bleiben.
2. Pro Änderung zunächst ein Szenariopaket und etwa 20 gepaarte vollständige Engine-Spiele zum Aussortieren deutlicher Regressionen.
3. Vielversprechende Kandidaten über mindestens 100 gepaarte Begegnungen pro gewähltem Kernformat vergleichen; Karten-/Spawn-/Rollenrotation einbeziehen. Die nötige Stichprobe hängt von der Streuung und der gewünschten nachweisbaren Verbesserung ab und kann deutlich größer sein.
4. Training, Modellauswahl und abschließenden unangetasteten Test trennen. Wiederholtes Ausprobieren auf denselben Finals macht diese zu Auswahldaten.
5. Einen Hauptmesswert und tolerierte Verschlechterungen vorab festlegen. Gepaarte Unterschiede mit Unsicherheitsintervallen ausweisen; Stichproben nach Match, nicht nach Tick oder nach zwei Partnerexporten zählen.
6. Tick-Limits als nicht abschließend beobachtete Ergebnisse behandeln. Separat berichten und aussichtsreiche offene Partien bei Bedarf länger laufen lassen. Bloßes Überleben ersetzt keinen Sieg.
7. Erst nach Engine-Fortschritt wiederholte vollständige Spiele gegen konkret benannte, nach nachvollziehbarem Rating oder Turniererfahrung eingestufte starke menschliche Gegner auswerten. Ergebnisse nach Gegner und Format aufteilen. Erste zehn bis zwanzig Matches dienen der Fehlersuche; sie begründen noch keine präzise allgemeine Siegquote.

### Metriken, die früh auf echten Fortschritt hinweisen

- Anteil der Zeit mit fast voller Kapazität ohne produktiven Einsatz oder wirksamen Ausbau.
- Zusätzlich gehaltenes Land pro eingesetzter Truppe und pro Operationszeit; neutrale und feindliche Gebiete getrennt.
- Verlust wichtiger Gebäude vor ihrem erwarteten Nutzungszeitpunkt.
- Geschätztes gegenüber tatsächlich beobachtetem Einkommen; Goldbindung in unerreichbaren Sparzielen.
- Verhältnis prognostizierter zu beobachteter Gefechtswirkung und Schaden an der eigenen Heimat.
- Dauer bis zur Reaktion auf relevante Gegneraktionen; Zahl veralteter oder nicht bestätigter Befehle.
- Anteil gestarteter, abgebrochener und erfolgreich beendeter Duo-Pläne samt Gründen.
- Bestätigte Landungen mit anschließend gehaltenem Anschlussgebiet.
- Neural: Anteil tatsächlich veränderter Entscheidungen und deren Ergebnis gegenüber derselben Regelbasis.

Die vorhandene Aufstiegsregel lässt bei mehr Siegen begrenzte Regressionen zu und verlangt bei gleichen Siegen unter anderem wiederholbare Überlebens-/Landgewinne ohne einzelne Regressionen. Das ist ein brauchbarer Schutz gegen grobe Rückschritte, aber kein statistischer Stärkenachweis. `decisionRoundNeeded` wird berechnet; der Trainer startet derzeit daraus keine größere Entscheidungsrunde. Diese Runde beziehungsweise ein vorab begrenztes Verfahren sollte ergänzt werden.

## 7. Umsetzung in überschaubaren Paketen

Die folgenden Aufwände sind grobe Größenordnungen für fokussierte Entwicklungsarbeit einschließlich Tests; sie hängen insbesondere von Engine-Anbindung und Replay-Verfügbarkeit ab und addieren sich nicht zu einer zugesicherten Lieferzeit.

| Reihenfolge | Paket | Größenordnung | Ergebnis |
| --- | --- | --- | --- |
| 1 | Regressionen, Bundle, Gebäudemechanik | 2–4 Arbeitstage | Ein belastbarer Referenzstand |
| 2 | Zwei vollständige Clients, richtige Engine, Aufzeichnung | 3–6 Tage | Ein vergleichbarer Multiplayer-/Duo-Test |
| 3 | Kapazität und wirtschaftlicher Zusatznutzen | 3–6 Tage | Sichtbar weniger wirkungsloser Stillstand |
| 4 | Gemeinsame Aktions-/Reservebewertung und Operationen | 5–10 Tage | Begründete, zeitlich abgestimmte Initiative |
| 5 | Duo-Rollen und Hilfewirkung | 3–6 Tage | Teamentscheidungen über einzelne gemeinsame Angriffe hinaus |
| 6 | Marine, Technik, Diplomatie | 5–10 Tage | Tragfähige Alternativen zur blockierten Landfront |
| 7 | Gegnerliga, Replays, Kandidatenmodell, Evaluation | 1–3 Wochen zunächst | Messbarer Lernfortschritt oder klare Ablehnung des Modells |

**Erstes konkretes Entwicklungspaket:** City-/Factory-Kapazitätsfehler korrigieren, widersprüchliche Wirtschaftstests bereinigen, Userscripts synchronisieren und die Russia-Stagnation als überprüfbares Szenario nachbilden. Danach denselben Bot mit und ohne Neural-Bias testen. Das ergibt eine wesentlich brauchbarere Basis für die nächste strategische Änderung als eine weitere pauschale Erhöhung von Aggressivität oder Trainingszeit.

## 8. Was vorerst zurückgestellt wird

- Großes neues Netz ohne bessere Zustandsmerkmale, Gegner und Messverfahren.
- Weitere feste Spezialregeln aus einem einzelnen gewonnenen Replay.
- Gleichzeitige Änderungen an Reserve, Bauprioritäten, Marine und Modell, deren Wirkung anschließend nicht zugeordnet werden kann.
- Mehr Aktionsfrequenz ohne Nachweis, dass Reaktionszeit der Engpass ist.
- Unbegrenzte Suche im Browser und eine komplette Neuschreibung auf einmal.

## 9. Quellen und Arbeitsartefakte

- [Geprüfter GitHub-Stand](https://github.com/SLP-DEV1/openfront-bot/commit/10e81ee).
- Hauptskript-Funktionen und Zeilen beziehen sich auf diesen Stand; spätere Commits können die Positionen ändern.
- `docs/COMPETITIVE_PLAN_EVIDENCE_2026-09-22.json`: verdichtete lokale Diagnosewerte, Match-/Session-Zuordnung, Snapshots, Bauereignisse und Angriffsblockaden.
- Lokale Originale in `%USERPROFILE%/Downloads`: `OpenFront_AggroBot_1.20.2_Diagnose*.json` und `OpenFront_AggroBot_1.20.5_Diagnose*.json`.
- `docs/training-analysis-20260921/holdout/holdout-finalD.json` und `docs/training-analysis-neural-v2/evaluation-summary.json`: ältere Vergleichsergebnisse; keine gemeinsame Statistik mit den neuen Live-Exporten.
- `docs/replays/example-duo-replay.md`: vorhandene, ausdrücklich begrenzte Replay-Auswertung.

**Gesamturteil:** Eine erhebliche Verbesserung ist technisch plausibel, weil mehrere konkrete Engpässe identifiziert sind. Zuerst müssen Kapazitätsplanung, wirtschaftlicher Nutzen, abgestimmte Einsatzentscheidungen und realistische Tests stimmen. Ob daraus eine belastbare Chance gegen sehr gute menschliche Gegner entsteht, wird anschließend an vollständigen, unabhängigen Multiplayer-Partien gemessen.
