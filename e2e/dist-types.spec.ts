// ビルド成果物の型定義(dist/*.d.ts、dist/*.d.mts)のテスト。npm run build の後に実行する
//
// 利用者の TypeScript の設定(moduleResolution と、ESM / CommonJS のどちらで書いているか)によって、
// package.json の exports のどの条件で、どの型定義が選ばれ、どの形式として解釈されるかが変わる。
// 一時ディレクトリに利用者のプロジェクトを作り、node_modules からこのパッケージを参照して型チェックする
import { expect, test } from '@playwright/test';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import ts from 'typescript';

const ROOT = resolve(__dirname, '..');

// ESM で書いた利用者のコード。既定のエクスポートがクラスとして使え、型を名前付きで import できる
const ESM_SOURCE = `
import Paint79, { type LayerInfo, type Paint79EventMap, type Paint79Options } from '@tomk79/paint79';
const options: Paint79Options = { width: 100 };
const paint79: Paint79 = new Paint79(document.body, options);
paint79.setColor('#ff0000');
const layers: LayerInfo[] = paint79.getLayers();
const hasData: Promise<boolean> = Paint79.hasData(new Blob());
paint79.on('layerchange', (event: Paint79EventMap['layerchange']) => event.activeLayerId);
// @ts-expect-error 型が正しく解決されていれば、誤った引数はエラーになる
paint79.setColor(1);
export { layers, hasData };
`;

// CommonJS で書いた利用者のコード。require() はクラスそのものを返し、型はその名前空間から参照する
const CJS_SOURCE = `
import Paint79 = require('@tomk79/paint79');
const options: Paint79.Paint79Options = { width: 100 };
const paint79: Paint79 = new Paint79(document.body, options);
paint79.setColor('#ff0000');
const layers: Paint79.LayerInfo[] = paint79.getLayers();
const hasData: Promise<boolean> = Paint79.hasData(new Blob());
paint79.on('layerchange', (event: Paint79.Paint79EventMap['layerchange']) => event.activeLayerId);
// @ts-expect-error 型が正しく解決されていれば、誤った引数はエラーになる
paint79.setColor(1);
export = { layers, hasData };
`;

const cases = [
  {
    name: 'moduleResolution: bundler',
    module: 'esnext',
    resolution: 'bundler',
    type: 'module',
    source: ESM_SOURCE,
  },
  {
    name: 'moduleResolution: nodenext の ESM',
    module: 'nodenext',
    resolution: 'nodenext',
    type: 'module',
    source: ESM_SOURCE,
  },
  {
    name: 'moduleResolution: nodenext の CommonJS',
    module: 'nodenext',
    resolution: 'nodenext',
    type: 'commonjs',
    source: CJS_SOURCE,
  },
  {
    name: 'moduleResolution: node16 の ESM',
    module: 'node16',
    resolution: 'node16',
    type: 'module',
    source: ESM_SOURCE,
  },
  {
    name: 'moduleResolution: node16 の CommonJS',
    module: 'node16',
    resolution: 'node16',
    type: 'commonjs',
    source: CJS_SOURCE,
  },
] as const;

/** このパッケージを node_modules に置いた、利用者のプロジェクトを一時ディレクトリに作る */
function createConsumer(type: 'module' | 'commonjs'): string {
  const dir = mkdtempSync(join(tmpdir(), 'paint79-types-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ type }));
  mkdirSync(join(dir, 'node_modules', '@tomk79'), { recursive: true });
  symlinkSync(ROOT, join(dir, 'node_modules', '@tomk79', 'paint79'), 'dir');
  return dir;
}

for (const c of cases) {
  test(`型定義: ${c.name} で、利用者のコードが型チェックを通る`, () => {
    const dir = createConsumer(c.type);
    try {
      const file = join(dir, 'index.ts');
      writeFileSync(file, c.source);
      const { options, errors } = ts.convertCompilerOptionsFromJson(
        {
          module: c.module,
          moduleResolution: c.resolution,
          target: 'es2022',
          lib: ['es2022', 'dom'],
          strict: true,
          noEmit: true,
          // 型定義そのものの誤りも検出する
          skipLibCheck: false,
          types: [],
        },
        dir,
      );
      expect(errors).toEqual([]);
      const program = ts.createProgram([file], options);
      const diagnostics = ts.getPreEmitDiagnostics(program).map((d) =>
        ts.formatDiagnostic(d, {
          getCanonicalFileName: (f) => f,
          getCurrentDirectory: () => dir,
          getNewLine: () => '\n',
        }),
      );
      expect(diagnostics).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('型定義: CommonJS の型(export =)が、require() の実際の戻り値と一致する', () => {
  const dir = createConsumer('commonjs');
  try {
    const exported = createRequire(join(dir, 'index.js'))('@tomk79/paint79');
    // require() はクラスそのものを返す(.default はない)
    expect(typeof exported).toBe('function');
    expect(typeof exported.hasData).toBe('function');
    expect(exported.default).toBeUndefined();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
