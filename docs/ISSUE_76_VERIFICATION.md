# Issue #76 – Umsetzung und Verifikationsgrenzen (22.09.2026)

Arbeitsbranch: `fix/issue-76-complete-12011`, PR [#79](https://github.com/SLP-DEV1/openfront-bot/pull/79), Basis: Solo/Run3 1.20.11. Ersetzt den älteren Teilfix PR #78.

## Implementierung

| Punkt | Änderung | Getesteter Ausschnitt |
|---|---|---|
| A SAM/City | Aktuelle Worker-SAM-Quote ist vor dem Kapazitätsfonds geschützt; eine legale, dringend nötige SAM-Option überstimmt die erzwungene City-Wahl. | `issue #76 cap-stalled SAM quote outranks City and discretionary fleet` |
| A Port/Silo | Bei 85–95% Kapazitätsdruck hat ein legaler erster Hafen Vorrang, sofern die Invasions-/SAM-Sicherheitsprüfung frei ist. Ab 95% gilt wieder City-Entlastung. Spekulative Silo-/Raketen-Fonds dürfen dringliche SAM-/Port-Bauten nicht dauerhaft blockieren. | `issue #76 first legal Port survives moderate cap pressure and silo savings`, alte Port-/Silo-Fälle |
| B Async Worker | Den gewählten Worker-Kandidaten nach der asynchronen Standortsuche neu abfragen; Preis, Tile-Eigentum, Upgrade-ID, Build-Legalität und Tick-Alter vor dem Intent prüfen. Aktueller Gold-Stand und erneute Invasionsprüfung bleiben verbindlich. | `issue #76 refreshes worker price before Build intent` |
| C Duo | Ablaufzeit und optionale Plan-ID beim Launch prüfen; Lock endet bei unbereitem Partner, sofern kein aktueller tatsächlicher Partnerangriff beobachtet wird. Die bisherigen unabhängigen Reserve-/Allianz-Checks bleiben bestehen. | `issue #76 expired or mismatched Duo strike cannot launch` und bestehende Duo-Fälle |
| D Front Memory | Fehlender Frontier-Scan hält alte Peak-Armeen nicht mehr bis 240 Ticks in der Reserve. Die Erinnerungswirkung läuft über 90 Ticks aus, aktuelle sichtbare Gegner bleiben ungekürzt. | `issue #76 vanished front does not hold historical maximum for 240 ticks` |
| E Schema 4 | Neural-Action-Ranking der asynchronen Economy benutzt eine frische eigene Armeeansicht statt einer potenziell initialen/stale Combat-Snapshot. Sicherheits- und Worker-Legalitätsregeln haben weiterhin Vorrang. | `1.19.8 schema4 supplies nonzero action ranking only for legal builds` |
| F Bundle | Run3 aus dem identischen Solo-Code und **unverändertem** `champion.json` erzeugt. V8-Syntaxprüfung beider Skripte erfolgreich. | Vollständiger nativer Generator-/Hash-Check **offen** |
| G BigInt | Eigene Goldwerte über den sicheren Integer-Bereich werden konservativ auf `Number.MAX_SAFE_INTEGER` gekappt. | `issue #76 BigInt gold above safe integer range is clamped` |
| H Marine | Gerader Routenkorridor ist eine dokumentierte Näherung, kein nachgewiesener Laufzeitfehler. Kein ungetesteter Ersatz durch vermeintliches Wasser-Pathfinding. | Nicht als Bugfix gewertet |

## Fachliche Regressionstriage

Die 16 Alt-Fälle wurden auf diesem Branch im emulierten V8-Testkatalog erneut ausgeführt:

- **Vier SAM-Fälle:** bestehen mit dem SAM-Fonds-/Priority-Fix, darunter Quote, fehlender Standort, Funds-Ablauf und Flotten-Sperre.
- **Vier Silo-/Nuke-Fälle:** frühere Fixtures starteten bei ca. 90% Truppenkapazität und erwarteten gleichzeitig spekulatives Sparen. Bei echtem Kapazitätsdruck ist City-Entlastung gewollt; die Spar-Fixtures wurden mit 70% Kapazitätsdruck isoliert. Die Erwartungen (1,15 Mio. für Silo / 26 Mio. für MIRV) wurden **nicht** abgesenkt. Separate Tests prüfen den City-Vorrang bei voller Armee.
- **Sechs Hafen-/Marine-Fälle:** bestehen im aktuellen Nachbau einschließlich erster legaler Hafen, Fonds/fehlender Bauplatz, Küstenwahl und Marine-Nachweis. Ein zusätzlicher Port-vs.-Cap-Fall wurde eingeführt.
- **Neural-Fall:** tatsächlicher veralteter Armee-Snapshot im Economy-Ranking korrigiert, nonzero-Assertion unverändert.
- **Duo-Follower-Fall:** tatsächlich nicht beendeter Lock nach `ready:false` ohne beobachteten Partnerangriff korrigiert, Assertion unverändert.

## Durchführung und Grenzen

Die JavaScript-Dateien und `tests/strategy-regression.cjs` wurden im V8-Isolat syntaktisch kompiliert. Ein isolierter JavaScript-Testlauf mit emulierten `fs`, `path`, `vm`, `assert`, `setImmediate` und dem echten Quelltext von `tools/match-report.cjs`, README und README-Archiv meldete **299 bestanden / 0 fehlgeschlagen**. Das ist **kein nativer Node-24-Lauf**, keine offizielle Engine und kein Multiplayer-Match.

GitHub Actions (Verify AggroBot, Impossible Engine Smoke, Impossible Paired Evaluation) meldeten bei PR #79 Fehlschläge; die Job-Log-Abfrage schlug mit `BlobNotFound` fehl. Der Grund ist **nicht verifiziert** und wird nicht als Produktfehler oder erfolgreiches CI ausgegeben.

### Noch offen vor Merge / Schließen von #76

1. `node --check OpenFront_Solo_AggroBot.user.js` und `node --check OpenFront_AggroBot_Impossible_Run3.user.js`.
2. `node tests/strategy-regression.cjs`, `node tools/p0-audit.cjs`, `node tests/duo-relay-regression.cjs`.
3. `node tools/build-run3-bundle.cjs --check` am selben Branch-SHA.
4. GitHub Actions mit lesbaren Job-Logs prüfen, unabhängigen Engine-/Duo-Zwei-Client-Lauf durchführen, Befunde dokumentieren.
5. Erst danach Issue #68/#76 bzw. Roadmap-Checkboxen als vollständig abgenommen markieren.

**Lokaler Windows-WIP:** nicht angefasst.
