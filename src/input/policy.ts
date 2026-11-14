// ポインター入力に関する判断ロジック(DOM 非依存)
// 仕様: docs/specs/api.md の「ポインター操作による描画」
import { POINTER_TYPES } from '../model/options';

export interface StrokeWidthInput {
  lineWidth: number;
  pressureEnabled: boolean;
  pointerType: string;
  pressure: number;
}

/** ストロークの点における線の太さ */
export function strokeWidth(input: StrokeWidthInput): number {
  if (!input.pressureEnabled || input.pointerType !== 'pen') return input.lineWidth;
  return input.lineWidth * Math.min(1, Math.max(input.pressure, 0.1));
}

export interface PointerDownContext {
  pointerType: string;
  readOnly: boolean;
  pointerTypes: readonly string[];
  palmRejection: boolean;
  /** このインスタンスでペン入力を検出したことがあるか(今回の入力を含む) */
  penDetected: boolean;
  /** アクティブレイヤーに描画できるか(ロックされておらず、表示されている) */
  layerDrawable: boolean;
  /** 描画中のストロークのポインターの種類。描画中でなければ null */
  activeStrokePointerType: string | null;
}

/**
 * pointerdown を受けたときの動作を決める。
 * - 'start': ストロークを開始する
 * - 'ignore': 無視する
 * - 'replace': 描画中のストロークを取り消し、このポインターでストロークを開始する
 */
export function decidePointerDown(c: PointerDownContext): 'start' | 'ignore' | 'replace' {
  if (c.readOnly) return 'ignore';
  if (!(POINTER_TYPES as readonly string[]).includes(c.pointerType)) return 'ignore';
  if (!c.pointerTypes.includes(c.pointerType)) return 'ignore';
  if (c.palmRejection && c.pointerType === 'touch' && c.penDetected) return 'ignore';
  if (!c.layerDrawable) return 'ignore';
  if (c.activeStrokePointerType !== null) {
    // 手のひらが先に触れていても、ペンで描き始められるようにする
    const palmFirst =
      c.palmRejection && c.activeStrokePointerType === 'touch' && c.pointerType === 'pen';
    return palmFirst ? 'replace' : 'ignore';
  }
  return 'start';
}

export interface ClientRectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** クライアント座標を、キャンバスの CSS ピクセル座標に変換する */
export function toCanvasPoint(
  clientX: number,
  clientY: number,
  rect: ClientRectLike,
  canvasWidth: number,
  canvasHeight: number,
): { x: number; y: number } {
  const sx = rect.width > 0 ? canvasWidth / rect.width : 1;
  const sy = rect.height > 0 ? canvasHeight / rect.height : 1;
  return { x: (clientX - rect.left) * sx, y: (clientY - rect.top) * sy };
}

export interface StrokePoint {
  x: number;
  y: number;
  width: number;
}

export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * ストロークが描画されうる範囲を、内部解像度のピクセル単位で返す。
 * アンチエイリアスの分として 1 CSS ピクセルの余白を含め、キャンバスの範囲に切り詰める。
 */
export function strokeBounds(
  points: readonly StrokePoint[],
  canvas: { width: number; height: number; pixelRatio: number },
): PixelRect | null {
  if (points.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    const r = p.width / 2;
    minX = Math.min(minX, p.x - r);
    minY = Math.min(minY, p.y - r);
    maxX = Math.max(maxX, p.x + r);
    maxY = Math.max(maxY, p.y + r);
  }
  const pr = canvas.pixelRatio;
  const pw = Math.round(canvas.width * pr);
  const ph = Math.round(canvas.height * pr);
  const clamp = (v: number, max: number) => Math.min(max, Math.max(0, v));
  const x0 = clamp(Math.floor((minX - 1) * pr), pw);
  const y0 = clamp(Math.floor((minY - 1) * pr), ph);
  const x1 = clamp(Math.ceil((maxX + 1) * pr), pw);
  const y1 = clamp(Math.ceil((maxY + 1) * pr), ph);
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}
