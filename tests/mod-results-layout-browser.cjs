const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const root = path.resolve(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const renderer = fs.readFileSync(path.join(root, 'renderer.js'), 'utf8');
  const css = `${fs.readFileSync(path.join(root, 'styles.css'), 'utf8')}\n${fs.readFileSync(path.join(root, 'visual-fixes.css'), 'utf8')}`;

  assert.match(html, /id="mod-results-layout"/, 'catalog should expose a list/cards view switch');
  assert.match(html, /class="mod-results-toolbar"[\s\S]*?id="catalog-sort"/, 'catalog sort should be visible without opening advanced filters');
  assert.match(renderer, /function setModResultsLayout\(/, 'layout changes should be handled by the renderer');
  assert.match(renderer, /function sortModResultItems\(/, 'catalog results should support client-side sorting');
  assert.match(css, /#mod-results\[data-layout="list"\]/, 'list mode needs a dedicated compact layout');

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    await page.setContent(`<!doctype html><html><body><section id="mods-panel"><div class="mod-results" id="mod-results"><article class="mod-card"><div class="mod-card-icon-wrap"></div><div class="mod-card-main"><div class="mod-name"><strong>Readable mod</strong></div></div><button class="add-mod">+</button></article></div><div id="mod-results-layout"><button type="button" data-mod-layout="list">List</button><button type="button" data-mod-layout="cards">Cards</button></div></section></body></html>`);
    await page.addStyleTag({ content: css });
    const fnStart = renderer.indexOf('function setModResultsLayout(');
    const fnEnd = renderer.indexOf('\nfunction ', fnStart + 12);
    assert.ok(fnStart >= 0 && fnEnd > fnStart, 'layout setter must be a standalone function');
    await page.evaluate(source => {
      const storage = new Map();
      Object.defineProperty(window, 'localStorage', { configurable: true, value: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)) } });
      window.localStorage.setItem('mw-mod-results-layout', 'cards');
      window.setModResultsLayout = new Function(`${source}; return setModResultsLayout;`)();
      document.querySelectorAll('[data-mod-layout]').forEach(button => button.addEventListener('click', () => window.setModResultsLayout(button.dataset.modLayout)));
      window.setModResultsLayout('cards');
    }, renderer.slice(fnStart, fnEnd));
    await page.locator('[data-mod-layout="list"]').click();
    const listState = await page.evaluate(() => ({
      layout: document.querySelector('#mod-results').dataset.layout,
      stored: window.localStorage.getItem('mw-mod-results-layout'),
      pressed: document.querySelector('[data-mod-layout="list"]').getAttribute('aria-pressed'),
      cardWidth: document.querySelector('.mod-card').getBoundingClientRect().width,
      resultWidth: document.querySelector('#mod-results').getBoundingClientRect().width
    }));
    assert.equal(listState.layout, 'list');
    assert.equal(listState.stored, 'list');
    assert.equal(listState.pressed, 'true');
    assert.ok(listState.cardWidth > listState.resultWidth * 0.8, `list items should use the available width: ${JSON.stringify(listState)}`);
    await page.locator('[data-mod-layout="cards"]').click();
    assert.equal(await page.locator('#mod-results').getAttribute('data-layout'), 'cards');
    const sortStart = renderer.indexOf('function sortModResultItems(');
    const sortEnd = renderer.indexOf('\nfunction ', sortStart + 12);
    assert.ok(sortStart >= 0 && sortEnd > sortStart, 'sort helper must be a standalone function');
    const ranked = await page.evaluate(source => {
      const sort = new Function(`${source}; return sortModResultItems;`)();
      return sort([{ title: 'Small', downloads: 5 }, { title: 'Popular', downloads: 900 }], 'downloads').map(item => item.title);
    }, renderer.slice(sortStart, sortEnd));
    assert.deepEqual(ranked, ['Popular', 'Small'], 'downloads sort should put the most-downloaded mod first');
  } finally { await browser.close(); }
  console.log('Mod result layout: persistent list/cards toggle and full-width list rows passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
