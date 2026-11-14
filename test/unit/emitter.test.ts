import { describe, expect, test, vi } from 'vitest';
import { Emitter } from '../../src/events/Emitter';

describe('Emitter', () => {
  const names = ['a', 'b'] as const;

  test('登録したリスナーにイベントオブジェクトを渡す', () => {
    const e = new Emitter(names);
    const fn = vi.fn();
    e.on('a', fn);
    e.emit('a', { v: 1 });
    e.emit('b', { v: 2 });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith({ v: 1 });
  });

  test('off で解除する', () => {
    const e = new Emitter(names);
    const fn = vi.fn();
    e.on('a', fn);
    e.off('a', fn);
    e.emit('a', {});
    expect(fn).not.toHaveBeenCalled();
  });

  test('同じリスナーを複数回登録しても 1 回だけ呼ぶ', () => {
    const e = new Emitter(names);
    const fn = vi.fn();
    e.on('a', fn);
    e.on('a', fn);
    e.emit('a', {});
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('未知のイベント名は TypeError', () => {
    const e = new Emitter(names);
    expect(() => e.on('c', () => {})).toThrow(TypeError);
    expect(() => e.off('c', () => {})).toThrow(TypeError);
  });

  test('リスナーが関数でなければ TypeError', () => {
    const e = new Emitter(names);
    expect(() => e.on('a', 'x' as never)).toThrow(TypeError);
  });

  test('リスナーの中で解除しても、ほかのリスナーは呼ばれる', () => {
    const e = new Emitter(names);
    const second = vi.fn();
    const first = () => e.off('a', first);
    e.on('a', first);
    e.on('a', second);
    e.emit('a', {});
    expect(second).toHaveBeenCalled();
  });

  test('clear で全リスナーを解除する', () => {
    const e = new Emitter(names);
    const fn = vi.fn();
    e.on('a', fn);
    e.clear();
    e.emit('a', {});
    expect(fn).not.toHaveBeenCalled();
  });
});
