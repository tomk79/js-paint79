/** open() でレイヤーを復元するときに確保するピクセル数の合計の上限(16384 x 16384) */
export declare const MAX_OPEN_PIXELS: number;
/**
 * 読み込み先の pixelRatio で確保するレイヤー画像のピクセル数の合計が、上限を超えるかどうか。
 * 保存時の pixelRatio を極端に小さくした小さなファイルで、過大なメモリを確保させられることを防ぐ。
 */
export declare function exceedsOpenPixelLimit(c: {
    width: number;
    height: number;
    pixelRatio: number;
    layers: number;
}): boolean;
