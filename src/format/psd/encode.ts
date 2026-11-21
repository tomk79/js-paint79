// PSD の書き出し(DOM 非依存)
// 仕様: docs/specs/psd.md
import type { BlendMode } from '../paint79-chunk.js';
import { opaqueBounds, type PsdBounds } from './bounds.js';
import { packBits } from './packbits.js';
import { srgbIccProfile } from './srgb-icc.js';
import { assertSectionLength, ByteWriter } from './writer.js';

export interface PsdLayer {
  name: string;
  visible: boolean;
  opacity: number;
  blendMode: BlendMode;
  locked: boolean;
  /** キャンバス全体の RGBA(透明度で乗算していない値) */
  rgba: Uint8ClampedArray;
}

export interface PsdDocument {
  /** ピクセルサイズ */
  width: number;
  height: number;
  dpi: number;
  /** アクティブレイヤーの、最背面からのインデックス */
  activeIndex: number;
  /** 背面から前面の順 */
  layers: PsdLayer[];
  /** 完成イメージの RGBA */
  composite: Uint8ClampedArray;
}

/** 合成モードに対応する、PSD の描画モードのキー(4 文字) */
const BLEND_KEYS: Record<BlendMode, string> = {
  normal: 'norm',
  multiply: 'mul ',
  screen: 'scrn',
  overlay: 'over',
  darken: 'dark',
  lighten: 'lite',
};

const COLOR_MODE_RGB = 3;
const COMPRESSION_RLE = 1;

/** RGBA の 1 チャンネル(0: R, 1: G, 2: B, 3: 透明度)の、矩形内の 1 行を取り出す */
function channelRow(
  rgba: Uint8ClampedArray,
  width: number,
  channel: number,
  y: number,
  left: number,
  right: number,
): Uint8Array {
  const row = new Uint8Array(right - left);
  for (let x = left; x < right; x++) row[x - left] = rgba[(y * width + x) * 4 + channel]!;
  return row;
}

/** レイヤーのチャンネルの並び(−1: 透明度、0: R、1: G、2: B)と、RGBA の中での位置 */
const LAYER_CHANNELS = [
  { id: -1, offset: 3 },
  { id: 0, offset: 0 },
  { id: 1, offset: 1 },
  { id: 2, offset: 2 },
] as const;

/** 圧縮済みのレイヤーのチャンネル。rows が空なら、画素を持たない(圧縮方式だけを書く) */
interface EncodedChannel {
  id: number;
  rows: Uint8Array[];
  /** 圧縮方式(2 バイト)を含む、チャンネルのデータ長 */
  length: number;
}

function encodeLayerChannels(doc: PsdDocument, layer: PsdLayer, bounds: PsdBounds | null) {
  return LAYER_CHANNELS.map(({ id, offset }): EncodedChannel => {
    if (!bounds) return { id, rows: [], length: 2 };
    const rows: Uint8Array[] = [];
    for (let y = bounds.top; y < bounds.bottom; y++) {
      rows.push(packBits(channelRow(layer.rgba, doc.width, offset, y, bounds.left, bounds.right)));
    }
    const data = rows.reduce((n, r) => n + r.length, 0);
    return { id, rows, length: 2 + rows.length * 2 + data };
  });
}

/** ASCII 以外の文字を ? に置き換えた、パディング付きの Pascal 文字列を書く */
function writePascalString(w: ByteWriter, text: string, padTo: number): void {
  const chars = Array.from(text.slice(0, 255), (ch) => {
    const code = ch.charCodeAt(0);
    return code < 128 ? code : 0x3f;
  });
  w.u8(chars.length);
  for (const c of chars) w.u8(c);
  for (let n = chars.length + 1; n % padTo !== 0; n++) w.u8(0);
}

/** レイヤーの付加情報(キーと長さ付きのデータ)を書く */
function writeAdditionalInfo(w: ByteWriter, key: string, padTo: number, write: () => void): void {
  w.ascii('8BIM');
  w.ascii(key);
  w.section(padTo, write);
}

/** lspf のビット 1(0x02)。画像ピクセルのロック */
const LOCK_IMAGE_PIXELS = 0x02;

/**
 * globalAlpha は、統合画像が透明度のチャンネルを持つかどうか。持つ場合は、そのことをレイヤー数を
 * 負の値にして示す(PSD の仕様)
 */
function writeLayerInfo(w: ByteWriter, doc: PsdDocument, globalAlpha: boolean): void {
  const encoded = doc.layers.map((layer) => {
    const bounds = opaqueBounds(layer.rgba, doc.width, doc.height);
    return { layer, bounds, channels: encodeLayerChannels(doc, layer, bounds) };
  });
  // 画素のデータだけでセクションの上限を超える場合は、巨大なバッファを確保する前に中止する
  assertSectionLength(
    encoded.reduce((n, e) => n + e.channels.reduce((m, c) => m + c.length, 0), 0),
  );
  w.i16(globalAlpha ? -doc.layers.length : doc.layers.length);
  for (const { layer, bounds, channels } of encoded) {
    w.i32(bounds?.top ?? 0);
    w.i32(bounds?.left ?? 0);
    w.i32(bounds?.bottom ?? 0);
    w.i32(bounds?.right ?? 0);
    w.u16(channels.length);
    for (const c of channels) {
      w.i16(c.id);
      w.u32(c.length);
    }
    w.ascii('8BIM');
    w.ascii(BLEND_KEYS[layer.blendMode]);
    w.u8(Math.round(layer.opacity * 255));
    w.u8(0); // クリッピング
    // フラグ。0x02 は非表示。0x08 は、0x10 のビットが意味を持つことを示す(Photoshop 5.0 以降)
    w.u8(0x08 | (layer.visible ? 0 : 0x02));
    w.u8(0); // 予約
    w.section(1, () => {
      w.u32(0); // レイヤーマスク
      w.u32(0); // ブレンド条件
      writePascalString(w, layer.name, 4);
      // Pascal 文字列は ASCII しか表せないため、Unicode のレイヤー名(UTF-16)も書く
      writeAdditionalInfo(w, 'luni', 4, () => {
        w.u32(layer.name.length);
        for (let i = 0; i < layer.name.length; i++) w.u16(layer.name.charCodeAt(i));
      });
      writeAdditionalInfo(w, 'lspf', 2, () => w.u32(layer.locked ? LOCK_IMAGE_PIXELS : 0));
    });
  }
  for (const { channels } of encoded) {
    for (const c of channels) {
      if (c.rows.length === 0) {
        w.u16(0); // 画素を持たないチャンネルは、無圧縮で長さ 0
        continue;
      }
      w.u16(COMPRESSION_RLE);
      for (const row of c.rows) w.u16(row.length);
      for (const row of c.rows) w.bytes(row);
    }
  }
}

function hasTransparency(rgba: Uint8ClampedArray): boolean {
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] !== 255) return true;
  return false;
}

/**
 * 透明度が 255 でない画素の色を、白の上に合成した値にする。
 * PSD を読むアプリケーションは、透明度を持つ統合画像の色が白と合成されていることを前提とするため
 */
function matteWithWhite(rgba: Uint8ClampedArray): Uint8ClampedArray {
  const out = rgba.slice();
  for (let i = 0; i < out.length; i += 4) {
    const a = out[i + 3]!;
    if (a === 255) continue;
    for (let c = 0; c < 3; c++) out[i + c] = Math.round((out[i + c]! * a + 255 * (255 - a)) / 255);
  }
  return out;
}

/** 統合画像(Image Data セクション)を書く。全チャンネルの行の長さの表に続けて、行のデータを書く */
function writeComposite(
  w: ByteWriter,
  doc: PsdDocument,
  composite: Uint8ClampedArray,
  channels: number[],
): void {
  const rows = channels.flatMap((c) =>
    Array.from({ length: doc.height }, (_, y) =>
      packBits(channelRow(composite, doc.width, c, y, 0, doc.width)),
    ),
  );
  w.u16(COMPRESSION_RLE);
  for (const row of rows) w.u16(row.length);
  for (const row of rows) w.bytes(row);
}

/** Image Resource を 1 つ書く。名前は空(長さ 0 の Pascal 文字列を偶数長に埋めた 2 バイト) */
function writeImageResource(w: ByteWriter, id: number, write: () => void): void {
  w.ascii('8BIM');
  w.u16(id);
  w.u16(0);
  w.section(2, write);
}

/** 解像度の値(符号付き 16.16 固定小数点)として表せる範囲 */
const MIN_DPI = 1 / 65536;
const MAX_DPI = 32767;

const RESOLUTION_INFO = 1005;
const LAYER_STATE = 1024;
const ICC_PROFILE = 1039;
const UNIT_PPI = 1;
const UNIT_INCHES = 1;

function writeImageResources(w: ByteWriter, doc: PsdDocument): void {
  const dpi = Math.round(Math.min(MAX_DPI, Math.max(MIN_DPI, doc.dpi)) * 65536);
  writeImageResource(w, RESOLUTION_INFO, () => {
    for (let i = 0; i < 2; i++) {
      // 横、縦の順に、解像度・解像度の単位・表示に使う長さの単位
      w.u32(dpi);
      w.u16(UNIT_PPI);
      w.u16(UNIT_INCHES);
    }
  });
  // canvas の色は sRGB なので、プロファイルを明示する。ない場合、外部アプリケーションは作業用の
  // 色空間(Adobe RGB など)として解釈し、色がずれることがある
  writeImageResource(w, ICC_PROFILE, () => w.bytes(srgbIccProfile()));
  // ターゲットレイヤー(Photoshop で開いたときに選択されるレイヤー)
  writeImageResource(w, LAYER_STATE, () => w.u16(doc.activeIndex));
}

/** PSD(バージョン 1)で表せる幅・高さの上限 */
export const MAX_PSD_SIZE = 30000;

/** ピクセルサイズが PSD で表せる範囲かを確かめる。画素を読み出す前に呼べるよう、独立させている */
export function assertPsdSize(width: number, height: number): void {
  if (width > MAX_PSD_SIZE || height > MAX_PSD_SIZE) {
    throw new RangeError(
      `PSD の幅・高さは ${MAX_PSD_SIZE} ピクセルまでです(${width} x ${height} ピクセル)`,
    );
  }
}

/**
 * PSD で記録できるレイヤー数の上限。レイヤー数は符号付き 16 bit で記録し、統合画像が透明度を持つことを
 * 負の値で示すため、正負どちらでも表せる 32,767 を上限とする
 */
export const MAX_PSD_LAYERS = 32767;

/** レイヤー数を PSD に記録できることを確かめる。超えた値を書くと、以降のレコードが読めなくなる */
export function assertPsdLayerCount(count: number): void {
  if (count > MAX_PSD_LAYERS) {
    throw new Error(
      `PSD に記録できるレイヤーは ${MAX_PSD_LAYERS} 枚までのため、書き出せません(${count} 枚)`,
    );
  }
}

export function encodePsd(doc: PsdDocument): Uint8Array<ArrayBuffer> {
  assertPsdSize(doc.width, doc.height);
  assertPsdLayerCount(doc.layers.length);
  const globalAlpha = hasTransparency(doc.composite);
  const channels = globalAlpha ? [0, 1, 2, 3] : [0, 1, 2];
  const w = new ByteWriter();

  // ヘッダー
  w.ascii('8BPS');
  w.u16(1); // バージョン(PSB ではない)
  for (let i = 0; i < 6; i++) w.u8(0); // 予約
  w.u16(channels.length);
  w.u32(doc.height);
  w.u32(doc.width);
  w.u16(8); // ビット深度
  w.u16(COLOR_MODE_RGB);

  w.section(1, () => {}); // カラーモードデータ(RGB では空)
  w.section(1, () => writeImageResources(w, doc));
  w.section(2, () => {
    // レイヤーとマスクの情報
    w.section(4, () => {
      if (doc.layers.length > 0) writeLayerInfo(w, doc, globalAlpha);
    });
    w.u32(0); // グローバルレイヤーマスク
  });

  writeComposite(w, doc, globalAlpha ? matteWithWhite(doc.composite) : doc.composite, channels);
  return w.result();
}
