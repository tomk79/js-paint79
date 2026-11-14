// PNG のチャンク構造を扱うユーティリティ(DOM 非依存)
// 仕様: https://www.w3.org/TR/png-3/
import { crc32 } from './crc32';

export const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export interface PngChunk {
  /** チャンク名(ASCII 4 文字) */
  type: string;
  /** データ部分(元のバイト列を参照する subarray) */
  data: Uint8Array;
  /** ファイル先頭からの、チャンク(長さフィールド)の開始位置 */
  offset: number;
}

const CHUNK_NAME = /^[A-Za-z]{4}$/;

export function isPng(bytes: Uint8Array): boolean {
  if (bytes.length < PNG_SIGNATURE.length) return false;
  return PNG_SIGNATURE.every((b, i) => bytes[i] === b);
}

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function typeAt(bytes: Uint8Array, pos: number): string {
  return String.fromCharCode(bytes[pos]!, bytes[pos + 1]!, bytes[pos + 2]!, bytes[pos + 3]!);
}

/**
 * チャンクを出現順に走査する。IEND に達するか、ファイルが途中で切れている場合に終了する。
 * データの読み込みは行わず、長さの分だけ読み飛ばすので、大きなファイルでも高速に走査できる。
 */
function* iterateChunks(bytes: Uint8Array): Generator<PngChunk> {
  const v = view(bytes);
  let pos = PNG_SIGNATURE.length;
  while (pos + 8 <= bytes.length) {
    const length = v.getUint32(pos);
    const type = typeAt(bytes, pos + 4);
    const dataStart = pos + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) return; // 途中で切れている
    yield { type, data: bytes.subarray(dataStart, dataEnd), offset: pos };
    if (type === 'IEND') return;
    pos = dataEnd + 4;
  }
}

/** PNG のチャンクを出現順に返す。PNG でなければ TypeError を投げる。 */
export function readChunks(bytes: Uint8Array): PngChunk[] {
  if (!isPng(bytes)) throw new TypeError('PNG ではありません');
  return [...iterateChunks(bytes)];
}

/** 長さ・名前・データ・CRC を並べたチャンクのバイト列を作る */
export function buildChunk(type: string, data: Uint8Array): Uint8Array<ArrayBuffer> {
  if (!CHUNK_NAME.test(type)) {
    throw new TypeError(`チャンク名は英字 4 文字で指定してください: ${type}`);
  }
  if (data.length > 0x7fffffff) {
    throw new RangeError('チャンクのデータ長が上限(2^31 - 1 バイト)を超えています');
  }
  const typeBytes = new TextEncoder().encode(type);
  const out = new Uint8Array(12 + data.length);
  const v = view(out);
  v.setUint32(0, data.length);
  out.set(typeBytes, 4);
  out.set(data, 8);
  v.setUint32(8 + data.length, crc32([typeBytes, data]));
  return out;
}

/** IEND チャンクの直前にチャンクを挿入した、新しいバイト列を返す */
export function insertChunkBeforeIEND(png: Uint8Array, chunk: Uint8Array): Uint8Array<ArrayBuffer> {
  const iend = readChunks(png).find((c) => c.type === 'IEND');
  if (!iend) throw new TypeError('IEND チャンクがありません');
  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, iend.offset), 0);
  out.set(chunk, iend.offset);
  out.set(png.subarray(iend.offset), iend.offset + chunk.length);
  return out;
}

const isLower = (c: number) => c >= 0x61 && c <= 0x7a;
const isUpper = (c: number) => c >= 0x41 && c <= 0x5a;

/**
 * 非公開(2 文字目が小文字)かつコピー不可(4 文字目が大文字)のチャンクを含むかどうか。
 * 該当する PNG は、画像データを変更すると情報が失われる(docs/specs/integration.md)。
 */
export function hasUnsafeToCopyPrivateChunk(bytes: Uint8Array): boolean {
  if (!isPng(bytes)) return false;
  for (const c of iterateChunks(bytes)) {
    const t1 = c.type.charCodeAt(1);
    const t3 = c.type.charCodeAt(3);
    if (isLower(t1) && isUpper(t3)) return true;
  }
  return false;
}

/**
 * 完成イメージのチェックサム。IHDR のデータと全 IDAT のデータを出現順に連結した CRC-32。
 * docs/specs/file-format.md の compositeChecksum を参照。
 */
export function compositeChecksum(png: Uint8Array): string {
  const parts = readChunks(png)
    .filter((c) => c.type === 'IHDR' || c.type === 'IDAT')
    .map((c) => c.data);
  return `crc32:${crc32(parts).toString(16).padStart(8, '0')}`;
}
