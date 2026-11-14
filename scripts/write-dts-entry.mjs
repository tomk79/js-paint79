// dist/types/ に出力された型定義を、dist/paint79.d.ts から参照できるようにする
import { writeFileSync } from 'node:fs';

writeFileSync(
  new URL('../dist/paint79.d.ts', import.meta.url),
  "export * from './types/index.js';\nexport { default } from './types/index.js';\n",
);
