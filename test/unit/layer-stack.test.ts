import { describe, expect, test } from 'vitest';
import { LayerStack } from '../../src/model/LayerStack';

/** レイヤーの画像の代わりに文字列を使う */
function setup() {
  const stack = new LayerStack<string>();
  const first = stack.create('s1');
  stack.insert(first, 0);
  stack.setActive(first.id);
  return { stack, first };
}

describe('LayerStack', () => {
  test('create は通し番号の名前と既定の属性を持つレイヤーを作る(挿入はしない)', () => {
    const { stack, first } = setup();
    expect(first).toMatchObject({
      name: 'レイヤー 1',
      visible: true,
      opacity: 1,
      locked: false,
      blendMode: 'normal',
      surface: 's1',
    });
    const second = stack.create('s2', { name: '線画', opacity: 0.5 });
    expect(second).toMatchObject({ name: '線画', opacity: 0.5 });
    expect(stack.layers).toHaveLength(1);
    expect(stack.create('s3').name).toBe('レイヤー 3');
  });

  test('レイヤー ID は一意', () => {
    const { stack } = setup();
    const ids = new Set([stack.create('a').id, stack.create('b').id, stack.create('c').id]);
    expect(ids.size).toBe(3);
  });

  test('insert / remove / indexOf', () => {
    const { stack, first } = setup();
    const b = stack.create('b');
    const c = stack.create('c');
    stack.insert(b, 1);
    stack.insert(c, 0);
    expect(stack.layers.map((l) => l.surface)).toEqual(['c', 's1', 'b']);
    expect(stack.indexOf(first.id)).toBe(1);
    expect(stack.remove(first.id)).toBe(1);
    expect(stack.layers.map((l) => l.surface)).toEqual(['c', 'b']);
  });

  test('move はレイヤーを指定したインデックスへ移動する', () => {
    const { stack } = setup();
    stack.insert(stack.create('b'), 1);
    stack.insert(stack.create('c'), 2);
    stack.move(stack.layers[0]!.id, 2);
    expect(stack.layers.map((l) => l.surface)).toEqual(['b', 'c', 's1']);
    stack.move(stack.layers[2]!.id, 0);
    expect(stack.layers.map((l) => l.surface)).toEqual(['s1', 'b', 'c']);
  });

  test('get は存在しない ID で null、require は RangeError', () => {
    const { stack, first } = setup();
    expect(stack.get(first.id)).toBe(first);
    expect(stack.get('nope')).toBeNull();
    expect(() => stack.require('nope')).toThrow(RangeError);
    expect(() => stack.require(1 as never)).toThrow(TypeError);
  });

  test('アクティブレイヤー', () => {
    const { stack, first } = setup();
    expect(stack.active).toBe(first);
    const b = stack.create('b');
    stack.insert(b, 1);
    stack.setActive(b.id);
    expect(stack.activeId).toBe(b.id);
    expect(() => stack.setActive('nope')).toThrow(RangeError);
  });

  test('info は画像を含まない LayerInfo の複製を背面から順に返す', () => {
    const { stack, first } = setup();
    const info = stack.info();
    expect(info).toEqual([
      {
        id: first.id,
        name: 'レイヤー 1',
        visible: true,
        opacity: 1,
        locked: false,
        blendMode: 'normal',
      },
    ]);
    info[0]!.name = 'changed';
    expect(first.name).toBe('レイヤー 1');
  });

  test('replaceAll で全レイヤーを置き換え、通し番号をレイヤー数から数え直す', () => {
    const { stack } = setup();
    stack.create('x');
    stack.create('y');
    const a = stack.create('a', { name: 'A' });
    const b = stack.create('b', { name: 'B' });
    stack.replaceAll([a, b], b.id);
    expect(stack.layers.map((l) => l.name)).toEqual(['A', 'B']);
    expect(stack.activeId).toBe(b.id);
    expect(stack.create('c').name).toBe('レイヤー 3');
  });

  test('ID を指定してレイヤーを作れる(読み込み時に保存された ID を復元するため)', () => {
    const { stack } = setup();
    const l = stack.create('s', { name: 'n' }, 'layer-saved');
    expect(l.id).toBe('layer-saved');
  });
});

describe('LayerStack.setOrder', () => {
  test('並び順とアクティブレイヤーを置き換える。名前の通し番号は変えない(履歴の復元に使う)', () => {
    const { stack, first } = setup();
    const b = stack.create('b');
    stack.insert(b, 1);
    stack.setActive(b.id);
    stack.setOrder([b, first], first.id);
    expect(stack.layers.map((l) => l.surface)).toEqual(['b', 's1']);
    expect(stack.activeId).toBe(first.id);
    expect(stack.create('c').name).toBe('レイヤー 3');
  });
});

describe('レイヤー ID の一意性', () => {
  test('ID を指定して作ったレイヤー(読み込んだレイヤー)の ID を、後から発行しない', () => {
    const { stack } = setup();
    const restored = stack.create('r', {}, 'layer-2');
    stack.insert(restored, 1);
    stack.remove(restored.id);
    const ids = [stack.create('a').id, stack.create('b').id, stack.create('c').id];
    expect(ids).not.toContain('layer-2');
  });

  test('削除したレイヤーの ID を再び発行しない', () => {
    const { stack, first } = setup();
    const b = stack.create('b');
    stack.insert(b, 1);
    stack.remove(b.id);
    expect([stack.create('c').id, stack.create('d').id]).not.toContain(b.id);
    expect(stack.create('e').id).not.toBe(first.id);
  });
});
