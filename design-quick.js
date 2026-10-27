'use strict';
// Quick design menu (same pattern as Minecraft Host and Mod Studio): the top-bar "Designs"
// button opens a compact list of themes and layouts. It drives the existing theme and
// layout buttons, so persistence and every option of the full dialog stay as they are;
// "All designs & colours" still opens that dialog.
const startDesignQuick = () => {
  const $ = id => document.getElementById(id);
  const english = () => (window.workshopI18n?.locale || document.documentElement.lang || 'en').startsWith('en');
  const LAYOUTS = [
    ['classic', 'Classic', 'Klassisch'], ['modern', 'Modern', 'Modern'], ['v3', 'UI 3', 'UI 3'],
    ['v4', 'UI 4', 'UI 4'], ['glass', 'Glass', 'Glass'],
  ];
  let menu = null;

  const activeLayout = () => {
    const b = document.body.classList;
    if (b.contains('ui-glass')) return 'glass';
    if (b.contains('ui-v4')) return 'v4';
    if (b.contains('ui-v3')) return 'v3';
    if (b.contains('ui-modern')) return 'modern';
    return 'classic';
  };

  const build = () => {
    const themes = [...document.querySelectorAll('[data-theme-choice]')];
    const el = document.createElement('div');
    el.className = 'design-quick'; el.id = 'design-quick'; el.setAttribute('role', 'menu'); el.hidden = true;
    el.innerHTML = `<div class="dq-list">${themes.map(t => {
      const swatch = t.querySelector('.theme-swatch')?.className || 'theme-swatch';
      const name = t.querySelector('strong')?.textContent || t.dataset.themeChoice;
      const note = t.querySelector('small')?.textContent || '';
      return `<button class="dq-option" type="button" role="menuitemradio" data-dq-theme="${t.dataset.themeChoice}"><i class="${swatch}"></i><span><strong>${name}</strong><small>${note}</small></span></button>`;
    }).join('')}</div>
      <div class="dq-label">${english() ? 'Layout' : 'Layout'}</div>
      <div class="dq-layouts">${LAYOUTS.map(([id, en, de]) => `<button type="button" data-dq-layout="${id}">${english() ? en : de}</button>`).join('')}</div>
      <label class="dq-motion"><span>${english() ? 'Animated backgrounds' : 'Bewegte Hintergründe'}</span><input type="checkbox" role="switch" id="dq-motion"><i aria-hidden="true"></i></label>
      <button class="dq-all" type="button" id="dq-all">${english() ? 'All designs & colours …' : 'Alle Designs & Farben …'}</button>`;
    document.body.appendChild(el);
    // mirrors the "move backgrounds" switch of the full design dialog, which stores the setting
    el.querySelector('#dq-motion').addEventListener('change', event => {
      const source = $('wallpaper-motion');
      if (source && source.checked !== event.target.checked) { source.checked = event.target.checked; source.dispatchEvent(new Event('change')); }
    });
    el.addEventListener('click', event => {
      if (event.target.closest('.dq-motion')) return;
      const theme = event.target.closest('[data-dq-theme]');
      const layout = event.target.closest('[data-dq-layout]');
      if (theme) document.querySelector(`[data-theme-choice="${theme.dataset.dqTheme}"]`)?.click();
      if (layout) $(`ui-mode-${layout.dataset.dqLayout}`)?.click();
      if (event.target.closest('#dq-all')) { close(); $('open-design')?.onclick?.(); return; }
      // the layout buttons close their own dialog; keep it closed and refresh our marks
      document.querySelectorAll('dialog[open]').forEach(d => d.close());
      requestAnimationFrame(sync);
    });
    return el;
  };

  const sync = () => {
    if (!menu) return;
    const theme = document.body.dataset.theme, layout = activeLayout();
    menu.querySelectorAll('[data-dq-theme]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.dqTheme === theme)));
    menu.querySelectorAll('[data-dq-layout]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.dqLayout === layout)));
    menu.querySelector('#dq-motion').checked = document.body.dataset.wallpaperMotion !== 'off';
  };

  const close = () => { if (menu) menu.hidden = true; $('open-design')?.setAttribute('aria-expanded', 'false'); };

  const open = button => {
    menu = menu || build();
    const r = button.getBoundingClientRect();
    menu.style.top = `${r.bottom + 10}px`;
    menu.style.right = `${Math.max(8, innerWidth - r.right)}px`;
    sync();
    menu.hidden = false;
    button.setAttribute('aria-expanded', 'true');
  };

  const button = $('open-design');
  if (!button) return;
  button.setAttribute('aria-haspopup', 'true');
  button.setAttribute('aria-expanded', 'false');
  // capture phase: runs before renderer.js's onclick, which would open the full dialog
  button.addEventListener('click', event => {
    event.stopImmediatePropagation(); event.preventDefault();
    if (menu && !menu.hidden) close(); else open(button);
  }, true);
  // only real clicks close it: our own forwarded clicks on the theme/layout buttons are synthetic
  document.addEventListener('click', event => { if (event.isTrusted && menu && !menu.hidden && !event.target.closest('#design-quick, #open-design')) close(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
  addEventListener('resize', close);
  new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['class', 'data-theme', 'data-wallpaper-motion'] });
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startDesignQuick, { once: true }); else startDesignQuick();
