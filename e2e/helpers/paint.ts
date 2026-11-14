// E2E テスト用ヘルパー: テスト用ページの準備と、ピクセルの取得
import { expect, type Page } from '@playwright/test';
import type Paint79Class from '../../src/index';
import type { Paint79Options } from '../../src/index';

declare global {
  interface Window {
    Paint79: typeof Paint79Class;
    paint79: Paint79Class;
    __ready: boolean;
    __events: { name: string; event: unknown }[];
  }
}

export type RGBA = [number, number, number, number];

export const WHITE: RGBA = [255, 255, 255, 255];
export const BLACK: RGBA = [0, 0, 0, 255];
export const TRANSPARENT: RGBA = [0, 0, 0, 0];

/** テスト用ページを開き、Paint79 のインスタンスを window.paint79 として作る */
export async function setup(page: Page, options: Paint79Options = {}): Promise<void> {
  await page.goto('/e2e/pages/index.html');
  await page.waitForFunction(() => window.__ready === true);
  await page.evaluate(
    (opts) => {
      window.paint79 = new window.Paint79(document.getElementById('paint-area')!, opts);
    },
    { pixelRatio: 1, ...options },
  );
}

/** 指定したイベントを window.__events に記録する */
export async function recordEvents(page: Page, names: string[]): Promise<void> {
  await page.evaluate((names) => {
    window.__events = [];
    for (const name of names) {
      window.paint79.on(name as never, (event: unknown) => window.__events.push({ name, event }));
    }
  }, names);
}

export async function events(page: Page): Promise<{ name: string; event: unknown }[]> {
  return page.evaluate(() => window.__events);
}

/** 表示用 canvas の、CSS ピクセル座標 (x, y) のピクセル値を返す */
export async function pixel(page: Page, x: number, y: number): Promise<RGBA> {
  return page.evaluate(
    ({ x, y }) => {
      const canvas = window.paint79.getCanvas();
      const ratio = canvas.width / parseFloat(canvas.style.width);
      const ctx = canvas.getContext('2d')!;
      const d = ctx.getImageData(Math.floor(x * ratio), Math.floor(y * ratio), 1, 1).data;
      return [d[0], d[1], d[2], d[3]] as RGBA;
    },
    { x, y },
  );
}

/** ページ内の式が返す Blob(画像)をデコードし、ピクセル座標 (x, y) の値を返す */
export async function blobPixel(page: Page, blobExpression: string, x: number, y: number) {
  return page.evaluate(
    async ([expr, x, y]) => {
      const blob = (await (0, eval)(expr)) as Blob;
      const bitmap = await createImageBitmap(blob, {
        premultiplyAlpha: 'none',
        colorSpaceConversion: 'none',
      });
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      const d = ctx.getImageData(x, y, 1, 1).data;
      return [d[0], d[1], d[2], d[3]] as RGBA;
    },
    [blobExpression, x, y] as const,
  );
}

/** 色が許容誤差の範囲で一致することを検証する */
export function expectColor(actual: RGBA, expected: RGBA, tolerance = 8): void {
  const ok = actual.every((v, i) => Math.abs(v - expected[i]!) <= tolerance);
  expect(ok, `expected rgba(${expected.join(', ')}) but got rgba(${actual.join(', ')})`).toBe(true);
}
