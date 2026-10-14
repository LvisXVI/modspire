const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');

(async()=>{
  const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8'),source=fs.readFileSync(path.join(root,'renderer.js'),'utf8');
  assert.match(html,/id="omnirouteKey-key"/);assert.match(html,/value="auto">Automatisch · bestes verfügbares Modell/);assert.match(html,/id="test-omniroute"/);
  assert.match(source,/choice==='provider:omniroute'\)\{\$\('ai-provider'\)\.value='omniroute'/);
  const start=source.indexOf('function syncChatModelPicker(){'),end=source.indexOf('\nasync function saveAiProvider()',start);
  const browser=await chromium.launch({channel:"chrome",headless:true});
  try{
    const page=await browser.newPage();
    await page.setContent('<label id="chat-model-wrap"><span>Model</span><select id="chat-model-select"></select></label><select id="ai-provider"><option value="auto">Auto</option><option value="omniroute">Cloud</option></select><select id="local-ai-model"><option value="local-model">local-model</option></select>');
    await page.evaluate(code=>{
      window.$=id=>document.getElementById(id);
      window.state={settings:{hasOmniRouteKey:true,hasClaudeKey:false,hasOpenAIKey:false,aiProvider:'omniroute',localAi:{model:''}},localModels:[],chatgpt:{status:'disconnected',sharing:false}};
      window.workshopI18n={locale:'de'};$('ai-provider').value='omniroute';
      Object.assign(window,new Function(`${code}; return {syncChatModelPicker};`)());
    },source.slice(start,end));
    await page.evaluate(()=>syncChatModelPicker());
    assert.equal(await page.locator('#chat-model-wrap').isHidden(),false);
    assert.equal(await page.locator('#chat-model-select').inputValue(),'provider:omniroute');
    assert.match(await page.locator('#chat-model-select').locator('option').allTextContents().then(x=>x.join(' ')),/☁ OmniRoute · automatisch bestes Modell/);
    await page.evaluate(()=>{state.settings.hasOmniRouteKey=false;state.settings.aiProvider='auto';$('ai-provider').value='auto';syncChatModelPicker()});
    assert.doesNotMatch(await page.locator('#chat-model-select').locator('option').allTextContents().then(x=>x.join(' ')),/OmniRoute/);
    assert.equal(await page.locator('#chat-model-wrap').isHidden(),false,'AI selection remains visible while disconnected');
    assert.match(await page.locator('#chat-model-select').locator('option').allTextContents().then(x=>x.join(' ')),/ChatGPT/);
    await page.evaluate(()=>{state.settings.hasOmniRouteKey=true;state.settings.aiProvider='auto';$('ai-provider').value='auto';syncChatModelPicker()});
    assert.equal(await page.locator('#chat-model-select').inputValue(),'provider:auto');
    assert.match(await page.locator('#chat-model-select').locator('option').allTextContents().then(x=>x.join(' ')),/Automatisch · verbundenes Konto zuerst.*OmniRoute/);
    console.log('OmniRoute appears in the chat model picker only after its endpoint key is saved and automatic mode remains selected by default.');
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
