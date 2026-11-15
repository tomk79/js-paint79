// テスト用の PackBits の展開(Apple Technical Note TN1023)
export function unpackBits(packed: Uint8Array): Uint8Array {
  const out: number[] = [];
  let i = 0;
  while (i < packed.length) {
    const header = packed[i++]!;
    if (header < 128) {
      for (let k = 0; k <= header; k++) out.push(packed[i++]!);
    } else if (header > 128) {
      const value = packed[i++]!;
      for (let k = 0; k < 257 - header; k++) out.push(value);
    }
    // 128(−128)は何もしない
  }
  return new Uint8Array(out);
}
