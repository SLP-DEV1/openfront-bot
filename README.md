# OpenFront Solo AggroBot

Autonomer **Singleplayer**-Bot als Tampermonkey-Userscript für [OpenFront](https://openfront.io/).

**Aktuelle installierbare Datei:** [`OpenFront_Solo_AggroBot.user.js`](./OpenFront_Solo_AggroBot.user.js), Version **1.9.1**. Die ältere Datei `OpenFront_Solo_AggroBot_1.9.0.js` bleibt als unveränderte historische Version erhalten.

## Installation

1. In Tampermonkey ein **neues Skript** erstellen und den gesamten Inhalt von `OpenFront_Solo_AggroBot.user.js` einfügen. In einem privaten GitHub-Repository darf man sich nicht darauf verlassen, dass Tampermonkey einen GitHub-Raw-Link ohne Anmeldung automatisch aktualisieren kann.
2. Alle älteren Solo-AggroBot-Skripte deaktivieren.
3. Wenn der Spawn Advisor 10.4.0 parallel läuft, dort **Auto-Spawn**, **Smart Attack** und **Auto-Accept Alliances** ausschalten.
4. OpenFront neu laden, eine Singleplayer-Partie starten und den Bot im Menü **manuell** einschalten.

**Not-Aus:** `Alt+Shift+X`. **Start/Pause:** `Alt+Shift+P`. Nach jedem Seitenladen bleibt der Bot aus. Multiplayer und Replays sind gesperrt.

## Strategie & Diagnose

Strategie-, Wirtschafts-, Marine-, Diplomatie-, Nuke- und SAM-Planung sind vorhanden. Der Bot kann Befehle senden; daraus folgt **keine garantierte Gewinnrate auf „Unmöglich“**. Ein vollständiger Live-Test ist noch nicht erfolgt. „Diagnose JSON“ im Bot-Menü zeichnet unter anderem Gebietsänderungen, Truppenlage, Bauaufträge und Allianzantworten auf. Bitte den Export vor dem Neuladen erstellen.

### Änderung 1.9.1

- Marine verwendet wieder die **vollständige Grenzbedrohung** bei der Reservenberechnung.
- Bei festgelegtem Hauptkriegsziel eröffnet die Marine auf „Unmöglich“ **keine zweite Front**.
- Einstellungen aus 1.9.0 werden einmalig übernommen; ein Bot startet nie selbsttätig.

## Entwickler-Checks

Mit Node.js (keine npm-Abhängigkeiten):

```bash
node --check OpenFront_Solo_AggroBot.user.js
node tests/strategy-regression.cjs
```

Die Regressionstests verwenden simulierte Spielobjekte und ersetzen **keine vollständige Partie** in einem echten Browser. Vor jeder neuen Version insbesondere Multiplayer-Sperre, Not-Aus, Event-Erkennung, Wirtschaft, Allianzen und Nukes erneut testen.

**Keine automatische GitHub-Raw-Update-URL:** Dieses Repository ist privat.