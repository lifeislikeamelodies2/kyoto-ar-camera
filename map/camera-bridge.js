(function(){
  'use strict';
  let latest, busy=false;
  const button=document.getElementById('recordOnMap');
  const status=document.getElementById('mapRecordStatus');
  function begin(){
    const shot={id:crypto.randomUUID(),capturedAt:new Date().toISOString()};
    // One fresh location request per shutter press; no background tracking.
    shot.position=new Promise(resolve=>{
      if(!navigator.geolocation){resolve(null);return;}
      navigator.geolocation.getCurrentPosition(p=>{
        const point=[p.coords.longitude,p.coords.latitude];
        resolve(TravelCore.validPoint(point)?{point,accuracy:p.coords.accuracy,positionAt:new Date(p.timestamp).toISOString()}:null);
      },()=>resolve(null),{enableHighAccuracy:true,maximumAge:0,timeout:12000});
    });
    return shot;
  }
  function ready(blob,shot){latest={blob,shot};button.disabled=false;button.textContent='地図で記録する';status.textContent='';}
  button.addEventListener('click',async()=>{
    if(!latest || busy)return;
    busy=true;button.disabled=true;status.textContent='撮影地点を確認しています…';
    const snapshot=latest;
    try{
      const loc=await snapshot.shot.position;
      await TravelStore.addPhoto({id:snapshot.shot.id,blob:snapshot.blob,capturedAt:snapshot.shot.capturedAt,point:loc?.point || null,accuracy:loc?.accuracy || null,positionAt:loc?.positionAt || null,title:'',source:'ar-camera',createdAt:new Date().toISOString()});
      const url=new URL('./map/',location.href);url.searchParams.set('photo',snapshot.shot.id);
      location.assign(url.href);
    }catch(e){status.textContent='保存できませんでした。空き容量とブラウザの保存設定をご確認ください。写真は「保存・共有」から保存できます。';button.disabled=false;}
    finally{busy=false;}
  });
  window.TravelCapture={begin,ready};
})();
