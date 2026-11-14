# 画像を扱うアプリケーションとの連携

この文書は、[Paint79 PNG](file-format.md) を保存・表示する可能性のあるアプリケーション(メモアプリ、CMS、ファイル管理ツール等)の開発者向けの情報です。

## 要点

1. **表示**: 特別な対応は不要です。通常の PNG として表示してください。
2. **保存**: ファイルのバイト列を **変更せずに** 保存してください。縮小、圧縮し直し、形式変換、メタデータの削除を行うと、レイヤー情報が失われます。
3. **判定**: 「変更してはいけない PNG」かどうかは、Paint79 に依存しない一般的な規則で判定できます([後述](#変更してはいけない-png-の判定方法))。
4. **編集**: Paint79 をアプリケーションに組み込む場合は、保存されたバイト列を [`open()`](api.md#opensource-options) に渡し、[`exportPNG()`](api.md#保存読み込み) の結果で上書き保存してください([後述](#paint79-をアプリケーションに組み込む))。

## 変更してはいけない PNG の判定方法

画像の縮小や圧縮し直しを自動で行うアプリケーションは、次の条件を満たす PNG に対して、**それらの処理を行わないでください**。

> **チャンク名の 2 文字目が小文字、かつ 4 文字目が大文字であるチャンクを、1 つ以上含む PNG**

この条件は Paint79 固有のものではなく、PNG の仕様が定めるチャンク命名規則に基づく一般的な判定です。Paint79 以外のアプリケーションが独自のデータを埋め込んだ PNG も、同じ条件で保護されます。

### 背景: PNG のチャンク命名規則

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

### 判定アルゴリズム

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

### 実装例(JavaScript)

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

### 実装例(PHP)

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

### 補足: アニメーション PNG(APNG)

APNG のアニメーション情報(`acTL`, `fcTL`, `fdAT` チャンク)は公開チャンクのため、上記の条件には該当しません。しかし、APNG を縮小すると通常はアニメーションが失われます。APNG も保護したい場合は、`acTL` チャンクを含む PNG も処理の対象外としてください。

## ファイルサイズの上限について

Paint79 PNG は、完成イメージに加えて全レイヤーの画像を含むため、同じ大きさの通常の PNG と比べて数倍のサイズになることがあります。

アップロードサイズに上限を設けているアプリケーションでは、上記の判定によって縮小を行わない場合でも、通常どおり上限を適用してください。上限を超えた場合は、縮小せずにエラーとし、利用者に次の対処を案内することを推奨します。

- レイヤーを統合してレイヤー数を減らす
- キャンバスサイズを小さくする
- レイヤー情報が不要であれば、`exportPNG({ embedData: false })` で完成イメージのみを保存する

## レイヤー情報が失われるケース

次の操作を経ると、レイヤー情報は失われます。いずれの場合も、完成イメージは通常の画像として残ります。

| 操作 | 理由 |
| --- | --- |
| クリップボード経由のコピー&ペースト | ブラウザや OS が画像をデコードし、エンコードし直すため |
| 他の画像編集ソフトで編集・保存 | 仕様に従うソフトは、認識できないコピー不可チャンクを破棄するため |
| 画像の縮小・圧縮し直し・形式変換 | 同上 |
| メタデータを削除する処理 | 補助チャンクがまとめて削除されるため |

プライバシー保護等の目的でメタデータ(`eXIf`, `tEXt` 等)を削除している場合は、判定条件に該当するチャンクは残すようにしてください。Paint79 のチャンクには、撮影位置や端末情報などの個人情報は含まれません。

チャンクを削除せずに画像データだけを変更するソフトで編集された場合、完成イメージとレイヤー情報が食い違います。Paint79 は保存時に完成イメージのチェックサムを記録しており、`open()` でこの食い違いを検出します(`reason: 'image-modified'`)。その場合はレイヤー情報を使わず、現在の完成イメージを読み込みます。

## Paint79 をアプリケーションに組み込む

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
- 添付ファイルが Paint79 PNG かどうかを UI で示したい場合(アイコンの表示、「レイヤーを保持して編集」メニューの表示等)は、`Paint79.hasData()` を使用できます。Paint79 を読み込まない環境では、[Paint79 PNG のデータ形式](file-format.md) に従い、`paNT` チャンクとマジックナンバーの有無で判定できます

