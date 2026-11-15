// E2E テスト用ヘルパー: ページで書き出した PSD を、テストの実行側(Node)で ag-psd を使って解析する
import type { Page } from '@playwright/test';
import type { Layer, Psd } from 'ag-psd';
import { readPsdBytes } from '../../test/helpers/psd';
import type { RGBA } from './paint';

export interface ExportedPsd {
  type: string;
  bytes: Uint8Array;
  psd: Psd;
}

/** ページ内の式が返す Blob(PSD)を取り出して解析する */
export async function exportedPsd(
  page: Page,
  blobExpression = 'window.paint79.exportPSD()',
): Promise<ExportedPsd> {
  const r = await page.evaluate(async (expr) => {
    const blob = (await (0, eval)(expr)) as Blob;
    return { type: blob.type, data: Array.from(new Uint8Array(await blob.arrayBuffer())) };
  }, blobExpression);
  const bytes = new Uint8Array(r.data);
  return { type: r.type, bytes, psd: readPsdBytes(bytes) };
}

/** 画像の、画像内の座標 (x, y) の画素 */
function imagePixel(image: { data: ArrayLike<number>; width: number }, x: number, y: number): RGBA {
  const i = (y * image.width + x) * 4;
  return [image.data[i]!, image.data[i + 1]!, image.data[i + 2]!, image.data[i + 3]!];
}

/**
 * レイヤーの、キャンバスのピクセル座標 (x, y) の画素。PSD のレイヤーは透明でない範囲に
 * 切り詰められているため、範囲外は透明とみなす
 */
export function layerPixel(layer: Layer, x: number, y: number): RGBA {
  const { left = 0, top = 0, right = 0, bottom = 0 } = layer;
  if (x < left || x >= right || y < top || y >= bottom || !layer.imageData) return [0, 0, 0, 0];
  return imagePixel(layer.imageData, x - left, y - top);
}

/** 統合画像の、ピクセル座標 (x, y) の画素 */
export function compositePixel(psd: Psd, x: number, y: number): RGBA {
  return imagePixel(psd.imageData!, x, y);
}
