import { type BlendMode } from '../format/paint79-chunk.js';
export declare const TOOLS: readonly ["pen", "eraser"];
export type Tool = (typeof TOOLS)[number];
export declare const POINTER_TYPES: readonly ["mouse", "touch", "pen"];
export type PointerType = (typeof POINTER_TYPES)[number];
export interface Paint79Options {
    width?: number;
    height?: number;
    background?: string | null;
    tool?: Tool;
    color?: string;
    lineWidth?: number;
    pressure?: boolean;
    pointerTypes?: PointerType[];
    palmRejection?: boolean;
    historyLimit?: number;
    pixelRatio?: number;
    readOnly?: boolean;
}
export type ResolvedOptions = Required<Paint79Options>;
export interface OptionsEnvironment {
    containerWidth: number;
    containerHeight: number;
    devicePixelRatio: number;
}
export interface LayerProps {
    name: string;
    visible: boolean;
    opacity: number;
    locked: boolean;
    blendMode: BlendMode;
}
export declare function validatePositiveNumber(value: unknown, name: string): number;
export declare function validateBoolean(value: unknown, name: string): boolean;
export declare const validateTool: (value: unknown) => Tool;
export declare const validateColor: (value: unknown) => string;
export declare const validateLineWidth: (value: unknown) => number;
export declare function validateBackground(value: unknown): string | null;
export declare function validateIndex(value: unknown, max: number, name?: string): number;
/** オプションを検証し、既定値を補う */
export declare function normalizeOptions(input: unknown, env: OptionsEnvironment): ResolvedOptions;
/** レイヤーの属性を検証する。指定された既知の属性だけを返す */
export declare function validateLayerProps(input: unknown): Partial<LayerProps>;
