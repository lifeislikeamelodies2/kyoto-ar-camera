(function(root){
  'use strict';
  const clean=v=>typeof v==='string'?v.replace(/\0/g,'').trim():'';
  function validPoint(p){return Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=85;}
  function parseDate(value,offset){
    const m=clean(value).match(/^(\d{4})[:\-](\d{2})[:\-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
    if(!m)return null;
    const [y,mo,d,h,mi,s]=m.slice(1).map(Number),utc=new Date(Date.UTC(y,mo-1,d,h,mi,s));
    if(y<1900||utc.getUTCFullYear()!==y||utc.getUTCMonth()!==mo-1||utc.getUTCDate()!==d||utc.getUTCHours()!==h||utc.getUTCMinutes()!==mi||utc.getUTCSeconds()!==s)return null;
    const raw=clean(offset),match=raw.match(/^([+-])(\d{2}):(\d{2})$/);
    const valid=match&&Number(match[2])<=14&&Number(match[3])<60&&(Number(match[2])!==14||match[3]==='00');
    // No timezone in traditional EXIF: use the app's declared Japanese time, not the device timezone.
    const zone=valid?raw:'+09:00',iso=`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${zone}`;
    return {capturedAt:new Date(iso).toISOString(),assumedTimezone:!valid,offset:zone};
  }
  function normalize(tags){
    tags=tags||{};
    const p=[tags.longitude,tags.latitude],point=validPoint(p)?p:null;
    let date=parseDate(tags.DateTimeOriginal,tags.OffsetTimeOriginal),dateSource='DateTimeOriginal';
    if(!date){date=parseDate(tags.CreateDate,tags.OffsetTimeDigitized);dateSource='CreateDate';}
    return {point,capturedAt:date?.capturedAt||null,assumedTimezone:date?.assumedTimezone||false,offset:date?.offset||null,dateSource:date?dateSource:null};
  }
  function japanInput(iso){return new Date(new Date(iso).getTime()+9*3600000).toISOString().slice(0,19);}
  function fromJapanInput(value){const raw=value.replace(/\.0{1,3}$/,'');const normalized=raw.length===16?raw+':00':raw;return parseDate(normalized,'+09:00')?.capturedAt||null;}
  function webpExif(bytes){
    const text=(a,b)=>String.fromCharCode(...bytes.subarray(a,b));
    if(bytes.length<12||text(0,4)!=='RIFF'||text(8,12)!=='WEBP')return bytes;
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    for(let at=12;at+8<=bytes.length;){
      const size=view.getUint32(at+4,true),end=at+8+size;if(end>bytes.length)throw new Error('Incomplete WebP metadata');
      if(text(at,at+4)==='EXIF'){let start=at+8;if(text(start,start+6)==='Exif\0\0')start+=6;return bytes.slice(start,end);}
      at=end+(size%2);
    }
    return null;
  }
  async function read(file,parser=root.exifr){
    if(!parser?.parse)throw new Error('写真の情報を読み取る機能を読み込めませんでした。再読み込みしてください。');
    if(file.size>25*1024*1024)throw new Error('写真は25MB以下で選択してください。');
    const bytes=new Uint8Array(await file.arrayBuffer()),input=webpExif(bytes);
    if(!input)return normalize(null);
    const tags=await parser.parse(input,{reviveValues:false,translateValues:false,xmp:false,icc:false,iptc:false,jfif:false,ihdr:false});
    return normalize(tags);
  }
  function original(value){
    if(!value||typeof value!=='object')return null;
    return {point:validPoint(value.point)?[...value.point]:null,capturedAt:typeof value.capturedAt==='string'&&Number.isFinite(Date.parse(value.capturedAt))?new Date(value.capturedAt).toISOString():null,assumedTimezone:value.assumedTimezone===true,offset:/^[+-]\d{2}:\d{2}$/.test(value.offset||'')?value.offset:null,dateSource:['DateTimeOriginal','CreateDate'].includes(value.dateSource)?value.dateSource:null};
  }
  root.PhotoMetadata={read,normalize,parseDate,japanInput,fromJapanInput,webpExif,original};
  if(typeof module!=='undefined')module.exports=root.PhotoMetadata;
})(typeof globalThis!=='undefined'?globalThis:window);
