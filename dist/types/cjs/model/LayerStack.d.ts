import type { LayerProps } from './options.js';
export interface Layer<S> extends LayerProps {
    readonly id: string;
    surface: S;
}
export interface LayerInfo extends LayerProps {
    id: string;
}
export declare class LayerStack<S> {
    private list;
    private activeLayerId;
    /** 名前の通し番号('レイヤー N' の N)として最後に使った値 */
    private nameCounter;
    /** ID の通し番号 */
    private idCounter;
    /** これまでに発行・使用したすべての ID。削除したレイヤーや読み込んだレイヤーの ID を再び発行しないため */
    private readonly usedIds;
    get layers(): readonly Layer<S>[];
    get activeId(): string;
    get active(): Layer<S>;
    /** レイヤーを作る(挿入はしない)。名前を省略した場合は通し番号の名前を付ける */
    create(surface: S, props?: Partial<LayerProps>, id?: string): Layer<S>;
    private newId;
    insert(layer: Layer<S>, index: number): void;
    /** レイヤーを取り除き、取り除く前のインデックスを返す */
    remove(id: string): number;
    move(id: string, index: number): void;
    /** レイヤーのインデックスを返す。存在しない場合は RangeError */
    indexOf(id: string): number;
    get(id: string): Layer<S> | null;
    /** レイヤーを返す。存在しない場合は RangeError */
    require(id: unknown): Layer<S>;
    setActive(id: string): void;
    info(): LayerInfo[];
    /** 並び順とアクティブレイヤーを置き換える(履歴の復元に使う)。名前の通し番号は変えない */
    setOrder(layers: readonly Layer<S>[], activeId: string): void;
    /** 全レイヤーを置き換える(読み込み時に使う)。名前の通し番号はレイヤー数から数え直す */
    replaceAll(layers: readonly Layer<S>[], activeId: string): void;
}
export declare function toInfo<S>(l: Layer<S>): LayerInfo;
