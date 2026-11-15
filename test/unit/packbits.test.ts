import { describe, expect, test } from 'vitest';
import { packBits } from '../../src/format/psd/packbits';
import { unpackBits } from '../helpers/packbits';

const bytes = (...values: number[]) => new Uint8Array(values);

describe('packBits', () => {
  test('Apple Technical Note TN1023 の例と一致する', () => {
    const input = bytes(
      0xaa,
      0xaa,
      0xaa,
      0x80,
      0x00,
      0x2a,
      0xaa,
      0xaa,
      0xaa,
      0xaa,
      0x80,
      0x00,
      0x2a,
      0x22,
      0xaa,
      0xaa,
      0xaa,
      0xaa,
      0xaa,
      0xaa,
      0xaa,
      0xaa,
      0xaa,
      0xaa,
    );
    expect(packBits(input)).toEqual(
      bytes(
        0xfe,
        0xaa,
        0x02,
        0x80,
        0x00,
        0x2a,
        0xfd,
        0xaa,
        0x03,
        0x80,
        0x00,
        0x2a,
        0x22,
        0xf7,
        0xaa,
      ),
    );
  });

  test('空の入力は空のバイト列になる', () => {
    expect(packBits(bytes())).toEqual(bytes());
  });

  test('1 バイトの入力は、長さ 1 の非繰り返しになる', () => {
    expect(packBits(bytes(0x42))).toEqual(bytes(0x00, 0x42));
  });

  test('128 バイトを超える繰り返しは、128 バイトごとに区切る', () => {
    const input = new Uint8Array(200).fill(7);
    // 128 バイト(ヘッダー 257 − 128 = 129)と、72 バイト(ヘッダー 257 − 72 = 185)
    expect(packBits(input)).toEqual(bytes(129, 7, 185, 7));
  });

  test('128 バイトを超える非繰り返しは、128 バイトごとに区切る', () => {
    const input = Uint8Array.from({ length: 300 }, (_, i) => i % 256);
    const packed = packBits(input);
    expect(packed.length).toBe(300 + 3);
    expect([packed[0], packed[129], packed[258]]).toEqual([127, 127, 43]);
    expect(unpackBits(packed)).toEqual(input);
  });

  test('任意の入力を、展開すると元に戻る形で圧縮する', () => {
    // 再現できるよう、線形合同法で値を作る。繰り返しが起きやすいよう値の種類を絞る
    let seed = 1;
    const next = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31);
    for (let n = 0; n < 50; n++) {
      const input = Uint8Array.from({ length: next() % 600 }, () => next() % 3);
      expect(unpackBits(packBits(input))).toEqual(input);
    }
  });
});
