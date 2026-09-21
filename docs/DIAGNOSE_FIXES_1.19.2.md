# Diagnosekorrekturen 1.19.2

Grundlage: `OpenFront_AggroBot_1.19.1_Diagnose.json`, Public/FFA, NYC Normal, Medium; Export vom 21.09.2026 um 14:37:45 UTC, letzter Snapshot Tick 2632. Der Export enthält kein bestätigtes Endergebnis. Der Nutzer bestätigte das Partieende vor den Änderungen. Ausgangsstand: `8690978`.

## Bestätigte Beobachtungen

- **Tick 1645 (14:35:59 UTC):** 1.097.074 Heimtruppen, rund 134.361 eingehende Truppen (12,25 %), 76.600 Gold. Der Hafenfonds betrug 250.000 Gold. Zwei legale Bauangebote mit Mindestpreis 50.000 wurden durch Priorität oder Reserve gesperrt. Die bisherige 18-%-Krisenschwelle griff nicht.
- **Tick 1682 (14:36:03 UTC):** Das Bündnisangebot von Factory Man wurde mit „Aktiver Konflikt“ abgelehnt; 979.265 Heimtruppen und rund 256.309 eingehende Truppen.
- **Tick 2013 (14:36:36 UTC):** Erneute Ablehnung mit „Aktuelles Kriegsziel“; 456.195 Heimtruppen, rund 470.983 eingehende Truppen und 19.063 Felder.
- **Tick 1767 (14:36:11 UTC):** Der Kriegsplan übernahm Factory Man aus einem beobachteten ausgehenden Angriff. Im Export ist kein passender Bot-Angriffsbefehl dokumentiert. Die Herkunft lässt sich nachträglich nicht sicher bestimmen.

## Änderungen

| Bereich | Korrektur | Funktionen |
| --- | --- | --- |
| Friedensangebote | Ein tatsächlich eingehendes Angebot darf bei militärischem Druck die Sperre für aktive Konflikte oder das aktuelle Kriegsziel überwinden. Verräter bleiben ausgeschlossen. Ausgehende Angebote bekommen diese Ausnahme nicht. | `diplomacyScore`, `diplomacyTickSafe` |
| Allianzbestätigung | Kriegsziel, passender Angriffsplan, Operation und Frontgedächtnis werden erst bei beobachteter Allianz bereinigt. Das bloße Senden der Annahme genügt nicht. | `diplomacyTickSafe` |
| Verteidigungsbudget | Die bestehende Schwelle über 18 % bleibt. Ab 8 % werden zusätzlich ein annähernd gleich starker Gegner, mindestens 3 % / 100 Felder jüngster Gebietsverlust oder mindestens 40 Ticks beobachteter Angriff berücksichtigt. Unter diesen Bedingungen werden Investitionsfonds freigegeben und nur Verteidigung/SAM geplant. | `economicDefensePressure`, `sampleTroops`, `economicNeeds` |
| Aktuelle Lage vor Bau | Dieselbe Prüfung läuft nach der asynchronen Standortabfrage nochmals mit aktuellen Militärdaten. Ein zwischenzeitlicher Angriff kann einen Wirtschafts-/Hafenbau verhindern. | `economy` |
| Angriffshistorie | Jeder erfolgreich gesendete Bot-Angriff erhält eine Befehlsnummer, Ziel, Truppenzahl, Tick und vorher sichtbare Angriffs-IDs. Höchstens 80 Befehle werden im Export gehalten. | `send`, `diagnosticSnapshot`, `reset` |
| Herkunft beobachteter Angriffe | Neue Angriffe werden nur bei eindeutig passendem Ziel, Zeitfenster und Truppenmenge mit einem Bot-Befehl korreliert. Alte, mehrdeutige oder nicht passende Angriffe heißen `unattributed`. Korrelation ist ausdrücklich kein Herkunftsbeweis. | `observeAttackOrigins`, `step` |

Die Verteidigungsregel ignoriert kleine Sondierungsangriffe. Ohne aktuell eingehende Truppen blockiert sie die Wirtschaft nicht. Veraltete oder lückenhafte Stichproben gelten nicht als anhaltender Angriff. Die neuen Prozentwerte sind Heuristiken und benötigen weitere Matchdaten.

## Prüfung

- 236 Strategieprüfungen erfolgreich, darunter elf neue Fälle für Friedensangebote, die echte Allianzkarte ohne erkannten Annahme-Konstruktor, Bestätigung, Verteidigungsbudget, einen tatsächlich gesendeten Verteidigungsbau, Lageänderungen während der Bauabfrage sowie eindeutige/mehrdeutige Angriffskorrelation und Reset.
- Autostart (8 Fälle), Lern- und Neural-Regressionen erfolgreich; Syntax und erzeugte Neural-O/W-Varianten geprüft.
- Lokaler Engine-Lauf mit Aegean Compact, Public FFA, Medium, 12 Bots, 4 Nationen und 4 skriptgesteuerten menschlichen Slots: 2.400 Ticks ohne Laufzeitfehler, 259 Felder am Ticklimit, Ergebnis unbekannt (Seed `diagnose1192-smoke`). Dies ist eine Integrationsprüfung, kein Nachweis besserer Spielstärke und kein Test gegen echte Menschen.

## Grenzen und Ursachenhypothesen

- Ein akzeptiertes Bündnis hätte möglicherweise den Druck reduziert. Der Export beweist weder diesen Verlauf noch einen vermeidbaren Sieg/Niederlage-Ausgang.
- Früherer Verteidigungsbau hätte möglicherweise Gebäude geschützt. Bauzeit, genauer Frontverlauf und Wirkung sind damit nicht belegt.
- Die frühe Fabrik und der spätere Verlust von Stadt/Fabrik sind zusätzliche Optimierungskandidaten. Aus dem Export allein lässt sich kein konkreter Platzierungsfehler nachweisen; die Bauplatzregeln werden in diesem Patch nicht spekulativ geändert.
- Es wurden in dieser Partie keine gegnerischen Silos oder eingehenden Nukes beobachtet. Die SAM-Korrektur aus 1.19.1 wird dadurch nicht im Multiplayer validiert.
- Es findet keine nachträgliche Zuschreibung des ungeklärten Angriffs an Nutzer, Bot oder ein weiteres Skript statt. Neue Telemetrie verbessert erst künftige Exporte.
