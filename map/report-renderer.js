(function(root){
  'use strict';
  function choose(photos,mode,ids=[]){
    if(mode==='all')return photos.map((p,i)=>({...p,number:i+1}));
    const wanted=new Set(ids);
    const selected=photos.map((p,i)=>({...p,number:i+1})).filter(p=>wanted.has(p.id));
    if(selected.length<1)throw new Error('掲載する写真を１枚以上選んでください。');
    return selected;
  }
  function layout(count){
    const width=1080,margin=48,mapY=190,mapW=984,mapH=656,gridY=1100,gap=28,cardW=478,cardH=414;
    const rows=Math.ceil(count/2),height=gridY+Math.max(1,rows)*(cardH+gap)+90;
    // Bound both pixel area and the longest dimension for mobile canvas memory.
    const scale=Math.min(1,Math.sqrt(12000000/(width*height)),16000/height);
    return {width,height,margin,mapY,mapW,mapH,gridY,gap,cardW,cardH,scale,pixelWidth:Math.max(1,Math.floor(width*scale)),pixelHeight:Math.max(1,Math.floor(height*scale))};
  }
  function wrap(ctx,text,maxWidth,maxLines){
    const lines=[];let line='';
    for(const char of String(text||'')){
      if(ctx.measureText(line+char).width>maxWidth&&line){lines.push(line);line=char;}else line+=char;
    }
    if(line)lines.push(line);
    if(lines.length>maxLines){lines.length=maxLines;let last=lines.at(-1);while(last&&ctx.measureText(last+'…').width>maxWidth)last=last.slice(0,-1);lines[maxLines-1]=last+'…';}
    return lines;
  }
  function pin(ctx,x,y,color,number){
    ctx.save();ctx.fillStyle=color||'#796f53';ctx.strokeStyle='#fff9ed';ctx.lineWidth=4;
    ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-20,y-27);ctx.arc(x,y-30,22,Math.PI*.95,Math.PI*2.05);ctx.lineTo(x,y);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.fillStyle='#fff';ctx.font='bold 23px sans-serif';ctx.textAlign='center';ctx.fillText(String(number),x,y-23);ctx.restore();
  }
  async function render(data,env){
    const L=layout(data.photos.length),canvas=env.createCanvas(L.pixelWidth,L.pixelHeight),ctx=canvas.getContext('2d');
    if(!ctx)throw new Error('画像を作成できませんでした。選択する写真を減らしてお試しください。');
    ctx.scale(L.scale,L.scale);ctx.fillStyle='#f7f2e7';ctx.fillRect(0,0,L.width,L.height);
    const text=(s,x,y,size=28,color='#383d32',font='sans-serif')=>{ctx.fillStyle=color;ctx.font=`${size}px ${font}`;ctx.fillText(s,x,y);};
    text('KYOTO · TRAVEL JOURNAL',48,55,18,'#7d806b');text('旅のしるし',48,122,48,'#383d32','"Noto Serif JP", serif');
    const date=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'long',day:'numeric'}).format(new Date(data.date+'T12:00:00+09:00'));
    ctx.textAlign='right';text(date,1032,88,30);text(data.mode==='all'?`すべての写真 · ${data.photos.length}枚`:`選んだスポット · ${data.photos.length}か所 / 全${data.totalPhotos}枚`,1032,133,22,'#807b6c');ctx.textAlign='left';
    ctx.fillStyle='#e7dfcb';ctx.fillRect(48,L.mapY,L.mapW,L.mapH);
    if(data.mapCanvas){
      ctx.save();ctx.filter='sepia(0.45) saturate(0.65)';ctx.drawImage(data.mapCanvas,48,L.mapY,L.mapW,L.mapH);ctx.restore();
      ctx.save();ctx.beginPath();ctx.rect(48,L.mapY,L.mapW,L.mapH);ctx.clip();
      for(const p of data.pins||[])pin(ctx,48+p.x*L.mapW,L.mapY+p.y*L.mapH,p.color,p.number);
      ctx.restore();
      ctx.fillStyle='#f7f2e7f2';ctx.fillRect(57,L.mapY+L.mapH-50,L.mapW-18,43);
      text('© OpenStreetMap contributors · openstreetmap.org/copyright',69,L.mapY+L.mapH-23,17,'#625e52');
      text('N ↑',L.mapW-30,L.mapY+45,23,'#4c5e45');
    }else{text('撮影地点が未設定のため、地図はありません。',90,L.mapY+L.mapH/2,30,'#807b6c');}
    const metricY=L.mapY+L.mapH+57;
    text('この日の確定ルート距離',48,metricY,23,'#807b6c');text(data.distanceLabel,48,metricY+62,48,'#425f4c','Georgia, serif');
    ctx.textAlign='right';text('画像に掲載する写真',1032,metricY,23,'#807b6c');text(data.photos.length+' 枚',1032,metricY+62,40,'#425f4c');ctx.textAlign='left';
    text(data.routeNote,48,metricY+102,20,'#807b6c');
    text('この日の思い出',48,L.gridY-24,29,'#425f4c','"Noto Serif JP", serif');
    for(let i=0;i<data.photos.length;i++){
      if(env.cancelled?.())throw new Error('作成を中止しました。');
      const p=data.photos[i],x=48+(i%2)*(L.cardW+L.gap),y=L.gridY+Math.floor(i/2)*(L.cardH+L.gap);
      ctx.fillStyle='#fffdf8';ctx.fillRect(x,y,L.cardW,L.cardH);ctx.strokeStyle='#ded7c6';ctx.lineWidth=1;ctx.strokeRect(x,y,L.cardW,L.cardH);
      const img=await env.decodeImage(p.blob);
      try{
        const iw=img.naturalWidth||img.width,ih=img.naturalHeight||img.height;if(!iw||!ih)throw new Error('写真 '+p.number+' を読み込めませんでした。');
        const w=L.cardW-24,h=285,scale=Math.min(w/iw,h/ih);
        ctx.fillStyle='#ece5d8';ctx.fillRect(x+12,y+12,w,h);
        ctx.drawImage(img,x+12+(w-iw*scale)/2,y+12+(h-ih*scale)/2,iw*scale,ih*scale);
      }finally{env.releaseImage?.(img);}
      const clock=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit'}).format(new Date(p.capturedAt));
      text(`写真 ${p.number} · ${clock}${p.point?'':' · 地点未設定'}`,x+18,y+326,21,'#807b6c');
      ctx.font='26px "Noto Serif JP", serif';const lines=wrap(ctx,p.title||'旅の写真 '+p.number,L.cardW-36,2);
      lines.forEach((line,j)=>text(line,x+18,y+361+j*32,26,'#383d32','"Noto Serif JP", serif'));
      env.onProgress?.(i+1,data.photos.length);
    }
    if(!data.photos.length)text('この日の写真はありません。',48,L.gridY+70,28,'#807b6c');
    text('旅のしるし · 日時は日本時間 · 距離は保存したルートに基づく目安',48,L.height-52,19,'#807b6c');
    if(data.hasRoute)text('経路候補：FOSSGIS / OSRM · routing.openstreetmap.de',48,L.height-22,17,'#807b6c');
    return canvas;
  }
  root.TravelReportRenderer={choose,layout,wrap,render};
  if(typeof module!=='undefined')module.exports=root.TravelReportRenderer;
})(typeof globalThis!=='undefined'?globalThis:window);
