// ポインター操作による描画(docs/specs/api.md の「ポインター操作による描画」)
import { expect, test } from '@playwright/test';
import {
  BLACK,
  events,
  expectColor,
  pixel,
  recordEvents,
  setup,
  TRANSPARENT,
  WHITE,
} from './helpers/paint';
import { drawStroke, sendPointer } from './helpers/pointer';

const RED: [number, number, number, number] = [255, 0, 0, 255];

test.describe('ペン', () => {
  test('マウスで描いた線の上は描画色になり、線から離れた場所は背景色のまま', async ({ page }) => {
    await setup(page, { width: 100, height: 100, lineWidth: 6 });
    await drawStroke(page, [
      [10, 50],
      [50, 50],
      [90, 50],
    ]);
    expectColor(await pixel(page, 30, 50), BLACK);
    expectColor(await pixel(page, 70, 50), BLACK);
    expectColor(await pixel(page, 50, 60), WHITE);
  });

  test('実際のマウス操作(page.mouse)でも描画できる', async ({ page }) => {
    await setup(page, { width: 100, height: 100, lineWidth: 6 });
    const box = (await page.locator('#paint-area canvas').boundingBox())!;
    await page.mouse.move(box.x + 10, box.y + 30);
    await page.mouse.down();
    await page.mouse.move(box.x + 50, box.y + 30, { steps: 5 });
    await page.mouse.move(box.x + 90, box.y + 30, { steps: 5 });
    await page.mouse.up();
    expectColor(await pixel(page, 50, 30), BLACK);
    expectColor(await pixel(page, 50, 60), WHITE);
  });

  test('描画色と線の太さが反映される', async ({ page }) => {
    await setup(page, { width: 100, height: 100 });
    await page.evaluate(() => {
      window.paint79.setColor('#ff0000');
      window.paint79.setLineWidth(20);
    });
    await drawStroke(page, [
      [10, 50],
      [90, 50],
    ]);
    expectColor(await pixel(page, 50, 50), RED);
    expectColor(await pixel(page, 50, 57), RED); // 中心から 7px(太さ 20 の内側)
    expectColor(await pixel(page, 50, 63), WHITE); // 中心から 13px(太さ 20 の外側)
  });

  test('ポインターを動かさずに離した場合は点を描画する', async ({ page }) => {
    await setup(page, { width: 100, height: 100, lineWidth: 10 });
    await drawStroke(page, [[50, 50]]);
    expectColor(await pixel(page, 50, 50), BLACK);
    expectColor(await pixel(page, 50, 53), BLACK);
    expectColor(await pixel(page, 50, 60), WHITE);
  });

  test('pixelRatio が 2 でも、CSS ピクセル座標の位置に描画される', async ({ page }) => {
    await setup(page, { width: 100, height: 100, lineWidth: 4, pixelRatio: 2 });
    await drawStroke(page, [
      [10, 20],
      [90, 20],
    ]);
    expectColor(await pixel(page, 50, 20), BLACK);
    expectColor(await pixel(page, 50, 30), WHITE);
  });
});

test.describe('消しゴム', () => {
  test('アクティブレイヤーの描画内容を透明に戻す(背景色が見える)', async ({ page }) => {
    await setup(page, { width: 100, height: 100, lineWidth: 20, background: '#00ff00' });
    await drawStroke(page, [
      [10, 50],
      [90, 50],
    ]);
    await page.evaluate(() => window.paint79.setTool('eraser'));
    await drawStroke(page, [
      [50, 10],
      [50, 90],
    ]);
    expectColor(await pixel(page, 50, 50), [0, 255, 0, 255]);
    expectColor(await pixel(page, 20, 50), BLACK);
  });

  test('背景が透明なら、消した部分は透明になる', async ({ page }) => {
    await setup(page, { width: 100, height: 100, lineWidth: 20, background: null });
    await drawStroke(page, [
      [10, 50],
      [90, 50],
    ]);
    await page.evaluate(() => window.paint79.setTool('eraser'));
    await drawStroke(page, [
      [50, 10],
      [50, 90],
    ]);
    expectColor(await pixel(page, 50, 50), TRANSPARENT);
  });
});

test.describe('筆圧', () => {
  test('ペンでは筆圧に応じて線が細くなる', async ({ page }) => {
    await setup(page, { width: 200, height: 100, lineWidth: 20 });
    await drawStroke(
      page,
      [
        [10, 30, 1],
        [190, 30, 1],
      ],
      { pointerType: 'pen' },
    );
    await drawStroke(
      page,
      [
        [10, 70, 0.2],
        [190, 70, 0.2],
      ],
      { pointerType: 'pen' },
    );
    // 筆圧 1: 太さ 20(中心から 7px は線の内側)、筆圧 0.2: 太さ 4(中心から 7px は線の外側)
    expectColor(await pixel(page, 100, 37), BLACK);
    expectColor(await pixel(page, 100, 70), BLACK);
    expectColor(await pixel(page, 100, 77), WHITE);
  });

  test('pressure: false ではペンでも筆圧を無視する', async ({ page }) => {
    await setup(page, { width: 200, height: 100, lineWidth: 20, pressure: false });
    await drawStroke(
      page,
      [
        [10, 50, 0.2],
        [190, 50, 0.2],
      ],
      { pointerType: 'pen' },
    );
    expectColor(await pixel(page, 100, 57), BLACK);
  });

  test('マウス・タッチでは筆圧を無視する', async ({ page }) => {
    await setup(page, { width: 200, height: 100, lineWidth: 20 });
    await drawStroke(
      page,
      [
        [10, 30, 0.2],
        [190, 30, 0.2],
      ],
      { pointerType: 'mouse' },
    );
    await drawStroke(
      page,
      [
        [10, 70, 0.2],
        [190, 70, 0.2],
      ],
      { pointerType: 'touch' },
    );
    expectColor(await pixel(page, 100, 37), BLACK);
    expectColor(await pixel(page, 100, 77), BLACK);
  });
});

test.describe('描画を受け付けない条件', () => {
  const line = [
    [10, 50],
    [90, 50],
  ] as [number, number][];

  test('readOnly', async ({ page }) => {
    await setup(page, { width: 100, height: 100, readOnly: true });
    await drawStroke(page, line);
    expectColor(await pixel(page, 50, 50), WHITE);
    await page.evaluate(() => window.paint79.setReadOnly(false));
    await drawStroke(page, line);
    expectColor(await pixel(page, 50, 50), BLACK);
  });

  test('pointerTypes に含まれない入力', async ({ page }) => {
    await setup(page, { width: 100, height: 100, pointerTypes: ['pen'] });
    await drawStroke(page, line, { pointerType: 'mouse' });
    await drawStroke(page, line, { pointerType: 'touch' });
    expectColor(await pixel(page, 50, 50), WHITE);
    await drawStroke(page, line, { pointerType: 'pen', pressure: 1 });
    expectColor(await pixel(page, 50, 50), BLACK);
  });

  test('アクティブレイヤーがロックされている', async ({ page }) => {
    await setup(page, { width: 100, height: 100 });
    await page.evaluate(() =>
      window.paint79.setLayerProperties(window.paint79.getActiveLayerId(), { locked: true }),
    );
    await drawStroke(page, line);
    expectColor(await pixel(page, 50, 50), WHITE);
  });

  test('アクティブレイヤーが非表示', async ({ page }) => {
    await setup(page, { width: 100, height: 100 });
    await page.evaluate(() =>
      window.paint79.setLayerProperties(window.paint79.getActiveLayerId(), { visible: false }),
    );
    await drawStroke(page, line);
    await page.evaluate(() =>
      window.paint79.setLayerProperties(window.paint79.getActiveLayerId(), { visible: true }),
    );
    expectColor(await pixel(page, 50, 50), WHITE);
  });
});

test.describe('複数のポインター', () => {
  test('描画中に押された別のポインターは無視する', async ({ page }) => {
    await setup(page, { width: 100, height: 100, lineWidth: 6 });
    await drawStroke(
      page,
      [
        [10, 20],
        [50, 20],
      ],
      { pointerType: 'touch', pointerId: 11, keepDown: true },
    );
    await drawStroke(
      page,
      [
        [10, 80],
        [90, 80],
      ],
      { pointerType: 'touch', pointerId: 12 },
    );
    await sendPointer(page, 'pointermove', [90, 20], { pointerType: 'touch', pointerId: 11 });
    await sendPointer(page, 'pointerup', [90, 20], { pointerType: 'touch', pointerId: 11 });
    expectColor(await pixel(page, 50, 80), WHITE);
    expectColor(await pixel(page, 30, 20), BLACK);
  });
});

test.describe('パームリジェクション', () => {
  const line = (y: number) =>
    [
      [10, y],
      [90, y],
    ] as [number, number][];

  test('ペン入力を検出した後は、タッチ入力を無視する', async ({ page }) => {
    await setup(page, { width: 100, height: 100, palmRejection: true });
    await drawStroke(page, line(20), { pointerType: 'touch' });
    expectColor(await pixel(page, 50, 20), BLACK);
    await drawStroke(page, line(50), { pointerType: 'pen', pressure: 1 });
    await drawStroke(page, line(80), { pointerType: 'touch' });
    expectColor(await pixel(page, 50, 80), WHITE);
  });

  test('palmRejection: false ではペン入力の後もタッチで描ける', async ({ page }) => {
    await setup(page, { width: 100, height: 100 });
    await drawStroke(page, line(50), { pointerType: 'pen', pressure: 1 });
    await drawStroke(page, line(80), { pointerType: 'touch' });
    expectColor(await pixel(page, 50, 80), BLACK);
  });

  test('タッチの描画中にペン入力を検出したら、タッチのストロークを取り消してペンで描く', async ({
    page,
  }) => {
    await setup(page, { width: 100, height: 100, palmRejection: true, lineWidth: 6 });
    await drawStroke(page, line(20), { pointerType: 'touch', pointerId: 5, keepDown: true });
    expectColor(await pixel(page, 50, 20), BLACK);
    await drawStroke(page, line(60), { pointerType: 'pen', pointerId: 6, pressure: 1 });
    await sendPointer(page, 'pointerup', [90, 20], { pointerType: 'touch', pointerId: 5 });
    expectColor(await pixel(page, 50, 20), WHITE);
    expectColor(await pixel(page, 50, 60), BLACK);
    // 取り消したタッチのストロークは履歴に残らない(1 回のアンドゥでペンの線も消える)
    await page.evaluate(() => window.paint79.undo());
    expectColor(await pixel(page, 50, 60), WHITE);
    expect(await page.evaluate(() => window.paint79.canUndo())).toBe(false);
  });
});

test.describe('pointercancel', () => {
  test('中断されたストロークは取り消され、履歴にも記録されない', async ({ page }) => {
    await setup(page, { width: 100, height: 100 });
    await recordEvents(page, ['strokeend', 'change']);
    await drawStroke(
      page,
      [
        [10, 50],
        [90, 50],
      ],
      { cancel: true },
    );
    expectColor(await pixel(page, 50, 50), WHITE);
    expect(await page.evaluate(() => window.paint79.canUndo())).toBe(false);
    expect(await events(page)).toEqual([]);
  });
});

test.describe('イベント', () => {
  test('strokestart / strokeend / change が発生する', async ({ page }) => {
    await setup(page, { width: 100, height: 100 });
    await recordEvents(page, ['strokestart', 'strokeend', 'change']);
    const layerId = await page.evaluate(() => window.paint79.getActiveLayerId());
    await drawStroke(
      page,
      [
        [10, 20, 0.7],
        [30, 40],
        [50, 60],
      ],
      { pointerType: 'pen' },
    );
    const list = await events(page);
    expect(list.map((e) => e.name)).toEqual(['strokestart', 'strokeend', 'change']);
    const start = list[0]!.event as Record<string, unknown>;
    expect(start).toMatchObject({ pointerType: 'pen', layerId });
    expect(start.x as number).toBeCloseTo(10, 0);
    expect(start.y as number).toBeCloseTo(20, 0);
    expect(start.pressure as number).toBeCloseTo(0.7, 1);
    expect(list[1]!.event).toEqual({ pointerType: 'pen', layerId });
    expect(list[2]!.event).toEqual({});
  });

  test('ストロークの描画中は change が発生しない', async ({ page }) => {
    await setup(page, { width: 100, height: 100 });
    await recordEvents(page, ['change']);
    await drawStroke(
      page,
      [
        [10, 20],
        [30, 40],
        [50, 60],
      ],
      { keepDown: true },
    );
    expect(await events(page)).toEqual([]);
    await sendPointer(page, 'pointerup', [50, 60]);
    expect(await events(page)).toHaveLength(1);
  });
});
