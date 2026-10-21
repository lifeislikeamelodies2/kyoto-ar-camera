(function () {
  'use strict';
  let connection;
  function open() {
    if (!connection) connection = new Promise((resolve,reject)=>{
      const request = indexedDB.open('kyoto-travel-journal-v1',2);
      request.onupgradeneeded = () => {
        const db=request.result;
        for(const [name,keyPath] of [['photos','id'],['routes','date'],['settings','id']])if(!db.objectStoreNames.contains(name))db.createObjectStore(name,{keyPath});
        const index=db.createObjectStore('photoIndex',{keyPath:'id'});
        db.createObjectStore('thumbnails',{keyPath:'id'});
        // One-time, atomic metadata copy. Never rewrite or delete original images.
        const cursor=request.transaction.objectStore('photos').openCursor();
        cursor.onsuccess=()=>{const row=cursor.result;if(!row)return;index.put(metadata(row.value,'legacy'));row.continue();};
      };
      request.onsuccess=()=>{ const db=request.result; db.onversionchange=()=>{db.close();connection=null;}; resolve(db); };
      request.onerror=()=>{connection=null;reject(request.error);};
      request.onblocked=()=>{connection=null;reject(new Error('ほかのタブを閉じて、もう一度お試しください。'));};
    });
    return connection;
  }
  async function transaction(names,mode,work) {
    const db=await open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(names,mode); let result;
      tx.oncomplete=()=>resolve(result);
      tx.onerror=()=>reject(tx.error || new Error('保存に失敗しました。'));
      tx.onabort=()=>reject(tx.error || new Error('保存が中断されました。'));
      try { work(tx,v=>result=v); } catch(e){tx.abort();reject(e);}
    });
  }
  const detailsKey=id=>'photo-details:'+id;
  function metadata(photo,imageRevision=crypto.randomUUID()){const {blob,...rest}=photo;return {...rest,imageRevision};}
  function mergeDetails(photo,details){return photo?{...photo,...details?.changes}:photo;}
  function readPhotos(tx,set,key,store='photos'){
    const photos=tx.objectStore(store),settings=tx.objectStore('settings');
    const a=key===undefined?photos.getAll():photos.get(key),b=key===undefined?settings.getAll():settings.get(detailsKey(key));let done=0;
    const finish=()=>{if(++done!==2)return;if(key!==undefined){set(mergeDetails(a.result,b.result));return;}const edits=new Map(b.result.map(x=>[x.id,x]));set(a.result.map(p=>mergeDetails(p,edits.get(detailsKey(p.id)))));};
    a.onsuccess=finish;b.onsuccess=finish;
  }
  function updatePhotoDetails(id,changes){
    const allowed=['title','point','accuracy','positionAt','color'];
    if(Object.keys(changes).some(k=>!allowed.includes(k)))return Promise.reject(new Error('変更できない写真情報です。'));
    return transaction(['photoIndex','settings'],'readwrite',(tx,set)=>{
      const photos=tx.objectStore('photoIndex'),settings=tx.objectStore('settings'),a=photos.get(id),b=settings.get(detailsKey(id));let done=0;
      const finish=()=>{if(++done!==2)return;if(!a.result){tx.abort();return;}const details={id:detailsKey(id),changes:{...b.result?.changes,...changes}};settings.put(details);set(mergeDetails(a.result,details));};
      a.onsuccess=finish;b.onsuccess=finish;
    });
  }
  function all(name) {if(name==='photos')return transaction(['photos','settings'],'readonly',(tx,set)=>readPhotos(tx,set));return transaction([name],'readonly',(tx,set)=>{const r=tx.objectStore(name).getAll();r.onsuccess=()=>set(r.result);});}
  function get(name,key) {if(name==='photos')return transaction(['photos','settings'],'readonly',(tx,set)=>readPhotos(tx,set,key));return transaction([name],'readonly',(tx,set)=>{const r=tx.objectStore(name).get(key);r.onsuccess=()=>set(r.result);});}
  function replacePhoto(tx,photo){tx.objectStore('photos').put(photo);tx.objectStore('photoIndex').put(metadata(photo));tx.objectStore('thumbnails').delete(photo.id);tx.objectStore('settings').delete(detailsKey(photo.id));}
  function put(name,value) {if(name==='photos')return transaction(['photos','photoIndex','thumbnails','settings'],'readwrite',tx=>replacePhoto(tx,value));return transaction([name],'readwrite',tx=>tx.objectStore(name).put(value));}
  function remove(name,key) {if(name==='photos')return transaction(['photos','photoIndex','thumbnails','settings'],'readwrite',tx=>{for(const name of ['photos','photoIndex','thumbnails'])tx.objectStore(name).delete(key);tx.objectStore('settings').delete(detailsKey(key));});return transaction([name],'readwrite',tx=>tx.objectStore(name).delete(key));}
  function listPhotos(){return transaction(['photoIndex','settings'],'readonly',(tx,set)=>readPhotos(tx,set,undefined,'photoIndex'));}
  async function getPhotoBlob(id){const p=await get('photos',id);if(!p?.blob)throw new Error('写真を読み込めませんでした。');return p.blob;}
  async function thumbnailSource(id){
    return transaction(['photoIndex','thumbnails'],'readonly',(tx,set)=>{
      const a=tx.objectStore('photoIndex').get(id),b=tx.objectStore('thumbnails').get(id);let done=0;
      const finish=()=>{if(++done===2)set({revision:a.result?.imageRevision,blob:a.result&&b.result?.revision===a.result.imageRevision?b.result.blob:null});};a.onsuccess=finish;b.onsuccess=finish;
    });
  }
  function saveThumbnail(id,revision,blob){return transaction(['photoIndex','thumbnails'],'readwrite',tx=>{
    const r=tx.objectStore('photoIndex').get(id);r.onsuccess=()=>{if(r.result?.imageRevision===revision)tx.objectStore('thumbnails').put({id,revision,blob});};
  });}
  async function addPhoto(photo) {
    return transaction(['photos','photoIndex','routes','settings'],'readwrite',(tx,set)=>{
      const photos=tx.objectStore('photos'),index=tx.objectStore('photoIndex'), found=index.get(photo.id);
      found.onsuccess=()=>{
        if(found.result){set(found.result);return;}
        const a=index.getAll(),b=tx.objectStore('routes').getAll(),c=tx.objectStore('settings').getAll();
        let done=0;
        const finish=()=>{if(++done!==3)return; const C=TravelCore; const edits=new Map(c.result.map(x=>[x.id,x]));const count=a.result.map(p=>mergeDetails(p,edits.get(detailsKey(p.id)))).filter(p=>C.validPoint(p.point)).length+(C.validPoint(photo.point)?1:0); photo.color=C.pinColor(edits.get('preferences')?.colorMode || 'count',count,C.totalDistance(b.result));photos.add(photo);const meta=metadata(photo);index.add(meta);set(meta);};
        a.onsuccess=finish;b.onsuccess=finish;c.onsuccess=finish;
      };
    });
  }
  async function importRecords(photos,routes,preferences) {
    return transaction(['photos','photoIndex','thumbnails','routes','settings'],'readwrite',tx=>{
      photos.forEach(p=>replacePhoto(tx,p));
      routes.forEach(r=>tx.objectStore('routes').put(r));
      if(preferences)tx.objectStore('settings').put(preferences);
    });
  }
  window.TravelStore={open,all,get,put,remove,addPhoto,importRecords,updatePhotoDetails,listPhotos,getPhotoBlob,thumbnailSource,saveThumbnail};
})();
