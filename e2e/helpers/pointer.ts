// E2E テスト用ヘルパー: ポインター入力の再現
// Playwright のマウス API ではタッチ・ペン・筆圧を再現できないため、PointerEvent を合成して送出する。
import type { Page } from '@playwright/test';

export type PointerKind = 'mouse' | 'touch' | 'pen';

export interface PointerOptions {
  pointerType?: PointerKind;
  pointerId?: number;
  pressure?: number;
}

export interface StrokeOptions extends PointerOptions {
  /** 最後に pointerup の代わりに pointercancel を送出する */
  cancel?: boolean;
  /** pointerup / pointercancel を送出しない(描画中の状態を保つ) */
  keepDown?: boolean;
}

/** [x, y] または [x, y, 筆圧] */
export type Point = [number, number] | [number, number, number];

type EventType = 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel';

interface RawEvent {
  type: EventType;
  x: number;
  y: number;
  pressure: number;
  pointerType: PointerKind;
  pointerId: number;
}

/** 合成した PointerEvent を、表示用 canvas に順に送出する */
async function dispatch(page: Page, events: RawEvent[]): Promise<void> {
  await page.evaluate((events) => {
    const canvas = window.paint79.getCanvas();
    const rect = canvas.getBoundingClientRect();
    for (const e of events) {
      canvas.dispatchEvent(
        new PointerEvent(e.type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          pointerId: e.pointerId,
          pointerType: e.pointerType,
          isPrimary: true,
          clientX: rect.left + e.x,
          clientY: rect.top + e.y,
          pressure: e.pressure,
          button: e.type === 'pointerdown' || e.type === 'pointerup' ? 0 : -1,
          buttons: e.type === 'pointerdown' || e.type === 'pointermove' ? 1 : 0,
        }),
      );
    }
  }, events);
}

function resolve(options: PointerOptions) {
  const pointerType = options.pointerType ?? 'mouse';
  const pointerId = options.pointerId ?? (pointerType === 'mouse' ? 1 : 2);
  return { pointerType, pointerId };
}

/** 単発のポインターイベントを送出する */
export async function sendPointer(
  page: Page,
  type: EventType,
  point: Point,
  options: PointerOptions = {},
): Promise<void> {
  const { pointerType, pointerId } = resolve(options);
  const pressure = point[2] ?? options.pressure ?? (type === 'pointerup' ? 0 : 0.5);
  await dispatch(page, [{ type, x: point[0], y: point[1], pressure, pointerType, pointerId }]);
}

/** キャンバス上の CSS ピクセル座標の列に沿って、ストロークを描く */
export async function drawStroke(
  page: Page,
  points: Point[],
  options: StrokeOptions = {},
): Promise<void> {
  const { pointerType, pointerId } = resolve(options);
  const pressureOf = (p: Point) => p[2] ?? options.pressure ?? 0.5;
  const events: RawEvent[] = points.map((p, i) => ({
    type: i === 0 ? 'pointerdown' : 'pointermove',
    x: p[0],
    y: p[1],
    pressure: pressureOf(p),
    pointerType,
    pointerId,
  }));
  if (!options.keepDown) {
    const last = points[points.length - 1]!;
    events.push({
      type: options.cancel ? 'pointercancel' : 'pointerup',
      x: last[0],
      y: last[1],
      pressure: 0,
      pointerType,
      pointerId,
    });
  }
  await dispatch(page, events);
}
