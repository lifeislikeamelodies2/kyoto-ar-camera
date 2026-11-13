# 福よびガチャ — 京都キャラクター版

京都ARカメラの `【アイコン】` 画像を使った、スマートフォン対応のガチャ式占いアプリです。このフォルダはARカメラ本体から独立しています。

## 公開先
GitHub Pagesで `main / (root)` を公開している場合：
https://lifeislikeamelodies2.github.io/kyoto-ar-camera/fortune-gacha/

## 主な仕様
- ガチャハンドルのアニメーション、カプセル開封、キャラクターごとの口調
- 8項目の占い：総評、アドバイス、ラッキーアイテム、ラッキーパーソン、和色のラッキーカラー、創作ネタ、シチュエーション、おすすめ楽曲（YouTubeリンク）
- 9枠のSDキャラクター。**芹夢：出現率2％・特別演出**、ほか8枠：各12.25％
- 合成音声読み上げ、結果共有、直近30件の履歴、図鑑と収集率
- 画像は同リポジトリ `/images/【アイコン】*.png` からオンライン参照

## 配信用ファイル
- `index.html`：画面
- `styles.css`：デザイン
- `bundle.js`：圧縮データの読み込み
- `payload-01.txt`〜`payload-07.txt`：`characters.js`、`fortune-extras.js`、`app.js` の順に結合したJavaScriptをgzip圧縮し、Base64化して分割した**配信用データ**

配信用データは手編集するものではありません。台詞・占い・確率などの変更には元の編集用ソース（`fortune-gacha-8items-seriyume-rare.zip`、ChatGPT会話内で配布）を使用し、配信用データを再生成して差し替えます。

## 注意
- iOS / Androidの最近のブラウザ向けに、`DecompressionStream('gzip')` を使用しています。
- GitHub Pagesの公開設定は、このフォルダへのコミットだけでは変更されません。
- 占いは娯楽目的で、結果はランダムです。
