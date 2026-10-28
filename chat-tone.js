'use strict';
// Chat tone: the chat used to stay a dark block in the light layouts. It now takes the tone of the
// other workspace panels (light text on dark panels, dark text on light panels) after every theme,
// layout or colour change, so the chat always matches the rest of the window. CSS does the styling
// (body[data-chat-tone] in chat-refresh.css); this only measures which tone the panels use.
const startChatTone = () => {
  const luminance = value => {
    const parts = /^rgba?\(([\d.]+), ([\d.]+), ([\d.]+)/.exec(value) || /^color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)/.exec(value);
    if (!parts) return null;
    const scale = value.startsWith('color(') ? 255 : 1;
    const channel = v => { v = (v * scale) / 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; };
    return .2126 * channel(+parts[1]) + .7152 * channel(+parts[2]) + .0722 * channel(+parts[3]);
  };
  let timer = 0;
  const measure = () => {
    const panel = document.getElementById('mods-panel') || document.getElementById('lab-panel');
    if (!panel) return;
    const ink = luminance(getComputedStyle(panel).color);
    if (ink === null) return;
    // dark ink = light panels; the chat follows
    const tone = ink < .35 ? 'light' : 'dark';
    if (document.body.dataset.chatTone !== tone) document.body.dataset.chatTone = tone;
  };
  const schedule = () => { clearTimeout(timer); timer = setTimeout(measure, 120); };
  new MutationObserver(schedule).observe(document.body, { attributes: true, attributeFilter: ['class', 'data-theme', 'data-wallpaper', 'style'] });
  document.addEventListener('click', event => { if (event.target.closest('[data-view], [data-theme-choice], [id^="ui-mode-"], .design-overlay')) schedule(); }, true);
  measure();
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startChatTone, { once: true }); else startChatTone();
