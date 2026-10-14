const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

function luminance(color) {
  const raw=color.match(/[\d.]+/g).slice(0, 3).map(Number);
  const values = (color.startsWith('color(srgb')?raw:raw.map(value=>value/255)).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return .2126 * values[0] + .7152 * values[1] + .0722 * values[2];
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const root = path.resolve(__dirname, '..');
    await page.setContent(`<section class="design-overlay mod-selection-overlay"><div class="design-card mod-selection-dialog"><header class="mod-selection-header"><div class="mod-selection-mark">✦</div><div class="mod-selection-heading"><h2>Mods auswählen</h2><p>35 Vorschläge</p></div></header><div class="mod-selection-body"><div id="mod-selection-results" class="mod-results mod-picker-results"><article class="mod-card"><div class="mod-card-icon-wrap"></div><div class="mod-card-main"><div class="mod-name"><strong>Beispiel Mod</strong></div><p class="mod-desc">Eine gut lesbare Beschreibung</p></div></article></div></div></div></section><section class="design-overlay mod-details-overlay"><article class="design-card mod-details-card"><header class="mod-details-header"><div class="eyebrow">Modrinth</div><h2>Mod-Details</h2></header><div class="mod-details-meta"><span>Autor</span></div><div class="mod-details-description-wrap"><h3>Beschreibung</h3><p class="mod-details-description">Langer Beschreibungstext</p></div></article></section>`);
    await page.addStyleTag({ path: path.join(root, 'styles.css') });
    await page.addStyleTag({ path: path.join(root, 'visual-fixes.css') });
    await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important;opacity:1!important}'});
    const themes = ['blue', 'fluid', 'clear', 'translucent', 'aurora', 'redstone', 'ender', 'emerald', 'nether'];
    for (const theme of themes) {
      const surfaces = await page.evaluate(theme => {
        document.body.dataset.theme = theme;
        const selection = document.querySelector('.mod-selection-dialog');
        const details = document.querySelector('.mod-details-card');
        const tile = document.querySelector('.mod-picker-results .mod-card');
        const text = document.querySelector('.mod-details-description');
        const read = node => { const style=getComputedStyle(node);return {background:style.backgroundColor,border:style.borderColor,color:style.color,matched:node.matches('html body[data-theme] .mod-selection-dialog .mod-picker-results>.mod-card')} };
        return {selection:read(selection),details:read(details),tile:read(tile),description:read(text)};
      }, theme);
      for (const [name, value] of Object.entries({selection:surfaces.selection,details:surfaces.details})) {
        const rgb=value.background.match(/[\d.]+/g).slice(0,3).map(Number);
        assert.ok(rgb.some(channel=>channel<225), `${theme}: ${name} surface should follow its palette instead of staying white`);
        assert.ok(value.border && value.border!== 'rgb(255, 255, 255)', `${theme}: ${name} border should use a theme color`);
        const bg=value.background.startsWith('color(srgb')?value.background:value.background;
        const contrast=(Math.max(luminance(value.color),luminance(bg))+.05)/(Math.min(luminance(value.color),luminance(bg))+.05);
        assert.ok(contrast>=4.5, `${theme}: ${name} text contrast should remain readable (got ${contrast.toFixed(2)})`);
      }
      const detailContrast=(Math.max(luminance(surfaces.description.color),luminance(surfaces.details.background))+.05)/(Math.min(luminance(surfaces.description.color),luminance(surfaces.details.background))+.05);
      assert.ok(detailContrast>=4.5, `${theme}: full mod description should remain readable`);
    }
    console.log(`Theme-matched mod selection and description dialogs passed for ${themes.length} themes.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
