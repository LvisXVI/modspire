'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

// The browser uses the same application handlers as the Electron preload.
const METHODS = Object.freeze({
  getDiagnostics:'diagnostics:get',reportError:'diagnostics:report',openDiagnosticsFolder:'diagnostics:open-folder',exportDiagnostics:'diagnostics:export',
  getSettings:'settings:get',setUsername:'settings:set-username',setSecret:'settings:set-secret',
  getLocalModels:'local-ai:models',saveLocalAi:'local-ai:save',saveOmniRoute:'omniroute:save',testOmniRoute:'omniroute:test',importLocalGguf:'local-ai:import-gguf',
  getChatGPTStatus:'chatgpt:status',connectChatGPT:'chatgpt:connect',disconnectChatGPT:'chatgpt:disconnect',cancelChatGPTSignIn:'chatgpt:cancel-sign-in',openChatGPTUsage:'chatgpt:open-usage',
  readClipboard:'clipboard:read',writeClipboard:'clipboard:write',searchMods:'mods:search',getModDetails:'mods:details',resolveRequiredDependencies:'mods:required-dependencies',findBestSetup:'mods:best-setup',getGameVersions:'mods:versions',getPopularMods:'mods:popular',
  importModrinthProfile:'modrinth:import-profile',importModrinthFile:'modrinth:import-file',checkCompatibility:'compatibility:check',askAI:'chat:ask',
  loadProject:'project:load',saveProject:'project:save',listProjects:'projects:list',createProject:'projects:create',switchProject:'projects:switch',exportProject:'project:export',
  openLauncher:'launcher:open',openExternal:'app:open-external',startVoiceInput:'voice:start',stopVoiceInput:'voice:stop',returnToDesktop:'web:stop',reportWebReturnError:'web:return-error'
});
const EVENTS = Object.freeze({onLocalAiProgress:'local-ai:progress',onChatProgress:'chat:progress',onVoiceInputEvent:'voice:event',onPrepareWebReturn:'web:prepare-return'});
const STATIC = new Set(['styles.css','visual-fixes.css','modern-ui.css','v3-ui.css','v4-ui.css','renderer.js','i18n.js','design-manager.cjs','v3-ui.js','v4-ui.js','modern-ui.js','diagnostics-ui.js','web-bridge.js','web-bootstrap.js','local-web-ui.js','local-web.css']);
const MIME={'.css':'text/css','.js':'text/javascript','.cjs':'text/javascript','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2','.woff':'font/woff','.gif':'image/gif'};
const random=()=>crypto.randomBytes(32).toString('hex');

async function createLocalWebServer({root,invoke,preferences={},onEditorDisconnected=()=>{}}) {
  const launches=new Map(),sessions=new Set(),clients=new Set();
  const cleanPreferences=value=>Object.fromEntries(Object.entries(value||{}).filter(([key,text])=>key.startsWith('mw-')&&typeof text==='string'&&text.length<4000000));
  let currentPreferences=cleanPreferences(preferences);
  let origin,closed=false,editor=null,pendingReturn=false;
  const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
  const body=async req=>{
    let size=0;const parts=[];
    for await(const chunk of req){size+=chunk.length;if(size>16*1024*1024)throw Object.assign(new Error('Request too large'),{status:413});parts.push(chunk);}
    return parts.length?JSON.parse(Buffer.concat(parts).toString('utf8')):{};
  };
  const authenticated=req=>sessions.has((req.headers.cookie||'').split(';').map(part=>part.trim()).find(part=>part.startsWith('mw_session='))?.slice(11));
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Content-Security-Policy',"frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
    try {
      if(req.headers.host!==new URL(origin).host||!['127.0.0.1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress))return json(res,403,{error:'Local access only'});
      if(req.headers.origin&&req.headers.origin!==origin)return json(res,403,{error:'Invalid origin'});
      const url=new URL(req.url,origin);
      if(url.pathname==='/favicon.ico'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'image/x-icon'});return res.end(await fs.readFile(path.join(root,'assets/modpack-werkstatt.ico')));}
      if(req.method==='POST'&&req.headers.origin!==origin)return json(res,403,{error:'Origin required'});
      if(url.pathname==='/session'&&req.method==='POST'){
        const token=req.headers.authorization?.replace(/^Bearer /,'');const expiry=launches.get(token);launches.delete(token);
        if(!expiry||expiry<Date.now())return json(res,401,{error:'Open the web version from the desktop app again'});
        const session=random();sessions.add(session);
        res.setHeader('Set-Cookie',`mw_session=${session}; HttpOnly; SameSite=Strict; Path=/`);
        return json(res,200,{preferences:currentPreferences});
      }
      if(url.pathname==='/'&&req.method==='GET'){
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
        return res.end('<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Modpack-Werkstatt · Lokal</title><link rel="stylesheet" href="/local-web.css"></head><body class="web-bootstrap"><main><span aria-hidden="true">◈</span><h1>Modpack-Werkstatt</h1><p id="web-bootstrap-status" role="status">Lokale Web-Version wird gestartet …</p></main><script src="/web-bootstrap.js"></script></body></html>');
      }
      const publicFile=['/web-bootstrap.js','/local-web.css'].includes(url.pathname);
      if(!publicFile&&!authenticated(req))return json(res,401,{error:'Local session required'});
      if(url.pathname==='/client'&&req.method==='POST'){
        const {client}=await body(req);
        if(typeof client!=='string'||! /^[a-f0-9-]{16,64}$/i.test(client))return json(res,400,{error:'Invalid client'});
        if(editor&&editor.id!==client&&(clients.size||editor.expires>Date.now()))return json(res,200,{granted:false,retryAfterMs:clients.size?0:Math.max(0,editor.expires-Date.now())});
        editor={id:client,expires:Date.now()+5000};return json(res,200,{granted:true});
      }
      if(['/rpc','/preferences'].includes(url.pathname)&&(!editor||req.headers['x-workshop-client']!==editor.id))return json(res,409,{error:'This workshop is already open in another browser tab'});
      if(url.pathname==='/save-unload'&&req.method==='POST'){
        if(!editor||url.searchParams.get('client')!==editor.id)return json(res,409,{error:'Inactive editor'});
        const project=await body(req);if(!project?.id)return json(res,400,{error:'Uninitialized project'});
        await invoke('project:save',[project]);return json(res,200,{saved:true});
      }
      if(url.pathname==='/preferences'&&req.method==='POST'){
        currentPreferences=cleanPreferences(await body(req));return json(res,200,{saved:true});
      }
      if(url.pathname==='/rpc'&&req.method==='POST'){
        if(!req.headers['content-type']?.startsWith('application/json'))return json(res,415,{error:'JSON required'});
        const request=await body(req);
        if(!Object.hasOwn(METHODS,request.method)||!Array.isArray(request.args))return json(res,400,{error:'Unknown application action'});
        const value=await invoke(METHODS[request.method],request.args);
        return json(res,200,{value});
      }
      if(url.pathname==='/events'&&req.method==='GET'){
        if(url.searchParams.get('client')!==editor?.id)return json(res,409,{error:'Inactive editor'});
        res.writeHead(200,{'Content-Type':'text/event-stream','Connection':'keep-alive'});res.write(': connected\n\n');clients.add(res);
        if(pendingReturn){pendingReturn=false;res.write(`data: ${JSON.stringify({channel:'web:prepare-return',detail:{}})}\n\n`);}
        res.on('close',()=>{clients.delete(res);if(!clients.size&&editor){editor.expires=Date.now()+5000;onEditorDisconnected();}});return;
      }
      if(url.pathname==='/web-config.js'&&req.method==='GET'){
        res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'});return res.end(`window.workshopWebConfig=${JSON.stringify({methods:METHODS,events:EVENTS})};`);
      }
      if(req.method!=='GET')return json(res,405,{error:'Method not allowed'});
      if(url.pathname==='/in-use'){
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end('<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Modpack-Werkstatt</title><link rel="stylesheet" href="/local-web.css"><link rel="icon" href="/favicon.ico"></head><body class="web-bootstrap"><main><h1>Modpack-Werkstatt</h1><p>Diese Werkstatt ist bereits in einem anderen Browser-Tab geöffnet.<br>This workshop is already open in another browser tab.</p><p>Bitte arbeite dort weiter. / Please continue there.</p></main></body></html>');
      }
      if(url.pathname==='/app'){
        const html=await fs.readFile(path.join(root,'index.html'),'utf8');res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
        return res.end(html.replace('<head>','<head><script src="/web-config.js"></script><script src="/web-bridge.js"></script>'));
      }
      const relative=decodeURIComponent(url.pathname).slice(1);
      if(relative.includes('..')||relative.includes('\\')||(!STATIC.has(relative)&&!/^assets\/[\w./ -]+$/.test(relative)))return json(res,404,{error:'Not found'});
      const file=path.resolve(root,relative);
      if(!file.startsWith(path.resolve(root)+path.sep))return json(res,404,{error:'Not found'});
      const data=await fs.readFile(file);res.writeHead(200,{'Content-Type':`${MIME[path.extname(file)]||'application/octet-stream'}`});res.end(data);
    } catch(error){if(!res.headersSent)json(res,error.status|| (error.code==='ENOENT'?404:500),{error:error.message});else res.end();}
  });
  server.requestTimeout=300000;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  origin=`http://127.0.0.1:${server.address().port}`;
  const heartbeat=setInterval(()=>{for(const client of clients)client.write(': heartbeat\n\n');for(const [token,expiry] of launches)if(expiry<Date.now())launches.delete(token);},20000);heartbeat.unref();
  return {
    origin,
    preferences:()=>({...currentPreferences}),
    hasEditor:()=>!!editor&&(clients.size>0||editor.expires>Date.now()),
    connectionCount:()=>clients.size,
    requestReturn(){pendingReturn=clients.size===0;for(const client of clients)client.write(`data: ${JSON.stringify({channel:'web:prepare-return',detail:{}})}\n\n`);},
    launchUrl(){const token=random();launches.set(token,Date.now()+60000);return `${origin}/#${token}`;},
    broadcast(channel,detail){if(!Object.values(EVENTS).includes(channel))return;for(const client of clients)client.write(`data: ${JSON.stringify({channel,detail})}\n\n`);},
    async close(){if(closed)return;closed=true;clearInterval(heartbeat);for(const client of clients)client.end();clients.clear();sessions.clear();launches.clear();await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});}
  };
}
module.exports={createLocalWebServer,METHODS,EVENTS};
