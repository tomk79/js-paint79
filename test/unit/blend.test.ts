import { expect, test } from 'vitest';
import { compositeOperation } from '../../src/render/blend';

test('合成モードを canvas の globalCompositeOperation に対応させる', () => {
  expect(compositeOperation('normal')).toBe('source-over');
  expect(compositeOperation('multiply')).toBe('multiply');
  expect(compositeOperation('screen')).toBe('screen');
  expect(compositeOperation('overlay')).toBe('overlay');
  expect(compositeOperation('darken')).toBe('darken');
  expect(compositeOperation('lighten')).toBe('lighten');
});
