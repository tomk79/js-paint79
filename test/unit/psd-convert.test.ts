import { describe, expect, test } from 'vitest';
import {
  applyMask,
  flattenLayers,
  isLocked,
  maskTo8bit,
  to8bit,
  toBlendMode,
  type PsdTreeNode,
} from '../../src/format/psd/convert';

describe('toBlendMode', () => {
  test('対応する 6 種の描画モードは、同じ合成モードになる', () => {
    expect(
      ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten'].map(toBlendMode),
    ).toEqual(['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten']);
  });

  test('それ以外の描画モードや、記録がない場合は normal', () => {
    expect(['color dodge', 'pass through', 'hue', undefined].map(toBlendMode)).toEqual([
      'normal',
      'normal',
      'normal',
      'normal',
    ]);
  });
});

describe('isLocked', () => {
  test('画像ピクセルのロック、またはすべてのロックが設定されていれば true', () => {
    expect(isLocked({ composite: true })).toBe(true);
    expect(isLocked({ all: true })).toBe(true);
  });

  test('透明部分や位置のロックだけ、またはロックの記録がなければ false', () => {
    expect(isLocked({ transparency: true, position: true })).toBe(false);
    expect(isLocked(undefined)).toBe(false);
  });
});

describe('to8bit', () => {
  test('8 bit の値はそのまま', () => {
    const data = new Uint8ClampedArray([0, 128, 255, 10]);
    expect(Array.from(to8bit(data))).toEqual([0, 128, 255, 10]);
  });

  test('16 bit の値は 257 で割って丸める', () => {
    const data = new Uint16Array([0, 257 * 128, 65535, 300]);
    expect(Array.from(to8bit(data))).toEqual([0, 128, 255, 1]);
  });

  test('32 bit の色はリニアな値としてガンマ 2.2 で変換し、透明度はそのまま 255 倍する', () => {
    const data = new Float32Array([0, 0.5, 1.5, 0.5]);
    // 0.5 ^ (1 / 2.2) × 255 = 186.0…、1.5 は 1 に切り詰める
    expect(Array.from(to8bit(data))).toEqual([0, 186, 255, 128]);
  });
});

describe('maskTo8bit', () => {
  test('32 bit のマスクの値は、ガンマを適用せずに 255 倍する', () => {
    // マスクは透明度として使うため、0.5 は 186 ではなく 128 になる
    const data = new Float32Array([0.5, 0.5, 0.5, 1, 1.5, -1, 0.25, 1]);
    expect(Array.from(maskTo8bit(data))).toEqual([128, 128, 128, 255, 255, 0, 64, 255]);
  });

  test('16 bit のマスクの値は、色と同じく 257 で割って丸める', () => {
    const data = new Uint16Array([257 * 128, 257 * 128, 257 * 128, 65535]);
    expect(Array.from(maskTo8bit(data))).toEqual([128, 128, 128, 255]);
  });
});

describe('applyMask', () => {
  /** 透明度だけを並べる */
  const alphas = (rgba: Uint8ClampedArray) => Array.from(rgba).filter((_, i) => i % 4 === 3);

  test('マスクの値(グレースケール)を、レイヤーの透明度に掛け合わせる', () => {
    // レイヤーは (1, 1) から 2 x 1、すべて不透明
    const layer = {
      left: 1,
      top: 1,
      width: 2,
      height: 1,
      rgba: new Uint8ClampedArray(8).fill(255),
    };
    // マスクは (1, 1) から 2 x 1。左は 128、右は 0
    const mask = {
      left: 1,
      top: 1,
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([128, 128, 128, 255, 0, 0, 0, 255]),
      defaultColor: 255,
    };
    expect(alphas(applyMask(layer, mask))).toEqual([128, 0]);
  });

  test('マスクの範囲外は、マスクの既定の色を使う', () => {
    // レイヤーは (0, 0) から 3 x 1。透明度は 200
    const rgba = new Uint8ClampedArray(12);
    for (let i = 3; i < 12; i += 4) rgba[i] = 200;
    const layer = { left: 0, top: 0, width: 3, height: 1, rgba };
    // マスクは (1, 0) の 1 画素だけ(値 255)。範囲外の既定の色は 0(隠す)
    const mask = {
      left: 1,
      top: 0,
      width: 1,
      height: 1,
      data: new Uint8ClampedArray([255, 255, 255, 255]),
      defaultColor: 0,
    };
    expect(alphas(applyMask(layer, mask))).toEqual([0, 200, 0]);
  });
});

describe('flattenLayers', () => {
  interface Node extends PsdTreeNode<Node> {
    name: string;
  }
  const summary = (nodes: Node[]) =>
    flattenLayers(nodes).map((l) => [l.node.name, l.visible, l.opacity, l.recordIndex]);

  test('グループのないレイヤーは、そのまま背面から順に並べる', () => {
    expect(summary([{ name: 'A' }, { name: 'B', hidden: true, opacity: 0.5 }])).toEqual([
      ['A', true, 1, 0],
      ['B', false, 0.5, 1],
    ]);
  });

  test('グループを解体し、非表示は祖先と AND、不透明度は祖先と掛け合わせる', () => {
    const nodes: Node[] = [
      { name: '下' },
      {
        name: 'グループ',
        opacity: 0.5,
        children: [
          { name: '中 1', opacity: 0.5 },
          { name: '入れ子', hidden: true, children: [{ name: '中 2' }] },
        ],
      },
      { name: '上' },
    ];
    // レコードの並び: 下(0)、グループの区切り(1)、中 1(2)、入れ子の区切り(3)、中 2(4)、
    // 入れ子(5)、グループ(6)、上(7)
    expect(summary(nodes)).toEqual([
      ['下', true, 1, 0],
      ['中 1', true, 0.25, 2],
      ['中 2', false, 0.5, 4],
      ['上', true, 1, 7],
    ]);
  });

  test('空のグループは、レイヤーにならない', () => {
    expect(summary([{ name: '空', children: [] }, { name: 'A' }])).toEqual([['A', true, 1, 2]]);
  });
});
