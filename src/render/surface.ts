// レイヤーの画像(canvas)と、表示用 canvas への合成(DOM 依存)
import type { PixelRect } from '../input/policy.js';
import type { Layer } from '../model/LayerStack.js';
import { compositeOperation } from './blend.js';

export type Surface = HTMLCanvasElement;

export function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas の 2D コンテキストを取得できません');
  return ctx;
}

/** 内部解像度のピクセルサイズを指定して、透明な canvas を作る */
export function createSurface(width: number, height: number): Surface {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function cloneSurface(src: Surface): Surface {
  const out = createSurface(src.width, src.height);
  context(out).drawImage(src, 0, 0);
  return out;
}

/** 指定した範囲を切り出した canvas を作る */
export function copyRect(src: Surface, rect: PixelRect): Surface {
  const out = createSurface(rect.width, rect.height);
  context(out).drawImage(
    src,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    0,
    0,
    rect.width,
    rect.height,
  );
  return out;
}

/** 指定した範囲を、切り出しておいた内容で置き換える */
export function restoreRect(dst: Surface, snapshot: Surface, rect: PixelRect): void {
  const ctx = context(dst);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(rect.x, rect.y, rect.width, rect.height);
  ctx.drawImage(snapshot, rect.x, rect.y);
  ctx.restore();
}

/** 全体を、別の canvas の内容で置き換える */
export function restoreAll(dst: Surface, snapshot: Surface): void {
  restoreRect(dst, snapshot, { x: 0, y: 0, width: dst.width, height: dst.height });
}

export function clearSurface(s: Surface): void {
  const ctx = context(s);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, s.width, s.height);
  ctx.restore();
}

/** レイヤーの内容を、opacity と blendMode を適用して描画する */
export function drawLayer(ctx: CanvasRenderingContext2D, layer: Layer<Surface>): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = layer.opacity;
  ctx.globalCompositeOperation = compositeOperation(layer.blendMode);
  ctx.drawImage(layer.surface, 0, 0);
  ctx.restore();
}

/** 背景色の上に、表示中のレイヤーを背面から順に合成する(完成イメージ) */
export function composite(
  target: HTMLCanvasElement,
  layers: readonly Layer<Surface>[],
  background: string | null,
): void {
  const ctx = context(target);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, target.width, target.height);
  if (background !== null) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, target.width, target.height);
  }
  ctx.restore();
  for (const layer of layers) {
    if (layer.visible) drawLayer(ctx, layer);
  }
}

export function canvasToBlob(canvas: HTMLCanvasElement, type?: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('画像を書き出せませんでした'))),
      type,
      quality,
    );
  });
}
