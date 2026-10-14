const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

(async () => {
  const root = path.resolve(__dirname, '..');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 920 } });
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.route('https://api.github.com/**', route => route.abort());
    await page.goto(pathToFileURL(path.join(root, 'docs', 'index.html')).href);

    await page.locator('#demo').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelector('.demo-shell').classList.contains('is-visible'));
    await page.getByRole('tab', { name: /Mod search/ }).click();
    assert.equal(await page.locator('#demo-tab-search').getAttribute('aria-selected'), 'true');
    assert.equal(await page.locator('#demo-view-search').evaluate(node => getComputedStyle(node).animationName), 'panel-arrive', 'demo panels animate into view when selected');

    await page.getByRole('tab', { name: 'Overview' }).click();
    await page.locator('[data-demo-add="Terralith"]').click();
    assert.equal(await page.locator('#demo-pack-count').textContent(), '2 mods selected');
    await page.getByRole('tab', { name: /Mod search/ }).click();
    await page.locator('#demo-results .demo-mod').filter({ hasText: 'Tectonic' }).locator('button').click();
    assert.equal(await page.locator('#demo-pack-count').textContent(), '3 mods selected');
    assert.equal(await page.locator('#demo-pack-tray .demo-pack-item').last().evaluate(node => getComputedStyle(node).animationName), 'demo-chip-in', 'pack additions receive a small entry animation');

    await page.getByRole('tab', { name: 'Designs' }).click();
    await page.locator('[data-demo-theme="End Rift"]').click();
    assert.equal(await page.locator('#demo-theme-status').textContent(), 'End Rift selected');
    assert.equal(await page.locator('[data-demo-theme="End Rift"]').getAttribute('aria-pressed'), 'true');

    await page.getByRole('tab', { name: 'Pack Assistant' }).click();
    await page.locator('#demo-prompt-input').fill('More exploration and biomes');
    await page.locator('#demo-prompt button[type="submit"]').click();
    assert.equal(await page.locator('.demo-message').count(), 3, 'the demo assistant adds both the prompt and its sample reply to the initial example');
    assert.equal(await page.locator('.demo-message').last().evaluate(node => getComputedStyle(node).animationName), 'demo-message-in');

    await page.evaluate(() => {
      document.documentElement.style.scrollBehavior = 'auto';
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
    });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const scrollScale = await page.locator('#scroll-progress').evaluate(node => Number(node.style.transform.match(/scaleX\(([^)]+)\)/)?.[1] ?? 0));
    assert.ok(scrollScale > .95, `scroll progress follows the page without layout-width updates: ${scrollScale}`);
    assert.ok(await page.locator('#site-nav a[aria-current="location"]').count() <= 1, 'scroll section indicator never marks multiple sections active');
    assert.deepEqual(pageErrors, [], 'page interactions and motion do not throw runtime errors');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    assert.equal(await page.locator('html').evaluate(node => getComputedStyle(node).scrollBehavior), 'auto', 'reduced-motion users retain instant, predictable navigation');
    assert.equal(await page.locator('html').evaluate(node => node.classList.contains('motion-ready')), false, 'scroll reveal animations stay disabled when reduced motion is requested');
    console.log('GitHub Pages scroll reveals, progress, active navigation, interactive demo transitions, and reduced-motion behavior passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
