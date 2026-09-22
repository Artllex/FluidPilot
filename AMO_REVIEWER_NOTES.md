# FluidPilot 3.1.2 — reviewer notes

## English

FluidPilot is a Firefox extension for compatible Fluid Player layouts. Its content script adds playback shortcuts, adjustable loop controls, timeline frame preview, and local GIF/WebM export.

The source is readable and unbundled JavaScript, HTML, and CSS. Build the package with `scripts/build.ps1`; it creates `dist/FluidPilot-3.1.2.xpi`.

The extension uses `storage` only for local preferences: selected panel language, cursor visibility, and the optional 5% volume mode. It does not collect or transmit user data. The all-sites host permission is required to detect compatible players embedded on websites.

## Polski

FluidPilot to rozszerzenie Firefox dla zgodnych układów Fluid Playera. Skrypt treści dodaje skróty odtwarzania, regulowaną pętlę, podgląd klatek na osi czasu oraz lokalny eksport GIF/WebM.

Kod źródłowy to czytelne, niepołączone pliki JavaScript, HTML i CSS. Paczkę można zbudować skryptem `scripts/build.ps1`, który tworzy `dist/FluidPilot-3.1.2.xpi`.

Rozszerzenie korzysta z `storage` wyłącznie dla lokalnych preferencji: języka panelu, widoczności kursora oraz opcjonalnego trybu głośności 5%. Nie zbiera ani nie wysyła danych użytkownika. Uprawnienie dostępu do stron jest wymagane, aby wykrywać zgodne odtwarzacze osadzone na stronach internetowych.
