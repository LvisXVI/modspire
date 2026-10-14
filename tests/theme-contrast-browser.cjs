const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const root = path.resolve(__dirname, '..');
    await page.setContent('<section class="setup-strip"><label>MODPACK <select id="project-select"><option>Neues Abenteuer</option></select></label><label>VERSION <select id="minecraft-version"><option>1.21.1</option></select></label><label>MODLOADER <select id="loader"><option>Fabric</option></select></label></section><div class="mod-results"><article class="mod-card"><img class="mod-icon"><div class="mod-card-main"><div class="mod-name"><strong>Test-Mod</strong></div><p class="mod-desc">Vorschautext</p></div></article></div>');
    await page.addStyleTag({ path: path.join(root, 'styles.css') });
    await page.addStyleTag({ path: path.join(root, 'visual-fixes.css') });
    await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important}' });
    const themes = ['blue', 'fluid', 'clear', 'translucent', 'aurora', 'redstone', 'ender', 'emerald', 'nether'];
    for (const theme of themes) {
      const result = await page.evaluate(theme => {
        document.body.dataset.theme = theme;
        const field = getComputedStyle(document.querySelector('#project-select'));
        const label = getComputedStyle(document.querySelector('.setup-strip label'));
        const strip = getComputedStyle(document.querySelector('.setup-strip'));
        const themeSurface = getComputedStyle(document.body).getPropertyValue('--theme-glass-surface').trim() || getComputedStyle(document.body).getPropertyValue('--custom-surface').trim();
        const card = getComputedStyle(document.querySelector('.mod-card'));
        const rgb = color => {
          const hex = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
          if (hex) return hex[1].length === 3 ? [...hex[1]].map(char => parseInt(char + char, 16)) : [0, 2, 4].map(index => parseInt(hex[1].slice(index, index + 2), 16));
          const srgb = color.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)$/i);
          if (srgb) { const alpha = srgb[4] ? Number(srgb[4]) : 1; return srgb.slice(1, 4).map(channel => (Number(channel) * alpha + 1 - alpha) * 255); }
          return color.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? null;
        };
        const luminance = color => { const parts = rgb(color); if (!parts) return null; const linear = parts.map(channel => { const c = channel / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; }); return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2]; };
        const ratio = (foreground, background) => { const a = luminance(foreground), b = luminance(background); return a === null || b === null ? null : (Math.max(a, b) + .05) / (Math.min(a, b) + .05); };
        return { theme, text: field.color, textFill: field.webkitTextFillColor, background: field.backgroundColor, backgroundImage: field.backgroundImage, label: label.color, strip: strip.backgroundColor, themeSurface, fieldContrast: ratio(field.color, field.backgroundColor), labelContrast: ratio(label.color, themeSurface), cardHeight: card.minHeight, contentVisibility: card.contentVisibility, contain: card.contain };
      }, theme);
      assert.equal(result.text, 'rgb(244, 248, 255)', `${theme}: selected text color`);
      assert.equal(result.textFill, 'rgb(244, 248, 255)', `${theme}: selected text fill`);
      assert.ok(result.fieldContrast === null || result.fieldContrast >= 4.5, `${theme}: version selector contrast ${result.fieldContrast?.toFixed(2)}:1 against ${result.background}`);
      assert.ok(result.labelContrast === null || result.labelContrast >= 4.5, `${theme}: setup label contrast ${result.labelContrast?.toFixed(2)}:1; label ${result.label}, surface ${result.themeSurface}`);
      assert.ok(Number.parseFloat(result.cardHeight) >= 154, `${theme}: mod card minimum height`);
      assert.equal(result.contentVisibility, 'visible', `${theme}: mod cards must render fully`);
      assert.equal(result.contain, 'none', `${theme}: mod cards must not be paint-contained`);
    }
    console.log(`Setup-field contrast and full mod-card rendering passed for ${themes.length} themes.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
