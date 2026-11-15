// PSD のレイヤー画像の範囲の計算(DOM 非依存)
// 仕様: docs/specs/psd.md の「レイヤー画像の範囲」

/** PSD のレイヤーの範囲。right / bottom は範囲に含まない */
export interface PsdBounds {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

/** 透明度が 0 でない画素をすべて含む最小の矩形を返す。すべて透明なら null */
export function opaqueBounds(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): PsdBounds | null {
  let top = height;
  let left = width;
  let bottom = 0;
  let right = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rgba[(y * width + x) * 4 + 3] === 0) continue;
      if (y < top) top = y;
      if (x < left) left = x;
      if (y >= bottom) bottom = y + 1;
      if (x >= right) right = x + 1;
    }
  }
  return top < bottom ? { top, left, bottom, right } : null;
}
