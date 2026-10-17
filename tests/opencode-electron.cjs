const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const http=require('node:http');
const {_electron}=require('playwright');
(async()=>{
  const root=path.resolve(__dirname,'..'),profile=fs.mkdtempSync(path.join(os.tmpdir(),'modspire-opencode-')),runner=path.join(root,`.opencode-test-${process.pid}.cjs`);
  const requests=[];
  const server=http.createServer(async(req,res)=>{let raw='';for await(const c of req)raw+=c;const body=raw?JSON.parse(raw):null;requests.push({url:req.url,body,method:req.method});res.setHeader('Content-Type','application/json');const route=new URL(req.url,'http://localhost').pathname;
    if(route==='/global/health')return res.end(JSON.stringify({healthy:true,version:'test'}));
    if(route==='/provider')return res.end(JSON.stringify({all:[{id:'test',name:'Test provider',models:{model:{id:'model',name:'Chat model'}}},{id:'opencode',models:{'example-free':{id:'example-free',name:'Free model'}}}],connected:['test','opencode'],default:{test:'model'}}));
    if(route==='/session'&&req.method==='POST')return res.end(JSON.stringify({id:'ses_integration',permission:body.permission}));
    if(route.endsWith('/message'))return res.end(JSON.stringify({info:{},parts:[{type:'text',text:'Try Sodium. [[SEARCH: Sodium]]'}]}));
    res.end('true');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const baseUrl=`http://127.0.0.1:${server.address().port}`;
  fs.writeFileSync(runner,`const electron=require('electron');electron.app.setPath('userData',${JSON.stringify(profile)});class HiddenWindow extends electron.BrowserWindow{constructor(o){super({...o,show:false})}show(){}focus(){}}const M=require('module'),load=M._load;M._load=function(n,p,m){if(n==='electron'&&p?.filename===${JSON.stringify(path.join(root,'main.cjs'))})return {...electron,BrowserWindow:HiddenWindow};return load.call(this,n,p,m)};require(${JSON.stringify(path.join(root,'main.cjs'))});`);
  let app;
  try{
    app=await _electron.launch({args:[runner],timeout:20000});const page=await app.firstWindow();
    await page.waitForFunction(()=>typeof window.workshop?.saveOpenCode==='function'&&typeof connectOpenCode==='function');
    await page.evaluate(()=>{for(const [key,value]of Object.entries({'mw-demo-mode':'true','mw-local-model-notice-seen':'yes','mw-curseforge-notice-seen':'yes'}))localStorage.setItem(key,value)});
    await page.evaluate(async url=>{document.getElementById('opencode-url').value=url;await connectOpenCode()},baseUrl);
    assert.equal(await page.locator('#opencode-model').inputValue(),'test/model');
    assert.equal(await page.locator('#opencode-model option[value="opencode/example-free"]').isDisabled(),true);
    assert.equal(await page.locator('#chat-model-select option[value="opencode:test/model"]').count(),1);
    assert.equal(await page.locator('#chat-model-select option[value="opencode:opencode/example-free"]').count(),0);
    await page.locator('#chat-model-select').selectOption('opencode:test/model');
    await page.waitForFunction(async()=> (await window.workshop.getSettings()).aiProvider==='opencode');
    const answer=await page.evaluate(()=>window.workshop.askAI([{role:'user',content:'Find a performance mod'}],{language:'en',minecraftVersion:'1.21.1',loader:'fabric',mods:[]}));
    assert.ok(answer.searchTerms.some(t=>/sodium/i.test(t)),'OpenCode answer becomes selectable catalog terms');
    assert.ok(requests.some(r=>r.url.includes('/message')));
    assert.ok(requests.filter(r=>r.url.startsWith('/session')).every(r=>new URL(r.url,'http://localhost').searchParams.get('directory')===path.join(profile,'opencode-chat')));
    await page.reload();await page.waitForFunction(()=>document.querySelector('#opencode-model')?.value==='test/model');
    assert.equal(await page.locator('#chat-model-select').inputValue(),'opencode:test/model');
    assert.equal(await page.evaluate(async()=>Object.hasOwn(await window.workshop.getSettings(),'opencodePassword')),false);
    if(process.env.MODSPIRE_TEST_OPENCODE_NATIVE==='1'){
      await page.evaluate(async()=>{await window.workshop.saveOpenCode({baseUrl:'http://127.0.0.1:41741',username:'opencode',model:''});const result=await window.workshop.startOpenCode();if(!Array.isArray(result.models))throw Error('No native server catalog');const settings=await window.workshop.getSettings();if(!settings.hasOpenCodePassword)throw Error('Managed server is not password protected')});
      console.log('Native OpenCode startup and encrypted server-password storage passed.');
    }
    await page.evaluate(()=>{document.getElementById('settings-overlay').hidden=false;document.querySelectorAll('#launch-intro,.startup-credit').forEach(node=>node.remove())});
    fs.mkdirSync(path.join(root,'work','opencode-qa'),{recursive:true});
    await page.locator('.opencode-card').screenshot({path:path.join(root,'work','opencode-qa','settings.png')});
    console.log('OpenCode Electron: settings, connected-model selection, restricted free models, chat routing, Modrinth terms and persistence passed.');
  }finally{await app?.close();await new Promise(resolve=>server.close(resolve));fs.rmSync(runner,{force:true});if(path.dirname(profile)===os.tmpdir()&&path.basename(profile).startsWith('modspire-opencode-'))fs.rmSync(profile,{recursive:true,force:true})}
})().catch(error=>{console.error(error);process.exitCode=1});
