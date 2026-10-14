const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const root = path.resolve(__dirname, '..');
    const renderer = fs.readFileSync(path.join(root, 'renderer.js'), 'utf8');
    const start = renderer.indexOf('function scoreModQueryRelevance(');
    const end = renderer.indexOf('\nasync function searchMods(', start);
    assert.ok(start >= 0 && end > start, 'chat mod picker implementation should exist');
    const pickerFunctions = renderer.slice(start, end);
    await page.setContent(`<!doctype html><html><body>
      <section id="chat-output"></section>
      <section class="design-overlay mod-selection-overlay" id="mod-selection-overlay" hidden><div class="design-card mod-selection-dialog">
        <header class="mod-selection-header"><div class="mod-selection-mark">✦</div><div><h2 id="mod-selection-title"></h2><p id="mod-selection-subtitle"></p></div><button id="mod-selection-close"></button></header>
        <div class="mod-selection-body"><div id="mod-selection-results" class="mod-results mod-picker-results"></div></div>
        <footer class="mod-selection-footer"><section class="mod-selection-summary"><div class="mod-selection-summary-heading"><strong id="mod-selection-summary-title"></strong><span id="mod-selection-count"></span></div><div id="mod-selection-selected" class="mod-selection-selected"></div></section><div class="mod-selection-actions"><button id="mod-selection-ai-add"></button><button id="mod-selection-cancel"></button><button id="mod-selection-continue"></button></div></footer>
      </div></section>
      <section id="mod-details-overlay" hidden><h2 id="mod-details-title"></h2><span id="mod-details-source"></span><span id="mod-details-author"></span><span id="mod-details-downloads"></span><span id="mod-details-compatibility"></span><h3 id="mod-details-description-heading"></h3><p id="mod-details-description"></p><small id="mod-details-description-status"></small><img id="mod-details-icon"><a id="mod-details-link"></a><button id="mod-details-add"></button><button id="close-mod-details"></button></section>
    </body></html>`);
    await page.evaluate(() => { document.body.dataset.theme='blue'; });
    await page.addStyleTag({ path: path.join(root, 'styles.css') });
    await page.addStyleTag({ path: path.join(root, 'visual-fixes.css') });
    await page.route('https://cdn.modrinth.com/**', route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 9"><rect width="16" height="9" fill="#52a7e8"/></svg>' }));
    await page.evaluate(source => {
      Object.defineProperty(window, 'localStorage', { configurable: true, value: { getItem: () => null, setItem: () => {} } });
      window.state = { project: { mods: [], turns: [], minecraftVersion: '1.21.1', loader: 'fabric' }, modPickerTurn: null, modPickerSelection: new Set(), modPickerView: 'window', batchSelection: new Set() };
      window.workshopI18n = { locale: 'de' };
      window.workshop = { getModDetails: async () => ({ description: 'Full description' }), searchMods: async ({offset,limit}) => Array.from({length: Math.min(limit, offset < 48 ? 24 : 4)}, (_,i) => ({id:`page-${offset+i}`,provider:'modrinth',title:`Paged Mod ${offset+i}`,summary:'Later result',author:'Tester',downloads:10,icon:'',gallery:[],compatibility:'1.21.1 · fabric',source:'Modrinth',url:`https://modrinth.com/mod/page-${offset+i}`})) };
      window.safe = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
      window.safeModPreview = value => { try { const url = new URL(String(value || '')); return url.protocol === 'https:' && ['cdn.modrinth.com', 'media.forgecdn.net'].includes(url.hostname) ? url.href : ''; } catch { return ''; } };
      window.formatDownloads = value => String(value);
      window.$ = id => document.getElementById(id);
      window.requestAnimationFrame = callback => setTimeout(callback, 0);
      window.openModPreview = () => {};
      window.queueSave = () => {};
      window.setStatus = message => { window.lastStatus = message; };
      window.addPackMods = mods => { window.state.project.mods.push(...mods); };
      window.recordSearchFeedback = () => {};
      window.renderSelected = () => {};
      window.renderResults = () => {};
      window.reconcilePackDependencies = () => {};
      window.sendChat = prompt => { window.lastPrompt = prompt; };
      window.togglePackMod = (items,index) => { const mod=items[index],key=`${mod.provider}:${mod.id}`,found=window.state.project.mods.findIndex(item=>`${item.provider}:${item.id}`===key);if(found>=0)window.state.project.mods.splice(found,1);else window.state.project.mods.push(mod);window.lastStatus=found>=0?`${mod.title} aus dem Pack entfernt`:`${mod.title} zum Pack hinzugefügt`; };
      window.renderChat = () => { const output = document.querySelector('#chat-output'); output.replaceChildren(window.renderChatModPicker(window.state.project.turns.at(-1))); };
      Object.assign(window, new Function(`${source}; return { modCardMarkup, renderModCards, renderChatModPicker, openModDetails, openModSelection, renderModSelectionDialog, renderModSelectionSummary, loadMoreChatModResults, closeModSelection, confirmModSelection, uniqueAutoAddCandidates, compareSuggestionRelevance, sortChatModResults };`)());
      document.querySelector('#mod-selection-continue').onclick = () => window.confirmModSelection();
      document.querySelector('#mod-selection-ai-add').onclick = () => window.confirmModSelection({ ai: true });
    }, pickerFunctions);
    const mods = Array.from({ length: 8 }, (_, index) => ({
      id: `mod-${index + 1}`, provider: 'modrinth', title: `Minecraft Mod ${index + 1}`, summary: `A detailed summary for suggestion ${index + 1}.`,
      author: 'Test author', downloads: 1234, icon: 'https://cdn.modrinth.com/icon.png', gallery: index===0?['https://cdn.modrinth.com/data/mod-1/screen-a.png','https://cdn.modrinth.com/data/mod-1/screen-b.png']:[], compatibility: '1.21.1 · fabric', source: 'Modrinth', url: `https://modrinth.com/mod/mod-${index + 1}`
    }));
    await page.evaluate(mods => {
      const turn = { role: 'assistant', content: 'Found some mods', modSearchStatus: 'done', modResults: mods, modSearchPages: {queries:['test'],kind:'mod',provider:'modrinth',offsets:[24],exhausted:[false],loading:false} };
      window.state.modPickerTurn = turn; window.state.project.turns.push(turn);
      window.openModSelection(turn);
    }, mods);
    const dialog = page.locator('#mod-selection-overlay');
    assert.equal(await dialog.isHidden(), false, 'opening mod suggestions should show the large picker');
    const dimensions = await page.locator('.mod-selection-dialog').evaluate(node => { const box = node.getBoundingClientRect(); return { width: box.width, height: box.height, viewportWidth: innerWidth, viewportHeight: innerHeight }; });
    assert.ok(dimensions.width > dimensions.viewportWidth * 0.8 && dimensions.height > dimensions.viewportHeight * 0.8, 'picker should use a roomy window');
    assert.equal(await page.locator('#mod-selection-results .mod-card').count(), 8, 'all results should live in the picker scroll area');
    assert.equal(await page.locator('#mod-selection-results .mod-card.has-gallery').count(), 1, 'only real gallery screenshots should make a card gallery-sized; app icons stay in the icon slot');
    const frame = await page.locator('#mod-selection-results .mod-preview-gallery').first().evaluate(node => { const box = node.getBoundingClientRect(); return { width: box.width, height: box.height, ratio: box.width/box.height }; });
    assert.ok(frame.width > 250 && frame.ratio > 1.55 && frame.ratio < 2.0, 'preview images should use a consistent landscape frame with useful width');
    const galleryContainment=await page.locator('#mod-selection-results .mod-card.has-gallery').first().evaluate(card=>({card:card.getBoundingClientRect().toJSON(),gallery:card.querySelector('.mod-preview-gallery').getBoundingClientRect().toJSON(),main:card.querySelector('.mod-card-main').getBoundingClientRect().toJSON()}));
    assert.ok(galleryContainment.gallery.bottom<=galleryContainment.card.bottom&&galleryContainment.main.bottom<=galleryContainment.card.bottom,'gallery and card text must remain inside their own card so the next result cannot overlap them');
    await page.evaluate(() => window.loadMoreChatModResults(window.state.modPickerTurn));
    await page.waitForFunction(() => document.querySelectorAll('#mod-selection-results .mod-card').length === 32);
    await page.evaluate(() => window.loadMoreChatModResults(window.state.modPickerTurn));
    await page.waitForFunction(() => document.querySelectorAll('#mod-selection-results .mod-card').length === 36 && document.querySelector('#mod-selection-results .mod-picker-page-status')?.textContent.includes('Alle verfügbaren'));
    assert.equal(await page.locator('#mod-selection-results .mod-card').count(), 36, 'picker should continue loading pages until the source has no more results');
    const pluses = page.locator('#mod-selection-results .add-mod');
    await page.locator('#mod-selection-results .mod-card').nth(0).click({position:{x:20,y:30}});
    assert.equal(await page.evaluate(() => window.state.project.mods.length), 1, 'clicking the mod card should immediately add it to the active pack');
    assert.equal(await pluses.nth(0).textContent(), '−', 'an added mod should immediately show the remove/minus action');
    await pluses.nth(0).click();
    assert.equal(await page.evaluate(() => window.state.project.mods.length), 0, 'clicking minus should immediately remove the mod from the active pack');
    await pluses.nth(0).click();
    await pluses.nth(2).click();
    assert.equal(await page.locator('#mod-selection-selected .mod-selection-chip').count(), 2, 'selected mods should appear with icons in the selection tray');
    await page.locator('#mod-selection-continue').click();
    assert.equal(await dialog.isHidden(), true, 'the done button should close the picker without another add confirmation');
    assert.equal(await page.locator('#chat-output .chat-mod-compact-chip').count(), 2, 'the chat should retain only compact selected-mod chips');
    assert.equal(await page.evaluate(() => window.state.project.mods.length), 2, 'each mod should already be added to the active pack before closing the picker');
    assert.equal(await page.evaluate(() => window.lastPrompt), undefined, 'adding chosen mods must not immediately trigger a second search');
    assert.match(await page.locator('#chat-output').textContent(), /2 Mods sind in deinem Pack/, 'the chat should confirm the pack update without reopening suggestions');
    await page.evaluate(mods => { const turn={role:'assistant',content:'Choose another set',modSearchStatus:'done',modResults:mods};window.state.project.turns.push(turn);window.state.modPickerView='inline';window.openModSelection(turn); }, mods);
    assert.equal(await page.locator('#mod-selection-overlay').isHidden(), true, 'chat view should stay in the conversation');
    assert.equal(await page.locator('#chat-output .chat-mod-inline-results .mod-card').count(), 8, 'previous inline selection menu should remain available');
    const inlineLayout=await page.locator('#chat-output .chat-mod-compact').evaluate(node=>{const heading=node.querySelector('.chat-mod-compact-heading').getBoundingClientRect(),picker=node.querySelector('.chat-mod-inline-picker').getBoundingClientRect();return{headingBottom:heading.bottom,pickerTop:picker.top,headingWidth:heading.width,pickerWidth:picker.width}});
    assert.ok(inlineLayout.pickerTop>=inlineLayout.headingBottom,'the inline mod picker must sit below its heading instead of squeezing it into a narrow side column');
    assert.ok(inlineLayout.headingWidth>=inlineLayout.pickerWidth*.9,'the inline suggestion heading must retain the full picker width');
    await page.locator('#chat-output .chat-mod-inline-toolbar button').click();
    assert.equal(await page.locator('#mod-selection-overlay').isHidden(), false, 'inline picker should switch back to the large modal');
    await page.locator('[data-mod-picker-view="inline"]').click();
    assert.equal(await page.locator('#mod-selection-overlay').isHidden(), true, 'large modal should switch back to the inline picker');
    assert.equal(await page.locator('#chat-output .chat-mod-inline-results .mod-card').count(), 8, 'switching views should keep the full multi-select list');
    assert.equal(await page.locator('#chat-output .chat-mod-inline-results .compact-mod-card').count(), 8, 'inline mode should use its dedicated compact cards');
    assert.equal(await page.locator('#chat-output .chat-mod-inline-results .mod-gallery-carousel').count(), 0, 'inline mode should not let variable preview images distort the compact cards');
    const inlineBefore=await page.evaluate(()=>window.state.project.mods.length);
    await page.locator('#chat-output .chat-mod-inline-results .mod-card').nth(4).click();
    assert.equal(await page.evaluate(()=>window.state.project.mods.length),inlineBefore+1,'clicking a suggestion card should add it immediately in inline mode too');
    const inlineStyle = await page.locator('.chat-mod-inline-picker').evaluate(node => ({
      panel: getComputedStyle(node).backgroundColor,
      card: getComputedStyle(node.querySelector('.compact-mod-card')).backgroundColor,
      cardText: getComputedStyle(node.querySelector('.compact-mod-card .mod-name strong')).color,
      box: node.querySelector('.compact-mod-card').getBoundingClientRect().toJSON(),
      box2: node.querySelectorAll('.compact-mod-card')[1].getBoundingClientRect().toJSON()
    }));
    assert.match(inlineStyle.panel, /rgba?\(9, 25, 45/,'inline panel should use a dark glass surface instead of a white theme panel');
    assert.match(inlineStyle.card, /rgba?\(17, 39, 66/,'compact cards should have a distinct readable surface');
    const luminance=value=>{const channels=value.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722};
    const textLuma=luminance(inlineStyle.cardText),cardLuma=luminance(inlineStyle.card);
    assert.ok((Math.max(textLuma,cardLuma)+.05)/(Math.min(textLuma,cardLuma)+.05)>=4.5,'card titles should meet readable contrast on the compact surface');
    assert.ok(inlineStyle.box.width > 200 && inlineStyle.box.height >= 100 && inlineStyle.box.height < 190,'compact card dimensions should stay bounded');
    assert.ok(inlineStyle.box.right <= inlineStyle.box2.left || inlineStyle.box2.right <= inlineStyle.box.left || inlineStyle.box.bottom <= inlineStyle.box2.top || inlineStyle.box2.bottom <= inlineStyle.box.top,'neighboring compact cards should not overlap');
    const beforeAiAdd=await page.evaluate(()=>window.state.project.mods.length);
    await page.evaluate(mods=>{const turn={role:'assistant',content:'Add a strong foundation',modSearchStatus:'done',modResults:mods.slice(0,8),modSearchPages:{queries:['test'],kind:'mod',provider:'modrinth',offsets:[12],exhausted:[false],loading:false}};window.state.project.turns.push(turn);window.state.modPickerView='window';window.openModSelection(turn)},mods);
    await page.locator('#mod-selection-ai-add').click();
    await page.waitForFunction(before=>window.state.project.mods.length>=before+12,beforeAiAdd);
    assert.equal(await page.evaluate(before=>window.state.project.mods.length-before,beforeAiAdd),12,'AI add should fetch more results as needed and automatically add twelve matching mods');
    assert.equal(await page.evaluate(()=>window.lastPrompt),undefined,'AI add should finish the pack action without starting another chat search');
    assert.match(await page.locator('#chat-output').textContent(),/KI hat 12 passende Mods automatisch hinzugefügt/,'the assistant should confirm the completed batch in the chat');
    const duplicateChoice=await page.evaluate(()=>window.uniqueAutoAddCandidates([
      {mod:{id:'dynamic-light-a',provider:'modrinth',title:'Dynamic Lights',downloads:1000},score:8},
      {mod:{id:'dynamic-light-b',provider:'modrinth',title:'LambDynamicLights - Dynamic Lights',downloads:9000},score:8},
      {mod:{id:'unique-biome',provider:'modrinth',title:'New Biomes',downloads:500},score:7}
    ],[],12).map(item=>item.mod.id));
    assert.deepEqual(duplicateChoice,['dynamic-light-b','unique-biome'],'AI selection should keep the more popular of closely related Dynamic Lights projects and avoid the duplicate feature');
    const relevanceTieBreak=await page.evaluate(()=>window.sortChatModResults({modSortOrder:'relevance',modResults:[
      {id:'niche',provider:'modrinth',title:'Exact topic match',matchedFacets:1,relevance:20,downloads:1200},
      {id:'popular',provider:'modrinth',title:'Popular close match',matchedFacets:1,relevance:19,downloads:120000}
    ]}).map(mod=>mod.id));
    assert.deepEqual(relevanceTieBreak,['popular','niche'],'relevance remains primary while downloads break close relevance ties');
    await page.evaluate(mods=>{const turn={role:'assistant',content:'Change this selection',modSearchStatus:'done',modResults:mods.slice(0,3),selectionComplete:true};window.state.project.turns.push(turn);window.renderChat();},mods);
    await page.locator('#chat-output .chat-mod-open-picker').click();assert.equal(await page.locator('#mod-selection-overlay').isHidden(),false,'Change selection must reopen the picker even when the preference is inline');
    assert.equal(await page.locator('.mod-selection-header .mod-picker-sort select').count(),1,'the large picker exposes its sort control');
    await page.locator('.mod-selection-header .mod-picker-sort select').selectOption('downloads');
    assert.equal(await page.evaluate(()=>window.state.modPickerTurn.modSortOrder),'downloads','sort order is attached to this suggestion set');
    await page.locator('#mod-selection-cancel').click();
    await page.evaluate(mod=>{if(!window.state.project.mods.some(item=>item.id===mod.id))window.state.project.mods.push(mod)},mods[0]);
    const beforeDuplicateCheck=await page.evaluate(()=>window.state.project.mods.length);
    await page.evaluate(mods=>{const turn={role:'assistant',content:'Check duplicate suggestions',modSearchStatus:'done',modResults:[mods[0],mods[1]]};window.state.project.turns.push(turn);window.state.modPickerView='window';window.openModSelection(turn)},mods);
    assert.equal(await page.locator('#mod-selection-results .add-mod').first().isDisabled(),false,'a mod already in the pack should remain removable in the picker');
    assert.equal(await page.locator('#mod-selection-results .add-mod').first().textContent(),'−','a mod already in the pack should be synchronized as selected even when the chat turn has stale selection state');
    await page.locator('#mod-selection-results .add-mod').first().click();
    assert.equal(await page.evaluate(before=>window.state.project.mods.length,beforeDuplicateCheck-1),beforeDuplicateCheck-1,'clicking minus should remove the existing mod from the active pack');
    await page.locator('#mod-selection-results .add-mod').nth(1).click();
    assert.equal(await page.evaluate(before=>window.state.project.mods.length-before,beforeDuplicateCheck),0,'removing one existing mod and adding one new suggestion should keep the pack count balanced');
    await page.locator('#mod-selection-continue').click();
    assert.equal(await page.evaluate(before=>window.state.project.mods.length-before,beforeDuplicateCheck),0,'closing the picker should not add or duplicate mods a second time');
    assert.equal(await page.evaluate(id=>window.state.project.mods.filter(mod=>mod.id===id).length,mods[0].id),0,'removing a previously selected mod should remove it from the active pack');
    assert.equal(await page.evaluate(id=>window.state.project.mods.filter(mod=>mod.id===id).length,mods[1].id),1,'the newly selected suggestion should be in the active pack exactly once');
    await page.evaluate(() => {
      window.state.project.mods = [];
      window.state.modPickerView = 'inline';
      const turn = { role: 'assistant', content: 'Dismiss this picker', modSearchStatus: 'done', modResults: window.state.project.turns[0].modResults };
      window.state.project.turns.push(turn);
      window.openModSelection(turn);
    });
    const emptyPickerAction = page.locator('#chat-output .chat-mod-inline-picker .chat-mod-inline-actions .button-primary');
    assert.equal(await emptyPickerAction.textContent(), 'Später · zurück zum Chat', 'an empty inline picker should offer a clear way back to chat');
    assert.equal(await emptyPickerAction.isEnabled(), true, 'returning to chat must remain available with no mods selected');
    await emptyPickerAction.click();
    assert.equal(await page.locator('#chat-output .chat-mod-inline-picker').count(), 0, 'returning without a selection should dismiss the inline picker');
    assert.equal(await page.locator('#chat-output .chat-mod-open-picker').count(), 1, 'a dismissed picker should remain reopenable from chat');
    assert.equal(await page.evaluate(() => window.state.project.mods.length), 0, 'dismissing an empty picker should not alter the pack');
    assert.deepEqual(errors, [], 'picker flow must not create browser errors');
    console.log('Chat mod picker: both views, proportionate previews, direct card/plus add, minus removal state, no duplicate add confirmation, and AI recommendations passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
