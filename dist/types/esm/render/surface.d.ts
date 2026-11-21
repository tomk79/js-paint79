import type { PixelRect } from '../input/policy.js';
import type { Layer } from '../model/LayerStack.js';
export type Surface = HTMLCanvasElement;
export declare function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D;
/** 内部解像度のピクセルサイズを指定して、透明な canvas を作る */
export declare function createSurface(width: number, height: number): Surface;
export declare function cloneSurface(src: Surface): Surface;
/** 指定した範囲を切り出した canvas を作る */
export declare function copyRect(src: Surface, rect: PixelRect): Surface;
/** 指定した範囲を、切り出しておいた内容で置き換える */
export declare function restoreRect(dst: Surface, snapshot: Surface, rect: PixelRect): void;
/** 全体を、別の canvas の内容で置き換える */
export declare function restoreAll(dst: Surface, snapshot: Surface): void;
export declare function clearSurface(s: Surface): void;
/** レイヤーの内容を、opacity と blendMode を適用して描画する */
export declare function drawLayer(ctx: CanvasRenderingContext2D, layer: Layer<Surface>): void;
/** 背景色の上に、表示中のレイヤーを背面から順に合成する(完成イメージ) */
export declare function composite(target: HTMLCanvasElement, layers: readonly Layer<Surface>[], background: string | null): void;
export declare function canvasToBlob(canvas: HTMLCanvasElement, type?: string, quality?: number): Promise<Blob>;
