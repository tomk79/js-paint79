import { describe, expect, test } from 'vitest';
import { MAX_OPEN_PIXELS, exceedsOpenPixelLimit } from '../../src/model/limits';

describe('exceedsOpenPixelLimit', () => {
  test('上限は 16384 x 16384', () => {
    expect(MAX_OPEN_PIXELS).toBe(16384 * 16384);
  });

  test('読み込み先の pixelRatio で確保するピクセル数の合計で判定する', () => {
    // 4000 x 3000 のレイヤー 20 枚(2.4 億ピクセル)は上限内
    expect(exceedsOpenPixelLimit({ width: 4000, height: 3000, pixelRatio: 1, layers: 20 })).toBe(
      false,
    );
    // 10000 x 10000 のレイヤー 3 枚(3 億ピクセル)は上限を超える
    expect(exceedsOpenPixelLimit({ width: 10000, height: 10000, pixelRatio: 1, layers: 3 })).toBe(
      true,
    );
    // CSS ピクセルでは小さくても、pixelRatio が大きければ超える
    expect(exceedsOpenPixelLimit({ width: 6000, height: 6000, pixelRatio: 3, layers: 1 })).toBe(
      true,
    );
  });

  test('ちょうど上限は許容する', () => {
    expect(exceedsOpenPixelLimit({ width: 16384, height: 16384, pixelRatio: 1, layers: 1 })).toBe(
      false,
    );
    expect(exceedsOpenPixelLimit({ width: 16384, height: 16385, pixelRatio: 1, layers: 1 })).toBe(
      true,
    );
  });

  test('ピクセルサイズは max(1, round(...)) で計算する', () => {
    expect(
      exceedsOpenPixelLimit({ width: 0.1, height: 0.1, pixelRatio: 1, layers: MAX_OPEN_PIXELS }),
    ).toBe(false);
  });
});
