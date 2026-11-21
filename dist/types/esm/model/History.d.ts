/** 実行済みの操作を取り消す/やり直す手段 */
export interface Command {
    undo(): void;
    redo(): void;
}
export declare class History {
    private readonly limit;
    /** 履歴の状態が変化するたびに呼ばれる */
    onChange: (() => void) | null;
    private readonly done;
    private readonly undone;
    constructor(limit: number);
    /** 実行済みの操作を記録する。リドゥ可能な履歴は破棄される */
    push(command: Command): void;
    undo(): boolean;
    redo(): boolean;
    canUndo(): boolean;
    canRedo(): boolean;
    clear(): void;
}
