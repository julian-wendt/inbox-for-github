# Manuelle Tests

Checkliste für den Handtest der App. Was sich ohne Fenster prüfen lässt (Einordnung, Status,
Zuweisen, Wiedervorlage, Aktualisierung, Verlauf), deckt `src/github/simulate/` automatisch ab, siehe
[`docs/testing.md`](docs/testing.md); hier bleibt, was Fenster, Tasten und das echte GitHub braucht. Kommentieren und Schließen nur in einem Test-Issue oder
Test-PR, z. B. im Repo `inbox-for-github`.

## Installation und Start

- [ ] Alte App ersetzen: neue `.app` nach `/Programme` ziehen. Icon in Dock und ⌘⇥ ist das
      violette mit Haken (sonst ab- und wieder anmelden, dann aktualisiert macOS den Icon-Cache).
- [ ] App startet, Liste und Avatar sind sofort da (aus dem Cache).
- [ ] Erster Start nach dem Wechsel der Bundle-ID: Status, Notizen, Einstellungen und
      Fensterposition sind wie vorher, kein Willkommensdialog. In
      `~/Library/Application Support/inbox-for-github/` liegt `tracker.db`, der alte Ordner
      `io.github.julian-wendt.github-task-tracker` ist unverändert. „Logdatei zeigen“ öffnet
      `~/Library/Logs/inbox-for-github/` mit den alten Einträgen. macOS fragt einmal neu nach
      Mitteilungen; eingeklappte Leisten und Sortierungen stehen wieder auf Standard.

## Sidebar

- [ ] Eine Liste ohne Überschrift und ohne Trennlinie: Inbox, Geplant, Mir zugewiesen,
      Von mir erstellt, Erledigt (Tasten 1–5); der Tooltip nennt die Taste.
      „Beobachtet“ und „Alle“ gibt es nicht mehr.
- [ ] ⌘K findet nur Items, die in einer Ansicht stehen; ein Sprung landet in deren Ansicht, ein
      eigener zugewiesener PR in „Von mir erstellt“.
- [ ] Footer zeigt Verbrauchsring, Einstellungen, Fragezeichen; der Radiergummi sitzt in der Überschrift „Nach Repository filtern“.
- [ ] Der Radiergummi erscheint nur, wenn ein Repo gewählt ist; Klick setzt es zurück. ⌘K → „Filter
      zurücksetzen“ setzt alle Filter zurück (Repos, Issues/Pull Requests, Sonstige/Reviews, Sprint).
- [ ] Esc schließt von innen nach außen: Menü, Pop-up, Markierung, dann die Auswahl (Detail zeigt
      „Nichts ausgewählt“). Filter und Ansicht bleiben, auch mehrfach gedrückt. ↑/↓ danach macht
      beim zuletzt gewählten Item weiter.
- [ ] Die Zahlen an den Ansichten folgen dem Repo-Filter und passen dann zur Liste; Issues/Pull Requests,
      Sonstige/Reviews und Sprint ändern sie nicht. Der Kopf der Liste zeigt keine Zahl neben dem Titel.
- [ ] ⌘T schaltet den Filter im Kopf weiter: in Inbox und Erledigt Alle → Reviews → Sonstige, sonst
      Alle → Issues → Pull Requests, danach wieder Alle. ⌘G wechselt in „Mir zugewiesen“ zwischen
      Typ und Status, in den Listen die Zeitgruppen an und aus (auch in den Einstellungen sichtbar);
      in „Von mir erstellt“ tut ⌘G nichts. T und G allein schalten nichts mehr um. `/` öffnet die Palette nicht mehr, ⌘K schon.
- [ ] Fragezeichen öffnet die Hilfe.
- [ ] ⌘R: Icon dreht sich mit kleinem Quadrat. Klick darauf stoppt, die Liste bleibt, unten
      steht wieder „Zuletzt aktualisiert …“.
- [ ] ⌃R mit ausgewähltem Item: nur dieses Item lädt neu (1 Punkt, mit Boards 2), der Button im Detail-Kopf dreht sich, die Liste bleibt stehen.
- [ ] Rechtsklick auf eine Ansicht: Inbox und „Mir zugewiesen“ bieten „Alle als gelesen markieren“
      (danach „… als ungelesen“; ⌘Z holt es zurück) und „Items dieses Views aktualisieren“, die
      anderen Ansichten nur das Aktualisieren. Das Aktualisieren lädt alle Items der Ansicht
      gebündelt (19 Punkte je 50 Items statt 1 je Item); Hinweis „N Items werden aktualisiert …“,
      danach „N Items aktualisiert“. Eine leere Ansicht zeigt kein Menü. Ein Rechtsklick
      außerhalb von Textfeldern zeigt in der gebauten App kein „Reload“.
- [ ] Einstellungen → Darstellung → Seitenleiste → „Aktualisieren folgt dem Repository-Filter“
      (an): mit gewähltem Repo lädt das Aktualisieren der Ansicht nur dessen Items (Hinweis nennt
      deren Zahl); aus: die ganze Ansicht.

## API-Verbrauch

- [ ] Nach der ersten Aktualisierung zeigt der Ring Farbe und Füllstand; Tooltip mit
      Restpunkten, Reset-Uhrzeit und Kosten der letzten Aktualisierung.
- [ ] Klick auf den Ring öffnet die Einstellungen; unter Allgemein derselbe Stand als Balken.
- [ ] Erster Abruf nach dem Start ist vollständig und teurer; die nächsten (⌘R oder automatisch)
      sind Deltas, etwa 30 Punkte. Zahlen notieren.
- [ ] Nach etwa einer Stunde kommt wieder ein vollständiger Abruf.
- [ ] Ein auf GitHub geändertes Item (z. B. neuer Kommentar) taucht nach dem nächsten Delta auf.

## Boards

- [ ] Einstellungen → Boards → „Boards laden“ aus: Status und Sprint verschwinden aus der
      Detailansicht, ein vollständiger Abruf wird günstiger.
- [ ] Wieder ein: Status und Sprint kommen zurück (beim vollständigen Abruf für alle Items).

## Offline

- [ ] WLAN aus, App neu starten: Liste und eigener Avatar da, unten „Offline · Stand …“ mit
      gelbem Punkt.
- [ ] WLAN an, ⌘R: aktuell, fehlende Avatare laden nach.

## Kommentieren (Test-Issue)

- [ ] Formatierungsleiste durchprobieren, ⌘B, ⌘I, ⌘E, ⌘K im Feld, Reiter Vorschau.
- [ ] Aktiver Reiter (Schreiben wie Vorschau) hat oben keine doppelte Linie.
- [ ] Mit ⌘↵ senden: Kommentar erscheint sofort im Verlauf; nur dieses Item wird neu geladen (1 Punkt, mit Boards 2) und richtig einsortiert, z. B. beantwortete Erwähnung unter Erledigt.
- [ ] Senden ohne WLAN: Text bleibt, darunter „Nicht gesendet: …“.
- [ ] Entwurf bleibt beim Wechsel zwischen Items erhalten.

## Schließen und Wiedereröffnen (Test-Issue, Test-PR)

- [ ] „Issue schließen“ und über den Pfeil „Als nicht geplant schließen“; auf GitHub den Grund
      prüfen.
- [ ] Mit Text im Feld heißt der Button „Mit Kommentar schließen“.
- [ ] Wieder öffnen.
- [ ] PR schließen und wieder öffnen; gemergte PRs haben keinen Button.
- [ ] Menü öffnet nach unten, bei zu wenig Platz nach oben.

## Feste Kommentarleiste

- [ ] Darstellung → „Kommentarbox immer sichtbar“: Box bleibt unten, Verlauf scrollt darüber.
- [ ] Oberen Rand ziehen ändert die Höhe, Doppelklick setzt zurück, Höhe bleibt nach Neustart.

## Status und Protokoll

- [ ] Die Status tragen Icons statt farbiger Ringe: Offen ein grauer Ring, Wiedervorlage eine gelbe
      Uhr, Erledigt ein grüner Haken; so im Detail-Umschalter, im Kontextmenü, in ⌘K und im Protokoll,
      in Hell und Dunkel gut erkennbar.
- [ ] Item mit F auf Wiedervorlage legen, mit D erledigen, mit O wieder öffnen: jedes Mal eine Zeile in den Aktivitäten, sobald dazwischen etwas passiert ist (ein Beitrag, ein Review, ein Ereignis); ein Status, der gleich ersetzt wird, gilt als Korrektur und fehlt dort.
- [ ] D auf einem erledigten Item ändert nichts; F auf einem in Wiedervorlage öffnet die Zeiten,
      eine neue Zeit verschiebt das Datum. Zurück auf Offen geht nur mit O (oder über das Menü).
- [ ] ⌃O öffnet das Item auf GitHub (auch Kontextmenü, ⌘K, Button im Detail); O allein öffnet
      nichts im Browser. Im Kommentarfeld tut ⌃O nichts an der App.
- [ ] ⌘Z nimmt die letzte Änderung exakt zurück und sagt, welche („Rückgängig: #5 → Erledigt“),
      und mit jedem weiteren ⌘Z geht es die Kette weiter zurück, bis zu fünfzig Änderungen; danach
      steht dort „Nichts zum Rückgängigmachen“. ⌘Y macht Zurückgenommenes in der alten Reihenfolge
      wieder (Toast „Wiederholt: …“); eine neue Änderung beendet das Wiederholen („Nichts zum
      Wiederholen“). Das gilt für D, O, F samt Datum, X, U oder R (auch mehrere), P, ⌃A und ⌃U (zuweisen wie entfernen, schreibt auf GitHub jeweils das Gegenteil, beim Wiederholen wieder das Original),
      Schließen und Wiedereröffnen und das Ausblenden eines Items; nur ein gesendeter Kommentar
      bleibt, wie er ist. Ein zurückgeholtes Item ist wieder ausgewählt. Im Kommentar- oder Notizfeld
      gilt ⌘Z für den Text; ⌘Y löst dort nichts aus.
- [ ] ⌘K → „Änderungsverlauf“ listet die Kette: oben „Rückgängig: …“ mit dem Neuesten (⌘Z), darunter
      die älteren, dann „Wiederholen: …“ (⌘Y). Ein Eintrag wählen nimmt alle Änderungen bis
      einschließlich dieser zurück (Toast „N Änderungen“) oder macht sie wieder.
- [ ] ⌘Z macht die letzte Änderung rückgängig, ohne Protokollzeile. Im Kommentar- oder Notizfeld
      nimmt ⌘Z dagegen das Getippte zurück, nicht den Status.
- [ ] Nach D per Taste, „Erledigt“ im Kontextmenü, in ⌘K und per Klick im Detail steht in
      `status_log.source` der Reihe nach `key:d`, `menu`, `palette`, `click` (Abfrage in
      `docs/reference/local-development.md`).
- [ ] Einstellungen › Allgemein › „Alle Status zurücksetzen…“ fragt mit der Anzahl nach; danach
      steht jedes Item, wo es ohne Status hingehört, Notizen bleiben, und
      `status_log` hat je Item eine Zeile `open` mit `settings:reset`. Ohne Status ist der Knopf aus.

## Reviews im Verlauf

- [ ] Ein PR mit Inline-Kommentaren zeigt keinen davon als Beitrag, sondern eine Zeile pro Review,
      z. B. „Lukas hat Änderungen angefordert · 3 Inline-Kommentare (1 von 3 erledigt)“; ein Klick
      öffnet GitHub am Review. Ein Inline-Kommentar, der dich erwähnt, steht weiter als Beitrag.
- [ ] Alle Threads aufgelöst, später freigegeben oder verworfen: Doppelhaken und Grund in Klammern.
      Antworten in bestehenden Threads stehen als „Max hat in 2 Threads geantwortet“, verlinkt auf
      die erste Antwort. Ein Review mit Text bleibt Beitrag, Anzahl und Stand im Kopf, klickbar.
- [ ] Entwurf/bereit, gemergt (ohne zusätzliches „geschlossen“), geschlossen mit Grund, wieder
      geöffnet, Force-Push (mehrere hintereinander als eine Zeile), Auto-Merge, verworfenes Review,
      zurückgenommene Review-Anfrage; bei Issues verknüpfter PR und Duplikat. Jede Zeile öffnet per
      Klick GitHub am Ereignis oder, ohne eigenen Link, am Item. Labels und Projekte erscheinen nicht.
- [ ] Einen fremden PR reviewen, dann committet oder force-pusht der Autor: der PR steht wieder in
      der Inbox mit „Neue Commits von …“, auch unter dem Filter Reviews, und geht nach einem neuen Review
      oder Kommentar wieder raus. Eigene Commits holen ihn nicht zurück; mit Einstellungen › Regeln ›
      „Neue Commits holen Reviews zurück“ aus bleibt er unter Erledigt.

## Protokoll

- [ ] Einstellungen › Allgemein › Protokollierung auf Debug, Aktualisieren (⌘R), ein Item mit D
      erledigen: „Logdatei zeigen“ öffnet den Ordner, `inbox.log` hat Zeilen `refresh` und
      `status change … source=key:d view=… popup=…`. Aus schreibt nichts mehr.
- [ ] Ausführlich ergänzt `graphql`-Zeilen mit `x-ratelimit`-Werten und `classify`-Zeilen; in keiner
      Zeile stehen Token oder Kommentartexte (einen Kommentar senden und danach in der Datei suchen).

## Mitteilungen

- [ ] Einstellungen › Mitteilungen zeigt eine Karte: Hauptschalter, „Melden bei“ mit einem Schalter
      je Grund (Erwähnungen, Review-Anfragen, Deine Selbst-Erwähnungen, Neues zu Items, bei denen dein Teil erledigt ist), „Auch wenn die App im Vordergrund ist“; darunter das Dock-Badge. Hauptschalter aus:
      der Rest der Karte bleibt sichtbar, gedämpft und gesperrt. Ein Grund aus, und für ihn kommt
      keine Mitteilung mehr, das Item steht trotzdem in der Inbox.
- [ ] Mit dem Fenster im Vordergrund kommt keine Mitteilung; Fenster im Hintergrund oder
      geschlossen, dann schon. Mit „Auch wenn die App im Vordergrund ist“ kommt sie immer.
- [ ] In der gebauten App: Klick auf eine Mitteilung holt das Fenster nach vorn (auch geschlossen)
      und zeigt ihr Item in seiner Ansicht, Filter zurückgesetzt; „N weitere“ öffnet die Inbox.
      Ebenso der Button „Öffnen“, den jede Mitteilung beim Darüberfahren zeigt.
- [ ] Einstellungen › Mitteilungen › „Wann Benachrichtigungen kommen“: Sofort (Standard), In der
      Arbeitszeit und Nur Zusammenfassungen. Bei den beiden letzten erscheinen die Wochentage; bei
      „In der Arbeitszeit“ Zeiträume Von–Bis (Standard 09–12 und 13–18, also eine Mittagspause),
      bei „Nur Zusammenfassungen“ Uhrzeiten (je mindestens einer, höchstens sechs). „Zeitraum
      hinzufügen“ und „Uhrzeit hinzufügen“ hängen etwas Freies an; eine Zeit lässt sich eintippen,
      ohne dass das Feld verschwindet oder springt. Hauptschalter aus: gedämpft und gesperrt.
- [ ] „In der Arbeitszeit“: in einem Zeitraum meldet sich ein neues Item einzeln. In der Pause
      zwischen zwei Zeiträumen (oder davor und danach) nicht; wenn der nächste Zeitraum beginnt
      (höchstens 30 s Verzug), kommt eine Mitteilung „N neu: Erwähnungen 2, …“ mit den Titeln der
      ersten zwei Items, Klick öffnet die Inbox. Enden und beginnen zwei Zeiträume am selben
      Zeitpunkt (z. B. 09–12 und 12–18), kommt dort keine Zusammenfassung.
- [ ] „Nur Zusammenfassungen“ mit einer Uhrzeit in zwei Minuten: bis dahin keine Einzel-Mitteilung,
      dann genau eine Zusammenfassung „N neu: Erwähnungen 2, …“ mit den Titeln der ersten zwei
      Items (höchstens 30 s Verzug), Klick öffnet die Inbox; ohne neue Items danach keine weitere.
      Ein Item, das bis dahin erledigt oder auf Wiedervorlage gelegt wurde, steht nicht darin. Die App vor
      der Uhrzeit neu starten: das Gesammelte bleibt erhalten.
- [ ] Zurück auf „Sofort“ mit Gesammeltem: die Zusammenfassung kommt sofort. Beim ersten Einschalten
      einer Zeitplanung kommt nichts nach, was vorher da war.

## Tasten unter der Maus

- [ ] Maus über einer Zeile (nicht der ausgewählten), D drücken: diese Zeile wird erledigt, die
      Auswahl und die offene Detailansicht bleiben. Ebenso F, X, O, U, R, P, C, ⌃A, ⌃U, ⌃O, ⌃R.
- [ ] Nach ↑/↓ wirken die Tasten wieder auf die Auswahl, bis die Maus sich bewegt. Mit offenem
      Pop-up wirken sie aufs Pop-up. Einstellungen › Darstellung › Listen: ausgeschaltet nur Auswahl.

## Gelesen und ungelesen

- [ ] Ungelesene Inbox-Zeilen haben links einen blauen Punkt und einen deutlich fetteren Titel; in
      den Tabellen zeigt den Punkt auch ein mit U markiertes Item.

- [ ] Ungeöffnete Items in Inbox und Zugewiesen stehen fett; nach 2,5 s geöffnet werden sie normal,
      das Badge am Dock sinkt um eins. Das Badge zählt nur, was wieder oder noch zu tun ist: ungelesene Inbox-Items und ungelesene Zuweisungen (ohne die Leisten Später und Fertig); ein mit U markiertes Item in Wiedervorlage oder Erledigt zählt nicht. Ein neuer Beitrag eines anderen macht sie wieder fett.
      Die Zeit zählt nur bei vorderem Fenster: zu einer anderen App wechseln stoppt sie und
      beginnt beim Zurückkommen von vorn; schnelles Durchblättern mit ↑/↓ liest nichts.
- [ ] Ansicht in der Seitenleiste samt Zahl ist fett, solange sie Ungelesenes hat; Geplant,
      Erledigt und Von mir erstellt nie.
- [ ] U oder R auf einem gelesenen Item macht es ungelesen (fett, Badge +1), auch direkt nach dem Öffnen;
      U erneut oder späteres Öffnen macht es gelesen. Mit markierten Items gilt U für alle. Auch im
      Kontextmenü (dort mit der Taste R) und in ⌘K („Als ungelesen/gelesen markieren“).

## Inbox

- [ ] Weit nach unten scrollen, mit einem Item weiter oben ausgewählt: die Liste springt nicht von
      selbst zurück, auch nicht nach einem Refresh (⌘R) oder wenn die Mitteilungen laufen. Erst
      eine neue Auswahl (Pfeiltasten, Klick) scrollt zu ihr. Gilt ebenso für Mir zugewiesen
      und Von mir erstellt, und für ausgewählte Gruppenleisten.
- [ ] Umschalter „Alle · Reviews · Sonstige“ statt Issues/Pull Requests, mit Anzahl neben Reviews und Sonstige („Sonstige“ ist alles, was keine Review-Anfrage ist, also auch wieder Geöffnetes und Updates). Ein PR mit Review-Anfrage und offener Erwähnung steht unter beiden.
- [ ] Erledigt hat denselben Umschalter: Reviews sind PRs mit deiner
      Review-Anfrage, Erwähnungen Items, in denen du erwähnt wurdest; Zuweisungen nur unter „Alle“.
- [ ] Eine neue Zuweisung erscheint nicht in der Inbox, sondern direkt in „Mir zugewiesen“; erst
      eine Erwähnung darin holt sie zusätzlich in die Inbox, bis du antwortest.
- [ ] Kontextmenü, ⌘K und Hilfe bieten „Annehmen“ nicht mehr an.
- [ ] Listenspalte schmal ziehen: unter etwa 460 px steht statt des Umschalters ein Filter-Menü
      mit der aktuellen Wahl („Alle“, „Reviews · 3“ …) und statt Sortierknopf, Ein-/Ausklappen und
      Liste/Tabelle ein Zahnrad-Menü mit genau diesen Einträgen (Sortierung als Häkchen); unter 340 px
      zeigt das Filter-Menü nur sein Icon. Titel und Glühbirne bleiben immer, die Controls stehen
      in jeder Breite rechtsbündig; breiter gezogen kommt alles zurück. Gilt in Inbox, Geplant (Liste) und Erledigt.
- [ ] T und P wirken auch hier und in Von mir erstellt: ein angeheftetes Item zeigt in der
      Kontextzeile einen gelben Stern, ein geplantes den Tag mit Kalender-Icon („Morgen“, „Do“);
      es bleibt in seiner Liste. Von mir erstellt zeigt den Stern beim Überfahren der Zeile.
- [ ] Einen Commit in einen eigenen PR pushen: das Item bleibt in Inbox, Beobachtet und Von mir
      erstellt an seiner Stelle und zeigt weiter die Zeit der letzten Aktivität anderer. Mit
      Einstellungen › Inbox-Regeln › „Commits“ an rückt es nach oben.

## Von mir erstellt

- [ ] Tabelle wie „Mir zugewiesen“, ohne Heute, Sterne und Gruppierungsumschalter. Leisten: Nicht zugewiesen, Zugewiesen, Später (mit Wiedervorlage).
- [ ] „Nicht zugewiesen“: Issues ohne Zuständige und fertige PRs ohne Reviewer; ein Draft-PR
      steht unter „Zugewiesen“.
- [ ] Rechts in der Zeile nur das Alter („3W“), Tooltip „Eröffnet am …“; kein Avatar. Sortiert nach
      Eröffnung, der Sortierknopf dreht das.
- [ ] Eigene Items mit offener Erwähnung stehen hier und zusätzlich in der Inbox; geschlossene und gemergte verschwinden. D erledigt dort nichts: auf einem eigenen PR, einem eigenen Issue ohne weiteren Zuständigen oder ohne dich als Zuständigen sagt eine Meldung, dass es auf GitHub noch offen ist (schließen oder mergen dort, oder F). Hat ein eigenes Issue außer dir einen weiteren Zuständigen, wird D zu „Mein Teil erledigt“. Ein wieder geöffnetes eigenes Item legt D ab, ohne es zu verstecken. Mit Markierten überspringt D diese und nennt, wie viele.

## Mir zugewiesen

- [ ] Umschalter „Typ · Status“ (kein „Zeit“ und „Repo“ mehr; eine gespeicherte Wahl davon zeigt
      „Typ“). Leisten: Pull Requests, Bug, weitere Typen, Task, Feature, Story, Ohne Typ, Später (mit den auf dem Board blockierten), ganz unten Fertig; jede Typ-Leiste mit dem Farbpunkt aus GitHub, „Ohne Typ“
      grau, „Fertig“ grün. Jede Status-Leiste hat eine leise Beschreibung hinter der Zahl.
- [ ] In jeder Typ-Leiste zuerst Review, dann In Arbeit, Backlog, Erledigt; darin nach dem
      Zeitpunkt der Zuweisung (Sortierknopf dreht das).
- [ ] Rechts in der Zeile, wann du zugewiesen wurdest („3D“), Tooltip „bob hat dich am …
      zugewiesen“; hinter dem Titel leise das Eröffnungsdatum („12. Sept.“, früher „Sept. 2025“).
      Kein Avatar.
- [ ] Eigene PRs fehlen hier (sie stehen in „Von mir erstellt“), fremde zugewiesene PRs stehen oben.
- [ ] T heftet ein Item für heute an oder nimmt es heraus. P öffnet mittig das Planmenü: T Heute,
      M Morgen, 1–5 die übrigen Wochentage dieser Woche, W Nächsten Montag, D Datum wählen, X Plan
      entfernen (nur wenn geplant). D öffnet den Datumsdialog ohne Uhrzeit, „Planen für“, ab morgen;
      heute oder früher lässt den Knopf aus. Ein so gewählter Tag trägt im Menü den Haken an
      „Datum wählen…“. Angeheftete und geplante Items bleiben in ihrer Leiste, mit Stern bzw. dem
      Tag leise hinter dem Titel („Morgen“, „Do“); keine eigene Leiste „Heute“ oder „Geplant“ mehr.
- [ ] Im Detail-Umschalter steht „Planen“ (blauer Kalender) zwischen Offen und Wiedervorlage; ein
      Klick öffnet darunter dieselben Wahlen wie P. Ist das Item angeheftet oder geplant, ist
      „Planen“ gewählt statt „Offen“ und nennt den Tag („Heute“, „Morgen“, „Do“). Im Kontextmenü
      steht „Planen für“ mit Heute und den Tagen ebenso vor „Wiedervorlage“, ein eigener Eintrag
      „Heute“ fehlt. Auf einem erledigten Item sagt ein Klick, warum es nicht geht.
- [ ] Ein Wann ersetzt das andere, und der Toast sagt es: F auf einem geplanten Item zeigt
      „#12 → Wiedervorlage Mo., 09:00 · Plan für Do entfernt“ (aus Heute: „· aus Heute genommen“),
      P oder T auf einer Wiedervorlage „#12 → Do · Wiedervorlage für Mo., 09:00 entfernt“. ⌘Z
      nimmt beides zusammen zurück. Ohne vorheriges Wann bleibt der Toast wie bisher.
- [ ] Am geplanten Tag stehen sie morgens in Heute (Ansicht „Geplant“; höchstens drei, ältester Plan zuerst); ein
      Plan für ein geschlossenes oder abgegebenes Item verschwindet. ⌘Z nimmt Planen zurück.
- [ ] Was gestern in Heute stand und offen ist, steht morgens noch da, mit dem Chip „Seit gestern“
      (später „Seit Mo“, „Seit 12. Okt.“) hinter dem Titel; es zählt gegen die drei, Geplantes
      rückt nur in den freien Platz nach. D, P oder T nehmen den Chip weg.
- [ ] „Neu“ steht an Zuweisungen, die du seit der Zuweisung nicht geöffnet hast; nach dem Öffnen
      verschwindet es. Selbst zugewiesene sind nie neu.
- [ ] Der erste Start nach dem Update lädt einmal vollständig (Issue-Typen), danach wieder Deltas.
- [ ] Klick auf einen Chip filtert nicht mehr, er öffnet das Item wie die Zeile.

## Tabellenkopf (Mir zugewiesen, Von mir erstellt)

- [ ] In „Eigenschaften“ stehen die Namen bündig, mit und ohne Haken.
- [ ] „Eigenschaften“ öffnet ein Menü mit allen Attributen (in „Mir zugewiesen“ zuerst
      „Eröffnet“); Haken an und aus, das Menü bleibt offen. Jede Tabelle merkt sich ihre Wahl,
      auch nach einem Neustart. Die Einstellungen haben nur noch Reihenfolge und Detail-Schalter.
- [ ] Sprint-Menü erscheint, sobald Items der Tabelle in einem Sprint sind: Alle Sprints, Ohne
      Sprint, dann die Sprints, früheste zuerst. Die Wahl gilt je Tabelle; die Tabellen zeigen im Kopf keine Zahl.

## Mir zuweisen (Test-Issue)

- [ ] In einem offenen Item, dem du nicht zugewiesen bist: Button mit Personen-Plus im
      Detail-Kopf, Eintrag im Kontextmenü und in ⌘K, Taste ⌃A (nur zuweisen). Das Item steht sofort in „Mir
      zugewiesen“, auf GitHub bist du kurz danach zusätzlich zugewiesen. Bei Zugewiesenen fehlt
      die Aktion.
- [ ] Mehrere Items schnell hintereinander mit ⌃A zuweisen: keine Wartezeit, alle landen auf GitHub.
- [ ] Im Verlauf des Items steht sofort „Du hast dich selbst zugewiesen“ bzw. nach ⌃U „… entfernt“.
- [ ] ⌃A weist nur zu: auf einem Item, dem du schon zugewiesen bist, sagt es „Nichts zuzuweisen“. ⌃U nimmt dich heraus, ohne Zuweisung sagt es „Nichts zu entfernen“. A, U, ⇧A und ⌘A tun das nie (U und R sind gelesen/ungelesen); im Kommentar- oder Notizfeld springt ⌃A an den Zeilenanfang.
      Schlägt es fehl (ohne WLAN), steht dort „Zuweisen auf GitHub fehlgeschlagen“ bzw. „Entfernen auf GitHub fehlgeschlagen“ mit
      rotem Warnzeichen, die Fehlermeldung als Tooltip; der Eintrag bleibt.
- [ ] Ohne WLAN zuweisen: das Item springt sofort um und nach dem Fehlschlag mit einem Hinweis
      zurück, wo es war.

## Wiedervorlage in den Tabellen

- [ ] F auf einer Zuweisung oder einem eigenen Item öffnet die Zeiten (Ohne Datum, Später heute,
      Morgen früh, Nächste Woche, Datum wählen). Das Item bleibt in seiner Tabelle: eine Zuweisung
      rückt in die Leiste „Später“ (mit den auf dem Board blockierten, eingeklappt, nicht
      mitgezählt), ein eigenes Item in „Später“ von „Von mir erstellt“; in „Geplant“
      steht keins von beiden. Mit Datum steht rechts in der Zeile, wann es zurückkommt.
      O holt es zurück, F bietet erneut die Zeiten; ⌘Z nimmt es zurück.
- [ ] Mit Datum in zwei Minuten: zur Zeit steht das Item wieder in seiner Arbeitsleiste, ohne
      Mitteilung und ohne Chip; im Protokoll steht „Wiedervorlage fällig“. War darin eine Erwähnung
      oder ein Review schon beantwortet, steht es zusätzlich als „wieder offen“ in der Inbox, bis
      du antwortest, D oder F drückst.
- [ ] Eine Erwähnung auf einem Item in Wiedervorlage: sie steht in der Inbox, das Item bleibt in
      „Später“. Andere Beiträge holen es nicht zurück, auch nicht mit „Jeder Beitrag“.
- [ ] Das × im Chip entfernt die Wiedervorlage, ebenso X auf dem Item (auch Kontextmenü und ⌘K,
      mit Zeiger über der Zeile, bei Markierten für alle); das Item ist dann, als wäre nie etwas
      gesetzt worden. ⌘Z nimmt es zurück. Bei einem Item ohne Datum tut X nichts.
- [ ] Nach dem Update: bisherige Erinnerungen sind zu Wiedervorlagen mit derselben Zeit geworden
      (im Protokoll „Wiedervorlage“); ein Item mit Wiedervorlage und Erinnerung behält nur die
      Wiedervorlage. Eine Einstellung „Zurückstellen in Von mir erstellt“ gibt es nicht mehr.
- [ ] Items außerhalb der Tabellen (z. B. eine Erwähnung) werden mit F aus der Liste genommen und
      stehen unter „Wiedervorlage“, bis ihre Zeit kommt.

## Mein Teil erledigt (Test-Issue)

- [ ] D auf einer offenen Zuweisung: Toast „Mein Teil erledigt“, das Item steht in der Leiste
      „Fertig“ ganz unten (mit der Beschreibung „Auf GitHub noch offen …“; unter Typ, Status und Zeit gleich, nicht mitgezählt),
      zusammen mit Items, die auf dem Board fertig sind; eine eigene Leiste dafür gibt es nicht. ⌘Z
      nimmt es zurück. Im Kontextmenü heißt D dort „Mein Teil erledigt“.
- [ ] Jemand kommentiert, das Board wechselt den Status (nach der stündlichen Aktualisierung), ein
      PR wird verknüpft oder das Issue geschlossen: das Item steht als „Update: …“ in der Inbox,
      mit Mitteilung. D dort hakt es ab, das Item bleibt in der Leiste (ein geschlossenes verlässt danach die Tabelle); ⌘Z nimmt das Abhaken zurück.
- [ ] O auf einem Item in der Leiste holt es zurück in die Arbeit („wieder in deiner Arbeit“); D tut dort nichts.
- [ ] ⌃U „Mich als Zuständigen entfernen“ (auch Kontextmenü, ⌘K): auf GitHub nicht mehr zugewiesen,
      und das Item ist überall raus, auch nicht unter Erledigt; nur eine Erwähnung holt es zurück.
      Ohne WLAN: Hinweis, und du bist wieder zugewiesen, mit dem Status von vorher.
- [ ] Ein zugewiesenes Issue wird geschlossen: es erscheint nicht unter Erledigt (war dein Teil
      erledigt, kommt das Schließen einmal als Update). Geschlossene Items mit Erwähnung oder
      Review-Anfrage stehen weiter unter Erledigt.
- [ ] Ein „Erledigt“ auf einer Zuweisung aus älteren Versionen steht nach dem Start in „Fertig“.

## Mehrfachauswahl

- [ ] ⌘-Klick markiert einzelne Items (das ausgewählte kommt mit), ⇧-Klick einen Bereich,
      ⇧↑/⇧↓ markieren beim Bewegen; Leisten werden nie markiert. Im Kopf steht „3 ausgewählt“,
      Klick darauf oder Esc hebt die Auswahl auf, ebenso ein normaler Klick oder ↑/↓.
- [ ] D, O, F, X, U (oder R), ⌃A und ⌃U wirken auf alle markierten: ein Toast, ⌘Z nimmt alle zusammen zurück. F bietet Zeiten, alle bekommen dieselbe Wiedervorlage. ⌃A weist alle noch nicht zugewiesenen zu, ⌃U nimmt dich bei allen heraus, bei denen du zugewiesen bist.
- [ ] Rechtsklick auf ein markiertes Item zeigt das Menü für alle; auf ein anderes das eigene,
      und die Markierung geht weg.

## Geplant (Ansicht)

- [ ] Für heute Angeheftetes (Stern) und Geplantes (Kalender), aus allen Views; keine
      Wiedervorlagen (die warten unten in der Inbox oder in ihrer Tabelle). Umschalter Alle · Issues ·
      Pull Requests, kein Reviews/Sonstige.
- [ ] Leisten nach Tag: Heute, Morgen, Diese Woche, Nächste Woche, Später, Ohne Datum;
      früheste zuerst, der Sortierknopf dreht die datierten, „Ohne Datum“ bleibt unten.
- [ ] Rechts in der Zeile „Heute“ oder der geplante Tag („Morgen“, „Do“); Tooltip mit vollem Datum. Übertragenes
      aus Heute trägt „Seit gestern“ in Rot in der Kontextzeile.
- [ ] Die Seitenleiste zählt alles, was hier steht, nie fett; ein Item, das zugleich in der Inbox
      oder Mir zugewiesen steht, zählt dort weiter.
- [ ] Das Icon-Menü im Kopf (Liste/Tabelle) schaltet die Darstellung um; die Tabelle hat
      dieselben Tagesleisten, Sprint-Filter, Eigenschaften und Pop-up-Detail wie Mir zugewiesen,
      rechts den Tag oder die Rückkehrzeit. Die Wahl bleibt nach einem Neustart.
- [ ] F → D öffnet den Dialog mit morgen (TT.MM.JJJJ, mit Punkten) und 09:00, der Fokus steht auf
      dem Tag. Die Uhrzeit ist 24 h, auch bei 12-Stunden-Uhr im System. ↑/↓ ändern den Teil (⇧ in
      Zehnern; 23 → 00 und 31. → 1. laufen über, das Jahr nicht), ←/→ wechseln die Teile. „1“ „4“ tippt
      14 und springt weiter, „7“ allein auch. Der 31.01. wird beim Wechsel auf Februar zum 28.02.
      Enter bestätigt, Esc schließt nur den Dialog (Auswahl und Pop-up bleiben), ↑/↓ bewegt dabei nicht die Auswahl in der Liste. Der aktive Teil hat eine mittelgraue Fläche, ohne Linie. Eine Zeit in der Vergangenheit lässt den Knopf aus.

## Wiedervorlage fällig

- [ ] Ein Inbox-Item mit beantworteter Erwähnung mit F → D auf eine Zeit in zwei Minuten legen: es
      steht in der Leiste „Später“ unten in der Inbox (eingeklappt, auch nach einem Update, das die
      Leiste neu bringt). Zur Zeit steht es wieder oben als „wieder offen“, ohne Mitteilung; das
      Protokoll zeigt „Wiedervorlage fällig“. Antwort, D oder F nehmen es heraus.
- [ ] Dasselbe mit einem Item, bei dem nie jemand auf dich gewartet hat: es verschwindet zur Zeit
      aus „Später“ und steht nirgends mehr (nur das Protokoll kennt es).
- [ ] App mit ⌘Q beenden, die Zeit verstreichen lassen, neu starten: das Item steht wieder in der
      Inbox, keine Mitteilung.
- [ ] Fenster mit ⌘W oder dem roten Knopf schließen: die App bleibt im Dock, Klick aufs Icon holt
      das Fenster an derselben Stelle zurück. Eine neue Erwähnung meldet sich auch
      bei geschlossenem Fenster. ⌘Q beendet die App.
- [ ] Items mit Wiedervorlage-Datum zeigen rechts in der Zeile statt des Alters, wann sie
      zurückkommen (Uhrzeit heute, Wochentag, sonst Datum); Tooltip „Wiedervorlage Mo., 26. Okt., 09:00“.
      Keine Glocke in der Zeile.
- [ ] Im Detail steht bei solchen Items ein Chip mit gelber Uhr, Wochentag, Datum und Uhrzeit (24 h)
      hinter dem Typ-Icon und einem ×; nach Ablauf ist der Chip weg.

## Einstellungen

- [ ] Darstellung → „Beschreibung“: Eingeklappt (Standard) zeigt nur die Kopfzeile, ein Klick öffnet
      sie. Erweiterbar zeigt eine feste Höhe (etwa acht Zeilen), der Text blendet unten innerhalb
      der Box aus, „Mehr anzeigen“ öffnet den Rest, „Weniger anzeigen“ schließt ihn wieder; ein
      kurzer Text steht ganz da, ohne Verlauf und Knopf. Voll zeigt immer den ganzen Text, die
      Kopfzeile ist dann nichts zum Klicken. Die Wahl gilt sofort für das offene Item.
- [ ] Sprache wechseln: alles wechselt mit.
- [ ] Mitteilungen und Dock-Badge je aus- und wieder einschalten.
- [ ] Darstellung: „Kommentare in der Detailansicht“ und „Kommentare von Bots“ durchprobieren.
- [ ] „Geschlossene und gemergte Items“: kürzlich geschlossene erscheinen unter Erledigt als
      „Geschlossen“ bzw. „Gemergt“.
- [ ] Organisationen → „Deine Repositories“ an: Items aus eigenen Repos erscheinen.

## Demo-Modus

- [ ] ⌘K → „Demodaten anzeigen“ (fehlt, wenn mit `VITE_DEMO=1` gestartet): das Fenster lädt neu und zeigt eine erfundene Welt (Juniper Vale,
      lumen-labs, harbor-works); ⌘K → „Demo-Modus beenden“ bringt die echten Daten zurück. Mit
      `VITE_DEMO=1 npm run tauri dev` startet die App direkt so, ohne `gh` und ohne dass die echte
      Datenbank angefasst wird.
- [ ] Jede Ansicht ist gefüllt: Inbox (Erwähnung, Review-Anfrage, Team-Anfrage, Erinnerung an
      dich selbst, fällige Wiedervorlage, Update zu „Mein Teil erledigt“), Mir zugewiesen (alle
      Typen, Blockiert, Fertig, Später, ein fremder PR), Von mir erstellt (Entwurf mit Konflikten,
      Wiedervorlage, PR mit Reviews), Geplant (fünf Wiedervorlagen), Erledigt (gemergt, geschlossen,
      beantwortet). Avatare sind farbige Initialen, nichts lädt aus dem Netz.
- [ ] Kommentieren, Schließen, Wiedereröffnen und Zuweisen funktionieren und ändern nur die
      Demo-Welt; nach einem Neustart ist alles wie am Anfang. Zeiten wie „vor 2 Std.“ stimmen
      zur Startzeit, in Hell und Dunkel, Englisch und Deutsch.

## In Orca öffnen

- [ ] Mit Orca installiert und dem Repo in Orca registriert: Kontextmenü, ⌘K und ein Button im
      Detail-Kopf bieten „In Orca öffnen“ (W) an, mit Orcas Logo (dem Wal) in Textfarbe; bei Items aus anderen Repos, ohne Orca und im
      Demo-Modus fehlen sie, W meldet dann „Orca kennt <Repo> nicht“. Die Hilfe listet W.
- [ ] Erstes Öffnen eines Issues: Hinweis „wird in Orca geöffnet…“, dann „neuer Worktree in Orca“;
      Orca kommt nach vorn und zeigt den Worktree unter dem Titel des Issues (Ordner und Branch
      heißen `issue-<Nummer>`), verknüpft mit dem Issue und nicht unter einem anderen Worktree.
- [ ] Ein Worktree, der noch `issue-<Nummer>` heißt, bekommt beim nächsten W den Titel.
- [ ] Erneutes Öffnen: kein zweiter Worktree, Orca springt zum Terminal des vorhandenen
      („in Orca geöffnet“). Ein PR findet auch einen Worktree auf seinem Head-Branch.
- [ ] Ein Worktree aus einem PR steht auf dem Head-Branch des PRs (noch nicht bestätigt, siehe
      `docs/reference/orca.md`).
- [ ] Ein Repo, das erst in Orca hinzugefügt wird, bekommt den Eintrag spätestens eine Minute
      nach dem Zurückwechseln in die App.

## Hilfe und Token

- [ ] `?` öffnet die Hilfe auf „Allgemein“; die drei Reiter sind gleich breit.
- [ ] Optional Token-Hinweis: `gh auth refresh -r project` entfernt das Recht, nach ⌘R erscheint
      der Kasten in der Sidebar, der kopierte Befehl fügt es wieder hinzu.
