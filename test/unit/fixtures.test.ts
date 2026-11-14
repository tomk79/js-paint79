// 過去の形式バージョンで書き出した Paint79 PNG を読み込めることの確認(AGENTS.md の「データ形式の互換性」)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { extractPaint79Data, hasPaint79Data } from '../../src/format/paint79-chunk';
import { hasUnsafeToCopyPrivateChunk, readChunks } from '../../src/format/png';

describe('形式バージョン 1(test/fixtures/paint79-v1.png)', () => {
  const bytes = new Uint8Array(readFileSync(join(__dirname, '../fixtures/paint79-v1.png')));

  test('レイヤー情報を復元できる', () => {
    const result = extractPaint79Data(bytes);
    expect(result.status).toBe('restored');
    if (result.status !== 'restored') return;
    const { layers, ...rest } = result.data;
    expect(rest).toMatchObject({ width: 120, height: 80, pixelRatio: 1, background: '#ffffff' });
    expect(layers.map((l) => [l.name, l.visible, l.opacity, l.blendMode])).toEqual([
      ['背景', true, 1, 'normal'],
      ['線画', true, 0.5, 'multiply'],
      ['非表示', false, 1, 'normal'],
    ]);
    expect(result.data.activeLayerId).toBe(layers[1]!.id);
    // 各レイヤー画像は PNG
    for (const l of layers) expect(readChunks(l.image)[0]!.type).toBe('IHDR');
  });

  test('Paint79 のデータを含み、「変更してはいけない PNG」と判定される', () => {
    expect(hasPaint79Data(bytes)).toBe(true);
    expect(hasUnsafeToCopyPrivateChunk(bytes)).toBe(true);
  });
});
