const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    const root = path.resolve(__dirname, '..');
    const renderer = fs.readFileSync(path.join(root, 'renderer.js'), 'utf8');
    const start = renderer.indexOf('function modCardMarkup(');
    const end = renderer.indexOf('\nfunction togglePackMod(', start);
    assert.ok(start >= 0 && end > start, 'mod card renderer and details dialog should exist');
    const cardFunctions = renderer.slice(start, end).replace(/function togglePackMod\([\s\S]*$/, '');
    await page.setContent(`<!doctype html><html><body data-theme="blue">
      <div id="mod-results" class="mod-results"></div>
      <section class="design-overlay mod-details-overlay" id="mod-details-overlay" hidden><article class="design-card mod-details-card">
        <header class="mod-details-header"><img id="mod-details-icon" hidden><div><div id="mod-details-source"></div><h2 id="mod-details-title"></h2></div></header>
        <div class="mod-details-meta"><span id="mod-details-author"></span><span id="mod-details-downloads"></span><span id="mod-details-compatibility"></span></div>
        <div class="mod-details-description-wrap"><h3 id="mod-details-description-heading"></h3><p id="mod-details-description"></p><small id="mod-details-description-status"></small></div>
        <a id="mod-details-link" hidden></a><button id="mod-details-add"></button>
      </article></section>
    </body></html>`);
    await page.addStyleTag({ path: path.join(root, 'styles.css') });
    await page.addStyleTag({ path: path.join(root, 'visual-fixes.css') });
    await page.evaluate(source => {
      window.state = { project: { mods: [] } };
      window.workshopI18n = { locale: 'de' };
      window.workshop = { getModDetails: async () => ({ description: 'Vollständiger Text\n\nMit mehreren Absätzen und allen wichtigen Informationen.' }) };
      window.safe = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
      window.safeModPreview = value => { try { const url = new URL(String(value || '')); return url.protocol === 'https:' && ['cdn.modrinth.com', 'media.forgecdn.net'].includes(url.hostname) ? url.href : ''; } catch { return ''; } };
      window.formatDownloads = value => String(value);
      window.$ = id => document.getElementById(id);
      window.requestAnimationFrame = callback => setTimeout(callback, 0);
      window.openModPreview = () => {};
      window.togglePackMod = (items, index) => { const mod = items[index]; window.state.project.mods.push(mod); };
      window.addPackMods = () => {};
      const getFunctions = new Function(`${source}; return { modCardMarkup, renderModCards, openModDetails };`);
      Object.assign(window, getFunctions());
    }, cardFunctions);
    const mod = {
      id: 'long-title-example', provider: 'modrinth', title: 'A very long mod title that should wrap cleanly without colliding with the plus action',
      summary: 'Short preview summary', author: 'Example author', downloads: 123456, icon: 'https://cdn.modrinth.com/data/icon.png',
      gallery: ['https://cdn.modrinth.com/data/one.png', 'https://cdn.modrinth.com/data/two.png', 'https://cdn.modrinth.com/data/three.png'],
      url: 'https://modrinth.com/mod/example', compatibility: '1.21.1 · Fabric', source: 'Modrinth'
    };
    await page.evaluate(mod => {
      window.testItems = [mod];
      window.renderModCards(document.querySelector('#mod-results'), window.testItems);
    }, mod);
    const card = page.locator('.mod-card');
    const plus = page.locator('.add-mod');
    assert.equal(await card.count(), 1);
    assert.equal(await plus.evaluate(node => getComputedStyle(node).placeItems), 'center');
    const plusAlignment = await plus.evaluate(node => { const button = node.getBoundingClientRect(), range = document.createRange(); range.selectNodeContents(node); const glyph = range.getBoundingClientRect(); return { dx: Math.abs((button.left + button.right) / 2 - (glyph.left + glyph.right) / 2), dy: Math.abs((button.top + button.bottom) / 2 - (glyph.top + glyph.bottom) / 2) }; });
    assert.ok(plusAlignment.dx <= 3 && plusAlignment.dy <= 4, `plus glyph should sit centrally inside its round button: ${JSON.stringify(plusAlignment)}`);
    const layout = await page.evaluate(() => {
      const card = document.querySelector('.mod-card'), main = card.querySelector('.mod-card-main');
      const plus = card.querySelector('.add-mod'), title = card.querySelector('.mod-name strong');
      const a = main.getBoundingClientRect(), b = plus.getBoundingClientRect(), t = title.getBoundingClientRect();
      return { cardWidth: card.clientWidth, mainRight: a.right, plusLeft: b.left, titleRight: t.right, mainScrollWidth: main.scrollWidth, mainClientWidth: main.clientWidth };
    });
    assert.ok(layout.mainRight <= layout.plusLeft + 1, 'the text column must not overlap the add button');
    assert.ok(layout.mainScrollWidth <= layout.mainClientWidth + 1, 'long mod names must wrap rather than overflow');
    const galleryContainment = await page.locator('.mod-card').evaluate(node => {
      const gallery=node.querySelector('.mod-gallery-carousel').getBoundingClientRect(),card=node.getBoundingClientRect();
      return {overflow:getComputedStyle(node).overflow,withinCard:gallery.left>=card.left&&gallery.right<=card.right&&gallery.top>=card.top&&gallery.bottom<=card.bottom};
    });
    assert.equal(galleryContainment.overflow,'hidden','a mod card must clip content to its own rounded surface');
    assert.equal(galleryContainment.withinCard,true,'a mod screenshot must remain within its card instead of covering the pack tray');
    await page.locator('.mod-name strong').click();
    await page.waitForTimeout(100);
    const detailsState = await page.evaluate(() => ({ hidden: document.querySelector('#mod-details-overlay').hidden, text: document.querySelector('#mod-details-description').textContent, status: document.querySelector('#mod-details-description-status').textContent }));
    assert.ok(detailsState.text.includes('Vollständiger Text'), `click should fetch full details: ${JSON.stringify({ detailsState, pageErrors })}`);
    assert.equal(await page.locator('#mod-details-overlay').isHidden(), false, 'clicking the card should open full details');
    assert.equal(await page.locator('#mod-details-description').textContent(), 'Vollständiger Text\n\nMit mehreren Absätzen und allen wichtigen Informationen.');
    await page.locator('#mod-details-overlay').evaluate(node => { node.hidden = true; });
    await plus.click();
    assert.equal(await page.locator('#mod-details-overlay').isHidden(), true, 'the plus button should not open the details dialog');
    assert.equal(await page.evaluate(() => window.state.project.mods.length), 1, 'the plus button should still add the mod');
    assert.deepEqual(pageErrors, [], 'mod card interactions must not create browser errors');
    console.log('Mod cards: readable grid, centered add control, full description click, and add-button separation passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
