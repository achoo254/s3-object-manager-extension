import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';

export default defineBackground(() => {
  // A popup closes as soon as it loses focus, which would kill long uploads, so the
  // icon opens the manager in a regular tab instead.
  browser.action.onClicked.addListener(() => {
    void browser.tabs.create({ url: browser.runtime.getURL('/manager.html') });
  });
});
