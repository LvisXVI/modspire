'use strict';
// Contrast guard: 9 themes × 5 layouts each set their own colours, and some combinations left text
// in the same tone as its panel. After every theme, layout or view change this measures text against
// the background it actually sits on and switches unreadable text to dark or light ink.
// Only elements with a solid, measurable background chain are touched; images and gradients are skipped.
const startContrastGuard = () => {
  const MIN_RATIO = 3;
  const DARK = '#14202c', LIGHT = '#f3f7fc';
  const parse = value => {
    const srgb = /^color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.e-]+))?\)/.exec(value);
    if (srgb) return { r: srgb[1] * 255, g: srgb[2] * 255, b: srgb[3] * 255, a: srgb[4] === undefined ? 1 : +srgb[4] };
    const rgb = /^rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?\)/.exec(value);
    return rgb ? { r: +rgb[1], g: +rgb[2], b: +rgb[3], a: rgb[4] === undefined ? 1 : +rgb[4] } : null;
  };
  const luminance = ({ r, g, b }) => {
    const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; };
    return .2126 * f(r) + .7152 * f(g) + .0722 * f(b);
  };
  const blend = (top, bottom) => ({ r: top.r * top.a + bottom.r * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), b: top.b * top.a + bottom.b * (1 - top.a), a: 1 });
  const ratio = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };

  const backgroundOf = el => {
    const layers = [];
    for (let node = el; node && node !== document.documentElement; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.backgroundImage !== 'none') return null;
      const color = parse(style.backgroundColor);
      if (color && color.a > 0) { layers.push(color); if (color.a >= .95) break; }
    }
    if (!layers.length || layers[layers.length - 1].a < .95) return null;
    return layers.reduceRight((acc, layer) => acc ? blend(layer, acc) : layer, null);
  };

  const check = () => {
    document.querySelectorAll('[data-contrast-guard]').forEach(el => { el.style.removeProperty('color'); el.removeAttribute('data-contrast-guard'); });
    const root = document.querySelector('.app-shell');
    if (!root) return;
    for (const el of root.querySelectorAll('*')) {
      if (el.closest('svg, .wallpaper-fx') || !el.offsetParent) continue;
      if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 1)) continue;
      const style = getComputedStyle(el);
      const fg = parse(style.color); const bg = backgroundOf(el);
      if (!fg || !bg) continue;
      if (ratio(blend(fg, bg), bg) >= MIN_RATIO) continue;
      const ink = ratio(parse('rgb(20, 32, 44)'), bg) >= ratio(parse('rgb(243, 247, 252)'), bg) ? DARK : LIGHT;
      el.style.setProperty('color', ink, 'important');
      el.setAttribute('data-contrast-guard', '');
    }
  };

  let timer = 0;
  // after theme/layout transitions have settled
  const schedule = () => { clearTimeout(timer); timer = setTimeout(() => requestAnimationFrame(check), 700); };
  new MutationObserver(schedule).observe(document.body, { attributes: true, attributeFilter: ['class', 'data-theme'] });
  document.addEventListener('click', event => { if (event.target.closest('[data-view], [data-theme-choice], [id^="ui-mode-"]')) schedule(); }, true);
  schedule();
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startContrastGuard, { once: true }); else startContrastGuard();
