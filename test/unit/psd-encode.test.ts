import { createHash } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { BLEND_MODES } from '../../src/format/paint79-chunk';
import {
  assertPsdSize,
  encodePsd,
  type PsdDocument,
  type PsdLayer,
} from '../../src/format/psd/encode';
import { assertSectionLength } from '../../src/format/psd/writer';
import { readPsdBytes as read } from '../helpers/psd';

type RGBA = [number, number, number, number];

/** 単色で塗りつぶした RGBA を作る */
function solid(width: number, height: number, color: RGBA): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set(color, i);
  return data;
}

function doc(overrides: Partial<PsdDocument> = {}): PsdDocument {
  const width = overrides.width ?? 4;
  const height = overrides.height ?? 3;
  return {
    width,
    height,
    dpi: 72,
    activeIndex: 0,
    layers: [],
    composite: solid(width, height, [255, 255, 255, 255]),
    ...overrides,
  };
}

function layer(overrides: Partial<PsdLayer> & { rgba: Uint8ClampedArray }): PsdLayer {
  return {
    name: 'レイヤー 1',
    visible: true,
    opacity: 1,
    blendMode: 'normal',
    locked: false,
    ...overrides,
  };
}

/** 読み戻した画像の (x, y) の画素 */
function at(image: { data: ArrayLike<number>; width: number }, x: number, y: number): RGBA {
  const i = (y * image.width + x) * 4;
  return [image.data[i]!, image.data[i + 1]!, image.data[i + 2]!, image.data[i + 3]!];
}

/** PSD のレイヤー数(レイヤー情報の先頭の符号付き 16 bit)を、バイト列から直接読む */
function rawLayerCount(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 26; // ヘッダー
  p += 4 + view.getUint32(p); // カラーモードデータ
  p += 4 + view.getUint32(p); // Image Resources
  p += 4; // レイヤーとマスクの情報の長さ
  p += 4; // レイヤー情報の長さ
  return view.getInt16(p);
}

describe('encodePsd', () => {
  test('8 bit の RGB の PSD として、幅・高さと統合画像を書き出す', () => {
    const composite = solid(4, 3, [10, 20, 30, 255]);
    const bytes = encodePsd(doc({ composite }));
    expect(new TextDecoder().decode(bytes.subarray(0, 4))).toBe('8BPS');
    const psd = read(bytes);
    expect([psd.width, psd.height, psd.bitsPerChannel, psd.colorMode]).toEqual([4, 3, 8, 3]);
    expect(psd.channels).toBe(3);
    expect(at(psd.imageData!, 3, 2)).toEqual([10, 20, 30, 255]);
  });

  test('レイヤーを背面から前面の順に、透明でない範囲に切り詰めて書き出す', () => {
    const bottom = new Uint8ClampedArray(4 * 3 * 4);
    bottom.set([255, 0, 0, 255], (1 * 4 + 1) * 4); // (1, 1) に赤
    const top = new Uint8ClampedArray(4 * 3 * 4);
    for (let x = 0; x < 4; x++) top.set([0, 0, 255, 128], (2 * 4 + x) * 4); // 最下行に半透明の青
    const psd = read(
      encodePsd(
        doc({ layers: [layer({ name: 'A', rgba: bottom }), layer({ name: 'B', rgba: top })] }),
      ),
    );
    expect(psd.children!.map((l) => l.name)).toEqual(['A', 'B']);
    const [a, b] = psd.children!;
    expect([a!.top, a!.left, a!.bottom, a!.right]).toEqual([1, 1, 2, 2]);
    expect(at(a!.imageData!, 0, 0)).toEqual([255, 0, 0, 255]);
    expect([b!.top, b!.left, b!.bottom, b!.right]).toEqual([2, 0, 3, 4]);
    expect(at(b!.imageData!, 3, 0)).toEqual([0, 0, 255, 128]);
  });

  test('不透明度を 0〜255 に丸めて、非表示のレイヤーも非表示として書き出す', () => {
    const rgba = solid(4, 3, [0, 0, 0, 255]);
    const psd = read(
      encodePsd(
        doc({
          layers: [layer({ rgba, opacity: 0.5 }), layer({ rgba, visible: false, opacity: 0.2 })],
        }),
      ),
    );
    const [a, b] = psd.children!;
    // ag-psd は 0〜255 の値を 255 で割って返す
    expect(Math.round(a!.opacity! * 255)).toBe(128);
    expect(a!.hidden).toBe(false);
    expect(Math.round(b!.opacity! * 255)).toBe(51);
    expect(b!.hidden).toBe(true);
  });

  test('合成モードを、PSD の対応する描画モードとして書き出す', () => {
    const rgba = solid(4, 3, [0, 0, 0, 255]);
    const psd = read(
      encodePsd(doc({ layers: BLEND_MODES.map((blendMode) => layer({ rgba, blendMode })) })),
    );
    // ag-psd は描画モードのキー(norm, mul, scrn, over, dark, lite)を次の名前で返す
    expect(psd.children!.map((l) => l.blendMode)).toEqual([
      'normal',
      'multiply',
      'screen',
      'overlay',
      'darken',
      'lighten',
    ]);
  });

  test('ロックしたレイヤーは、画像ピクセルのロックを設定して書き出す', () => {
    const rgba = solid(4, 3, [0, 0, 0, 255]);
    const psd = read(
      encodePsd(doc({ layers: [layer({ rgba, locked: true }), layer({ rgba, locked: false })] })),
    );
    const [locked, unlocked] = psd.children!;
    expect(locked!.protected).toEqual({ transparency: false, composite: true, position: false });
    expect(unlocked!.protected?.composite ?? false).toBe(false);
  });

  test('ASCII 以外の文字を含むレイヤー名を、Unicode のレイヤー名として書き出す', () => {
    const rgba = solid(4, 3, [0, 0, 0, 255]);
    const name = '線画 ✏️ layer';
    const bytes = encodePsd(doc({ layers: [layer({ rgba, name })] }));
    expect(read(bytes).children![0]!.name).toBe(name);
    // 互換用の Pascal 文字列では、ASCII 以外の文字を ? に置き換える
    const ascii = new TextDecoder('latin1').decode(bytes);
    expect(ascii).toContain('?? ?? layer');
  });

  test('すべて透明なレイヤーは、大きさ 0 x 0 のレイヤーとして書き出す', () => {
    const empty = new Uint8ClampedArray(4 * 3 * 4);
    const filled = solid(4, 3, [1, 2, 3, 255]);
    const psd = read(
      encodePsd(
        doc({
          layers: [layer({ name: '空', rgba: empty }), layer({ name: '塗り', rgba: filled })],
        }),
      ),
    );
    const [a, b] = psd.children!;
    expect([a!.name, a!.top, a!.left, a!.bottom, a!.right]).toEqual(['空', 0, 0, 0, 0]);
    // 後ろのレイヤーの画素がずれずに読める
    expect([b!.name, b!.top, b!.left, b!.bottom, b!.right]).toEqual(['塗り', 0, 0, 3, 4]);
    expect(at(b!.imageData!, 3, 2)).toEqual([1, 2, 3, 255]);
  });

  test('統合画像に透明な画素があれば、透明度を含む 4 チャンネルで、色を白と合成して書き出す', () => {
    const composite = solid(4, 3, [0, 0, 255, 255]);
    composite.set([0, 0, 0, 0], 0); // (0, 0) は完全に透明
    // (1, 0) は半透明の中間色。0 や 255 の成分は、白との合成の有無によらず同じ値に戻るため避ける
    composite.set([100, 150, 200, 102], 4);
    const bytes = encodePsd(doc({ composite, layers: [layer({ rgba: composite })] }));
    // 透明度のチャンネルが統合画像のものであることを、負のレイヤー数で示す
    expect(rawLayerCount(bytes)).toBe(-1);
    const psd = read(bytes);
    expect(psd.channels).toBe(4);
    const image = psd.imageData!;
    expect(at(image, 0, 0)[3]).toBe(0);
    expect(at(image, 3, 2)).toEqual([0, 0, 255, 255]);
    // ag-psd は白との合成を元に戻して返す。白と合成していなければ、色が変わってしまう
    const [r, g, b, a] = at(image, 1, 0);
    expect(a).toBe(102);
    for (const [actual, expected] of [
      [r, 100],
      [g, 150],
      [b, 200],
    ]) {
      expect(Math.abs(actual! - expected!)).toBeLessThanOrEqual(2);
    }
  });

  test('統合画像がすべて不透明なら、3 チャンネルで、レイヤー数は正の値で書き出す', () => {
    const composite = solid(4, 3, [0, 0, 255, 255]);
    const bytes = encodePsd(doc({ composite, layers: [layer({ rgba: composite })] }));
    expect(rawLayerCount(bytes)).toBe(1);
    expect(read(bytes).channels).toBe(3);
  });

  test('解像度を ppi として書き出す', () => {
    const res = read(encodePsd(doc({ dpi: 144 }))).imageResources!.resolutionInfo!;
    expect(res.horizontalResolution).toBe(144);
    expect(res.verticalResolution).toBe(144);
    expect([res.horizontalResolutionUnit, res.verticalResolutionUnit]).toEqual(['PPI', 'PPI']);
  });

  test('解像度が PSD で表せる範囲を超える場合は、その範囲に収める', () => {
    const high = read(encodePsd(doc({ dpi: 72 * 1000 }))).imageResources!.resolutionInfo!;
    expect(high.horizontalResolution).toBe(32767);
    const low = read(encodePsd(doc({ dpi: 1e-9 }))).imageResources!.resolutionInfo!;
    expect(low.horizontalResolution).toBe(1 / 65536);
  });

  test('sRGB の ICC プロファイルを埋め込む', () => {
    const icc = read(encodePsd(doc())).imageResources!.iccProfile!;
    expect(new TextDecoder().decode(icc.subarray(36, 40))).toBe('acsp');
    // Compact-ICC-Profiles の sRGB-v2-micro.icc(CC0)
    expect(createHash('sha256').update(icc).digest('hex')).toBe(
      '0a8a33aea66a6f154a5642ebe168ef287e73265d9f7b51c42a45e6eedbacda7a',
    );
  });

  test('アクティブレイヤーのインデックスを、ターゲットレイヤーとして書き出す', () => {
    const rgba = solid(4, 3, [0, 0, 0, 255]);
    const layers = [layer({ rgba }), layer({ rgba }), layer({ rgba })];
    const psd = read(encodePsd(doc({ layers, activeIndex: 1 })));
    expect(psd.imageResources!.layerState).toBe(1);
  });

  describe('大きさの上限', () => {
    test('幅・高さが 30,000 以下なら書き出せる', () => {
      expect(() => assertPsdSize(30000, 30000)).not.toThrow();
      const composite = solid(30000, 1, [0, 0, 0, 255]);
      expect(() => encodePsd(doc({ width: 30000, height: 1, composite }))).not.toThrow();
    });

    test('幅または高さが 30,000 を超える場合は RangeError', () => {
      expect(() => assertPsdSize(30001, 1)).toThrow(RangeError);
      expect(() => assertPsdSize(1, 30001)).toThrow(RangeError);
      const composite = solid(30001, 1, [0, 0, 0, 255]);
      expect(() => encodePsd(doc({ width: 30001, height: 1, composite }))).toThrow(RangeError);
    });

    describe('レイヤー数', () => {
      const many = (count: number) =>
        doc({
          width: 1,
          height: 1,
          composite: solid(1, 1, [0, 0, 0, 0]),
          layers: Array.from({ length: count }, () => layer({ rgba: new Uint8ClampedArray(4) })),
        });

      test('32,767 枚までは書き出せる', () => {
        // 統合画像が透明度を持つので、レイヤー数は負の値で記録される
        expect(rawLayerCount(encodePsd(many(32767)))).toBe(-32767);
      });

      test('32,767 枚を超える場合は、符号付き 16 bit で記録できないため Error', () => {
        let error: unknown;
        try {
          encodePsd(many(32768));
        } catch (e) {
          error = e;
        }
        expect(error).toBeInstanceOf(Error);
        expect(error).not.toBeInstanceOf(RangeError);
      });
    });

    test('セクションの長さが 32 bit で表せない場合は Error', () => {
      expect(() => assertSectionLength(0xffffffff)).not.toThrow();
      let error: unknown;
      try {
        assertSectionLength(0x100000000);
      } catch (e) {
        error = e;
      }
      // 引数の値の問題ではなく、書き出す内容の大きさの問題なので RangeError ではない
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(RangeError);
    });
  });
});
