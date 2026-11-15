// ビルド成果物に同梱したライブラリのライセンス表示を、dist/THIRD-PARTY-NOTICES.txt に書き出す。
// ag-psd とその依存(pako、base64-js)は dist/paint79.mjs / paint79.js に組み込んで配布するため、
// MIT ライセンス等が求める著作権表示とライセンス本文を、成果物と一緒に配布する必要がある
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

// ag-psd を起点に解決する(pako、base64-js は ag-psd の依存として入っている)
const require = createRequire(import.meta.url);
const agPsdDir = dirname(require.resolve('ag-psd/package.json'));
const fromAgPsd = createRequire(join(agPsdDir, 'package.json'));

const packages = [
  ['ag-psd', agPsdDir],
  ...['pako', 'base64-js'].map((name) => [
    name,
    dirname(fromAgPsd.resolve(`${name}/package.json`)),
  ]),
];

const sections = packages.map(([name, dir]) => {
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const license = readFileSync(join(dir, 'LICENSE'), 'utf8').trim();
  return `${name} ${pkg.version}(ライセンス: ${pkg.license})\n${'-'.repeat(72)}\n\n${license}\n`;
});

writeFileSync(
  new URL('../dist/THIRD-PARTY-NOTICES.txt', import.meta.url),
  `@tomk79/paint79 には、PSD の読み込みのため、次のライブラリを組み込んでいます。\n` +
    `This build of @tomk79/paint79 includes the following third-party software.\n\n` +
    `${'='.repeat(72)}\n\n` +
    sections.join(`\n${'='.repeat(72)}\n\n`),
);
