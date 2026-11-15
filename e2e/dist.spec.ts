// ビルド成果物(dist/)のスモークテスト。npm run build の後に実行する
import { expect, test } from '@playwright/test';
import { BLACK, expectColor, pixel } from './helpers/paint';
import { drawStroke } from './helpers/pointer';

for (const [name, path] of [
  ['ES Modules(dist/paint79.mjs)', '/e2e/pages/dist-esm.html'],
  ['UMD(dist/paint79.js、グローバル変数 Paint79)', '/e2e/pages/dist-umd.html'],
] as const) {
  test(`${name} を読み込んで描画できる`, async ({ page }) => {
    await page.goto(path);
    await page.waitForFunction(() => window.__ready === true);
    await drawStroke(page, [
      [10, 50],
      [90, 50],
    ]);
    expectColor(await pixel(page, 50, 50), BLACK);
    const hasData = await page.evaluate(async () => {
      const blob = await window.paint79.exportPNG();
      return (window.paint79.constructor as typeof window.Paint79).hasData(blob);
    });
    expect(hasData).toBe(true);
    const psd = await page.evaluate(async () => {
      const blob = await window.paint79.exportPSD();
      const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
      return { type: blob.type, signature: String.fromCharCode(...head) };
    });
    expect(psd).toEqual({ type: 'image/vnd.adobe.photoshop', signature: '8BPS' });
    // 同梱した ag-psd で PSD を読み込める
    const opened = await page.evaluate(async () =>
      window.paint79.open(await window.paint79.exportPSD()),
    );
    expect(opened).toEqual({ restored: true });
  });
}

test('同梱したライブラリのライセンス表示を、ビルド成果物に含める', async ({ request }) => {
  const notices = await (await request.get('/dist/THIRD-PARTY-NOTICES.txt')).text();
  for (const name of ['ag-psd', 'pako', 'base64-js']) expect(notices).toContain(name);
  expect(notices).toContain('Permission is hereby granted'); // MIT ライセンスの本文
  for (const file of ['/dist/paint79.mjs', '/dist/paint79.js']) {
    const head = (await (await request.get(file)).text()).slice(0, 300);
    expect(head).toContain('THIRD-PARTY-NOTICES.txt');
  }
});
