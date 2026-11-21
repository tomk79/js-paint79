/** PSD のレイヤーの範囲。right / bottom は範囲に含まない */
export interface PsdBounds {
    top: number;
    left: number;
    bottom: number;
    right: number;
}
/** 透明度が 0 でない画素をすべて含む最小の矩形を返す。すべて透明なら null */
export declare function opaqueBounds(rgba: Uint8ClampedArray, width: number, height: number): PsdBounds | null;
