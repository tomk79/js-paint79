export interface StrokeWidthInput {
    lineWidth: number;
    pressureEnabled: boolean;
    pointerType: string;
    pressure: number;
}
/** ストロークの点における線の太さ */
export declare function strokeWidth(input: StrokeWidthInput): number;
export interface PointerDownContext {
    pointerType: string;
    readOnly: boolean;
    pointerTypes: readonly string[];
    palmRejection: boolean;
    /** このインスタンスでペン入力を検出したことがあるか(今回の入力を含む) */
    penDetected: boolean;
    /** アクティブレイヤーに描画できるか(ロックされておらず、表示されている) */
    layerDrawable: boolean;
    pointerId: number;
    /** 描画中のストロークのポインターの種類。描画中でなければ null */
    activeStrokePointerType: string | null;
    /** 描画中のストロークのポインター ID。描画中でなければ null */
    activeStrokePointerId: number | null;
}
/**
 * pointerdown を受けたときの動作を決める。
 * - 'start': ストロークを開始する
 * - 'ignore': 無視する
 * - 'replace': 描画中のストロークを取り消し、このポインターでストロークを開始する
 */
export declare function decidePointerDown(c: PointerDownContext): 'start' | 'ignore' | 'replace' | 'restart';
export interface ClientRectLike {
    left: number;
    top: number;
    width: number;
    height: number;
}
/** クライアント座標を、キャンバスの CSS ピクセル座標に変換する */
export declare function toCanvasPoint(clientX: number, clientY: number, rect: ClientRectLike, canvasWidth: number, canvasHeight: number): {
    x: number;
    y: number;
};
export interface StrokePoint {
    x: number;
    y: number;
    width: number;
}
export interface PixelRect {
    x: number;
    y: number;
    width: number;
    height: number;
}
/**
 * ストロークが描画されうる範囲を、内部解像度のピクセル単位で返す。
 * 始点は自身の太さの点として、各線分は両端の平均の太さで描かれる(render/stroke.ts)ので、それに合わせて計算する。
 * アンチエイリアスの分として 1 CSS ピクセルの余白を含め、キャンバスの範囲に切り詰める。
 */
export declare function strokeBounds(points: readonly StrokePoint[], canvas: {
    width: number;
    height: number;
    pixelRatio: number;
}): PixelRect | null;
export interface PointerMoveContext {
    /** 描画中のストロークのポインターか */
    isStrokePointer: boolean;
    pointerType: string;
    buttons: number;
}
/**
 * pointermove を受けたときの動作を決める。
 * マウスのボタンがすべて離されている場合は、pointerup を取りこぼしたものとしてストロークを確定する。
 */
export declare function decidePointerMove(c: PointerMoveContext): 'extend' | 'finish' | 'ignore';
