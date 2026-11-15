import { describe, expect, test } from 'vitest';
import { opaqueBounds } from '../../src/format/psd/bounds';

/** 指定した座標の画素だけ透明度を持つ RGBA を作る */
function rgba(width: number, height: number, points: [number, number, number][] = []) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (const [x, y, alpha] of points) data[(y * width + x) * 4 + 3] = alpha;
  return data;
}

describe('opaqueBounds', () => {
  test('すべての画素が透明な場合は null', () => {
    expect(opaqueBounds(rgba(4, 3), 4, 3)).toBeNull();
  });

  test('透明でない画素が 1 つだけの場合は、その画素だけの矩形', () => {
    expect(opaqueBounds(rgba(4, 3, [[2, 1, 1]]), 4, 3)).toEqual({
      top: 1,
      left: 2,
      bottom: 2,
      right: 3,
    });
  });

  test('四隅の画素を含む場合は、全体の矩形', () => {
    const points: [number, number, number][] = [
      [0, 0, 255],
      [3, 2, 128],
    ];
    expect(opaqueBounds(rgba(4, 3, points), 4, 3)).toEqual({
      top: 0,
      left: 0,
      bottom: 3,
      right: 4,
    });
  });

  test('離れた画素は、両方を含む最小の矩形にまとめる', () => {
    const points: [number, number, number][] = [
      [3, 1, 10],
      [1, 3, 10],
    ];
    expect(opaqueBounds(rgba(5, 5, points), 5, 5)).toEqual({
      top: 1,
      left: 1,
      bottom: 4,
      right: 4,
    });
  });
});
