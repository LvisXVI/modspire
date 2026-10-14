const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const root = path.resolve(__dirname, '..');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1347, height: 760 } });
    await page.setContent(`<!doctype html><html><body class="ui-v4" data-theme="ender"><section class="design-overlay mod-selection-overlay"><div class="design-card mod-selection-dialog"><header class="mod-selection-header"><div class="mod-selection-mark">✦</div><div class="mod-selection-heading"><div class="eyebrow">PACK-ASSISTENT</div><h2>Mods für dein Pack auswählen</h2><p>130 Vorschläge</p></div><button class="close-button">×</button></header><div class="mod-selection-body"><div id="mod-selection-results" class="mod-results mod-picker-results"><article class="mod-card"><div class="mod-card-icon-wrap"><span class="mod-icon">✦</span></div><div class="mod-card-main"><div class="mod-name"><strong>Short description</strong><span class="source-tag">Modrinth</span></div><p class="mod-desc">A short description.</p></div><button class="add-mod">+</button></article><article class="mod-card"><div class="mod-card-icon-wrap"><span class="mod-icon">✦</span></div><div class="mod-card-main"><div class="mod-name"><strong>Another short result</strong><span class="source-tag">Modrinth</span></div><p class="mod-desc">A short description.</p></div><button class="add-mod">+</button></article><article class="mod-card"><div class="mod-card-icon-wrap"><span class="mod-icon">✦</span></div><div class="mod-card-main"><div class="mod-name"><strong>Longer result</strong><span class="source-tag">Modrinth</span></div><p class="mod-desc">This longer description wraps over several lines and should make its own card taller without compressing other cards in the grid.</p></div><button class="add-mod">+</button></article></div></div><footer class="mod-selection-footer"><div class="mod-selection-summary"><div class="mod-selection-summary-heading"><strong>Deine Auswahl</strong><span>0 ausgewählt</span></div><div class="mod-selection-selected"></div></div><div class="mod-selection-actions"><button class="button">Mit KI ergänzen</button><button class="button">Später</button><button class="button">Fertig</button></div></footer></div></section></body></html>`);
    await page.addStyleTag({ content: ['styles.css', 'visual-fixes.css', 'modern-ui.css', 'v3-ui.css', 'v4-ui.css'].map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n') });
    await page.locator('.mod-card').first().evaluate(card => {
      card.classList.add('has-gallery');
      card.querySelector('.mod-card-main').insertAdjacentHTML('beforeend', '<div class="mod-gallery-carousel single-preview"><div class="mod-preview-gallery"><button class="mod-preview-tile"><img alt="Preview" src="data:image/svg+xml,%3Csvg xmlns=\"http://www.w3.org/2000/svg\" width=\"640\" height=\"360\"/%3E"></button></div></div><div class="mod-meta">Author · 1.21.1</div>');
    });
    for (const mode of ['classic', 'ui-modern', 'ui-v3', 'ui-v4']) {
      await page.locator('body').evaluate((body, className) => { body.className = className; }, mode);
      await page.locator('.mod-preview-tile').evaluate(async node=>{await Promise.all(node.getAnimations().filter(animation=>animation.effect.getTiming().iterations!==Infinity).map(animation=>animation.finished.catch(()=>{})));});
      const result = await page.locator('#mod-selection-results').evaluate(node => ({
        columns: getComputedStyle(node).gridTemplateColumns.split(' ').length,
        cards: [...node.querySelectorAll(':scope > .mod-card')].map(card => ({ height: card.getBoundingClientRect().height, minHeight: getComputedStyle(card).minHeight }))
      }));
      assert.ok(result.columns >= 1, `${mode}: picker has a valid column layout`);
      for (const [index, card] of result.cards.entries()) {
        assert.ok(card.height >= 180, `${mode}: short suggestion ${index + 1} keeps a readable card height (got ${card.height}px)`);
        if(index > 0) assert.equal(card.minHeight, '180px', `${mode}: short suggestion ${index + 1} retains the picker minimum height`);
      }
      const media = await page.locator('.has-gallery').evaluate(card => ({card:card.getBoundingClientRect().toJSON(),gallery:card.querySelector('.mod-gallery-carousel').getBoundingClientRect().toJSON()}));
      assert.ok(media.gallery.height >= 190, `${mode}: the entire preview remains visible (got ${media.gallery.height}px)`);
      assert.ok(media.gallery.bottom <= media.card.bottom, `${mode}: preview remains inside its card`);
      assert.equal(await page.locator('.mod-preview-tile').evaluate(node=>{const probe=document.createElement('div');probe.style.background='var(--dialog-inset)';document.body.append(probe);const matches=getComputedStyle(node).backgroundColor===getComputedStyle(probe).backgroundColor;probe.remove();return matches}),true,`${mode}: image letterboxing follows the active theme`);
    }
    console.log('Short-description cards keep a readable height in all four picker themes.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
