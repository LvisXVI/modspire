const assert = require('node:assert/strict');
const http = require('node:http');
const { normalizeOpenCodeUrl, listOpenCodeModels, askOpenCode } = require('../opencode.cjs');
(async () => {
  for (const url of ['https://evil.example','http://127.0.0.1.evil.example','http://user:pass@localhost:4096','file:///test','http://localhost:4096/path']) assert.throws(() => normalizeOpenCodeUrl(url));
  assert.equal(normalizeOpenCodeUrl('http://[::1]:4096/'),'http://[::1]:4096');
  let mode='ok'; const calls=[];
  const server=http.createServer(async(req,res)=>{
    let raw=''; for await(const chunk of req) raw+=chunk;
    const body=raw?JSON.parse(raw):null;calls.push({url:req.url,method:req.method,body,auth:req.headers.authorization});
    res.setHeader('Content-Type','application/json');
    if(mode==='auth'){res.statusCode=401;return res.end('{}')}
    const route=new URL(req.url,'http://localhost').pathname;
    if(route==='/global/health')return res.end(JSON.stringify({healthy:true,version:'test'}));
    if(route==='/provider')return res.end(JSON.stringify({connected:['local','opencode'],default:{local:'model'},all:[{id:'local',name:'Local',models:{model:{id:'model',name:'Test model'},retired:{id:'retired',status:'deprecated'}}},{id:'opencode',models:{'test-free':{id:'test-free'}}},{id:'not-connected',models:{paid:{id:'paid'}}}]}));
    if(route==='/session'&&req.method==='POST')return res.end(JSON.stringify({id:'ses_test',permission:mode==='unsafe'?[]:body.permission}));
    if(route.endsWith('/message'))return res.end(JSON.stringify(mode==='model-error'?{info:{error:{data:{message:'Quota exceeded'}}},parts:[]}:{info:{},parts:[{type:'reasoning',text:'private'},{type:'text',text:'[[SEARCH: Sodium]]'}]}));
    return res.end('true');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const config={baseUrl:`http://127.0.0.1:${server.address().port}`,model:'local/model',username:'opencode',password:'test-secret',directory:'C:/modspire-isolated'};
  try{
    assert.deepEqual((await listOpenCodeModels(config)).models.map(m=>m.id),['local/model','opencode/test-free']);
    assert.equal(await askOpenCode(config,'System rules',[{role:'user',content:'Find performance mods'}]),'[[SEARCH: Sodium]]');
    const create=calls.find(c=>c.url.startsWith('/session?')&&c.method==='POST');
    assert.deepEqual(create.body.permission,[{permission:'*',pattern:'*',action:'deny'}]);
    assert.ok(calls.filter(c=>!c.url.startsWith('/global/health')).every(c=>new URL(c.url,'http://localhost').searchParams.get('directory')===config.directory));
    assert.ok(calls.some(c=>c.method==='DELETE'&&c.url.includes('ses_test')));
    assert.ok(calls.every(c=>c.auth==='Basic '+Buffer.from('opencode:test-secret').toString('base64')));
    const prompt=calls.find(c=>c.url.includes('/message')).body;
    assert.match(prompt.system,/System rules/);assert.match(prompt.parts[0].text,/Find performance mods/);
    await assert.rejects(()=>askOpenCode({...config,model:'opencode/test-free'},'',[]),/own client/);
    await assert.rejects(()=>askOpenCode(config,'',[{role:'user',content:[{type:'input_image',image_url:'data:image/png;base64,AAAA'}]}]),/image input/);
    mode='unsafe';await assert.rejects(()=>askOpenCode(config,'',[]),/permissions/i);
    mode='model-error';await assert.rejects(()=>askOpenCode(config,'',[]),/Quota exceeded/);
    mode='auth';await assert.rejects(()=>listOpenCodeModels(config),/password/i);
    console.log('OpenCode: loopback validation, connected models, auth, denied tools, isolated sessions, replies, cleanup and errors passed.');
  }finally{await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exitCode=1});
