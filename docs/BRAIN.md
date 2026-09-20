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

## Optional: Qwen3.8 über dein bestehendes llama.cpp (Shadow-Modus)

Wenn dein `llama-server.exe` mit `--host 127.0.0.1 --port 8080 --alias qwen38-27b-gsq-mtp --api-key local` bereits läuft, **ändere dessen Startbefehl nicht**. Der Brain spricht ausschließlich lokal mit `http://127.0.0.1:8080/v1/chat/completions` und sendet `Authorization: Bearer local`. Das Modell darf weder den Browser steuern noch Spiel-Intents verschicken.

In einem **zweiten PowerShell-Fenster** im AggroBot-Repository:

```powershell
cd C:\\Users\\SPK\\Desktop\\openfront
$env:AGGROBOT_QWEN_ENABLED = "1"
$env:AGGROBOT_QWEN_API_KEY = "local"
node brain/server.cjs
```

Der Browser braucht **keinen** llama.cpp-API-Key und keine Änderung seines bisherigen Brain-Tokens. Nach Änderung der Umgebungsvariablen den Brain-Prozess neu starten. Ohne `AGGROBOT_QWEN_ENABLED=1` ist die Qwen-Verbindung **AUS**. Die bestehende Brain-Verbindung in Tampermonkey bleibt wie bisher.

**Auslösung:** Qwen analysiert jetzt vier Fälle: (1) **akute Bedrohung** ab mindestens 1.000 eingehenden Truppen und mindestens 35 % der Heimtruppen, auch wenn die eigene Truppenfüllung bereits niedrig ist; (2) **Stagnation** nach drei Beobachtungsintervallen mit jeweils höchstens 0,5 % Gebietsgewinn bei mindestens 40 % Truppenfüllung; (3) **regelmäßige Lageanalyse** erstmals nach mindestens 2.400 Ticks, danach frühestens 2.400 Ticks nach einem automatischen Analyseversuch; (4) **Spielende**, sofern der Browser es an den Brain meldet. Bedrohung hat vor Stagnation und regelmäßiger Analyse Vorrang. Diese 2.400 Ticks sind Spiel-Ticks, keine Sekunden. Mehrere Qwen-Anfragen werden nicht parallel ausgeführt; läuft bereits eine Anfrage, werden normale Zusatzanfragen übersprungen und eine Spielende-Analyse vorgemerkt. Qwen blockiert weder `/v1/observe` noch die OpenFront-Steuerung. Ein Modellaufruf wird nach 30 Sekunden abgebrochen.

Der Brain schickt ausschließlich numerische aggregierte Lage- und Verlaufsschnappschüsse sowie den Ergebnisstatus an dein lokal betriebenes Qwen. Die Modellantwort wird auf bekannte Strategien/Grundkategorien und einen kurzen deutschen Erklärungstext validiert und **nur als Beratung in `qwen_advice` in SQLite** gespeichert. Qwen verändert weder Aggressivität noch Reserve, wird nicht als Trainer-Erfolg verbucht und ist **kein autonom übernommener Policy-Kandidat**. Bei Unsicherheit darf das Modell auch `HOLD` vorschlagen. Tatsächliche Strategieänderungen erfordern gesonderte Engine-Vergleichstests.

Die Auswertung ist nach Authentifizierung direkt am Brain verfügbar:

```powershell
$token = (Get-Content .\\brain\\data\\auth-token -Raw).Trim()
Invoke-RestMethod http://127.0.0.1:8765/v1/qwen -Headers @{"X-Aggrobot-Token"=$token} | ConvertTo-Json -Depth 6
```

### Qwen-Verbindung jetzt manuell testen

Der folgende Test benötigt **keine laufende Partie**. Er sendet einen synthetischen numerischen Lage-Snapshot (keine echten Spielinformationen) und prüft so erstmals die reale Verbindung zu deinem llama.cpp. Nach `git pull` den bisherigen Brain-Prozess mit **Strg+C** beenden und mit `AGGROBOT_QWEN_ENABLED=1` neu starten. Den llama-server weiter laufen lassen.

```powershell
cd C:\Users\SPK\Desktop\openfront
$token = (Get-Content .\brain\data\auth-token -Raw).Trim()
Invoke-RestMethod -Method Post http://127.0.0.1:8765/v1/qwen/test -Headers @{"X-Aggrobot-Token"=$token}
```

Ein HTTP **202 / `accepted: true`** bedeutet ausschließlich: Der Test wurde gestartet, **nicht** dass das Modell erfolgreich geantwortet hat. Danach bis zu 30 Sekunden warten und den Status abrufen:

```powershell
Invoke-RestMethod http://127.0.0.1:8765/v1/qwen -Headers @{"X-Aggrobot-Token"=$token} | ConvertTo-Json -Depth 6
```

`requests > 0` belegt, dass der Brain einen Modellaufruf begonnen hat; `recent` mit `kind: manual` belegt eine gültige, gespeicherte Qwen-Antwort. Bei `lastError` den Wortlaut prüfen. HTTP **409** bedeutet: Qwen ist deaktiviert/beschäftigt oder der vorherige manuelle Test liegt weniger als 60 Sekunden zurück. Der manuelle Test ändert **keine** Bot-Strategie, keine Trainingswerte und löst keinen OpenFront-Befehl aus. Token weder posten noch in Screenshots zeigen.

Falls du `AGGROBOT_TOKEN` statt der automatisch generierten Token-Datei nutzt, verwende diesen Wert. `/health` enthält **keinen** Qwen-Status. `/v1/qwen` zeigt `enabled`, `busy`, `lastError` und die letzten gespeicherten Beratungen. Lass beide localhost-Dienste lokal; keinen davon ins Internet oder zum VPS freigeben.

**Deine llama.cpp-Konfiguration:** `--parallel 1` teilt den Inferenz-Slot ggf. mit Qwen Code. `--reasoning-effort xhigh --reasoning-budget -1` kann für gelegentliche Strategieberatung zu langsam sein; der Brain fordert pro Anfrage `reasoning_effort: low` sowie höchstens 768 Ausgabe-Tokens an. Ob der verwendete llama.cpp-Build das Request-Override honoriert, muss am laufenden Server geprüft werden. Bei Timeout oder leerem/nicht-JSON-`content` steht eine Diagnose in `/v1/qwen`; kein fehlgeschlagener Qwen-Call führt zu einem Game-Intent. Die LLM-Anbindung ist mit einem Stub getestet, aber **noch nicht live gegen deinen llama-server** verifiziert.

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
