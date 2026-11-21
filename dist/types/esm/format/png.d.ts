export declare const PNG_SIGNATURE: Uint8Array<ArrayBuffer>;
export interface PngChunk {
    /** チャンク名(ASCII 4 文字) */
    type: string;
    /** データ部分(元のバイト列を参照する subarray) */
    data: Uint8Array;
    /** ファイル先頭からの、チャンク(長さフィールド)の開始位置 */
    offset: number;
}
export declare function isPng(bytes: Uint8Array): boolean;
/** PNG のチャンクを出現順に返す。PNG でなければ TypeError を投げる。 */
export declare function readChunks(bytes: Uint8Array): PngChunk[];
/** 長さ・名前・データ・CRC を並べたチャンクのバイト列を作る */
export declare function buildChunk(type: string, data: Uint8Array): Uint8Array<ArrayBuffer>;
/** IEND チャンクの直前にチャンクを挿入した、新しいバイト列を返す */
export declare function insertChunkBeforeIEND(png: Uint8Array, chunk: Uint8Array): Uint8Array<ArrayBuffer>;
/**
 * IHDR チャンクから画像のピクセルサイズを読む。画像のデコードは行わない。
 * PNG でない、または先頭のチャンクが正しい IHDR でない場合は null。
 */
export declare function readImageSize(bytes: Uint8Array): {
    width: number;
    height: number;
} | null;
/**
 * 非公開(2 文字目が小文字)かつコピー不可(4 文字目が大文字)のチャンクを含むかどうか。
 * 該当する PNG は、画像データを変更すると情報が失われる(docs/specs/integration.md)。
 */
export declare function hasUnsafeToCopyPrivateChunk(bytes: Uint8Array): boolean;
/**
 * 完成イメージのチェックサム。IHDR のデータと全 IDAT のデータを出現順に連結した CRC-32。
 * docs/specs/file-format.md の compositeChecksum を参照。
 */
export declare function compositeChecksum(png: Uint8Array): string;
