// ユニットテスト用の PNG バイト列を生成するヘルパー
import { deflateSync } from 'node:zlib';
import { crc32 } from '../../src/format/crc32';

export const SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function chunk(type: string, data: Uint8Array = new Uint8Array()): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(typeBytes, 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32([typeBytes, data]));
  return out;
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}

export function ihdr(width: number, height: number): Uint8Array {
  const data = new Uint8Array(13);
  const view = new DataView(data.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  data[8] = 8; // ビット深度
  data[9] = 6; // RGBA
  return chunk('IHDR', data);
}

/** RGBA のピクセル値から IDAT チャンクを作る */
export function idat(width: number, height: number, rgba?: Uint8Array): Uint8Array {
  const pixels = rgba ?? new Uint8Array(width * height * 4);
  const raw = new Uint8Array(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw.set(pixels.subarray(y * width * 4, (y + 1) * width * 4), y * (1 + width * 4) + 1);
  }
  return chunk('IDAT', new Uint8Array(deflateSync(raw)));
}

export interface MakePngOptions {
  width?: number;
  height?: number;
  rgba?: Uint8Array;
  /** IHDR の直後に置くチャンク */
  before?: Uint8Array[];
  /** IDAT の後、IEND の前に置くチャンク */
  after?: Uint8Array[];
}

export function makePng(options: MakePngOptions = {}): Uint8Array {
  const { width = 2, height = 2, rgba, before = [], after = [] } = options;
  return concat(
    SIGNATURE,
    ihdr(width, height),
    ...before,
    idat(width, height, rgba),
    ...after,
    chunk('IEND'),
  );
}
