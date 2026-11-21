import type { BlendMode } from '../format/paint79-chunk.js';
/** レイヤーの合成モードを、canvas の globalCompositeOperation の値に対応させる */
export declare function compositeOperation(mode: BlendMode): GlobalCompositeOperation;
