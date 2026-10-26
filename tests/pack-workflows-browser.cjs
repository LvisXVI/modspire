const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium}=require('playwright');
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const page=await browser.newPage();
    page.setDefaultTimeout(5000);
    await page.setContent('<div id="pack-workflows-panel"></div>');
    await page.addScriptTag({path:path.join(__dirname,'..','pack-workflows.js')});
    await page.evaluate(()=>{
      window.project={id:'a',name:'Pack',minecraftVersion:'1.21.1',loader:'fabric',mods:[{provider:'modrinth',id:'sodium',title:'Sodium',versionId:'old',versionNumber:'1'}]};
      window.messages=[];window.applied=[];
      window.exportedFormats=[];
      WorkshopPackWorkflows.init({getProject:()=>project,getLocale:()=> 'en',status:text=>messages.push(text),checkUpdates:()=>new Promise(resolve=>window.finish=resolve),applyUpdates:(entries,key)=>{applied.push({entries,key})},exportMrpack:async()=>({canceled:true}),exportCurseForge:async project=>{exportedFormats.push(project);return {canceled:false}}});
    });
    await page.getByRole('button',{name:'Check mod updates',exact:true}).click();
    await page.evaluate(()=>finish({entries:[{key:'modrinth:sodium',mod:project.mods[0],status:'update',candidate:{...project.mods[0],versionId:'new',versionNumber:'2'}}]}));
    assert.ok((await page.locator('#pack-workflows-panel').textContent()).includes('1 → 2'));
    await page.locator('input[type="checkbox"]').check();
    await page.getByRole('button',{name:'Apply selected versions',exact:true}).click();
    assert.equal(await page.evaluate(()=>applied[0].entries[0].candidate.versionId),'new');
    await page.getByRole('button',{name:'Check mod updates',exact:true}).click();
    await page.evaluate(()=>{project.id='another';finish({entries:[{key:'modrinth:sodium',mod:project.mods[0],status:'update',candidate:{...project.mods[0],versionId:'stale',versionNumber:'3'}}]})});
    await page.waitForFunction(()=>document.getElementById('pack-workflows-panel').textContent.includes('changed'));
    assert.equal(await page.getByRole('button',{name:'Apply selected versions',exact:true}).isEnabled(),false,'stale results cannot be applied');
    await page.getByRole('button',{name:'Export .mrpack',exact:true}).click();
    assert.equal(await page.evaluate(()=>messages.some(text=>text.includes('exported'))),false,'cancelled export must not claim success');
    await page.locator('#export-loader-version').fill('0.16.10');
    await page.evaluate(()=>{project.id='third';WorkshopPackWorkflows.render()});
    assert.equal(await page.locator('#export-loader-version').inputValue(),'','an export loader override cannot leak into another pack with the same setup');
    await page.evaluate(()=>{project.mods=[{provider:'curseforge',id:'123',title:'CF test'}];WorkshopPackWorkflows.render()});
    await page.getByRole('button',{name:'Export CurseForge ZIP',exact:true}).click();
    assert.equal(await page.evaluate(()=>exportedFormats[0].mods[0].id),'123','CurseForge-only packs use their native manifest export');
    await page.evaluate(()=>{project.mods.push({provider:'modrinth',id:'sodium'});WorkshopPackWorkflows.render()});
    await page.getByRole('button',{name:'Export launcher pack',exact:true}).click();
    assert.equal(await page.evaluate(()=>exportedFormats.length),1,'mixed provider packs cannot silently drop entries');
    assert.match(await page.locator('#pack-workflows-panel').textContent(),/mixed|provider/i);
    console.log('Update UI: explicit check, candidate preview/selection, project race protection and canceled export passed.');
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
