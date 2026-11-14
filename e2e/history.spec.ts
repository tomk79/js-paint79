// 履歴とキャンバス操作(docs/specs/api.md の「履歴」「キャンバス操作」、docs/specs/document-model.md の「履歴」)
import { expect, test, type Page } from '@playwright/test';
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
import { drawStroke } from './helpers/pointer';

async function line(page: Page, y: number) {
  await drawStroke(page, [
    [10, y],
    [90, y],
  ]);
}

test.describe('ストロークの履歴', () => {
  test('1 回のストロークが 1 つの履歴になり、アンドゥ/リドゥできる', async ({ page }) => {
    await setup(page, { width: 100, height: 100, lineWidth: 6 });
    await line(page, 30);
    await line(page, 70);
    expect(await page.evaluate(() => window.paint79.undo())).toBe(true);
    expectColor(await pixel(page, 50, 70), WHITE);
    expectColor(await pixel(page, 50, 30), BLACK);
    expect(await page.evaluate(() => window.paint79.undo())).toBe(true);
    expectColor(await pixel(page, 50, 30), WHITE);
    expect(await page.evaluate(() => window.paint79.undo())).toBe(false);
    expect(await page.evaluate(() => window.paint79.redo())).toBe(true);
    expectColor(await pixel(page, 50, 30), BLACK);
    expectColor(await pixel(page, 50, 70), WHITE);
  });

  test('消しゴムのストロークもアンドゥできる', async ({ page }) => {
    await setup(page, { width: 100, height: 100, lineWidth: 20 });
    await line(page, 50);
    await page.evaluate(() => window.paint79.setTool('eraser'));
    await drawStroke(page, [
      [50, 10],
      [50, 90],
    ]);
    expectColor(await pixel(page, 50, 50), WHITE);
    await page.evaluate(() => window.paint79.undo());
    expectColor(await pixel(page, 50, 50), BLACK);
  });

  test('アンドゥした後に新しい操作を行うと、リドゥできなくなる', async ({ page }) => {
    await setup(page, { width: 100, height: 100 });
    await line(page, 30);
    await page.evaluate(() => window.paint79.undo());
    await line(page, 70);
    expect(await page.evaluate(() => window.paint79.canRedo())).toBe(false);
  });

  test('historyLimit を超えた分は古いものから破棄される', async ({ page }) => {
    await setup(page, { width: 100, height: 100, historyLimit: 2 });
    await line(page, 20);
    await line(page, 50);
    await line(page, 80);
    const count = await page.evaluate(() => {
      let n = 0;
      while (window.paint79.undo() && n < 10) n++;
      return n;
    });
    expect(count).toBe(2);
    expectColor(await pixel(page, 50, 20), BLACK);
  });

  test('ツール・色・線の太さの変更は履歴に記録しない', async ({ page }) => {
    await setup(page);
    const canUndo = await page.evaluate(() => {
      window.paint79.setTool('eraser');
      window.paint79.setColor('red');
      window.paint79.setLineWidth(3);
      window.paint79.setReadOnly(true);
      return window.paint79.canUndo();
    });
    expect(canUndo).toBe(false);
  });

  test('clearHistory で履歴を破棄する', async ({ page }) => {
    await setup(page, { width: 100, height: 100 });
    await line(page, 30);
    await page.evaluate(() => window.paint79.undo());
    await line(page, 50);
    const r = await page.evaluate(() => {
      window.paint79.clearHistory();
      return [window.paint79.canUndo(), window.paint79.canRedo()];
    });
    expect(r).toEqual([false, false]);
  });
});

test.describe('historychange', () => {
  test('canUndo / canRedo の値が変化したときにのみ発生する', async ({ page }) => {
    await setup(page, { width: 100, height: 100 });
    await recordEvents(page, ['historychange']);
    await line(page, 20);
    await line(page, 50); // 変化しない
    await page.evaluate(() => {
      window.paint79.undo(); // canRedo: true
      window.paint79.undo(); // canUndo: false
      window.paint79.redo(); // canUndo: true
    });
    expect((await events(page)).map((e) => e.event)).toEqual([
      { canUndo: true, canRedo: false },
      { canUndo: true, canRedo: true },
      { canUndo: false, canRedo: true },
      { canUndo: true, canRedo: true },
    ]);
  });

  test('アンドゥ/リドゥで change が発生する', async ({ page }) => {
    await setup(page, { width: 100, height: 100 });
    await line(page, 20);
    await recordEvents(page, ['change']);
    await page.evaluate(() => {
      window.paint79.undo();
      window.paint79.redo();
    });
    expect(await events(page)).toHaveLength(2);
  });
});

test.describe('clear', () => {
  test('全レイヤーの内容を消去し、レイヤー構成は維持する。アンドゥできる', async ({ page }) => {
    await setup(page, { width: 100, height: 100, lineWidth: 6 });
    await line(page, 30);
    await page.evaluate(() => window.paint79.setActiveLayer(window.paint79.addLayer()));
    await line(page, 70);
    await page.evaluate(() => window.paint79.clear());
    expectColor(await pixel(page, 50, 30), WHITE);
    expectColor(await pixel(page, 50, 70), WHITE);
    expect(await page.evaluate(() => window.paint79.getLayers().length)).toBe(2);
    await page.evaluate(() => window.paint79.undo());
    expectColor(await pixel(page, 50, 30), BLACK);
    expectColor(await pixel(page, 50, 70), BLACK);
  });
});

test.describe('resize', () => {
  test('キャンバスのサイズを変更し、描画内容を左上基準で保持する。アンドゥできる', async ({
    page,
  }) => {
    await setup(page, { width: 100, height: 100, lineWidth: 6, pixelRatio: 2 });
    await line(page, 30);
    await page.evaluate(() => window.paint79.resize(200, 50));
    const size = await page.evaluate(() => {
      const c = window.paint79.getCanvas();
      return [c.width, c.height, c.style.width, c.style.height];
    });
    expect(size).toEqual([400, 100, '200px', '50px']);
    expectColor(await pixel(page, 50, 30), BLACK);
    expectColor(await pixel(page, 150, 30), WHITE);
    // 拡大した領域にも描画できる
    await drawStroke(page, [
      [110, 40],
      [190, 40],
    ]);
    expectColor(await pixel(page, 150, 40), BLACK);

    await page.evaluate(() => {
      window.paint79.undo();
      window.paint79.undo();
    });
    expect(
      await page.evaluate(() => [
        window.paint79.getCanvas().width,
        window.paint79.getCanvas().height,
      ]),
    ).toEqual([200, 200]);
    expectColor(await pixel(page, 50, 30), BLACK);
  });

  test('縮小すると、範囲外の描画内容は失われる(アンドゥで戻る)', async ({ page }) => {
    await setup(page, { width: 100, height: 100, lineWidth: 6 });
    await line(page, 80);
    await page.evaluate(() => {
      window.paint79.resize(100, 50);
      window.paint79.resize(100, 100);
    });
    expectColor(await pixel(page, 50, 80), WHITE);
    await page.evaluate(() => {
      window.paint79.undo();
      window.paint79.undo();
    });
    expectColor(await pixel(page, 50, 80), BLACK);
  });

  test('不正なサイズは RangeError', async ({ page }) => {
    await setup(page);
    const name = await page.evaluate(() => {
      try {
        window.paint79.resize(0, 10);
        return 'no error';
      } catch (e) {
        return (e as Error).name;
      }
    });
    expect(name).toBe('RangeError');
  });
});

test.describe('背景色', () => {
  test('setBackground で変更でき、アンドゥできる', async ({ page }) => {
    await setup(page, { width: 100, height: 100 });
    await page.evaluate(() => window.paint79.setBackground('#0000ff'));
    expectColor(await pixel(page, 50, 50), [0, 0, 255, 255]);
    expect(await page.evaluate(() => window.paint79.getBackground())).toBe('#0000ff');
    await page.evaluate(() => window.paint79.setBackground(null));
    expectColor(await pixel(page, 50, 50), TRANSPARENT);
    await page.evaluate(() => window.paint79.undo());
    expectColor(await pixel(page, 50, 50), [0, 0, 255, 255]);
    await page.evaluate(() => window.paint79.undo());
    expectColor(await pixel(page, 50, 50), WHITE);
  });
});
