# FluidPilot

FluidPilot to userscript dla Violentmonkey, który rozbudowuje odtwarzacze Fluid Player o wygodne sterowanie, regulowaną pętlę, podgląd osi czasu oraz eksport aktywnej pętli.

## Funkcje

- Kliknięcie obrazu przełącza odtwarzanie i pauzę.
- `Spacja` przełącza odtwarzanie i pauzę.
- `←` / `→` przesuwa pozycję o 10 sekund.
- `Shift + ←` / `Shift + →` przesuwa pozycję o 1 sekundę.
- `Ctrl + ←` / `Ctrl + →` przesuwa pozycję o 30 sekund.
- `L` włącza lub wyłącza pętlę. Domyślny zakres to `[-1 1]`.
- `Z + ←` / `Z + →` zmienia lewą granicę pętli.
- `X + ←` / `X + →` zmienia prawą granicę pętli.
- `P` przełącza globalny tryb głośności 5%, zapamiętywany między kartami i sesjami.
- `G` eksportuje aktywną pętlę jako GIF 1280 px przy 12 klatkach/s.
- `F` eksportuje aktywną pętlę jako nagranie WebM.
- Podgląd klatki działa również 30 px nad i pod osią czasu.

## Instalacja

1. Zainstaluj rozszerzenie [Violentmonkey](https://violentmonkey.github.io/).
2. Otwórz [FluidPilot.user.js](https://raw.githubusercontent.com/Artllex/FluidPilot/main/FluidPilot.user.js).
3. Potwierdź instalację userscriptu.

FluidPilot obecnie rozpoznaje potwierdzony układ Fluid Playera przez selektory `#thisPlayer` i powiązane elementy osi czasu. Obsługa kolejnych wariantów odtwarzacza będzie dodawana stopniowo.

## Licencja

[MIT](LICENSE)
