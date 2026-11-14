// ストロークの開始から確定・取り消しまでの扱い(docs/specs/api.md の「ポインター操作による描画」)
import { expect, test, type Page } from '@playwright/test';
import { BLACK, events, expectColor, pixel, recordEvents, setup, WHITE } from './helpers/paint';
import { drawStroke, sendPointer } from './helpers/pointer';

const RED: [number, number, number, number] = [255, 0, 0, 255];

/** y = 30 に線 A を描いて確定し、y = 70 に線 B を描きかけの状態にする */
async function strokeInProgress(page: Page) {
  await setup(page, { width: 100, height: 100, lineWidth: 6 });
  await drawStroke(page, [
    [10, 30],
    [90, 30],
  ]);
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

test.describe('描画中にドキュメントを変更する API が呼ばれた場合', () => {
  const operations: [string, string][] = [
    ['clear()', 'window.paint79.clear()'],
    ['clearLayer()', 'window.paint79.clearLayer()'],
    ['undo()', 'window.paint79.undo()'],
    ['resize()', 'window.paint79.resize(100, 90)'],
    ['setBackground()', "window.paint79.setBackground('#fafafa')"],
    ['addLayer()', 'window.paint79.addLayer()'],
    ['removeLayer()', 'window.paint79.removeLayer(window.paint79.addLayer())'],
    [
      'setLayerProperties()',
      "window.paint79.setLayerProperties(window.paint79.getActiveLayerId(), { name: 'x' })",
    ],
  ];

  for (const [name, op] of operations) {
    test(`${name}: 描画中のストロークは取り消され、以後のポインター操作でも描かれない`, async ({
      page,
    }) => {
      await strokeInProgress(page);
      await page.evaluate((op) => (0, eval)(op), op);
      await sendPointer(page, 'pointermove', [90, 70]);
      await sendPointer(page, 'pointerup', [90, 70]);
      // 線 B は描かれていない(取り消された)
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

  test('loadImage({ layerId }) の完了が描画中に来ても、履歴と画面が食い違わない', async ({
    page,
  }) => {
    await strokeInProgress(page);
    await page.evaluate(async () => {
      const c = document.createElement('canvas');
      c.width = 20;
      c.height = 20;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(0, 0, 20, 20);
      await window.paint79.loadImage(await createImageBitmap(c), {
        layerId: window.paint79.getActiveLayerId(),
      });
    });
    await sendPointer(page, 'pointerup', [50, 70]);
    expectColor(await pixel(page, 10, 10), RED);
    await page.evaluate(() => window.paint79.undo());
    expectColor(await pixel(page, 10, 10), WHITE);
    expectColor(await pixel(page, 50, 30), BLACK);
  });
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
