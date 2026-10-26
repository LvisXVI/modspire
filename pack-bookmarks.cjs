'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const keyFor=mod=>`${mod.provider}:${mod.id}`;
function cleanMod(mod){
  if(!mod||!['modrinth','curseforge'].includes(mod.provider)||!/^[A-Za-z0-9_-]{1,100}$/.test(String(mod.id||''))||!String(mod.title||'').trim())throw Error('Die Mod für die Merkliste ist ungültig. / Invalid bookmark mod.');
  const copy={provider:mod.provider,id:String(mod.id),title:String(mod.title).trim().slice(0,200)};
  for(const name of ['kind','summary','source','url','icon','compatibility','minecraftVersion','loader','versionId','versionNumber','clientSide','serverSide'])if(typeof mod[name]==='string')copy[name]=mod[name].slice(0,name==='summary'?3000:1000);
  if(Array.isArray(mod.categories))copy.categories=mod.categories.filter(item=>typeof item==='string').slice(0,50).map(item=>item.slice(0,100));
  return copy;
}
function createBookmarkStore({filePath}){
  let queue=Promise.resolve();
  async function read(){
    let raw;
    try{raw=JSON.parse(await fs.readFile(filePath,'utf8'))}catch(error){if(error.code==='ENOENT')return [];throw Error('Die Merkliste konnte nicht gelesen werden. / Could not read bookmarks.',{cause:error})}
    if(raw?.version!==1||!Array.isArray(raw.items)||raw.items.length>1000)throw Error('Die Merkliste ist beschädigt. / Invalid bookmark data.');
    return raw.items.map(item=>{
      const mod=cleanMod(item.mod);
      if(item.key!==keyFor(mod)||typeof item.note!=='string'||item.note.length>1000)throw Error('Die Merkliste ist beschädigt. / Invalid bookmark data.');
      return {...item,mod};
    });
  }
  async function write(items){
    await fs.mkdir(path.dirname(filePath),{recursive:true});
    const temporary=filePath+'.'+randomUUID()+'.tmp';
    try{await fs.writeFile(temporary,JSON.stringify({version:1,items},null,2),{mode:0o600});await fs.rename(temporary,filePath)}
    finally{await fs.rm(temporary,{force:true})}
  }
  function mutate(operation){const result=queue.then(operation);queue=result.catch(()=>{});return result}
  return {
    async list(){await queue;return (await read()).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))||a.key.localeCompare(b.key))},
    save(input){return mutate(async()=>{
      const mod=cleanMod(input?.mod),key=keyFor(mod),items=await read(),old=items.find(item=>item.key===key);
      const note=input.note===undefined?old?.note||'':String(input.note);
      if(note.length>1000)throw Error('Notizen dürfen höchstens 1000 Zeichen haben. / Notes are limited to 1000 characters.');
      if(!old&&items.length>=1000)throw Error('Die Merkliste enthält bereits 1000 Einträge. / Bookmark limit reached.');
      const now=new Date().toISOString(),entry={key,mod,note,createdAt:old?.createdAt||now,updatedAt:now};
      await write([...items.filter(item=>item.key!==key),entry]);return entry;
    })},
    remove(key){return mutate(async()=>{if(typeof key!=='string'||!/^(modrinth|curseforge):[A-Za-z0-9_-]{1,100}$/.test(key))throw Error('Ungültige Mod-Kennung. / Invalid bookmark key.');const items=await read();await write(items.filter(item=>item.key!==key));return true})}
  };
}
module.exports={createBookmarkStore};
