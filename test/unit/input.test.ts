import { describe, expect, test } from 'vitest';
import {
  decidePointerDown,
  decidePointerMove,
  strokeBounds,
  strokeWidth,
  toCanvasPoint,
  type PointerDownContext,
} from '../../src/input/policy';

describe('strokeWidth', () => {
  test('pressure が有効でペンの場合は lineWidth × 筆圧', () => {
    expect(
      strokeWidth({ lineWidth: 10, pressureEnabled: true, pointerType: 'pen', pressure: 0.5 }),
    ).toBe(5);
  });

  test('筆圧の下限は 0.1', () => {
    expect(
      strokeWidth({ lineWidth: 10, pressureEnabled: true, pointerType: 'pen', pressure: 0 }),
    ).toBe(1);
  });

  test('筆圧が 1 を超えても lineWidth を超えない', () => {
    expect(
      strokeWidth({ lineWidth: 10, pressureEnabled: true, pointerType: 'pen', pressure: 1.5 }),
    ).toBe(10);
  });

  test('ペン以外、または pressure が無効の場合は lineWidth', () => {
    expect(
      strokeWidth({ lineWidth: 10, pressureEnabled: true, pointerType: 'mouse', pressure: 0.5 }),
    ).toBe(10);
    expect(
      strokeWidth({ lineWidth: 10, pressureEnabled: true, pointerType: 'touch', pressure: 0.2 }),
    ).toBe(10);
    expect(
      strokeWidth({ lineWidth: 10, pressureEnabled: false, pointerType: 'pen', pressure: 0.2 }),
    ).toBe(10);
  });
});

describe('decidePointerDown', () => {
  const base: PointerDownContext = {
    pointerType: 'mouse',
    readOnly: false,
    pointerTypes: ['mouse', 'touch', 'pen'],
    palmRejection: false,
    penDetected: false,
    layerDrawable: true,
    pointerId: 1,
    activeStrokePointerType: null,
    activeStrokePointerId: null,
  };

  test('条件を満たせばストロークを開始する', () => {
    expect(decidePointerDown(base)).toBe('start');
  });

  test('readOnly なら無視する', () => {
    expect(decidePointerDown({ ...base, readOnly: true })).toBe('ignore');
  });

  test('pointerTypes に含まれない種類なら無視する', () => {
    expect(decidePointerDown({ ...base, pointerTypes: ['pen'] })).toBe('ignore');
  });

  test('未知のポインターの種類は無視する', () => {
    expect(decidePointerDown({ ...base, pointerType: '' })).toBe('ignore');
  });

  test('アクティブレイヤーに描画できなければ無視する', () => {
    expect(decidePointerDown({ ...base, layerDrawable: false })).toBe('ignore');
  });

  test('描画中に別のポインターが押されたら無視する', () => {
    expect(decidePointerDown({ ...base, activeStrokePointerType: 'mouse' })).toBe('ignore');
    expect(
      decidePointerDown({ ...base, pointerType: 'pen', activeStrokePointerType: 'touch' }),
    ).toBe('ignore');
  });

  test('パームリジェクション: ペン検出後のタッチは無視する', () => {
    const ctx = { ...base, pointerType: 'touch', palmRejection: true };
    expect(decidePointerDown(ctx)).toBe('start');
    expect(decidePointerDown({ ...ctx, penDetected: true })).toBe('ignore');
    expect(decidePointerDown({ ...ctx, penDetected: true, palmRejection: false })).toBe('start');
  });

  test('パームリジェクション: タッチの描画中にペンが押されたら、タッチを取り消してペンで開始する', () => {
    const ctx = {
      ...base,
      pointerType: 'pen',
      palmRejection: true,
      penDetected: true,
      activeStrokePointerType: 'touch' as const,
    };
    expect(decidePointerDown(ctx)).toBe('replace');
    expect(decidePointerDown({ ...ctx, pointerTypes: ['touch' as const] })).toBe('ignore');
  });
});

describe('toCanvasPoint', () => {
  test('クライアント座標をキャンバスの CSS ピクセル座標に変換する', () => {
    const rect = { left: 10, top: 20, width: 200, height: 100 };
    expect(toCanvasPoint(60, 70, rect, 200, 100)).toEqual({ x: 50, y: 50 });
  });

  test('表示サイズが CSS で拡大・縮小されている場合は比率で補正する', () => {
    const rect = { left: 0, top: 0, width: 400, height: 200 };
    expect(toCanvasPoint(100, 100, rect, 200, 100)).toEqual({ x: 50, y: 50 });
  });
});

describe('strokeBounds', () => {
  test('点と線幅を含む矩形を、内部解像度のピクセル単位で返す', () => {
    const r = strokeBounds(
      [
        { x: 10, y: 20, width: 4 },
        { x: 30, y: 25, width: 2 },
      ],
      {
        width: 100,
        height: 100,
        pixelRatio: 2,
      },
    );
    // 始点は自身の太さ 4 の点、線分は両端の平均の太さ 3 で描かれる(render/stroke.ts)。
    // x: 10-2-1=7 ～ 30+1.5+1=32.5 → 14 ～ 65、y: 20-2-1=17 ～ 25+1.5+1=27.5 → 34 ～ 55(余白 1px を含む)
    expect(r).toEqual({ x: 14, y: 34, width: 51, height: 21 });
  });

  test('キャンバスの範囲に切り詰める', () => {
    const r = strokeBounds([{ x: -10, y: 95, width: 10 }], {
      width: 100,
      height: 100,
      pixelRatio: 1,
    });
    expect(r).toEqual({ x: 0, y: 89, width: 0, height: 11 });
  });

  test('点がなければ null', () => {
    expect(strokeBounds([], { width: 10, height: 10, pixelRatio: 1 })).toBeNull();
  });

  test('筆圧で太さが変わる線分は、両端の平均の太さで描かれる範囲を含む', () => {
    // 太さ 100 → 10 の線分は、終点の周りも平均の太さ 55(半径 27.5)で描かれる
    const r = strokeBounds(
      [
        { x: 50, y: 100, width: 100 },
        { x: 200, y: 100, width: 10 },
      ],
      { width: 300, height: 200, pixelRatio: 1 },
    );
    // x: 0 ～ 200+27.5+1=228.5 → 229、y: 100-50-1=49 ～ 100+50+1=151
    expect(r).toEqual({ x: 0, y: 49, width: 229, height: 102 });
  });

  test('キャンバスのピクセルサイズには max(1, round(...)) の下限を適用する', () => {
    // 0.2 x 1 = 0.2 は丸めると 0 だが、実際の canvas は 1 x 1
    const r = strokeBounds([{ x: 0.1, y: 0.1, width: 4 }], {
      width: 0.2,
      height: 0.2,
      pixelRatio: 1,
    });
    expect(r).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });
});

describe('decidePointerDown(pointerup の取りこぼし)', () => {
  const base: PointerDownContext = {
    pointerType: 'mouse',
    readOnly: false,
    pointerTypes: ['mouse', 'touch', 'pen'],
    palmRejection: false,
    penDetected: false,
    layerDrawable: true,
    pointerId: 1,
    activeStrokePointerType: 'mouse',
    activeStrokePointerId: 1,
  };

  test('描画中のポインターと同じ ID の pointerdown は、描画中のストロークを確定してから判断し直す', () => {
    expect(decidePointerDown(base)).toBe('restart');
  });

  test('別の ID なら従来どおり無視する', () => {
    expect(decidePointerDown({ ...base, pointerId: 2 })).toBe('ignore');
  });
});

describe('decidePointerMove', () => {
  test('描画中のポインターでなければ無視する', () => {
    expect(decidePointerMove({ isStrokePointer: false, pointerType: 'mouse', buttons: 1 })).toBe(
      'ignore',
    );
  });

  test('ボタンが押されていればストロークを延長する', () => {
    expect(decidePointerMove({ isStrokePointer: true, pointerType: 'mouse', buttons: 1 })).toBe(
      'extend',
    );
  });

  test('マウスのボタンがすべて離されていれば、pointerup を取りこぼしたものとして確定する', () => {
    expect(decidePointerMove({ isStrokePointer: true, pointerType: 'mouse', buttons: 0 })).toBe(
      'finish',
    );
  });

  test('ペン・タッチは buttons を見ない(pointerup が必ず届くため)', () => {
    expect(decidePointerMove({ isStrokePointer: true, pointerType: 'pen', buttons: 0 })).toBe(
      'extend',
    );
    expect(decidePointerMove({ isStrokePointer: true, pointerType: 'touch', buttons: 0 })).toBe(
      'extend',
    );
  });
});
