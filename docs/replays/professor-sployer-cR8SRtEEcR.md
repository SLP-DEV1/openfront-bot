# ProfessorSployer – OpenFront Italia Duos (cR8SRtEEcR)

**Datengrundlage:** Vom Nutzer bereitgestelltes offizielles Replay-JSON, `gameID=cR8SRtEEcR`, `clientID=nzSEztci`; 6.071 Spielticks, circa 610 Sekunden, Public/Team/Duos/Italia/Medium. Sieger laut Replay: Team 1 mit ProfessorSployer und DARKEYRAS.

## Beobachtete, explizit aufgezeichnete Aktionen

| Ticks | Beobachtung |
| --- | --- |
| 207–439 | Zwölf neutrale Landangriffe; erste gegnergerichtete Attacke Tick 502. |
| 502–1393 | Fortlaufende Landangriffe vor und während der frühen Wirtschaft: City-Befehle 834/992, Factory 1364, weitere City 1441. |
| 1714 | Erster Defense Post zwischen zwei Offensivphasen. |
| 1797/1855/1945/1966 | Vier Attacken auf **dieselbe** Ziel-ID `lqbedai5` statt nur einer Einzelwelle. Weitere wiederholte Ziel-IDs: `zgx9yqoa` (2550/2573/2795), `gsmgxkpy` (3114/3180/3487). |
| 1916/1997/2251 | Erste drei Transportbefehle; erster eigener Port-Baubefehl erst Tick 2330. Das Replay beweist nicht, wie die vorherigen Transporte ermöglicht wurden (z. B. bereits kontrollierter/capturierter Hafen). |
| 3029, 3702, 3873, 3926, 3974 | Weiterer gestaffelter und später konzentrierter Defense-Post-Ausbau. |
| 3514/4266/4945 | Drei Goldspenden an Empfänger-ID `38vnn3zf`: 4.761.763 / 5.820.127 / 4.155.744. |
| 4488/4614 | Zwei Truppenspenden an dieselbe Empfänger-ID: 801.474 / 1.280.830. |
| 4732/5361/5944 | Drei Wasserstoffbomben-Baubefehle (nicht automatisch Beweis eines Treffers). |
| 5995 | Allianzbruch vor den letzten Angriffsbefehlen. **Kein** Grund, automatisch Bündnisse zu brechen. |

Gesamt in den Intents dieses Client: **67 Angriffe** (12 neutral, 55 Spielerziele), **18 Transportbefehle**, **14 build_unit-Befehle**, darunter 3 City, 1 Factory, 1 Port, 6 Defense Post und 3 Hydrogen Bomb; außerdem 4 Allianzgesuche, 2 Angriffsabbrüche, 3 Goldspenden und 2 Truppenspenden. Statistik: drei eliminierte Gegner (Ticks 2914, 3526, 5210).

## Interpretation – ausdrücklich Hypothesen

- Das Wiederholen desselben Angriffsziels **kann** das Ausnutzen einer entstandenen Lücke sein. Der Replay-Intent allein zeigt keine zuverlässigen Heimtruppen, Reserven, Bauzeiten, tatsächliche erfolgreiche Landung oder Entscheidungsgründe. Daher **keine pauschale Aggressivitätserhöhung**.
- Frühe Landexpansion und ein anschließender Mix aus Land- und Seerouten sind beobachtbar, aber bestehende AggroBot-Planer besitzen dafür bereits Regeln. Der Zeitpunkt 1916 ist **keine** allgemeingültige Hafen-Frist.
- Hohe Spenden könnten das Duo stärken; der Empfänger `38vnn3zf` ist ohne sichere interne Spieler-ID-Zuordnung **nicht als DARKEYRAS nachgewiesen**. Spenden dürfen nur an im *aktuellen Spiel* verifiziert befreundete Spieler gehen.
- Die Datei liefert **keine vollständigen pro Tick aufgezeichneten Weltzustände für Imitation Learning**. Ein einzelner Siegerlauf belegt keinen kausalen Vorteil eines konkreten Parameterwertes.

## In AggroBot 1.20.7 übernommen

1. `sameFrontFollowUp()`: Maximal eine zweite, ausschließlich auf dieselbe aktuelle Kriegsfront gerichtete Welle bei real sichtbarem laufenden eigenen Angriff. Mindestens 80 Ticks Abstand; keine Invasion, kein jüngster Heimdruck, höchstens 35 % laufend gebunden, mindestens 70 % eigener Truppenkapazität und gesondert geprüfter Reserve-/Flankenschutz. Legalität und Allianzstatus werden nach dem Worker-Aufruf erneut geprüft.
2. Im Duo erhöhte Goldhilfe **nur** bei extremem Überschuss und klar finanzschwächerem, im Live-Spiel verifiziertem Teammitglied. Maximal 2 Mio. je Aktion, höchstens 30 % des Goldes oberhalb des reservierten Eigenbudgets, mindestens 3 Mio. Gold vor weiterer Schutzprüfung zurückbehalten. Eigener Truppenengpass, Landangriff und bedrohlicher Nachbar blockieren den Großspenden-Zweig.
3. Beide Userscripts werden mit identischer Logik und unverändertem gebündeltem Schema-4-Modell gepflegt. Regressionen gegen Mehrfachwellen, andere Ziele, Invasion, Allianzwechsel und Spenden ohne Eigenreserve.

**Nicht übernommen:** starre Angriffs-/Port-Ticks, ungeschützte Multi-Millionen-Spenden, Allianzbruch oder Training des Schema-4-Netzes nur aus diesem einen Replay.

**Validierung offen:** Regressionen auf dem lokalen Node-System und mindestens ein vollständiger Vergleichslauf 1.20.6 gegen 1.20.7 mit gleichen Seeds/Gegnerkontexten. Verbesserte Siegquote oder ein sicherer Multiplayer-Vorteil sind nicht behauptet.
