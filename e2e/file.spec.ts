// 保存・読み込み(docs/specs/api.md の「保存・読み込み」、docs/specs/file-format.md)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import {
  BLACK,
  blobPixel,
  events,
  expectColor,
  pixel,
  recordEvents,
  setup,
  TRANSPARENT,
  WHITE,
} from './helpers/paint';
import { drawStroke } from './helpers/pointer';
import type * as PngModule from '../src/format/png';

const RED: [number, number, number, number] = [255, 0, 0, 255];
const BLUE: [number, number, number, number] = [0, 0, 255, 255];

declare global {
  interface Window {
    __blob: Blob;
    __png: typeof PngModule;
    /** 単色で塗りつぶした PNG を作る */
    __solidPng: (w: number, h: number, color: string) => Promise<Blob>;
  }
}

/** テストデータを組み立てるための関数をページに用意する */
async function prepareHelpers(page: Page) {
  await page.evaluate(async () => {
    window.__png = await import('/src/format/png.ts' as string);
    window.__solidPng = (w, h, color) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, w, h);
      return new Promise((resolve) => c.toBlob((b) => resolve(b!), 'image/png'));
    };
  });
}

/** 2 枚のレイヤーを持つ絵を描き、window.__blob に Paint79 PNG として書き出す */
async function drawSampleAndExport(page: Page) {
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
  await page.evaluate(async () => {
    window.paint79.addLayer({ name: '非表示', visible: false, index: 2 });
    window.paint79.setBackground('#ffff00');
    window.__blob = await window.paint79.exportPNG();
  });
}

test.describe('exportPNG', () => {
  test('完成イメージに paNT チャンクを埋め込んだ PNG を返す', async ({ page }) => {
    await setup(page, { width: 100, height: 80 });
    await prepareHelpers(page);
    await drawSampleAndExport(page);
    const r = await page.evaluate(async () => {
      const bytes = new Uint8Array(await window.__blob.arrayBuffer());
      return {
        type: window.__blob.type,
        chunks: window.__png.readChunks(bytes).map((c) => c.type),
        hasData: await window.Paint79.hasData(window.__blob),
        unsafe: window.__png.hasUnsafeToCopyPrivateChunk(bytes),
      };
    });
    expect(r.type).toBe('image/png');
    expect(r.chunks[0]).toBe('IHDR');
    expect(r.chunks.slice(-2)).toEqual(['paNT', 'IEND']);
    expect(r.hasData).toBe(true);
    expect(r.unsafe).toBe(true);
  });

  test('画像本体は背景色と表示中のレイヤーを統合した完成イメージ', async ({ page }) => {
    await setup(page, { width: 100, height: 80 });
    await prepareHelpers(page);
    await drawSampleAndExport(page);
    expectColor(await blobPixel(page, 'window.__blob', 50, 20), RED);
    expectColor(await blobPixel(page, 'window.__blob', 50, 5), [255, 255, 0, 255]);
    // 黄色の背景に、不透明度 0.5 の青を乗算 → (128, 128, 0)
    expectColor(await blobPixel(page, 'window.__blob', 50, 60), [128, 128, 0, 255], 3);
  });

  test('ピクセルサイズは width × pixelRatio', async ({ page }) => {
    await setup(page, { width: 100, height: 80, pixelRatio: 2 });
    const size = await page.evaluate(async () => {
      const b = await createImageBitmap(await window.paint79.exportPNG());
      return [b.width, b.height];
    });
    expect(size).toEqual([200, 160]);
  });

  test('embedData: false ではレイヤー情報を含まない', async ({ page }) => {
    await setup(page, { width: 100, height: 80 });
    await prepareHelpers(page);
    await drawSampleAndExport(page);
    const r = await page.evaluate(async () => {
      window.__blob = await window.paint79.exportPNG({ embedData: false });
      return {
        hasData: await window.Paint79.hasData(window.__blob),
        chunks: window.__png
          .readChunks(new Uint8Array(await window.__blob.arrayBuffer()))
          .map((c) => c.type),
      };
    });
    expect(r.hasData).toBe(false);
    expect(r.chunks).not.toContain('paNT');
    expectColor(await blobPixel(page, 'window.__blob', 50, 20), RED);
  });
});

test.describe('open', () => {
  test('Paint79 PNG からレイヤー、属性、アクティブレイヤー、サイズ、背景色を復元する', async ({
    page,
  }) => {
    await setup(page, { width: 100, height: 80 });
    await prepareHelpers(page);
    await drawSampleAndExport(page);
    const before = await page.evaluate(() => ({
      layers: window.paint79.getLayers(),
      active: window.paint79.getActiveLayerId(),
    }));

    const after = await page.evaluate(async () => {
      window.paint79.destroy();
      window.paint79 = new window.Paint79(document.getElementById('paint-area')!, {
        width: 30,
        height: 30,
        pixelRatio: 1,
      });
      const result = await window.paint79.open(window.__blob);
      const c = window.paint79.getCanvas();
      return {
        result,
        layers: window.paint79.getLayers(),
        active: window.paint79.getActiveLayerId(),
        background: window.paint79.getBackground(),
        size: [c.style.width, c.style.height],
        canUndo: window.paint79.canUndo(),
      };
    });
    expect(after.result).toEqual({ restored: true });
    expect(after.layers).toEqual(before.layers);
    expect(after.active).toBe(before.active);
    expect(after.background).toBe('#ffff00');
    expect(after.size).toEqual(['100px', '80px']);
    expect(after.canUndo).toBe(false);

    expectColor(await pixel(page, 50, 20), RED);
    expectColor(await pixel(page, 50, 60), [128, 128, 0, 255], 3);
    // 各レイヤーの内容が個別に復元されている
    await page.evaluate(() => {
      const p = window.paint79;
      p.setLayerProperties(p.getLayers()[0]!.id, { visible: false });
      p.setLayerProperties(p.getLayers()[1]!.id, { opacity: 1, blendMode: 'normal' });
    });
    expectColor(await pixel(page, 50, 60), BLUE);
    expectColor(await pixel(page, 50, 20), [255, 255, 0, 255]);
  });

  test('復元したレイヤーの続きに描画でき、レイヤーの通し番号はレイヤー数から数え直す', async ({
    page,
  }) => {
    await setup(page, { width: 100, height: 80 });
    await prepareHelpers(page);
    await drawSampleAndExport(page);
    const names = await page.evaluate(async () => {
      await window.paint79.open(window.__blob);
      window.paint79.addLayer();
      return window.paint79.getLayers().map((l) => l.name);
    });
    // 追加したレイヤーはアクティブレイヤー(青)の 1 つ上に入る
    expect(names).toEqual(['赤', '青', 'レイヤー 4', '非表示']);
  });

  test('pixelRatio が異なるインスタンスでも、拡大・縮小して読み込む', async ({ page }) => {
    await setup(page, { width: 100, height: 80, pixelRatio: 2 });
    await prepareHelpers(page);
    await drawSampleAndExport(page);
    await page.evaluate(async () => {
      window.paint79.destroy();
      window.paint79 = new window.Paint79(document.getElementById('paint-area')!, {
        pixelRatio: 1,
      });
      await window.paint79.open(window.__blob);
    });
    expect(await page.evaluate(() => window.paint79.getCanvas().width)).toBe(100);
    expectColor(await pixel(page, 50, 20), RED);
  });

  test('通常の画像は 1 枚のレイヤーとして読み込む(no-data)。背景色は変更しない', async ({
    page,
  }) => {
    await setup(page, { width: 100, height: 80, pixelRatio: 2, background: '#00ff00' });
    await prepareHelpers(page);
    const r = await page.evaluate(async () => {
      window.paint79.addLayer();
      const result = await window.paint79.open(await window.__solidPng(40, 20, '#ff0000'));
      const c = window.paint79.getCanvas();
      return {
        result,
        layers: window.paint79.getLayers().map((l) => l.name),
        size: [c.style.width, c.style.height, c.width, c.height],
        background: window.paint79.getBackground(),
      };
    });
    expect(r.result).toEqual({ restored: false, reason: 'no-data' });
    expect(r.layers).toEqual(['レイヤー 1']);
    expect(r.size).toEqual(['20px', '10px', 40, 20]);
    expect(r.background).toBe('#00ff00');
    expectColor(await pixel(page, 10, 5), RED);
  });

  test('完成イメージが変更されていれば image-modified で、現在の完成イメージを読み込む', async ({
    page,
  }) => {
    await setup(page, { width: 100, height: 80 });
    await prepareHelpers(page);
    await drawSampleAndExport(page);
    const r = await page.evaluate(async () => {
      const png = window.__png;
      const original = new Uint8Array(await window.__blob.arrayBuffer());
      const paNT = png.readChunks(original).find((c) => c.type === 'paNT')!;
      const other = new Uint8Array(
        await (await window.__solidPng(100, 80, '#0000ff')).arrayBuffer(),
      );
      const modified = png.insertChunkBeforeIEND(other, png.buildChunk('paNT', paNT.data));
      window.__blob = new Blob([modified], { type: 'image/png' });
      const result = await window.paint79.open(window.__blob);
      return { result, layers: window.paint79.getLayers().map((l) => l.name) };
    });
    expect(r.result).toEqual({ restored: false, reason: 'image-modified' });
    expect(r.layers).toEqual(['レイヤー 1']);
    expectColor(await pixel(page, 50, 20), BLUE);

    const forced = await page.evaluate(async () => {
      const result = await window.paint79.open(window.__blob, { ignoreMismatch: true });
      return { result, layers: window.paint79.getLayers().map((l) => l.name) };
    });
    expect(forced.result).toEqual({ restored: true });
    expect(forced.layers).toEqual(['赤', '青', '非表示']);
  });

  test('未対応の形式バージョンは unsupported-version、壊れたデータは corrupted', async ({
    page,
  }) => {
    await setup(page, { width: 100, height: 80 });
    await prepareHelpers(page);
    const r = await page.evaluate(async () => {
      const png = window.__png;
      const base = new Uint8Array(await (await window.__solidPng(10, 10, '#ff0000')).arrayBuffer());
      const withChunk = (version: number, body: string) => {
        const json = new TextEncoder().encode(body);
        const data = new Uint8Array(16 + json.length);
        data.set(new TextEncoder().encode('paint79\0'));
        new DataView(data.buffer).setUint32(8, version);
        new DataView(data.buffer).setUint32(12, json.length);
        data.set(json, 16);
        return png.insertChunkBeforeIEND(base, png.buildChunk('paNT', data));
      };
      return [
        await window.paint79.open(withChunk(99, '{}')),
        await window.paint79.open(withChunk(1, '{ broken')),
      ];
    });
    expect(r).toEqual([
      { restored: false, reason: 'unsupported-version' },
      { restored: false, reason: 'corrupted' },
    ]);
    expectColor(await pixel(page, 5, 5), RED);
  });

  test('Blob / File / ArrayBuffer / Uint8Array / URL 文字列を受け付ける', async ({ page }) => {
    await setup(page, { width: 100, height: 80 });
    await prepareHelpers(page);
    await drawSampleAndExport(page);
    const results = await page.evaluate(async () => {
      const blob = window.__blob;
      const buffer = await blob.arrayBuffer();
      const url = URL.createObjectURL(blob);
      const sources: unknown[] = [
        blob,
        new File([blob], 'a.png', { type: 'image/png' }),
        buffer,
        new Uint8Array(buffer),
        url,
      ];
      const out = [];
      for (const s of sources) out.push((await window.paint79.open(s as never)).restored);
      return out;
    });
    expect(results).toEqual([true, true, true, true, true]);
  });

  test('対応していない型は TypeError、デコードできない画像は Error。キャンバスの状態は変更しない', async ({
    page,
  }) => {
    await setup(page, { width: 100, height: 80 });
    await drawStroke(page, [
      [0, 40],
      [100, 40],
    ]);
    const r = await page.evaluate(async () => {
      const layersBefore = JSON.stringify(window.paint79.getLayers());
      const errors: string[] = [];
      for (const s of [123, new Uint8Array([1, 2, 3, 4])]) {
        try {
          await window.paint79.open(s as never);
          errors.push('no error');
        } catch (e) {
          errors.push((e as Error).name);
        }
      }
      return {
        errors,
        same: JSON.stringify(window.paint79.getLayers()) === layersBefore,
        canUndo: window.paint79.canUndo(),
      };
    });
    expect(r).toEqual({ errors: ['TypeError', 'Error'], same: true, canUndo: true });
    expectColor(await pixel(page, 50, 40), BLACK);
  });

  test('読み込むと change / layerchange / historychange が発生する', async ({ page }) => {
    await setup(page, { width: 100, height: 80 });
    await prepareHelpers(page);
    await drawStroke(page, [
      [0, 40],
      [100, 40],
    ]);
    await recordEvents(page, ['change', 'layerchange', 'historychange']);
    await page.evaluate(async () => {
      await window.paint79.open(await window.__solidPng(10, 10, '#ff0000'));
    });
    const names = (await events(page)).map((e) => e.name).sort();
    expect(names).toEqual(['change', 'historychange', 'layerchange']);
  });
});

test.describe('open(レビューで見つかった不具合の再発防止)', () => {
  test('現在のキャンバスより大きい通常の画像を開くと、画像全体を読み込む', async ({ page }) => {
    await setup(page, { width: 50, height: 50 });
    await prepareHelpers(page);
    await page.evaluate(async () => {
      await window.paint79.open(await window.__solidPng(200, 100, '#ff0000'));
    });
    expectColor(await pixel(page, 190, 90), RED);
    // 読み込み後、読み込んだ範囲の全体に描画できる
    await drawStroke(page, [
      [150, 50],
      [195, 50],
    ]);
    expectColor(await pixel(page, 170, 50), BLACK);
  });

  test('通常の画像を開いた後に書き出した Paint79 PNG は、レイヤー画像のサイズが完成イメージと一致する', async ({
    page,
  }) => {
    await setup(page, { width: 200, height: 200 });
    await prepareHelpers(page);
    const r = await page.evaluate(async () => {
      await window.paint79.open(await window.__solidPng(20, 10, '#ff0000'));
      const blob = await window.paint79.exportPNG();
      const other = new window.Paint79(document.createElement('div'), { pixelRatio: 1 });
      return other.open(blob);
    });
    expect(r).toEqual({ restored: true });
  });

  test('デコードできないレイヤー画像を含む場合は corrupted で、完成イメージを読み込む', async ({
    page,
  }) => {
    await setup(page, { width: 100, height: 80 });
    await prepareHelpers(page);
    const r = await page.evaluate(async () => {
      const png = window.__png;
      const base = new Uint8Array(await (await window.__solidPng(10, 10, '#ff0000')).arrayBuffer());
      const ihdr = png.readChunks(base).find((c) => c.type === 'IHDR')!;
      // サイズは完成イメージと同じだが、ビット深度が PNG の仕様上ありえない値(3)のレイヤー画像。
      // 画素データが壊れているだけの PNG は、ブラウザによっては空の画像としてデコードされるため、
      // どのブラウザでも確実にデコードに失敗するデータを使う
      const brokenIhdr = new Uint8Array(ihdr.data);
      brokenIhdr[8] = 3;
      const broken = new Uint8Array([
        ...base.subarray(0, 8),
        ...png.buildChunk('IHDR', brokenIhdr),
        ...png.buildChunk('IDAT', new Uint8Array([1, 2, 3, 4, 5])),
        ...png.buildChunk('IEND', new Uint8Array()),
      ]);
      const header = {
        width: 10,
        height: 10,
        pixelRatio: 1,
        background: '#ffffff',
        activeLayerId: 'a',
        compositeChecksum: png.compositeChecksum(base),
        layers: [
          {
            id: 'a',
            name: 'a',
            visible: true,
            opacity: 1,
            locked: false,
            blendMode: 'normal',
            offset: 0,
            length: broken.length,
          },
        ],
      };
      const json = new TextEncoder().encode(JSON.stringify(header));
      const data = new Uint8Array(16 + json.length + broken.length);
      data.set(new TextEncoder().encode('paint79\0'));
      new DataView(data.buffer).setUint32(8, 1);
      new DataView(data.buffer).setUint32(12, json.length);
      data.set(json, 16);
      data.set(broken, 16 + json.length);
      return window.paint79.open(png.insertChunkBeforeIEND(base, png.buildChunk('paNT', data)));
    });
    expect(r).toEqual({ restored: false, reason: 'corrupted' });
    expectColor(await pixel(page, 5, 5), RED);
  });
});

test.describe('loadImage(汚染された画像)', () => {
  test('別オリジンの画像を CORS の許可なしに読み込んだ場合は Error で、状態を変更しない', async ({
    page,
  }) => {
    await setup(page, { width: 100, height: 80 });
    await drawStroke(page, [
      [0, 40],
      [100, 40],
    ]);
    const r = await page.evaluate(async () => {
      // localhost で開いたページから見て、127.0.0.1 は別オリジン
      const img = new Image();
      img.src = `http://127.0.0.1:${location.port}/test/fixtures/paint79-v1.png`;
      await img.decode();
      const layers = window.paint79.getLayers().length;
      const errors: string[] = [];
      for (const options of [{ layerId: window.paint79.getActiveLayerId() }, undefined]) {
        try {
          await window.paint79.loadImage(img, options);
          errors.push('no error');
        } catch (e) {
          errors.push((e as Error).name);
        }
      }
      // 汚染されていなければ、書き出しができる
      const blob = await window.paint79.exportPNG();
      return {
        errors,
        sameLayers: window.paint79.getLayers().length === layers,
        exported: blob.size > 0,
        dataUrl: window.paint79.toDataURL().startsWith('data:image/png'),
      };
    });
    expect(r).toEqual({
      errors: ['Error', 'Error'],
      sameLayers: true,
      exported: true,
      dataUrl: true,
    });
    expectColor(await pixel(page, 50, 40), BLACK);
  });
});

test.describe('Paint79.hasData', () => {
  test('通常の PNG や PNG 以外のデータは false', async ({ page }) => {
    await setup(page);
    await prepareHelpers(page);
    const r = await page.evaluate(async () => [
      await window.Paint79.hasData(await window.__solidPng(4, 4, '#000')),
      await window.Paint79.hasData(new Uint8Array([1, 2, 3])),
      await window.Paint79.hasData(new ArrayBuffer(0)),
    ]);
    expect(r).toEqual([false, false, false]);
  });
});

test.describe('loadImage', () => {
  test('画像を新しいレイヤーとしてアクティブレイヤーの 1 つ上に読み込む。アンドゥできる', async ({
    page,
  }) => {
    await setup(page, { width: 100, height: 80, pixelRatio: 2 });
    await prepareHelpers(page);
    const r = await page.evaluate(async () => {
      const p = window.paint79;
      const active = p.getActiveLayerId();
      p.addLayer({ name: '最前面' });
      const id = await p.loadImage(await window.__solidPng(40, 20, '#ff0000'));
      return {
        id,
        names: p.getLayers().map((l) => l.id === id),
        active: p.getActiveLayerId() === active,
      };
    });
    expect(r.names).toEqual([false, true, false]);
    expect(r.active).toBe(true);
    // 画像の 1 ピクセルが内部解像度の 1 ピクセル(pixelRatio 2 なので CSS では 20 x 10)
    expectColor(await pixel(page, 15, 5), RED);
    expectColor(await pixel(page, 25, 5), WHITE);
    expectColor(await pixel(page, 15, 15), WHITE);

    await page.evaluate(() => window.paint79.undo());
    expect(await page.evaluate(() => window.paint79.getLayers().length)).toBe(2);
    expectColor(await pixel(page, 15, 5), WHITE);
  });

  test('layerId を指定すると既存のレイヤーに描画する', async ({ page }) => {
    await setup(page, { width: 100, height: 80 });
    await prepareHelpers(page);
    const count = await page.evaluate(async () => {
      const p = window.paint79;
      await p.loadImage(await window.__solidPng(10, 10, '#0000ff'), {
        layerId: p.getActiveLayerId(),
      });
      return p.getLayers().length;
    });
    expect(count).toBe(1);
    expectColor(await pixel(page, 5, 5), BLUE);
    await page.evaluate(() => window.paint79.undo());
    expectColor(await pixel(page, 5, 5), WHITE);
  });

  test('HTMLImageElement と ImageBitmap を受け付ける', async ({ page }) => {
    await setup(page, { width: 100, height: 80, background: null });
    await prepareHelpers(page);
    await page.evaluate(async () => {
      const blob = await window.__solidPng(10, 10, '#ff0000');
      const img = new Image();
      img.src = URL.createObjectURL(blob);
      await img.decode();
      // 新しいレイヤーはアクティブレイヤーの 1 つ上に入るので、前面に重ねるためにアクティブにする
      window.paint79.setActiveLayer(await window.paint79.loadImage(img));
      const bitmap = await createImageBitmap(await window.__solidPng(5, 5, '#0000ff'));
      await window.paint79.loadImage(bitmap);
    });
    expectColor(await pixel(page, 2, 2), BLUE);
    expectColor(await pixel(page, 8, 8), RED);
    expectColor(await pixel(page, 20, 20), TRANSPARENT);
  });
});

test.describe('toBlob / toDataURL', () => {
  test('完成イメージを指定した形式で書き出す', async ({ page }) => {
    await setup(page, { width: 100, height: 80 });
    await prepareHelpers(page);
    await drawSampleAndExport(page);
    const r = await page.evaluate(async () => {
      const jpeg = await window.paint79.toBlob('image/jpeg', 0.9);
      window.__blob = await window.paint79.toBlob();
      const bytes = new Uint8Array(await window.__blob.arrayBuffer());
      return {
        jpeg: jpeg.type,
        png: window.__blob.type,
        chunks: window.__png.readChunks(bytes).map((c) => c.type),
        dataUrl: window.paint79.toDataURL().slice(0, 22),
      };
    });
    expect(r.jpeg).toBe('image/jpeg');
    expect(r.png).toBe('image/png');
    expect(r.chunks).not.toContain('paNT');
    expect(r.dataUrl).toBe('data:image/png;base64,');
    expectColor(await blobPixel(page, 'window.__blob', 50, 20), RED);
  });
});

test.describe('形式バージョン 1 との互換性', () => {
  test('test/fixtures/paint79-v1.png を読み込める', async ({ page }) => {
    const bytes = [...readFileSync(join(__dirname, '../test/fixtures/paint79-v1.png'))];
    await setup(page);
    const r = await page.evaluate(async (bytes) => {
      const result = await window.paint79.open(new Uint8Array(bytes));
      const c = window.paint79.getCanvas();
      return {
        result,
        layers: window.paint79.getLayers(),
        background: window.paint79.getBackground(),
        size: [c.style.width, c.style.height],
      };
    }, bytes);
    expect(r.result).toEqual({ restored: true });
    expect(r.background).toBe('#ffffff');
    expect(r.size).toEqual(['120px', '80px']);
    expect(r.layers.map((l) => [l.name, l.visible, l.opacity, l.blendMode])).toEqual([
      ['背景', true, 1, 'normal'],
      ['線画', true, 0.5, 'multiply'],
      ['非表示', false, 1, 'normal'],
    ]);
    // 背景レイヤー: 左上に赤の矩形 / 線画レイヤー: 右下に青の矩形 / 非表示レイヤー: 中央に緑の矩形
    expectColor(await pixel(page, 10, 10), RED);
    expectColor(await pixel(page, 110, 70), [128, 128, 255, 255], 3);
    expectColor(await pixel(page, 60, 40), WHITE);
    await page.evaluate(() =>
      window.paint79.setLayerProperties(window.paint79.getLayers()[2]!.id, { visible: true }),
    );
    expectColor(await pixel(page, 60, 40), [0, 255, 0, 255]);
  });
});
