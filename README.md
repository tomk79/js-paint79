# js-paint79

ブラウザ上に canvas を展開し、マウス・指(タッチ)・ペンデバイスで絵を描くための UI を提供する JavaScript ライブラリです。

> **Note:** 本ドキュメントは実装に先立って定義した API 仕様です。実装状況により変更される可能性があります。

## 特徴

- Pointer Events ベースで、マウス・タッチ・ペンを統一的に扱います
- ペンの筆圧(`pressure`)に応じて線の太さを変化させられます
- レイヤーに対応します(追加・削除・並べ替え・表示切替・不透明度・合成モード)
- 完成イメージ(全レイヤーを統合した PNG 等)と、レイヤーを保持した元データを別々に書き出せます
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
  const paint = new Paint79(document.getElementById('paint-area'), {
    width: 800,
    height: 600,
  });

  // 色と太さを変更する
  paint.setColor('#ff0000');
  paint.setLineWidth(8);

  // 新しいレイヤーを追加して、そこに描く
  const layerId = paint.addLayer({ name: '線画' });
  paint.setActiveLayer(layerId);

  // 消しゴムに切り替える
  paint.setTool('eraser');

  // 元に戻す/やり直す
  paint.undo();
  paint.redo();

  // 完成イメージ(全レイヤーを統合したもの)を PNG で書き出す
  const pngDataUrl = paint.toDataURL('image/png');

  // レイヤーを保持した元データを書き出す
  const data = await paint.exportData();
  const json = JSON.stringify(data);

  // 元データを読み込んで、編集を再開する
  await paint.importData(JSON.parse(json));
</script>
```

コンストラクタに渡した要素の中に `<canvas>` が生成されます。

## 基本概念

### ドキュメントとレイヤー

1 つの `Paint79` インスタンスは、1 枚の絵(ドキュメント)を扱います。ドキュメントは次の要素で構成されます。

- **キャンバスサイズ**(`width`, `height`)
- **背景色**(`background`) — すべてのレイヤーの下に敷かれる単色。レイヤーではありません
- **レイヤーの配列** — 配列の先頭(インデックス `0`)が最背面、末尾が最前面です
- **アクティブレイヤー** — ペンや消しゴムの描画対象となるレイヤー

初期状態では、空のレイヤーが 1 枚だけ作成され、それがアクティブレイヤーになります。

消しゴムは、アクティブレイヤーの描画内容を透明に戻します(背景色で塗るのではありません)。

### 完成イメージと元データ

| 種類 | 取得方法 | 内容 | 用途 |
| --- | --- | --- | --- |
| 完成イメージ | `toDataURL()` / `toBlob()` | 背景色と、表示中(`visible: true`)の全レイヤーを統合した 1 枚の画像 | 公開・共有・印刷など |
| 元データ | `exportData()` / `importData()` | レイヤー構成と、各レイヤーの画像を保持したデータ | 保存して後で編集を再開する |

## コンストラクタ

```js
new Paint79(container, options);
```

| 引数 | 型 | 説明 |
| --- | --- | --- |
| `container` | `HTMLElement` | canvas を展開する親要素 |
| `options` | `Object` | オプション(省略可) |

### オプション

| オプション | 型 | 既定値 | 説明 |
| --- | --- | --- | --- |
| `width` | `number` | 親要素の幅 | canvas の幅(CSS ピクセル) |
| `height` | `number` | 親要素の高さ | canvas の高さ(CSS ピクセル) |
| `background` | `string \| null` | `'#ffffff'` | 背景色。`null` の場合は透明 |
| `tool` | `'pen' \| 'eraser'` | `'pen'` | 初期ツール |
| `color` | `string` | `'#000000'` | 初期の描画色(CSS カラー文字列) |
| `lineWidth` | `number` | `4` | 初期の線の太さ(CSS ピクセル) |
| `pressure` | `boolean` | `true` | ペンの筆圧を線の太さに反映するか |
| `pointerTypes` | `string[]` | `['mouse', 'touch', 'pen']` | 描画を受け付ける入力の種類 |
| `palmRejection` | `boolean` | `false` | `true` の場合、ペン入力を検出した後はタッチ入力を無視する |
| `historyLimit` | `number` | `50` | アンドゥ履歴の最大保持数 |
| `pixelRatio` | `number` | `window.devicePixelRatio` | canvas の内部解像度の倍率 |
| `readOnly` | `boolean` | `false` | `true` の場合、描画操作を受け付けない |

## メソッド

### ツール・描画設定

| メソッド | 戻り値 | 説明 |
| --- | --- | --- |
| `setTool(tool)` | `void` | ツールを切り替える(`'pen'` / `'eraser'`) |
| `getTool()` | `string` | 現在のツールを返す |
| `setColor(color)` | `void` | 描画色を設定する |
| `getColor()` | `string` | 現在の描画色を返す |
| `setLineWidth(width)` | `void` | 線の太さを設定する |
| `getLineWidth()` | `number` | 現在の線の太さを返す |
| `setReadOnly(flag)` | `void` | 読み取り専用モードを切り替える |

### レイヤー

レイヤーは、ライブラリが発行する文字列の ID(`layerId`)で指定します。

| メソッド | 戻り値 | 説明 |
| --- | --- | --- |
| `getLayers()` | `LayerInfo[]` | 全レイヤーの情報を、背面から前面の順で返す |
| `getLayer(layerId)` | `LayerInfo \| null` | 指定したレイヤーの情報を返す |
| `addLayer(options?)` | `string` | 新しい空のレイヤーを追加し、その ID を返す。`options` には `LayerInfo` の `name`, `visible`, `opacity`, `locked`, `blendMode` と、挿入位置 `index` を指定できる(省略時はアクティブレイヤーの 1 つ上) |
| `removeLayer(layerId)` | `boolean` | レイヤーを削除する。最後の 1 枚は削除できず `false` を返す |
| `duplicateLayer(layerId)` | `string` | レイヤーを複製し、新しいレイヤーの ID を返す |
| `moveLayer(layerId, index)` | `void` | レイヤーを指定したインデックスへ移動する |
| `mergeDown(layerId)` | `boolean` | レイヤーを 1 つ下のレイヤーに統合する。最背面のレイヤーでは `false` を返す |
| `setLayerProperties(layerId, props)` | `void` | レイヤーの属性(`name`, `visible`, `opacity`, `locked`, `blendMode`)を変更する |
| `getActiveLayerId()` | `string` | アクティブレイヤーの ID を返す |
| `setActiveLayer(layerId)` | `void` | アクティブレイヤーを切り替える |
| `clearLayer(layerId?)` | `void` | 指定したレイヤーの内容を消去する。省略時はアクティブレイヤー |

#### `LayerInfo`

| プロパティ | 型 | 既定値 | 説明 |
| --- | --- | --- | --- |
| `id` | `string` | (自動発行) | レイヤー ID |
| `name` | `string` | `'レイヤー 1'` 等 | レイヤー名 |
| `visible` | `boolean` | `true` | 表示するか。非表示のレイヤーは完成イメージにも含まれない |
| `opacity` | `number` | `1` | 不透明度(`0`〜`1`) |
| `locked` | `boolean` | `false` | `true` の場合、そのレイヤーへの描画を受け付けない |
| `blendMode` | `string` | `'normal'` | 合成モード。`'normal'`, `'multiply'`, `'screen'`, `'overlay'`, `'darken'`, `'lighten'` |

レイヤーの追加・削除・並べ替え・統合・属性変更・消去は、いずれも履歴に記録され、アンドゥ可能です。アクティブレイヤーの切り替えは履歴に記録されません。

### 履歴

| メソッド | 戻り値 | 説明 |
| --- | --- | --- |
| `undo()` | `boolean` | 直前の操作を取り消す。取り消せた場合 `true` |
| `redo()` | `boolean` | 取り消した操作をやり直す。やり直せた場合 `true` |
| `canUndo()` | `boolean` | アンドゥ可能かどうか |
| `canRedo()` | `boolean` | リドゥ可能かどうか |
| `clearHistory()` | `void` | 履歴を破棄する |

### キャンバス操作

| メソッド | 戻り値 | 説明 |
| --- | --- | --- |
| `clear()` | `void` | 全レイヤーの内容を消去する。レイヤー構成は維持される(アンドゥ可能) |
| `resize(width, height)` | `void` | キャンバスのサイズを変更する。全レイヤーの描画内容は左上基準で保持される(アンドゥ可能) |
| `setBackground(color)` | `void` | 背景色を変更する。`null` で透明(アンドゥ可能) |
| `getBackground()` | `string \| null` | 現在の背景色を返す |
| `getCanvas()` | `HTMLCanvasElement` | 画面表示用の canvas 要素を返す |

### 完成イメージの書き出し

背景色と、表示中の全レイヤーを統合した 1 枚の画像を書き出します。

| メソッド | 戻り値 | 説明 |
| --- | --- | --- |
| `toDataURL(type?, quality?)` | `string` | Data URL として書き出す。引数は `HTMLCanvasElement.toDataURL()` と同じ |
| `toBlob(type?, quality?)` | `Promise<Blob>` | Blob として書き出す |
| `loadImage(source, options?)` | `Promise<string>` | 画像を新しいレイヤーとして読み込み、そのレイヤーの ID を返す(アンドゥ可能)。`source` には URL 文字列、`Blob`、`HTMLImageElement`、`ImageBitmap` を指定できる。`options.layerId` を指定した場合は、新しいレイヤーを作らずに既存のレイヤーへ描画する |

### 元データの書き出し・読み込み

レイヤー構成を保持したデータを扱います。

| メソッド | 戻り値 | 説明 |
| --- | --- | --- |
| `exportData()` | `Promise<Paint79Data>` | 元データを書き出す。戻り値は `JSON.stringify()` でそのまま文字列化できる |
| `importData(data)` | `Promise<void>` | 元データを読み込み、キャンバスの状態を置き換える。読み込み後、履歴は破棄される |

#### `Paint79Data` の形式

```json
{
  "format": "paint79",
  "version": 1,
  "width": 800,
  "height": 600,
  "pixelRatio": 2,
  "background": "#ffffff",
  "activeLayerId": "layer-2",
  "layers": [
    {
      "id": "layer-1",
      "name": "下塗り",
      "visible": true,
      "opacity": 1,
      "locked": false,
      "blendMode": "normal",
      "image": "data:image/png;base64,..."
    },
    {
      "id": "layer-2",
      "name": "線画",
      "visible": true,
      "opacity": 0.8,
      "locked": false,
      "blendMode": "multiply",
      "image": "data:image/png;base64,..."
    }
  ]
}
```

| プロパティ | 説明 |
| --- | --- |
| `format` | 常に `"paint79"` |
| `version` | データ形式のバージョン。将来の形式変更時に、古いデータを読み込むために使用する |
| `width`, `height` | キャンバスのサイズ(CSS ピクセル) |
| `pixelRatio` | 書き出し時の内部解像度の倍率。各レイヤー画像のピクセルサイズは `width × pixelRatio`, `height × pixelRatio` |
| `background` | 背景色。`null` の場合は透明 |
| `activeLayerId` | 書き出し時のアクティブレイヤー |
| `layers` | レイヤーの配列(背面から前面の順)。各要素は `LayerInfo` に、透過 PNG の Data URL である `image` を加えたもの |

読み込み先の `pixelRatio` が書き出し時と異なる場合、各レイヤー画像は拡大・縮小して読み込まれます。

### イベント

| メソッド | 戻り値 | 説明 |
| --- | --- | --- |
| `on(eventName, listener)` | `void` | イベントリスナーを登録する |
| `off(eventName, listener)` | `void` | イベントリスナーを解除する |

### 破棄

| メソッド | 戻り値 | 説明 |
| --- | --- | --- |
| `destroy()` | `void` | イベントリスナーを解除し、生成した canvas を DOM から取り除く |

## イベント

```js
paint.on('historychange', (event) => {
  undoButton.disabled = !event.canUndo;
  redoButton.disabled = !event.canRedo;
});

paint.on('layerchange', (event) => {
  renderLayerPanel(event.layers, event.activeLayerId);
});
```

| イベント名 | イベントオブジェクト | 発生タイミング |
| --- | --- | --- |
| `strokestart` | `{ pointerType, layerId, x, y, pressure }` | ストロークを描き始めたとき |
| `strokeend` | `{ pointerType, layerId }` | ストロークを描き終えたとき |
| `change` | `{}` | 完成イメージの内容が変化しうる操作が行われたとき(描画、消去、レイヤー操作、アンドゥ/リドゥ、読み込み等) |
| `historychange` | `{ canUndo, canRedo }` | アンドゥ/リドゥの可否が変化したとき |
| `toolchange` | `{ tool, color, lineWidth }` | ツール・色・線の太さが変更されたとき |
| `layerchange` | `{ layers, activeLayerId }` | レイヤーの構成・属性・アクティブレイヤーが変化したとき。`layers` は `getLayers()` と同じ形式 |

座標 `x`, `y` はキャンバス左上を原点とした CSS ピクセル単位の値です。

## 使用例: ツールバー・レイヤーパネルと組み合わせる

本ライブラリはツールバーやレイヤーパネル等のボタン類を含みません。アプリケーション側で自由に UI を作成し、API を呼び出してください。

```html
<div>
  <button id="btn-pen">ペン</button>
  <button id="btn-eraser">消しゴム</button>
  <input id="color" type="color" value="#000000">
  <input id="width" type="range" min="1" max="50" value="4">
  <button id="btn-undo" disabled>元に戻す</button>
  <button id="btn-redo" disabled>やり直す</button>
  <button id="btn-export-png">PNG を書き出す</button>
  <button id="btn-save">保存</button>
  <input id="file-open" type="file" accept=".paint79.json,application/json">
</div>
<div>
  <button id="btn-add-layer">レイヤーを追加</button>
  <ul id="layer-list"></ul>
</div>
<div id="paint-area" style="width: 100%; height: 480px;"></div>

<script type="module">
  import Paint79 from '@tomk79/paint79';

  const paint = new Paint79(document.getElementById('paint-area'), {
    palmRejection: true,
  });

  const download = (blob, filename) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // ツール
  document.getElementById('btn-pen').addEventListener('click', () => paint.setTool('pen'));
  document.getElementById('btn-eraser').addEventListener('click', () => paint.setTool('eraser'));
  document.getElementById('color').addEventListener('input', (e) => paint.setColor(e.target.value));
  document.getElementById('width').addEventListener('input', (e) => paint.setLineWidth(Number(e.target.value)));

  // 履歴
  document.getElementById('btn-undo').addEventListener('click', () => paint.undo());
  document.getElementById('btn-redo').addEventListener('click', () => paint.redo());
  paint.on('historychange', ({ canUndo, canRedo }) => {
    document.getElementById('btn-undo').disabled = !canUndo;
    document.getElementById('btn-redo').disabled = !canRedo;
  });

  // 完成イメージを PNG で書き出す
  document.getElementById('btn-export-png').addEventListener('click', async () => {
    download(await paint.toBlob('image/png'), 'paint.png');
  });

  // 元データを保存する
  document.getElementById('btn-save').addEventListener('click', async () => {
    const data = await paint.exportData();
    download(new Blob([JSON.stringify(data)], { type: 'application/json' }), 'paint.paint79.json');
  });

  // 元データを開く
  document.getElementById('file-open').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    await paint.importData(JSON.parse(await file.text()));
  });

  // レイヤーパネル
  document.getElementById('btn-add-layer').addEventListener('click', () => {
    paint.setActiveLayer(paint.addLayer());
  });

  const renderLayerPanel = (layers, activeLayerId) => {
    const list = document.getElementById('layer-list');
    list.innerHTML = '';
    // 前面のレイヤーを上に表示する
    [...layers].reverse().forEach((layer) => {
      const li = document.createElement('li');
      li.textContent = layer.name;
      li.style.fontWeight = layer.id === activeLayerId ? 'bold' : 'normal';
      li.addEventListener('click', () => paint.setActiveLayer(layer.id));

      const toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.checked = layer.visible;
      toggle.addEventListener('click', (e) => e.stopPropagation());
      toggle.addEventListener('change', () => {
        paint.setLayerProperties(layer.id, { visible: toggle.checked });
      });
      li.prepend(toggle);

      list.appendChild(li);
    });
  };
  paint.on('layerchange', ({ layers, activeLayerId }) => renderLayerPanel(layers, activeLayerId));
  renderLayerPanel(paint.getLayers(), paint.getActiveLayerId());
</script>
```

## 対応ブラウザ

Pointer Events に対応したモダンブラウザ(Chrome, Edge, Firefox, Safari の最新版)を対象とします。

## ライセンス

MIT License
