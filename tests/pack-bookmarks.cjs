const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {createBookmarkStore}=require('../pack-bookmarks.cjs');
(async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'modspire-bookmarks-'));
  try{
    const filePath=path.join(directory,'bookmarks.json'),store=createBookmarkStore({filePath});
    assert.deepEqual(await store.list(),[]);
    await Promise.all(['a','b','c'].map(id=>store.save({mod:{provider:'modrinth',id,title:'Mod '+id},note:'Note '+id})));
    assert.equal((await store.list()).length,3,'concurrent saves must retain every bookmark');
    await store.save({mod:{provider:'modrinth',id:'a',title:'Renamed',minecraftVersion:'1.21.1',loader:'fabric'}});
    assert.equal((await store.list()).find(item=>item.key==='modrinth:a').mod.minecraftVersion,'1.21.1','compatibility context survives persistence');
    assert.equal((await store.list()).find(item=>item.key==='modrinth:a').note,'Note a','star toggles must not erase existing notes');
    assert.equal((await createBookmarkStore({filePath}).list()).find(item=>item.key==='modrinth:a').mod.title,'Renamed','bookmarks persist independently of pack projects');
    await store.save({mod:{provider:'modrinth',id:'a',title:'Renamed'},note:''});
    assert.equal((await store.list()).find(item=>item.key==='modrinth:a').note,'','notes can be cleared');
    await assert.rejects(store.save({mod:{provider:'modrinth',id:'../escape',title:'Bad'}}));
    await assert.rejects(store.save({mod:{provider:'modrinth',id:'a',title:'A'},note:'x'.repeat(1001)}));
    await store.remove('modrinth:b');
    assert.deepEqual((await store.list()).map(item=>item.key).sort(),['modrinth:a','modrinth:c']);
    await fs.writeFile(filePath,'{broken');
    await assert.rejects(store.save({mod:{provider:'modrinth',id:'d',title:'D'}}),'corrupt data must never be overwritten with an empty library');
    assert.equal(await fs.readFile(filePath,'utf8'),'{broken');
    console.log('Bookmark store: serialized persistence, cross-pack records, notes, validation and corrupt-file preservation passed.');
  }finally{if(path.dirname(path.resolve(directory))!==path.resolve(os.tmpdir())||!path.basename(directory).startsWith('modspire-bookmarks-'))throw Error('Unexpected cleanup target');await fs.rm(directory,{recursive:true,force:true})}
})().catch(error=>{console.error(error);process.exitCode=1});
