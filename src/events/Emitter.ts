// イベントエミッタ。登録できるイベント名を限定する(docs/specs/api.md の「イベント」)
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- イベントごとに型が異なるリスナーをまとめて保持するため
type Listener = (event: any) => void;

export class Emitter {
  private readonly listeners = new Map<string, Set<Listener>>();

  constructor(private readonly names: readonly string[]) {}

  private check(name: unknown): string {
    if (typeof name !== 'string' || !this.names.includes(name)) {
      throw new TypeError(`未知のイベント名です: ${String(name)}`);
    }
    return name;
  }

  on(name: string, listener: Listener): void {
    this.check(name);
    if (typeof listener !== 'function') throw new TypeError('listener には関数を指定してください');
    let set = this.listeners.get(name);
    if (!set) this.listeners.set(name, (set = new Set()));
    set.add(listener);
  }

  off(name: string, listener: Listener): void {
    this.check(name);
    this.listeners.get(name)?.delete(listener);
  }

  emit(name: string, event: unknown): void {
    // リスナーの中で登録・解除されても影響を受けないよう、複製してから呼び出す
    for (const listener of [...(this.listeners.get(name) ?? [])]) listener(event);
  }

  clear(): void {
    this.listeners.clear();
  }
}
