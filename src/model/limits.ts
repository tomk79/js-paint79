// 読み込み時の上限(DOM 非依存)
// 仕様: docs/specs/api.md の「保存・読み込み」
import { pixelSize } from '../format/paint79-chunk';

/** open() でレイヤーを復元するときに確保するピクセル数の合計の上限(16384 x 16384) */
export const MAX_OPEN_PIXELS = 16384 * 16384;

/**
 * 読み込み先の pixelRatio で確保するレイヤー画像のピクセル数の合計が、上限を超えるかどうか。
 * 保存時の pixelRatio を極端に小さくした小さなファイルで、過大なメモリを確保させられることを防ぐ。
 */
export function exceedsOpenPixelLimit(c: {
  width: number;
  height: number;
  pixelRatio: number;
  layers: number;
}): boolean {
  const perLayer = pixelSize(c.width, c.pixelRatio) * pixelSize(c.height, c.pixelRatio);
  return perLayer * c.layers > MAX_OPEN_PIXELS;
}
