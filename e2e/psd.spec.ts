// PSD の書き出し(docs/specs/psd.md)
import { expect, test, type Page } from '@playwright/test';
import { BLACK, expectColor, setup, TRANSPARENT, WHITE, type RGBA } from './helpers/paint';
import { drawStroke, sendPointer } from './helpers/pointer';
import { compositePixel, exportedPsd, layerPixel } from './helpers/psd';

const RED: RGBA = [255, 0, 0, 255];
const BLUE: RGBA = [0, 0, 255, 255];
const YELLOW: RGBA = [255, 255, 0, 255];

/**
 * 3 枚のレイヤー(赤: y = 20 に赤い線、ロック / 青: y = 60 に青い線、不透明度 0.5、乗算 /
 * 非表示: 空、非表示)を持つ絵を描く。アクティブレイヤーは「青」
 */
async function drawSample(page: Page) {
  await page.evaluate(() => {
    const p = window.paint79;
    p.setLineWidth(20);
    p.setColor('#ff0000');
  });
  await drawStroke(page, [
    [0, 20],
    [100, 20],
  ]);
  await page.evaluate(() => {
    const p = window.paint79;
    p.setLayerProperties(p.getActiveLayerId(), { name: '赤', locked: true });
    const id = p.addLayer({ name: '青', opacity: 0.5, blendMode: 'multiply' });
    p.setActiveLayer(id);
    p.setColor('#0000ff');
  });
  await drawStroke(page, [
    [0, 60],
    [100, 60],
  ]);
  await page.evaluate(() => {
    window.paint79.addLayer({ name: '非表示', visible: false, index: 2 });
  });
}

test.describe('exportPSD', () => {
  test('MIME タイプ image/vnd.adobe.photoshop の PSD を返す', async ({ page }) => {
    await setup(page, { width: 100, height: 80 });
    const { type, bytes, psd } = await exportedPsd(page);
    expect(type).toBe('image/vnd.adobe.photoshop');
    expect(new TextDecoder().decode(bytes.subarray(0, 4))).toBe('8BPS');
    expect([psd.width, psd.height]).toEqual([100, 80]);
  });

  test('レイヤーの順序・名前・属性・画素を書き出す', async ({ page }) => {
    // 背景色の既定値は白なので、背景レイヤーを加えないよう null にする
    await setup(page, { width: 100, height: 80, background: null });
    await drawSample(page);
    const { psd } = await exportedPsd(page);
    const layers = psd.children!;
    expect(layers.map((l) => l.name)).toEqual(['赤', '青', '非表示']);
    const [red, blue, hidden] = layers;

    expect(red!.protected?.composite).toBe(true);
    expect(red!.blendMode).toBe('normal');
    expectColor(layerPixel(red!, 50, 20), RED);
    expectColor(layerPixel(red!, 50, 60), TRANSPARENT);

    expect(blue!.protected?.composite ?? false).toBe(false);
    expect(blue!.blendMode).toBe('multiply');
    expect(Math.round(blue!.opacity! * 255)).toBe(128);
    expect(blue!.hidden).toBe(false);
    expectColor(layerPixel(blue!, 50, 60), BLUE);

    expect(hidden!.hidden).toBe(true);
    expect([hidden!.right, hidden!.bottom]).toEqual([0, 0]); // 空のレイヤー

    // アクティブレイヤー(青)
    expect(psd.imageResources!.layerState).toBe(1);
  });

  test('統合画像は完成イメージ', async ({ page }) => {
    await setup(page, { width: 100, height: 80, background: '#ffff00' });
    await drawSample(page);
    const { psd } = await exportedPsd(page);
    expect(psd.channels).toBe(3); // 背景色があるので、すべて不透明
    expectColor(compositePixel(psd, 50, 20), RED);
    expectColor(compositePixel(psd, 50, 5), YELLOW);
    // 黄色の背景に、不透明度 0.5 の青を乗算 → (128, 128, 0)
    expectColor(compositePixel(psd, 50, 60), [128, 128, 0, 255], 3);
  });

  test('背景色は、最背面の「背景」レイヤーとして書き出す', async ({ page }) => {
    await setup(page, { width: 100, height: 80, background: '#ffff00' });
    await drawSample(page);
    const { psd } = await exportedPsd(page);
    const layers = psd.children!;
    expect(layers.map((l) => l.name)).toEqual(['背景', '赤', '青', '非表示']);
    const bg = layers[0]!;
    expect([bg.left, bg.top, bg.right, bg.bottom]).toEqual([0, 0, 100, 80]);
    expect(bg.hidden).toBe(false);
    expect(bg.opacity).toBe(1);
    expect(bg.blendMode).toBe('normal');
    expect(bg.protected?.composite ?? false).toBe(false);
    expectColor(layerPixel(bg, 0, 0), YELLOW);
    expectColor(layerPixel(bg, 99, 79), YELLOW);
    // 背景レイヤーの分だけ、アクティブレイヤー(青)のインデックスがずれる
    expect(psd.imageResources!.layerState).toBe(2);
  });

  test('背景色が null の場合は、背景レイヤーを加えず、統合画像は透明度を持つ', async ({ page }) => {
    await setup(page, { width: 100, height: 80, background: null });
    await drawSample(page);
    const { psd } = await exportedPsd(page);
    expect(psd.children!.map((l) => l.name)).toEqual(['赤', '青', '非表示']);
    expect(psd.channels).toBe(4);
    expect(compositePixel(psd, 50, 5)[3]).toBe(0);
    expectColor(compositePixel(psd, 50, 20), RED);
  });

  test('ピクセルサイズは width × pixelRatio、解像度は 72 × pixelRatio ppi', async ({ page }) => {
    await setup(page, { width: 100, height: 80, pixelRatio: 2 });
    const { psd } = await exportedPsd(page);
    expect([psd.width, psd.height]).toEqual([200, 160]);
    expect(psd.imageResources!.resolutionInfo!.horizontalResolution).toBe(144);
    expect(psd.imageResources!.resolutionInfo!.verticalResolution).toBe(144);
  });

  test('sRGB の ICC プロファイルを埋め込む', async ({ page }) => {
    await setup(page, { width: 10, height: 10 });
    const { psd } = await exportedPsd(page);
    const icc = psd.imageResources!.iccProfile!;
    expect(new TextDecoder().decode(icc.subarray(36, 40))).toBe('acsp');
  });

  test('書き出す内容は、呼び出した時点の状態', async ({ page }) => {
    await setup(page, { width: 100, height: 80, background: '#ffffff' });
    await drawSample(page);
    await page.evaluate(() => {
      // Promise が解決する前にドキュメントを変更する
      (window as unknown as { __psd: Promise<Blob> }).__psd = window.paint79.exportPSD();
      const p = window.paint79;
      p.setBackground('#000000');
      p.addLayer({ name: '後から追加' });
      p.clear();
    });
    const { psd } = await exportedPsd(page, '(window).__psd');
    expect(psd.children!.map((l) => l.name)).toEqual(['背景', '赤', '青', '非表示']);
    expectColor(compositePixel(psd, 50, 5), WHITE);
    expectColor(compositePixel(psd, 50, 20), RED);
  });

  test('描画中のストロークを含めない', async ({ page }) => {
    await setup(page, { width: 100, height: 100, lineWidth: 6, background: '#ffffff' });
    await drawStroke(
      page,
      [
        [10, 70],
        [50, 70],
      ],
      { keepDown: true },
    );
    const during = await exportedPsd(page);
    expectColor(compositePixel(during.psd, 30, 70), WHITE);
    expectColor(layerPixel(during.psd.children![1]!, 30, 70), TRANSPARENT);
    // 描き終えた後は含める
    await sendPointer(page, 'pointerup', [50, 70]);
    const after = await exportedPsd(page);
    expectColor(compositePixel(after.psd, 30, 70), BLACK);
    expectColor(layerPixel(after.psd.children![1]!, 30, 70), BLACK);
  });

  test('ピクセルサイズの幅または高さが 30,000 を超える場合は RangeError', async ({ page }) => {
    await setup(page, { width: 30001, height: 1 });
    const error = await page.evaluate(() =>
      window.paint79.exportPSD().then(
        () => null,
        (e: Error) => e.constructor.name,
      ),
    );
    expect(error).toBe('RangeError');
  });

  test('destroy() の後に呼び出すと Error', async ({ page }) => {
    await setup(page, { width: 10, height: 10 });
    const error = await page.evaluate(() => {
      window.paint79.destroy();
      return window.paint79.exportPSD().then(
        () => null,
        (e: Error) => e.constructor.name,
      );
    });
    expect(error).toBe('Error');
  });
});
