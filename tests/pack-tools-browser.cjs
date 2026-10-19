const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const root = path.resolve(__dirname, '..');
  const source = fs.readFileSync(path.join(root, 'renderer.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/i, '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('http://127.0.0.1:41997/**', route => route.fulfill({ contentType: 'text/html', body: html }));
    await page.goto('http://127.0.0.1:41997/');
    for (const file of ['styles.css', 'visual-fixes.css', 'modern-ui.css', 'v3-ui.css', 'v4-ui.css', 'desktop-polish.css']) await page.addStyleTag({ path: path.join(root, file) });
    assert.equal(await page.locator('#undo-selection').count(), 1, 'pack toolbar must expose undo');
    await page.addScriptTag({ path: path.join(root, 'pack-tools.js') });
    await page.evaluate(source => {
      window.$ = id => document.getElementById(id);
      window.state = { project: { id: 'one', name: 'Friends', minecraftVersion: '1.21.1', loader: 'fabric', provider: 'modrinth', mods: [], turns: [] }, batchSelection: new Set(), packFilter: '', dependencyGeneration: 0, compatibilityGeneration: 0 };
      window.workshopI18n = { locale: 'de' }; window.safe = value => String(value || '').replace(/[&<>"']/g, '');
      window.queueSave = () => {}; window.renderResults = () => {}; window.renderChat = () => {}; window.renderLab = () => {}; window.scheduleCompatibilityCheck = () => {}; window.recordSearchFeedback = () => {};
      window.selectMinecraftVersion = () => {}; window.setStatus = text => $('status-text').textContent = text;
      window.workshop = { resolveRequiredDependencies: () => new Promise(resolve => window.finishDependencies = resolve), writeClipboard: async text => window.clipboard = text };
      const selected = source.slice(source.indexOf('function renderSelectionHistory('), source.indexOf('\nconst labRoles='));
      const snapshots = source.slice(source.indexOf('function saveSnapshot('), source.indexOf('\nfunction diagnoseCrash('));
      Object.assign(window, new Function(selected + '\n' + snapshots + ';return {renderSelected,addPackMods,stepSelectionHistory,initPackTools,saveSnapshot,renderSnapshots,reconcilePackDependencies}')());
      initPackTools(); renderSelected();
      $('clear-selection').onclick = new Function(source.match(/\$\('clear-selection'\)\.onclick=\(\)=>\{([^\n]*)\};/)[1]);
      $('save-snapshot').onclick = () => saveSnapshot();
      document.querySelectorAll('[aria-modal="true"],.design-overlay,.settings-overlay,.test-overlay,#launch-intro,#startup-credit').forEach(node => {node.hidden = true;node.style.display='none'});
      document.body.className = 'ui-classic'; document.body.dataset.theme = 'blue';
      $('project-overview').hidden = true; $('chat-panel').hidden = true; $('lab-panel').hidden = true; $('mods-panel').hidden = false;
      $('workspace-grid').classList.add('single-view'); $('workspace-grid').dataset.view = 'mods';
      window.candidate = { id: 'a', provider: 'modrinth', title: 'Sodium', url: 'https://modrinth.com/mod/sodium', compatibility: '1.21.1 · fabric' };
    }, source);
    assert.equal(await page.locator('#undo-selection').isDisabled(), true);
    await page.evaluate(() => addPackMods([candidate]));
    await page.locator('#undo-selection').click();
    await page.evaluate(() => finishDependencies({ dependencies: [{ id: 'stale-api', provider: 'modrinth', dependency: true }] }));
    assert.equal(await page.evaluate(() => state.project.mods.length), 0, 'late dependency responses must not undo user history actions');
    await page.locator('#redo-selection').click();
    assert.deepEqual(await page.evaluate(() => state.project.mods.map(mod => mod.id)), ['a']);
    await page.locator('#clear-selection').click();
    await page.locator('#undo-selection').click();
    assert.equal(await page.locator('#selected-list').textContent().then(text => text.includes('Sodium')), true);
    await page.locator('#selected-filter').fill('Sodium');
    await page.locator('#selected-filter').press('Control+z');
    assert.equal(await page.evaluate(() => state.project.mods.length), 1, 'text undo must not change the pack');
    await page.locator('#selected-filter').blur();
    await page.locator('#copy-mod-list').click();
    assert.ok(await page.evaluate(() => clipboard.includes('https://modrinth.com/mod/sodium')));
    await page.evaluate(() => { $('mods-panel').hidden = true; $('lab-panel').hidden = false; $('workspace-grid').dataset.view = 'lab'; });
    await page.locator('#snapshot-name').fill('Performance & Magie');
    await page.locator('#save-snapshot').click();
    assert.equal(await page.evaluate(() => state.project.snapshots[0].name), 'Performance & Magie');
    assert.equal(await page.locator('#snapshot-name').inputValue(), '');
    assert.ok((await page.locator('#snapshot-list').textContent()).includes('Performance & Magie'));
    await page.evaluate(() => {addPackMods([{...candidate,id:'b',title:'Extra mod'}]);window.oldDependencyReply=finishDependencies});
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#snapshot-list .snapshot-row').last().getByRole('button').click();
    await page.evaluate(() => oldDependencyReply({dependencies:[{id:'old-api',provider:'modrinth',dependency:true}]}));
    assert.deepEqual(await page.evaluate(() => state.project.mods.map(mod=>mod.id)), ['a'], 'restoring a variant must invalidate dependency replies from the previous selection');
    await page.evaluate(() => { window.workshopI18n.locale = 'en'; renderSelected(); });
    assert.equal(await page.locator('#snapshot-name').getAttribute('aria-label'), 'Snapshot name (optional)');
    assert.equal(await page.locator('#snapshot-name-label').evaluate(node => getComputedStyle(node).color === getComputedStyle(node.closest('.lab-card')).color), true, 'the field label must inherit readable card text');
    assert.deepEqual(errors, []);
    fs.mkdirSync(path.join(root, 'work', 'pack-tools'), { recursive: true });
    await page.screenshot({ path: path.join(root, 'work', 'pack-tools', 'snapshots.png') });
    await page.evaluate(() => {state.project.mods=[];WorkshopPackTools.history=WorkshopPackTools.createSelectionHistory();renderSelected();addPackMods([candidate])});
    for (const mode of ['classic', 'modern', 'v3', 'v4']) {
      await page.evaluate(mode => {
        document.body.className = 'ui-' + mode; document.body.dataset.ui = mode;
        $('lab-panel').hidden = true; $('mods-panel').hidden = false; $('workspace-grid').dataset.view = 'mods';
        $('selected-filter').value = '';state.packFilter = '';renderSelected();
      }, mode);
      for (const id of ['undo-selection', 'redo-selection']) {
        assert.equal(await page.locator('#' + id).isVisible(), true, `${mode}: ${id} is visible`);
        const bounds = await page.locator('#' + id).boundingBox();
        assert.ok(bounds.width >= 24 && bounds.height >= 24, `${mode}: toolbar target is usable`);
      }
      await page.locator('#undo-selection').click();
      assert.equal(await page.evaluate(() => state.project.mods.length), 0, `${mode}: undo works`);
      await page.keyboard.press('Control+Shift+z');
      assert.equal(await page.evaluate(() => state.project.mods.length), 1, `${mode}: keyboard redo works`);
      await page.screenshot({ path: path.join(root, 'work', 'pack-tools', `toolbar-${mode}.png`) });
    }
    console.log('Pack toolbar clicks, stale dependency protection, native text undo, share links and named snapshots passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
