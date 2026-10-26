'use strict';
// UI Version 5 · Liquid Glass. Adds a fifth layout choice that reuses the UI 4
// structure and swaps its look via body.ui-glass, so every view and control
// keeps working. The choice is remembered per device.
const startGlassUi = () => {
  const KEY = 'mw-ui-glass';
  const english = () => (document.documentElement.lang || 'en').startsWith('en');
  const read = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
  const write = on => { try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* storage unavailable */ } };
  const body = document.body;

  // Glass only applies on top of UI 4; switching to another layout turns it off.
  const sync = () => {
    const on = read() && body.classList.contains('ui-v4');
    body.classList.toggle('ui-glass', on);
    const glass = document.getElementById('ui-mode-glass'), v4 = document.getElementById('ui-mode-v4');
    glass?.setAttribute('aria-pressed', String(on));
    glass?.classList.toggle('active', on);
    if (on && v4) { v4.setAttribute('aria-pressed', 'false'); v4.classList.remove('active'); }
  };

  const install = () => {
    const v4 = document.getElementById('ui-mode-v4');
    if (!v4 || document.getElementById('ui-mode-glass')) return;
    const button = document.createElement('button');
    button.className = 'ui-mode-option'; button.id = 'ui-mode-glass'; button.type = 'button';
    button.setAttribute('aria-pressed', 'false');
    button.innerHTML = `<span class="ui-mode-preview glass-preview"><i></i><i></i><i></i></span><strong>${english() ? 'UI Version 5 · Liquid Glass' : 'UI Version 5 · Liquid Glass'}</strong><small>${english() ? 'Frosted glass panels floating over your Minecraft world' : 'Milchglas-Flächen über deiner Minecraft-Welt'}</small><span class="ui-mode-check">✓</span>`;
    v4.after(button);
    let choosingGlass = false;
    button.addEventListener('click', () => { write(true); choosingGlass = true; v4.click(); choosingGlass = false; requestAnimationFrame(sync); });
    for (const id of ['ui-mode-classic', 'ui-mode-modern', 'ui-mode-v3', 'ui-mode-v4']) {
      document.getElementById(id)?.addEventListener('click', () => { if (!choosingGlass) write(false); requestAnimationFrame(sync); }, true);
    }
    sync();
  };

  // Layout classes are set by modern-ui.js; follow them instead of duplicating its logic.
  new MutationObserver(sync).observe(body, { attributes: true, attributeFilter: ['class'] });
  // The layout dialog is created lazily; watch for it only until the option is in place.
  const waitForDialog = new MutationObserver(() => { install(); if (document.getElementById('ui-mode-glass')) waitForDialog.disconnect(); });
  install();
  if (!document.getElementById('ui-mode-glass')) waitForDialog.observe(document.body, { childList: true, subtree: true });
  sync();
  if (body.classList.contains('ui-glass')) {
    body.classList.add('glass-launch');
    setTimeout(() => body.classList.remove('glass-launch'), 1300);
  }

  // Soft light that follows the pointer across glass panels.
  addEventListener('pointermove', event => {
    if (!body.classList.contains('ui-glass')) return;
    const panel = event.target.closest?.('.panel, .v4-panel');
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    panel.style.setProperty('--gx', `${event.clientX - rect.left}px`);
    panel.style.setProperty('--gy', `${event.clientY - rect.top}px`);
  }, { passive: true });
};
if (document.body) startGlassUi(); else document.addEventListener('DOMContentLoaded', startGlassUi, { once: true });
