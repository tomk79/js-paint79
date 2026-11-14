// 互換性テスト用のフィクスチャ test/fixtures/paint79-v1.png を生成する。
// 注意: フィクスチャは形式バージョン 1 の互換性を保証するためのもの。既存のファイルを上書きしてはいけない
// (AGENTS.md の「データ形式の互換性」)。そのため、ファイルが存在する場合は何もしない。
import { existsSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const out = new URL('../test/fixtures/paint79-v1.png', import.meta.url);
if (existsSync(out)) {
  console.error('test/fixtures/paint79-v1.png は既に存在するため、生成しません。');
  process.exit(1);
}

const server = await createServer({ server: { port: 5180, strictPort: true } });
await server.listen();
// PW_CHANNEL を指定すると、インストール済みのブラウザ(例: chrome)を使う
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL });
try {
  const page = await browser.newPage();
  await page.goto('http://localhost:5180/e2e/pages/index.html');
  await page.waitForFunction(() => window.__ready === true);
  const bytes = await page.evaluate(async () => {
    const solid = (w, h, color) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, w, h);
      return createImageBitmap(c);
    };
    const el = document.getElementById('paint-area');
    const p = new window.Paint79(el, { width: 120, height: 80, pixelRatio: 1 });
    const base = p.getActiveLayerId();
    p.setLayerProperties(base, { name: '背景' });
    // 背景レイヤー: 左上に赤の矩形
    await p.loadImage(await solid(20, 20, '#ff0000'), { layerId: base });
    // 線画レイヤー: 右下に青の矩形(不透明度 0.5、乗算)
    const line = p.addLayer({ name: '線画', opacity: 0.5, blendMode: 'multiply' });
    const blue = document.createElement('canvas');
    blue.width = 120;
    blue.height = 80;
    const bctx = blue.getContext('2d');
    bctx.fillStyle = '#0000ff';
    bctx.fillRect(100, 60, 20, 20);
    await p.loadImage(await createImageBitmap(blue), { layerId: line });
    // 非表示レイヤー: 中央に緑の矩形
    const hidden = p.addLayer({ name: '非表示', visible: false, index: 2 });
    const green = document.createElement('canvas');
    green.width = 120;
    green.height = 80;
    const gctx = green.getContext('2d');
    gctx.fillStyle = '#00ff00';
    gctx.fillRect(50, 30, 20, 20);
    await p.loadImage(await createImageBitmap(green), { layerId: hidden });
    p.setActiveLayer(line);
    const blob = await p.exportPNG();
    return [...new Uint8Array(await blob.arrayBuffer())];
  });
  writeFileSync(out, new Uint8Array(bytes));
  console.log(`生成しました: ${out.pathname}(${bytes.length} バイト)`);
} finally {
  await browser.close();
  await server.close();
}
