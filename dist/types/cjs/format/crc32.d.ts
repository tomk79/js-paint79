/**
 * CRC-32 を計算する。
 * 配列を渡した場合は、それらを連結したバイト列として計算する(連結のためのコピーを避けるため)。
 */
export declare function crc32(input: Uint8Array | readonly Uint8Array[]): number;
