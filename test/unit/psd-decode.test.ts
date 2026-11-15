import { describe, expect, test } from 'vitest';
import {
  decodePsdComposite,
  decodePsdLayers,
  isPsd,
  readPsdStructure,
  type DecodedPsdLayer,
} from '../../src/format/psd/decode';
import { encodePsd } from '../../src/format/psd/encode';
import { solidImage, writePsdBytes } from '../helpers/psd';
import { PNG_SIGNATURE } from '../../src/format/png';

const ascii = (s: string) => new TextEncoder().encode(s);

describe('isPsd', () => {
  test('先頭が 8BPS なら true', () => {
    expect(isPsd(ascii('8BPS\0\x01'))).toBe(true);
  });

  test('PNG や、4 バイトに満たないバイト列は false', () => {
    expect(isPsd(PNG_SIGNATURE)).toBe(false);
    expect(isPsd(ascii('8BP'))).toBe(false);
  });
});

/** encodePsd で、指定した枚数の不透明なレイヤーを持つ PSD を作る */
function simplePsd(width: number, height: number, layers: number) {
  const rgba = solidImage(width, height, [0, 0, 0, 255]).data;
  return encodePsd({
    width,
    height,
    dpi: 72,
    activeIndex: 0,
    composite: rgba,
    layers: Array.from({ length: layers }, (_, i) => ({
      name: `L${i}`,
      visible: true,
      opacity: 1,
      blendMode: 'normal' as const,
      locked: false,
      rgba,
    })),
  });
}

describe('readPsdStructure', () => {
  test('画像を読まずに、幅・高さ・レイヤー数を返す', () => {
    expect(readPsdStructure(simplePsd(5, 4, 2))).toEqual({ width: 5, height: 4, layerCount: 2 });
  });

  test('レイヤー数は、グループを解体した後の数', () => {
    const bytes = writePsdBytes({
      width: 2,
      height: 2,
      children: [
        { name: 'A', imageData: solidImage(2, 2, [0, 0, 0, 255]) },
        { name: 'G', children: [{ name: 'B' }, { name: 'C' }] },
        { name: '空のグループ', children: [] },
      ],
    });
    expect(readPsdStructure(bytes).layerCount).toBe(3);
  });

  test('PSD として解析できない場合は例外', () => {
    const broken = simplePsd(5, 4, 1).slice(0, 30);
    expect(() => readPsdStructure(broken)).toThrow();
  });
});

/** 読み込んだレイヤーの、ドキュメント座標 (x, y) の画素。範囲外は透明 */
function pixelAt(layer: DecodedPsdLayer, x: number, y: number): number[] {
  const lx = x - layer.left;
  const ly = y - layer.top;
  if (lx < 0 || ly < 0 || lx >= layer.width || ly >= layer.height) return [0, 0, 0, 0];
  const i = (ly * layer.width + lx) * 4;
  return Array.from(layer.rgba.subarray(i, i + 4));
}

describe('decodePsdLayers', () => {
  test('encodePsd で書き出した PSD のレイヤーを、属性と画素を保って読み込む', () => {
    const red = new Uint8ClampedArray(4 * 3 * 4);
    red.set([255, 0, 0, 255], (1 * 4 + 2) * 4); // (2, 1) に赤
    const empty = new Uint8ClampedArray(4 * 3 * 4);
    const bytes = encodePsd({
      width: 4,
      height: 3,
      dpi: 72,
      activeIndex: 1,
      composite: solidImage(4, 3, [255, 255, 255, 255]).data,
      layers: [
        { name: '赤', visible: true, opacity: 0.5, blendMode: 'multiply', locked: true, rgba: red },
        {
          name: '空',
          visible: false,
          opacity: 1,
          blendMode: 'lighten',
          locked: false,
          rgba: empty,
        },
      ],
    });
    const decoded = decodePsdLayers(bytes);
    expect([decoded.width, decoded.height, decoded.activeIndex]).toEqual([4, 3, 1]);
    const [a, b] = decoded.layers;
    expect([a!.name, a!.visible, a!.blendMode, a!.locked]).toEqual(['赤', true, 'multiply', true]);
    expect(Math.round(a!.opacity * 255)).toBe(128);
    expect([a!.left, a!.top, a!.width, a!.height]).toEqual([2, 1, 1, 1]);
    expect(pixelAt(a!, 2, 1)).toEqual([255, 0, 0, 255]);
    expect([b!.name, b!.visible, b!.blendMode, b!.locked]).toEqual(['空', false, 'lighten', false]);
    expect([b!.width, b!.height]).toEqual([0, 0]);
  });

  test('対応しない描画モードは normal、全ロックは locked、透明部分のロックだけなら locked にしない', () => {
    const image = solidImage(2, 2, [0, 0, 0, 255]);
    const bytes = writePsdBytes({
      width: 2,
      height: 2,
      children: [
        { name: 'A', imageData: image, blendMode: 'color dodge', protected: { all: true } },
        { name: 'B', imageData: image, blendMode: 'screen', protected: { transparency: true } },
      ],
    });
    const [a, b] = decodePsdLayers(bytes).layers;
    expect([a!.blendMode, a!.locked]).toEqual(['normal', true]);
    expect([b!.blendMode, b!.locked]).toEqual(['screen', false]);
  });

  test('グループを解体し、非表示と不透明度を中のレイヤーに及ぼす', () => {
    const image = solidImage(2, 2, [0, 0, 0, 255]);
    const bytes = writePsdBytes({
      width: 2,
      height: 2,
      children: [
        { name: '下', imageData: image },
        {
          name: 'G',
          opacity: 0.5,
          children: [
            { name: '中', imageData: image, opacity: 0.5 },
            { name: '非表示G', hidden: true, children: [{ name: '奥', imageData: image }] },
          ],
        },
      ],
    });
    const layers = decodePsdLayers(bytes).layers;
    expect(layers.map((l) => [l.name, l.visible, Math.round(l.opacity * 100)])).toEqual([
      ['下', true, 100],
      ['中', true, 25],
      ['奥', false, 50],
    ]);
  });

  describe('アクティブレイヤー', () => {
    const image = solidImage(2, 2, [0, 0, 0, 255]);
    const withGroup = (layerState: number) =>
      writePsdBytes({
        width: 2,
        height: 2,
        imageResources: { layerState },
        // レコードの並び: 下(0)、G の区切り(1)、中(2)、G(3)、上(4)
        children: [
          { name: '下', imageData: image },
          { name: 'G', children: [{ name: '中', imageData: image }] },
          { name: '上', imageData: image },
        ],
      });

    test('ターゲットレイヤーを、グループの区切りを含むレコードの並びで解釈する', () => {
      const decoded = decodePsdLayers(withGroup(2));
      expect(decoded.layers[decoded.activeIndex!]!.name).toBe('中');
      const top = decodePsdLayers(withGroup(4));
      expect(top.layers[top.activeIndex!]!.name).toBe('上');
    });

    test('グループを指している場合や、記録がない場合は null', () => {
      expect(decodePsdLayers(withGroup(3)).activeIndex).toBeNull();
      const none = writePsdBytes({
        width: 2,
        height: 2,
        children: [{ name: 'A', imageData: image }],
      });
      expect(decodePsdLayers(none).activeIndex).toBeNull();
    });
  });

  describe('レイヤーマスク', () => {
    // マスクの値が 128 の画素マスク(レイヤー全体を覆う)
    const half = () => solidImage(2, 2, [128, 128, 128, 255]);
    const masked = (mask: object) =>
      writePsdBytes({
        width: 2,
        height: 2,
        children: [
          { name: 'A', imageData: solidImage(2, 2, [255, 0, 0, 255]), mask: mask as never },
        ],
      });

    test('有効な画素マスクを、透明度に掛け合わせる', () => {
      const bytes = masked({ top: 0, left: 0, bottom: 2, right: 2, imageData: half() });
      expect(pixelAt(decodePsdLayers(bytes).layers[0]!, 1, 1)).toEqual([255, 0, 0, 128]);
    });

    test('無効化された画素マスクは無視する', () => {
      const bytes = masked({
        top: 0,
        left: 0,
        bottom: 2,
        right: 2,
        imageData: half(),
        disabled: true,
      });
      expect(pixelAt(decodePsdLayers(bytes).layers[0]!, 1, 1)).toEqual([255, 0, 0, 255]);
    });

    test('ベクトルマスクから作られたマスクは無視する', () => {
      const bytes = masked({
        top: 0,
        left: 0,
        bottom: 2,
        right: 2,
        imageData: half(),
        fromVectorData: true,
      });
      expect(pixelAt(decodePsdLayers(bytes).layers[0]!, 1, 1)).toEqual([255, 0, 0, 255]);
    });

    test('マスクの範囲外は、マスクの既定の色を使う', () => {
      // マスクは (0, 0) の 1 画素だけ。範囲外の既定の色は 0(隠す)
      const bytes = masked({
        top: 0,
        left: 0,
        bottom: 1,
        right: 1,
        defaultColor: 0,
        imageData: solidImage(1, 1, [255, 255, 255, 255]),
      });
      const layer = decodePsdLayers(bytes).layers[0]!;
      expect(pixelAt(layer, 0, 0)[3]).toBe(255);
      expect(pixelAt(layer, 1, 1)[3]).toBe(0);
    });
  });

  test('16 bit の PSD を 8 bit で読み込む', () => {
    const data = new Uint16Array(2 * 2 * 4);
    for (let i = 0; i < data.length; i += 4) data.set([65535, 257 * 128, 0, 65535], i);
    const bytes = writePsdBytes({
      width: 2,
      height: 2,
      bitsPerChannel: 16,
      children: [{ name: 'A', imageData: { width: 2, height: 2, data } as never }],
    });
    expect(pixelAt(decodePsdLayers(bytes).layers[0]!, 1, 1)).toEqual([255, 128, 0, 255]);
  });

  test('グレースケールの PSD は、R・G・B を同じ値にして読み込む', () => {
    const bytes = writePsdBytes({
      width: 2,
      height: 2,
      colorMode: 1, // グレースケール
      children: [{ name: 'A', imageData: solidImage(2, 2, [100, 100, 100, 255]) }],
    });
    expect(pixelAt(decodePsdLayers(bytes).layers[0]!, 0, 0)).toEqual([100, 100, 100, 255]);
  });

  test('調整レイヤーなど画素を持たないレイヤーは、名前付きの空のレイヤーになる', () => {
    const bytes = writePsdBytes({
      width: 2,
      height: 2,
      children: [{ name: '明るさ', adjustment: { type: 'brightness/contrast', brightness: 10 } }],
    });
    const [layer] = decodePsdLayers(bytes).layers;
    expect([layer!.name, layer!.width, layer!.height]).toEqual(['明るさ', 0, 0]);
  });
});

/** encodePsd の出力で、最初のレイヤーのレコード(先頭は範囲 top / left / bottom / right)の位置を求める */
function firstLayerRecordOffset(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 26; // ヘッダー
  p += 4 + view.getUint32(p); // カラーモードデータ
  p += 4 + view.getUint32(p); // Image Resources
  p += 4 + 4; // レイヤーとマスクの情報、レイヤー情報の長さ
  return p + 2; // レイヤー数
}

describe('decodePsdComposite', () => {
  test('レイヤーを持たない PSD の統合画像を読み込む', () => {
    const composite = solidImage(3, 2, [10, 20, 30, 255]).data;
    const bytes = encodePsd({
      width: 3,
      height: 2,
      dpi: 72,
      activeIndex: 0,
      composite,
      layers: [],
    });
    expect(readPsdStructure(bytes).layerCount).toBe(0);
    const image = decodePsdComposite(bytes)!;
    expect([image.width, image.height]).toEqual([3, 2]);
    expect(Array.from(image.rgba.subarray(20, 24))).toEqual([10, 20, 30, 255]);
  });
});

describe('壊れた PSD', () => {
  test('レイヤーの画像の展開に上限(2 GiB)を超えるメモリが必要なら decodePsdLayers は例外、統合画像は読める', () => {
    const bytes = simplePsd(4, 3, 1).slice();
    const view = new DataView(bytes.buffer);
    // レイヤーの範囲だけを PSD の上限の 30000 x 30000 に書き換える(展開には 3.6 GB 必要)。
    // ag-psd は、壊れた画素データ自体は例外にせず読み飛ばすため、この方法で壊れた状態を作る
    const at = firstLayerRecordOffset(bytes);
    view.setInt32(at + 8, 30000); // bottom
    view.setInt32(at + 12, 30000); // right
    expect(readPsdStructure(bytes).layerCount).toBe(1);
    expect(() => decodePsdLayers(bytes)).toThrow();
    expect(Array.from(decodePsdComposite(bytes)!.rgba.subarray(0, 4))).toEqual([0, 0, 0, 255]);
  });

  test('対応しないカラーモード(Lab)は、構造の読み込みで例外', () => {
    const bytes = simplePsd(4, 3, 1).slice();
    bytes[25] = 9; // カラーモード(ヘッダーの最後の 2 バイト)を Lab に
    expect(() => readPsdStructure(bytes)).toThrow();
  });
});
