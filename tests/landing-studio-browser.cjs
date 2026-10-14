const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

(async () => {
  const root = path.resolve(__dirname, '..');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const viewport of [{ width: 1440, height: 960 }, { width: 1024, height: 900 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('https://api.github.com/**', route => route.abort());
      await page.goto(pathToFileURL(path.join(root, 'docs', 'index.html')).href);

      const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      assert.ok(pageWidth <= viewport.width + 1, `no horizontal page overflow at ${viewport.width}px (${pageWidth}px)`);
      await page.locator('#demo').scrollIntoViewIfNeeded();
      const sidebar = await page.locator('.demo-sidebar').evaluate(element => ({
        direction: getComputedStyle(element).flexDirection,
        tabWidths: [...element.querySelectorAll('.demo-tab')].map(tab => tab.getBoundingClientRect().width),
      }));
      assert.equal(sidebar.direction, viewport.width <= 760 ? 'row' : 'column');
      assert.ok(sidebar.tabWidths.every(width => width >= 70), `all demo sections stay readable at ${viewport.width}px`);

      await page.getByRole('tab', { name: /Mod search/ }).click();
      await page.locator('#demo-search-input').fill('Terralith');
      assert.ok(await page.locator('#demo-results .demo-mod').count() > 0, 'sample catalog filters immediately');

      await page.keyboard.press('Control+k');
      assert.equal(await page.locator('#command-dialog').evaluate(dialog => dialog.open), true, 'Ctrl+K opens the command menu');
      await page.locator('#command-filter').fill('search');
      assert.equal(await page.locator('.command-item:visible').count(), 1, 'command menu filters its actions');
      await page.locator('.command-item:visible').click();
      await page.waitForTimeout(380);
      assert.equal(await page.locator('#demo-tab-search').getAttribute('aria-selected'), 'true', 'search command opens the catalog view');

      await page.locator('#showcase').scrollIntoViewIfNeeded();
      await page.waitForFunction(() => {
        const image = document.querySelector('.bento-inspector img');
        return image.complete && image.naturalWidth > 0;
      });
      const inspector = await page.locator('.bento-inspector').evaluate(card => ({
        cardHeight: card.getBoundingClientRect().height,
        blankBelow: card.getBoundingClientRect().bottom - card.querySelector('.inspector-readout').getBoundingClientRect().bottom,
        imageComplete: card.querySelector('img').complete && card.querySelector('img').naturalWidth > 0,
      }));
      assert.ok(inspector.blankBelow < 35, `Pack Lab inspector uses its tall bento area (empty space: ${inspector.blankBelow}px)`);
      assert.ok(inspector.imageComplete, 'Pack Lab screenshot loads');
      assert.deepEqual(errors, [], `no browser errors at ${viewport.width}px`);
      await page.close();
    }
    console.log('Studio landing: responsive demo, keyboard command menu, live sample filtering, Pack Lab showcase, and overflow passed at 1440/1024/390px.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
