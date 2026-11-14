import { describe, expect, test } from 'vitest';
import {
  buildChunk,
  compositeChecksum,
  hasUnsafeToCopyPrivateChunk,
  insertChunkBeforeIEND,
  isPng,
  readChunks,
} from '../../src/format/png';
import { crc32 } from '../../src/format/crc32';
import { chunk, concat, makePng, SIGNATURE } from '../helpers/png';

const bytes = (s: string) => new TextEncoder().encode(s);

describe('isPng', () => {
  test('PNG シグネチャで始まれば true', () => {
    expect(isPng(makePng())).toBe(true);
  });

  test('PNG シグネチャで始まらなければ false', () => {
    expect(isPng(bytes('GIF89a...'))).toBe(false);
    expect(isPng(new Uint8Array([0x89, 0x50]))).toBe(false);
  });
});

describe('readChunks', () => {
  test('チャンクの名前・データ・位置を出現順に返す', () => {
    const png = makePng({ before: [chunk('tEXt', bytes('a\0b'))] });
    const chunks = readChunks(png);
    expect(chunks.map((c) => c.type)).toEqual(['IHDR', 'tEXt', 'IDAT', 'IEND']);
    expect(chunks[0]!.offset).toBe(8);
    expect(new TextDecoder().decode(chunks[1]!.data)).toBe('a\0b');
  });

  test('PNG でなければ TypeError', () => {
    expect(() => readChunks(bytes('not png'))).toThrow(TypeError);
  });

  test('途中で切れている場合は、読めたチャンクまでを返す', () => {
    const png = makePng();
    const chunks = readChunks(png.subarray(0, png.length - 6));
    expect(chunks.map((c) => c.type)).toEqual(['IHDR', 'IDAT']);
  });
});

describe('buildChunk', () => {
  test('長さ・名前・データ・CRC を並べたバイト列を返す', () => {
    const data = bytes('hello');
    expect(buildChunk('teST', data)).toEqual(chunk('teST', data));
  });

  test('名前が英字 4 文字でなければ TypeError', () => {
    expect(() => buildChunk('abc', new Uint8Array())).toThrow(TypeError);
    expect(() => buildChunk('ab1D', new Uint8Array())).toThrow(TypeError);
  });
});

describe('insertChunkBeforeIEND', () => {
  test('IEND の直前にチャンクを挿入する', () => {
    const png = makePng();
    const extra = buildChunk('prIV', bytes('data'));
    const result = insertChunkBeforeIEND(png, extra);
    expect(readChunks(result).map((c) => c.type)).toEqual(['IHDR', 'IDAT', 'prIV', 'IEND']);
    expect(result.length).toBe(png.length + extra.length);
  });

  test('IEND がなければ TypeError', () => {
    const png = makePng();
    expect(() => insertChunkBeforeIEND(png.subarray(0, png.length - 12), new Uint8Array())).toThrow(
      TypeError,
    );
  });
});

describe('hasUnsafeToCopyPrivateChunk', () => {
  test('一般的な補助チャンクのみの PNG は false', () => {
    const png = makePng({
      before: [
        chunk('sRGB', new Uint8Array([0])),
        chunk('gAMA', new Uint8Array(4)),
        chunk('pHYs', new Uint8Array(9)),
        chunk('iCCP', bytes('p\0\0x')),
      ],
      after: [chunk('tEXt', bytes('k\0v')), chunk('iTXt', bytes('k\0\0\0\0\0v')), chunk('eXIf')],
    });
    expect(hasUnsafeToCopyPrivateChunk(png)).toBe(false);
  });

  test('非公開・コピー不可のチャンクがあれば true(IDAT より後ろにあっても検出する)', () => {
    expect(hasUnsafeToCopyPrivateChunk(makePng({ after: [chunk('paNT', bytes('x'))] }))).toBe(true);
    expect(hasUnsafeToCopyPrivateChunk(makePng({ before: [chunk('mkBF', bytes('x'))] }))).toBe(
      true,
    );
  });

  test('非公開でもコピー可(4 文字目が小文字)なら false', () => {
    expect(hasUnsafeToCopyPrivateChunk(makePng({ after: [chunk('prVw', bytes('x'))] }))).toBe(
      false,
    );
  });

  test('公開でコピー不可(2 文字目が大文字)なら false', () => {
    expect(hasUnsafeToCopyPrivateChunk(makePng({ after: [chunk('iDOT', bytes('x'))] }))).toBe(
      false,
    );
  });

  test('IEND より後ろのデータは見ない', () => {
    const png = concat(makePng(), chunk('paNT', bytes('x')));
    expect(hasUnsafeToCopyPrivateChunk(png)).toBe(false);
  });

  test('PNG でなければ false', () => {
    expect(hasUnsafeToCopyPrivateChunk(bytes('not png at all'))).toBe(false);
  });

  test('壊れた PNG(IEND がない)でも例外を投げず、読めた範囲で判定する', () => {
    const png = makePng();
    expect(hasUnsafeToCopyPrivateChunk(png.subarray(0, png.length - 4))).toBe(false);
    expect(hasUnsafeToCopyPrivateChunk(concat(SIGNATURE, new Uint8Array([0xff, 0xff])))).toBe(
      false,
    );
  });
});

describe('compositeChecksum', () => {
  test('IHDR のデータと全 IDAT のデータを連結した CRC-32 を "crc32:" + 16 進数 8 桁で返す', () => {
    const png = makePng();
    const chunks = readChunks(png);
    const ihdrData = chunks.find((c) => c.type === 'IHDR')!.data;
    const idatData = chunks.find((c) => c.type === 'IDAT')!.data;
    const expected = crc32([ihdrData, idatData]).toString(16).padStart(8, '0');
    expect(compositeChecksum(png)).toBe(`crc32:${expected}`);
  });

  test('補助チャンクを追加しても値は変わらない', () => {
    expect(compositeChecksum(makePng({ after: [chunk('tEXt', bytes('k\0v'))] }))).toBe(
      compositeChecksum(makePng()),
    );
  });

  test('画素データが変わると値が変わる', () => {
    const rgba = new Uint8Array(16);
    rgba[0] = 255;
    expect(compositeChecksum(makePng({ rgba }))).not.toBe(compositeChecksum(makePng()));
  });
});
