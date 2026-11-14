# js-paint79

ブラウザ上に canvas を展開し、マウス・指(タッチ)・ペンデバイスで絵を描くための UI を提供する JavaScript ライブラリです。

> **Note:** 本ライブラリは開発中です。API は実装状況により変更される可能性があります。

## 特徴

- Pointer Events ベースで、マウス・タッチ・ペンを統一的に扱います
- ペンの筆圧(`pressure`)に応じて線の太さを変化させられます
- レイヤーに対応します(追加・削除・並べ替え・表示切替・不透明度・合成モード)
- **レイヤー情報を埋め込んだ PNG** を保存形式とします。通常の画像ビューアでは全レイヤーを統合した完成イメージとして表示され、Paint79 で開くとレイヤーを保持したまま編集を再開できます
- 高解像度ディスプレイ(`devicePixelRatio`)に対応します
- アンドゥ/リドゥ、消しゴムに対応します
- 依存ライブラリはありません

## インストール

### npm

```bash
npm install @tomk79/paint79
```

```js
import Paint79 from '@tomk79/paint79';
```

### `<script>` タグ

```html
<script src="dist/paint79.js"></script>
<script>
  // グローバル変数 `Paint79` として利用できます
</script>
```

## 基本的な使い方

```html
<div id="paint-area"></div>

<script type="module">
  const paint79 = new Paint79(document.getElementById('paint-area'), {
    width: 800,
    height: 600,
  });

  // 色と太さを変更する
  paint79.setColor('#ff0000');
  paint79.setLineWidth(8);

  // 新しいレイヤーを追加して、そこに描く
  const layerId = paint79.addLayer({ name: '線画' });
  paint79.setActiveLayer(layerId);

  // 消しゴムに切り替える
  paint79.setTool('eraser');

  // 元に戻す/やり直す
  paint79.undo();
  paint79.redo();

  // 保存: レイヤー情報を埋め込んだ PNG を書き出す
  const blob = await paint79.exportPNG();

  // 編集再開: 保存した PNG を開く
  await paint79.open(blob);
</script>
```

コンストラクタに渡した要素の中に `<canvas>` が生成されます。

ツールバーやレイヤーパネルは含まれません。アプリケーション側で自由に UI を作成し、API を呼び出してください。UI と組み合わせた例は [使用例](docs/examples.md) を参照してください。

## 主な API

すべての API は [API 仕様](docs/specs/api.md) を参照してください。

### 主なオプション

| オプション | 既定値 | 説明 |
| --- | --- | --- |
| `width`, `height` | 親要素のサイズ | canvas のサイズ(CSS ピクセル) |
| `background` | `'#ffffff'` | 背景色。`null` の場合は透明 |
| `color` | `'#000000'` | 初期の描画色 |
| `lineWidth` | `4` | 初期の線の太さ |
| `pressure` | `true` | ペンの筆圧を線の太さに反映するか |
| `palmRejection` | `false` | ペン入力を検出した後はタッチ入力を無視するか |

### 主なメソッド

| 分類 | メソッド |
| --- | --- |
| ツール・描画設定 | `setTool()`, `setColor()`, `setLineWidth()` |
| レイヤー | `getLayers()`, `addLayer()`, `removeLayer()`, `moveLayer()`, `mergeDown()`, `setLayerProperties()`, `setActiveLayer()` |
| 履歴 | `undo()`, `redo()`, `canUndo()`, `canRedo()` |
| 保存・読み込み | `exportPNG()`, `open()`, `toBlob()`, `toDataURL()`, `loadImage()` |
| イベント | `on()`, `off()` |
| 破棄 | `destroy()` |

### 主なイベント

| イベント名 | 発生タイミング |
| --- | --- |
| `change` | 完成イメージの内容が変化しうる操作が行われたとき |
| `historychange` | アンドゥ/リドゥの可否が変化したとき |
| `layerchange` | レイヤーの構成・属性・アクティブレイヤーが変化したとき |

## 保存形式: Paint79 PNG

Paint79 は、通常の PNG ファイルに、レイヤー情報を格納した独自チャンク(`paNT`)を追加したものを保存形式とします。

- 一般的な画像ビューア、ブラウザ、画像を埋め込めるアプリケーションでは、全レイヤーを統合した完成イメージとして表示されます
- `open()` で開くと、レイヤーを保持したまま編集を再開できます。通常の画像を開いた場合は、1 枚のレイヤーとして読み込まれます
- 拡張子は `.png`、MIME タイプは `image/png` です

詳細は [Paint79 PNG のデータ形式](docs/specs/file-format.md) を参照してください。

### 画像を扱うアプリケーションの開発者へ

Paint79 PNG を保存・表示するアプリケーションでは、**ファイルのバイト列を変更せずに保存**してください。縮小、圧縮し直し、形式変換、メタデータの削除を行うと、レイヤー情報が失われます。

画像の縮小等を自動で行う場合は、次の条件を満たす PNG を処理の対象外としてください。この条件は Paint79 固有のものではなく、PNG 仕様のチャンク命名規則に基づく一般的な判定です。

> **チャンク名の 2 文字目が小文字(非公開)、かつ 4 文字目が大文字(コピー不可)であるチャンクを、1 つ以上含む PNG**

判定方法の詳細、実装例(JavaScript / PHP)、ファイルサイズ上限の扱い、アプリケーションへの組み込み方は [画像を扱うアプリケーションとの連携](docs/specs/integration.md) を参照してください。

## ドキュメント

| 文書 | 内容 |
| --- | --- |
| [docs/specs/](docs/specs/README.md) | 仕様の正本 |
| [docs/examples.md](docs/examples.md) | 使用例 |
| [AGENTS.md](AGENTS.md) | 開発ルール |

## 開発

```bash
npm install
npx playwright install   # E2E テスト用のブラウザエンジン(初回のみ)
npm run dev              # デモページ(demo/)を開く
npm run check            # lint・型チェック・ユニットテスト・ビルド・E2E テストをすべて実行
```

開発ルール(TDD、E2E テストの方針、データ形式の互換性の扱い等)は [AGENTS.md](AGENTS.md) を参照してください。

## 対応ブラウザ

Pointer Events に対応したモダンブラウザ(Chrome, Edge, Firefox, Safari の最新版)を対象とします。

## ライセンス

MIT License
