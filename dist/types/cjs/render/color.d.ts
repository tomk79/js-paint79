/**
 * ブラウザが CSS カラーとして解釈できる文字列かどうか。
 * canvas の fillStyle は解釈できない値の代入を無視するため、異なる 2 つの値を事前に設定して比べる。
 */
export declare function isCssColor(value: string): boolean;
/** CSS カラーとして解釈できなければ RangeError を投げる */
export declare function assertCssColor(value: string, name: string): string;
