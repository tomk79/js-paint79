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

レイヤーは、ライブラリが発行する文字列の ID(`layerId`)で指定します。レイヤー ID はインスタンス内で一意です。削除されたレイヤーの ID や、`open()` で読み込んだレイヤーの ID が、新しく作成するレイヤーに再び発行されることはありません。

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
| `exportPSD()` | `Promise<Blob>` | ドキュメントを PSD 形式で書き出す。MIME タイプは `image/vnd.adobe.photoshop`(詳細は [PSD の書き出し](psd.md)) |
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

- `on()` / `off()` に上表にないイベント名を指定した場合は `TypeError` を投げます
- `change` は、ストロークの描画中には発生せず、ストロークを描き終えたときに 1 回発生します
- `historychange` は、`canUndo` / `canRedo` のどちらかの値が変化したときにのみ発生します
- `toolchange` は、値が実際に変化したときにのみ発生します。同じ値を設定しても発生しません

## 詳細な振る舞い

### 引数の検証

- `container` が `HTMLElement` でない場合は `TypeError` を投げます
- オプションおよびメソッドの引数の型が誤っている場合は `TypeError`、値が範囲外の場合は `RangeError` を投げます
  - `width`, `height`, `lineWidth`, `pixelRatio`: 正の有限数
  - `historyLimit`: 1 以上の整数
  - `opacity`: `0` 以上 `1` 以下
  - `tool`, `blendMode`, `pointerTypes` の要素: 上記で定義した値のいずれか
  - `color`, `background`: CSS カラーとして解釈できる文字列(`background` は `null` も可)。文字列でない場合は `TypeError`、空文字列やブラウザが CSS カラーとして解釈できない文字列の場合は `RangeError`
- 存在しないレイヤー ID を指定した場合は `RangeError` を投げます(`getLayer()` のみ `null` を返します)
- `destroy()` の後にメソッドを呼び出した場合は `Error` を投げます

### キャンバスサイズの既定値

`width` / `height` を省略した場合は、親要素の `clientWidth` / `clientHeight` を使用します。その値が `0` の場合は、それぞれ `300` / `150`(HTML の canvas 要素の既定のサイズ)を使用します。

### レイヤー操作

- **`addLayer()`**: 名前を省略した場合は `'レイヤー N'` とします。`N` は、そのインスタンスで作成したレイヤーの通し番号で、削除されても再利用しません。`index` は `0` 以上レイヤー数以下の整数とします。アクティブレイヤーは変更しません
- **`removeLayer()`**: アクティブレイヤーを削除した場合は、その 1 つ下のレイヤー(最背面だった場合は新しい最背面のレイヤー)がアクティブレイヤーになります
- **`duplicateLayer()`**: 複製したレイヤーは元のレイヤーの 1 つ上に挿入されます。名前は `'<元の名前> のコピー'` とし、そのほかの属性は元のレイヤーと同じです。アクティブレイヤーは変更しません
- **`moveLayer()`**: `index` は `0` 以上レイヤー数未満の整数とします
- **`mergeDown()`**: 上のレイヤーの内容を、その `opacity` と `blendMode` を適用して下のレイヤーに描画し、上のレイヤーを削除します。上のレイヤーの `visible` は考慮しません。下のレイヤーの属性は変更しません。上のレイヤーがアクティブレイヤーだった場合は、下のレイヤーがアクティブレイヤーになります
- **`setLayerProperties()`**: 指定しなかった属性は変更しません。値が変化しない場合は履歴に記録しません
- `locked` は、ポインター操作による描画のみを禁止します。API によるレイヤー操作(`clearLayer()`、`loadImage()` 等)は、ロックされたレイヤーにも適用されます

### ポインター操作による描画

- 同時に描画できるストロークは 1 本です。描画中に別のポインターが押された場合、そのポインターは無視します
- 描画中のポインターと同じ ID の `pointerdown` を受けた場合、または描画中のマウスのボタンがすべて離されている `pointermove` を受けた場合は、`pointerup` を取りこぼしたものとみなし、描画中のストロークを描き終えたものとして確定します(前者の場合は、続けて新しいストロークを開始します)。`lostpointercapture` を受けた場合も同様に確定します
- マウスは主ボタン(通常は左ボタン)でのみ描画します
- 次のいずれかに該当する場合、ストロークを開始しません
  - `readOnly` が `true`
  - ポインターの種類が `pointerTypes` に含まれない
  - アクティブレイヤーがロックされている、または非表示である
  - `palmRejection` によって無視されるタッチ入力である
- **筆圧**: `pressure` が `true` で、ポインターの種類が `'pen'` の場合、線の太さは `lineWidth × max(筆圧, 0.1)` になります。それ以外の場合は `lineWidth` です
- **パームリジェクション**: `palmRejection` が `true` の場合、そのインスタンスでペン入力を一度でも検出した後は、タッチ入力を無視します。タッチによるストロークの描画中にペン入力を検出した場合は、そのタッチのストロークを取り消し、ペンのストロークを開始します
- ポインターを動かさずに離した場合は、点を 1 つ描画します
- `pointercancel` によって中断されたストロークは取り消され、履歴にも記録されません。この場合 `strokeend` と `change` は発生しません
- ストロークの描画中に、そのストロークに影響する次の API が呼び出された場合も、描画中のストロークは同様に取り消されます。操作はストロークを取り消した状態に対して適用されます
  - `undo()`、`redo()`、`open()`、`resize()`、`clear()`
  - 描画中のレイヤーを対象とする `clearLayer()`、`removeLayer()`、`duplicateLayer()`、`loadImage({ layerId })`
  - 描画中のレイヤーを上または下のレイヤーとする `mergeDown()`
- 上記以外の操作(`addLayer()`、`moveLayer()`、`setLayerProperties()`、`setActiveLayer()`、`setBackground()`、新しいレイヤーへの `loadImage()`、描画中のレイヤー以外を対象とする操作)は、描画中のストロークに影響しません。ストロークはそのまま続き、描き終えたときに履歴に記録されます
- ストロークの開始時のツール・描画色・線の太さは、そのストロークを描き終えるまで変わりません(描画中に `setColor()` 等を呼び出しても、次のストロークから反映されます)

### 保存・読み込み

- **書き出す内容**: `exportPNG()`、`exportPSD()`、`toBlob()` が書き出す内容(画像、レイヤーの属性、背景色、アクティブレイヤー等)は、呼び出した時点の状態です。Promise が解決するまでの間にドキュメントを変更しても、出力には影響しません
- **書き出しと描画中のストローク**: `exportPNG()`、`exportPSD()`、`toBlob()`、`toDataURL()` の出力には、描画中の(まだ描き終えていない)ストロークを含めません。出力は、そのストロークを描き始める前の状態になります。描き終えていないストロークは、`pointercancel` 等で取り消される可能性があり、履歴にない内容が保存されることを防ぐためです。画面の表示には、描画中のストロークも含まれます
- **`open()`**:
  - Paint79 PNG からレイヤーを復元した場合は、キャンバスサイズ、背景色、レイヤー、アクティブレイヤーを復元します。インスタンスの `pixelRatio` は変更しません
  - レイヤーを復元しなかった場合は、画像を `'レイヤー 1'` という名前の 1 枚のレイヤーとして読み込みます。背景色は変更しません
  - レイヤーの通し番号は、読み込んだレイヤー数から数え直します
  - Paint79 PNG からレイヤーを復元する場合、読み込み先のインスタンスで確保するレイヤー画像のピクセル数の合計(レイヤー数 × `max(1, round(width × pixelRatio))` × `max(1, round(height × pixelRatio))`。`pixelRatio` は読み込み先のインスタンスの値)が 268,435,456(16384 × 16384)を超える場合は、画像をデコードする前に `Error` で reject し、キャンバスの状態は変更しません。保存時の `pixelRatio` を極端に小さくした小さなファイルによって、過大なメモリを確保させられることを防ぐためです
  - `source` が対応していない型の場合は `TypeError` で、画像をデコードできない場合や、ブラウザがその大きさの canvas を作成できない場合は `Error` で reject します。その場合、キャンバスの状態は変更しません
  - 通常の画像(レイヤーを復元しない場合)は、画像に埋め込まれた色空間の情報(ICC プロファイル等)をブラウザの既定の方法で解釈して読み込みます
- **`loadImage()`**: 画像の 1 ピクセルがキャンバスの内部解像度の 1 ピクセルになるように、左上を基準として描画します。新しいレイヤーは、アクティブレイヤーの 1 つ上に挿入し、アクティブレイヤーは変更しません
  - CORS の許可なしに読み込まれた別オリジンの画像など、描画するとキャンバスのピクセルを読み出せなくなる(canvas が汚染される)画像は描画せず、`Error` で reject します。その場合、キャンバスの状態は変更しません。canvas の汚染は元に戻せず、以後 `exportPNG()` 等で保存できなくなるためです
  - 画像をデコードできない場合は `Error` で reject し、キャンバスの状態は変更しません
- **`Paint79.hasData()`**: マジックナンバーが一致する `paNT` チャンクがあれば `true` を返します。ヘッダーの内容やチェックサムは検証しません

