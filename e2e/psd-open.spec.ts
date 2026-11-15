// PSD の読み込み(docs/specs/psd.md の「読み込み」)
import { expect, test, type Page } from '@playwright/test';
import { encodePsd } from '../src/format/psd/encode';
import { solidImage, writePsdBytes } from '../test/helpers/psd';
import { events, expectColor, pixel, recordEvents, setup, type RGBA } from './helpers/paint';
import { drawStroke } from './helpers/pointer';

const RED: RGBA = [255, 0, 0, 255];
const BLUE: RGBA = [0, 0, 255, 255];

declare global {
  interface Window {
    __psd: Blob;
  }
}

/** テスト側(Node)で作った PSD のバイト列を、window.__psd に Blob として渡す */
async function givePsd(page: Page, bytes: Uint8Array) {
  await page.evaluate((data) => {
    window.__psd = new Blob([new Uint8Array(data)], { type: 'image/vnd.adobe.photoshop' });
  }, Array.from(bytes));
}

/** 現在の状態の要約(状態が変わっていないことの確認用) */
async function snapshot(page: Page) {
  return page.evaluate(() => {
    const p = window.paint79;
    const c = p.getCanvas();
    return {
      layers: p.getLayers(),
      background: p.getBackground(),
      size: [c.width, c.height],
      canUndo: p.canUndo(),
    };
  });
}

/** encodePsd で、不透明な 1 枚のレイヤー(または 0 枚)を持つ PSD を作る */
function simplePsd(width: number, height: number, layers: number, color: RGBA = BLUE) {
  const rgba = solidImage(width, height, color).data;
  return encodePsd({
    width,
    height,
    dpi: 72,
    activeIndex: 0,
    composite: rgba,
    layers: Array.from({ length: layers }, (_, i) => ({
      name: `L${i}`,
      visible: true,
      opacity: 1,
      blendMode: 'normal' as const,
      locked: false,
      rgba,
    })),
  });
}

/** encodePsd の出力で、最初のレイヤーのレコードの位置 */
function firstLayerRecordOffset(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 26;
  p += 4 + view.getUint32(p);
  p += 4 + view.getUint32(p);
  return p + 4 + 4 + 2;
}

/** 赤い線を描いた「赤」レイヤーと、空の「上」レイヤーを持つ絵を、window.__psd に PSD として書き出す */
async function exportSample(page: Page, background: string | null = '#ffff00') {
  await setup(page, { width: 100, height: 80, background });
  await page.evaluate(() => {
    window.paint79.setLineWidth(20);
    window.paint79.setColor('#ff0000');
  });
  await drawStroke(page, [
    [0, 20],
    [100, 20],
  ]);
  await page.evaluate(async () => {
    const p = window.paint79;
    p.setLayerProperties(p.getActiveLayerId(), { name: '赤', opacity: 0.5, blendMode: 'multiply' });
    p.addLayer({ name: '上', locked: true });
    window.__psd = await p.exportPSD();
  });
}

test.describe('open(PSD)', () => {
  test('exportPSD() で書き出した PSD のレイヤーを読み込む', async ({ page }) => {
    await exportSample(page);
    const r = await page.evaluate(async () => {
      const div = document.createElement('div');
      document.body.appendChild(div);
      const other = new window.Paint79(div, { pixelRatio: 1, width: 10, height: 10 });
      window.paint79 = other;
      const result = await other.open(window.__psd);
      return {
        result,
        layers: other.getLayers().map((l) => ({
          name: l.name,
          visible: l.visible,
          opacity: l.opacity,
          locked: l.locked,
          blendMode: l.blendMode,
        })),
      };
    });
    expect(r.result).toEqual({ restored: true });
    expect(r.layers).toEqual([
      { name: '背景', visible: true, opacity: 1, locked: false, blendMode: 'normal' },
      { name: '赤', visible: true, opacity: 128 / 255, locked: false, blendMode: 'multiply' },
      { name: '上', visible: true, opacity: 1, locked: true, blendMode: 'normal' },
    ]);
    // 黄色の背景レイヤーに、不透明度 0.5 の赤を乗算 → (255, 128, 0)
    expectColor(await pixel(page, 50, 20), [255, 128, 0, 255], 3);
    expectColor(await pixel(page, 50, 60), [255, 255, 0, 255]);
  });

  test('背景色は null になり、アクティブレイヤー・キャンバスサイズを復元し、履歴を破棄する', async ({
    page,
  }) => {
    await exportSample(page);
    await page.evaluate(() => window.paint79.addLayer()); // アンドゥできる操作を作る
    await recordEvents(page, ['change', 'layerchange']);
    const r = await page.evaluate(async () => {
      const p = window.paint79;
      p.setBackground('#00ff00');
      p.resize(10, 10);
      await p.open(window.__psd);
      const c = p.getCanvas();
      const active = p.getLayers().find((l) => l.id === p.getActiveLayerId())!;
      return {
        background: p.getBackground(),
        active: active.name,
        size: [c.style.width, c.style.height, c.width, c.height],
        canUndo: p.canUndo(),
      };
    });
    expect(r).toEqual({
      background: null,
      active: '赤', // 書き出したときのアクティブレイヤー
      size: ['100px', '80px', 100, 80],
      canUndo: false,
    });
    const names = (await events(page)).map((e) => e.name);
    expect(names).toContain('change');
    expect(names).toContain('layerchange');
  });

  test('キャンバスサイズは PSD のピクセルサイズ ÷ pixelRatio', async ({ page }) => {
    await setup(page, { width: 10, height: 10, pixelRatio: 2 });
    await givePsd(page, simplePsd(100, 80, 1));
    const size = await page.evaluate(async () => {
      await window.paint79.open(window.__psd);
      const c = window.paint79.getCanvas();
      return [c.style.width, c.style.height, c.width, c.height];
    });
    expect(size).toEqual(['50px', '40px', 100, 80]);
  });

  test('グループを解体し、マスクを透明度に適用して、レイヤーを 1 枚ずつ読み込む', async ({
    page,
  }) => {
    await setup(page, { width: 10, height: 10 });
    await givePsd(
      page,
      writePsdBytes({
        width: 4,
        height: 4,
        children: [
          { name: '赤', imageData: solidImage(4, 4, [255, 0, 0, 255]) },
          {
            name: 'グループ',
            hidden: true,
            children: [{ name: '青', imageData: solidImage(4, 4, [0, 0, 255, 255]) }],
          },
          {
            name: 'マスク付き',
            left: 2,
            top: 0,
            imageData: solidImage(2, 4, [0, 255, 0, 255]),
            // (2, 0) から 2 x 2 の範囲だけ見せる(範囲外は隠す)
            mask: {
              left: 2,
              top: 0,
              right: 4,
              bottom: 2,
              defaultColor: 0,
              imageData: solidImage(2, 2, [255, 255, 255, 255]),
            },
          },
        ],
      }),
    );
    const r = await page.evaluate(async () => {
      const result = await window.paint79.open(window.__psd);
      return { result, layers: window.paint79.getLayers().map((l) => [l.name, l.visible]) };
    });
    expect(r.result).toEqual({ restored: true });
    expect(r.layers).toEqual([
      ['赤', true],
      ['青', false], // 非表示のグループの中
      ['マスク付き', true],
    ]);
    expectColor(await pixel(page, 0, 0), RED);
    expectColor(await pixel(page, 3, 1), [0, 255, 0, 255]); // マスクの内側
    expectColor(await pixel(page, 3, 3), RED); // マスクの外側は隠れて、下の赤が見える
  });

  test('レイヤーを持たない PSD は、統合画像を 1 枚のレイヤーとして読み込む(no-data)。背景色は変更しない', async ({
    page,
  }) => {
    await setup(page, { width: 10, height: 10, background: '#00ff00' });
    await givePsd(page, simplePsd(20, 10, 0));
    const r = await page.evaluate(async () => {
      const result = await window.paint79.open(window.__psd);
      return {
        result,
        layers: window.paint79.getLayers().map((l) => l.name),
        background: window.paint79.getBackground(),
      };
    });
    expect(r).toEqual({
      result: { restored: false, reason: 'no-data' },
      layers: ['レイヤー 1'],
      background: '#00ff00',
    });
    expectColor(await pixel(page, 19, 9), BLUE);
  });

  test('レイヤーの画像データを読み込めない場合は、統合画像を 1 枚のレイヤーとして読み込む(corrupted)', async ({
    page,
  }) => {
    await setup(page, { width: 10, height: 10 });
    const bytes = simplePsd(20, 10, 1).slice();
    // レイヤーの範囲を 30000 x 30000 と偽り、展開に必要なメモリを上限超えにする
    const view = new DataView(bytes.buffer);
    const at = firstLayerRecordOffset(bytes);
    view.setInt32(at + 8, 30000);
    view.setInt32(at + 12, 30000);
    await givePsd(page, bytes);
    const r = await page.evaluate(async () => {
      const result = await window.paint79.open(window.__psd);
      return { result, layers: window.paint79.getLayers().map((l) => l.name) };
    });
    expect(r).toEqual({ result: { restored: false, reason: 'corrupted' }, layers: ['レイヤー 1'] });
    expectColor(await pixel(page, 5, 5), BLUE);
  });

  test('対応しないカラーモード(Lab)は Error で reject し、状態を変更しない', async ({ page }) => {
    await setup(page, { width: 30, height: 20 });
    const bytes = simplePsd(4, 3, 1).slice();
    bytes[25] = 9; // カラーモードを Lab に
    await givePsd(page, bytes);
    const before = await snapshot(page);
    const error = await page.evaluate(() =>
      window.paint79.open(window.__psd).then(
        () => null,
        (e: Error) => e.constructor.name,
      ),
    );
    expect(error).toBe('Error');
    expect(await snapshot(page)).toEqual(before);
  });

  test('ピクセル数の合計が上限を超える場合は、画像を展開する前に Error で reject し、状態を変更しない', async ({
    page,
  }) => {
    await setup(page, { width: 30, height: 20 });
    // 空のレイヤー 2 枚の小さな PSD の、ヘッダーの大きさだけを 20000 x 8000 に書き換える
    // (2 枚 × 1 億 6,000 万ピクセル > 268,435,456)
    const empty = new Uint8ClampedArray(4 * 3 * 4);
    const bytes = encodePsd({
      width: 4,
      height: 3,
      dpi: 72,
      activeIndex: 0,
      composite: empty,
      layers: ['A', 'B'].map((name) => ({
        name,
        visible: true,
        opacity: 1,
        blendMode: 'normal' as const,
        locked: false,
        rgba: empty,
      })),
    }).slice();
    const view = new DataView(bytes.buffer);
    view.setUint32(14, 8000); // 高さ
    view.setUint32(18, 20000); // 幅
    await givePsd(page, bytes);
    const before = await snapshot(page);
    const message = await page.evaluate(() =>
      window.paint79.open(window.__psd).then(
        () => null,
        (e: Error) => e.message,
      ),
    );
    expect(message).toContain('上限');
    expect(await snapshot(page)).toEqual(before);
  });

  test('読み込みの途中で destroy() された場合は Error で reject する', async ({ page }) => {
    await exportSample(page);
    const error = await page.evaluate(() => {
      const promise = window.paint79.open(window.__psd);
      // Blob の読み出しを待っている間に破棄する
      window.paint79.destroy();
      return promise.then(
        () => null,
        (e: Error) => e.message,
      );
    });
    expect(error).toContain('destroy()');
  });
});
