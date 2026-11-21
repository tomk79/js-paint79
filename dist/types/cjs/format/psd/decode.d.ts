import type { BlendMode } from '../paint79-chunk.js';
/** PSD(または PSB)のシグネチャで始まるかどうか */
export declare function isPsd(bytes: Uint8Array): boolean;
export interface PsdStructure {
    width: number;
    height: number;
    layerCount: number;
}
/** 画像をデコードせずに、大きさとレイヤー数(グループを解体した後)を返す。解析できなければ例外 */
export declare function readPsdStructure(bytes: Uint8Array): PsdStructure;
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
/** レイヤーを読み込む(統合画像は読まない)。解析やデコードに失敗した場合は例外 */
export declare function decodePsdLayers(bytes: Uint8Array): DecodedPsd;
export interface DecodedPsdComposite {
    width: number;
    height: number;
    rgba: Uint8ClampedArray;
}
/**
 * 統合画像を読み込む(レイヤーの画像は読まない)。統合画像がなければ null、解析できなければ例外。
 * ag-psd は、透明度を持つ統合画像の白との合成を元に戻して返す
 */
export declare function decodePsdComposite(bytes: Uint8Array): DecodedPsdComposite | null;
