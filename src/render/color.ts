// CSS カラーの検証(DOM 依存)
let probe: CanvasRenderingContext2D | null = null;

/**
 * ブラウザが CSS カラーとして解釈できる文字列かどうか。
 * canvas の fillStyle は解釈できない値の代入を無視するため、異なる 2 つの値を事前に設定して比べる。
 */
export function isCssColor(value: string): boolean {
  probe ??= document.createElement('canvas').getContext('2d');
  if (!probe) return true;
  probe.fillStyle = '#000000';
  probe.fillStyle = value;
  const a = probe.fillStyle;
  probe.fillStyle = '#ffffff';
  probe.fillStyle = value;
  return a === probe.fillStyle;
}

/** CSS カラーとして解釈できなければ RangeError を投げる */
export function assertCssColor(value: string, name: string): string {
  if (!isCssColor(value)) {
    throw new RangeError(`${name} に CSS カラーとして解釈できない値が指定されました: ${value}`);
  }
  return value;
}
