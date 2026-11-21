import type { StrokePoint } from '../input/policy.js';
import type { Tool } from '../model/options.js';
import { type Surface } from './surface.js';
export interface StrokeStyle {
    tool: Tool;
    color: string;
    pixelRatio: number;
}
/** 点を 1 つ描画する(ストロークの開始点) */
export declare function drawDot(surface: Surface, p: StrokePoint, style: StrokeStyle): void;
/** 2 点を結ぶ線分を描画する。太さは両端の平均とする */
export declare function drawSegment(surface: Surface, from: StrokePoint, to: StrokePoint, style: StrokeStyle): void;
