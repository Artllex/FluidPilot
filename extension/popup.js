'use strict';

(async () => {
    const HIDE_CURSOR_KEY = 'fluidpilot-hide-cursor';
    const GIF_MAX_WIDTH_KEY = 'fluidpilot-gif-max-width';
    const GIF_TARGET_FPS_KEY = 'fluidpilot-gif-fps';
    const GIF_MAX_FRAMES_KEY = 'fluidpilot-gif-max-frames';
    const GIF_DITHER_KEY = 'fluidpilot-gif-dither';
    await FluidPilotI18n.init(browser);
    FluidPilotI18n.apply();

    const language = document.getElementById('language');
    const hideCursor = document.getElementById('hide-cursor');
    const notice = document.getElementById('notice');
    const gifWidth = document.getElementById('gif-width');
    const gifFps = document.getElementById('gif-fps');
    const gifMaxFrames = document.getElementById('gif-max-frames');
    const gifDither = document.getElementById('gif-dither');
    language.value = FluidPilotI18n.language;
    const preferences = await browser.storage.local.get([
        HIDE_CURSOR_KEY, GIF_MAX_WIDTH_KEY, GIF_TARGET_FPS_KEY, GIF_MAX_FRAMES_KEY, GIF_DITHER_KEY
    ]);
    hideCursor.checked = Boolean(preferences[HIDE_CURSOR_KEY]);
    gifWidth.value = ['480', '720', '960', '1280'].includes(String(preferences[GIF_MAX_WIDTH_KEY]))
        ? String(preferences[GIF_MAX_WIDTH_KEY]) : '1280';
    gifFps.value = ['6', '12', '15'].includes(String(preferences[GIF_TARGET_FPS_KEY]))
        ? String(preferences[GIF_TARGET_FPS_KEY]) : '12';
    gifMaxFrames.value = ['60', '120', '180'].includes(String(preferences[GIF_MAX_FRAMES_KEY]))
        ? String(preferences[GIF_MAX_FRAMES_KEY]) : '180';
    gifDither.checked = preferences[GIF_DITHER_KEY] !== false;
    [gifWidth, gifFps, gifMaxFrames].forEach(element => {
        element.dataset.savedValue = element.value;
    });
    gifDither.dataset.savedValue = String(gifDither.checked);

    async function savePreference(key, value, restore, remember) {
        try {
            await browser.storage.local.set({ [key]: value });
            remember();
            notice.classList.remove('error');
            notice.textContent = FluidPilotI18n.t('saved');
        } catch (error) {
            restore();
            notice.textContent = FluidPilotI18n.t('saveError');
            notice.classList.add('error');
        }
    }

    language.addEventListener('change', async event => {
        try {
            await FluidPilotI18n.setLanguage(event.target.value, browser);
            FluidPilotI18n.apply();
            notice.textContent = FluidPilotI18n.t('saved');
        } catch (error) {
            notice.textContent = FluidPilotI18n.t('saveError');
            notice.classList.add('error');
        }
    });

    hideCursor.addEventListener('change', async event => {
        try {
            await browser.storage.local.set({ [HIDE_CURSOR_KEY]: event.target.checked });
            notice.classList.remove('error');
            notice.textContent = FluidPilotI18n.t('saved');
        } catch (error) {
            event.target.checked = !event.target.checked;
            notice.textContent = FluidPilotI18n.t('saveError');
            notice.classList.add('error');
        }
    });

    [[gifWidth, GIF_MAX_WIDTH_KEY], [gifFps, GIF_TARGET_FPS_KEY], [gifMaxFrames, GIF_MAX_FRAMES_KEY]].forEach(
        ([element, key]) => element.addEventListener('change', () => {
            const nextValue = element.value;
            savePreference(
                key,
                Number(nextValue),
                () => { element.value = element.dataset.savedValue; },
                () => { element.dataset.savedValue = nextValue; }
            );
        })
    );
    gifDither.addEventListener('change', () => {
        const nextValue = gifDither.checked;
        savePreference(
            GIF_DITHER_KEY,
            nextValue,
            () => { gifDither.checked = gifDither.dataset.savedValue === 'true'; },
            () => { gifDither.dataset.savedValue = String(nextValue); }
        );
    });
})().catch(error => {
    console.error('[FluidPilot] Popup:', error);
});
