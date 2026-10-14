const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'renderer.js'), 'utf8');
  const anchorStart = source.indexOf('function captureChatScrollPosition(');
  const anchorEnd = source.indexOf('\nfunction renderChat()', anchorStart);
  assert.ok(anchorStart >= 0 && anchorEnd > anchorStart, 'chat scroll anchor preservation should exist');
  const anchorHelpers = source.slice(anchorStart, anchorEnd);
  const followStart=source.indexOf('function bindChatFollowLatest('),followEnd=source.indexOf('\nfunction restoreChatScrollPosition',followStart);
  assert.ok(followStart>=0&&followEnd>followStart,'chat follow-latest should track the chat viewport itself');
  const followHelper=source.slice(followStart,followEnd);
  const start = source.indexOf('function scheduleInitialChatScroll(');
  const end = source.indexOf('\nfunction syncChatHeaderActions(', start);
  assert.ok(start >= 0 && end > start, 'startup chat scroll helper should exist');
  const helper = source.slice(start, end);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
    await page.setContent('<div id="chat" style="height:220px;overflow:auto"></div>');
    await page.locator('#chat').evaluate(node => {
      node.innerHTML = Array.from({length:40}, (_,i) => `<p style="height:40px">Message ${i+1}</p>`).join('');
      node.scrollTop = 0;
    });
    await page.evaluate(sourceText => { window.chatFollowLatest=true;new Function(`${sourceText}; scheduleInitialChatScroll(document.querySelector('#chat'));`)(); }, helper);
    await page.locator('#chat').click({position:{x:8,y:8}});
    await page.waitForFunction(() => {
      const node = document.querySelector('#chat');
      return node.scrollTop >= node.scrollHeight - node.clientHeight - 2;
    });
    await page.waitForTimeout(1250);
    await page.locator('#chat').evaluate(node=>{const late=document.createElement('p');late.style.height='180px';late.textContent='Late-loaded latest message';node.append(late)});
    await page.waitForFunction(() => {const node=document.querySelector('#chat');return node.scrollTop>=node.scrollHeight-node.clientHeight-2});
    await page.locator('#chat').evaluate(node => { node.scrollTop = 60; node.dispatchEvent(new WheelEvent('wheel', { bubbles: true })); });
    await page.waitForTimeout(1000);
    assert.equal(await page.locator('#chat').evaluate(node => node.scrollTop), 60, 'startup positioning should stop once the user starts scrolling');
    await page.locator('#chat').evaluate(node => {
      node.innerHTML=Array.from({length:40},(_,i)=>`<article class="message" data-chat-turn-index="${i}" style="height:${i===0?60:40}px">Message ${i+1}</article>`).join('');node.scrollTop=620;
    });
    await page.evaluate(code => { window.chatFollowLatest=false;Object.assign(window,new Function(`${code}; return {captureChatScrollPosition,restoreChatScrollPosition}`)());window.anchorSnapshot=window.captureChatScrollPosition(document.querySelector('#chat')); }, anchorHelpers);
    const beforeAnchor = await page.locator('#chat .message[data-chat-turn-index="15"]').evaluate(node => node.getBoundingClientRect().top);
    await page.locator('#chat').evaluate(node => { node.innerHTML=`<article class="message" data-chat-turn-index="new" style="height:180px">New content above</article>`+node.innerHTML; });
    await page.evaluate(() => window.restoreChatScrollPosition(document.querySelector('#chat'),window.anchorSnapshot));
    const afterAnchor = await page.locator('#chat .message[data-chat-turn-index="15"]').evaluate(node => node.getBoundingClientRect().top);
    assert.ok(Math.abs(afterAnchor-beforeAnchor)<1,'re-rendering after an action should keep the visible chat message anchored in place');
    await page.setContent('<div id="chat" style="height:220px;overflow:auto"><div id="nested" style="height:500px;overflow:auto"><div style="height:1200px">nested suggestions</div></div><div style="height:600px">chat history</div></div>');
    await page.evaluate(code=>{window.chatFollowLatest=true;Object.assign(window,new Function(`${code}; return {bindChatFollowLatest}`)());window.bindChatFollowLatest(document.querySelector('#chat'))},followHelper);
    await page.locator('#nested').dispatchEvent('wheel',{deltaY:-80});
    assert.equal(await page.evaluate(()=>window.chatFollowLatest),true,'scrolling a nested suggestions box must not disable chat follow-latest');
    await page.locator('#chat').evaluate(node=>{node.scrollTop=60;node.dispatchEvent(new Event('scroll'))});
    assert.equal(await page.evaluate(()=>window.chatFollowLatest),false,'scrolling the chat history up should disable follow-latest');
    await page.locator('#chat').evaluate(node=>{node.scrollTop=node.scrollHeight;node.dispatchEvent(new Event('scroll'))});
    assert.equal(await page.evaluate(()=>window.chatFollowLatest),true,'returning to the latest message should restore follow-latest');
    await page.setContent('<div id="chat" style="height:220px;overflow:auto">'+Array.from({length:30},(_,i)=>`<article class="message" data-chat-turn-index="${i}" style="height:50px">Message ${i}</article>`).join('')+'</div>');
    await page.evaluate(code=>{
      window.chatFollowLatest=true;
      Object.assign(window,new Function(`${code}; return {bindChatFollowLatest,scheduleInitialChatScroll,captureChatScrollPosition,restoreChatScrollPosition}`)());
      const area=document.querySelector('#chat');bindChatFollowLatest(area);scheduleInitialChatScroll(area);
    },anchorHelpers+'\n'+helper);
    await page.waitForFunction(()=>{const area=document.querySelector('#chat');return area.scrollHeight-area.clientHeight-area.scrollTop<2});
    const chatBounds=await page.locator('#chat').boundingBox();
    await page.mouse.move(chatBounds.x+100,chatBounds.y+100);
    await page.mouse.wheel(0,-48);
    await page.waitForTimeout(180);
    const manualPosition=await page.locator('#chat').evaluate(area=>area.scrollTop);
    assert.ok(await page.locator('#chat').evaluate(area=>area.scrollHeight-area.clientHeight-area.scrollTop>=40),'one small upward wheel step must move away from the latest message instead of snapping back');
    await page.evaluate(()=>{const area=document.querySelector('#chat');const snapshot=captureChatScrollPosition(area);area.lastElementChild.textContent+=' streamed text';restoreChatScrollPosition(area,snapshot)});
    await page.waitForTimeout(180);
    assert.equal(await page.locator('#chat').evaluate(area=>area.scrollTop),manualPosition,'streaming and rerendering must respect manual scrolling even within 120px of the bottom');
    await page.mouse.wheel(0,500);
    await page.waitForFunction(()=>{const area=document.querySelector('#chat');return area.scrollHeight-area.clientHeight-area.scrollTop<=2&&window.chatFollowLatest});
    await page.locator('#chat').evaluate(area=>{const latest=document.createElement('article');latest.className='message';latest.style.height='160px';latest.textContent='New answer after returning to the bottom';area.append(latest)});
    await page.waitForFunction(()=>{const area=document.querySelector('#chat');return area.scrollHeight-area.clientHeight-area.scrollTop<=2});
    console.log('Chat scroll: latest-message startup, real small wheel movements, manual position during updates, nested scrollers, and rerender anchors passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
