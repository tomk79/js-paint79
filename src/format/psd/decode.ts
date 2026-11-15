// PSD の読み込み(DOM 非依存)。解析には ag-psd を使い、Paint79 のレイヤーの形に変換する
// 仕様: docs/specs/psd.md の「読み込み」
import {
  initializeCanvas,
  readPsd,
  type Layer,
  type LayerMaskData,
  type Psd,
  type ReadOptions,
} from 'ag-psd';
import { MAX_OPEN_PIXELS } from '../../model/limits';
import type { BlendMode } from '../paint79-chunk';
import { applyMask, flattenLayers, isLocked, to8bit, toBlendMode, type PsdMask } from './convert';

const SIGNATURE = [0x38, 0x42, 0x50, 0x53]; // '8BPS'

/** PSD(または PSB)のシグネチャで始まるかどうか */
export function isPsd(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && SIGNATURE.every((b, i) => bytes[i] === b);
}

export interface PsdStructure {
  width: number;
  height: number;
  layerCount: number;
}

let prepared = false;

/**
 * ag-psd が画素の格納先を作る関数を差し替える。既定では canvas から ImageData を作るため、
 * 配列だけのオブジェクトにして DOM に依存させない(useImageData: true で読むので、画素の配列だけあればよい)。
 * canvas は、念のためブラウザでは作れるようにしておく(サムネイル等は読まない設定にしている)
 */
function prepare(): void {
  if (prepared) return;
  prepared = true;
  initializeCanvas(
    (width, height) => {
      if (typeof document === 'undefined') throw new Error('canvas を作成できない環境です');
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      return canvas;
    },
    (width, height) =>
      // ag-psd の型が ImageData を要求するため。使うのは width / height / data だけ
      ({ width, height, data: new Uint8ClampedArray(width * height * 4) }) as unknown as ImageData,
  );
}

/**
 * 画像の展開に使うメモリの合計の上限(2 GiB)。読み込み先のピクセル数の上限(MAX_OPEN_PIXELS)の
 * 16 bit 分に当たる。レイヤーの範囲はキャンバスより大きく記録できるため、範囲だけを大きく偽ったファイルで
 * 過大なメモリを確保させられることを防ぐ。超えると ag-psd は確保する前に例外を出す
 */
const MEMORY_LIMIT = MAX_OPEN_PIXELS * 8;

const BASE_OPTIONS: ReadOptions = {
  useImageData: true,
  skipThumbnail: true,
  skipLinkedFilesData: true,
};

function read(bytes: Uint8Array, options: ReadOptions): Psd {
  prepare();
  // totalMemoryLimit は読み込みの間に ag-psd が減らしていくため、毎回新しく指定する
  return readPsd(bytes, { ...BASE_OPTIONS, totalMemoryLimit: MEMORY_LIMIT, ...options });
}

/** 画像をデコードせずに、大きさとレイヤー数(グループを解体した後)を返す。解析できなければ例外 */
export function readPsdStructure(bytes: Uint8Array): PsdStructure {
  const psd = read(bytes, { skipLayerImageData: true, skipCompositeImageData: true });
  return {
    width: psd.width,
    height: psd.height,
    layerCount: flattenLayers(psd.children ?? []).length,
  };
}

export interface DecodedPsdLayer {
  name: string;
  visible: boolean;
  opacity: number;
  blendMode: BlendMode;
  locked: boolean;
  /** ドキュメント座標での範囲。画素を持たないレイヤーは幅・高さが 0 */
  left: number;
  top: number;
  width: number;
  height: number;
  /** 範囲内の 8 bit RGBA(透明度で乗算していない値) */
  rgba: Uint8ClampedArray;
}

export interface DecodedPsd {
  width: number;
  height: number;
  /** 背面から前面の順 */
  layers: DecodedPsdLayer[];
  /** アクティブレイヤーの layers でのインデックス。特定できない場合は null */
  activeIndex: number | null;
}

/**
 * 画素のマスク。PSD はベクトルマスクと画素のマスクの両方がある場合だけ、画素のマスクを realMask に分けて持つ。
 * ベクトルマスクから作られたマスクは再現しない(docs/specs/psd.md)
 */
function pixelMask(layer: Layer): LayerMaskData | undefined {
  if (layer.realMask) return layer.realMask;
  return layer.mask && !layer.mask.fromVectorData ? layer.mask : undefined;
}

function toPsdMask(mask: LayerMaskData): PsdMask {
  const left = mask.left ?? 0;
  const top = mask.top ?? 0;
  const width = Math.max(0, (mask.right ?? 0) - left);
  const height = Math.max(0, (mask.bottom ?? 0) - top);
  const image = mask.imageData;
  const sized = image && image.width === width && image.height === height;
  return {
    left,
    top,
    width: sized ? width : 0,
    height: sized ? height : 0,
    data: sized ? to8bit(image.data) : new Uint8ClampedArray(0),
    defaultColor: mask.defaultColor ?? 0,
  };
}

function toDecodedLayer(layer: Layer, visible: boolean, opacity: number): DecodedPsdLayer {
  const props = {
    name: layer.name ?? '',
    visible,
    opacity,
    blendMode: toBlendMode(layer.blendMode),
    locked: isLocked(layer.protected),
  };
  const image = layer.imageData;
  const left = layer.left ?? 0;
  const top = layer.top ?? 0;
  if (!image || image.width === 0 || image.height === 0) {
    // 調整レイヤーなど、画素を持たないレイヤー
    return { ...props, left, top, width: 0, height: 0, rgba: new Uint8ClampedArray(0) };
  }
  const raster = { left, top, width: image.width, height: image.height, rgba: to8bit(image.data) };
  const mask = pixelMask(layer);
  const rgba = mask && !mask.disabled ? applyMask(raster, toPsdMask(mask)) : raster.rgba;
  return { ...props, ...raster, rgba };
}

/** レイヤーを読み込む(統合画像は読まない)。解析やデコードに失敗した場合は例外 */
export function decodePsdLayers(bytes: Uint8Array): DecodedPsd {
  const psd = read(bytes, { skipCompositeImageData: true });
  const flat = flattenLayers(psd.children ?? []);
  const target = psd.imageResources?.layerState;
  const active = target === undefined ? -1 : flat.findIndex((l) => l.recordIndex === target);
  return {
    width: psd.width,
    height: psd.height,
    layers: flat.map((l) => toDecodedLayer(l.node, l.visible, l.opacity)),
    activeIndex: active >= 0 ? active : null,
  };
}

export interface DecodedPsdComposite {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
}

/**
 * 統合画像を読み込む(レイヤーの画像は読まない)。統合画像がなければ null、解析できなければ例外。
 * ag-psd は、透明度を持つ統合画像の白との合成を元に戻して返す
 */
export function decodePsdComposite(bytes: Uint8Array): DecodedPsdComposite | null {
  const psd = read(bytes, { skipLayerImageData: true });
  const image = psd.imageData;
  if (!image || image.width !== psd.width || image.height !== psd.height) return null;
  return { width: image.width, height: image.height, rgba: to8bit(image.data) };
}
