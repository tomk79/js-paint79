export declare const CHUNK_TYPE = "paNT";
export declare const FORMAT_VERSION = 1;
export declare const BLEND_MODES: readonly ["normal", "multiply", "screen", "overlay", "darken", "lighten"];
export type BlendMode = (typeof BLEND_MODES)[number];
export interface Paint79LayerData {
    id: string;
    name: string;
    visible: boolean;
    opacity: number;
    locked: boolean;
    blendMode: BlendMode;
    /** レイヤー画像(PNG ファイルのバイト列) */
    image: Uint8Array;
}
export interface Paint79Data {
    width: number;
    height: number;
    pixelRatio: number;
    background: string | null;
    activeLayerId: string;
    layers: Paint79LayerData[];
}
export type ExtractFailure = 'no-data' | 'unsupported-version' | 'corrupted' | 'image-modified';
export type ExtractResult = {
    status: 'restored';
    data: Paint79Data;
} | {
    status: ExtractFailure;
};
/**
 * 完成イメージの PNG に、レイヤー情報を格納した paNT チャンクを埋め込む。
 * 完成イメージの IHDR / IDAT は変更しない。既存の Paint79 の paNT チャンクは置き換える。
 */
export declare function embedPaint79Data(composite: Uint8Array, data: Paint79Data): Uint8Array<ArrayBuffer>;
/** マジックナンバーが一致する paNT チャンクを含むかどうか。内容の検証は行わない。 */
export declare function hasPaint79Data(bytes: Uint8Array): boolean;
/** ヘッダーを検証して Paint79Data を組み立てる。不正な場合は CorruptedError を投げる。 */
/** 完成イメージ・レイヤー画像のピクセルサイズ(docs/specs/file-format.md) */
export declare function pixelSize(cssSize: number, pixelRatio: number): number;
/**
 * Paint79 PNG からレイヤー情報を取り出す。
 * 検証の順序は docs/specs/file-format.md の「読み込み時の検証」に従う。
 */
export declare function extractPaint79Data(png: Uint8Array, options?: {
    ignoreMismatch?: boolean;
}): ExtractResult;
