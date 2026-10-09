const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../map/core.js');
test('Japan dates keep photos around midnight on the correct day',()=>{
  assert.equal(C.day('2026-12-04T14:59:59Z'),'2026-12-04');
  assert.equal(C.day('2026-12-04T15:00:00Z'),'2026-12-05');
  assert.throws(()=>C.day('not a date'));
});
test('daily route uses capture order and excludes photos without coordinates',()=>{
  const photos=[{id:'b',capturedAt:'2026-12-04T04:00Z',point:[135.78,35.02]},{id:'missing',capturedAt:'2026-12-04T03:00Z',point:null},{id:'a',capturedAt:'2026-12-04T01:00Z',point:[135.76,35.01]},{id:'next',capturedAt:'2026-12-04T16:00Z',point:[135.8,35.02]}];
  const draft=C.draftFromPhotos(photos,'2026-12-04');
  assert.deepEqual(draft.points.map(p=>p.photoId),['a','b']);
  assert.equal(draft.confirmed,false);
});
test('distance is geographic, symmetric and handles the date line',()=>{
  assert.equal(C.distance([0,0],[0,0]),0);
  assert.ok(Math.abs(C.distance([0,0],[1,0])-111195)<5);
  assert.ok(C.distance([179.9,0],[-179.9,0])<23000);
  assert.equal(C.distance([135,35],[136,36]),C.distance([136,36],[135,35]));
  assert.throws(()=>C.distance([NaN,0],[0,0]));
});
test('only confirmed routes count, and replacing a day does not double-count',()=>{
  const make=(date,lon,confirmed)=>({date,confirmed,segments:[{coordinates:[[0,0],[lon,0]]}]});
  const records=new Map();records.set('2026-12-04',make('2026-12-04',1,true));records.set('2026-12-05',make('2026-12-05',3,false));
  assert.ok(Math.abs(C.totalDistance([...records.values()])-111195)<5);
  records.set('2026-12-04',make('2026-12-04',2,true));
  assert.ok(Math.abs(C.totalDistance([...records.values()])-222390)<5);
  records.delete('2026-12-04');assert.equal(C.totalDistance([...records.values()]),0);
});
test('milestone colors use the chosen metric at precise thresholds',()=>{
  assert.equal(C.pinColor('count',4,100000),C.colors[0]);
  assert.equal(C.pinColor('count',5,0),C.colors[1]);
  assert.equal(C.pinColor('distance',500,4999),C.colors[0]);
  assert.equal(C.pinColor('distance',0,5000),C.colors[1]);
  assert.equal(C.pinColor('distance',0,100000),C.colors[4]);
});
test('route validation rejects malformed backup geometry and disconnected paths',()=>{
  const r=C.draftFromPhotos([{id:'a',capturedAt:'2026-12-04T01:00Z',point:[135,35]},{id:'b',capturedAt:'2026-12-04T02:00Z',point:[135.1,35]}],'2026-12-04');r.segments=C.straightSegments(r.points);
  assert.equal(C.validateRoute(r),r);
  assert.throws(()=>C.validateRoute({...r,date:'2026-02-30'}));
  assert.throws(()=>C.validateRoute({...r,segments:[]}));
  assert.throws(()=>C.validateRoute({...r,segments:[{mode:'foot',kind:'road',coordinates:[[0,0],[1,0]]}]}));
});
