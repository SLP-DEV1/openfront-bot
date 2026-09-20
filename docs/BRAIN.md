# AggroBot 2.0 – optionaler lokaler Brain (Tampermonkey bleibt erhalten)

**Status:** erster nutzbarer Hybrid-Baustein, keine vollständige selbstlernende Multiplayer-/Self-Play-KI.
Das Haupt-Userscript bleibt auf `@grant none`, damit seine bestehende OpenFront-Spielanbindung nicht durch einen Wechsel der Tampermonkey-Sandbox kaputtgeht. Nur der Browser-Client sendet Spielbefehle; der Brain gibt **begrenzte Parameterempfehlungen** zurück.

## Start (Windows/Linux, Node.js 24)

Im Repository im Terminal:

```bash
node brain/server.cjs
```

Ausgabe: `http://127.0.0.1:8765` und ein automatisch generierter Token. Der Token bleibt in `brain/data/auth-token`; die Lern-Datenbank liegt in `brain/data/experiences.sqlite`. Beides ist von Git ignoriert. **Nicht im Chat/GitHub/Diagnose-Export veröffentlichen.** Node hat hier keine zusätzlichen npm-Abhängigkeiten; SQLite kommt aus `node:sqlite` (Node 24).

Im **aktualisierten Haupt-Userscript** in Tampermonkey:
1. Alte Bot-Versionen deaktivieren und OpenFront neu laden.
2. Den Token im Feld **Brain-Token** einfügen und das Eingabefeld verlassen (Einstellungen werden beim `change` gespeichert).
3. `Lernen`, `Vollautonom` und `🧠 Lokaler Brain` aktivieren.
4. Den Bot im Match **manuell** starten. Der Brain wird niemals automatisch beim Seitenladen aktiviert.

Nach der nächsten vollständigen Beobachtung zeigt das Panel `Verbunden` und die Anzahl der **Kontext-Erfahrungen**. Falls es `Offline` meldet, spielt die lokale Strategie weiter. Not-Aus bleibt `Alt+Shift+X`. Browser-Origin/Private-Network/CSP-Regeln können einen direkten `fetch` zu Loopback verhindern; dann steht im Panel ein Fehler. Dieser Pfad ist noch nicht in einem vollständigen Live-Browser-Match validiert. Bei deaktiviertem Brain werden **keine Brain-Netzwerkanfragen** ausgelöst. Der Localhost-Dienst sollte niemals auf `0.0.0.0`, im Internet oder über eine VPS-Weiterleitung erreichbar gemacht werden.

## Was gelernt wird

- Alle mindestens 240 Ticks ein begrenztes Aggregat: Spielphase, eigene Gebiets-/Truppenentwicklung, Truppenkapazität und sichtbare Bedrohung. Keine Gegnernamen oder Spiel-Accounts.
- Kontext: `EXPAND:SAFE`, `ASSAULT:THREAT` usw. Die Mittelwerte sind **Fortschritts-Proxys**, keine kausal identifizierten Kampfverluste.
- Ab drei Erfahrungen kann der Brain pro Kontext eine Empfehlung von maximal ±5 Aggressivität und ±4 Reservepunkten geben. Die Kombination mit dem Browser-Lernen wird ebenfalls **insgesamt** auf diesen Bereich relativ zur bisherigen Auto-Grundlinie begrenzt.
- Notfallverteidigung, Allianz-/Legalitätsprüfungen, Frontsperren und Benutzer-Slider haben weiterhin Vorrang; Brain führt keine Actions/Intents aus.
- Das Spielende wird nur mit bestätigtem `victory`, `defeat` oder ehrlichem `unknown/incomplete` gespeichert. Ein Ticklimit wird niemals als Sieg gezählt.

Das Repository enthält weiterhin zwei getrennte Speicher: das alte leichte Browser-Lernen in `localStorage` und die neue versionenunabhängige SQLite-Erfahrungssammlung des Brain. Das Löschen von Browserdaten löscht **nicht** die lokale SQLite-Datei.

## Offline-Training: echte Engine-Spiele

Die [Benchmark-Anleitung](BENCHMARKS.md) beschreibt den exakt festgelegten OpenFront-Commit und die Einrichtung. Sobald `../OpenFrontIO` korrekt ausgecheckt und die offiziellen Abhängigkeiten installiert sind:

```bash
node brain/train.cjs --engine ../OpenFrontIO --seeds train-101,train-102,train-103 --map World --difficulty Medium --ticks 18000
```

Der Trainer führt pro Seed einen isolierten Lauf von `tools/benchmark/engine-match.mjs` aus, zeichnet `brain_sample`-Ereignisse auf und importiert nur **vollständige Engine-Aufzeichnungen** in dieselbe SQLite-Datenbank. Die Engine-Spiele nutzen die normale autonome Grundlinie ohne Netzwerk; der Browser-Client bekommt die gesammelten Erfahrungen erst, sobald er sich später mit dem Brain verbindet. Es werden **keine öffentlichen Multiplayer-Matches** automatisiert.

Bereits vorhandene neue Benchmarks importieren:

```bash
node brain/import.cjs benchmark-results/mein-lauf
```

Mit Python 3 und ausschließlich Standardbibliothek kann man einen **nicht automatisch aktivierten** Kandidatenbericht mit match-getrennter Holdout-Auswertung erzeugen:

```bash
python brain/policy_train.py
```

Der Bericht wird unter `brain/data/policy-candidate.json` gespeichert. Er ist rein diagnostisch; aus Beobachtungsdaten allein darf keine verbesserte Gewinnrate abgeleitet werden.

## Grenzen / nächste Ausbaustufe

- Keine echte Multi-Agent-Self-Play-Liga und kein trainiertes neuronales Netz; dafür muss der Engine-Harness mehrere getrennte Clients/Policies pro Partie unterstützen.
- Keine automatische Übernahme eines Offline-Kandidaten. Wir benötigen mindestens paarweise Tests auf getrennten Karten/Seeds plus Browser-/Multiplayer-Läufe.
- Die aktuelle Datenbank ist lokal und single-process-orientiert. Mehrere parallele Trainer und Live-Server gegen dieselbe DB vermeiden.
- Wenn ein Browser `fetch` zu Loopback blockiert, bleiben Tampermonkey-Client und Offline-Trainer nutzbar, die Online-Verbindung dagegen nicht. Eine separate Tampermonkey-GM-Bridge wäre ein möglicher späterer Verbindungsweg.
