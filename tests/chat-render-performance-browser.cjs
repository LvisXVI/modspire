const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'renderer.js'), 'utf8');
  const renderStart = source.indexOf('function renderChat()');
  const cacheStart = source.indexOf('function renderChatTurnCached(');
  const renderCode = source.slice(cacheStart >= 0 ? cacheStart : renderStart, source.indexOf('\nfunction scheduleInitialChatScroll(', renderStart));
  const anchorCode = source.slice(source.indexOf('function captureChatScrollPosition('), source.indexOf('\nfunction bindChatFollowLatest('));
  const observerCode = source.slice(source.indexOf('function scheduleInitialChatScroll('), source.indexOf('\nfunction syncChatHeaderActions('));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    await page.setContent('<main id="chat-panel"><div id="chat-messages" style="height:500px;overflow:auto"></div></main>');
    await page.evaluate(code => {
      window.$ = id => document.getElementById(id);
      window.state = { project: { turns: Array.from({ length: 120 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `Message ${i}` })), mods: [], provider: 'modrinth', minecraftVersion: '1.21.1', loader: 'fabric' }, settings: { username: 'Tester' }, popularMods: [], modPickerView: 'window', sending: false };
      window.workshopI18n = { locale: 'de' }; window.selectedUserAvatar = ''; window.selectedAssistantAvatar = '';
      window.chatFollowLatest = true; window.safe = String; window.queueSave = () => {}; window.renderCreatorStudio = () => {};
      window.bindChatFollowLatest = () => {}; window.captureChatScrollPosition = () => ({ nearBottom: true });
      window.restoreChatScrollPosition = () => {}; window.scheduleInitialChatScroll = () => {}; window.syncChatHeaderActions = () => {};
      window.builtTurns = 0;
      window.renderTurn = turn => {
        window.builtTurns++;
        const row = document.createElement('article'); row.className = 'message'; row.dataset.chatTurnIndex = String(window.state.project.turns.indexOf(turn));
        row.innerHTML = `<p>${turn.content}</p><details><summary>Options</summary><button>Keep my selection</button></details>` + '<button>Continue</button>'.repeat(30);
        return row;
      };
      window.renderChat = new Function(`${code}; return renderChat`)();
      const started = performance.now(); window.renderChat(); window.initialRenderMs = performance.now() - started;
      window.originalRow = document.querySelector('[data-chat-turn-index="60"]'); window.originalRow.querySelector('details').open = true;
      window.builtTurns = 0; window.state.project.turns.at(-1).content += ' updated';
      const update = performance.now(); window.renderChat(); window.updateRenderMs = performance.now() - update;
    }, renderCode);
    const update = await page.evaluate(() => ({ built: builtTurns, sameRow: originalRow === document.querySelector('[data-chat-turn-index="60"]'), optionsOpen: document.querySelector('[data-chat-turn-index="60"] details').open, initialMs: initialRenderMs, updateMs: updateRenderMs }));
    assert.equal(update.built, 1, 'updating one reply must not rebuild the entire 120-message transcript');
    assert.ok(update.sameRow && update.optionsOpen, 'unrelated message controls and open choices stay intact');
    await page.evaluate(code => {
      window.captureChatScrollPosition = new Function(`${code}; return captureChatScrollPosition`)();
      const area = $('chat-messages'); area.scrollTop = area.scrollHeight;
      let reads = 0; const original = Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect = function () { if (this.matches('.message')) reads++; return original.call(this); };
      window.captureChatScrollPosition(area); Element.prototype.getBoundingClientRect = original; window.messageGeometryReads = reads;
    }, anchorCode);
    assert.equal(await page.evaluate(() => messageGeometryReads), 0, 'following the newest message must not force layout of offscreen history');
    await page.evaluate(code => {
      window.chatFollowLatest = false;
      window.ResizeObserver = class { constructor() { window.trackedMessages = new Set(); } observe(node) { trackedMessages.add(node); } unobserve(node) { trackedMessages.delete(node); } disconnect() { trackedMessages.clear(); } };
      window.scheduleInitialChatScroll = new Function(`${code}; return scheduleInitialChatScroll`)();
      const area = $('chat-messages'); area.dataset.initialLatestScheduled = ''; window.scheduleInitialChatScroll(area);
      for (let i = 0; i < 20; i++) { const old = area.querySelector('[data-chat-turn-index="119"]'); const next = old.cloneNode(true); old.replaceWith(next); }
    }, observerCode);
    await page.waitForTimeout(50);
    assert.equal(await page.evaluate(() => [...trackedMessages].filter(node => !node.isConnected).length), 0, 'resize tracking must release detached messages after rerenders');
    const packUpdate=await page.evaluate(()=>{
      state.project.turns=[{role:'assistant',content:'First picker',modSearchStatus:'done',selectionDismissed:true,modResults:[{provider:'modrinth',id:'a'}]},{role:'assistant',content:'Other picker',modSearchStatus:'done',selectionDismissed:true,modResults:[{provider:'modrinth',id:'b'}]}];
      renderChat();builtTurns=0;state.project.mods=[{provider:'modrinth',id:'a'}];renderChat();const changed=builtTurns;
      builtTurns=0;renderChat();return{changed,unchanged:builtTurns};
    });
    assert.equal(packUpdate.changed,1,'adding a mod must only refresh suggestion sets that contain that mod');
    assert.equal(packUpdate.unchanged,0,'unchanged chat updates must reuse every existing conversation row');
    const switchedToLatest=await page.evaluate(async()=>{captureChatScrollPosition=()=>({nearBottom:false,scrollTop:20});restoreChatScrollPosition=(_area,snapshot)=>{window.lastRestore=snapshot};state.project.turns=[{role:'assistant',content:'Different conversation'}];renderChat();await new Promise(requestAnimationFrame);return lastRestore.nearBottom});
    assert.equal(switchedToLatest,true,'switching conversations must start at the latest message instead of restoring an unrelated scroll anchor');
    console.log(`Long-chat rendering: one changed reply rebuilt 1/120 rows; preserved controls; no offscreen geometry reads or detached resize targets. Initial ${update.initialMs.toFixed(1)}ms, update ${update.updateMs.toFixed(1)}ms.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
