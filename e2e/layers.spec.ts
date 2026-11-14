// レイヤー(docs/specs/api.md の「レイヤー」、docs/specs/document-model.md)
import { expect, test, type Page } from '@playwright/test';
import { BLACK, events, expectColor, pixel, recordEvents, setup, WHITE } from './helpers/paint';
import { drawStroke } from './helpers/pointer';

const RED: [number, number, number, number] = [255, 0, 0, 255];
const BLUE: [number, number, number, number] = [0, 0, 255, 255];

/** アクティブレイヤーに、指定した色で太い横線を描く */
async function paintLine(page: Page, color: string, y = 50) {
  await page.evaluate((color) => {
    window.paint79.setColor(color);
    window.paint79.setLineWidth(30);
  }, color);
  await drawStroke(page, [
    [0, y],
    [100, y],
  ]);
}

async function layerNames(page: Page) {
  return page.evaluate(() => window.paint79.getLayers().map((l) => l.name));
}

async function errorName(page: Page, fn: string) {
  return page.evaluate((fn) => {
    try {
      (0, eval)(fn);
      return 'no error';
    } catch (e) {
      return (e as Error).name;
    }
  }, fn);
}

test.describe('初期状態', () => {
  test('空のレイヤーが 1 枚あり、それがアクティブレイヤー', async ({ page }) => {
    await setup(page);
    const state = await page.evaluate(() => ({
      layers: window.paint79.getLayers(),
      active: window.paint79.getActiveLayerId(),
    }));
    expect(state.layers).toHaveLength(1);
    expect(state.layers[0]).toEqual({
      id: state.active,
      name: 'レイヤー 1',
      visible: true,
      opacity: 1,
      locked: false,
      blendMode: 'normal',
    });
  });
});

test.describe('addLayer', () => {
  test('アクティブレイヤーの 1 つ上に、通し番号の名前で追加する。アクティブレイヤーは変えない', async ({
    page,
  }) => {
    await setup(page);
    const r = await page.evaluate(() => {
      const first = window.paint79.getActiveLayerId();
      const id = window.paint79.addLayer();
      window.paint79.addLayer({ name: '下', index: 0 });
      return {
        id,
        first,
        active: window.paint79.getActiveLayerId(),
        layers: window.paint79.getLayers(),
      };
    });
    expect(r.layers.map((l) => l.name)).toEqual(['下', 'レイヤー 1', 'レイヤー 2']);
    expect(r.layers[2]!.id).toBe(r.id);
    expect(r.active).toBe(r.first);
  });

  test('属性を指定できる', async ({ page }) => {
    await setup(page);
    const layer = await page.evaluate(() => {
      const id = window.paint79.addLayer({
        name: 'x',
        visible: false,
        opacity: 0.5,
        locked: true,
        blendMode: 'multiply',
      });
      return window.paint79.getLayer(id);
    });
    expect(layer).toMatchObject({
      name: 'x',
      visible: false,
      opacity: 0.5,
      locked: true,
      blendMode: 'multiply',
    });
  });

  test('削除したレイヤーの番号は再利用しない', async ({ page }) => {
    await setup(page);
    await page.evaluate(() => {
      const id = window.paint79.addLayer();
      window.paint79.removeLayer(id);
      window.paint79.addLayer();
    });
    expect(await layerNames(page)).toEqual(['レイヤー 1', 'レイヤー 3']);
  });

  test('不正な引数は例外', async ({ page }) => {
    await setup(page);
    expect(await errorName(page, 'window.paint79.addLayer({ index: 5 })')).toBe('RangeError');
    expect(await errorName(page, 'window.paint79.addLayer({ opacity: 2 })')).toBe('RangeError');
    expect(await errorName(page, "window.paint79.addLayer({ blendMode: 'add' })")).toBe(
      'RangeError',
    );
    expect(await errorName(page, 'window.paint79.addLayer({ name: 1 })')).toBe('TypeError');
  });
});

test.describe('レイヤーの合成', () => {
  test('前面のレイヤーが背面のレイヤーを覆う', async ({ page }) => {
    await setup(page, { width: 100, height: 100 });
    await paintLine(page, '#ff0000');
    await page.evaluate(() => window.paint79.setActiveLayer(window.paint79.addLayer()));
    await paintLine(page, '#0000ff');
    expectColor(await pixel(page, 50, 50), BLUE);
  });

  test('非表示のレイヤーは表示されない', async ({ page }) => {
    await setup(page, { width: 100, height: 100 });
    await paintLine(page, '#ff0000');
    await page.evaluate(() => window.paint79.setActiveLayer(window.paint79.addLayer()));
    await paintLine(page, '#0000ff');
    await page.evaluate(() =>
      window.paint79.setLayerProperties(window.paint79.getActiveLayerId(), { visible: false }),
    );
    expectColor(await pixel(page, 50, 50), RED);
  });

  test('opacity が反映される', async ({ page }) => {
    await setup(page, { width: 100, height: 100 });
    await paintLine(page, '#000000');
    await page.evaluate(() =>
      window.paint79.setLayerProperties(window.paint79.getActiveLayerId(), { opacity: 0.5 }),
    );
    expectColor(await pixel(page, 50, 50), [128, 128, 128, 255], 3);
  });

  test('blendMode が反映される(multiply)', async ({ page }) => {
    await setup(page, { width: 100, height: 100 });
    await paintLine(page, '#ffff00');
    await page.evaluate(() => window.paint79.setActiveLayer(window.paint79.addLayer()));
    await paintLine(page, '#00ffff');
    expectColor(await pixel(page, 50, 50), [0, 255, 255, 255]);
    await page.evaluate(() =>
      window.paint79.setLayerProperties(window.paint79.getActiveLayerId(), {
        blendMode: 'multiply',
      }),
    );
    expectColor(await pixel(page, 50, 50), [0, 255, 0, 255]);
  });

  test('blendMode が反映される(screen / darken / lighten / overlay)', async ({ page }) => {
    await setup(page, { width: 100, height: 100, background: '#808080' });
    await page.evaluate(() => window.paint79.setActiveLayer(window.paint79.addLayer()));
    await paintLine(page, '#ff0000');
    const id = await page.evaluate(() => window.paint79.getActiveLayerId());
    const colorWith = async (blendMode: string) => {
      await page.evaluate(
        ({ id, blendMode }) =>
          window.paint79.setLayerProperties(id, { blendMode: blendMode as never }),
        { id, blendMode },
      );
      return pixel(page, 50, 50);
    };
    expectColor(await colorWith('screen'), [255, 128, 128, 255], 3);
    expectColor(await colorWith('darken'), [128, 0, 0, 255], 3);
    expectColor(await colorWith('lighten'), [255, 128, 128, 255], 3);
    expectColor(await colorWith('overlay'), [255, 0, 0, 255], 3);
  });
});

test.describe('removeLayer', () => {
  test('レイヤーを削除する。最後の 1 枚は削除できない', async ({ page }) => {
    await setup(page);
    const r = await page.evaluate(() => {
      const first = window.paint79.getActiveLayerId();
      const id = window.paint79.addLayer();
      const removed = window.paint79.removeLayer(id);
      const last = window.paint79.removeLayer(first);
      return { removed, last, count: window.paint79.getLayers().length };
    });
    expect(r).toEqual({ removed: true, last: false, count: 1 });
  });

  test('アクティブレイヤーを削除すると、1 つ下のレイヤーがアクティブになる', async ({ page }) => {
    await setup(page);
    const r = await page.evaluate(() => {
      const a = window.paint79.getActiveLayerId();
      const b = window.paint79.addLayer();
      const c = window.paint79.addLayer({ index: 2 });
      window.paint79.setActiveLayer(c);
      window.paint79.removeLayer(c);
      const afterTop = window.paint79.getActiveLayerId();
      window.paint79.setActiveLayer(a);
      window.paint79.removeLayer(a);
      return { afterTop, afterBottom: window.paint79.getActiveLayerId(), b };
    });
    expect(r.afterTop).toBe(r.b);
    expect(r.afterBottom).toBe(r.b);
  });

  test('存在しないレイヤー ID は RangeError', async ({ page }) => {
    await setup(page);
    expect(await errorName(page, "window.paint79.removeLayer('nope')")).toBe('RangeError');
  });
});

test.describe('duplicateLayer', () => {
  test('1 つ上に「<名前> のコピー」として複製する。内容と属性も複製する', async ({ page }) => {
    await setup(page, { width: 100, height: 100 });
    await paintLine(page, '#ff0000');
    const r = await page.evaluate(() => {
      const src = window.paint79.getActiveLayerId();
      window.paint79.setLayerProperties(src, { opacity: 0.5 });
      const id = window.paint79.duplicateLayer(src);
      window.paint79.setLayerProperties(src, { visible: false });
      return {
        layers: window.paint79.getLayers(),
        id,
        active: window.paint79.getActiveLayerId(),
        src,
      };
    });
    expect(r.layers.map((l) => l.name)).toEqual(['レイヤー 1', 'レイヤー 1 のコピー']);
    expect(r.layers[1]).toMatchObject({ id: r.id, opacity: 0.5 });
    expect(r.active).toBe(r.src);
    expectColor(await pixel(page, 50, 50), [255, 128, 128, 255], 3);
  });
});

test.describe('moveLayer', () => {
  test('指定したインデックスへ移動する', async ({ page }) => {
    await setup(page);
    await page.evaluate(() => {
      window.paint79.addLayer({ name: 'B', index: 1 });
      window.paint79.addLayer({ name: 'C', index: 2 });
      window.paint79.moveLayer(window.paint79.getLayers()[0]!.id, 2);
    });
    expect(await layerNames(page)).toEqual(['B', 'C', 'レイヤー 1']);
  });

  test('インデックスが範囲外なら RangeError', async ({ page }) => {
    await setup(page);
    expect(
      await errorName(page, 'window.paint79.moveLayer(window.paint79.getActiveLayerId(), 1)'),
    ).toBe('RangeError');
  });
});

test.describe('mergeDown', () => {
  test('上のレイヤーの内容を opacity と blendMode を適用して下のレイヤーに描画し、上のレイヤーを削除する', async ({
    page,
  }) => {
    await setup(page, { width: 100, height: 100 });
    await paintLine(page, '#ffff00');
    const lower = await page.evaluate(() => window.paint79.getActiveLayerId());
    await page.evaluate(() =>
      window.paint79.setActiveLayer(window.paint79.addLayer({ blendMode: 'multiply' })),
    );
    await paintLine(page, '#00ffff');
    const r = await page.evaluate(() => {
      const upper = window.paint79.getActiveLayerId();
      const merged = window.paint79.mergeDown(upper);
      return {
        merged,
        layers: window.paint79.getLayers(),
        active: window.paint79.getActiveLayerId(),
      };
    });
    expect(r.merged).toBe(true);
    expect(r.layers).toHaveLength(1);
    expect(r.layers[0]).toMatchObject({ id: lower, blendMode: 'normal' });
    expect(r.active).toBe(lower);
    expectColor(await pixel(page, 50, 50), [0, 255, 0, 255]);
  });

  test('上のレイヤーが非表示でも統合する', async ({ page }) => {
    await setup(page, { width: 100, height: 100 });
    await page.evaluate(() => window.paint79.setActiveLayer(window.paint79.addLayer()));
    await paintLine(page, '#ff0000');
    await page.evaluate(() => {
      const id = window.paint79.getActiveLayerId();
      window.paint79.setLayerProperties(id, { visible: false });
      window.paint79.mergeDown(id);
    });
    expectColor(await pixel(page, 50, 50), RED);
  });

  test('最背面のレイヤーでは false を返す', async ({ page }) => {
    await setup(page);
    expect(
      await page.evaluate(() => window.paint79.mergeDown(window.paint79.getActiveLayerId())),
    ).toBe(false);
  });
});

test.describe('setLayerProperties', () => {
  test('指定した属性だけを変更する', async ({ page }) => {
    await setup(page);
    const layer = await page.evaluate(() => {
      const id = window.paint79.getActiveLayerId();
      window.paint79.setLayerProperties(id, { name: '線画', opacity: 0.3 });
      return window.paint79.getLayer(id);
    });
    expect(layer).toMatchObject({ name: '線画', opacity: 0.3, visible: true, blendMode: 'normal' });
  });

  test('値が変化しない場合は履歴に記録しない', async ({ page }) => {
    await setup(page);
    const canUndo = await page.evaluate(() => {
      window.paint79.setLayerProperties(window.paint79.getActiveLayerId(), { visible: true });
      return window.paint79.canUndo();
    });
    expect(canUndo).toBe(false);
  });

  test('ロックされたレイヤーにも API による操作は適用される', async ({ page }) => {
    await setup(page, { width: 100, height: 100 });
    await paintLine(page, '#ff0000');
    await page.evaluate(() => {
      const id = window.paint79.getActiveLayerId();
      window.paint79.setLayerProperties(id, { locked: true });
      window.paint79.clearLayer(id);
    });
    expectColor(await pixel(page, 50, 50), WHITE);
  });
});

test.describe('setActiveLayer / getLayer', () => {
  test('アクティブレイヤーを切り替える。存在しない ID は RangeError', async ({ page }) => {
    await setup(page);
    const r = await page.evaluate(() => {
      const id = window.paint79.addLayer();
      window.paint79.setActiveLayer(id);
      return id === window.paint79.getActiveLayerId();
    });
    expect(r).toBe(true);
    expect(await errorName(page, "window.paint79.setActiveLayer('nope')")).toBe('RangeError');
  });

  test('getLayer は存在しない ID で null を返す', async ({ page }) => {
    await setup(page);
    expect(await page.evaluate(() => window.paint79.getLayer('nope'))).toBeNull();
  });

  test('getLayers が返す値を変更しても、内部の状態は変わらない', async ({ page }) => {
    await setup(page);
    const name = await page.evaluate(() => {
      window.paint79.getLayers()[0]!.name = 'changed';
      return window.paint79.getLayers()[0]!.name;
    });
    expect(name).toBe('レイヤー 1');
  });
});

test.describe('clearLayer', () => {
  test('指定したレイヤー(省略時はアクティブレイヤー)の内容だけを消去する', async ({ page }) => {
    await setup(page, { width: 100, height: 100 });
    await paintLine(page, '#ff0000', 20);
    const bottom = await page.evaluate(() => window.paint79.getActiveLayerId());
    await page.evaluate(() => window.paint79.setActiveLayer(window.paint79.addLayer()));
    await paintLine(page, '#0000ff', 80);
    await page.evaluate(() => window.paint79.clearLayer());
    expectColor(await pixel(page, 50, 80), WHITE);
    expectColor(await pixel(page, 50, 20), RED);
    await page.evaluate((id) => window.paint79.clearLayer(id), bottom);
    expectColor(await pixel(page, 50, 20), WHITE);
  });
});

test.describe('履歴', () => {
  test('レイヤー操作はアンドゥ/リドゥできる。アクティブレイヤーの切り替えは記録しない', async ({
    page,
  }) => {
    await setup(page, { width: 100, height: 100 });
    await paintLine(page, '#ff0000');
    const steps = await page.evaluate(() => {
      const p = window.paint79;
      const snapshot = () => JSON.stringify(p.getLayers());
      const first = p.getActiveLayerId();
      const results: boolean[] = [];
      const check = (op: () => void) => {
        const before = snapshot();
        op();
        const after = snapshot();
        p.undo();
        const undone = snapshot();
        p.redo();
        results.push(before !== after && undone === before && snapshot() === after);
      };
      let id = '';
      check(() => (id = p.addLayer()));
      check(() => p.setLayerProperties(id, { name: 'x', opacity: 0.4 }));
      check(() => p.moveLayer(id, 0));
      check(() => p.duplicateLayer(id));
      check(() => p.mergeDown(p.getLayers()[1]!.id));
      check(() => p.removeLayer(id));
      p.setActiveLayer(first);
      const canUndoBefore = p.canUndo();
      return { results, canUndoBefore };
    });
    expect(steps.results).toEqual([true, true, true, true, true, true]);
  });

  test('レイヤーの削除をアンドゥすると、内容とアクティブレイヤーも元に戻る', async ({ page }) => {
    await setup(page, { width: 100, height: 100 });
    await page.evaluate(() => window.paint79.setActiveLayer(window.paint79.addLayer()));
    await paintLine(page, '#ff0000');
    const id = await page.evaluate(() => window.paint79.getActiveLayerId());
    await page.evaluate((id) => window.paint79.removeLayer(id), id);
    expectColor(await pixel(page, 50, 50), WHITE);
    await page.evaluate(() => window.paint79.undo());
    expectColor(await pixel(page, 50, 50), RED);
    expect(await page.evaluate(() => window.paint79.getActiveLayerId())).toBe(id);
  });

  test('統合をアンドゥすると、下のレイヤーの内容も元に戻る', async ({ page }) => {
    await setup(page, { width: 100, height: 100 });
    await page.evaluate(() => window.paint79.setActiveLayer(window.paint79.addLayer()));
    await paintLine(page, '#ff0000');
    await page.evaluate(() => {
      window.paint79.mergeDown(window.paint79.getActiveLayerId());
      window.paint79.undo();
      window.paint79.setLayerProperties(window.paint79.getLayers()[1]!.id, { visible: false });
    });
    expectColor(await pixel(page, 50, 50), WHITE);
  });

  test('消去をアンドゥすると内容が戻る', async ({ page }) => {
    await setup(page, { width: 100, height: 100 });
    await paintLine(page, '#000000');
    await page.evaluate(() => window.paint79.clearLayer());
    await page.evaluate(() => window.paint79.undo());
    expectColor(await pixel(page, 50, 50), BLACK);
  });
});

test.describe('layerchange', () => {
  test('レイヤーの構成・属性・アクティブレイヤーが変化したときに発生する', async ({ page }) => {
    await setup(page);
    await recordEvents(page, ['layerchange']);
    await page.evaluate(() => {
      const id = window.paint79.addLayer();
      window.paint79.setActiveLayer(id);
      window.paint79.setActiveLayer(id); // 変化しない
      window.paint79.setLayerProperties(id, { name: 'n' });
      window.paint79.undo();
    });
    const list = (await events(page)) as {
      event: { layers: { name: string }[]; activeLayerId: string };
    }[];
    expect(list).toHaveLength(4);
    expect(list[0]!.event.layers).toHaveLength(2);
    expect(list[2]!.event.layers[1]!.name).toBe('n');
    expect(list[3]!.event.layers[1]!.name).toBe('レイヤー 2');
    expect(list[3]!.event.activeLayerId).toBe(list[1]!.event.activeLayerId);
  });
});
