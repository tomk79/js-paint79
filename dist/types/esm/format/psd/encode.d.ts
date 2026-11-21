import type { BlendMode } from '../paint79-chunk.js';
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
/** PSD(バージョン 1)で表せる幅・高さの上限 */
export declare const MAX_PSD_SIZE = 30000;
/** ピクセルサイズが PSD で表せる範囲かを確かめる。画素を読み出す前に呼べるよう、独立させている */
export declare function assertPsdSize(width: number, height: number): void;
/**
 * PSD で記録できるレイヤー数の上限。レイヤー数は符号付き 16 bit で記録し、統合画像が透明度を持つことを
 * 負の値で示すため、正負どちらでも表せる 32,767 を上限とする
 */
export declare const MAX_PSD_LAYERS = 32767;
/** レイヤー数を PSD に記録できることを確かめる。超えた値を書くと、以降のレコードが読めなくなる */
export declare function assertPsdLayerCount(count: number): void;
export declare function encodePsd(doc: PsdDocument): Uint8Array<ArrayBuffer>;
