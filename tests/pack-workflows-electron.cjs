const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {_electron}=require('playwright');
const {readIndex}=require('../mrpack.cjs');
(async()=>{
  const root=path.resolve(__dirname,'..'),profile=fs.mkdtempSync(path.join(os.tmpdir(),'modspire-workflows-'));
  const runner=path.join(root,`.pack-workflows-${process.pid}.cjs`),output=path.join(profile,'test.mrpack');let app;
  const mod={provider:'modrinth',id:'testmod',title:'Test mod',versionId:'old',versionNumber:'1',compatibility:'1.21.1 · fabric',source:'Modrinth'};
  fs.writeFileSync(path.join(profile,'projects.json'),JSON.stringify({activeId:'test',projects:[{id:'test',name:'Workflow QA',minecraftVersion:'1.21.1',loader:'fabric',mods:[mod],turns:[]}]}));
  fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({username:'QA'}));
  fs.writeFileSync(runner,`const e=require('electron');e.app.setPath('userData',${JSON.stringify(profile)});e.dialog.showSaveDialog=async()=>({canceled:false,filePath:${JSON.stringify(output)}});class Hidden extends e.BrowserWindow{constructor(o){super({...o,show:false})}show(){}focus(){}}const M=require('node:module'),load=M._load;M._load=function(n,p,m){if(n==='electron'&&p?.filename===${JSON.stringify(path.join(root,'main.cjs'))})return {...e,BrowserWindow:Hidden};return load.call(this,n,p,m)};const version=id=>({id,project_id:'testmod',version_number:id==='new'?'2':'1',version_type:'release',date_published:id==='new'?'2026-10-19T00:00:00Z':'2026-01-01T00:00:00Z',game_versions:['1.21.1'],loaders:['fabric'],dependencies:[],files:[{filename:'testmod.jar',url:'https://cdn.modrinth.com/data/testmod/versions/'+id+'/testmod.jar',primary:true,size:3,hashes:{sha1:'0'.repeat(40),sha512:'1'.repeat(128)}}]});global.fetch=async value=>{const u=new URL(String(value));let body={};if(u.hostname==='api.modrinth.com'){if(u.pathname.endsWith('/search'))body={hits:[]};else if(u.pathname==='/v2/project/testmod/version')body=[version('new'),version('old')];else if(u.pathname==='/v2/version/old')body=version('old');else if(u.pathname==='/v2/version/new')body=version('new');else if(u.pathname==='/v2/project/testmod')body={id:'testmod',slug:'testmod',title:'Test mod',project_type:'mod',client_side:'required',server_side:'unsupported'};else if(u.pathname.includes('/tag/'))body=[];else body=[]}else if(u.hostname==='meta.fabricmc.net')body=[{loader:{version:'0.16.10',stable:true},intermediary:{version:'1.21.1'}}];else body=[];return new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json'}})};require(${JSON.stringify(path.join(root,'main.cjs'))});`);
  try{
    app=await _electron.launch({args:[runner],timeout:20000});const page=await app.firstWindow();
    await page.waitForFunction(()=>typeof state!=='undefined'&&state.projectLoaded===true);
    assert.equal(await page.evaluate(()=>typeof workshop.listBookmarks),'function','real preload must expose bookmark storage');
    await page.evaluate(()=>{document.querySelectorAll('[aria-modal="true"],.launch-intro,.startup-credit').forEach(node=>{node.hidden=true;node.style.display='none'});document.body.classList.remove('startup-gated');showView('lab')});
    await page.evaluate(async()=>{await workshop.saveBookmark({mod:state.project.mods[0],note:'For friends'});await WorkshopPackLibrary.render({refresh:true})});
    assert.ok((await page.locator('#pack-library-panel').textContent()).includes('Test mod'));
    await page.evaluate(async()=>{const old=state.project.id;const store=await workshop.createProject('Second');const items=await workshop.listBookmarks();if(items[0].note!=='For friends')throw Error('Cross-pack bookmark missing');await workshop.switchProject(old)});
    await page.getByRole('button',{name:/Check mod updates|Mod-Updates prüfen/,exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('#pack-workflows-panel').textContent.includes('1 → 2'));
    await page.locator('#pack-workflows-panel input[type="checkbox"]').check();
    await page.getByRole('button',{name:/Apply selected versions|Ausgewählte Versionen anwenden/,exact:true}).click();
    await page.waitForFunction(()=>state.project.mods[0].versionId==='new');
    assert.equal(await page.evaluate(()=>state.project.snapshots.at(-1).data.mods[0].versionId),'old','applying updates must back up concrete previous versions');
    await page.evaluate(()=>save());
    assert.equal(await page.evaluate(async()=>(await workshop.loadProject()).mods[0].versionId),'new','updated versions persist through real storage');
    await page.getByRole('button',{name:/Export \.mrpack|\.mrpack exportieren/,exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('#pack-workflows-panel').textContent.includes('exported')||document.querySelector('#pack-workflows-panel').textContent.includes('exportiert'));
    const index=readIndex(fs.readFileSync(output));assert.equal(index.dependencies.minecraft,'1.21.1');assert.equal(index.dependencies['fabric-loader'],'0.16.10');assert.equal(index.files.length,1);assert.ok(index.files[0].downloads[0].includes('/new/'));
    const screenshots=path.join(root,'work','pack-workflows');fs.mkdirSync(screenshots,{recursive:true});await page.screenshot({path:path.join(screenshots,'electron-lab.png')});
    await page.evaluate(async()=>{state.project.loaderVersion='0.16.10';await save();const store=await workshop.createProject('Empty comparison');await switchProject(store.activeId);if(state.project.snapshots?.length)throw Error('Snapshots leaked across projects');if(state.project.loaderVersion)throw Error('Loader version leaked across projects');await switchProject('test')});
    console.log('Real Electron: bookmark persistence across packs, update preview/apply backup, saved pins and concrete .mrpack export passed.');
  }finally{
    await app?.close();fs.rmSync(runner,{force:true});
    if(path.dirname(path.resolve(profile))!==path.resolve(os.tmpdir())||!path.basename(profile).startsWith('modspire-workflows-'))throw Error('Unexpected cleanup target');
    fs.rmSync(profile,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1});
