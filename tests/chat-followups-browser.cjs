const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const source=fs.readFileSync(path.join(__dirname,'..','renderer.js'),'utf8');
  const start=source.indexOf('function scoreModQueryRelevance('),end=source.indexOf('\nfunction modCardMarkup(',start);
  assert.ok(start>=0&&end>start,'ranked, deduplicated search aggregation should exist');
  const searchHelpers=source.slice(start,end);
  const followStart=source.indexOf('function turnTopics('),followEnd=source.indexOf('\nfunction searchInChatMode(',followStart);
  assert.ok(followStart>=0&&followEnd>followStart,'chat follow-up buttons should exist');
  const followHelpers=source.slice(followStart,followEnd);
  const finishStart=source.indexOf('function finishChatSend('),finishEnd=source.indexOf('\nasync function sendChat(',finishStart);
  assert.ok(finishStart>=0&&finishEnd>finishStart,'queued follow-ups should drain after an answer');
  const finishHelper=source.slice(finishStart,finishEnd);
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const page=await browser.newPage();
    await page.setContent('<!doctype html><html><body><div id="buttons"></div></body></html>');
    await page.evaluate(({searchHelpers,followHelpers,finishHelper})=>{
      window.state={sending:false,project:{mods:[{provider:'modrinth',id:'selected'}],turns:[]}};
      window.workshopI18n={locale:'de'};window.safe=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
      window.setStatus=message=>window.statusMessage=message;window.sentPrompts=[];window.sendChat=prompt=>{window.sentPrompts.push(prompt);return Promise.resolve()};
      window.$=()=>({disabled:false});window.queueSave=()=>{};window.renderChat=()=>{};
      Object.assign(window,new Function(`${searchHelpers};${followHelpers};${finishHelper};return {scoreModQueryRelevance,mergeRankedModResults,renderAssistantFollowups,submitAssistantPrompt,finishChatSend}`)());
    },{searchHelpers,followHelpers,finishHelper});
    const ranked=await page.evaluate(()=>window.mergeRankedModResults([
      [{provider:'modrinth',id:'selected',title:'Dungeon Pack',summary:'dungeons'},{provider:'modrinth',id:'d1',title:'Dungeon Structures',summary:'Boss arenas and ruins',downloads:20},{provider:'modrinth',id:'weak',title:'Random Project',summary:'Unrelated',downloads:500}],
      [{provider:'modrinth',id:'d1',title:'Dungeon Structures',summary:'Boss arenas and ruins',downloads:20},{provider:'modrinth',id:'b1',title:'Bosses of Mass Destruction',summary:'Boss encounters',downloads:10}]
    ],['dungeons','bosses'],new Set(['modrinth:selected'])));
    assert.equal(ranked.some(mod=>mod.id==='selected'),false,'mods already in the pack must never be suggested again');
    assert.equal(ranked.filter(mod=>mod.id==='d1').length,1,'a mod returned by multiple topic searches should appear only once');
    assert.equal(ranked[0].id,'d1','mods matching several requested topics should rank first');
    assert.match(ranked[0].matchQuery,/dungeons.*bosses/,'the card should explain which topic searches matched');
    await page.evaluate(()=>{
      const assistant={role:'assistant',content:'Exploration and biomes',searchTerms:['biomes','exploration']};window.state.project.turns=[{role:'user',content:'I want exploration and biomes'},assistant];
      document.querySelector('#buttons').replaceChildren(window.renderAssistantFollowups(assistant));
    });
    const next=page.locator('#buttons button').filter({hasText:'Mehr Biome'}).first();
    await next.click();
    assert.equal(await page.evaluate(()=>window.sentPrompts.length),1,'clicking a one-click follow-up must send a chat turn');
    assert.match(await page.evaluate(()=>window.sentPrompts[0]),/weitere passende Mods für Biome & Erkundung/,'follow-up should carry all topics into the chat request');
    const hiddenWhileBusy=await page.evaluate(()=>{window.state.sending=true;return window.renderAssistantFollowups(window.state.project.turns.at(-1))===null});
    assert.equal(hiddenWhileBusy,true,'follow-up buttons must not be clickable while the current AI reply or mod search is still running');
    assert.deepEqual(await page.evaluate(()=>window.sentPrompts.length),1);
    await page.evaluate(()=>{window.state.queuedAssistantPrompts=[];window.state.sending=true;window.submitAssistantPrompt({disabled:false},'queued follow-up');window.state.sending=false;window.finishChatSend()});
    await page.waitForFunction(()=>window.sentPrompts.includes('queued follow-up'));
    assert.equal(await page.evaluate(()=>window.sentPrompts.at(-1)),'queued follow-up','a follow-up clicked during a pending reply must be sent automatically when the reply ends');
    console.log('Chat follow-ups: clicks send the intended prompt, busy-state controls are hidden, topic ranking deduplicates and excludes mods already in the pack.');
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
