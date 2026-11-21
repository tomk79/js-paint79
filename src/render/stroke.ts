// ストロークの描画(DOM 依存)
import type { StrokePoint } from '../input/policy.js';
import type { Tool } from '../model/options.js';
import { context, type Surface } from './surface.js';

export interface StrokeStyle {
  tool: Tool;
  color: string;
  pixelRatio: number;
}

function prepare(surface: Surface, style: StrokeStyle): CanvasRenderingContext2D {
  const ctx = context(surface);
  ctx.save();
  ctx.setTransform(style.pixelRatio, 0, 0, style.pixelRatio, 0, 0);
  ctx.globalAlpha = 1;
  // 消しゴムは描画内容を透明に戻す(背景色で塗るのではない)
  ctx.globalCompositeOperation = style.tool === 'eraser' ? 'destination-out' : 'source-over';
  ctx.strokeStyle = style.color;
  ctx.fillStyle = style.color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  return ctx;
}

/** 点を 1 つ描画する(ストロークの開始点) */
export function drawDot(surface: Surface, p: StrokePoint, style: StrokeStyle): void {
  const ctx = prepare(surface, style);
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.width / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** 2 点を結ぶ線分を描画する。太さは両端の平均とする */
export function drawSegment(
  surface: Surface,
  from: StrokePoint,
  to: StrokePoint,
  style: StrokeStyle,
): void {
  const ctx = prepare(surface, style);
  ctx.lineWidth = (from.width + to.width) / 2;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.restore();
}
