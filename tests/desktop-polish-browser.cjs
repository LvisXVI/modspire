const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron } = require('playwright');

(async () => {
  const root = path.resolve(__dirname, '..');
  const tempRoot = path.resolve(os.tmpdir());
  const profile = fs.mkdtempSync(path.join(tempRoot, 'modspire-desktop-polish-'));
  const runner = path.join(root, `.desktop-polish-${path.basename(profile)}.cjs`);
  fs.writeFileSync(runner, `const {app}=require('electron');app.setPath('userData',${JSON.stringify(profile)});require(${JSON.stringify(path.join(root,'main.cjs'))});`);
  let app;
  try {
    app = await _electron.launch({ args: [runner], timeout: 20000 });
    const page = await app.firstWindow();
    await page.waitForSelector('#mod-search-clear', { state: 'attached' });
    await page.evaluate(() => {
      for (const [key, value] of Object.entries({ 'mw-demo-mode':'true', 'mw-local-model-notice-seen':'yes', 'mw-curseforge-notice-seen':'yes', 'mw-language':'en', 'mw-ui-mode':'classic' })) localStorage.setItem(key, value);
    });
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#mod-search') && document.body.dataset.ui === 'classic');
    await page.route('https://api.modrinth.com/**', route => route.fulfill({ json: { hits: [], offset: 0, limit: 48, total_hits: 0 } }));

    await page.keyboard.press('Control+k');
    assert.equal(await page.locator('#mod-search').evaluate(node => node === document.activeElement), true, 'Ctrl+K opens Mod search and focuses its search field');
    await page.locator('#mod-search').fill('Terralith');
    assert.equal(await page.locator('#mod-search-clear').isVisible(), true, 'inline clear appears when the search has text');
    await page.locator('#mod-search-clear').click();
    assert.equal(await page.locator('#mod-search').inputValue(), '', 'inline clear empties the search');
    assert.equal(await page.locator('#mod-search-clear').isVisible(), false, 'inline clear hides after clearing');
    await page.locator('#nav-chat').click();
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press('/');
    assert.equal(await page.locator('#mod-search').evaluate(node => node === document.activeElement), true, 'slash focuses search outside text fields');

    for (const mode of ['modern', 'v3', 'v4', 'classic']) {
      await page.locator('#sidebar-ui-mode').click();
      await page.locator(`#ui-mode-${mode}`).click();
      assert.equal(await page.locator('body').getAttribute('data-ui'), mode, `${mode} layout remains selectable`);
      assert.equal(await page.locator('.desktop-search-shortcut').getAttribute('aria-hidden'), 'true', 'keyboard badge stays decorative for assistive technology');
      const focusColor = await page.locator('body').evaluate(node => getComputedStyle(node).getPropertyValue('--desktop-focus').trim());
      assert.ok(focusColor, `${mode} supplies a theme-matched focus color`);
      await page.locator('#nav-chat').click();
      assert.equal(await page.locator('#chat-panel').isVisible(), true, `${mode} keeps the shared Pack Assistant available`);
      await page.locator('#nav-mods').click();
      assert.equal(await page.locator('#mods-panel').isVisible(), true, `${mode} keeps the Modrinth catalog available`);
      await page.locator('#nav-lab').click();
      assert.equal(await page.locator('#lab-panel').isVisible(), true, `${mode} keeps Pack Lab available`);
    }
    console.log('Desktop polish: Ctrl+K and slash search, inline clear, theme-aware focus, and all four preserved workspaces passed.');
  } finally {
    if (app) await app.close();
    fs.rmSync(runner, { force: true });
    const resolvedProfile = path.resolve(profile);
    if (resolvedProfile.startsWith(`${tempRoot}${path.sep}`)) fs.rmSync(resolvedProfile, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
