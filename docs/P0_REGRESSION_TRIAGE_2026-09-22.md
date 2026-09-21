# P0 – Regressionstriage, 22.09.2026 (Arbeitsstand 1.20.9)

**Quelle:** `tests/strategy-regression.cjs` vom aktuellen GitHub-Hauptskript 1.20.9. Dies ist ein **in-memory JavaScript-Testlauf mit nachgebildeten Node-`fs`/`vm`/`assert`-Schnittstellen**, **kein** nativ ausgeführter Node-Test und kein CI-Nachweis. Ergebnis dieser Näherung: **271 grün, 19 rot**. Die früher gemeldeten **265/17** stammen von einem **anderen** Commit (1.20.8) und werden nicht vermischt.

## Drei explizite Testumgebungs-Artefakte

- [ ] `v1.9.6 proactive diplomacy sends offer while expanding`: `setImmediate` war im Nachbau der Node-Laufzeit nicht verfügbar. Mit echtem Node erneut prüfen.
- [ ] `issue #9 current README installs maintained script, legacy notes archived`: `readFileSync` des In-Memory-Nachbaus lieferte für README fälschlich den Userscript-Quelltext. Mit echtem Dateisystem erneut prüfen.
- [ ] `issue #12: match report refuses unverifiable same-seed comparison`: der Nachbau hatte `../tools/match-report.cjs` nicht geladen. Mit echtem Node erneut prüfen.

Diese drei **nicht** als Produktfehler werten.

## 16 aus diesem Lauf offene Fälle – *noch keine Produktfehler-Klassifikation*

Jede Zeile erst nach **nativem Node-Lauf** mit konkreten `GameView`-/`Worker`-Annahmen einer Klasse zuordnen: Produktfehler / überholte Erwartung / fehlerhafte Fixture / Test- oder Engine-Versionsabweichung.

### SAM und Ausgabenreserve (4)

- [ ] `audit ship cannot consume quoted SAM protection fund`
- [ ] `1.19.1 SAM denied by budget still funds actual worker price and builds once funded`
- [ ] `1.19.1 affordable but unavailable SAM does not freeze economy indefinitely`
- [ ] `v1.18.1 real SAM quote funds protection and expires when stale`

**Prüffrage:** Unterdrückt die neue City-Kapazitätsregel eine **tatsächlich dringende**, legal und bezahlbar bestätigte SAM-Maßnahme, oder setzt die alte Test-Fixture eine im Spiel nicht bestehende Gefahr voraus?

### Silo-/Raketen-Fonds (4)

- [ ] `late game accumulates funds without treating saving as failed construction`
- [ ] `first silo is funded and built at threshold`
- [ ] `issue #5 potential neighbor does not cancel Silo fund`
- [ ] `v1.10.0 MIRV-only game saves a MIRV-sized fund`

**Prüffrage:** Darf `capStalled` vorübergehend *spekulative* Silo-Fonds verdrängen, ohne eine im Worker bereits legalisierte und zeitkritische Maßnahme zu blockieren? Gewinnt City/Upgrade bei echtem Kapazitätsengpass, ohne Endlosschleife?

### Hafen-/Handels-/Marine-Start (6)

- [ ] `v1.10.5 first Port beats upgrades after basic City/Factory`
- [ ] `v1.10.5 first Port not indefinitely blocked by silo savings`
- [ ] `v1.10.5 missing Port worker site does not block silo forever`
- [ ] `v1.10.5 own Port is confirmed from actual unit view`
- [ ] `v1.17.2 first harbor chooses a safe coast rather than exposed frontline`
- [ ] `v1.18.2 first Port gets provisional funds before worker offers a price`

**Prüffrage:** Sind die erwarteten Küstenstandorte und Worker-Aktionen echt erreichbar, und wird die erste Handels-/Marinefähigkeit bei einem Kapazitätslimit nur korrekt zurückgestellt, statt dauerhaft blockiert?

### Weitere Entscheidungsregressionen (2)

- [ ] `1.19.8 schema4 supplies nonzero action ranking only for legal builds`: legale Kandidaten, Bias und tatsächliche Wahl separat protokollieren; `nonzero` ist kein belegter wirtschaftlicher Nutzen.
- [ ] `1.20.1 follower uses ready partners scheduled tick`: gegen aktuelle Rendezvous-/Invasions-Abbruchregel prüfen; keine assertion-only Anpassung.

**Zählkontrolle:** 4 SAM + 4 Fonds + 6 Hafen + 2 weitere = **16** fachlich noch offene Fälle, plus die drei Laufzeit-Artefakte = 19 beobachtete rote Tests in der Näherung.

## Nicht überspringen

- [ ] Den vollständigen nativen CI-/Node-Lauf **auf demselben SHA** dokumentieren.
- [ ] Engine-Referenz `7c27263390d8f1976566e5c5ad9adf6fcad311b6` für City-/Factory-Kapazität mit einem isolierten realen Szenario verifizieren.
- [ ] Jede fachlich geänderte Regel mit dem vorherigen und neuen Verhalten + abgeleiteten Erwartungen begründen; nur dann Assertions anpassen.
- [ ] Bundle-Generator (`tools/build-run3-bundle.cjs --check`) und SHA-256-Ausgabe in CI überprüfen.
- [ ] P0-Issue #68 und `COMPETITIVE_ROADMAP.md` erst nach reproduzierbarem Nachweis abhaken.

**Wichtig:** Änderungen am lokalen Windows-WIP wurden für diese Triageliste nicht übernommen und nicht verworfen.
