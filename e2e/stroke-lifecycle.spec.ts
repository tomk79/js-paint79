// ストロークの開始から確定・取り消しまでの扱い(docs/specs/api.md の「ポインター操作による描画」)
import { expect, test, type Page } from '@playwright/test';
import { BLACK, events, expectColor, pixel, recordEvents, setup, WHITE } from './helpers/paint';
import { drawStroke, sendPointer } from './helpers/pointer';

declare global {
  interface Window {
    /** stroke: 描画中のレイヤー、below: その下のレイヤー、above: その上のレイヤー */
    __ids: { stroke: string; below: string; above: string };
    __solid: (w: number, h: number, color: string) => Promise<ImageBitmap>;
  }
}

/**
 * レイヤーを 下(below)・描画中(stroke)・上(above)の 3 枚にし、
 * below の y = 30 に線 A を描いて確定し、stroke の y = 70 に線 B を描きかけの状態にする。
 * リドゥできる操作も 1 つ用意しておく。
 */
async function strokeInProgress(page: Page) {
  await setup(page, { width: 100, height: 100, lineWidth: 6 });
  await drawStroke(page, [
    [10, 30],
    [90, 30],
  ]);
  await page.evaluate(() => {
    const p = window.paint79;
    const below = p.getActiveLayerId();
    const stroke = p.addLayer({ name: 'stroke' });
    const above = p.addLayer({ name: 'above', index: 2 });
    p.setActiveLayer(stroke);
    p.setLayerProperties(below, { name: 'below' });
    p.undo(); // リドゥできる状態にする
    window.__ids = { stroke, below, above };
    window.__solid = (w, h, color) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, w, h);
      return createImageBitmap(c);
    };
  });
  await drawStroke(
    page,
    [
      [10, 70],
      [50, 70],
    ],
    { keepDown: true },
  );
  expectColor(await pixel(page, 30, 70), BLACK);
  await recordEvents(page, ['strokeend']);
}

/** 描きかけのストロークを続けて、ポインターを離す */
async function continueStroke(page: Page) {
  await sendPointer(page, 'pointermove', [90, 70]);
  await sendPointer(page, 'pointerup', [90, 70]);
}

test.describe('描画中のストロークに影響する API が呼ばれた場合', () => {
  const operations: [string, string][] = [
    ['undo()', 'window.paint79.undo()'],
    ['redo()', 'window.paint79.redo()'],
    ['resize()', 'window.paint79.resize(100, 90)'],
    ['clear()', 'window.paint79.clear()'],
    ['clearLayer(描画中のレイヤー)', 'window.paint79.clearLayer(window.__ids.stroke)'],
    ['removeLayer(描画中のレイヤー)', 'window.paint79.removeLayer(window.__ids.stroke)'],
    ['duplicateLayer(描画中のレイヤー)', 'window.paint79.duplicateLayer(window.__ids.stroke)'],
    ['mergeDown(描画中のレイヤー)', 'window.paint79.mergeDown(window.__ids.stroke)'],
    ['mergeDown(描画中のレイヤーの上のレイヤー)', 'window.paint79.mergeDown(window.__ids.above)'],
    [
      'loadImage({ layerId: 描画中のレイヤー })',
      "window.__solid(5, 5, '#ff0000').then((b) => window.paint79.loadImage(b, { layerId: window.__ids.stroke }))",
    ],
    [
      'open()',
      "window.__solid(100, 100, '#ffffff').then((b) => { const c = document.createElement('canvas'); c.width = 100; c.height = 100; c.getContext('2d').drawImage(b, 0, 0); return new Promise((r) => c.toBlob(r)); }).then((blob) => window.paint79.open(blob))",
    ],
  ];

  for (const [name, op] of operations) {
    test(`${name}: 描画中のストロークは取り消され、以後のポインター操作でも描かれない`, async ({
      page,
    }) => {
      await strokeInProgress(page);
      await page.evaluate((op) => (0, eval)(op), op);
      await continueStroke(page);
      expectColor(await pixel(page, 30, 70), WHITE);
      expectColor(await pixel(page, 70, 70), WHITE);
      expect(await events(page)).toEqual([]);
    });
  }

  test('clear() の後に pointercancel が来ても、消去した内容は戻らない', async ({ page }) => {
    await strokeInProgress(page);
    await page.evaluate(() => window.paint79.clear());
    await sendPointer(page, 'pointercancel', [50, 70]);
    expectColor(await pixel(page, 50, 30), WHITE);
    // clear のアンドゥで線 A だけが戻る
    await page.evaluate(() => window.paint79.undo());
    expectColor(await pixel(page, 50, 30), BLACK);
    expectColor(await pixel(page, 30, 70), WHITE);
  });
});

test.describe('描画中のストロークに影響しない API が呼ばれた場合', () => {
  const operations: [string, string][] = [
    ['addLayer()', 'window.paint79.addLayer()'],
    ['moveLayer()', 'window.paint79.moveLayer(window.__ids.above, 0)'],
    [
      'setLayerProperties()',
      "window.paint79.setLayerProperties(window.__ids.stroke, { name: 'renamed', locked: true })",
    ],
    ['setActiveLayer()', 'window.paint79.setActiveLayer(window.__ids.below)'],
    ['setBackground()', "window.paint79.setBackground('#fafafa')"],
    ['clearLayer(別のレイヤー)', 'window.paint79.clearLayer(window.__ids.above)'],
    ['removeLayer(別のレイヤー)', 'window.paint79.removeLayer(window.__ids.above)'],
    ['duplicateLayer(別のレイヤー)', 'window.paint79.duplicateLayer(window.__ids.below)'],
    [
      'loadImage(新しいレイヤー)',
      "window.__solid(5, 5, '#ff0000').then((b) => window.paint79.loadImage(b))",
    ],
    [
      'loadImage({ layerId: 別のレイヤー })',
      "window.__solid(5, 5, '#ff0000').then((b) => window.paint79.loadImage(b, { layerId: window.__ids.below }))",
    ],
  ];

  for (const [name, op] of operations) {
    test(`${name}: ストロークはそのまま続き、描き終えたときに履歴に記録される`, async ({
      page,
    }) => {
      await strokeInProgress(page);
      await page.evaluate((op) => (0, eval)(op), op);
      await continueStroke(page);
      expectColor(await pixel(page, 30, 70), BLACK);
      expectColor(await pixel(page, 70, 70), BLACK);
      expect((await events(page)).map((e) => e.name)).toEqual(['strokeend']);
      // 最後の履歴はストローク: アンドゥで線 B だけが消える
      await page.evaluate(() => window.paint79.undo());
      expectColor(await pixel(page, 70, 70), WHITE);
      expectColor(await pixel(page, 50, 30), BLACK);
    });
  }
});

test.describe('ストロークの開始時の設定', () => {
  test('描画中に色・太さ・ツールを変更しても、そのストロークには反映されない', async ({ page }) => {
    await setup(page, { width: 100, height: 100, lineWidth: 6 });
    await drawStroke(
      page,
      [
        [10, 50],
        [50, 50],
      ],
      { keepDown: true },
    );
    await page.evaluate(() => {
      window.paint79.setColor('#ff0000');
      window.paint79.setLineWidth(40);
      window.paint79.setTool('eraser');
    });
    await sendPointer(page, 'pointermove', [90, 50]);
    await sendPointer(page, 'pointerup', [90, 50]);
    expectColor(await pixel(page, 70, 50), BLACK);
    expectColor(await pixel(page, 70, 60), WHITE); // 太さ 40 なら塗られる位置
  });
});

test.describe('マウスのボタン', () => {
  test('主ボタン以外(右ボタン)では描画しない', async ({ page }) => {
    await setup(page, { width: 100, height: 100 });
    await drawStroke(
      page,
      [
        [10, 50],
        [90, 50],
      ],
      { button: 2 },
    );
    expectColor(await pixel(page, 50, 50), WHITE);
  });
});

test.describe('pointerup の取りこぼし', () => {
  test('ボタンがすべて離されたマウスの pointermove を受けたら、ストロークを確定する', async ({
    page,
  }) => {
    await setup(page, { width: 100, height: 100, lineWidth: 6 });
    await recordEvents(page, ['strokeend']);
    await drawStroke(
      page,
      [
        [10, 30],
        [50, 30],
      ],
      { keepDown: true },
    );
    await sendPointer(page, 'pointermove', [50, 80], { buttons: 0 });
    await sendPointer(page, 'pointermove', [90, 80], { buttons: 0 });
    expect((await events(page)).map((e) => e.name)).toEqual(['strokeend']);
    expectColor(await pixel(page, 30, 30), BLACK);
    // ボタンを離した後のホバー移動では描かれない
    expectColor(await pixel(page, 70, 80), WHITE);
    expect(await page.evaluate(() => window.paint79.canUndo())).toBe(true);
  });

  test('描画中のポインターと同じ ID の pointerdown は、前のストロークを確定して新しく描き始める', async ({
    page,
  }) => {
    await setup(page, { width: 100, height: 100, lineWidth: 6 });
    await recordEvents(page, ['strokestart', 'strokeend']);
    await drawStroke(
      page,
      [
        [10, 30],
        [90, 30],
      ],
      { keepDown: true },
    );
    await drawStroke(page, [
      [10, 70],
      [90, 70],
    ]);
    expect((await events(page)).map((e) => e.name)).toEqual([
      'strokestart',
      'strokeend',
      'strokestart',
      'strokeend',
    ]);
    expectColor(await pixel(page, 50, 30), BLACK);
    expectColor(await pixel(page, 50, 70), BLACK);
    // 2 本のストロークがそれぞれ履歴になる
    await page.evaluate(() => window.paint79.undo());
    expectColor(await pixel(page, 50, 30), BLACK);
    expectColor(await pixel(page, 50, 70), WHITE);
  });

  test('lostpointercapture を受けたら、ストロークを確定する', async ({ page }) => {
    await setup(page, { width: 100, height: 100, lineWidth: 6 });
    await recordEvents(page, ['strokeend']);
    await drawStroke(
      page,
      [
        [10, 30],
        [50, 30],
      ],
      { keepDown: true, pointerType: 'pen', pointerId: 7, pressure: 1 },
    );
    await page.evaluate(() =>
      window.paint79
        .getCanvas()
        .dispatchEvent(
          new PointerEvent('lostpointercapture', { pointerId: 7, pointerType: 'pen' }),
        ),
    );
    await sendPointer(page, 'pointermove', [90, 30], { pointerType: 'pen', pointerId: 7 });
    expect(await events(page)).toHaveLength(1);
    expectColor(await pixel(page, 30, 30), BLACK);
    expectColor(await pixel(page, 75, 30), WHITE);
  });
});
