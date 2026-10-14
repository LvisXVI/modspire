const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

// Run with Playwright available in NODE_PATH. The watchdog lives outside the
// renderer so a microtask loop cannot stall the regression test indefinitely.
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const watchdog = setTimeout(() => {
    console.error('FAIL: renderer stopped responding (translation observer loop)');
    browser.close().finally(() => process.exit(1));
  }, 20000);
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://workshop.test/', route => route.fulfill({
      contentType: 'text/html',
      body: '<html><body><button id="language-toggle"></button><div id="dynamic"></div></body></html>',
    }));
    await page.goto('https://workshop.test/');
    let source = fs.readFileSync(path.join(__dirname, '..', 'i18n.js'), 'utf8');
    if (process.argv.includes('--baseline')) {
      source = source.replace('if (next !== current) node.nodeValue = next;', 'node.nodeValue = next;');
    }
    await page.addScriptTag({ content: source });
    await page.evaluate(() => document.dispatchEvent(new Event('DOMContentLoaded')));
    const result = await page.evaluate(async () => {
      const wait = () => new Promise(resolve => setTimeout(resolve, 60));
      let mutations = 0;
      const monitor = new MutationObserver(records => { mutations += records.length; });
      monitor.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
      const dynamic = document.getElementById('dynamic');
      dynamic.innerHTML = '<button title="Design-Editor öffnen">Neues Modpack</button>';
      await wait();
      window.workshopI18n.setLocale('en');
      await wait();
      const english = dynamic.textContent;
      const button = dynamic.firstElementChild;
      button.removeAttribute('title');
      await wait();
      const removedTitle = !button.hasAttribute('title');
      button.firstChild.nodeValue = 'Speichern';
      await wait();
      const translatedDynamic = button.textContent;
      window.workshopI18n.setLocale('de');
      await wait();
      const german = button.textContent;
      const beforeIdle = mutations;
      await wait();
      monitor.disconnect();
      return { english, german, translatedDynamic, removedTitle, idleMutations: mutations - beforeIdle, mutations };
    });
    assert.equal(result.english, 'New modpack');
    assert.equal(result.translatedDynamic, 'Save');
    assert.equal(result.german, 'Speichern');
    assert.equal(result.removedTitle, true, 'removed tooltip attributes must stay removed');
    assert.equal(result.idleMutations, 0, 'translation must settle without an observer loop');
    assert.ok(result.mutations < 100);
    assert.deepEqual(errors, []);
    console.log('Translation regression passed:', JSON.stringify(result));
  } finally {
    clearTimeout(watchdog);
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
