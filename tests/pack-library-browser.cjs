const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.setContent('<main><section id="pack-library-panel"></section><section id="snapshot-comparison"></section><div id="cards"><article data-mod-details="0"><div class="mod-name">Sodium</div><button id="existing">Details</button></article></div><div id="selected"><div class="selected-mod"><div class="selected-mod-copy">Sodium</div><button data-remove="0">Remove</button></div></div><p id="status" role="status"></p></main>');
    for (const filename of ['styles.css', 'visual-fixes.css', 'modern-ui.css', 'v3-ui.css', 'v4-ui.css', 'desktop-polish.css']) await page.addStyleTag({ path: path.join(__dirname, '..', filename) });
    await page.addStyleTag({ path: path.join(__dirname, '..', 'pack-library.css') });
    await page.addScriptTag({ path: path.join(__dirname, '..', 'pack-library.js') });
    await page.evaluate(async () => {
      window.locale = 'en'; window.bookmarks = []; window.cardOpened = 0; window.existingClicked = 0;
      window.candidate = { id: 'sodium', provider: 'modrinth', title: 'Sodium <img src=x onerror=alert(1)>', compatibility: '1.21.1 · fabric', versionId: 'v1', minecraftVersion: '1.21.1', loader: 'fabric' };
      window.project = { id: 'one', name: 'Friends', minecraftVersion: '1.21.1', loader: 'fabric', mods: [], snapshots: [] };
      document.querySelector('article').onclick = () => window.cardOpened++;
      document.querySelector('#existing').onclick = event => { event.stopPropagation(); window.existingClicked++; };
      window.bridge = {
        getProject: () => project, getLocale: () => locale, listBookmarks: async () => bookmarks,
        saveBookmark: async ({ mod, note }) => { const key = `${mod.provider}:${mod.id}`; const entry = { key, mod, note, createdAt: '2026-10-19T10:00:00Z', updatedAt: '2026-10-19T10:00:00Z' }; bookmarks = [...bookmarks.filter(item => item.key !== key), entry]; return entry; },
        deleteBookmark: async key => { bookmarks = bookmarks.filter(item => item.key !== key); },
        addMod: async mod => { project.mods.push(mod); }, status: value => document.querySelector('#status').textContent = value
      };
      await WorkshopPackLibrary.init(bridge);
      WorkshopPackLibrary.decorate(document.querySelector('#cards'), [candidate]);
      WorkshopPackLibrary.decorate(document.querySelector('#cards'), [candidate]);
      WorkshopPackLibrary.decorate(document.querySelector('#selected'), [candidate]);
    });
    assert.ok((await page.locator('#snapshot-comparison').textContent()).includes('at least two'));
    assert.equal(await page.locator('#cards [data-bookmark-toggle]').count(), 1, 'redecoration cannot duplicate star controls');
    const star = page.locator('#cards [data-bookmark-toggle]');
    await star.click();
    await page.waitForFunction(() => document.querySelector('#cards [data-bookmark-toggle]').getAttribute('aria-pressed') === 'true');
    assert.equal(await page.evaluate(() => cardOpened), 0, 'bookmark clicks must not open cards');
    assert.equal(await page.locator('#selected [data-bookmark-toggle]').getAttribute('aria-pressed'), 'true', 'all copies of the mod reflect its saved state');
    assert.equal(await page.locator('#pack-library-panel img').count(), 0, 'untrusted titles must be rendered as text');
    assert.ok((await page.locator('#pack-library-panel').textContent()).includes('1.21.1 · fabric'));
    await page.locator('#existing').click(); assert.equal(await page.evaluate(() => existingClicked), 1);
    await page.getByLabel('Note for Sodium', { exact: false }).fill('Fast renderer <script>bad()</script>');
    await page.getByRole('button', { name: 'Save note' }).click();
    assert.equal(await page.locator('#pack-library-panel textarea').getAttribute('maxlength'),'1000','UI note limit matches persistent storage');
    await page.waitForFunction(() => bookmarks[0]?.note === 'Fast renderer <script>bad()</script>');
    await page.getByLabel('Note for Sodium', { exact: false }).fill('Unsaved note kept while choosing mods');
    await page.evaluate(async () => { await WorkshopPackLibrary.render(); });
    assert.equal(await page.getByLabel('Note for Sodium', { exact: false }).inputValue(), 'Unsaved note kept while choosing mods', 'background selection renders must not erase note drafts');
    await page.getByRole('button', { name: 'Save note' }).click();
    await page.waitForFunction(() => bookmarks[0]?.note === 'Unsaved note kept while choosing mods');
    await page.evaluate(() => {
      window.immediateSave = bridge.saveBookmark;
      bridge.saveBookmark = entry => new Promise(resolve => window.finishNote = async () => resolve(await immediateSave(entry)));
    });
    await page.getByLabel('Note for Sodium', { exact: false }).fill('First edit being saved');
    await page.getByRole('button', { name: 'Save note' }).click();
    await page.getByLabel('Note for Sodium', { exact: false }).fill('Newer edit while save is pending');
    await page.evaluate(async () => { await WorkshopPackLibrary.render(); await finishNote(); });
    await page.waitForFunction(() => !document.querySelector('#pack-library-panel button').disabled);
    assert.equal(await page.getByLabel('Note for Sodium', { exact: false }).inputValue(), 'Newer edit while save is pending', 'a completing save must not clear a newer unsaved edit');
    await page.evaluate(() => { bridge.saveBookmark = immediateSave; });
    await page.getByRole('button', { name: 'Save note' }).click();
    await page.waitForFunction(() => bookmarks[0]?.note === 'Newer edit while save is pending');
    for (const mode of ['classic', 'modern', 'v3', 'v4']) {
      await page.evaluate(mode => { document.body.className = 'ui-' + mode; document.body.dataset.ui = mode; document.body.dataset.theme = 'blue'; }, mode);
      await page.locator('#pack-library-panel textarea').evaluate(async field => { getComputedStyle(field).backgroundColor; await Promise.all(field.getAnimations().map(animation => animation.finished.catch(() => {}))); });
      const contrast = await page.locator('#pack-library-panel textarea').evaluate(field => {
        const style = getComputedStyle(field), color = value => value.match(/[\d.]+/g).slice(0, 3).map(Number);
        const luminance = rgb => rgb.map(c => { c /= 255; return c <= .04045 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4); }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
        const a = luminance(color(style.color)), b = luminance(color(style.backgroundColor)); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
      });
      assert.ok(contrast >= 4.5, `${mode}: note text must remain readable (contrast ${contrast.toFixed(2)})`);
      assert.equal(await page.getByRole('button', { name: 'Save note' }).isVisible(), true, `${mode}: library actions are visible`);
      assert.equal(await star.isVisible(), true, `${mode}: bookmark stars are visible`);
    }
    await page.evaluate(async () => { project = { ...project, id: 'two', loader: 'neoforge', mods: [] }; await WorkshopPackLibrary.render(); });
    assert.equal(await page.getByLabel('Note for Sodium', { exact: false }).inputValue(), 'Newer edit while save is pending', 'notes are cross-pack and survive rerender');
    assert.ok((await page.locator('#pack-library-panel').textContent()).includes('Check compatibility'), 'a saved mod from another setup cannot claim compatibility');
    await page.getByRole('button', { name: 'Add to current pack' }).click();
    await page.waitForFunction(() => project.mods.length === 1);
    assert.equal(await page.getByRole('button', { name: 'Already in pack' }).isDisabled(), true);
    await page.evaluate(async () => {
      const make = (id, versionId) => ({ id, provider: 'modrinth', title: id === 'a' ? '<script>danger</script>' : id, versionId });
      project.snapshots = [
        { id: 'old', name: 'Old <img src=x>', data: { loader: 'fabric', minecraftVersion: '1.21.1', mods: [make('a', 'one')] } },
        { id: 'mid', name: 'Middle', data: { loader: 'fabric', minecraftVersion: '1.21.1', mods: [make('a', 'one'), make('b', 'b1')] } },
        { id: 'new', name: 'New', data: { loader: 'neoforge', minecraftVersion: '1.21.2', mods: [make('a', 'two'), make('c', 'c1')] } }
      ];
      await WorkshopPackLibrary.render(); WorkshopPackLibrary.openComparison();
    });
    await page.getByLabel('Snapshot A', { exact: true }).selectOption('old');
    await page.getByLabel('Snapshot B', { exact: true }).selectOption('new');
    const comparison = page.locator('[data-snapshot-results]');
    assert.ok((await comparison.textContent()).includes('one → two'));
    assert.ok((await comparison.textContent()).includes('fabric → neoforge'));
    assert.ok((await comparison.textContent()).includes('1.21.1 → 1.21.2'));
    assert.equal(await page.locator('#snapshot-comparison script,#snapshot-comparison img').count(), 0);
    await page.getByLabel('Snapshot A', { exact: true }).selectOption('new');
    await page.getByLabel('Snapshot B', { exact: true }).selectOption('old');
    assert.ok((await comparison.textContent()).includes('two → one'), 'users can compare any two snapshots in either direction');
    await page.evaluate(async () => { locale = 'de'; await WorkshopPackLibrary.render(); });
    assert.equal(await page.getByRole('button', { name: 'Notiz speichern' }).count(), 1);
    assert.ok((await page.locator('#snapshot-comparison').textContent()).includes('Versionen geändert'));
    await page.locator('#cards [data-bookmark-toggle]').focus(); await page.keyboard.press('Enter');
    await page.waitForFunction(() => bookmarks.length === 0);
    assert.equal(await page.evaluate(() => cardOpened), 0, 'keyboard bookmark use cannot trigger card navigation');
    await page.evaluate(async () => { bridge.listBookmarks = async () => { throw new Error('disk unavailable'); }; await WorkshopPackLibrary.render({ refresh: true }); });
    assert.ok((await page.locator('#pack-library-panel').textContent()).includes('erneut'), 'load errors need a recoverable local message');
    await page.evaluate(async () => { bridge.listBookmarks = async () => bookmarks; await WorkshopPackLibrary.render({ refresh: true }); });
    assert.equal(await page.getByRole('button', { name: 'Notiz speichern' }).count(), 0);
    await page.evaluate(async () => {
      window.libraryReads = 0; bridge.listBookmarks = async () => { libraryReads++; return bookmarks; };
      await WorkshopPackLibrary.render(); await WorkshopPackLibrary.render();
    });
    assert.equal(await page.evaluate(() => libraryReads), 0, 'selection renders must not repeatedly read persistent storage');
    await page.evaluate(() => { bridge.saveBookmark = async () => { throw new Error('read only'); }; });
    await page.locator('#cards [data-bookmark-toggle]').click();
    await page.waitForFunction(() => document.querySelector('#pack-library-panel [role=alert]'));
    assert.equal(await page.locator('#cards [data-bookmark-toggle]').getAttribute('aria-pressed'), 'false', 'failed writes cannot display an unsaved bookmark as saved');
    assert.equal(await page.locator('#cards [data-bookmark-toggle]').isDisabled(), false, 'failed writes must release controls for retry');
    await page.evaluate(async () => {
      window.slowRead = new Promise(resolve => window.finishRead = resolve);
      bridge.listBookmarks = () => slowRead;
      window.oldRefresh = WorkshopPackLibrary.render({ refresh: true });
      bridge.listBookmarks = async () => [];
      await WorkshopPackLibrary.render({ refresh: true });
      finishRead([{ key: 'modrinth:stale', mod: { id: 'stale', provider: 'modrinth', title: 'Stale bookmark' }, note: 'old' }]);
      await oldRefresh;
    });
    assert.equal(await page.locator('[data-library-key]').count(), 0, 'late reads cannot overwrite newer library results');
    assert.deepEqual(errors, []);
    console.log('Library UI: stars, keyboard isolation, cross-pack notes, setup context, adding, translations, arbitrary snapshot pairs, safe text and recoverable failures passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
