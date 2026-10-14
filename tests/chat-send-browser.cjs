const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'renderer.js'), 'utf8');
  const start = source.indexOf('function finishChatSend(');
  const end = source.indexOf('\nfunction showView(', start);
  assert.ok(start >= 0 && end > start, 'chat send flow should exist');
  const sendFlow = source.slice(start, end);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<textarea id="chat-input"></textarea><button id="attach-video"></button><button id="voice-input"></button><span id="video-name"></span><input id="video-input"><button id="clear-video"></button><div id="chat-messages"></div>');
    await page.evaluate(flow => {
      window.state = { project: { id:'p',name:'Pack',minecraftVersion:'1.21.1',loader:'fabric',provider:'modrinth',mods:[],turns:[] }, settings:{hasOpenAIKey:true,hasClaudeKey:false,aiProvider:'openai'}, chatgpt:{status:'disconnected',sharing:false}, pendingVideo:null, sending:false, queuedAssistantPrompts:[], autoSetup:false };
      window.$=id=>document.getElementById(id);window.speechRecognition=null;window.chatFollowLatest=true;window.activeChatRequestId='';window.updateVoiceInput=()=>{};
      window.workshopI18n={locale:'de'};window.queueSave=()=>{};window.context=()=>({language:'de'});window.fallbackSearchTermsForPrompt=()=>[];window.updateVoiceInput=()=>{};window.setAssistantAvatar=()=>{};window.setStatus=message=>window.statusMessage=message;window.renderChat=()=>{window.lastRenderedTurn=window.state.project.turns.at(-1)};window.reported=[];
      window.aiReply={text:'Passende Biome gefunden.',searchTerms:['biomes'],choices:[]};
      window.workshop={askAI:async()=>{await new Promise(resolve=>setTimeout(resolve,35));return window.aiReply},reportError:detail=>{window.reported.push(detail);return Promise.resolve()}};
      window.searchCalls=0;window.searchMods=async(_terms,_fromChat,{chatTurn})=>{window.searchCalls++;await new Promise(resolve=>setTimeout(resolve,900));chatTurn.modSearchStatus='done'};
      Object.assign(window,new Function(`${flow};return {finishChatSend,sendChat}`)());
    }, sendFlow);
    const started = Date.now();
    await page.evaluate(() => window.sendChat('Mehr Biome bitte'));
    const elapsed = Date.now() - started;
    assert.ok(elapsed < 500, `AI answer should return without waiting for slow mod search (took ${elapsed}ms)`);
    assert.equal(await page.evaluate(() => window.state.sending), false, 'composer should unlock as soon as the AI answer arrives');
    assert.equal(await page.evaluate(() => window.lastRenderedTurn.content), 'Passende Biome gefunden.', 'the AI response should render before project search finishes');
    await page.evaluate(() => window.sendChat('Mehr Erkundung bitte'));
    assert.equal(await page.evaluate(() => window.state.project.turns.filter(turn=>turn.role==='user').length), 2, 'a second bubble prompt must run while the previous Modrinth search is still loading');
    await page.waitForFunction(() => window.searchCalls >= 2);
    await page.evaluate(() => {window.aiReply={text:'**Dynamic Lights** – Fackeln leuchten dynamisch.\n\n**Sodium Extra** – zusätzliche Grafikeinstellungen.\n\nAlle Vorschläge sind Mods.',choices:[]};return window.sendChat('Was passt zu meinem Pack?')});
    await page.waitForFunction(() => window.searchCalls >= 3);
    assert.deepEqual(await page.evaluate(()=>window.lastRenderedTurn.searchTerms),['Dynamic Lights','Sodium Extra'],'named mod recommendations without a structured AI search signal should still open the selectable Modrinth results');
    assert.equal(await page.evaluate(()=>window.lastRenderedTurn.modSearchStatus),'loading','the chat turn should render a selection box while recommended mods are looked up');
    // Provider integrations only generate text. The app owns recommendation parsing
    // and must therefore create the same selectable search for every provider.
    await page.evaluate(()=>{state.settings.aiProvider='local';state.settings.localAi={model:'qwen-local'};window.aiReply={text:'- LambDynamicLights — lässt Lichtquellen dynamisch leuchten.\n- Sodium Extra — erweitert Videooptionen.',choices:[]};return sendChat('Finde Licht-Mods')});
    await page.waitForFunction(()=>window.searchCalls>=4);
    assert.deepEqual(await page.evaluate(()=>window.lastRenderedTurn.searchTerms),['LambDynamicLights','Sodium Extra'],'local text-only answers should create selectable search results without model tool calling');
    await page.evaluate(()=>{state.settings.aiProvider='omniroute';state.settings.hasOmniRouteKey=true;window.aiReply={text:'1. Iris Shaders: ermöglicht Shader-Unterstützung.\n2. MakeUp Ultra Fast: anpassbare Shader.',choices:[]};return sendChat('Finde passende Shader')});
    await page.waitForFunction(()=>window.searchCalls>=5);
    assert.deepEqual(await page.evaluate(()=>window.lastRenderedTurn.searchTerms),['Iris Shaders','MakeUp Ultra Fast'],'OmniRoute text-only answers should create selectable search results without provider-specific tool calling');
    console.log('Chat sends: ChatGPT-style, local, and OmniRoute replies all open the app-owned selectable Modrinth results without model tool calling.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
