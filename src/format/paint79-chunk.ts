// Paint79 PNG の paNT チャンクのエンコード/デコード(DOM 非依存)
// 仕様: docs/specs/file-format.md
import {
  buildChunk,
  compositeChecksum,
  insertChunkBeforeIEND,
  isPng,
  readChunks,
  readImageSize,
  type PngChunk,
} from './png.js';

export const CHUNK_TYPE = 'paNT';
export const FORMAT_VERSION = 1;
const MAGIC = new TextEncoder().encode('paint79\0');
const FIXED_HEADER_SIZE = 16; // マジックナンバー(8) + 形式バージョン(4) + ヘッダー長(4)

export const BLEND_MODES = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
] as const;
export type BlendMode = (typeof BLEND_MODES)[number];

export interface Paint79LayerData {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  locked: boolean;
  blendMode: BlendMode;
  /** レイヤー画像(PNG ファイルのバイト列) */
  image: Uint8Array;
}

export interface Paint79Data {
  width: number;
  height: number;
  pixelRatio: number;
  background: string | null;
  activeLayerId: string;
  layers: Paint79LayerData[];
}

export type ExtractFailure = 'no-data' | 'unsupported-version' | 'corrupted' | 'image-modified';

export type ExtractResult = { status: 'restored'; data: Paint79Data } | { status: ExtractFailure };

function hasMagic(data: Uint8Array): boolean {
  return data.length >= MAGIC.length && MAGIC.every((b, i) => data[i] === b);
}

function isPaint79Chunk(c: PngChunk): boolean {
  return c.type === CHUNK_TYPE && hasMagic(c.data);
}

/** 指定したチャンクを取り除いたバイト列を返す */
function removeChunks(png: Uint8Array, targets: PngChunk[]): Uint8Array {
  if (targets.length === 0) return png;
  const parts: Uint8Array[] = [];
  let pos = 0;
  for (const c of targets) {
    parts.push(png.subarray(pos, c.offset));
    pos = c.offset + 12 + c.data.length;
  }
  parts.push(png.subarray(pos));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/**
 * 完成イメージの PNG に、レイヤー情報を格納した paNT チャンクを埋め込む。
 * 完成イメージの IHDR / IDAT は変更しない。既存の Paint79 の paNT チャンクは置き換える。
 */
export function embedPaint79Data(
  composite: Uint8Array,
  data: Paint79Data,
): Uint8Array<ArrayBuffer> {
  const base = removeChunks(composite, readChunks(composite).filter(isPaint79Chunk));

  let offset = 0;
  const layers = data.layers.map((layer) => {
    const entry = {
      id: layer.id,
      name: layer.name,
      visible: layer.visible,
      opacity: layer.opacity,
      locked: layer.locked,
      blendMode: layer.blendMode,
      offset,
      length: layer.image.length,
    };
    offset += layer.image.length;
    return entry;
  });
  const header = {
    width: data.width,
    height: data.height,
    pixelRatio: data.pixelRatio,
    background: data.background,
    activeLayerId: data.activeLayerId,
    compositeChecksum: compositeChecksum(base),
    layers,
  };
  const json = new TextEncoder().encode(JSON.stringify(header));

  const body = new Uint8Array(FIXED_HEADER_SIZE + json.length + offset);
  const v = new DataView(body.buffer);
  body.set(MAGIC, 0);
  v.setUint32(8, FORMAT_VERSION);
  v.setUint32(12, json.length);
  body.set(json, FIXED_HEADER_SIZE);
  let pos = FIXED_HEADER_SIZE + json.length;
  for (const layer of data.layers) {
    body.set(layer.image, pos);
    pos += layer.image.length;
  }
  return insertChunkBeforeIEND(base, buildChunk(CHUNK_TYPE, body));
}

/** マジックナンバーが一致する paNT チャンクを含むかどうか。内容の検証は行わない。 */
export function hasPaint79Data(bytes: Uint8Array): boolean {
  if (!isPng(bytes)) return false;
  return readChunks(bytes).some(isPaint79Chunk);
}

class CorruptedError extends Error {}

function fail(): never {
  throw new CorruptedError();
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isPositive = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0;
const isNonNegativeInt = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;

/** ヘッダーを検証して Paint79Data を組み立てる。不正な場合は CorruptedError を投げる。 */
/** 完成イメージ・レイヤー画像のピクセルサイズ(docs/specs/file-format.md) */
export function pixelSize(cssSize: number, pixelRatio: number): number {
  return Math.max(1, Math.round(cssSize * pixelRatio));
}

function parseHeader(
  header: unknown,
  area: Uint8Array,
  composite: { width: number; height: number },
): Paint79Data & { checksum: string } {
  if (!isObject(header)) fail();
  const { width, height, pixelRatio, background, activeLayerId } = header;
  if (!isPositive(width) || !isPositive(height) || !isPositive(pixelRatio)) fail();
  if (background !== null && typeof background !== 'string') fail();
  // ヘッダーのサイズが実際の画像と一致することを、デコードの前に IHDR だけで確認する。
  // 実際と異なる巨大なサイズによって、過大なメモリを確保することを防ぐため。
  if (
    pixelSize(width, pixelRatio) !== composite.width ||
    pixelSize(height, pixelRatio) !== composite.height
  ) {
    fail();
  }
  if (typeof header.compositeChecksum !== 'string') fail();
  if (!Array.isArray(header.layers) || header.layers.length === 0) fail();

  const ids = new Set<string>();
  const layers = header.layers.map((l: unknown): Paint79LayerData => {
    if (!isObject(l)) fail();
    const { id, name, visible, opacity, locked, blendMode, offset, length } = l;
    if (typeof id !== 'string' || id === '' || ids.has(id)) fail();
    ids.add(id);
    if (typeof name !== 'string') fail();
    if (typeof visible !== 'boolean' || typeof locked !== 'boolean') fail();
    if (typeof opacity !== 'number' || !(opacity >= 0 && opacity <= 1)) fail();
    if (!BLEND_MODES.includes(blendMode as BlendMode)) fail();
    if (!isNonNegativeInt(offset) || !isNonNegativeInt(length)) fail();
    if (offset + length > area.length) fail();
    const image = area.subarray(offset, offset + length);
    const size = readImageSize(image);
    if (!size || size.width !== composite.width || size.height !== composite.height) fail();
    return {
      id,
      name,
      visible,
      opacity,
      locked,
      blendMode: blendMode as BlendMode,
      image,
    };
  });

  const lastLayer = layers[layers.length - 1]!;
  return {
    width,
    height,
    pixelRatio,
    // 空文字列は、背景色を失わないための他の扱い(解釈できない色)と揃えて透明とする
    background: background === '' ? null : background,
    // 存在しないレイヤーを指している場合は、最前面のレイヤーをアクティブにする
    activeLayerId:
      typeof activeLayerId === 'string' && ids.has(activeLayerId) ? activeLayerId : lastLayer.id,
    layers,
    checksum: header.compositeChecksum,
  };
}

/**
 * Paint79 PNG からレイヤー情報を取り出す。
 * 検証の順序は docs/specs/file-format.md の「読み込み時の検証」に従う。
 */
export function extractPaint79Data(
  png: Uint8Array,
  options: { ignoreMismatch?: boolean } = {},
): ExtractResult {
  if (!isPng(png)) return { status: 'no-data' };
  const chunk = readChunks(png).find(isPaint79Chunk);
  if (!chunk) return { status: 'no-data' };

  const d = chunk.data;
  if (d.length < FIXED_HEADER_SIZE) return { status: 'corrupted' };
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
  const version = v.getUint32(8);
  if (version < 1 || version > FORMAT_VERSION) return { status: 'unsupported-version' };

  let parsed: Paint79Data & { checksum: string };
  try {
    const headerLength = v.getUint32(12);
    if (FIXED_HEADER_SIZE + headerLength > d.length) fail();
    const json = new TextDecoder('utf-8', { fatal: true }).decode(
      d.subarray(FIXED_HEADER_SIZE, FIXED_HEADER_SIZE + headerLength),
    );
    const composite = readImageSize(png);
    if (!composite) fail();
    parsed = parseHeader(JSON.parse(json), d.subarray(FIXED_HEADER_SIZE + headerLength), composite);
  } catch {
    // JSON の構文エラー、UTF-8 として不正なバイト列、ヘッダーの検証エラーのいずれも「壊れている」とみなす
    return { status: 'corrupted' };
  }

  const { checksum, ...data } = parsed;
  if (!options.ignoreMismatch && checksum !== compositeChecksum(png)) {
    return { status: 'image-modified' };
  }
  return { status: 'restored', data };
}
