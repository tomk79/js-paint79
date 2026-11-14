// PNG 仕様で使われる CRC-32(ISO 3309 / ITU-T V.42、多項式 0xEDB88320)

let table: Uint32Array | null = null;

function getTable(): Uint32Array {
  if (table) return table;
  table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}

/**
 * CRC-32 を計算する。
 * 配列を渡した場合は、それらを連結したバイト列として計算する(連結のためのコピーを避けるため)。
 */
export function crc32(input: Uint8Array | readonly Uint8Array[]): number {
  const t = getTable();
  const parts = input instanceof Uint8Array ? [input] : input;
  let c = 0xffffffff;
  for (const bytes of parts) {
    for (let i = 0; i < bytes.length; i++) {
      c = t[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}
