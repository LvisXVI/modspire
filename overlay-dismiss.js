'use strict';
// Every dialog closes the same way: Escape closes the topmost one, and a click on the dimmed area
// around a dialog does too. Each dialog's own close/cancel button does the closing, so its cleanup
// (stopping a preview, restoring focus, saving) still runs. Start-up gates stay mandatory.
(() => {
  const SELECTOR = '.design-overlay, .settings-overlay, .mod-preview-overlay, .test-overlay';
  const CLOSER = 'button[id^="close-"], button[id$="-close"], button[id^="cancel-"], .close-button, #test-done';
  const open = () => [...document.querySelectorAll(SELECTOR)].filter(node => !node.hidden && getComputedStyle(node).display !== 'none');
  const closeOverlay = overlay => {
    const button = overlay.querySelector(CLOSER);
    if (button) button.click(); else overlay.hidden = true;
  };
  window.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    const overlays = open();
    if (!overlays.length) return;
    event.stopImmediatePropagation();
    closeOverlay(overlays[overlays.length - 1]);
  }, true);
  let pressed = null;
  document.addEventListener('mousedown', event => { pressed = event.target; }, true);
  document.addEventListener('click', event => {
    const overlay = event.target;
    if (!(overlay instanceof Element) || !overlay.matches(SELECTOR) || pressed !== overlay) return;
    closeOverlay(overlay);
  }, true);
})();
