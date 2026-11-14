import { describe, expect, test } from 'vitest';
import {
  normalizeOptions,
  validateColor,
  validateLayerProps,
  validateLineWidth,
  validateTool,
} from '../../src/model/options';

const env = { containerWidth: 640, containerHeight: 480, devicePixelRatio: 2 };

describe('normalizeOptions', () => {
  test('省略したオプションには既定値を使う', () => {
    expect(normalizeOptions(undefined, env)).toEqual({
      width: 640,
      height: 480,
      background: '#ffffff',
      tool: 'pen',
      color: '#000000',
      lineWidth: 4,
      pressure: true,
      pointerTypes: ['mouse', 'touch', 'pen'],
      palmRejection: false,
      historyLimit: 50,
      pixelRatio: 2,
      readOnly: false,
    });
  });

  test('親要素のサイズが 0 の場合は 300 x 150 を使う', () => {
    const o = normalizeOptions({}, { ...env, containerWidth: 0, containerHeight: 0 });
    expect([o.width, o.height]).toEqual([300, 150]);
  });

  test('指定したオプションを使う', () => {
    const o = normalizeOptions(
      {
        width: 100,
        height: 50,
        background: null,
        tool: 'eraser',
        color: 'red',
        lineWidth: 1.5,
        pressure: false,
        pointerTypes: ['pen'],
        palmRejection: true,
        historyLimit: 3,
        pixelRatio: 1,
        readOnly: true,
      },
      env,
    );
    expect(o).toMatchObject({
      width: 100,
      height: 50,
      background: null,
      tool: 'eraser',
      pointerTypes: ['pen'],
      historyLimit: 3,
      pixelRatio: 1,
    });
  });

  test('pointerTypes は複製して保持する(呼び出し側の配列の変更に影響されない)', () => {
    const pointerTypes: ('mouse' | 'pen')[] = ['mouse'];
    const o = normalizeOptions({ pointerTypes }, env);
    pointerTypes.push('pen');
    expect(o.pointerTypes).toEqual(['mouse']);
  });

  test('型が誤っていれば TypeError', () => {
    const cases: Record<string, unknown>[] = [
      { width: '100' },
      { background: 1 },
      { color: 1 },
      { pressure: 'yes' },
      { pointerTypes: 'pen' },
      { readOnly: 1 },
      { palmRejection: null },
    ];
    for (const c of cases) {
      expect(() => normalizeOptions(c, env), JSON.stringify(c)).toThrow(TypeError);
    }
    expect(() => normalizeOptions('x' as never, env)).toThrow(TypeError);
  });

  test('値が範囲外なら RangeError', () => {
    const cases: Record<string, unknown>[] = [
      { width: 0 },
      { height: -1 },
      { width: Infinity },
      { lineWidth: 0 },
      { pixelRatio: 0 },
      { historyLimit: 0 },
      { historyLimit: 1.5 },
      { tool: 'brush' },
      { pointerTypes: ['mouse', 'stylus'] },
      { color: '' },
      { background: '' },
    ];
    for (const c of cases) {
      expect(() => normalizeOptions(c, env), JSON.stringify(c)).toThrow(RangeError);
    }
  });
});

describe('個別の検証関数', () => {
  test('validateTool', () => {
    expect(validateTool('pen')).toBe('pen');
    expect(() => validateTool('brush')).toThrow(RangeError);
    expect(() => validateTool(1)).toThrow(TypeError);
  });

  test('validateColor', () => {
    expect(validateColor('#123')).toBe('#123');
    expect(() => validateColor('')).toThrow(RangeError);
    expect(() => validateColor(null)).toThrow(TypeError);
  });

  test('validateLineWidth', () => {
    expect(validateLineWidth(2)).toBe(2);
    expect(() => validateLineWidth(-1)).toThrow(RangeError);
    expect(() => validateLineWidth(NaN)).toThrow(RangeError);
    expect(() => validateLineWidth('2')).toThrow(TypeError);
  });
});

describe('validateLayerProps', () => {
  test('指定された属性だけを返す', () => {
    expect(validateLayerProps({ name: 'a', opacity: 0.5 })).toEqual({ name: 'a', opacity: 0.5 });
    expect(validateLayerProps(undefined)).toEqual({});
  });

  test('未知の属性は無視する', () => {
    expect(validateLayerProps({ name: 'a', foo: 1 })).toEqual({ name: 'a' });
  });

  test('型が誤っていれば TypeError、範囲外なら RangeError', () => {
    expect(() => validateLayerProps({ name: 1 })).toThrow(TypeError);
    expect(() => validateLayerProps({ visible: 'yes' })).toThrow(TypeError);
    expect(() => validateLayerProps({ locked: 0 })).toThrow(TypeError);
    expect(() => validateLayerProps({ opacity: '1' })).toThrow(TypeError);
    expect(() => validateLayerProps({ opacity: 1.1 })).toThrow(RangeError);
    expect(() => validateLayerProps({ opacity: -0.1 })).toThrow(RangeError);
    expect(() => validateLayerProps({ blendMode: 'add' })).toThrow(RangeError);
    expect(() => validateLayerProps('x')).toThrow(TypeError);
  });
});
