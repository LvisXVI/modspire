const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createLocalWebServer, METHODS } = require('../local-web.cjs');

(async () => {
  const root = path.resolve(__dirname, '..');
  const calls = [];
  const server = await createLocalWebServer({root, preferences:{'mw-theme':'ender'}, invoke:async (channel,args) => {calls.push({channel,args});return channel==='project:load'?{name:'Local test',mods:[]}:true;}});
  try {
    const origin=server.origin;
    assert.equal(new URL(origin).hostname,'127.0.0.1');
    assert.equal((await fetch(`${origin}/app`)).status,401);
    assert.equal((await fetch(`${origin}/rpc`,{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({method:'loadProject',args:[]})})).status,401);
    const launch=new URL(server.launchUrl());
    const auth=await fetch(`${origin}/session`,{method:'POST',headers:{origin,'Content-Type':'application/json',Authorization:`Bearer ${launch.hash.slice(1)}`}});
    assert.equal(auth.status,200);
    const cookie=auth.headers.get('set-cookie').split(';')[0];
    assert.ok(auth.headers.get('set-cookie').includes('HttpOnly'));
    assert.deepEqual((await auth.json()).preferences,{'mw-theme':'ender'});
    assert.equal((await fetch(`${origin}/rpc`,{method:'POST',headers:{cookie,origin,'Content-Type':'application/json'},body:JSON.stringify({method:'loadProject',args:[]})})).status,409,'an authenticated session still needs an editor lease');
    const client='11111111-1111-4111-8111-111111111111';
    const lease=()=>fetch(`${origin}/client`,{method:'POST',headers:{cookie,origin,'Content-Type':'application/json'},body:JSON.stringify({client})});
    assert.equal((await (await lease()).json()).granted,true);
    const duplicate=await fetch(`${origin}/client`,{method:'POST',headers:{cookie,origin,'Content-Type':'application/json'},body:JSON.stringify({client:'22222222-2222-4222-8222-222222222222'})});
    assert.equal((await duplicate.json()).granted,false,'a duplicated tab cannot become a stale writer');
    const rpc=(method,args=[],extra={})=>fetch(`${origin}/rpc`,{method:'POST',headers:{cookie,origin,'Content-Type':'application/json','X-Workshop-Client':client,...extra},body:JSON.stringify({method,args})});
    const result=await rpc('loadProject');assert.equal((await result.json()).value.name,'Local test');
    assert.equal((await rpc('loadProject',[],{origin:'https://evil.example'})).status,403);
    const wrongHost=await new Promise((resolve,reject)=>{const request=require('node:http').get(`${origin}/app`,{headers:{host:'evil.example',cookie}},response=>{response.resume();resolve(response.statusCode)});request.on('error',reject);});
    assert.equal(wrongHost,403);
    assert.equal((await rpc('arbitrary:filesystem')).status,400);
    assert.equal((await fetch(`${origin}/main.cjs`,{headers:{cookie}})).status,404);
    assert.equal((await fetch(`${origin}/package.json`,{headers:{cookie}})).status,404);
    assert.equal((await fetch(`${origin}/assets/%2e%2e%2fmain.cjs`,{headers:{cookie}})).status,404);
    assert.equal((await fetch(`${origin}/styles.css`,{headers:{cookie}})).status,200);
    const html=await (await fetch(`${origin}/app`,{headers:{cookie}})).text();
    assert.match(html,/web-bridge.js/);
    const source=fs.readFileSync(path.join(root,'preload.cjs'),'utf8');
    for (const match of source.matchAll(/(\w+):[^\n]*ipcRenderer\.invoke\('([^']+)'/g)) {
      if (match[1] === 'checkForUpdates' || match[1] === 'downloadUpdate' || match[1] === 'installUpdate') continue;
      if(!match[2].startsWith('window:')&&!match[2].startsWith('web:')) assert.equal(METHODS[match[1]],match[2],`browser exposes ${match[1]}`);
    }
    const controller=new AbortController();
    const stream=await fetch(`${origin}/events?client=${client}`,{headers:{cookie},signal:controller.signal});
    const reader=stream.body.getReader();await reader.read();
    server.broadcast('chat:progress',{requestId:'one',text:'Working'});
    const chunk=await reader.read();assert.match(Buffer.from(chunk.value).toString(),/Working/);controller.abort();
    const disconnectDeadline=Date.now()+1000;while(server.connectionCount()&&Date.now()<disconnectDeadline)await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(server.connectionCount(),0);
    assert.equal(server.hasEditor(),true,'temporary SSE interruption retains ownership during reconnect grace');
    server.requestReturn();
    const reconnectController=new AbortController();
    const reconnect=await fetch(`${origin}/events?client=${client}`,{headers:{cookie},signal:reconnectController.signal});
    assert.equal(reconnect.status,200);
    const reconnectReader=reconnect.body.getReader();let eventText=Buffer.from((await reconnectReader.read()).value).toString();if(!eventText.includes('web:prepare-return'))eventText+=Buffer.from((await reconnectReader.read()).value).toString();
    assert.match(eventText,/web:prepare-return/,'desktop return is delivered after a lost SSE connection recovers');reconnectController.abort();
    assert.equal(calls.length,1,'rejected requests never reach desktop handlers');
    console.log('Loopback web server: authentication, origin/host checks, static allowlist, API parity and streaming passed.');
  } finally { await server.close(); }
})().catch(error=>{console.error(error);process.exitCode=1});
