# API 仕様

`Paint79` クラスの公開 API を定義します。ここに記載のない公開 API(メソッド、オプション、イベント、プロパティ)は存在しないものとします。

用語(ドキュメント、レイヤー、アクティブレイヤー、背景色、完成イメージ)は [ドキュメントモデル](document-model.md) を参照してください。

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

### 保存・読み込み

| メソッド | 戻り値 | 説明 |
| --- | --- | --- |
| `exportPNG(options?)` | `Promise<Blob>` | Paint79 PNG を書き出す。`options.embedData` に `false` を指定すると、レイヤー情報を含まない完成イメージのみの PNG を書き出す |
| `open(source, options?)` | `Promise<OpenResult>` | 画像を開き、キャンバスの状態を置き換える。読み込み後、履歴は破棄される(詳細は後述) |
| `toDataURL(type?, quality?)` | `string` | 完成イメージを Data URL として書き出す。引数は `HTMLCanvasElement.toDataURL()` と同じ |
| `toBlob(type?, quality?)` | `Promise<Blob>` | 完成イメージを Blob として書き出す |
| `loadImage(source, options?)` | `Promise<string>` | 画像を新しいレイヤーとして読み込み、そのレイヤーの ID を返す(アンドゥ可能)。`options.layerId` を指定した場合は、新しいレイヤーを作らずに既存のレイヤーへ描画する |

`source` には `Blob`(`File` を含む)、`ArrayBuffer`、`Uint8Array`、URL 文字列を指定できます。`loadImage()` はこれらに加えて `HTMLImageElement`、`ImageBitmap` も受け付けます。

#### `open(source, options?)`

`source` が [Paint79 PNG](file-format.md) であればレイヤーを復元し、そうでなければ画像全体を 1 枚のレイヤーとして読み込みます。どちらの場合も同じメソッドで扱えるため、呼び出し側は画像の種類を区別する必要がありません。

キャンバスサイズは画像のピクセルサイズに合わせて変更されます。Paint79 PNG の場合は保存時の `width`, `height` が復元されます。それ以外の画像の場合は、画像のピクセルサイズを `pixelRatio` で割った値になります。

| オプション | 型 | 既定値 | 説明 |
| --- | --- | --- | --- |
| `ignoreMismatch` | `boolean` | `false` | `true` の場合、完成イメージとレイヤー情報の不一致(後述の `'image-modified'`)を無視してレイヤーを復元する |

戻り値 `OpenResult`:

| プロパティ | 型 | 説明 |
| --- | --- | --- |
| `restored` | `boolean` | レイヤーを復元できた場合 `true` |
| `reason` | `string \| undefined` | `restored` が `false` の場合の理由(下表) |

| `reason` | 意味 | 読み込み結果 |
| --- | --- | --- |
| `'no-data'` | Paint79 のレイヤー情報を含まない画像 | 画像全体を 1 枚のレイヤーとして読み込む |
| `'image-modified'` | レイヤー情報はあるが、保存後に完成イメージが他のソフトで変更されている | 現在の完成イメージを 1 枚のレイヤーとして読み込む |
| `'unsupported-version'` | このバージョンの Paint79 が対応していない、新しい形式のレイヤー情報 | 完成イメージを 1 枚のレイヤーとして読み込む |
| `'corrupted'` | レイヤー情報が壊れている | 完成イメージを 1 枚のレイヤーとして読み込む |

`restored` が `false` の場合、レイヤーは失われていますが、見た目(完成イメージ)は維持されます。アプリケーションは必要に応じて、利用者にその旨を通知してください。

### 静的メソッド

| メソッド | 戻り値 | 説明 |
| --- | --- | --- |
| `Paint79.hasData(source)` | `Promise<boolean>` | `source` が Paint79 のレイヤー情報を含む PNG かどうかを返す。画像のデコードは行わず、チャンク構造だけを走査する |

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
paint79.on('historychange', (event) => {
  undoButton.disabled = !event.canUndo;
  redoButton.disabled = !event.canRedo;
});

paint79.on('layerchange', (event) => {
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

