'use strict';

(async () => {
    const HIDE_CURSOR_KEY = 'fluidpilot-hide-cursor';
    await FluidPilotI18n.init(browser);
    FluidPilotI18n.apply();

    const language = document.getElementById('language');
    const hideCursor = document.getElementById('hide-cursor');
    const notice = document.getElementById('notice');
    language.value = FluidPilotI18n.language;
    hideCursor.checked = Boolean((await browser.storage.local.get(HIDE_CURSOR_KEY))[HIDE_CURSOR_KEY]);

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
})().catch(error => {
    console.error('[FluidPilot] Popup:', error);
});
