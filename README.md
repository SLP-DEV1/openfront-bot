# OpenFront Solo AggroBot

Autonomer **Singleplayer**-Bot als Tampermonkey-Userscript für [OpenFront](https://openfront.io/).

**Aktuelle installierbare Datei:** [`OpenFront_Solo_AggroBot.user.js`](./OpenFront_Solo_AggroBot.user.js), Version **1.9.2**. Die veraltete Datei `OpenFront_Solo_AggroBot_1.9.0.js` wurde aus `main` entfernt.

## Installation

1. In Tampermonkey ein **neues Skript** erstellen und den gesamten Inhalt von `OpenFront_Solo_AggroBot.user.js` einfügen. In einem privaten GitHub-Repository darf man sich nicht darauf verlassen, dass Tampermonkey einen GitHub-Raw-Link ohne Anmeldung automatisch aktualisieren kann.
2. Alle älteren Solo-AggroBot-Skripte deaktivieren.
3. Wenn der Spawn Advisor 10.4.0 parallel läuft, dort **Auto-Spawn**, **Smart Attack** und **Auto-Accept Alliances** ausschalten.
4. OpenFront neu laden, eine Singleplayer-Partie starten und den Bot im Menü **manuell** einschalten.

**Not-Aus:** `Alt+Shift+X`. **Start/Pause:** `Alt+Shift+P`. Nach jedem Seitenladen bleibt der Bot aus. Multiplayer und Replays sind gesperrt.

## Strategie & Diagnose

Strategie-, Wirtschafts-, Marine-, Diplomatie-, Nuke- und SAM-Planung sind vorhanden. Der Bot kann Befehle senden; daraus folgt **keine garantierte Gewinnrate auf „Unmöglich“**. Ein vollständiger Live-Test ist noch nicht erfolgt. „Diagnose JSON“ im Bot-Menü zeichnet unter anderem Gebietsänderungen, Truppenlage, Bauaufträge und Allianzantworten auf. Bitte den Export vor dem Neuladen erstellen.

### Änderung 1.9.2

- Priorisiert **erste Stadt und erste Fabrik** vor nicht dringenden Verteidigungsposten.
- Ab zwei Städten und zwei Fabriken spart die Wirtschaft im Late Game gezielt auf den **ersten Raketensilo (1,15 Mio. Gold)**; danach kann sie Gold für eine **Atombombe (1,1 Mio. Gold)** vorhalten. Eingehende Raketen und starke Angriffe haben Vorrang.
- Statt im Late Game bei voller Armee und stärkeren Grenznachbarn ausschließlich zu verteidigen, meldet der Bot **TECH** und finanziert die nächste Angriffstechnologie.
- Nach längerer erfolgloser Inaktivität wird ein blockiertes Hauptkriegsziel neu bewertet.
- Diagnoseexport enthält jetzt auch den **Spielmodus** und das **wirtschaftliche Sparziel**.
- Einstellungen aus 1.9.1 werden übernommen; der Bot startet nach Seitenwechsel weiterhin **ausgeschaltet**.

### Änderung 1.9.1

- Marine verwendet die **vollständige Grenzbedrohung** bei der Reservenberechnung und respektiert das Hauptkriegsziel.

## Entwickler-Checks

Mit Node.js (keine npm-Abhängigkeiten):

```bash
node --check OpenFront_Solo_AggroBot.user.js
node tests/strategy-regression.cjs
```

Die Regressionstests verwenden simulierte Spielobjekte und ersetzen **keine vollständige Partie** in einem echten Browser. Vor jeder neuen Version insbesondere Multiplayer-Sperre, Not-Aus, Event-Erkennung, Wirtschaft, Allianzen und Nukes erneut testen.

**Keine automatische GitHub-Raw-Update-URL:** Dieses Repository ist privat.