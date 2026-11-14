import { describe, expect, test } from 'vitest';
import { crc32 } from '../../src/format/crc32';

const ascii = (s: string) => new TextEncoder().encode(s);

describe('crc32', () => {
  test('空のバイト列は 0', () => {
    expect(crc32(new Uint8Array())).toBe(0);
  });

  test('標準のチェック値 "123456789" は 0xCBF43926', () => {
    expect(crc32(ascii('123456789'))).toBe(0xcbf43926);
  });

  test('PNG の IEND チャンクの CRC は 0xAE426082', () => {
    expect(crc32(ascii('IEND'))).toBe(0xae426082);
  });

  test('複数のバイト列を連結したものとして計算できる', () => {
    expect(crc32([ascii('1234'), ascii('56789')])).toBe(0xcbf43926);
  });
});
