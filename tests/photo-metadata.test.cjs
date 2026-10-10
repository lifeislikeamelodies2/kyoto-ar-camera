const {test}=require('node:test');
const assert=require('node:assert/strict');
const M=require('../map/photo-metadata.js');
const exifr=require('../map/vendor/exifr-7.1.3.js');
function fixture({south=false,west=false}={}){
  const t=Buffer.alloc(220);t.write('II');t.writeUInt16LE(42,2);t.writeUInt32LE(8,4);
  const entry=(at,tag,type,count,value)=>{t.writeUInt16LE(tag,at);t.writeUInt16LE(type,at+2);t.writeUInt32LE(count,at+4);if(typeof value==='string')t.write(value,at+8);else t.writeUInt32LE(value,at+8);};
  t.writeUInt16LE(2,8);entry(10,0x8769,4,1,38);entry(22,0x8825,4,1,68);
  t.writeUInt16LE(2,38);entry(40,0x9003,2,20,124);entry(52,0x9011,2,7,144);
  t.writeUInt16LE(4,68);entry(70,1,2,2,south?'S':'N');entry(82,2,5,3,152);entry(94,3,2,2,west?'W':'E');entry(106,4,5,3,176);
  t.write('2026:10:10 09:12:34\0',124);t.write('+09:00\0',144);
  [34,10,30].forEach((v,i)=>{t.writeUInt32LE(v,152+i*8);t.writeUInt32LE(1,156+i*8);});
  [134,36,0].forEach((v,i)=>{t.writeUInt32LE(v,176+i*8);t.writeUInt32LE(1,180+i*8);});
  const size=Buffer.alloc(2);size.writeUInt16BE(t.length+8);
  return {tiff:t,jpeg:Buffer.concat([Buffer.from([255,216,255,225]),size,Buffer.from('Exif\0\0'),t,Buffer.from([255,217])])};
}
test('real EXIF JPEG gives longitude/latitude and capture time, before image conversion',async()=>{
  const {jpeg}=fixture(),r=await M.read(new Blob([jpeg]),exifr);
  assert.deepEqual(r.point,[134.6,34.175]);assert.equal(r.capturedAt,'2026-10-10T00:12:34.000Z');assert.equal(r.assumedTimezone,false);
  assert.equal(M.japanInput(r.capturedAt),'2026-10-10T09:12:34');
});
test('EXIF southern and western references are negative, not swapped',async()=>{
  const r=await M.read(new Blob([fixture({south:true,west:true}).jpeg]),exifr);assert.deepEqual(r.point,[-134.6,-34.175]);
});
test('WebP EXIF chunk is decoded by the same parser',async()=>{
  const {tiff}=fixture(),header=Buffer.alloc(20);header.write('RIFF');header.writeUInt32LE(tiff.length+12,4);header.write('WEBP',8);header.write('EXIF',12);header.writeUInt32LE(tiff.length,16);
  const r=await M.read(new Blob([header,tiff]),exifr);assert.deepEqual(r.point,[134.6,34.175]);
});
test('timestamps respect explicit offset across days and preserve seconds',()=>{
  const r=M.normalize({DateTimeOriginal:'2026:10:10 23:59:47',OffsetTimeOriginal:'-04:00'});
  assert.equal(M.japanInput(r.capturedAt),'2026-10-11T12:59:47');
  assert.equal(M.fromJapanInput('2026-10-11T12:59:47'),r.capturedAt);
});
test('missing timezone assumes Japan explicitly, missing capture time stays empty',()=>{
  const r=M.normalize({DateTimeOriginal:'2026:10:10 00:01:02'});
  assert.equal(r.capturedAt,'2026-10-09T15:01:02.000Z');assert.equal(r.assumedTimezone,true);
  assert.equal(M.normalize({ModifyDate:'2026:10:10 13:00:00'}).capturedAt,null);
  assert.equal(M.normalize({latitude:NaN,longitude:134}).point,null);
  assert.deepEqual(M.normalize({latitude:0,longitude:0}).point,[0,0]);
});
test('invalid dates are rejected and camera creation date is a valid fallback',()=>{
  assert.equal(M.parseDate('2026:02:30 12:00:00','+09:00'),null);
  assert.equal(M.fromJapanInput(''),null);
  assert.equal(M.fromJapanInput('2026-10-10T09:12:34.000'),'2026-10-10T00:12:34.000Z');
  assert.equal(M.fromJapanInput('2026-10-10T25:00'),null);
  assert.equal(M.normalize({CreateDate:'2026:10:10 09:00:00',OffsetTimeDigitized:'+09:00'}).capturedAt,'2026-10-10T00:00:00.000Z');
});
test('original EXIF is retained as a separate value for backup and later location changes',()=>{
  const raw={point:[134.6,34.175],capturedAt:'2026-10-10T00:00:00Z',assumedTimezone:true,dateSource:'DateTimeOriginal'};
  const safe=M.original(raw);raw.point[0]=0;assert.equal(safe.point[0],134.6);
  assert.deepEqual(M.original(JSON.parse(JSON.stringify(safe))),safe);
});
