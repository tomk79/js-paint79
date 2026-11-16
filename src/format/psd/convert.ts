// PSD の読み込みで使う変換(DOM 非依存、ag-psd に依存しない純粋関数)
// 仕様: docs/specs/psd.md の「読み込み」
import { BLEND_MODES, type BlendMode } from '../paint79-chunk';

/**
 * ag-psd が返す描画モードの名前を、合成モードにする。
 * 対応する 6 種は名前が同じ。それ以外は再現できないため normal とする
 */
export function toBlendMode(mode: string | undefined): BlendMode {
  return (BLEND_MODES as readonly string[]).includes(mode ?? '') ? (mode as BlendMode) : 'normal';
}

export interface PsdProtection {
  transparency?: boolean;
  composite?: boolean;
  position?: boolean;
  all?: boolean;
}

/**
 * Paint79 の locked はポインターによる描画の禁止なので、それに当たる「画像ピクセルのロック」か
 * 「すべてのロック」のときだけ true とする
 */
export function isLocked(protection: PsdProtection | undefined): boolean {
  return !!(protection?.composite || protection?.all);
}

export type PsdPixelArray = Uint8Array | Uint8ClampedArray | Uint16Array | Float32Array;

/** RGBA の画素の配列を、8 bit の RGBA にする */
export function to8bit(data: PsdPixelArray): Uint8ClampedArray {
  if (data instanceof Uint8ClampedArray) return data;
  if (data instanceof Uint8Array) return new Uint8ClampedArray(data);
  const out = new Uint8ClampedArray(data.length);
  if (data instanceof Uint16Array) {
    for (let i = 0; i < data.length; i++) out[i] = Math.round(data[i]! / 257);
    return out;
  }
  // 32 bit の PSD の色はリニアな値なので、表示用(sRGB 相当)にガンマ 2.2 で変換する。
  // 透明度はリニア・ガンマの区別がないため、そのまま 255 倍する
  for (let i = 0; i < data.length; i++) {
    const v = Math.min(1, Math.max(0, data[i]!));
    out[i] = Math.round((i % 4 === 3 ? v : Math.pow(v, 1 / 2.2)) * 255);
  }
  return out;
}

/**
 * レイヤーマスクの画素の配列を、8 bit にする。マスクの値は透明度として掛け合わせるため、
 * 32 bit でも色のようなガンマは適用せず、透明度と同じく 255 倍する
 */
export function maskTo8bit(data: PsdPixelArray): Uint8ClampedArray {
  if (!(data instanceof Float32Array)) return to8bit(data);
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i++) {
    out[i] = Math.round(Math.min(1, Math.max(0, data[i]!)) * 255);
  }
  return out;
}

/** ドキュメント座標の矩形と、その範囲の 8 bit RGBA */
export interface PsdRaster {
  left: number;
  top: number;
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
}

export interface PsdMask {
  left: number;
  top: number;
  width: number;
  height: number;
  /** グレースケールを R・G・B に入れた 8 bit RGBA */
  data: Uint8ClampedArray;
  /** マスクの範囲外の値(0 または 255) */
  defaultColor: number;
}

/**
 * レイヤーマスクを、レイヤーの透明度に掛け合わせた RGBA を返す。
 * Paint79 にはマスクがないため、見た目を近づけるために画素へ焼き込む(マスクとしては残らない)
 */
export function applyMask(layer: PsdRaster, mask: PsdMask): Uint8ClampedArray {
  const out = layer.rgba.slice();
  for (let y = 0; y < layer.height; y++) {
    const my = layer.top + y - mask.top;
    for (let x = 0; x < layer.width; x++) {
      const mx = layer.left + x - mask.left;
      const inside = mx >= 0 && mx < mask.width && my >= 0 && my < mask.height;
      const m = inside ? mask.data[(my * mask.width + mx) * 4]! : mask.defaultColor;
      const i = (y * layer.width + x) * 4 + 3;
      out[i] = Math.round((out[i]! * m) / 255);
    }
  }
  return out;
}

/** ag-psd の children の木構造のうち、グループの解体に必要なもの */
export interface PsdTreeNode<T> {
  hidden?: boolean;
  opacity?: number;
  children?: T[];
}

export interface FlatLayer<T> {
  node: T;
  visible: boolean;
  opacity: number;
  /** グループの区切りを含む、PSD のレイヤーレコードの並び(最背面から)でのインデックス */
  recordIndex: number;
}

/**
 * グループを解体し、レイヤーを背面から前面の順に並べる。
 * Paint79 にはグループがないため、見た目を近づけるよう、グループの非表示は中のレイヤーにも及ぼし、
 * グループの不透明度は中のレイヤーの不透明度に掛け合わせる(グループの描画モードは再現できない)。
 * children を持つもの(空の配列を含む)をグループとみなす
 */
export function flattenLayers<T extends PsdTreeNode<T>>(nodes: T[]): FlatLayer<T>[] {
  const out: FlatLayer<T>[] = [];
  let record = 0;
  const walk = (list: T[], visible: boolean, opacity: number) => {
    for (const node of list) {
      const v = visible && !node.hidden;
      const o = opacity * (node.opacity ?? 1);
      if (node.children) {
        // PSD のレコードは、グループの区切り、中のレイヤー、グループ自身の順に並ぶ
        record++;
        walk(node.children, v, o);
        record++;
      } else {
        out.push({ node, visible: v, opacity: o, recordIndex: record++ });
      }
    }
  };
  walk(nodes, true, 1);
  return out;
}
