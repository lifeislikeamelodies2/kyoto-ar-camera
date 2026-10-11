const {test}=require('node:test');
const assert=require('node:assert/strict');
const R=require('../map/report-renderer.js');
const photos=Array.from({length:18},(_,i)=>({id:'p'+(i+1),point:i===2?null:[134,34]}));
test('all mode includes every photo, including photos without a location',()=>{
  const result=R.choose(photos,'all');assert.equal(result.length,18);assert.equal(result[2].point,null);assert.equal(result[14].number,15);
});
test('selected mode keeps daily order and original numbers, without a selection limit',()=>{
  const result=R.choose(photos,'selected',['p15','p3','p18','p1','p5','p5']);
  assert.deepEqual(result.map(p=>p.number),[1,3,5,15,18]);
  assert.throws(()=>R.choose(photos,'selected',[]));assert.equal(R.choose(photos,'selected',['p1','p2','p3','p4','p5','p6']).length,6);
  assert.equal(R.choose(photos,'selected',photos.map(p=>p.id)).length,18);
  const many=Array.from({length:500},(_,i)=>({id:'many'+i}));assert.equal(R.choose(many,'selected',many.map(p=>p.id)).length,500);
});
test('long all-photo images fit mobile canvas bounds without dropping cards',()=>{
  for(const count of [0,1,5,18,100,500,2000]){
    const l=R.layout(count);assert.ok(l.pixelHeight<=16000);assert.ok(l.pixelWidth*l.pixelHeight<=12000000);
    if(count)assert.ok(l.gridY+Math.floor((count-1)/2)*(l.cardH+l.gap)+l.cardH<l.height);
  }
});
test('render includes all selected photos and labels only supplied daily distance',async()=>{
  const texts=[],decoded=[];let released=0;
  const ctx=new Proxy({measureText:s=>({width:s.length*10}),fillText:s=>texts.push(s)},{get:(o,k)=>k in o?o[k]:()=>{}});
  const input={date:'2026-10-10',mode:'all',photos:R.choose(photos,'all').map(p=>({...p,blob:p.id,capturedAt:'2026-10-10T01:00:00Z'})),totalPhotos:18,mapCanvas:null,pins:[],hasRoute:false,distanceLabel:'未確定',routeNote:'ルート未保存'};
  await R.render(input,{createCanvas:()=>({getContext:()=>ctx}),decodeImage:async id=>{decoded.push(id);return {width:100,height:100};},releaseImage:()=>released++});
  assert.equal(decoded.length,18);assert.equal(released,18);assert.ok(texts.includes('未確定'));assert.ok(texts.some(s=>s.startsWith('写真 15')));assert.ok(texts.some(s=>s.includes('地点未設定')));
  assert.ok(texts.includes('撮影地点が未設定のため、地図はありません。'));
});
