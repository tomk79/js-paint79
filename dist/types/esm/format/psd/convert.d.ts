import { type BlendMode } from '../paint79-chunk.js';
/**
 * ag-psd が返す描画モードの名前を、合成モードにする。
 * 対応する 6 種は名前が同じ。それ以外は再現できないため normal とする
 */
export declare function toBlendMode(mode: string | undefined): BlendMode;
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
export declare function isLocked(protection: PsdProtection | undefined): boolean;
export type PsdPixelArray = Uint8Array | Uint8ClampedArray | Uint16Array | Float32Array;
/** RGBA の画素の配列を、8 bit の RGBA にする */
export declare function to8bit(data: PsdPixelArray): Uint8ClampedArray;
/**
 * レイヤーマスクの画素の配列を、8 bit にする。マスクの値は透明度として掛け合わせるため、
 * 32 bit でも色のようなガンマは適用せず、透明度と同じく 255 倍する
 */
export declare function maskTo8bit(data: PsdPixelArray): Uint8ClampedArray;
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
export declare function applyMask(layer: PsdRaster, mask: PsdMask): Uint8ClampedArray;
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
export declare function flattenLayers<T extends PsdTreeNode<T>>(nodes: T[]): FlatLayer<T>[];
