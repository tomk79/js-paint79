// PSD の画像データの圧縮に使う PackBits(DOM 非依存)
// 仕様: docs/specs/psd.md

/** 1 回の繰り返し・非繰り返しで表せる最大のバイト数 */
const MAX_RUN = 128;

/**
 * 同じ値が何バイト続いて初めて繰り返しとして書くか。
 * 2 バイトの繰り返しは、非繰り返しの途中にあれば 2 バイトのまま書くほうが短くなるため 3 とする
 * (Apple Technical Note TN1023 の例と同じ選び方)
 */
const MIN_REPEAT = 3;

function repeatLength(row: Uint8Array, start: number): number {
  const value = row[start];
  let n = 1;
  while (n < MAX_RUN && start + n < row.length && row[start + n] === value) n++;
  return n;
}

/** 1 行分のバイト列を PackBits で圧縮する */
export function packBits(row: Uint8Array): Uint8Array {
  // 最悪の場合でも、128 バイトごとに 1 バイトのヘッダーが増えるだけ
  const out = new Uint8Array(row.length + Math.ceil(row.length / MAX_RUN));
  let o = 0;
  let i = 0;
  while (i < row.length) {
    const run = repeatLength(row, i);
    if (run >= MIN_REPEAT) {
      // ヘッダー 1 − n(符号付き 8 bit)に続けて、繰り返す値を 1 バイト
      out[o++] = 257 - run;
      out[o++] = row[i]!;
      i += run;
      continue;
    }
    // 次に繰り返しが始まる位置か、最大長までを非繰り返しとして書く
    let end = i + 1;
    while (end < row.length && end - i < MAX_RUN && repeatLength(row, end) < MIN_REPEAT) end++;
    out[o++] = end - i - 1;
    out.set(row.subarray(i, end), o);
    o += end - i;
    i = end;
  }
  return out.slice(0, o);
}
