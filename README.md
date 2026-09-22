# FluidPilot

[Polski](#polski) · [English](#english)

## Polski

FluidPilot to rozszerzenie Firefox i userscript dla Violentmonkey, które rozbudowują Fluid Player o wygodne sterowanie, regulowaną pętlę, podgląd osi czasu oraz eksport aktywnej pętli.

### Funkcje

- Kliknięcie obrazu lub `Spacja` przełącza odtwarzanie i pauzę.
- `←` / `→` przesuwa pozycję o 10 sekund.
- `Shift + ←` / `Shift + →` przesuwa pozycję o 1 sekundę.
- `Ctrl + ←` / `Ctrl + →` przesuwa pozycję o 30 sekund.
- `L` włącza lub wyłącza pętlę. Domyślny zakres to `[-1 1]`.
- `Z + ←` / `Z + →` zmienia lewą granicę pętli.
- `X + ←` / `X + →` zmienia prawą granicę pętli.
- `P` przełącza globalny tryb głośności 5%, zapamiętywany między kartami i sesjami.
- Panel pozwala ręcznie wybrać język polski lub angielski oraz włączyć ukrywanie kursora nad odtwarzaczem.
- `G` eksportuje aktywną pętlę jako GIF 1280 px przy 12 klatkach/s.
- `F` eksportuje aktywną pętlę jako nagranie WebM.
- Podgląd klatki działa również 30 px nad i pod osią czasu.

### Instalacja rozszerzenia Firefox

Gotowy pakiet znajduje się w katalogu `dist`. Do ręcznych testów otwórz `about:debugging`, wybierz **Ten Firefox**, kliknij **Wczytaj tymczasowy dodatek** i wskaż `extension/manifest.json`.

### Instalacja userscriptu

1. Zainstaluj [Violentmonkey](https://violentmonkey.github.io/).
2. Otwórz [FluidPilot.user.js](https://raw.githubusercontent.com/Artllex/FluidPilot/main/FluidPilot.user.js).
3. Potwierdź instalację userscriptu.

FluidPilot obecnie rozpoznaje potwierdzony układ Fluid Playera przez selektory `#thisPlayer` i powiązane elementy osi czasu. Obsługa kolejnych wariantów odtwarzacza będzie dodawana stopniowo.

## English

FluidPilot is a Firefox extension and a Violentmonkey userscript that adds convenient controls, an adjustable loop, timeline preview, and loop export to Fluid Player.

### Features

- Click the video or press `Space` to toggle playback.
- `←` / `→` seeks by 10 seconds.
- `Shift + ←` / `Shift + →` seeks by 1 second.
- `Ctrl + ←` / `Ctrl + →` seeks by 30 seconds.
- `L` toggles a loop. Its default range is `[-1 1]`.
- `Z + ←` / `Z + →` adjusts the left loop edge.
- `X + ←` / `X + →` adjusts the right loop edge.
- `P` toggles a global 5% volume mode saved across tabs and sessions.
- The panel lets you choose Polish or English and enable cursor hiding over the player.
- `G` exports the active loop as a 1280 px GIF at 12 fps.
- `F` exports the active loop as a WebM recording.
- Frame preview remains active 30 px above and below the timeline.

### Firefox extension installation

The packaged extension is available in `dist`. For manual testing, open `about:debugging`, select **This Firefox**, click **Load Temporary Add-on**, and choose `extension/manifest.json`.

### Userscript installation

1. Install [Violentmonkey](https://violentmonkey.github.io/).
2. Open [FluidPilot.user.js](https://raw.githubusercontent.com/Artllex/FluidPilot/main/FluidPilot.user.js).
3. Confirm userscript installation.

FluidPilot currently recognizes the confirmed Fluid Player layout through `#thisPlayer` and its related timeline elements. Support for more player variants will be added incrementally.

## License

[MIT](LICENSE)
