(function () {
  'use strict';
  let connection;
  function open() {
    if (!connection) connection = new Promise((resolve,reject)=>{
      const request = indexedDB.open('kyoto-travel-journal-v1',1);
      request.onupgradeneeded = () => {
        const db=request.result;
        db.createObjectStore('photos',{keyPath:'id'});
        db.createObjectStore('routes',{keyPath:'date'});
        db.createObjectStore('settings',{keyPath:'id'});
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
  function all(name) {return transaction([name],'readonly',(tx,set)=>{const r=tx.objectStore(name).getAll();r.onsuccess=()=>set(r.result);});}
  function get(name,key) {return transaction([name],'readonly',(tx,set)=>{const r=tx.objectStore(name).get(key);r.onsuccess=()=>set(r.result);});}
  function put(name,value) {return transaction([name],'readwrite',tx=>tx.objectStore(name).put(value));}
  function remove(name,key) {return transaction([name],'readwrite',tx=>tx.objectStore(name).delete(key));}
  async function addPhoto(photo) {
    return transaction(['photos','routes','settings'],'readwrite',(tx,set)=>{
      const photos=tx.objectStore('photos'), found=photos.get(photo.id);
      found.onsuccess=()=>{
        if(found.result){set(found.result);return;}
        const a=photos.getAll(),b=tx.objectStore('routes').getAll(),c=tx.objectStore('settings').get('preferences');
        let done=0;
        const finish=()=>{if(++done!==3)return; const C=TravelCore; const count=a.result.filter(p=>C.validPoint(p.point)).length+(C.validPoint(photo.point)?1:0); photo.color=C.pinColor(c.result?.colorMode || 'count',count,C.totalDistance(b.result));photos.add(photo);set(photo);};
        a.onsuccess=finish;b.onsuccess=finish;c.onsuccess=finish;
      };
    });
  }
  async function importRecords(photos,routes,preferences) {
    return transaction(['photos','routes','settings'],'readwrite',tx=>{
      photos.forEach(p=>tx.objectStore('photos').put(p));
      routes.forEach(r=>tx.objectStore('routes').put(r));
      if(preferences)tx.objectStore('settings').put(preferences);
    });
  }
  window.TravelStore={open,all,get,put,remove,addPhoto,importRecords};
})();
