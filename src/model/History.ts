// アンドゥ/リドゥの履歴(DOM 非依存)
// 仕様: docs/specs/document-model.md の「履歴」

/** 実行済みの操作を取り消す/やり直す手段 */
export interface Command {
  undo(): void;
  redo(): void;
}

export class History {
  /** 履歴の状態が変化するたびに呼ばれる */
  onChange: (() => void) | null = null;

  private readonly done: Command[] = [];
  private readonly undone: Command[] = [];

  constructor(private readonly limit: number) {}

  /** 実行済みの操作を記録する。リドゥ可能な履歴は破棄される */
  push(command: Command): void {
    this.done.push(command);
    if (this.done.length > this.limit) this.done.shift();
    this.undone.length = 0;
    this.onChange?.();
  }

  undo(): boolean {
    const command = this.done.pop();
    if (!command) return false;
    command.undo();
    this.undone.push(command);
    this.onChange?.();
    return true;
  }

  redo(): boolean {
    const command = this.undone.pop();
    if (!command) return false;
    command.redo();
    this.done.push(command);
    this.onChange?.();
    return true;
  }

  canUndo(): boolean {
    return this.done.length > 0;
  }

  canRedo(): boolean {
    return this.undone.length > 0;
  }

  clear(): void {
    this.done.length = 0;
    this.undone.length = 0;
    this.onChange?.();
  }
}
