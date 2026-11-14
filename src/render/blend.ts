import type { BlendMode } from '../format/paint79-chunk';

/** レイヤーの合成モードを、canvas の globalCompositeOperation の値に対応させる */
export function compositeOperation(mode: BlendMode): GlobalCompositeOperation {
  return mode === 'normal' ? 'source-over' : mode;
}
