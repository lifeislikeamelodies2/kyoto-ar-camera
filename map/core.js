(function (root) {
  'use strict';
  const colors = ['#796f53', '#4e7868', '#537c9b', '#8a6190', '#b47532'];
  function day(iso) {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) throw new Error('撮影日時が正しくありません。');
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  }
  function validPoint(p) { return Array.isArray(p) && p.length === 2 && p.every(Number.isFinite) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 85; }
  function distance(a, b) {
    if (!validPoint(a) || !validPoint(b)) throw new Error('位置情報が正しくありません。');
    const rad = Math.PI / 180, dlat = (b[1] - a[1]) * rad, dlon = (b[0] - a[0]) * rad;
    const h = Math.sin(dlat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dlon / 2) ** 2;
    return 6371008.8 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
  }
  const length = points => points.slice(1).reduce((s, p, i) => s + distance(points[i], p), 0);
  const dailyPhotos = (photos, date) => photos.filter(p => day(p.capturedAt) === date).sort((a,b) => new Date(a.capturedAt) - new Date(b.capturedAt) || a.id.localeCompare(b.id));
  const totalDistance = routes => routes.filter(r => r.confirmed === true).reduce((sum,r) => sum + r.segments.reduce((s, seg) => s + length(seg.coordinates), 0), 0);
  function pinColor(mode, count, meters) {
    const limits = mode === 'distance' ? [5000, 20000, 50000, 100000] : [5, 15, 30, 60];
    const n = mode === 'distance' ? meters : count;
    return colors[limits.filter(x => n >= x).length];
  }
  const formatDistance = meters => meters < 1000 ? Math.round(meters) + ' m' : (meters / 1000).toFixed(1) + ' km';
  function draftFromPhotos(photos, date, mode = 'foot') {
    return { date, confirmed: false, updatedAt: new Date().toISOString(), points: dailyPhotos(photos,date).filter(p=>validPoint(p.point)).map(p=>({id:p.id,photoId:p.id,point:[...p.point],label:p.title || new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit'}).format(new Date(p.capturedAt)) + ' の写真', mode})), segments: [] };
  }
  function straightSegments(points) { return points.slice(1).map((p,i)=>({mode:points[i].mode || 'foot',kind:'straight',coordinates:[[...points[i].point],[...p.point]]})); }
  function validateRoute(r) {
    if (!r || !/^\d{4}-\d{2}-\d{2}$/.test(r.date) || day(r.date+'T12:00:00+09:00')!==r.date || !Array.isArray(r.points) || r.points.length < 2 || r.points.length > 300 || !Array.isArray(r.segments) || r.segments.length !== r.points.length - 1) throw new Error('ルートの形式が正しくありません。');
    for (const p of r.points) if (!validPoint(p.point) || typeof p.id !== 'string' || typeof p.label !== 'string' || !['foot','car','transit','manual'].includes(p.mode)) throw new Error('経由地点の形式が正しくありません。');
    for (const [i,s] of r.segments.entries()) {
      if (!['road','straight','manual'].includes(s.kind) || !['foot','car','transit','manual'].includes(s.mode) || !Array.isArray(s.coordinates) || s.coordinates.length<2 || s.coordinates.length>100000 || !s.coordinates.every(validPoint)) throw new Error('経路の形式が正しくありません。');
      if(distance(s.coordinates[0],r.points[i].point)>1000 || distance(s.coordinates.at(-1),r.points[i+1].point)>1000) throw new Error('経路と経由地点が一致しません。');
    }
    return r;
  }
  const api = { colors, day, validPoint, distance, length, dailyPhotos, totalDistance, pinColor, formatDistance, draftFromPhotos, straightSegments, validateRoute };
  root.TravelCore = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
