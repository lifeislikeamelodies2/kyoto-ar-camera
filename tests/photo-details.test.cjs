// npm install --prefix /tmp/travel-tests jsdom@26 fake-indexeddb@6
// NODE_PATH=/tmp/travel-tests/node_modules node --test tests/photo-details.test.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const {IDBFactory,IDBObjectStore}=require('fake-indexeddb');
const base=path.resolve(__dirname,'../map');
function setup(indexedDB=new IDBFactory()){
  const dom=new JSDOM(fs.readFileSync(path.join(base,'index.html'),'utf8'),{url:'https://example.test/map/',runScripts:'outside-only'}),w=dom.window;
  w.indexedDB=indexedDB;
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  let sequence=0;const active=new Set();
  w.URL.createObjectURL=()=>{const url='blob:test-'+(++sequence);active.add(url);return url;};
  w.URL.revokeObjectURL=url=>active.delete(url);
  for(const p of ['core.js','store.js'])w.eval(fs.readFileSync(path.join(base,p),'utf8'));
  return {dom,w,db:w.TravelStore,active};
}
const photo=id=>({id,title:'',capturedAt:'2026-10-11T01:00:00Z',point:null,blob:new Blob(['original image bytes'],{type:'image/jpeg'}),originalMetadata:{point:null}});
async function settle(check){for(let i=0;i<100;i++){if(check())return;await new Promise(r=>setTimeout(r,5));}assert.fail('UI did not settle');}
test('memo saves preserve image nodes and bytes, and survive reopening the database',async()=>{
  const indexedDB=new IDBFactory(),a=setup(indexedDB);await a.db.addPhoto(photo('one'));await a.db.addPhoto(photo('two'));
  a.w.eval(fs.readFileSync(path.join(base,'app.js'),'utf8'));
  await settle(()=>a.w.document.querySelectorAll('.photo-card').length===2);
  const d=a.w.document,card=d.querySelector('.photo-card'),img=card.querySelector('img'),url=img.src;
  const originalPut=IDBObjectStore.prototype.put;let photoWrites=0;
  IDBObjectStore.prototype.put=function(...args){if(this.name==='photos')photoWrites++;return originalPut.apply(this,args);};
  try{
    for(const title of ['あとから記載したメモ','修正したメモ','']){
      card.click();await settle(()=>d.getElementById('photoDialog').open);
      d.getElementById('photoMemo').value=title;d.getElementById('saveMemo').click();
      await settle(()=>!d.getElementById('photoDialog').open);
      assert.equal(card.querySelector('img'),img);assert.equal(img.src,url);assert.ok(a.active.has(url));
      assert.equal((await a.db.get('photos','one')).title,title);
      assert.equal(await (await a.db.get('photos','one')).blob.text(),'original image bytes');
    }
    await a.db.updatePhotoDetails('one',{title:'保存済み',point:[134,34],accuracy:null});
    assert.equal(photoWrites,0,'metadata edits must never rewrite image records');
  }finally{IDBObjectStore.prototype.put=originalPut;a.dom.window.close();}
  const b=setup(indexedDB);try{
    const saved=await b.db.get('photos','one');assert.equal(saved.title,'保存済み');assert.deepEqual(saved.point,[134,34]);assert.equal(await saved.blob.text(),'original image bytes');
    assert.equal((await b.db.all('photos')).find(p=>p.id==='two').title,'');
  }finally{b.dom.window.close();}
});
test('restores and deletions clear obsolete metadata; bad edits cannot replace blobs',async()=>{
  const {dom,db}=setup();try{
    await db.addPhoto(photo('one'));await db.updatePhotoDetails('one',{title:'変更後',point:[134,34]});
    await assert.rejects(db.updatePhotoDetails('one',{blob:new Blob(['bad'])}));
    const exported=await db.all('photos');assert.equal(exported[0].title,'変更後');
    await db.importRecords([{...photo('one'),title:'バックアップのメモ'}],[],null);
    assert.equal((await db.get('photos','one')).title,'バックアップのメモ');assert.equal((await db.get('photos','one')).point,null);
    await db.updatePhotoDetails('one',{title:'再変更'});await db.remove('photos','one');await db.addPhoto(photo('one'));
    assert.equal((await db.get('photos','one')).title,'');
    await assert.rejects(db.updatePhotoDetails('missing',{title:'存在しない写真'}));
  }finally{dom.window.close();}
});
test('new pin colors count manually assigned locations from metadata',async()=>{
  const {dom,w,db}=setup();try{
    await db.addPhoto(photo('one'));await db.updatePhotoDetails('one',{point:[134,34]});
    let count;const original=w.TravelCore.pinColor;w.TravelCore.pinColor=(mode,n,distance)=>{count=n;return original(mode,n,distance);};
    await db.addPhoto({...photo('two'),point:[135,35]});assert.equal(count,2);
  }finally{dom.window.close();}
});
