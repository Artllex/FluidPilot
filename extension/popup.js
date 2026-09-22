document.documentElement.lang = browser.i18n.getUILanguage().split('-')[0];
for (const element of document.querySelectorAll('[data-i18n]')) {
    element.textContent = browser.i18n.getMessage(element.dataset.i18n);
}
