/* 福よびガチャ v4: カプセルの一度だけの出現、色差分、自然な呼びかけ、指定YouTube再生リストから選曲 */
(() => {
  'use strict';
  const base = window.FORTUNE_DIALOGUE_V2;
  if (!base?.patchSource || !window.FORTUNE_DIALOGUE_V3) throw new Error('会話パックの読込順が正しくありません。');
  const playlistId = 'PLIkZyCCllTL6pznBNUy808OrJh4ReFnBj';
  const playlistUrl = `https://www.youtube.com/playlist?list=${playlistId}`;
  let videoIds = [];
  let player = null;
  let selectedVideoId = null;
  let failed = false;
  let started = false;
  let timer = null;
  const videoTitles = new Map();
  const listeners = new Set();
  const notify = () => listeners.forEach(listener => { try { listener(); } catch (error) { console.error(error); } });
  function randomIndex(max) {
    if (max < 1) return 0;
    if (window.crypto?.getRandomValues) {
      const data = new Uint32Array(1), limit = 0x100000000 - (0x100000000 % max);
      do { window.crypto.getRandomValues(data); } while (data[0] >= limit);
      return data[0] % max;
    }
    return Math.floor(Math.random() * max);
  }
  function fallback() {
    return {artist:'',title:failed ? '指定プレイリストを開く' : '指定プレイリストから選曲中…',url:playlistUrl,reason:'YouTubeの再生リストを開けます。',pending:true};
  }
  function videoSong(id, index) {
    const title = videoTitles.get(id) || `プレイリスト収録曲（${index + 1}曲目）`;
    return {artist:'',title,url:`https://www.youtube.com/watch?v=${id}&list=${playlistId}&index=${index + 1}`,videoId:id,reason:'今日の一曲として選ばれました。'};
  }
  const playlist = {
    pick() {
      if (!videoIds.length) return fallback();
      const index = randomIndex(videoIds.length);
      const id = videoIds[index];
      selectedVideoId = id;
      try { player?.cueVideoById(id); } catch (_) { /* リンクだけでも有効 */ }
      return videoSong(id,index);
    },
    titleOf(id) { return videoTitles.get(id) || ''; },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    available() { return videoIds.length > 0; },
    failed() { return failed; },
    start() {
      if (started) return;
      started = true;
      timer = setTimeout(() => { if (!videoIds.length) { failed = true; notify(); } }, 12000);
      const begin = () => {
        if (!window.YT?.Player) return;
        const target = document.getElementById('youtubePreview');
        if (!target) { failed=true; notify(); return; }
        player = new YT.Player(target, {
          width:'320',height:'200',
          playerVars:{playsinline:1,controls:1,rel:0,origin:location.protocol.startsWith('http') ? location.origin : undefined},
          events:{
            onReady(event) {
              try {event.target.cuePlaylist({listType:'playlist',list:playlistId,index:0});}
              catch (_) {failed=true;notify();}
            },
            onError() { if (!videoIds.length) {failed=true;notify();} },
            onStateChange(event) {
              if (!window.YT?.PlayerState || event.data !== YT.PlayerState.CUED) return;
              try {
                if (!videoIds.length) {
                  const all = event.target.getPlaylist() || [];
                  videoIds = all.filter(id => /^[\w-]{11}$/.test(id));
                  if (videoIds.length) { clearTimeout(timer); failed=false; notify(); }
                }
                const data = event.target.getVideoData?.() || {};
                if (selectedVideoId && data.video_id === selectedVideoId && data.title) {
                  videoTitles.set(selectedVideoId,data.title);
                  notify();
                }
              } catch (error) { console.warn('Playlist metadata unavailable',error); }
            }
          }
        });
      };
      if (window.YT?.Player) { begin(); return; }
      const previousCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { previousCallback?.(); begin(); };
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.onerror = () => { failed=true; clearTimeout(timer); notify(); };
      document.head.appendChild(script);
    }
  };
  window.FORTUNE_PLAYLIST = playlist;

  // 呼びかけとして唐突に挟まる「君、」「あなた、」だけを除き、
  // 「君の」「あなたに」など意味を持つ語句は削除しない。
  // 発言全体を飾る括弧だけを除去。会話の途中で別の人物を引用した「」は残す。
  function stripOuterDialogueQuotes(value) {
    let result = String(value ?? '').trim();
    const enclosesWholeLine = (s) => {
      if (!s.startsWith('「') || !s.endsWith('」')) return false;
      let depth = 0;
      for (let i = 0; i < s.length; i++) {
        if (s[i] === '「') depth++;
        else if (s[i] === '」') depth--;
        if (depth < 0 || (depth === 0 && i < s.length - 1)) return false;
      }
      return depth === 0;
    };
    while (enclosesWholeLine(result)) result = result.slice(1, -1).trim();
    return result;
  }
  function cleanVocative(line) {
    if (!line) return '';
    return stripOuterDialogueQuotes(line)
      .replace(/(^|[。！？!?]\s*|「\s*)(?:あなた|君)[、，]\s*/g,'$1')
      .replace(/([、，]\s*)(?:あなた|君)[、，]\s*/g,'$1')
      .replace(/(ねえ|あのね|ところで)[、，]\s*(?:あなた|君)[、，]\s*/g,'$1、');
  }
  const palettes = [
    ['#ffd0dc','#d9779a','#a55077'], // 桃
    ['#e5d4ff','#a287d4','#7657a7'], // 藤
    ['#d3f3e7','#61b7a5','#388f82'], // 翡翠
    ['#fff0b7','#e3b95e','#ae8234'], // 蜜柑
    ['#c6e4ff','#75a7dc','#4a7aae'], // 水色
    ['#fff0d5','#df9f75','#ae6d54'], // 杏
    ['#facdda','#d685b9','#a05b91'], // 撫子
    ['#dff0c7','#9dbb6c','#6d9550'], // 若草
    ['#e0e0ee','#9ca1c5','#727ba5'], // 桔梗
    ['#ffd9c4','#eb947b','#bd6c5b']  // 珊瑚
  ];
  function setCapsuleColor(characterId) {
    const palette = characterId === 'seriyume' ? ['#fff6c4','#edc15d','#b88b31'] : palettes[randomIndex(palettes.length)];
    for (const node of [document.getElementById('giantCapsule'),document.getElementById('fallingCapsule')]) {
      if (!node) continue;
      node.style.setProperty('--capsule-light',palette[0]);
      node.style.setProperty('--capsule-dark',palette[1]);
      node.style.setProperty('--capsule-rim',palette[2]);
    }
  }
  window.FORTUNE_UX = { cleanVocative, setCapsuleColor };

  function polish(id,raw){
    if(raw==null)return '';
    let s=String(raw);
    if(id==='serizawa'){
      s=s.replace(/[、，]\s*いしゃあ(?=[。！？!?]|$)/g,'');
      s=s.replace(/(^|[。！？!?]\s*)いしゃあ(?=[。！？!?]|$)/g,'$1');
    }
    if(id==='saeki'||id==='saeki-original'){
      s=s.replace(/あんたの願いが何か/g,'何を願ったのか').replace(/あんたの名前でも/g,'名前でも')
        .replace(/あんたの行く先/g,'これから進む先').replace(/あんたの勘/g,'今日の勘')
        .replace(/あんたの運/g,'今日の運').replace(/あんたは何味派/g,'好きなのは何味っすか')
        .replace(/あんたが来たって/g,'誰か来たって')
        .replace(/あんたも[、，]?\s*一緒に/g,'一緒に').replace(/あんたも感想/g,'感想')
        .replace(/あんた[、，]\s*/g,'').replace(/あんたも/g,'一緒に')
        .replace(/あんたが/g,'そっちが').replace(/あんたの/g,'そっちの')
        .replace(/あんたは/g,'そっちは').replace(/あんたに/g,'そっちに')
        .replace(/あんたと/g,'一緒に').replace(/あんた/g,'');
    }
    return s;
  }
  window.FORTUNE_UX.polish=polish;
  for(const key of ['item','person','color','story']){
    const original=base[key].bind(base);
    base[key]=(id,...args)=>polish(id,original(id,...args));
  }


  const patchBefore = base.patchSource.bind(base);
  base.patchSource = (source) => {
    let out = patchBefore(source);
    const replace = (before,after,label) => {
      if (!out.includes(before)) throw new Error('v4更新位置が見つかりません: '+label);
      out = out.replace(before,after);
    };
    replace(
      "const pool = songs.filter(song => song.moods.includes(rank.tier));\n    const song = pick(pool.length ? pool : songs);",
      "const song = window.FORTUNE_PLAYLIST.pick();",'playlist song selection');
    replace("song:{artist:song.artist,title:song.title,url:song.url,reason:song.reason},",
      "song:{...song},",'preserve playlist video IDs and pending state');
    replace("latestReading = makeReading();\n    setSpinning(true);",
      "latestReading = makeReading();\n    window.FORTUNE_UX.setCapsuleColor(latestReading.characterId);\n    setSpinning(true);",'capsule color');
    replace("$('songTitle').textContent = reading.song ? `${reading.song.artist}「${reading.song.title}」` : '—';",
      "$('songTitle').textContent = reading.song ? (reading.song.artist ? `${reading.song.artist}「${reading.song.title}」` : reading.song.title) : '—';",'music heading');
    replace(String.raw`const isYoutube = /^https:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[a-zA-Z0-9_-]{11}$/.test(reading.song?.url || '');`,
      String.raw`const isYoutube = /^https:\/\/www\.youtube\.com\/(?:watch\?v=[\w-]{11}|playlist\?list=PL[\w-]+)/.test(reading.song?.url || '');`,
      'playlist URL validation');
    replace("if (isYoutube) link.href = reading.song.url;",
      "if (isYoutube) link.href = reading.song.url;\n    link.textContent = reading.song?.pending ? 'プレイリストをYouTubeで開く ↗' : 'YouTubeでこの曲を聴く ↗';\n    ['fortuneMessage','fortuneAdvice','luckyItemLine','luckyPersonLine','luckyNote','creativeSceneLine','songLine'].forEach(id => {const node=$(id);if(node) node.textContent=window.FORTUNE_UX.cleanVocative(node.textContent);});",'render voice cleanup');
    replace("readingPhase.hidden = false;\n      history.unshift(latestReading);",
      "readingPhase.hidden = false;\n      window.FORTUNE_PLAYLIST.start();\n      history.unshift(latestReading);",'begin playlist retrieval after reveal');
    replace("toggleSoundButton.textContent = soundEnabled ? '♪ 効果音 ON' : '♪ 効果音 OFF';",
      `window.FORTUNE_PLAYLIST.subscribe(() => {
    if (!latestReading) return;
    if (latestReading.song?.pending) {
      if (!window.FORTUNE_PLAYLIST.available() && !window.FORTUNE_PLAYLIST.failed()) return;
      latestReading.song = window.FORTUNE_PLAYLIST.pick();
      latestReading.songLine = window.FORTUNE_DIALOGUE_V3.song(latestReading.characterId,latestReading.song);
    } else if (latestReading.song?.videoId) {
      const title = window.FORTUNE_PLAYLIST.titleOf(latestReading.song.videoId);
      if (!title || title === latestReading.song.title) return;
      latestReading.song.title = title;
    } else return;
    if (history.some(entry => entry.timestamp === latestReading.timestamp)) writeStorage(STORAGE_KEY,JSON.stringify(history));
    if (!resultOverlay.hidden && !readingPhase.hidden && !activeHistoryReading) renderReading(latestReading);
  });
  toggleSoundButton.textContent = soundEnabled ? '♪ 効果音 ON' : '♪ 効果音 OFF';`,'playlist selection callback');
    replace("const spoken = sections.filter(Boolean).join('　').replace(/笑/g,'ふふ');",
      "const spoken = sections.filter(Boolean).map(window.FORTUNE_UX.cleanVocative).join('　').replace(/笑/g,'ふふ');",'speech cleanup');

    const post=(before,after,label)=>{
      if(!out.includes(before))throw Error('口調修正の対象がありません: '+label);
      out=out.replace(before,after);
    };
    post('message:fortune,','message:window.FORTUNE_UX.polish(character.id,fortune),','総評');
    post("advice:character.id === 'seriyume' ? window.FORTUNE_DIALOGUE_V3.advice(rank) : pick(persona.advice[rank.tier]),",
      "advice:window.FORTUNE_UX.polish(character.id,character.id === 'seriyume' ? window.FORTUNE_DIALOGUE_V3.advice(rank) : pick(persona.advice[rank.tier])),",'助言');
    const tick=String.fromCharCode(96);
    post("$('fortuneMessage').textContent = "+tick+"「"+String.fromCharCode(36)+"{reading.message}」"+tick+";",
      "$('fortuneMessage').textContent = window.FORTUNE_UX.polish(character.id,reading.message);",'履歴の総評');
    post("$('fortuneAdvice').textContent = reading.advice || '今日はゆっくり自分のペースで進もう。';",
      "$('fortuneAdvice').textContent = window.FORTUNE_UX.polish(character.id,reading.advice || '今日はゆっくり自分のペースで進もう。');",'履歴の助言');
    post("$('songLine').textContent = window.FORTUNE_DIALOGUE_V3.song(character.id,reading.song) || '';",
      "$('songLine').textContent = window.FORTUNE_UX.polish(character.id,reading.songLine || (reading.songLine = window.FORTUNE_DIALOGUE_V3.song(character.id,reading.song)) || '');",'楽曲台詞保持');
    post("const spoken = sections.filter(Boolean).map(window.FORTUNE_UX.cleanVocative).join('　').replace(/笑/g,'ふふ');",
      "const spoken = sections.filter(Boolean).map(line => window.FORTUNE_UX.polish(character.id,window.FORTUNE_UX.cleanVocative(line))).join('　').replace(/笑/g,'ふふ');",'読み上げ');
    return out;
  };
})();