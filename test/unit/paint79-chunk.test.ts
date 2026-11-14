import { describe, expect, test } from 'vitest';
import {
  embedPaint79Data,
  extractPaint79Data,
  hasPaint79Data,
  type Paint79Data,
} from '../../src/format/paint79-chunk';
import {
  buildChunk,
  compositeChecksum,
  hasUnsafeToCopyPrivateChunk,
  readChunks,
} from '../../src/format/png';
import { chunk, makePng } from '../helpers/png';

const enc = (s: string) => new TextEncoder().encode(s);

/**
 * 完成イメージ makePng()(2 x 2)と整合するサンプル。
 * width 1 x pixelRatio 2 = 2 ピクセルで、各レイヤー画像も 2 x 2。
 */
function sampleData(): Paint79Data {
  return {
    width: 1,
    height: 1,
    pixelRatio: 2,
    background: '#ffffff',
    activeLayerId: 'layer-2',
    layers: [
      {
        id: 'layer-1',
        name: '下塗り',
        visible: true,
        opacity: 1,
        locked: false,
        blendMode: 'normal',
        image: makePng(),
      },
      {
        id: 'layer-2',
        name: '線画',
        visible: false,
        opacity: 0.8,
        locked: true,
        blendMode: 'multiply',
        image: makePng({ rgba: new Uint8Array(16).fill(255) }),
      },
    ],
  };
}

/** paNT チャンクのデータ部分を、仕様どおりに組み立てる */
function rawPaintChunk(
  version: number,
  header: unknown,
  layerBytes: Uint8Array = new Uint8Array(),
) {
  const json = enc(typeof header === 'string' ? header : JSON.stringify(header));
  const out = new Uint8Array(16 + json.length + layerBytes.length);
  out.set(enc('paint79\0'), 0);
  const v = new DataView(out.buffer);
  v.setUint32(8, version);
  v.setUint32(12, json.length);
  out.set(json, 16);
  out.set(layerBytes, 16 + json.length);
  return out;
}

describe('embedPaint79Data', () => {
  test('完成イメージの IEND の直前に paNT チャンクを 1 つ追加する', () => {
    const composite = makePng();
    const png = embedPaint79Data(composite, sampleData());
    expect(readChunks(png).map((c) => c.type)).toEqual(['IHDR', 'IDAT', 'paNT', 'IEND']);
  });

  test('完成イメージの画像データ(IHDR / IDAT)は変更しない', () => {
    const composite = makePng();
    expect(compositeChecksum(embedPaint79Data(composite, sampleData()))).toBe(
      compositeChecksum(composite),
    );
  });

  test('チャンクのデータは マジックナンバー・形式バージョン・ヘッダー長・ヘッダー・レイヤー画像 の順', () => {
    const composite = makePng();
    const data = sampleData();
    const paNT = readChunks(embedPaint79Data(composite, data)).find((c) => c.type === 'paNT')!;
    const d = paNT.data;
    const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
    expect(new TextDecoder().decode(d.subarray(0, 8))).toBe('paint79\0');
    expect(v.getUint32(8)).toBe(1);
    const headerLength = v.getUint32(12);
    const header = JSON.parse(new TextDecoder().decode(d.subarray(16, 16 + headerLength)));

    expect(header).toEqual({
      width: 1,
      height: 1,
      pixelRatio: 2,
      background: '#ffffff',
      activeLayerId: 'layer-2',
      compositeChecksum: compositeChecksum(composite),
      layers: [
        {
          id: 'layer-1',
          name: '下塗り',
          visible: true,
          opacity: 1,
          locked: false,
          blendMode: 'normal',
          offset: 0,
          length: data.layers[0]!.image.length,
        },
        {
          id: 'layer-2',
          name: '線画',
          visible: false,
          opacity: 0.8,
          locked: true,
          blendMode: 'multiply',
          offset: data.layers[0]!.image.length,
          length: data.layers[1]!.image.length,
        },
      ],
    });

    const area = d.subarray(16 + headerLength);
    expect(area.length).toBe(data.layers[0]!.image.length + data.layers[1]!.image.length);
    expect(area.subarray(0, data.layers[0]!.image.length)).toEqual(data.layers[0]!.image);
  });

  test('出力は「非公開・コピー不可チャンクを含む PNG」と判定される', () => {
    expect(hasUnsafeToCopyPrivateChunk(embedPaint79Data(makePng(), sampleData()))).toBe(true);
  });

  test('すでに paNT チャンクがある完成イメージには、置き換えて 1 つだけ含める', () => {
    const once = embedPaint79Data(makePng(), sampleData());
    const twice = embedPaint79Data(once, sampleData());
    expect(readChunks(twice).filter((c) => c.type === 'paNT')).toHaveLength(1);
  });
});

describe('extractPaint79Data', () => {
  test('embedPaint79Data で埋め込んだデータを復元できる', () => {
    const data = sampleData();
    const result = extractPaint79Data(embedPaint79Data(makePng(), data));
    expect(result).toEqual({ status: 'restored', data });
  });

  test('paNT チャンクがなければ no-data', () => {
    expect(extractPaint79Data(makePng())).toEqual({ status: 'no-data' });
  });

  test('PNG でなければ no-data', () => {
    expect(extractPaint79Data(enc('GIF89a'))).toEqual({ status: 'no-data' });
  });

  test('マジックナンバーが一致しない paNT チャンクは無視する', () => {
    const other = buildChunk('paNT', enc('other app data'));
    expect(extractPaint79Data(makePng({ after: [other] }))).toEqual({ status: 'no-data' });
  });

  test('形式バージョンが対応範囲外なら unsupported-version', () => {
    const c = buildChunk('paNT', rawPaintChunk(2, {}));
    expect(extractPaint79Data(makePng({ after: [c] }))).toEqual({
      status: 'unsupported-version',
    });
  });

  test('ヘッダーの JSON が解析できなければ corrupted', () => {
    const c = buildChunk('paNT', rawPaintChunk(1, '{ broken'));
    expect(extractPaint79Data(makePng({ after: [c] }))).toEqual({ status: 'corrupted' });
  });

  test('ヘッダー長がデータ長を超えていれば corrupted', () => {
    const raw = rawPaintChunk(1, {});
    new DataView(raw.buffer).setUint32(12, 9999);
    expect(extractPaint79Data(makePng({ after: [buildChunk('paNT', raw)] }))).toEqual({
      status: 'corrupted',
    });
  });

  test('レイヤーの offset / length がデータ領域の範囲外なら corrupted', () => {
    const composite = makePng();
    const data = sampleData();
    const good = readChunks(embedPaint79Data(composite, data)).find((c) => c.type === 'paNT')!;
    const headerLength = new DataView(good.data.buffer, good.data.byteOffset).getUint32(12);
    const header = JSON.parse(new TextDecoder().decode(good.data.subarray(16, 16 + headerLength)));
    header.layers[1].length += 1;
    const c = buildChunk('paNT', rawPaintChunk(1, header, good.data.subarray(16 + headerLength)));
    expect(extractPaint79Data(makePng({ after: [c] }))).toEqual({ status: 'corrupted' });
  });

  test('ヘッダーの項目の型・値が誤っていれば corrupted', () => {
    const layerPng = makePng();
    const base = {
      width: 2,
      height: 2,
      pixelRatio: 1,
      background: null,
      activeLayerId: 'a',
      compositeChecksum: compositeChecksum(makePng()),
      layers: [
        {
          id: 'a',
          name: 'a',
          visible: true,
          opacity: 1,
          locked: false,
          blendMode: 'normal',
          offset: 0,
          length: layerPng.length,
        },
      ],
    };
    const open = (header: unknown) =>
      extractPaint79Data(
        makePng({ after: [buildChunk('paNT', rawPaintChunk(1, header, layerPng))] }),
      );
    // 基準のヘッダーは正しく復元できる(以下の corrupted が、変更した項目によるものであることの確認)
    expect(open(base).status).toBe('restored');

    const variants: unknown[] = [
      { ...base, width: '2' },
      { ...base, width: 0 },
      { ...base, background: 1 },
      { ...base, background: '' },
      { ...base, layers: [] },
      { ...base, layers: [{ ...base.layers[0], opacity: 2 }] },
      { ...base, layers: [{ ...base.layers[0], blendMode: 'unknown' }] },
      { ...base, layers: [{ ...base.layers[0], visible: 'yes' }] },
      { ...base, layers: [{ ...base.layers[0], id: '' }] },
      { ...base, layers: [base.layers[0], base.layers[0]] }, // ID の重複
    ];
    for (const header of variants) {
      expect(open(header), JSON.stringify(header)).toEqual({ status: 'corrupted' });
    }
  });

  test('完成イメージのピクセルサイズが max(1, round(width x pixelRatio)) と一致しなければ corrupted', () => {
    // ヘッダーは 1 x 1 x pixelRatio 2 = 2 x 2 を宣言している
    expect(
      extractPaint79Data(embedPaint79Data(makePng({ width: 3, height: 2 }), sampleData())),
    ).toEqual({
      status: 'corrupted',
    });
    // 巨大なサイズを宣言していても、画像の実際のサイズと一致しなければ読み込まない
    const huge = { ...sampleData(), width: 100000, height: 100000 };
    expect(extractPaint79Data(embedPaint79Data(makePng(), huge))).toEqual({ status: 'corrupted' });
  });

  test('round と max(1, ...) でピクセルサイズを計算する', () => {
    const fractional = { ...sampleData(), width: 0.75, height: 1.25, pixelRatio: 2 }; // 1.5 → 2、2.5 → 3
    const layers = fractional.layers.map((l) => ({
      ...l,
      image: makePng({ width: 2, height: 3 }),
    }));
    expect(
      extractPaint79Data(
        embedPaint79Data(makePng({ width: 2, height: 3 }), { ...fractional, layers }),
      ).status,
    ).toBe('restored');
    const tiny = { ...sampleData(), width: 0.1, height: 0.1, pixelRatio: 1 };
    const tinyLayers = tiny.layers.map((l) => ({ ...l, image: makePng({ width: 1, height: 1 }) }));
    expect(
      extractPaint79Data(
        embedPaint79Data(makePng({ width: 1, height: 1 }), { ...tiny, layers: tinyLayers }),
      ).status,
    ).toBe('restored');
  });

  test('レイヤー画像が PNG でない、またはサイズが完成イメージと一致しなければ corrupted', () => {
    const notPng = sampleData();
    notPng.layers[0]!.image = enc('not a png');
    expect(extractPaint79Data(embedPaint79Data(makePng(), notPng))).toEqual({
      status: 'corrupted',
    });
    const wrongSize = sampleData();
    wrongSize.layers[1]!.image = makePng({ width: 4, height: 4 });
    expect(extractPaint79Data(embedPaint79Data(makePng(), wrongSize))).toEqual({
      status: 'corrupted',
    });
  });

  test('activeLayerId が存在しないレイヤーを指す場合は、最前面のレイヤーをアクティブにする', () => {
    const data = sampleData();
    data.activeLayerId = 'missing';
    const result = extractPaint79Data(embedPaint79Data(makePng(), data));
    expect(result.status).toBe('restored');
    if (result.status === 'restored') expect(result.data.activeLayerId).toBe('layer-2');
  });

  test('完成イメージが変更されていれば image-modified', () => {
    const embedded = embedPaint79Data(makePng(), sampleData());
    const paNT = readChunks(embedded).find((c) => c.type === 'paNT')!;
    const rgba = new Uint8Array(16).fill(200);
    const modified = makePng({ rgba, after: [buildChunk('paNT', paNT.data)] });
    expect(extractPaint79Data(modified)).toEqual({ status: 'image-modified' });
  });

  test('ignoreMismatch を指定すると、完成イメージが変更されていても復元する', () => {
    const embedded = embedPaint79Data(makePng(), sampleData());
    const paNT = readChunks(embedded).find((c) => c.type === 'paNT')!;
    const modified = makePng({
      rgba: new Uint8Array(16).fill(200),
      after: [buildChunk('paNT', paNT.data)],
    });
    expect(extractPaint79Data(modified, { ignoreMismatch: true }).status).toBe('restored');
  });

  test('paNT チャンクは IDAT より前にあっても検出する', () => {
    const embedded = embedPaint79Data(makePng(), sampleData());
    const paNT = readChunks(embedded).find((c) => c.type === 'paNT')!;
    const moved = makePng({ before: [buildChunk('paNT', paNT.data)] });
    expect(extractPaint79Data(moved).status).toBe('restored');
  });
});

describe('hasPaint79Data', () => {
  test('マジックナンバーが一致する paNT チャンクがあれば true', () => {
    expect(hasPaint79Data(embedPaint79Data(makePng(), sampleData()))).toBe(true);
  });

  test('ヘッダーが壊れていても、マジックナンバーが一致すれば true', () => {
    const c = buildChunk('paNT', rawPaintChunk(1, '{ broken'));
    expect(hasPaint79Data(makePng({ after: [c] }))).toBe(true);
  });

  test('paNT チャンクがない、またはマジックナンバーが一致しなければ false', () => {
    expect(hasPaint79Data(makePng())).toBe(false);
    expect(hasPaint79Data(makePng({ after: [chunk('paNT', enc('xx'))] }))).toBe(false);
    expect(hasPaint79Data(enc('not png'))).toBe(false);
  });
});
