# Diagnosekorrekturen 1.19.1

Grundlage: Public/FFA auf Aegean, Diagnose 1.19.0 vom 21.09.2026, Export 14:12:37 UTC, Tick 7248. Kein bestätigtes Endergebnis im Export; der Nutzer bestätigte später das Partieende. Die Änderungen basieren auf Repository-Stand `157380b` und verändern keine Trainingsmodelle.

## Befunde und Änderungen

| Befund | Änderung | Funktionen |
| --- | --- | --- |
| 520 protokollierte SAM-Abfragen, kein legaler Bau; Preis blieb unbekannt | Worker-Preis vor Legalitätsprüfung lesen. Reales Budget ansparen, fehlendes Gold separat erfassen und nicht als Standortfehler cachen. Nach 180 Ticks bezahlbarer Standortablehnungen andere Bauten wieder erlauben. | `economy`, `economicNeeds` |
| Hafenbau bei bereits eingehendem Bodenangriff | Bei Angriffen über 18 % der Heimtruppen nur SAM/Verteidigungsposten planen; vor dem Senden aktuellen Angriff erneut prüfen. | `economicNeeds`, `economy` |
| Erneute Transporte nach Verlust produktiver Gebäude | Identitäten verlorener Gebäude und Gebietsverluste über die letzten 300 Ticks berücksichtigen. Neue Transporte auch bei beobachteten eingehenden Nukes stoppen; beim Senden Reserve erneut prüfen. | `sampleTroops`, `navalHomeRisk`, `naval`, `sendMarineTransport` |
| Große Transporte knapp unter bisheriger 30-%-Schwelle | Globalen Heimschutz ab 20 % der Heimtruppen oder 200.000 internen Einheiten anwenden; mindestens 1.000 Einheiten. | `globalNavalHomeGuard` |
| Entfernte Kriegsschiffe galten als Begleitung | Sichtbare gegnerische Kriegsschiffe entlang eines geraden Korridors prüfen; örtliche eigene Begleitung verlangen. Nach ungeklärtem Transportverlust muss die Begleitung bei Start oder Ziel stehen. | `navalRouteRisk` |
| Zielübernahme ohne Nachweis dauerhaften Nutzens | `boat_arrived` bleibt Ankunftsnachweis; zusätzlich `bridgehead_held` oder `bridgehead_lost` nach bis zu 120 Ticks. Keine kausale Zuordnung von Gebietsgewinnen behaupten. | `inspectMarine` |
| 14 von 21 Gegnern als Marinefokus eingestuft | Ports zählen nicht als Marineaggression. Richtigen Engine-Typ `Transport` auswerten. Flotte relativ zu lebenden menschlichen Spielern bewerten. Konfidenz aus aufeinanderfolgenden gleichen Signalen statt gesamter Beobachtungszahl. | `observeHumanProfiles` |
| Historisches Lernergebnis kann als aktueller Sieg missverstanden werden | `learning.lastResultScope` kennzeichnet persistente Historie; `currentMatchResult` stammt nur aus dem aktuellen beobachteten Spielende. | `diagnosticSnapshot` |

## Prüfung

- Strategie-Regressionen einschließlich reproduzierter SAM-Budgetblockade, Krise während Worker-Abfrage, Heimatverlusten, örtlicher Begleitung, Brückenkopf-Haltefrist und Profilkonfidenz.
- Autostart-, Lern- und Neural-Regressionen.
- Echter lokaler Engine-Lauf (`13b403387af01d388f8c8ed8c953b6d3a11d1457`): Aegean Compact, Public FFA, Medium, 12 Bots, 4 Nationen, 4 skriptgesteuerte menschliche Slots, gemischte Profile, Seed `diagnose1191-smoke`. 2.400 Ticks, kein Laufzeitfehler, 10.110 Felder am Ticklimit. Kein vollständiges Match und kein Test gegen echte Menschen.

## Grenzen und offene Validierung

- Die lokale Engine liefert beim ersten SAM einen Preis von 1.500.000 Gold. Der Bot nutzt trotzdem ausschließlich den aktuellen Worker-Preis, keinen fest eingebauten Preis.
- Die genaue Engine-Version des Exports und die lokale Test-Engine unterscheiden sich. Fehlerursachen im laufenden öffentlichen Match lassen sich daraus nicht lückenlos rekonstruieren.
- Der Routenkorridor ersetzt keine Wasserwegplanung. Ein örtliches Begleitschiff garantiert keinen erfolgreichen Transport.
- Gebäude-/Gebietsverluste sind beobachtete Warnsignale; ihre Ursache wird nicht automatisch Nukes oder einem bestimmten Gegner zugeschrieben.
- Ein gehaltener Zielpunkt beweist weder Nettogebietsgewinn noch Rentabilität des Transports.
- Regressionen prüfen die neuen Entscheidungen und Schutzregeln. Eine höhere Siegquote gegen Menschen muss separat durch vollständige vergleichbare Partien gemessen werden.
