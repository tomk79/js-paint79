# js-paint79

ブラウザ上に canvas を展開し、マウス・指(タッチ)・ペンデバイスで絵を描くための UI を提供する JavaScript ライブラリです。

> **Note:** 本ドキュメントは実装に先立って定義した API 仕様です。実装状況により変更される可能性があります。

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

## 基本概念

### ドキュメントとレイヤー

1 つの `Paint79` インスタンスは、1 枚の絵(ドキュメント)を扱います。ドキュメントは次の要素で構成されます。

- **キャンバスサイズ**(`width`, `height`)
- **背景色**(`background`) — すべてのレイヤーの下に敷かれる単色。レイヤーではありません
- **レイヤーの配列** — 配列の先頭(インデックス `0`)が最背面、末尾が最前面です
- **アクティブレイヤー** — ペンや消しゴムの描画対象となるレイヤー

初期状態では、空のレイヤーが 1 枚だけ作成され、それがアクティブレイヤーになります。

消しゴムは、アクティブレイヤーの描画内容を透明に戻します(背景色で塗るのではありません)。

### 保存形式: Paint79 PNG

Paint79 は、**通常の PNG ファイルに、レイヤー情報を格納した独自チャンクを追加したもの**を保存形式とします。本ドキュメントではこれを「Paint79 PNG」と呼びます。

- PNG の画像本体は、背景色と表示中の全レイヤーを統合した完成イメージです。一般的な画像ビューア、ブラウザ、画像を埋め込めるアプリケーションでは、通常の PNG として表示されます
- 独自チャンクには、レイヤー構成と各レイヤーの画像が格納されています。Paint79 で開くと、レイヤーを保持したまま編集を再開できます
- 拡張子は `.png`、MIME タイプは `image/png` です

データ構造の詳細は [Paint79 PNG のデータ形式](#paint79-png-のデータ形式) を参照してください。

| 書き出し方法 | 内容 | 用途 |
| --- | --- | --- |
| `exportPNG()` | Paint79 PNG(完成イメージ + レイヤー情報) | 保存して後で編集を再開する |
| `exportPNG({ embedData: false })` | 完成イメージのみの PNG | レイヤー情報が不要な場合 |
| `toBlob()` / `toDataURL()` | 完成イメージのみ(PNG / JPEG / WebP 等) | 他の形式で書き出す場合 |

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

`source` が Paint79 PNG であればレイヤーを復元し、そうでなければ画像全体を 1 枚のレイヤーとして読み込みます。どちらの場合も同じメソッドで扱えるため、呼び出し側は画像の種類を区別する必要がありません。

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
  <button id="btn-save">保存</button>
  <input id="file-open" type="file" accept="image/png,image/jpeg,image/webp">
</div>
<div>
  <button id="btn-add-layer">レイヤーを追加</button>
  <ul id="layer-list"></ul>
</div>
<div id="paint-area" style="width: 100%; height: 480px;"></div>

<script type="module">
  import Paint79 from '@tomk79/paint79';

  const paint79 = new Paint79(document.getElementById('paint-area'), {
    palmRejection: true,
  });

  // ツール
  document.getElementById('btn-pen').addEventListener('click', () => paint79.setTool('pen'));
  document.getElementById('btn-eraser').addEventListener('click', () => paint79.setTool('eraser'));
  document.getElementById('color').addEventListener('input', (e) => paint79.setColor(e.target.value));
  document.getElementById('width').addEventListener('input', (e) => paint79.setLineWidth(Number(e.target.value)));

  // 履歴
  document.getElementById('btn-undo').addEventListener('click', () => paint79.undo());
  document.getElementById('btn-redo').addEventListener('click', () => paint79.redo());
  paint79.on('historychange', ({ canUndo, canRedo }) => {
    document.getElementById('btn-undo').disabled = !canUndo;
    document.getElementById('btn-redo').disabled = !canRedo;
  });

  // 保存: Paint79 PNG としてダウンロードする
  document.getElementById('btn-save').addEventListener('click', async () => {
    const blob = await paint79.exportPNG();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'paint.png';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  // 開く: Paint79 PNG ならレイヤーを復元、それ以外は 1 枚のレイヤーとして読み込む
  document.getElementById('file-open').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const result = await paint79.open(file);
    if (!result.restored && result.reason === 'image-modified') {
      alert('この画像は他のソフトで編集されたため、レイヤー情報を復元できませんでした。');
    }
  });

  // レイヤーパネル
  document.getElementById('btn-add-layer').addEventListener('click', () => {
    paint79.setActiveLayer(paint79.addLayer());
  });

  const renderLayerPanel = (layers, activeLayerId) => {
    const list = document.getElementById('layer-list');
    list.innerHTML = '';
    // 前面のレイヤーを上に表示する
    [...layers].reverse().forEach((layer) => {
      const li = document.createElement('li');
      li.textContent = layer.name;
      li.style.fontWeight = layer.id === activeLayerId ? 'bold' : 'normal';
      li.addEventListener('click', () => paint79.setActiveLayer(layer.id));

      const toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.checked = layer.visible;
      toggle.addEventListener('click', (e) => e.stopPropagation());
      toggle.addEventListener('change', () => {
        paint79.setLayerProperties(layer.id, { visible: toggle.checked });
      });
      li.prepend(toggle);

      list.appendChild(li);
    });
  };
  paint79.on('layerchange', ({ layers, activeLayerId }) => renderLayerPanel(layers, activeLayerId));
  renderLayerPanel(paint79.getLayers(), paint79.getActiveLayerId());
</script>
```

## 画像を扱うアプリケーションの開発者へ

この節は、Paint79 PNG を保存・表示する可能性のあるアプリケーション(メモアプリ、CMS、ファイル管理ツール等)の開発者向けの情報です。

### 要点

1. **表示**: 特別な対応は不要です。通常の PNG として表示してください。
2. **保存**: ファイルのバイト列を **変更せずに** 保存してください。縮小、圧縮し直し、形式変換、メタデータの削除を行うと、レイヤー情報が失われます。
3. **判定**: 「変更してはいけない PNG」かどうかは、Paint79 に依存しない一般的な規則で判定できます([後述](#変更してはいけない-png-の判定方法))。
4. **編集**: Paint79 をアプリケーションに組み込む場合は、保存されたバイト列を `open()` に渡し、`exportPNG()` の結果で上書き保存してください([後述](#paint79-をアプリケーションに組み込む))。

### 変更してはいけない PNG の判定方法

画像の縮小や圧縮し直しを自動で行うアプリケーションは、次の条件を満たす PNG に対して、**それらの処理を行わないでください**。

> **チャンク名の 2 文字目が小文字、かつ 4 文字目が大文字であるチャンクを、1 つ以上含む PNG**

この条件は Paint79 固有のものではなく、PNG の仕様が定めるチャンク命名規則に基づく一般的な判定です。Paint79 以外のアプリケーションが独自のデータを埋め込んだ PNG も、同じ条件で保護されます。

#### 背景: PNG のチャンク命名規則

PNG ファイルは、8 バイトのシグネチャの後に「チャンク」と呼ばれるデータの塊が並んだ構造です。各チャンクは 4 文字の英字の名前を持ち、各文字の大文字・小文字がチャンクの性質を表します([PNG 仕様: Chunk naming conventions](https://www.w3.org/TR/png-3/#5Chunk-naming-conventions))。

| 位置 | 大文字 | 小文字 |
| --- | --- | --- |
| 1 文字目 | 必須チャンク(critical) | 補助チャンク(ancillary)。知らなければ読み飛ばせる |
| 2 文字目 | 公開チャンク(public)。PNG 仕様に登録されたもの | **非公開チャンク(private)。アプリケーション独自の拡張** |
| 3 文字目 | 予約(常に大文字) | — |
| 4 文字目 | **コピー不可(unsafe-to-copy)。画像データに依存する** | コピー可(safe-to-copy) |

4 文字目が大文字のチャンクについて、PNG 仕様は次のように定めています。

> 画像データ(必須チャンク)に変更を加えたプログラムは、自身が認識しないコピー不可チャンクを出力にコピーしてはならない。

縮小や圧縮し直しは「画像データに変更を加える」処理にあたります。したがって、**認識できないコピー不可チャンクを含む PNG は、縮小すると仕様上そのチャンクを捨てるしかない、すなわち情報が失われる画像**です。

一方、一般的な画像に含まれる補助チャンク(`sRGB`, `gAMA`, `iCCP`, `pHYs`, `tEXt`, `iTXt`, `eXIf` 等)は、いずれも 2 文字目が大文字(公開チャンク)なので、この条件には該当しません。

Paint79 はレイヤー情報を `paNT` チャンクに格納します(補助・非公開・予約・コピー不可)。

#### 判定アルゴリズム

画像のデコードは不要です。チャンクの長さを読んでデータ部分を読み飛ばしながら走査するため、大きなファイルでも高速に判定できます。

1. 先頭 8 バイトが PNG シグネチャ(`89 50 4E 47 0D 0A 1A 0A`)であることを確認する。そうでなければ PNG ではない
2. オフセット 8 から、以下を繰り返す
   1. 4 バイト: データ長 `length`(符号なし 32 ビット整数、ビッグエンディアン)
   2. 4 バイト: チャンク名(ASCII 4 文字)
   3. チャンク名の 2 文字目が小文字(`a`〜`z`)、かつ 4 文字目が大文字(`A`〜`Z`)であれば **「変更してはいけない」と判定して終了**
   4. チャンク名が `IEND` であれば **「変更してよい」と判定して終了**
   5. `length + 4`(データ + CRC)バイトを読み飛ばし、次のチャンクへ
3. ファイル末尾に達した場合(`IEND` がない壊れた PNG)は「変更してよい」と判定する

Paint79 のチャンクは画像データ(`IDAT`)より後ろに配置されます。先頭付近だけを読んで判定を打ち切らず、`IEND` まで走査してください。

#### 実装例(JavaScript)

```js
/**
 * 画像データを変更すると情報が失われる PNG かどうかを判定する。
 * @param {Uint8Array} bytes - PNG ファイルのバイト列
 * @returns {boolean} 縮小・圧縮し直し・形式変換をしてはいけない場合 true
 */
function hasUnsafeToCopyPrivateChunk(bytes) {
  const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 8 || PNG_SIGNATURE.some((b, i) => bytes[i] !== b)) {
    return false; // PNG ではない
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const isLower = (c) => c >= 0x61 && c <= 0x7a;
  const isUpper = (c) => c >= 0x41 && c <= 0x5a;

  let pos = 8;
  while (pos + 8 <= bytes.length) {
    const length = view.getUint32(pos);
    const t = bytes.subarray(pos + 4, pos + 8);
    if (isLower(t[1]) && isUpper(t[3])) {
      return true; // 非公開・コピー不可チャンクを検出
    }
    if (t[0] === 0x49 && t[1] === 0x45 && t[2] === 0x4e && t[3] === 0x44) {
      break; // IEND
    }
    pos += 8 + length + 4; // 長さ + 名前 + データ + CRC
  }
  return false;
}
```

#### 実装例(PHP)

```php
/**
 * 画像データを変更すると情報が失われる PNG かどうかを判定する。
 * @param string $path PNG ファイルのパス
 * @return bool 縮小・圧縮し直し・形式変換をしてはいけない場合 true
 */
function has_unsafe_to_copy_private_chunk(string $path): bool {
    $fp = fopen($path, 'rb');
    if ($fp === false) return false;
    try {
        if (fread($fp, 8) !== "\x89PNG\r\n\x1a\n") return false; // PNG ではない
        while (($head = fread($fp, 8)) !== false && strlen($head) === 8) {
            $length = unpack('N', substr($head, 0, 4))[1];
            $type = substr($head, 4, 4);
            if (ctype_lower($type[1]) && ctype_upper($type[3])) {
                return true; // 非公開・コピー不可チャンクを検出
            }
            if ($type === 'IEND') break;
            if (fseek($fp, $length + 4, SEEK_CUR) !== 0) break; // データ + CRC を読み飛ばす
        }
        return false;
    } finally {
        fclose($fp);
    }
}
```

#### 補足: アニメーション PNG(APNG)

APNG のアニメーション情報(`acTL`, `fcTL`, `fdAT` チャンク)は公開チャンクのため、上記の条件には該当しません。しかし、APNG を縮小すると通常はアニメーションが失われます。APNG も保護したい場合は、`acTL` チャンクを含む PNG も処理の対象外としてください。

### ファイルサイズの上限について

Paint79 PNG は、完成イメージに加えて全レイヤーの画像を含むため、同じ大きさの通常の PNG と比べて数倍のサイズになることがあります。

アップロードサイズに上限を設けているアプリケーションでは、上記の判定によって縮小を行わない場合でも、通常どおり上限を適用してください。上限を超えた場合は、縮小せずにエラーとし、利用者に次の対処を案内することを推奨します。

- レイヤーを統合してレイヤー数を減らす
- キャンバスサイズを小さくする
- レイヤー情報が不要であれば、`exportPNG({ embedData: false })` で完成イメージのみを保存する

### レイヤー情報が失われるケース

次の操作を経ると、レイヤー情報は失われます。いずれの場合も、完成イメージは通常の画像として残ります。

| 操作 | 理由 |
| --- | --- |
| クリップボード経由のコピー&ペースト | ブラウザや OS が画像をデコードし、エンコードし直すため |
| 他の画像編集ソフトで編集・保存 | 仕様に従うソフトは、認識できないコピー不可チャンクを破棄するため |
| 画像の縮小・圧縮し直し・形式変換 | 同上 |
| メタデータを削除する処理 | 補助チャンクがまとめて削除されるため |

プライバシー保護等の目的でメタデータ(`eXIf`, `tEXt` 等)を削除している場合は、判定条件に該当するチャンクは残すようにしてください。Paint79 のチャンクには、撮影位置や端末情報などの個人情報は含まれません。

チャンクを削除せずに画像データだけを変更するソフトで編集された場合、完成イメージとレイヤー情報が食い違います。Paint79 は保存時に完成イメージのチェックサムを記録しており、`open()` でこの食い違いを検出します(`reason: 'image-modified'`)。その場合はレイヤー情報を使わず、現在の完成イメージを読み込みます。

### Paint79 をアプリケーションに組み込む

保存済みの画像を Paint79 で編集する場合の流れは次のとおりです。

```js
import Paint79 from '@tomk79/paint79';

// 1. 保存済みの画像を取得する(Paint79 PNG でも、通常の画像でもよい)
const response = await fetch(attachmentUrl);
const original = await response.blob();

// 2. Paint79 で開く
const paint79 = new Paint79(editorElement);
const result = await paint79.open(original);
if (!result.restored && result.reason !== 'no-data') {
  // 'image-modified' 等: レイヤー情報が使えなかったことを利用者に通知する
}

// 3. 利用者が編集する

// 4. 保存する: Paint79 PNG を書き出し、元のファイルをそのまま置き換える
const edited = await paint79.exportPNG();
await uploadAttachment(attachmentId, edited);

// 5. 後片付け
paint79.destroy();
```

- 元の画像が JPEG 等の場合でも、`exportPNG()` の結果は PNG です。ファイル名の拡張子や MIME タイプを更新してください
- 添付ファイルが Paint79 PNG かどうかを UI で示したい場合(アイコンの表示、「レイヤーを保持して編集」メニューの表示等)は、`Paint79.hasData()` を使用できます。Paint79 を読み込まない環境では、[Paint79 PNG のデータ形式](#paint79-png-のデータ形式) に従い、`paNT` チャンクとマジックナンバーの有無で判定できます

## Paint79 PNG のデータ形式

### 全体構造

```
PNG シグネチャ
IHDR       ─┐
(補助チャンク) │ 完成イメージ(通常の PNG と同じ)
IDAT ...   ─┘
paNT       ── Paint79 のレイヤー情報(1 つ)
IEND
```

- 完成イメージは、背景色と表示中(`visible: true`)の全レイヤーを統合した画像です。ピクセルサイズは `round(width × pixelRatio)` × `round(height × pixelRatio)` です
- `paNT` チャンクは 1 つのファイルに 1 つだけ存在し、最後の `IDAT` の後、`IEND` の前に配置されます。ただし読み込み時は、位置にかかわらず検出してください
- チャンクのデータ長の上限(2<sup>31</sup> − 1 バイト)を超える場合、`exportPNG()` はエラーになります

### `paNT` チャンク

チャンク名 `paNT` の各文字の意味は次のとおりです。

| 文字 | 意味 |
| --- | --- |
| `p`(小文字) | 補助チャンク。Paint79 を知らないデコーダは読み飛ばす |
| `a`(小文字) | 非公開チャンク |
| `N`(大文字) | 予約ビット(仕様により大文字) |
| `T`(大文字) | コピー不可。画像データを変更したソフトはこのチャンクを破棄する |

非公開チャンクの名前は他のアプリケーションと衝突する可能性があるため、データの先頭にマジックナンバーを置きます。マジックナンバーが一致しない `paNT` チャンクは、Paint79 のものではないとして無視します。

チャンクのデータ部分の構造は次のとおりです(数値はすべてビッグエンディアン)。

| オフセット | サイズ | 内容 |
| --- | --- | --- |
| 0 | 8 | マジックナンバー: ASCII `paint79` + `0x00` |
| 8 | 4 | 形式バージョン(符号なし 32 ビット整数)。現在は `1` |
| 12 | 4 | ヘッダーのバイト長 `N`(符号なし 32 ビット整数) |
| 16 | `N` | ヘッダー(UTF-8 の JSON) |
| 16 + `N` | 残り | レイヤー画像データ領域。各レイヤーの PNG ファイルを連結したもの |

### ヘッダー(JSON)

```json
{
  "width": 800,
  "height": 600,
  "pixelRatio": 2,
  "background": "#ffffff",
  "activeLayerId": "layer-2",
  "compositeChecksum": "crc32:1a2b3c4d",
  "layers": [
    {
      "id": "layer-1",
      "name": "下塗り",
      "visible": true,
      "opacity": 1,
      "locked": false,
      "blendMode": "normal",
      "offset": 0,
      "length": 52341
    },
    {
      "id": "layer-2",
      "name": "線画",
      "visible": true,
      "opacity": 0.8,
      "locked": false,
      "blendMode": "multiply",
      "offset": 52341,
      "length": 18820
    }
  ]
}
```

| プロパティ | 説明 |
| --- | --- |
| `width`, `height` | キャンバスのサイズ(CSS ピクセル) |
| `pixelRatio` | 保存時の内部解像度の倍率 |
| `background` | 背景色(CSS カラー文字列)。`null` の場合は透明 |
| `activeLayerId` | 保存時のアクティブレイヤーの ID |
| `compositeChecksum` | 完成イメージのチェックサム。`IHDR` チャンクのデータ部分と、全 `IDAT` チャンクのデータ部分を出現順に連結したバイト列の CRC-32 を、`crc32:` に続けて 16 進数 8 桁(小文字)で表したもの |
| `layers` | レイヤーの配列(背面から前面の順)。各要素は `LayerInfo` に、次の 2 つを加えたもの |
| `layers[].offset` | レイヤー画像データ領域の先頭からの、このレイヤーの PNG の開始位置(バイト) |
| `layers[].length` | このレイヤーの PNG のバイト長 |

- 各レイヤーの画像は、完成イメージと同じピクセルサイズの、アルファチャンネル付き PNG です
- 読み込み先の `pixelRatio` が保存時と異なる場合、各レイヤー画像は拡大・縮小して読み込まれます
- チェックサムには CRC-32 を使用します。目的は悪意のある改ざんの検出ではなく、他のソフトによる意図しない変更の検出です。CRC-32 であれば、`crypto.subtle` が使えない環境(非セキュアコンテキスト)でも計算できます

### 読み込み時の検証

`open()` は次の順に検証し、いずれかに該当した場合はレイヤーを復元せず、完成イメージを 1 枚のレイヤーとして読み込みます。

1. マジックナンバーが一致する `paNT` チャンクがない → `'no-data'`
2. 形式バージョンが対応範囲外 → `'unsupported-version'`
3. ヘッダーの JSON が解析できない、またはレイヤーの `offset` / `length` がデータ領域の範囲外 → `'corrupted'`
4. `compositeChecksum` が現在の `IHDR` / `IDAT` から計算した値と一致しない → `'image-modified'`(`ignoreMismatch: true` の場合は検証を省略)

## 対応ブラウザ

Pointer Events に対応したモダンブラウザ(Chrome, Edge, Firefox, Safari の最新版)を対象とします。

## ライセンス

MIT License
