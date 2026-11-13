/* 福よびガチャ配信用ローダー。既存のガチャデータと会話強化パックを順番に読み込みます。 */
(async () => {
  async function readText(file) {
    const response = await fetch(file, { cache: 'no-store' });
    if (!response.ok) throw new Error(file + ': HTTP ' + response.status);
    return response.text();
  }
  async function inflate(encoded) {
    const bytes = Uint8Array.from(atob(encoded.replace(/\s/g, '')), c => c.charCodeAt(0));
    if (typeof DecompressionStream !== 'function') throw new Error('このブラウザは圧縮ファイルの展開に対応していません。');
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
  }
  function execute(source) {
    const script = document.createElement('script');
    script.textContent = source;
    document.body.appendChild(script);
    script.remove();
  }

  const dialogue = await inflate(await readText('./dialogue-v2.txt'));
  execute(dialogue);
  if (!window.FORTUNE_DIALOGUE_V2?.patchSource) throw new Error('キャラクターの会話データを読み込めませんでした。');

  execute(await readText('./character-conversation-v3.js'));
  if (!window.FORTUNE_DIALOGUE_V3) throw new Error('キャラクターの追加会話を読み込めませんでした。');
  execute(await readText('./interaction-v4.js'));
  if (!window.FORTUNE_PLAYLIST) throw new Error('新しい抽選処理を読み込めませんでした。');
  execute(await readText('./serizawa-memories-v6.js'));
  if (!window.FORTUNE_SERIZAWA_MEMORIES_V6?.ready) throw new Error('芹沢の追加台詞を読み込めませんでした。');
  execute(await readText('./serizawa-relations-v7.js'));
  if (!window.FORTUNE_SERIZAWA_RELATIONS_V7?.ready) throw new Error('芹沢の関係性別の会話を読み込めませんでした。');

  const files = Array.from({ length: 7 }, (_, i) => './payload-' + String(i + 1).padStart(2, '0') + '.txt');
  const encodedParts = await Promise.all(files.map(readText));
  let source = await inflate(encodedParts.join(''));
  if (!source.includes('FORTUNE_CHARACTERS') || !source.includes('FORTUNE_WACOLORS')) {
    throw new Error('占いデータの整合性を確認できませんでした。');
  }
  source = window.FORTUNE_DIALOGUE_V2.patchSource(source);
  execute(source);
})().catch(error => {
  console.error('Fortune Gacha load failed:', error);
  const hint = document.getElementById('spinGuidance');
  if (hint) hint.textContent = '読み込みに失敗しました。ページを再読み込みしてください。';
  const btn = document.getElementById('spinButton');
  const crank = document.getElementById('crank');
  if (btn) btn.disabled = true;
  if (crank) crank.disabled = true;
});