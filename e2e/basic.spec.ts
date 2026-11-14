// コンストラクタ、オプション、ツール設定、破棄(docs/specs/api.md)
import { expect, test } from '@playwright/test';
import {
  events,
  expectColor,
  pixel,
  recordEvents,
  setup,
  TRANSPARENT,
  WHITE,
} from './helpers/paint';

test.describe('コンストラクタ', () => {
  test('親要素の中に canvas を生成する', async ({ page }) => {
    await setup(page, { width: 200, height: 100 });
    const info = await page.evaluate(() => {
      const canvas = window.paint79.getCanvas();
      return {
        parentId: canvas.parentElement?.id,
        tag: canvas.tagName,
        cssWidth: canvas.style.width,
        cssHeight: canvas.style.height,
        width: canvas.width,
        height: canvas.height,
      };
    });
    expect(info).toEqual({
      parentId: 'paint-area',
      tag: 'CANVAS',
      cssWidth: '200px',
      cssHeight: '100px',
      width: 200,
      height: 100,
    });
  });

  test('width / height を省略した場合は親要素のサイズを使う', async ({ page }) => {
    await setup(page);
    const size = await page.evaluate(() => {
      const c = window.paint79.getCanvas();
      return [c.style.width, c.style.height];
    });
    expect(size).toEqual(['400px', '300px']);
  });

  test('親要素のサイズが 0 の場合は 300 x 150', async ({ page }) => {
    await setup(page);
    const size = await page.evaluate(() => {
      const div = document.createElement('div');
      div.style.width = '0px';
      div.style.height = '0px';
      document.body.appendChild(div);
      const p = new window.Paint79(div, { pixelRatio: 1 });
      const c = p.getCanvas();
      return [c.style.width, c.style.height];
    });
    expect(size).toEqual(['300px', '150px']);
  });

  test('canvas の内部解像度は pixelRatio 倍になる', async ({ page }) => {
    await setup(page, { width: 100, height: 50, pixelRatio: 2 });
    const size = await page.evaluate(() => {
      const c = window.paint79.getCanvas();
      return [c.width, c.height, c.style.width];
    });
    expect(size).toEqual([200, 100, '100px']);
  });

  test('pixelRatio を省略した場合は window.devicePixelRatio を使う', async ({ page }) => {
    await setup(page);
    const result = await page.evaluate(() => {
      const div = document.createElement('div');
      document.body.appendChild(div);
      const p = new window.Paint79(div, { width: 10, height: 10 });
      return [p.getCanvas().width, Math.round(10 * window.devicePixelRatio)];
    });
    expect(result[0]).toBe(result[1]);
  });

  test('背景色は既定で白', async ({ page }) => {
    await setup(page, { width: 50, height: 50 });
    expectColor(await pixel(page, 25, 25), WHITE);
  });

  test('background を指定できる。null の場合は透明', async ({ page }) => {
    await setup(page, { width: 50, height: 50, background: '#ff0000' });
    expectColor(await pixel(page, 25, 25), [255, 0, 0, 255]);
    await setup(page, { width: 50, height: 50, background: null });
    expectColor(await pixel(page, 25, 25), TRANSPARENT);
  });

  test('container が HTMLElement でなければ TypeError', async ({ page }) => {
    await setup(page);
    const name = await page.evaluate(() => {
      try {
        new window.Paint79(null as never);
        return 'no error';
      } catch (e) {
        return (e as Error).name;
      }
    });
    expect(name).toBe('TypeError');
  });

  test('オプションの値が範囲外なら RangeError、型が誤っていれば TypeError', async ({ page }) => {
    await setup(page);
    const names = await page.evaluate(() => {
      const el = document.getElementById('paint-area')!;
      const tryCreate = (o: unknown) => {
        try {
          new window.Paint79(el, o as never);
          return 'no error';
        } catch (e) {
          return (e as Error).name;
        }
      };
      return [tryCreate({ width: -1 }), tryCreate({ tool: 'brush' }), tryCreate({ width: '1' })];
    });
    expect(names).toEqual(['RangeError', 'RangeError', 'TypeError']);
  });
});

test.describe('ツール・描画設定', () => {
  test('初期値はオプションに従う', async ({ page }) => {
    await setup(page, { tool: 'eraser', color: '#123456', lineWidth: 7 });
    const v = await page.evaluate(() => [
      window.paint79.getTool(),
      window.paint79.getColor(),
      window.paint79.getLineWidth(),
    ]);
    expect(v).toEqual(['eraser', '#123456', 7]);
  });

  test('setTool / setColor / setLineWidth で変更し、toolchange が発生する', async ({ page }) => {
    await setup(page);
    await recordEvents(page, ['toolchange']);
    await page.evaluate(() => {
      window.paint79.setTool('eraser');
      window.paint79.setColor('red');
      window.paint79.setLineWidth(12);
    });
    expect(
      await page.evaluate(() => [
        window.paint79.getTool(),
        window.paint79.getColor(),
        window.paint79.getLineWidth(),
      ]),
    ).toEqual(['eraser', 'red', 12]);
    expect((await events(page)).map((e) => e.event)).toEqual([
      { tool: 'eraser', color: '#000000', lineWidth: 4 },
      { tool: 'eraser', color: 'red', lineWidth: 4 },
      { tool: 'eraser', color: 'red', lineWidth: 12 },
    ]);
  });

  test('同じ値を設定しても toolchange は発生しない', async ({ page }) => {
    await setup(page);
    await recordEvents(page, ['toolchange']);
    await page.evaluate(() => {
      window.paint79.setTool('pen');
      window.paint79.setColor('#000000');
      window.paint79.setLineWidth(4);
    });
    expect(await events(page)).toEqual([]);
  });

  test('不正な値は例外を投げ、値を変更しない', async ({ page }) => {
    await setup(page);
    const result = await page.evaluate(() => {
      const names: string[] = [];
      const run = (fn: () => void) => {
        try {
          fn();
          names.push('no error');
        } catch (e) {
          names.push((e as Error).name);
        }
      };
      run(() => window.paint79.setTool('brush' as never));
      run(() => window.paint79.setLineWidth(0));
      run(() => window.paint79.setColor(1 as never));
      run(() => window.paint79.setReadOnly('yes' as never));
      return { names, tool: window.paint79.getTool(), width: window.paint79.getLineWidth() };
    });
    expect(result).toEqual({
      names: ['RangeError', 'RangeError', 'TypeError', 'TypeError'],
      tool: 'pen',
      width: 4,
    });
  });
});

test.describe('イベントの登録', () => {
  test('未知のイベント名は TypeError', async ({ page }) => {
    await setup(page);
    const name = await page.evaluate(() => {
      try {
        window.paint79.on('unknown' as never, () => {});
        return 'no error';
      } catch (e) {
        return (e as Error).name;
      }
    });
    expect(name).toBe('TypeError');
  });

  test('off で解除したリスナーは呼ばれない', async ({ page }) => {
    await setup(page);
    const count = await page.evaluate(() => {
      let n = 0;
      const fn = () => n++;
      window.paint79.on('toolchange', fn);
      window.paint79.setLineWidth(10);
      window.paint79.off('toolchange', fn);
      window.paint79.setLineWidth(11);
      return n;
    });
    expect(count).toBe(1);
  });
});

test.describe('destroy', () => {
  test('canvas を DOM から取り除き、以後のメソッド呼び出しは Error を投げる', async ({ page }) => {
    await setup(page);
    const result = await page.evaluate(() => {
      const canvas = window.paint79.getCanvas();
      window.paint79.destroy();
      let name = 'no error';
      try {
        window.paint79.getLayers();
      } catch (e) {
        name = (e as Error).name;
      }
      return { attached: canvas.isConnected, name };
    });
    expect(result).toEqual({ attached: false, name: 'Error' });
  });

  test('destroy の後はポインター操作に反応しない', async ({ page }) => {
    await setup(page);
    const changed = await page.evaluate(() => {
      const canvas = window.paint79.getCanvas();
      let n = 0;
      window.paint79.on('strokestart', () => n++);
      window.paint79.destroy();
      canvas.dispatchEvent(
        new PointerEvent('pointerdown', { pointerId: 1, pointerType: 'mouse', bubbles: true }),
      );
      return n;
    });
    expect(changed).toBe(0);
  });
});

test.describe('色の検証', () => {
  test('CSS カラーとして解釈できない色は RangeError で、値を変更しない', async ({ page }) => {
    await setup(page);
    const r = await page.evaluate(() => {
      const names: string[] = [];
      const run = (fn: () => void) => {
        try {
          fn();
          names.push('no error');
        } catch (e) {
          names.push((e as Error).name);
        }
      };
      run(() => window.paint79.setColor('not-a-color'));
      run(() => window.paint79.setBackground('not-a-color'));
      run(() => new window.Paint79(document.getElementById('paint-area')!, { color: 'nope' }));
      run(() => new window.Paint79(document.getElementById('paint-area')!, { background: 'nope' }));
      run(() => window.paint79.setColor('rgb(10, 20, 30)'));
      run(() => window.paint79.setBackground('transparent'));
      return { names, color: window.paint79.getColor() };
    });
    expect(r).toEqual({
      names: ['RangeError', 'RangeError', 'RangeError', 'RangeError', 'no error', 'no error'],
      color: 'rgb(10, 20, 30)',
    });
  });
});
