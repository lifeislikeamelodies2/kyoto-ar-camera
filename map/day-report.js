(() => {
  'use strict';
  const $=id=>document.getElementById(id),C=TravelCore,R=TravelReportRenderer;
  let data=null,selected=new Set(),map=null,markers=[],mapError=false,blob=null,resultUrl=null,thumbUrls=[],busy=false,session=0,abort=null;
  const mode=()=>$('reportSelectedMode').checked?'selected':'all';
  function chosen(){return R.choose(data.photos,mode(),[...selected]);}
  function status(text){$('reportStatus').textContent=text;}
  function clearResult(){if(resultUrl)URL.revokeObjectURL(resultUrl);resultUrl=null;blob=null;$('reportImage').removeAttribute('src');$('reportResult').hidden=true;}
  function clear(){session++;abort?.abort();abort=null;map?.remove();map=null;markers=[];thumbUrls.forEach(u=>URL.revokeObjectURL(u));thumbUrls=[];clearResult();busy=false;}
  function configure(){
    clearResult();$('reportChoices').hidden=mode()!=='selected';$('reportSelectionCount').hidden=mode()!=='selected';$('reportSelectionCount').textContent=`${selected.size} / 5 か所`;
    $('reportChoices').querySelectorAll('input').forEach(input=>{input.disabled=busy||(!input.checked&&selected.size>=5);});
    $('reportAllMode').disabled=busy;$('reportSelectedMode').disabled=busy||!data.photos.length;
    $('reportCreate').disabled=busy||(!data.photos.length&&!data.route)||(mode()==='selected'&&!selected.size);
    status(!data.photos.length&&!data.route?'この日の記録はありません。':mode()==='selected'&&!selected.size?'掲載するスポットを１〜５か所選んでください。':'地図と距離は１日全体、写真は選んだ範囲を掲載します。');
    updatePins();
  }
  function updatePins(){
    if(!map)return;markers.forEach(m=>m.remove());markers=[];
    let photos;try{photos=chosen();}catch(_){photos=[];}
    photos.filter(p=>C.validPoint(p.point)).forEach(p=>{
      const b=document.createElement('div');b.className='photo-pin';b.style.setProperty('--pin',p.color||C.colors[0]);
      const shape=document.createElement('span');shape.className='pin-shape';const number=document.createElement('span');number.className='pin-number';number.textContent=p.number;b.append(shape,number);
      markers.push(new maplibregl.Marker({element:b,anchor:'bottom'}).setLngLat(p.point).addTo(map));
    });
  }
  function makeMap(token){
    const points=[...data.photos.filter(p=>C.validPoint(p.point)).map(p=>p.point),...(data.route?.segments||[]).flatMap(s=>s.coordinates)];
    $('reportMap').hidden=!points.length;$('reportMapNote').textContent=points.length?'北を上に、１日の範囲を表示します。画像には選んだ写真の番号を載せます。':'撮影地点が未設定のため、画像には「地図なし」と表示します。';
    if(!points.length)return;
    if(!window.maplibregl){mapError=true;status('地図を読み込めませんでした。ページを再読み込みしてください。');return;}
    try{
      const current=map=new maplibregl.Map({container:'reportMap',center:points[0],zoom:12,bearing:0,pitch:0,interactive:false,pixelRatio:2,canvasContextAttributes:{preserveDrawingBuffer:true},attributionControl:false,style:{version:8,sources:{osm:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,maxzoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'}},layers:[{id:'report-base',type:'raster',source:'osm'}]}});
      current.addControl(new maplibregl.AttributionControl({compact:false}),'bottom-right');
      const bounds=points.reduce((bounds,p)=>bounds.extend(p),new maplibregl.LngLatBounds(points[0],points[0]));
      current.fitBounds(bounds,{padding:{top:44,bottom:36,left:32,right:32},maxZoom:15,duration:0});
      current.on('load',()=>{
        if(token!==session)return;
        const segments=data.route?.segments||[];
        current.addSource('report-route',{type:'geojson',data:{type:'FeatureCollection',features:segments.map(s=>({type:'Feature',properties:{kind:s.kind},geometry:{type:'LineString',coordinates:s.coordinates}}))}});
        current.addLayer({id:'report-route-halo',type:'line',source:'report-route',paint:{'line-color':'#fff9e9','line-width':7}});
        current.addLayer({id:'report-road',type:'line',source:'report-route',filter:['==',['get','kind'],'road'],paint:{'line-color':'#425f4c','line-width':4}});
        current.addLayer({id:'report-manual',type:'line',source:'report-route',filter:['!=',['get','kind'],'road'],paint:{'line-color':'#a87d3d','line-width':3,'line-dasharray':[2,2]}});
        updatePins();
      });
      current.on('error',()=>{if(token===session){mapError=true;status('地図の読み込みに失敗しました。通信を確認し、この画面を開き直してください。');}});
      requestAnimationFrame(()=>{if(token===session)current.resize();});
    }catch(_){mapError=true;status('この端末では地図画像を準備できませんでした。ページを再読み込みしてください。');}
  }
  function waitForMap(signal){
    if(mapError)return Promise.reject(new Error('地図の読み込みに失敗しています。この画面を開き直してください。'));
    if(!map)return Promise.resolve();
    const current=map;
    return new Promise((resolve,reject)=>{
      const cleanup=()=>{clearTimeout(timer);current.off('idle',check);signal.removeEventListener('abort',cancel);};
      const cancel=()=>{cleanup();reject(new Error('作成を中止しました。'));};
      const check=()=>{if(mapError){cleanup();reject(new Error('地図を読み込めませんでした。もう一度開き直してください。'));}else if(current.loaded()&&current.areTilesLoaded()){cleanup();resolve();}};
      const timer=setTimeout(()=>{cleanup();reject(new Error('地図の読み込みが完了していません。通信を確認して再度お試しください。'));},20000);
      current.on('idle',check);signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();else check();
    });
  }
  async function decodeImage(source){
    if(typeof createImageBitmap==='function'){try{return await createImageBitmap(source);}catch(_){}}
    const url=URL.createObjectURL(source),img=new Image();
    try{img.src=url;await img.decode();return img;}finally{URL.revokeObjectURL(url);}
  }
  async function create(){
    if(busy||!data)return;
    const token=session;let canvas=null,snapshot=null;
    try{
      const photos=chosen();busy=true;configure();status('地図と写真をまとめています…');abort=new AbortController();await waitForMap(abort.signal);
      if(token!==session)return;
      let pins=[];
      if(map){
        const original=map.getCanvas();snapshot=document.createElement('canvas');snapshot.width=original.width;snapshot.height=original.height;snapshot.getContext('2d').drawImage(original,0,0);
        const rect=map.getContainer();pins=photos.filter(p=>C.validPoint(p.point)).map(p=>{const xy=map.project(p.point);return {number:p.number,color:p.color,x:xy.x/rect.clientWidth,y:xy.y/rect.clientHeight};});
      }
      if(document.fonts)await Promise.race([document.fonts.ready,new Promise(r=>setTimeout(r,2500))]);
      if(token!==session)return;
      canvas=await R.render({date:data.date,mode:mode(),photos,totalPhotos:data.photos.length,mapCanvas:snapshot,pins,hasRoute:!!data.route,distanceLabel:data.route?C.formatDistance(C.totalDistance([data.route])):'未確定',routeNote:!data.route?'ルートを確認して保存すると、この日の距離を掲載できます。':data.route.segments.some(s=>s.kind!=='road')?'１日全体の距離 · 手動・直線区間を含む概算です。':'１日全体の距離 · 保存済みルートに基づく目安です。'}, {
        createCanvas:(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;},decodeImage,releaseImage:img=>img.close?.(),cancelled:()=>token!==session,
        onProgress:(done,total)=>{if(token===session)status(`写真を配置しています… ${done} / ${total}枚`);}
      });
      const result=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('画像を作成できませんでした。写真を５か所以内で選び直してお試しください。')),'image/png'));
      if(token!==session)return;
      blob=result;resultUrl=URL.createObjectURL(result);$('reportImage').src=resultUrl;$('reportResult').hidden=false;
      status(`画像を作成しました（${canvas.width} × ${canvas.height}）。「画像を保存・共有」から保存できます。`);
      $('reportResult').scrollIntoView({block:'start',behavior:'smooth'});
    }catch(e){if(token===session)status(e.name==='SecurityError'?'地図画像を取得できませんでした。ページを再読み込みしてお試しください。':e.message||'画像を作成できませんでした。');}
    finally{
      if(canvas){canvas.width=1;canvas.height=1;}if(snapshot){snapshot.width=1;snapshot.height=1;}
      if(token===session){busy=false;$('reportAllMode').disabled=false;$('reportSelectedMode').disabled=!data.photos.length;$('reportCreate').disabled=false;$('reportChoices').querySelectorAll('input').forEach(input=>input.disabled=!input.checked&&selected.size>=5);}
    }
  }
  async function save(){
    if(!blob)return;
    const file=new File([blob],`旅のしるし-${data.date}-${mode()==='all'?'すべて':'選択'}.png`,{type:'image/png'});
    try{
      if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:data.date+' 旅のしるし'});return;}
    }catch(e){if(e.name==='AbortError')return;}
    const a=document.createElement('a');a.href=resultUrl;a.download=file.name;document.body.append(a);a.click();a.remove();status('画像をダウンロードしました。iPhoneではプレビューの長押しから保存することもできます。');
  }
  function open(value){
    if($('reportDialog').open)return;
    clear();data={date:value.date,photos:value.photos.map(p=>({...p,point:p.point?[...p.point]:null})),route:value.route?.confirmed?JSON.parse(JSON.stringify(value.route)):null};mapError=false;selected=new Set();
    $('reportAllMode').checked=true;$('reportSelectedMode').checked=false;$('reportDate').textContent=data.date+' の記録';$('reportChoices').replaceChildren();
    data.photos.forEach((p,i)=>{
      const label=document.createElement('label');label.className='report-choice';const input=document.createElement('input');input.type='checkbox';input.value=p.id;input.setAttribute('aria-label',`写真 ${i+1} を掲載`);
      const img=document.createElement('img'),url=URL.createObjectURL(p.blob);thumbUrls.push(url);img.src=url;img.alt='';img.loading='lazy';
      const text=document.createElement('span');text.textContent=`写真 ${i+1} · ${new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit'}).format(new Date(p.capturedAt))}${p.title?' · '+p.title:''}${p.point?'':'（地点未設定）'}`;
      input.addEventListener('change',()=>{if(input.checked){if(selected.size>=5){input.checked=false;return;}selected.add(p.id);}else selected.delete(p.id);configure();});label.append(input,img,text);$('reportChoices').append(label);
    });
    $('reportDialog').showModal();configure();makeMap(session);
  }
  $('reportAllMode').addEventListener('change',configure);$('reportSelectedMode').addEventListener('change',configure);
  $('reportCreate').addEventListener('click',create);$('reportSave').addEventListener('click',()=>save().catch(e=>status(e.message)));
  $('reportClose').addEventListener('click',()=>$('reportDialog').close());$('reportDialog').addEventListener('close',clear);
  window.DayReport={open};
})();
