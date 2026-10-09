# AggroBot live beobachten

Der lokale Monitor zeichnet nur Bot-Diagnosen auf. Er sendet keine
Spielbefehle und verändert keine OpenFront-Einstellungen. Der AggroBot bleibt
in Chrome mit Tampermonkey die einzige Spielsteuerung.

## Einrichtung vor dem nächsten Match

1. Das aktuelle `OpenFront_Solo_AggroBot.user.js` in Tampermonkey aktualisieren.
2. `OpenFront_AggroBot_Monitor.user.js` als zweites Tampermonkey-Skript
   installieren und aktivieren. Beide Skripte gelten für `openfront.io`.
3. Im Repository mit Node.js 24+ den Monitor über
   `node tools/live-monitor.cjs` starten. Der Dienst bindet nur
   an `127.0.0.1:8766` und zeigt einen einmaligen Token an.
4. Im Tampermonkey-Menü des Begleitskripts **AggroBot-Monitor-Token setzen**
   wählen und den Token eingeben. Den Token nicht in Git oder einen Chat kopieren.
5. Die OpenFront-Seite in Chrome neu laden und ein Match starten. Vor dem
   Start sicherstellen, dass das AggroBot-Panel sichtbar ist.

Der Monitor legt unter `benchmark-results/*-live-monitor/` eine
`events.jsonl` und `status.json` an. `status.json` enthält den letzten Tick,
die Zahl der Ereignisse und mögliche Sequenzlücken. Ein neuer Monitorprozess
ist für jedes neue Match vorgesehen. `game_over` ist das Signal für das
beobachtete Spielende; fehlt es, darf der Lauf nicht als vollständiges Match
bewertet werden.

Wenn der lokale Dienst nicht erreichbar ist, sammelt das Begleitskript nur
begrenzt Ereignisse und schreibt einen Fehler in die Browserkonsole. Der
AggroBot spielt weiter. Während einer Partie weder das Hauptskript noch das
Begleitskript aktualisieren oder die Seite neu laden, wenn der Verlauf
vollständig bleiben soll.

Der Dienst akzeptiert ausschließlich mit Token autorisierte Anfragen an
`127.0.0.1`. Die Ereignisse verbleiben lokal. Sie können Gegnernamen und
Spielzustände enthalten; `benchmark-results/` ist von Git ausgeschlossen.
