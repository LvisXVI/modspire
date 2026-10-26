const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

// Liquid Glass landing page (docs/index.html): launch animation, release metadata,
// demo route, showcase tabs, readable glass text and reflow at desktop and phone widths.
(async () => {
  const root = path.resolve(__dirname, '..'), evidence = path.join(root, 'work', 'landing');
  fs.mkdirSync(evidence, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [1440, 390, 320]) {
      const page = await browser.newPage({ viewport: { width, height: 960 } });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.route('https://api.github.com/**', route => route.abort());
      await page.goto(pathToFileURL(path.join(root, 'docs', 'index.html')).href);
      await page.waitForFunction(() => document.documentElement.classList.contains('ready'), null, { timeout: 8000 });
      await page.waitForFunction(() => !document.getElementById('lg-intro'), null, { timeout: 4000 });
      const meta = await page.locator('script[type="application/ld+json"]').textContent().then(JSON.parse);
      assert.match(meta.softwareVersion, /^\d+\.\d+\.\d+$/, 'structured data names a concrete version');
      assert.match(await page.locator('[data-release-download]').first().getAttribute('href'), /^https:\/\/github\.com\/LvisXVI\/modspire\/releases\//, 'download goes to GitHub releases');
      assert.equal(await page.locator('a[href="demo/#demo"]').count() > 0, true, 'the interactive demo stays reachable');
      assert.equal(await page.locator('.switch a[aria-current="page"]').textContent(), 'Modspire');
      const tabs = page.locator('[data-showcase] [role="tab"]');
      assert.equal(await tabs.count(), 5, 'all five app areas are in the showcase');
      await page.locator('#tour').scrollIntoViewIfNeeded();
      await tabs.nth(2).click();
      assert.equal(await tabs.nth(2).getAttribute('aria-selected'), 'true');
      await page.waitForFunction(() => document.querySelector('.stage img').src.includes('pack-lab'));
      const contrast = await page.locator('#new .card p').first().evaluate(element => {
        const rgb = value => value.match(/[\d.]+/g).slice(0, 3).map(Number);
        const lum = v => v.map(c => { c /= 255; return c <= .04045 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4); }).reduce((s, c, i) => s + c * [.2126, .7152, .0722][i], 0);
        const fg = lum(rgb(getComputedStyle(element).color)), bg = lum([12, 20, 34]);
        return (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05);
      });
      assert.ok(contrast >= 4.5, `card copy stays readable on dark glass at ${width}px (${contrast.toFixed(2)})`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `no horizontal overflow at ${width}px`);
      if (width !== 320) await page.screenshot({ path: path.join(evidence, `landing-${width}.png`) });
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log('Landing: launch animation, release links, demo route, showcase tabs, readable glass copy and reflow passed at 1440/390/320px.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
