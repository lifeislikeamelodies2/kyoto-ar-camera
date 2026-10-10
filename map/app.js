/* 旅のしるし — browser-local photo journal. No continuous location history. */
(() => {
  'use strict';
  const C=TravelCore, DB=TravelStore, $=id=>document.getElementById(id);
  const state={photos:[],routes:[],prefs:{id:'preferences',colorMode:'count',zoomLimit:true},date:C.day(new Date()),draft:null,history:[],placing:null,busy:false,map:null,mapReady:false,markers:[],routeMarkers:[],urls:[],selected:null,user:null,heading:null,follow:true,watch:null,routeAbort:null};
  const ranks=['旅のはじまり','小さな発見','足あとを重ねて','思い出の旅人','旅の達人'];
  const modes={foot:'徒歩',car:'車',transit:'電車・バス（手動）',manual:'手動で結ぶ'};
  const stamp=t=>new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(t));
  const time=t=>new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit'}).format(new Date(t));
  const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  const act=(id,fn)=>$(id).addEventListener('click',()=>Promise.resolve().then(fn).catch(fail));
  let toastTimer,largeUrl,locationMarker,locationElement,lastRouteRequest=0;
  function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,6500);}
  function fail(e){console.error(e);toast(e?.message || '処理に失敗しました。もう一度お試しください。');}
  function hint(message){$('mapHint').textContent=message;$('mapHint').classList.toggle('placing',!!state.placing);}
  function photoSignature(){return JSON.stringify(C.dailyPhotos(state.photos,state.date).filter(p=>C.validPoint(p.point)).map(p=>[p.id,p.capturedAt,p.point]));}
  function photoNumber(id){const p=state.photos.find(p=>p.id===id);return p?C.dailyPhotos(state.photos,C.day(p.capturedAt)).findIndex(p=>p.id===id)+1:0;}
  function savedRoute(){return state.routes.find(r=>r.date===state.date);}
  function clone(x){return JSON.parse(JSON.stringify(x));}
  function action(text,cls,fn){const b=el('button',cls,text);b.type='button';b.addEventListener('click',()=>Promise.resolve().then(fn).catch(fail));return b;}
  function photoUrl(blob){const u=URL.createObjectURL(blob);state.urls.push(u);return u;}
  function setTab(tab){$('photosTab').setAttribute('aria-selected',tab==='photos');$('routeTab').setAttribute('aria-selected',tab==='route');$('photosPane').hidden=tab!=='photos';$('routePane').hidden=tab!=='route';$('journal').classList.remove('collapsed');$('collapse').setAttribute('aria-expanded','true');}
  async function refresh(){[state.photos,state.routes]=await Promise.all([DB.all('photos'),DB.all('routes')]);render();}
  function render(){
    state.urls.forEach(u=>URL.revokeObjectURL(u));state.urls=[];
    const daily=C.dailyPhotos(state.photos,state.date),total=C.totalDistance(state.routes),pins=state.photos.filter(p=>C.validPoint(p.point)).length;
    $('date').value=state.date;
    $('dateCaption').textContent=state.date.replaceAll('-',' . ');
    $('journalTitle').textContent=state.date===C.day(new Date())?'今日の旅':new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',month:'long',day:'numeric'}).format(new Date(state.date+'T12:00:00+09:00'))+'の旅';
    $('photoCount').textContent=daily.length+' 枚';$('totalPins').textContent=pins;
    $('totalKm').replaceChildren(document.createTextNode((total/1000).toFixed(1)),el('small','',' km'));
    const color=C.pinColor(state.prefs.colorMode,pins,total);$('rankColor').style.background=color;$('rankName').textContent=ranks[C.colors.indexOf(color)];
    $('photoList').replaceChildren();
    if(!daily.length){const box=el('div','empty');const icon=el('div','empty-icon','✧');box.append(icon,el('h3','','この日の思い出を、ここに。'),el('p','','ARカメラで撮影したら「地図で記録する」。写真の場所が、旅のしるしになります。'));$('photoList').append(box);}
    daily.forEach((p,i)=>{
      const b=action('','photo-card',()=>openPhoto(p.id)),img=el('img');b.dataset.photoId=p.id;b.dataset.photoNumber=i+1;img.src=photoUrl(p.blob);img.alt=p.title || '旅の写真';img.loading='lazy';
      const copy=el('div','copy'),t=el('time','',`写真 ${i+1} · ${time(p.capturedAt)}`);t.dateTime=p.capturedAt;
      copy.append(t,el('h3','',p.title || '旅の写真 '+(i+1)),el('p','',p.point?(p.accuracy>100?'GPSの誤差が大きい地点':'地図に記録済み'):'撮影地点を指定してください'));
      b.append(img,copy,el('span','arrow','›'));$('photoList').append(b);
    });
    renderRoutePanel();renderMap();updateZoomLimit();
  }
  function initMap(){
    if(!window.maplibregl){hint('地図を読み込めませんでした。通信を確認して再読み込みしてください。');return;}
    try{
      const map=state.map=new maplibregl.Map({container:'map',center:[135.7681,35.0116],zoom:13,bearing:0,pitch:0,maxPitch:0,minZoom:2,maxZoom:19,attributionControl:false,dragRotate:false,touchPitch:false,style:{version:8,sources:{osm:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,maxzoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'}},layers:[{id:'paper-map',type:'raster',source:'osm',paint:{'raster-saturation':-.5,'raster-contrast':-.08}}]}});
      map.addControl(new maplibregl.AttributionControl({compact:false}),'bottom-right');
      map.addControl(new maplibregl.ScaleControl({maxWidth:70,unit:'metric'}),'bottom-left');
      map.on('load',()=>{
        state.mapReady=true;
        map.addSource('journey',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
        map.addLayer({id:'journey-halo',type:'line',source:'journey',paint:{'line-color':'#fff9e9','line-width':7,'line-opacity':.85}});
        map.addLayer({id:'journey-road',type:'line',source:'journey',filter:['==',['get','kind'],'road'],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#466452','line-width':4}});
        map.addLayer({id:'journey-manual',type:'line',source:'journey',filter:['!=',['get','kind'],'road'],paint:{'line-color':'#a87d3d','line-width':3,'line-dasharray':[2,2]}});
        renderMap();updateZoomLimit();fitDay(false);startLocation(false);
        if(typeof DeviceOrientationEvent!=='undefined' && typeof DeviceOrientationEvent.requestPermission!=='function')enableHeading();
        else hint('現在地ボタンで端末の向きを許可できます');
      });
      map.on('error',e=>{if(e.error?.message?.includes('tile') || !state.mapReady)hint('地図の一部を読み込めませんでした。通信をご確認ください。');});
      map.on('rotate',()=>{$('compass').style.transform=`rotate(${-map.getBearing()}deg)`;});
      map.on('dragstart',()=>{state.follow=false;updateLocationButton();});
      map.on('moveend',updateLocationButton);
      map.on('click',e=>{if(state.placing)placeAt([e.lngLat.lng,e.lngLat.lat]).catch(fail);});
    }catch(e){hint('この端末で地図を開始できませんでした。SafariやChromeで開いてください。');console.error(e);}
  }
  function renderMap(){
    if(!state.mapReady)return;
    state.markers.forEach(m=>m.remove());state.markers=[];
    C.dailyPhotos(state.photos,state.date).forEach((p,i)=>{
      // Keep the original daily photo index, including photos awaiting a location.
      if(!C.validPoint(p.point))return;
      const b=el('button','photo-pin');b.dataset.photoId=p.id;b.dataset.photoNumber=i+1;b.style.setProperty('--pin',p.color||C.colors[0]);b.setAttribute('aria-label',`写真 ${i+1} · ${stamp(p.capturedAt)} ${p.title||'旅の写真'}`);
      b.append(el('span','pin-shape'),el('span','pin-number',String(i+1)));
      b.addEventListener('click',e=>{e.stopPropagation();if(!state.placing)openPhoto(p.id).catch(fail);});
      state.markers.push(new maplibregl.Marker({element:b,anchor:'bottom'}).setLngLat(p.point).addTo(state.map));
    });
    const r=state.draft || savedRoute();
    state.map.getSource('journey')?.setData({type:'FeatureCollection',features:(r?.segments||[]).map(s=>({type:'Feature',properties:{kind:s.kind},geometry:{type:'LineString',coordinates:s.coordinates}}))});
    state.routeMarkers.forEach(m=>m.remove());state.routeMarkers=[];
    if(state.draft)state.draft.points.forEach((p,i)=>{
      const n=el('div','waypoint-marker',p.photoId?String(photoNumber(p.photoId)||'写'):'+');n.title=p.photoId?`写真 ${photoNumber(p.photoId)} の撮影地点（写真の詳細から修正できます）`:'ドラッグして経由地を動かす';
      const m=new maplibregl.Marker({element:n,draggable:!p.photoId && !state.busy}).setLngLat(p.point).addTo(state.map);
      m.on('dragstart',()=>pushHistory());m.on('dragend',()=>{p.point=m.getLngLat().toArray();resetDraft();});state.routeMarkers.push(m);
    });
  }
  function mapPadding(){const rect=$('journal').getBoundingClientRect();return innerWidth>900 || (innerHeight<550&&innerWidth>innerHeight)?{top:150,bottom:70,left:rect.right+35,right:90}:{top:185,bottom:innerHeight-rect.top+70,left:55,right:70};}
  function fitDay(animated=true){
    if(!state.mapReady)return;
    const r=state.draft||savedRoute(),pts=[...C.dailyPhotos(state.photos,state.date).filter(p=>p.point).map(p=>p.point),...(r?.segments||[]).flatMap(s=>s.coordinates)];
    if(!pts.length)return;
    state.follow=false;
    const bounds=pts.reduce((b,p)=>b.extend(p),new maplibregl.LngLatBounds(pts[0],pts[0]));
    state.map.fitBounds(bounds,{padding:mapPadding(),maxZoom:16,duration:animated?600:0});updateLocationButton();
  }
  function updateZoomLimit(){
    if(!state.map)return;
    const km=C.totalDistance(state.routes)/1000;let min=state.prefs.zoomLimit?(km<5?11:km<20?10:km<50?8:km<100?6:2):2;
    const pts=state.photos.filter(p=>p.point).map(p=>p.point);
    if(pts.length>1){const spread=Math.max(...pts.map(p=>C.distance(pts[0],p)));if(spread>30000)min=Math.min(min,8);if(spread>150000)min=Math.min(min,5);if(spread>1000000)min=2;}
    state.map.setMinZoom(min);
  }
  function updateLocationButton(){
    const centered=state.user && state.map && C.distance(state.user,state.map.getCenter().toArray())<20;
    $('locate').classList.toggle('active',!!centered);$('locate').setAttribute('aria-label',centered?'現在地を中心に表示中':'現在地を中心にする');
  }
  function setUserPosition(p){
    state.user=[p.coords.longitude,p.coords.latitude];
    if(!C.validPoint(state.user)||!state.mapReady)return;
    if(!locationMarker){locationElement=el('div','user-dot');locationElement.append(el('span','heading-pointer unknown'));locationMarker=new maplibregl.Marker({element:locationElement,rotationAlignment:'map'}).setLngLat(state.user).addTo(state.map);}
    locationMarker.setLngLat(state.user);applyHeading();
    if(state.follow && !state.placing)state.map.easeTo({center:state.user,duration:650});
    updateLocationButton();
  }
  function startLocation(center){
    if(!navigator.geolocation){hint('このブラウザでは現在地を取得できません。');return;}
    if(center)state.follow=true;
    if(state.watch!==null){if(center&&state.user)state.map?.easeTo({center:state.user,duration:500});return;}
    state.watch=navigator.geolocation.watchPosition(setUserPosition,e=>{hint(e.code===1?'現在地の表示には、ブラウザの位置情報の許可が必要です。':'現在地を取得できません。屋外で現在地ボタンをお試しください。');},{enableHighAccuracy:true,maximumAge:15000,timeout:15000});
  }
  function stopLocation(){if(state.watch!==null){navigator.geolocation.clearWatch(state.watch);state.watch=null;}}
  function applyHeading(){if(locationMarker && state.heading!==null){locationElement.querySelector('.heading-pointer').classList.remove('unknown');locationMarker.setRotation(state.heading);}}
  function onHeading(e){const screenAngle=screen.orientation?.angle ?? window.orientation ?? 0; if(Number.isFinite(e.webkitCompassHeading)&&(e.webkitCompassAccuracy===undefined||e.webkitCompassAccuracy>=0))state.heading=(e.webkitCompassHeading+screenAngle+360)%360;else if(e.absolute && Number.isFinite(e.alpha))state.heading=(360-e.alpha+screenAngle)%360;applyHeading();}
  async function enableHeading(){
    try{if(typeof DeviceOrientationEvent!=='undefined' && typeof DeviceOrientationEvent.requestPermission==='function'){if(await DeviceOrientationEvent.requestPermission()!=='granted'){toast('端末の向きは許可されていません。現在地の丸は表示できます。');return;}}
      window.addEventListener('deviceorientation',onHeading);window.addEventListener('deviceorientationabsolute',onHeading);
    }catch(_){toast('端末の向きを利用できません。地図は指で回転できます。');}
  }
  async function openPhoto(id){
    const p=state.photos.find(x=>x.id===id);if(!p)return;state.selected=id;
    if(largeUrl)URL.revokeObjectURL(largeUrl);largeUrl=URL.createObjectURL(p.blob);$('largePhoto').src=largeUrl;
    $('placePhoto').dataset.photoId=p.id;
    $('photoDate').textContent=`写真 ${photoNumber(p.id)} · ${stamp(p.capturedAt)}`;$('photoTitle').textContent=p.title||'旅の写真';$('photoMemo').value=p.title||'';
    $('photoLocation').textContent=p.point?`${p.point[1].toFixed(5)}, ${p.point[0].toFixed(5)}${p.accuracy?' · GPS精度の目安 ±'+Math.round(p.accuracy)+'m':p.originalMetadata?.point?.every((v,i)=>v===p.point[i])?' · 写真の位置情報':' · 手動指定'}`:'位置情報がありません。地図上で撮影地点を指定できます。';
    $('photoDialog').showModal();
  }
  function renderRoutePanel(){
    $('routeEditor').hidden=!state.draft;$('routeSummary').replaceChildren();
    if(state.draft){renderEditor();return;}
    const saved=savedRoute(),daily=C.dailyPhotos(state.photos,state.date),valid=daily.filter(p=>p.point);
    if(saved){const card=el('div','saved-card');card.append(el('span','draft-tag saved-tag','確認して保存したルート'),el('h3','',C.formatDistance(C.totalDistance([saved]))+' の旅'),el('p','',saved.points.length+'地点 · '+stamp(saved.updatedAt)+' 更新'));
      if(saved.segments.some(s=>s.kind!=='road'))card.append(el('p','','手動・直線区間を含む概算距離です。'));
      if(saved.photoSignature!==photoSignature())card.append(el('p','route-note','写真の追加・変更があります。保存済みルートはそのままです。必要に応じて作り直してください。'));
      card.append(action('保存したルートを編集','primary full',()=>{state.draft=clone(saved);state.draft.confirmed=false;state.history=[];renderRoutePanel();renderMap();fitDay();}));
      $('routeSummary').append(card,action('撮影地点から作り直す','quiet',()=>beginRoute(true)),action('保存したルートを削除','quiet danger',deleteRoute));
    }else{
      const box=el('div','empty');box.append(el('h3','','写真から、道のりをたどる。'),el('p','',valid.length>=2?'同じ日に撮った写真を時刻順につなぎ、通った道を確認して保存できます。':'撮影地点のある写真を、同じ日に２枚以上記録するとルートを作れます。'));$('routeSummary').append(box);
      const b=action('この日のルートを作る','primary full',()=>beginRoute(false));b.disabled=valid.length<2;$('routeSummary').append(b);
    }
    const missing=daily.length-valid.length;if(missing)$('routeSummary').append(el('p','route-note',missing+'枚の写真は撮影地点が未設定です。写真の詳細から指定できます。'));
  }
  function beginRoute(rebuild){
    if(rebuild&&!confirm('保存済みのルートをもとにせず、撮影地点から作り直しますか？「保存」を押すまでは元の記録が残ります。'))return;
    const draft=C.draftFromPhotos(state.photos,state.date);
    if(draft.points.length<2){toast('撮影地点のある写真が２枚以上必要です。');return;}
    draft.segments=C.straightSegments(draft.points);draft.photoSignature=photoSignature();state.draft=draft;state.history=[];
    renderRoutePanel();renderMap();fitDay();toast('最初は撮影地点を直線で結んでいます。「道に沿う候補を取得」で徒歩・車の候補を表示できます。');
  }
  function pushHistory(){if(state.draft){state.history.push(clone(state.draft));if(state.history.length>30)state.history.shift();}}
  function resetDraft(){state.draft.confirmed=false;state.draft.segments=C.straightSegments(state.draft.points);$('routeReviewed').checked=false;renderEditor();renderMap();}
  function renderEditor(){
    const r=state.draft;if(!r)return;
    $('routeReviewed').checked=false;$('routeTag').textContent='確認前のルート';$('waypoints').replaceChildren();
    r.points.forEach((p,i)=>{
      const li=el('li');li.dataset.number=i+1;const row=el('div','waypoint-row');row.append(el('span','waypoint-label',p.photoId?`写真 ${photoNumber(p.photoId)||'（削除済み）'} · ${p.label}`:p.label));
      const remove=action('×','waypoint-remove',()=>{pushHistory();r.points.splice(i,1);resetDraft();});remove.setAttribute('aria-label',p.label+'をルートから外す');remove.disabled=state.busy || r.points.length<=2;row.append(remove);li.append(row);
      const tools=el('div','waypoint-tools');
      if(i<r.points.length-1){const select=el('select');select.setAttribute('aria-label','次の地点への移動手段');Object.entries(modes).forEach(([value,label])=>{const opt=el('option','',label);opt.value=value;select.append(opt);});select.value=p.mode;select.disabled=state.busy;
        select.onchange=()=>{pushHistory();p.mode=select.value;resetDraft();};tools.append(select);
        const add=action('＋経由地','',()=>startPlace({type:'waypoint',after:i}));add.disabled=state.busy;tools.append(add);
      }
      if(i>0){const up=action('↑','',()=>{pushHistory();[r.points[i-1],r.points[i]]=[r.points[i],r.points[i-1]];resetDraft();});up.setAttribute('aria-label','順番を１つ前へ');up.disabled=state.busy;tools.append(up);}
      li.append(tools);$('waypoints').append(li);
    });
    const total=r.segments.reduce((s,x)=>s+C.length(x.coordinates),0),manual=r.segments.filter(s=>s.kind!=='road').length;
    $('routeDistance').textContent='ルート案の距離：'+C.formatDistance(total)+(manual?'（概算）':'（目安）');
    $('routeWarning').textContent=manual?`点線の${manual}区間は直線・手動の経路です。実際の道路や鉄道を通った距離とは異なることがあります。経由地を加えて調整してください。`:'緑の線は道路に沿った候補です。実際に通った道か確認してから保存してください。';
    $('calculate').disabled=state.busy;$('calculate').textContent=state.busy?'候補を取得中…':'道に沿う候補を取得';
    ['addWaypoint','cancelEdit','undoRoute','saveRoute'].forEach(id=>$(id).disabled=state.busy);
    $('undoRoute').disabled=state.busy||!state.history.length;
  }
  function startPlace(value){
    if(!state.mapReady){toast('地図を読み込んでからお試しください。');return;}
    if(value.type==='photo'&&!state.photos.some(p=>p.id===value.id)){toast('指定する写真が見つかりません。写真を選び直してください。');return;}
    state.placing={...value};state.follow=false;$('journal').classList.add('collapsed');$('collapse').setAttribute('aria-expanded','false');
    hint('地図をタップして'+(value.type==='photo'?`写真 ${photoNumber(value.id)} の撮影地点`:'経由地')+'を指定 · ここを押すと中止');
  }
  function endPlace(){state.placing=null;$('journal').classList.remove('collapsed');$('collapse').setAttribute('aria-expanded','true');hint('１本指で移動 · ２本指で拡大・縮小・回転');}
  async function placeAt(point){
    if(!C.validPoint(point))return;const place=state.placing;if(!place||place.saving)return;
    if(place.type==='photo'){
      const p=state.photos.find(p=>p.id===place.id);if(!p){endPlace();return;}
      const count=state.photos.filter(p=>p.point).length;
      const changed={...p,point,accuracy:null,positionAt:null};if(!p.point)changed.color=C.pinColor(state.prefs.colorMode,count+1,C.totalDistance(state.routes));
      const number=photoNumber(place.id);place.saving=true;
      try{await DB.put('photos',changed);if(state.placing===place)endPlace();await refresh();toast(`写真 ${number} の撮影地点を保存しました。`);}finally{place.saving=false;}
    }else if(state.draft){pushHistory();state.draft.points.splice(place.after+1,0,{id:crypto.randomUUID(),point,label:'寄り道・経由地',mode:state.draft.points[place.after]?.mode||'foot'});endPlace();resetDraft();toast('経由地を追加しました。丸い番号をドラッグすると位置を調整できます。');}
  }
  async function routeSegment(a,b,signal){
    const delay=Math.max(0,1100-(Date.now()-lastRouteRequest));if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
    if(signal.aborted)throw new DOMException('Aborted','AbortError');lastRouteRequest=Date.now();
    const path=a.mode==='car'?'routed-car':'routed-foot';
    const url=`https://routing.openstreetmap.de/${path}/route/v1/driving/${a.point.join(',')};${b.point.join(',')}?overview=full&geometries=geojson&steps=false`;
    const response=await fetch(url,{signal});if(!response.ok)throw new Error('経路サービスが応答していません。');
    const json=await response.json(),route=json.routes?.[0];if(json.code!=='Ok'||!route?.geometry?.coordinates?.every(C.validPoint))throw new Error('この区間の道路経路が見つかりません。');
    const pts=route.geometry.coordinates;
    if(C.distance(pts[0],a.point)>500 || C.distance(pts.at(-1),b.point)>500)throw new Error('撮影地点から道路が離れています。経由地を調整してください。');
    return {mode:a.mode,kind:'road',coordinates:pts};
  }
  async function calculate(){
    if(!state.draft||state.busy)return;
    state.busy=true;pushHistory();state.routeAbort=new AbortController();const draft=state.draft;
    renderEditor();renderMap();let failed=0;
    try{
      for(let i=0;i<draft.points.length-1;i++){
        const a=draft.points[i],b=draft.points[i+1];
        if(!['foot','car'].includes(a.mode)){draft.segments[i]={mode:a.mode,kind:'manual',coordinates:[a.point,b.point]};continue;}
        if(C.distance(a.point,b.point)<1){draft.segments[i]={mode:a.mode,kind:'manual',coordinates:[a.point,b.point]};continue;}
        const timer=setTimeout(()=>state.routeAbort.abort(),18000);
        try{draft.segments[i]=await routeSegment(a,b,state.routeAbort.signal);}catch(e){failed++;draft.segments[i]={mode:a.mode,kind:'straight',coordinates:[a.point,b.point]};if(state.routeAbort.signal.aborted)break;}finally{clearTimeout(timer);}
      }
    }finally{state.busy=false;state.routeAbort=null;renderEditor();renderMap();}
    toast(failed?'取得できない区間は点線で残しました。経由地を追加して手動で調整できます。':'ルート案を更新しました。通った道を確認してから保存してください。');
  }
  async function saveRoute(){
    if(!state.draft||state.busy)return;if(!$('routeReviewed').checked){toast('地図を確認し「地図上の経路を確認しました」にチェックしてください。');return;}
    const r=clone(state.draft);C.validateRoute(r);r.confirmed=true;r.updatedAt=new Date().toISOString();
    await DB.put('routes',r);state.draft=null;state.history=[];await refresh();toast('この日のルートを保存しました。累計距離に反映しました。');
  }
  async function deleteRoute(){if(!confirm('この日の確定ルートを削除しますか？写真は残ります。'))return;await DB.remove('routes',state.date);await refresh();toast('ルートを削除し、累計距離を更新しました。');}
  async function changeDate(date){
    if(state.busy){toast('経路の取得が終わるまでお待ちください。');$('date').value=state.date;return;}
    if(state.draft&&!confirm('編集中のルート案を破棄して日付を変えますか？')){$('date').value=state.date;return;}
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return;
    state.draft=null;state.history=[];state.date=date;endPlace();render();fitDay();
  }
  function relativeDate(direction){const dates=[...new Set([...state.photos.map(p=>C.day(p.capturedAt)),...state.routes.map(r=>r.date)])].sort();const target=direction<0?dates.filter(d=>d<state.date).at(-1):dates.find(d=>d>state.date);if(target)return changeDate(target);toast(direction<0?'これより前の記録はありません。':'これより後の記録はありません。');}
  function settings(){
    $('colorMode').value=state.prefs.colorMode;$('zoomLimit').checked=state.prefs.zoomLimit;renderLegend();$('settingsDialog').showModal();
  }
  function renderLegend(){const labels=state.prefs.colorMode==='distance'?['〜5 km','5 km〜','20 km〜','50 km〜','100 km〜']:['〜4本','5本〜','15本〜','30本〜','60本〜'];$('colorLegend').replaceChildren();C.colors.forEach((color,i)=>{const d=el('div'),swatch=el('i');swatch.style.background=color;d.append(swatch,el('span','',labels[i]));$('colorLegend').append(d);});}
  async function preferences(){const next={...state.prefs,colorMode:$('colorMode').value,zoomLimit:$('zoomLimit').checked};await DB.put('settings',next);state.prefs=next;renderLegend();render();}
  function download(blob,name){const u=URL.createObjectURL(blob),a=el('a');a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),60000);}
  const dataUrl=blob=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(blob);});
  async function backup(){
    $('exportBtn').disabled=true;
    try{toast('写真を含めてバックアップを準備しています。');const [photos,routes]=await Promise.all([DB.all('photos'),DB.all('routes')]);const converted=[];for(const p of photos){const {blob,...meta}=p;converted.push({...meta,image:await dataUrl(blob)});}
      const blob=new Blob([JSON.stringify({format:'kyoto-travel-journal',version:1,exportedAt:new Date().toISOString(),photos:converted,routes,preferences:state.prefs})],{type:'application/json'});download(blob,'kyoto-travel-'+C.day(new Date())+'.json');toast('バックアップを書き出しました。ダウンロードしたファイルを保管してください。');
    }finally{$('exportBtn').disabled=false;}
  }
  async function importBackup(file){
    if(!file)return;if(file.size>100*1024*1024)throw new Error('読み込めるバックアップは100MBまでです。');
    const b=JSON.parse(await file.text());
    if(b.format!=='kyoto-travel-journal'||b.version!==1||!Array.isArray(b.photos)||!Array.isArray(b.routes)||b.photos.length>2000||b.routes.length>2000)throw new Error('対応するバックアップファイルではありません。');
    const photos=[];
    for(const p of b.photos){
      if(typeof p.id!=='string'||p.id.length>100||typeof p.title!=='string'||p.title.length>100||!Number.isFinite(Date.parse(p.capturedAt))||(p.point!==null&&!C.validPoint(p.point))||typeof p.image!=='string'||!/^data:image\/(jpeg|png|webp);base64,[a-zA-Z0-9+/=]+$/.test(p.image)||p.image.length>20*1024*1024)throw new Error('写真データの形式が正しくありません。');
      const raw=atob(p.image.split(',')[1]),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0)),mime=p.image.slice(5,p.image.indexOf(';'));const blob=new Blob([bytes],{type:mime});
      // Decode images before the atomic write; malformed backups cannot partially replace records.
      const bitmap=await createImageBitmap(blob);bitmap.close();
      photos.push({id:p.id,title:p.title,capturedAt:p.capturedAt,point:p.point,accuracy:Number.isFinite(p.accuracy)?p.accuracy:null,positionAt:p.positionAt||null,color:C.colors.includes(p.color)?p.color:C.colors[0],source:p.source==='ar-camera'?'ar-camera':'import',originalMetadata:PhotoMetadata.original(p.originalMetadata),blob});
    }
    for(const r of b.routes){C.validateRoute(r);if(r.confirmed!==true||!Number.isFinite(Date.parse(r.updatedAt)))throw new Error('ルートの保存情報が正しくありません。');}
    if(!confirm(`${photos.length}枚の写真と${b.routes.length}日分のルートを読み込みます。同じ写真ID・同じ日付のルートは置き換わります。よろしいですか？`))return;
    const prefs={id:'preferences',colorMode:b.preferences?.colorMode==='distance'?'distance':'count',zoomLimit:b.preferences?.zoomLimit!==false};
    await DB.importRecords(photos,b.routes,prefs);state.prefs=prefs;state.draft=null;await refresh();renderLegend();$('colorMode').value=prefs.colorMode;$('zoomLimit').checked=prefs.zoomLimit;toast('バックアップを読み込みました。');
  }
  async function resizePhoto(file){
    if(file.size>25*1024*1024)throw new Error('写真は25MB以下で選択してください。');
    const url=URL.createObjectURL(file);
    try{const img=new Image();img.src=url;await img.decode();const scale=Math.min(1,1800/Math.max(img.naturalWidth,img.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.round(img.naturalWidth*scale);canvas.height=Math.round(img.naturalHeight*scale);const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);return await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('写真を読み込めませんでした。')),'image/jpeg',.9));}finally{URL.revokeObjectURL(url);}
  }
  let uploadTicket=0,uploadFile=null,uploadMetadata=null,uploadReading=false,uploadSaving=false,uploadMap=null;
  function clearUploadMap(){if(uploadMap){uploadMap.remove();uploadMap=null;}}
  function resetUpload(){
    uploadTicket++;uploadFile=null;uploadMetadata=null;uploadReading=false;clearUploadMap();
    $('uploadForm').reset();$('photoTime').value='';$('photoTime').disabled=false;$('photoFile').disabled=false;
    $('photoGpsSection').hidden=true;$('photoMetadataStatus').textContent='写真を選ぶと、撮影場所と日時を読み取ります。';
    $('photoTimeNote').textContent='写真の撮影日時を確認してください。';$('photoGpsPreviewStatus').textContent='';updateUploadChoice();
  }
  function updateUploadChoice(){
    const use=!!uploadMetadata?.point&&$('usePhotoGps').checked;
    $('photoUploadSubmit').disabled=uploadReading||uploadSaving||!uploadFile;
    $('photoUploadSubmit').textContent=uploadReading?'写真の情報を読み取り中…':uploadSaving?'写真を保存中…':!uploadFile?'写真を選択してください':use?'この日時・場所で保存':'この日時で保存して地点を選ぶ';
    $('photoUploadHelp').textContent=use?'撮影日時と地図の場所をご確認ください。保存すると、その日の地図にピンが立ちます。':'保存後に、地図をタップして撮影地点を指定してください。';
    $('uploadLocationPreview').hidden=!use;
    if(use&&uploadMap)requestAnimationFrame(()=>uploadMap?.resize());
  }
  function showUploadMap(point){
    clearUploadMap();$('photoGpsPreviewStatus').textContent='';
    if(!window.maplibregl){$('photoGpsPreviewStatus').textContent='確認用の地図を読み込めませんでした。座標を確認するか、チェックを外して地点を手動指定してください。';return;}
    try{
      uploadMap=new maplibregl.Map({container:'uploadLocationPreview',center:point,zoom:13,interactive:false,attributionControl:false,style:{version:8,sources:{osm:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,maxzoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'}},layers:[{id:'photo-location',type:'raster',source:'osm'}]}});
      uploadMap.addControl(new maplibregl.AttributionControl({compact:false}),'bottom-right');
      new maplibregl.Marker({element:el('div','waypoint-marker','●')}).setLngLat(point).addTo(uploadMap);
      uploadMap.on('error',()=>{$('photoGpsPreviewStatus').textContent='確認用の地図を読み込めませんでした。通信と表示座標をご確認ください。';});
      requestAnimationFrame(()=>uploadMap?.resize());
    }catch(_){$('photoGpsPreviewStatus').textContent='この端末では確認用の地図を表示できません。座標を確認するか、地点を手動指定してください。';}
  }
  async function readUploadPhoto(){
    const ticket=++uploadTicket,file=$('photoFile').files[0];
    uploadFile=null;uploadMetadata=null;clearUploadMap();$('photoGpsSection').hidden=true;$('photoTime').value='';$('photoTimeNote').textContent='';
    if(!file){uploadReading=false;updateUploadChoice();return;}
    if(file.size>25*1024*1024){uploadReading=false;$('photoMetadataStatus').textContent='写真は25MB以下で選択してください。';updateUploadChoice();return;}
    uploadFile=file;uploadReading=true;$('photoTime').disabled=true;$('photoMetadataStatus').textContent='撮影場所と日時を読み取っています…';updateUploadChoice();
    let metadata,error=false;
    try{metadata=await PhotoMetadata.read(file);}catch(_){error=true;metadata={point:null,capturedAt:null};}
    if(ticket!==uploadTicket)return;
    uploadReading=false;uploadMetadata=metadata;$('photoTime').disabled=false;
    if(metadata.capturedAt){$('photoTime').value=PhotoMetadata.japanInput(metadata.capturedAt);$('photoTimeNote').textContent=metadata.assumedTimezone?'写真に時差情報がないため、日本時間として読み取りました。日時が正しいか確認してください。':'写真の撮影日時を日本時間に変換しました。必要に応じて修正できます。';}
    else $('photoTimeNote').textContent='撮影日時を読み取れませんでした。撮影した日時を入力してください。';
    $('photoMetadataStatus').textContent=error?'写真の情報を読み取れませんでした。日時と撮影地点は手動で指定できます。':metadata.point?'写真に記録された撮影場所を読み取りました。':'写真に利用できる位置情報がありません。保存後に地点を指定できます。';
    if(metadata.point){$('photoGpsSection').hidden=false;$('usePhotoGps').checked=true;$('photoGpsCoordinates').textContent=`緯度 ${metadata.point[1].toFixed(6)} / 経度 ${metadata.point[0].toFixed(6)}`;}
    updateUploadChoice();if(metadata.point)showUploadMap(metadata.point);
  }
  async function upload(event){
    event.preventDefault();if(uploadReading||uploadSaving)return;
    const file=$('photoFile').files[0];if(!file||file!==uploadFile){toast('写真を選び直してください。');return;}
    const capturedAt=PhotoMetadata.fromJapanInput($('photoTime').value);if(!capturedAt){toast('撮影日時を入力してください。');return;}
    const originalMetadata=PhotoMetadata.original(uploadMetadata),point=$('usePhotoGps').checked&&uploadMetadata?.point?[...uploadMetadata.point]:null;
    uploadSaving=true;$('photoFile').disabled=true;$('photoTime').disabled=true;updateUploadChoice();
    try{
      let blob;try{blob=await resizePhoto(file);}catch(_){throw new Error('この写真を表示できませんでした。JPEGまたはPNG形式の写真でお試しください。');}
      const photo={id:crypto.randomUUID(),capturedAt,point,title:'',blob,source:'upload',accuracy:null,originalMetadata};
      await DB.addPhoto(photo);$('uploadDialog').close();state.date=C.day(photo.capturedAt);await refresh();setTab('photos');
      if(point){fitDay();toast('写真の撮影場所と日時で保存しました。');}else startPlace({type:'photo',id:photo.id});
    }finally{uploadSaving=false;$('photoFile').disabled=false;$('photoTime').disabled=false;updateUploadChoice();}
  }
  // Controls are attached before startup so a map/CDN failure cannot hide saved photos.
  act('photosTab',()=>setTab('photos'));act('routeTab',()=>setTab('route'));act('settingsBtn',settings);
  act('collapse',()=>{const c=$('journal').classList.toggle('collapsed');$('collapse').setAttribute('aria-expanded',!c);$('collapse').setAttribute('aria-label',c?'記録パネルを開く':'記録パネルを折りたたむ');});
  act('north',()=>{state.map?.easeTo({bearing:0,pitch:0,duration:500});hint('真北を上に戻しました');});
  $('locate').addEventListener('click',()=>{enableHeading();startLocation(true);});
  act('fit',()=>fitDay());act('mapHint',()=>{if(state.placing)endPlace();});
  $('date').addEventListener('change',()=>changeDate($('date').value).catch(fail));act('previousDate',()=>relativeDate(-1));act('nextDate',()=>relativeDate(1));
  document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.close).close()));
  act('saveMemo',async()=>{const p=state.photos.find(p=>p.id===state.selected);if(!p)return;await DB.put('photos',{...p,title:$('photoMemo').value.trim()});$('photoDialog').close();await refresh();});
  act('placePhoto',()=>{const id=$('placePhoto').dataset.photoId;$('photoDialog').close();startPlace({type:'photo',id});});
  act('downloadPhoto',async()=>{const p=state.photos.find(p=>p.id===state.selected);if(!p)return;const file=new File([p.blob],`kyoto-${C.day(p.capturedAt)}.jpg`,{type:p.blob.type});if(navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file]});return;}catch(e){if(e.name==='AbortError')return;}}download(p.blob,file.name);});
  act('deletePhoto',async()=>{if(!confirm('この写真を地図アプリから削除しますか？保存済みのルートは残ります。'))return;await DB.remove('photos',state.selected);$('photoDialog').close();await refresh();toast('写真を削除しました。');});
  act('addWaypoint',()=>startPlace({type:'waypoint',after:state.draft.points.length-2}));act('calculate',calculate);act('saveRoute',saveRoute);
  act('undoRoute',()=>{if(!state.history.length)return;state.draft=state.history.pop();renderEditor();renderMap();});
  act('cancelEdit',()=>{if(!confirm('編集中のルート案を破棄しますか？保存済みのルートは残ります。'))return;state.draft=null;state.history=[];endPlace();renderRoutePanel();renderMap();});
  $('colorMode').addEventListener('change',()=>preferences().catch(fail));$('zoomLimit').addEventListener('change',()=>preferences().catch(fail));
  act('exportBtn',backup);act('importBtn',()=>$('backupFile').click());$('backupFile').addEventListener('change',async()=>{try{await importBackup($('backupFile').files[0]);}catch(e){fail(e);}finally{$('backupFile').value='';}});
  act('uploadBtn',()=>{if(state.draft){toast('ルートの編集を終了してから写真を追加してください。');return;}resetUpload();$('uploadDialog').showModal();});
  $('photoFile').addEventListener('change',()=>readUploadPhoto().catch(fail));
  $('usePhotoGps').addEventListener('change',updateUploadChoice);
  $('uploadDialog').addEventListener('close',()=>{uploadTicket++;clearUploadMap();});
  $('uploadForm').addEventListener('submit',e=>upload(e).catch(fail));
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopLocation();else if(state.mapReady)startLocation(false);});
  window.addEventListener('beforeunload',e=>{if(state.draft){e.preventDefault();e.returnValue='';}});
  (async()=>{
    try{await DB.open();state.prefs={...state.prefs,...await DB.get('settings','preferences')};[state.photos,state.routes]=await Promise.all([DB.all('photos'),DB.all('routes')]);const id=new URL(location.href).searchParams.get('photo'),p=state.photos.find(p=>p.id===id);
      if(p)state.date=C.day(p.capturedAt);else if(state.photos.length)state.date=state.photos.map(p=>C.day(p.capturedAt)).sort().at(-1);
      // Preserve photo selection locally, never put image/coordinates in the URL.
      if(id)history.replaceState(null,'',location.pathname);
      render();initMap();
      if(p){await openPhoto(p.id);if(!p.point)toast('写真を保存しました。位置情報がないため「地点を指定・修正」から場所を選んでください。');}
    }catch(e){fail(new Error('記録用の保存領域を開けませんでした。通常モードのブラウザで開き、空き容量をご確認ください。'));initMap();}
  })();
})();
