/* 福よびガチャ配信用ローダー。ソース編集用一式は元のZIPを参照。 */
(async () => {
  const files = Array.from({ length: 7 }, (_, i) => './payload-' + String(i + 1).padStart(2, '0') + '.txt');
  const parts = await Promise.all(files.map(async file => {
    const response = await fetch(file, { cache: 'no-store' });
    if (!response.ok) throw new Error(file + ': HTTP ' + response.status);
    return response.text();
  }));
  const encoded = parts.join('').replace(/\s/g, '');
  const compressed = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
  if (typeof DecompressionStream !== 'function') throw new Error('このブラウザは圧縮ファイルの展開に対応していません。');
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
  const scriptText = await new Response(stream).text();
  if (!scriptText.includes('FORTUNE_CHARACTERS') || !scriptText.includes('FORTUNE_WACOLORS')) {
    throw new Error('占いデータの整合性を確認できませんでした。');
  }
  const script = document.createElement('script');
  script.textContent = scriptText;
  document.body.appendChild(script);
  script.remove();
})().catch(error => {
  console.error('Fortune Gacha load failed:', error);
  const hint = document.getElementById('spinGuidance');
  if (hint) hint.textContent = '読み込みに失敗しました。ページを再読み込みしてください。';
  const btn = document.getElementById('spinButton');
  const crank = document.getElementById('crank');
  if (btn) btn.disabled = true;
  if (crank) crank.disabled = true;
});