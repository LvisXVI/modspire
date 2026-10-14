const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const {buildModrinthSearch}=require('../catalog-search.cjs');

(async()=>{
  for(const sort of ['relevance','downloads','follows','newest','updated']){
    const url=buildModrinthSearch({query:'',category:'worldgen',environment:'client_only',openSource:true,sort,minecraftVersion:'1.20.1',loader:'forge',offset:24,limit:24});
    assert.equal(url.searchParams.get('index'),sort);
    assert.deepEqual(JSON.parse(url.searchParams.get('facets')),[['project_type:mod'],['versions:1.20.1'],['categories:forge'],['categories:worldgen'],['environment:client_only'],['open_source:true']]);
    assert.equal(url.searchParams.get('offset'),'24');
  }
  const safe=buildModrinthSearch({category:'worldgen"]',environment:'invalid',sort:'invalid',offset:-1,limit:999});
  assert.equal(safe.searchParams.get('index'),'relevance');assert.equal(safe.searchParams.get('limit'),'50');assert.equal(safe.searchParams.get('offset'),'0');assert.equal(JSON.parse(safe.searchParams.get('facets')).length,3);
  const visual=buildModrinthSearch({query:'dynamic lights',kind:'visual',categories:['decoration','utility','game-mechanics','not-a-category'],minecraftVersion:'1.21.1',loader:'fabric'});
  assert.equal(visual.searchParams.get('query'),'dynamic lights');
  assert.deepEqual(JSON.parse(visual.searchParams.get('facets')),[['project_type:mod'],['versions:1.21.1'],['categories:fabric'],['categories:decoration','categories:utility','categories:game-mechanics']],'visual search should combine its text query with validated OR category facets');
  const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8'),source=fs.readFileSync(path.join(root,'renderer.js'),'utf8');
  const markup=html.match(/<details class="catalog-search"[\s\S]*?<\/details>/)[0];
  const fn=source.slice(source.indexOf('async function runCatalogSearch('),source.indexOf('\nasync function searchMods('));
  const handlers=source.slice(source.indexOf("$('catalog-search-form').onsubmit"),source.indexOf("$('mod-search-modes').querySelectorAll"));
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const page=await browser.newPage();await page.emulateMedia({reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.setContent('<body data-theme="blue">'+markup+'<select id="project-select"></select><select id="minecraft-version"></select><select id="loader"></select><div id="refinement-row"></div><div id="results-hint"></div><div id="mod-results"></div><button id="catalog-more" hidden>More</button></body>');
    await page.addStyleTag({path:path.join(root,'styles.css')});await page.addStyleTag({path:path.join(root,'visual-fixes.css')});
    await page.evaluate(({fn,handlers})=>{
      window.$=id=>document.getElementById(id);window.state={project:{id:'preview',minecraftVersion:'1.20.1',loader:'forge'},searchGeneration:0,batchSelection:new Set(),currentView:'mods'};
      window.calls=[];window.renderResults=items=>window.shown=items;window.setStatus=message=>window.statusText=message;window.workshopI18n={locale:'en'};
      window.workshop={searchMods:async input=>{calls.push(input);return input.offset? [{id:'48',provider:'modrinth'},{id:'49',provider:'modrinth'}]:Array.from({length:48},(_,id)=>({id:String(id),provider:'modrinth'}))}};
      new Function(fn+'\n'+handlers)();document.getElementById('catalog-search-panel').open=true;
    },{fn,handlers});
    const checkbox=page.locator('#catalog-open-source');
    await page.waitForFunction(()=>getComputedStyle(document.body).getPropertyValue('--dialog-card').trim()!==''&&document.body.dataset.theme==='blue');
    const uncheckedStyle=await checkbox.evaluate(node=>({appearance:getComputedStyle(node).appearance,background:getComputedStyle(node).backgroundColor,border:getComputedStyle(node).borderTopColor,surface:getComputedStyle(document.body).getPropertyValue('--dialog-card'),theme:document.body.dataset.theme}));
    assert.equal(uncheckedStyle.appearance,'none','theme checkbox should replace the browser-default white square');
    assert.notEqual(uncheckedStyle.background,'rgba(0, 0, 0, 0)','unchecked checkbox should inherit its theme surface');
    assert.notEqual(uncheckedStyle.background,'rgb(255, 255, 255)','unchecked checkbox should not become a white theme outlier');
    for(const theme of ['blue','fluid','aurora','clear','translucent','redstone','ender','emerald','nether']){
      await page.evaluate(value=>document.body.dataset.theme=value,theme);
      const themed=await checkbox.evaluate(node=>({appearance:getComputedStyle(node).appearance,background:getComputedStyle(node).backgroundColor}));
      assert.equal(themed.appearance,'none',`${theme} checkbox should stay custom themed`);
      assert.notEqual(themed.background,'rgba(0, 0, 0, 0)',`${theme} checkbox should have an opaque or translucent theme surface`);
      assert.notEqual(themed.background,'rgb(255, 255, 255)',`${theme} checkbox should not render as a white square`);
    }
    await page.evaluate(()=>document.body.dataset.theme='blue');
    await page.locator('#catalog-category').selectOption('worldgen');await page.locator('#catalog-environment').selectOption('client_only');await page.locator('#catalog-sort').selectOption('newest');await checkbox.check();
    const checkedStyle=await checkbox.evaluate(node=>({checked:node.checked,background:getComputedStyle(node).backgroundColor}));
    assert.equal(checkedStyle.checked,true);assert.notEqual(checkedStyle.background,uncheckedStyle.background,'checked state should use the current theme accent');
    await page.locator('#catalog-submit').click();
    await page.waitForFunction(()=>window.shown?.length===48);
    const first=await page.evaluate(()=>calls[0]);assert.equal(first.query,'');assert.equal(first.category,'worldgen');assert.equal(first.environment,'client_only');assert.equal(first.sort,'newest');assert.equal(first.openSource,true);assert.equal(first.provider,'modrinth');assert.equal(first.limit,48);
    await page.locator('#catalog-more').click();await page.waitForFunction(()=>window.shown?.length===50);assert.equal(await page.evaluate(()=>calls[1].offset),48);assert.equal(await page.locator('#catalog-more').isHidden(),true);
    await page.evaluate(()=>{window.workshop.searchMods=input=>new Promise(resolve=>window.finishSearch=resolve)});await page.locator('#catalog-submit').click();
    await page.waitForFunction(()=>typeof window.finishSearch==='function');await page.locator('#catalog-category').selectOption('magic');await page.evaluate(()=>finishSearch([{id:'stale',provider:'modrinth'}]));
    assert.equal(await page.evaluate(()=>shown.some(mod=>mod.id==='stale')),false);assert.equal(await page.locator('#catalog-submit').isEnabled(),true);
    assert.deepEqual(errors,[]);console.log('Catalogue filters, API sorts, blank-query browsing, paging, deduplication and stale-request protection passed.');
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
