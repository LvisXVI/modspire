const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const root = path.resolve(__dirname, '..');
  const styles = ['styles.css', 'visual-fixes.css', 'modern-ui.css', 'v3-ui.css']
    .map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.setContent('<body><div class="ui-mode-overlay"><div class="ui-mode-card"><header><h2>Design wählen</h2></header><div class="ui-mode-options"><button class="ui-mode-option" id="ui-mode-classic"><strong>Classic</strong></button><button class="ui-mode-option" id="ui-mode-modern"><strong>Modern</strong></button><button class="ui-mode-option" id="ui-mode-v3"><strong>UI 3</strong></button><button class="ui-mode-option" id="ui-mode-v4"><strong>UI 4 · Deep Grove</strong></button></div><section id="v3-appearance" hidden></section></div></div></body>');
    await page.addStyleTag({ content: styles });
    await page.evaluate(() => { document.body.className = 'ui-v3'; document.body.dataset.theme = 'translucent'; document.documentElement.style.setProperty('--v3-accent', '#67dcb0'); document.documentElement.style.setProperty('--v3-line', '#31534a'); });
    const options = page.locator('.ui-mode-options:has(#ui-mode-v4)');
    const geometry = await options.evaluate(node => ({ columns: getComputedStyle(node).gridTemplateColumns.split(' ').length, cards: [...node.children].map(el => ({ id: el.id, width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height })) }));
    assert.equal(geometry.columns, 4, `All four design choices are shown together on wide desktop: ${JSON.stringify(geometry)}`);
    const v4 = geometry.cards.find(card => card.id === 'ui-mode-v4');
    assert.ok(v4 && v4.width > 200 && v4.height > 50, `UI 4 is a full-size selectable tile: ${JSON.stringify(v4)}`);
    const borders = await page.locator('.ui-mode-option').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).borderColor));
    assert.notEqual(borders[3], borders[0], 'UI 4 has a distinct accent');
    console.log('UI 4 is visible as a full-size, highlighted fourth tile alongside the other modes.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
