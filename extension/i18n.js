'use strict';

const FLUIDPILOT_MESSAGES = {
    pl: {
        tagline: 'Sterowanie odtwarzaczem.',
        language: 'Język',
        settingsTitle: 'Ustawienia',
        hideCursor: 'Ukrywaj kursor',
        hideCursorDescription: 'Ukrywa wskaźnik myszy nad odtwarzaczem.',
        gifQualityTitle: 'Jakość GIF',
        gifResolution: 'Rozdzielczość',
        gifFps: 'Klatki / s',
        gifMaxFrames: 'Limit klatek',
        gifDither: 'Wygładzanie kolorów',
        gifDitherDescription: 'Zmniejsza widoczne pasy kolorów.',
        shortcutsTitle: 'Skróty',
        shortcutLoop: 'Włącz lub wyłącz pętlę',
        shortcutEdges: 'Zmień lewą lub prawą granicę',
        shortcutGif: 'Eksportuj pętlę jako GIF',
        shortcutVideo: 'Eksportuj pętlę jako WebM',
        shortcutVolume: 'Przełącz globalną głośność 5%',
        privacy: 'Ustawienia pozostają w Twoim Firefoksie. Bez konta i wysyłania ich na serwer.',
        saved: 'Ustawienie zapisane.',
        saveError: 'Nie udało się zapisać ustawienia.'
    },
    en: {
        tagline: 'Player controls.',
        language: 'Language',
        settingsTitle: 'Settings',
        hideCursor: 'Hide the cursor',
        hideCursorDescription: 'Hides the mouse pointer over the player.',
        gifQualityTitle: 'GIF quality',
        gifResolution: 'Resolution',
        gifFps: 'Frames / s',
        gifMaxFrames: 'Frame limit',
        gifDither: 'Color smoothing',
        gifDitherDescription: 'Reduces visible color banding.',
        shortcutsTitle: 'Shortcuts',
        shortcutLoop: 'Toggle the loop',
        shortcutEdges: 'Adjust the left or right edge',
        shortcutGif: 'Export the loop as a GIF',
        shortcutVideo: 'Export the loop as WebM',
        shortcutVolume: 'Toggle global 5% volume',
        privacy: 'Settings stay in your Firefox profile. No account and no settings uploads.',
        saved: 'Setting saved.',
        saveError: 'Could not save the setting.'
    }
};

const FluidPilotI18n = (() => {
    const languageKey = 'fluidpilot.language';
    let language = 'en';
    const normalize = value => value === 'pl' ? 'pl' : 'en';
    function t(key) {
        return FLUIDPILOT_MESSAGES[language][key] || FLUIDPILOT_MESSAGES.en[key] || key;
    }
    function apply(root = document) {
        root.documentElement.lang = language;
        root.querySelectorAll('[data-i18n]').forEach(element => {
            element.textContent = t(element.dataset.i18n);
        });
        const picker = root.getElementById?.('language');
        if (picker) picker.value = language;
    }
    async function init(api) {
        const saved = await api.storage.local.get(languageKey);
        language = saved[languageKey] === 'pl' || saved[languageKey] === 'en'
            ? saved[languageKey]
            : ((navigator.language || '').toLowerCase().startsWith('pl') ? 'pl' : 'en');
    }
    async function setLanguage(value, api) {
        language = normalize(value);
        await api.storage.local.set({ [languageKey]: language });
    }
    return { t, apply, init, setLanguage, get language() { return language; } };
})();
