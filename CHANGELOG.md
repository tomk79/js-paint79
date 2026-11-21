# 変更履歴

`@tomk79/paint79` の利用者に影響する変更を記録します。

## 0.1.0 (2026-11-21)

初めての公開です。

### 機能

- ブラウザ上に canvas を展開し、マウス・タッチ・ペンで絵を描く UI を提供します(Pointer Events ベース)
  - ペンの筆圧に応じた線の太さ(`pressure`)
  - 受け付ける入力の種類の指定(`pointerTypes`)と、パームリジェクション(`palmRejection`)
  - 高解像度ディスプレイへの対応(`pixelRatio`)
- ペンと消しゴムのツール、描画色と線の太さの設定
- レイヤー: 追加・削除・複製・並べ替え・下のレイヤーとの統合・消去、名前・表示・不透明度・ロック・合成モード(`normal` / `multiply` / `screen` / `overlay` / `darken` / `lighten`)の設定
- アンドゥ/リドゥ(履歴の保持数は `historyLimit` で指定)
- キャンバスのサイズ変更、背景色の設定(透明も可)
- 保存形式 Paint79 PNG(形式バージョン 1): レイヤー情報を独自チャンク `paNT` として埋め込んだ PNG を `exportPNG()` で書き出し、`open()` でレイヤーを保持したまま編集を再開できます
- PSD の書き出し(`exportPSD()`)と読み込み(`open()`)
- 完成イメージの書き出し(`toBlob()` / `toDataURL()`)、画像をレイヤーとして読み込む `loadImage()`、Paint79 PNG かどうかを判定する `Paint79.hasData()`
- イベント: `strokestart`、`strokeend`、`change`、`historychange`、`toolchange`、`layerchange`
- 配布形式: ES Modules(`dist/paint79.mjs`)、UMD(`dist/paint79.js`、グローバル変数 `Paint79`)、TypeScript の型定義(ESM 用・CommonJS 用)

### 既知の制限

- PSD の統合画像が ZIP で圧縮されている場合、統合画像を読み込めません。統合画像を使うのは、レイヤーを持たない PSD と、レイヤーを読み込めない PSD を開く場合だけです。レイヤーの画像データは、ZIP で圧縮されていても読み込みます(詳細は [PSD の書き出しと読み込み](docs/specs/psd.md) を参照)
