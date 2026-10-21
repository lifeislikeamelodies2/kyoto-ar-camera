// NODE_PATH=/tmp/travel-tests/node_modules node --test tests/photo-thumbnails.test.cjs
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom'),{IDBFactory,IDBObjectStore}=require('fake-indexeddb');
const base=path.resolve(__dirname,'../map');
function setup(indexedDB=new IDBFactory()){
  const dom=new JSDOM(fs.readFileSync(path.join(base,'index.html'),'utf8'),{url:'https://example.test/map/',runScripts:'outside-only'}),w=dom.window;
  w.indexedDB=indexedDB;let decodes=0;const sizes=[],active=new Set();let next=0;
  w.URL.createObjectURL=()=>{const u='blob:test-'+(++next);active.add(u);return u;};w.URL.revokeObjectURL=u=>active.delete(u);
  w.createImageBitmap=async()=>{decodes++;return {width:1800,height:1200,close(){}};};
  w.HTMLCanvasElement.prototype.getContext=()=>({fillRect(){},drawImage(){}});
  w.HTMLCanvasElement.prototype.toBlob=function(cb){sizes.push([this.width,this.height]);cb(new Blob(['small'],{type:'image/jpeg'}));};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  const observers=[];w.IntersectionObserver=class{constructor(cb){this.cb=cb;this.targets=[];observers.push(this);}observe(img){this.targets.push(img);}unobserve(){}disconnect(){}show(){this.cb(this.targets.map(target=>({target,isIntersecting:true})));}};
  for(const p of ['core.js','store.js','photo-images.js'])w.eval(fs.readFileSync(path.join(base,p),'utf8'));
  return {dom,w,db:w.TravelStore,images:w.PhotoImages,observers,active,sizes,decodes:()=>decodes};
}
const photo=(id='p')=>({id,title:'original',capturedAt:'2026-10-11T01:00:00Z',point:[134,34],blob:new Blob(['original bytes'],{type:'image/jpeg'})});
async function legacy(indexedDB){return new Promise((resolve,reject)=>{
  const r=indexedDB.open('kyoto-travel-journal-v1',1);r.onupgradeneeded=()=>{for(const [name,keyPath] of [['photos','id'],['settings','id'],['routes','date']])r.result.createObjectStore(name,{keyPath});};r.onerror=()=>reject(r.error);
  r.onsuccess=()=>{const db=r.result,tx=db.transaction(['photos','settings','routes'],'readwrite');tx.objectStore('photos').put(photo());tx.objectStore('settings').put({id:'photo-details:p',changes:{title:'edited',point:[135,35]}});tx.objectStore('routes').put({date:'2026-10-11',confirmed:true,segments:[]});tx.oncomplete=()=>{db.close();resolve();};};
});}
async function settle(check){for(let i=0;i<100;i++){if(check())return;await new Promise(r=>setTimeout(r,5));}assert.fail('did not settle');}
test('v1 migration keeps original bytes, edits and routes; metadata queries never read originals',async()=>{
  const idb=new IDBFactory();await legacy(idb);const a=setup(idb);
  try{
    await a.db.open();const origGet=IDBObjectStore.prototype.get,origAll=IDBObjectStore.prototype.getAll;
    IDBObjectStore.prototype.get=function(...args){assert.notEqual(this.name,'photos','no original record read');return origGet.apply(this,args);};
    IDBObjectStore.prototype.getAll=function(...args){assert.notEqual(this.name,'photos','no bulk original read');return origAll.apply(this,args);};
    try{
      const records=await a.db.listPhotos();assert.equal(records.length,1);assert.equal(records[0].blob,undefined);assert.equal(records[0].title,'edited');assert.deepEqual(records[0].point,[135,35]);
      await a.db.updatePhotoDetails('p',{title:'new memo'});await a.db.addPhoto(photo('second'));assert.equal((await a.db.listPhotos()).length,2);
    }finally{IDBObjectStore.prototype.get=origGet;IDBObjectStore.prototype.getAll=origAll;}
    assert.equal(await (await a.db.getPhotoBlob('p')).text(),'original bytes');assert.equal((await a.db.get('photos','p')).title,'new memo');assert.equal((await a.db.all('routes'))[0].confirmed,true);
  }finally{a.dom.window.close();}
});
test('previews are 256px, cached across reloads, independent of memo edits and invalidated on replacement',async()=>{
  const idb=new IDBFactory(),a=setup(idb);try{
    await a.db.addPhoto(photo());const first=await a.images.thumbnail('p');assert.equal(await first.text(),'small');assert.deepEqual(a.sizes,[[256,171]]);
    await a.images.thumbnail('p');await a.db.updatePhotoDetails('p',{title:'memo'});await a.images.thumbnail('p');assert.equal(a.decodes(),1);
    const b=setup(idb);try{await b.images.thumbnail('p');assert.equal(b.decodes(),0);}finally{b.dom.window.close();}
    await a.db.importRecords([{...photo(),blob:new Blob(['replacement'])}],[],null);await a.images.thumbnail('p');assert.equal(a.decodes(),2);assert.equal(await (await a.db.getPhotoBlob('p')).text(),'replacement');
    await a.db.remove('photos','p');assert.equal((await a.db.thumbnailSource('p')).blob,null);assert.equal(await a.images.thumbnail('p'),null);
  }finally{a.dom.window.close();}
});
test('offscreen previews read no images; disposed views do not publish stale URLs; detail uses original on demand',async()=>{
  const a=setup();try{
    await a.db.addPhoto(photo());let reads=0;const get=a.db.getPhotoBlob;a.db.getPhotoBlob=async id=>{reads++;return get(id);};
    a.w.eval(fs.readFileSync(path.join(base,'app.js'),'utf8'));await settle(()=>a.w.document.querySelector('.photo-card'));assert.equal(reads,0);
    a.observers[0].show();await settle(()=>a.w.document.querySelector('.photo-card img').hasAttribute('src'));assert.equal(reads,1);
    a.w.document.querySelector('.photo-card').click();await settle(()=>a.w.document.getElementById('largePhoto').hasAttribute('src'));assert.equal(reads,2);
    const url=a.w.document.getElementById('largePhoto').src;a.w.document.getElementById('photoDialog').close();assert.equal(a.active.has(url),false);
    const img=a.w.document.createElement('img');a.w.document.body.append(img);const preview=a.images.previews(null);preview.observe(img,'p');a.observers.at(-1).show();preview.dispose();await new Promise(r=>setTimeout(r,20));assert.equal(img.hasAttribute('src'),false);
  }finally{a.dom.window.close();}
});
test('report selection reads no originals until create, then loads only chosen originals one by one',async()=>{
  const a=setup();try{
    a.w.HTMLElement.prototype.scrollIntoView=function(){};
    a.w.HTMLCanvasElement.prototype.getContext=()=>new Proxy({measureText:s=>({width:s.length*15})},{get:(o,k)=>k in o?o[k]:()=>{}});
    for(let i=1;i<=8;i++)await a.db.addPhoto({...photo('p'+i),point:null});
    const reads=[];const get=a.db.getPhotoBlob;a.db.getPhotoBlob=async id=>{reads.push(id);return get(id);};
    for(const file of ['report-renderer.js','day-report.js'])a.w.eval(fs.readFileSync(path.join(base,file),'utf8'));
    const d=a.w.document;a.w.DayReport.open({date:'2026-10-11',photos:await a.db.listPhotos(),route:null});assert.equal(reads.length,0);
    d.getElementById('reportSelectedMode').checked=true;d.getElementById('reportSelectedMode').dispatchEvent(new a.w.Event('change'));
    const choices=d.querySelectorAll('#reportChoices input');for(let i=1;i<8;i++)choices[i].click();
    assert.equal(reads.length,0);d.getElementById('reportCreate').click();
    await settle(()=>!d.getElementById('reportResult').hidden);
    assert.deepEqual(reads,['p2','p3','p4','p5','p6','p7','p8']);assert.equal(a.decodes(),7);
    d.getElementById('reportClose').click();assert.equal(a.active.size,0);
  }finally{a.dom.window.close();}
});
