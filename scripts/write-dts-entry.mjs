// tsc が dist/types/esm/ に出力した型定義から、ESM 用と CommonJS 用の型定義の入口を作る
//
// package.json の "type" は "module" ではないため、dist/ 直下の .d.ts は CommonJS の型として解釈される。
// 実行時の形式は、import では dist/paint79.mjs(ESM、既定のエクスポートがクラス)、require では
// dist/paint79.js(UMD、module.exports がクラスそのもの)と異なるため、型定義もそれぞれに合わせて用意する。
// 片方の形式だけで書くと、moduleResolution が node16 / nodenext の利用者の環境で `new Paint79()` が
// 型エラーになる
//
// - dist/types/esm/: ESM として解釈させる(package.json の "type": "module")
// - dist/types/cjs/: 同じ内容を CommonJS として解釈させる。node16 では、CommonJS の型定義から
//   ESM の型定義を参照できないため、複製を置く
// - dist/paint79.d.mts: import 用の入口
// - dist/paint79.d.ts: require 用の入口。`export =` でクラスそのものを公開する
import { cpSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const dist = new URL('../dist/', import.meta.url);

writeFileSync(new URL('types/esm/package.json', dist), '{ "type": "module" }\n');
cpSync(new URL('types/esm/', dist), new URL('types/cjs/', dist), { recursive: true });
writeFileSync(new URL('types/cjs/package.json', dist), '{ "type": "commonjs" }\n');

writeFileSync(
  new URL('paint79.d.mts', dist),
  "export * from './types/esm/index.js';\nexport { default } from './types/esm/index.js';\n",
);

// `export =` と、ほかのエクスポートは併用できないため、公開している型はクラスと同名の名前空間に入れる。
// 型の一覧は、手で書くと追加したときに漏れるため、型定義から取り出す
const entry = fileURLToPath(new URL('types/cjs/index.d.ts', dist));
const program = ts.createProgram([entry], { noEmit: true, types: [] });
const checker = program.getTypeChecker();
const moduleSymbol = checker.getSymbolAtLocation(program.getSourceFile(entry));
const typeNames = checker
  .getExportsOfModule(moduleSymbol)
  .map((symbol) => symbol.getName())
  .filter((name) => name !== 'default')
  .sort();
for (const name of typeNames) {
  const symbol = checker.getExportsOfModule(moduleSymbol).find((s) => s.getName() === name);
  const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  // 型の別名では、値や型引数を引き継げない。追加された場合は、この生成方法を見直す
  if (target.flags & ts.SymbolFlags.Value) {
    throw new Error(`型以外のエクスポート ${name} は、CommonJS 用の型定義に含められません`);
  }
  if (target.declarations?.some((d) => d.typeParameters?.length)) {
    throw new Error(`型引数を持つ型 ${name} は、CommonJS 用の型定義に含められません`);
  }
}

writeFileSync(
  new URL('paint79.d.ts', dist),
  [
    "import _Paint79 from './types/cjs/index.js';",
    "import type * as _types from './types/cjs/index.js';",
    'declare class Paint79 extends _Paint79 {}',
    'declare namespace Paint79 {',
    ...typeNames.map((name) => `  export type ${name} = _types.${name};`),
    '}',
    'export = Paint79;',
    '',
  ].join('\n'),
);
