'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {_electron,chromium}=require('playwright');
(async()=>{
 const root=path.resolve(__dirname,'..'),temporary=await fs.mkdtemp(path.join(os.tmpdir(),'modspire-studio-qa-'));
 const dataDir=path.join(temporary,'studio-data'),runner=path.join(root,'.studio-qa-'+process.pid+'.cjs'),launchFile=path.join(temporary,'launch.json');
 await fs.writeFile(runner,[
 "const electron=require('electron');const {app,shell}=electron;",
 "app.setPath('userData',"+JSON.stringify(path.join(temporary,'modspire-data'))+");",
 "shell.openExternal=async url=>require('node:fs').writeFileSync("+JSON.stringify(launchFile)+",JSON.stringify(url));",
 "class HiddenWindow extends electron.BrowserWindow{constructor(options){super({...options,show:false})}show(){}focus(){}}",
 "const Module=require('node:module'),original=Module._load;",
 "Module._load=function(name,parent,main){",
 "if(name==='electron'&&parent?.filename==="+JSON.stringify(path.join(root,'main.cjs'))+")return {...electron,BrowserWindow:HiddenWindow};",
 "if(name==='./mod-studio.cjs'&&parent?.filename==="+JSON.stringify(path.join(root,'main.cjs'))+"){const implementation=original.call(this,name,parent,main);return {createModStudio:options=>implementation.createModStudio({...options,dataDir:"+JSON.stringify(dataDir)+",runtimeCache:"+JSON.stringify(path.join(root,'.mod-studio-runtime','qa-cache'))+"})};}",
 "return original.call(this,name,parent,main);};require("+JSON.stringify(path.join(root,'main.cjs'))+");"
 ].join('\n'));
 let app,browser,origin;
 try{
  app=await _electron.launch({args:[runner],timeout:30000});
  const desktop=await app.firstWindow();
  await desktop.waitForSelector('#nav-mod-creator',{state:'attached'});
  await desktop.evaluate(()=>{for(const [key,value]of Object.entries({'mw-demo-mode':'true','mw-local-model-notice-seen':'yes','mw-curseforge-notice-seen':'yes','mw-ui-mode':'classic','mw-theme':'clear'}))localStorage.setItem(key,value)});
  await desktop.reload();await desktop.waitForFunction(()=>state.projectLoaded===true);
  const before=await desktop.evaluate(()=>JSON.stringify(state.project));
  await desktop.locator('#nav-mod-creator').click();
  await desktop.waitForFunction(()=>!document.querySelector('#nav-mod-creator').disabled,null,{timeout:240000});
  console.log('Studio launch status:',await desktop.locator('#status-text').textContent());
  const launch=JSON.parse(await fs.readFile(launchFile,'utf8'));origin=new URL(launch).origin;
  assert.equal(new URL(launch).hostname,'127.0.0.1');
  assert.equal(await desktop.evaluate(()=>JSON.stringify(state.project)),before,'opening Studio preserves modpack');
  assert.equal(await desktop.locator('.app-shell').evaluate(node=>node.inert),false);
  assert.equal((await(await fetch(origin+'/api/health')).json()).ok,true);
  assert.equal((await fetch(origin+'/api/projects',{headers:{Origin:'https://example.com'}})).status,403);
  assert.equal((await fetch(origin+'/api/projects',{method:'POST',body:'{}'})).status,403);
  const rebound=await new Promise((resolve,reject)=>require('node:http').get(origin+'/api/projects',{headers:{Host:'evil.example'}},res=>{res.resume();resolve(res.statusCode)}).on('error',reject));
  assert.equal(rebound,403);
  browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(launch);
  assert.equal(await page.locator('.browser-demo-banner').count(),0);
  await page.locator('#new-project-button').click();
  await page.locator('#project-name-input').fill('Integrated Studio QA');
  await page.locator('#new-project-form button[type="submit"]').click();
  await page.locator('#add-element-button').click();
  await page.locator('#element-name').fill('Studio Crystal');
  await page.locator('#element-name').press('Tab');
  await page.waitForTimeout(1800);
  const list=await(await fetch(origin+'/api/projects')).json();
  assert.equal(list.projects.length,1);
  const id=list.projects[0].id,projectResult=await(await fetch(origin+'/api/projects/'+id)).json();
  assert.equal(projectResult.project.elements[0].name,'Studio Crystal');
  const disk=JSON.parse(await fs.readFile(path.join(dataDir,'projects',id,'project.json'),'utf8'));
  assert.equal(disk.elements[0].name,'Studio Crystal');
  const source=await fetch(origin+'/api/projects/'+id+'/source');
  assert.equal(source.status,200);assert.equal(Buffer.from(await source.arrayBuffer()).subarray(0,2).toString(),'PK');
  const build=await(await fetch(origin+'/api/projects/'+id+'/build')).json();
  assert.equal(build.ready,true,'real bundled JDK and Gradle available');
  await page.locator('[data-view="build"]').click();
  assert.equal(await page.locator('#build-button').isEnabled(),true);
  assert.equal((await(await fetch(origin+'/api/updates')).json()).managedBy,'Modspire');
  await page.reload();await page.locator('#project-list button').first().click();
  await page.waitForFunction(()=>document.querySelector('#element-name').value==='Studio Crystal');
  await page.screenshot({path:path.join(root,'.mod-studio-runtime','integrated-studio-qa.png')});
  for(const mode of ['modern','v3','v4']){
   await desktop.locator('#sidebar-ui-mode').click();await desktop.locator('#ui-mode-'+mode).click();
   await desktop.locator('#nav-mod-creator').click();
   await desktop.waitForFunction(()=>!document.querySelector('#nav-mod-creator').disabled);
   assert.equal(JSON.parse(await fs.readFile(launchFile,'utf8')),launch,mode+' reuses real Studio');
  }
  assert.deepEqual(errors,[]);
  await browser.close();browser=null;await app.close();app=null;
  await assert.rejects(fetch(origin+'/api/health',{signal:AbortSignal.timeout(5000)}));
  console.log('PASS: all four UIs, real Studio editing, disk persistence, source ZIP, build tools, reuse, origin protection and shutdown.');
 }finally{
  await browser?.close();await app?.close();await fs.unlink(runner).catch(()=>{});
  const relative=path.relative(os.tmpdir(),temporary);
  if(relative.startsWith('modspire-studio-qa-')&&!relative.includes(path.sep))await fs.rm(temporary,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1});
