/* Small cached previews; original image bytes are loaded only on demand. */
(() => {
  'use strict';
  let thumbnailQueue=Promise.resolve();
  async function decode(blob){
    if(typeof createImageBitmap==='function'){try{return await createImageBitmap(blob);}catch(_){}}
    const url=URL.createObjectURL(blob),img=new Image();
    try{img.src=url;await img.decode();return img;}finally{URL.revokeObjectURL(url);}
  }
  function release(img){if(img.close)img.close();else img.removeAttribute('src');}
  async function resize(blob){
    const img=await decode(blob),canvas=document.createElement('canvas');
    try{
      const width=img.naturalWidth||img.width,height=img.naturalHeight||img.height;
      if(!width||!height)throw new Error('写真を読み込めませんでした。');
      const ratio=Math.min(1,256/Math.max(width,height));canvas.width=Math.max(1,Math.round(width*ratio));canvas.height=Math.max(1,Math.round(height*ratio));
      const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
      return await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('サムネイルを作成できませんでした。')),'image/jpeg',.75));
    }finally{release(img);canvas.width=1;canvas.height=1;}
  }
  function thumbnail(id,wanted=()=>true){
    const job=thumbnailQueue.then(async()=>{
      if(!wanted())return null;
      const cached=await TravelStore.thumbnailSource(id);
      if(!wanted()||!cached.revision)return null;
      if(cached.blob)return cached.blob;
      const original=await TravelStore.getPhotoBlob(id);if(!wanted())return null;
      const blob=await resize(original);
      // Cache failures (for example a full device) must not alter the original.
      try{await TravelStore.saveThumbnail(id,cached.revision,blob);}catch(_){/* display the small preview without caching */}
      return wanted()?blob:null;
    });
    thumbnailQueue=job.catch(()=>{});return job;
  }
  function previews(root){
    let disposed=false;const entries=new Map(),urls=new Set();
    const load=async(img,entry)=>{
      if(entry.pending||entry.loaded)return;entry.pending=true;
      try{
        const blob=await thumbnail(entry.id,()=>!disposed&&entry.visible&&img.isConnected);
        if(!blob||disposed||!img.isConnected)return;
        const url=URL.createObjectURL(blob);urls.add(url);img.src=url;entry.loaded=true;observer?.unobserve(img);
      }catch(_){if(!disposed){img.alt='写真を読み込めませんでした';img.title='写真を開くと元の画像を確認できます。';}}
      finally{entry.pending=false;}
    };
    const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(changes=>{
      for(const change of changes){const entry=entries.get(change.target);if(!entry)continue;entry.visible=change.isIntersecting;if(entry.visible)load(change.target,entry);}
    },{root,rootMargin:'160px'}):null;
    return {
      observe(img,id){img.decoding='async';img.loading='lazy';const entry={id,visible:!observer,pending:false,loaded:false};entries.set(img,entry);if(observer)observer.observe(img);else queueMicrotask(()=>load(img,entry));},
      dispose(){disposed=true;observer?.disconnect();entries.clear();urls.forEach(url=>URL.revokeObjectURL(url));urls.clear();}
    };
  }
  window.PhotoImages={decode,release,thumbnail,previews};
})();
