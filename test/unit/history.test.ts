import { describe, expect, test } from 'vitest';
import { History } from '../../src/model/History';

/** 操作の記録先と、それを変更するコマンドを作る */
function setup(limit = 50) {
  const log: string[] = [];
  const history = new History(limit);
  const cmd = (name: string) => ({
    undo: () => log.push(`undo:${name}`),
    redo: () => log.push(`redo:${name}`),
  });
  return { log, history, cmd };
}

describe('History', () => {
  test('初期状態ではアンドゥもリドゥもできない', () => {
    const { history } = setup();
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
    expect(history.undo()).toBe(false);
    expect(history.redo()).toBe(false);
  });

  test('記録した操作を新しい順にアンドゥし、アンドゥした操作をリドゥする', () => {
    const { log, history, cmd } = setup();
    history.push(cmd('a'));
    history.push(cmd('b'));
    expect(history.undo()).toBe(true);
    expect(history.undo()).toBe(true);
    expect(history.undo()).toBe(false);
    expect(history.redo()).toBe(true);
    expect(log).toEqual(['undo:b', 'undo:a', 'redo:a']);
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(true);
  });

  test('push はコマンドを実行しない(実行済みの操作を記録する)', () => {
    const { log, history, cmd } = setup();
    history.push(cmd('a'));
    expect(log).toEqual([]);
  });

  test('アンドゥした後に新しい操作を記録すると、リドゥ可能な履歴は破棄される', () => {
    const { history, cmd } = setup();
    history.push(cmd('a'));
    history.push(cmd('b'));
    history.undo();
    history.push(cmd('c'));
    expect(history.canRedo()).toBe(false);
  });

  test('保持数を超えた分は古いものから破棄される', () => {
    const { log, history, cmd } = setup(2);
    history.push(cmd('a'));
    history.push(cmd('b'));
    history.push(cmd('c'));
    for (let i = 0; i < 10 && history.undo(); i++);
    expect(log).toEqual(['undo:c', 'undo:b']);
  });

  test('clear で履歴を破棄する', () => {
    const { history, cmd } = setup();
    history.push(cmd('a'));
    history.push(cmd('b'));
    history.undo();
    history.clear();
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
  });

  test('状態が変化するたびに onChange が呼ばれる', () => {
    const { history, cmd } = setup();
    let count = 0;
    history.onChange = () => count++;
    history.push(cmd('a'));
    history.undo();
    history.redo();
    history.clear();
    expect(count).toBe(4);
  });
});
