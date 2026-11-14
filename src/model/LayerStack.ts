// レイヤーの構成とアクティブレイヤーを管理する(DOM 非依存)
// レイヤーの画像(S)は、このクラスでは中身を扱わない不透明な値として保持する。
// 仕様: docs/specs/document-model.md、docs/specs/api.md の「レイヤー」
import type { LayerProps } from './options';

export interface Layer<S> extends LayerProps {
  readonly id: string;
  surface: S;
}

export interface LayerInfo extends LayerProps {
  id: string;
}

export class LayerStack<S> {
  private list: Layer<S>[] = [];
  private activeLayerId = '';
  /** 名前の通し番号('レイヤー N' の N)として最後に使った値 */
  private nameCounter = 0;
  /** ID の通し番号 */
  private idCounter = 0;
  /** これまでに発行・使用したすべての ID。削除したレイヤーや読み込んだレイヤーの ID を再び発行しないため */
  private readonly usedIds = new Set<string>();

  get layers(): readonly Layer<S>[] {
    return this.list;
  }

  get activeId(): string {
    return this.activeLayerId;
  }

  get active(): Layer<S> {
    return this.require(this.activeLayerId);
  }

  /** レイヤーを作る(挿入はしない)。名前を省略した場合は通し番号の名前を付ける */
  create(surface: S, props: Partial<LayerProps> = {}, id?: string): Layer<S> {
    this.nameCounter++;
    const layerId = id ?? this.newId();
    this.usedIds.add(layerId);
    return {
      id: layerId,
      surface,
      name: props.name ?? `レイヤー ${this.nameCounter}`,
      visible: props.visible ?? true,
      opacity: props.opacity ?? 1,
      locked: props.locked ?? false,
      blendMode: props.blendMode ?? 'normal',
    };
  }

  private newId(): string {
    let id: string;
    do {
      id = `layer-${++this.idCounter}`;
    } while (this.usedIds.has(id));
    return id;
  }

  insert(layer: Layer<S>, index: number): void {
    this.list.splice(index, 0, layer);
  }

  /** レイヤーを取り除き、取り除く前のインデックスを返す */
  remove(id: string): number {
    const index = this.indexOf(id);
    this.list.splice(index, 1);
    return index;
  }

  move(id: string, index: number): void {
    const from = this.indexOf(id);
    const [layer] = this.list.splice(from, 1);
    this.list.splice(index, 0, layer!);
  }

  /** レイヤーのインデックスを返す。存在しない場合は RangeError */
  indexOf(id: string): number {
    const index = this.list.findIndex((l) => l.id === id);
    if (index < 0) this.require(id);
    return index;
  }

  get(id: string): Layer<S> | null {
    return this.list.find((l) => l.id === id) ?? null;
  }

  /** レイヤーを返す。存在しない場合は RangeError */
  require(id: unknown): Layer<S> {
    if (typeof id !== 'string') throw new TypeError('layerId には文字列を指定してください');
    const layer = this.get(id);
    if (!layer) throw new RangeError(`存在しないレイヤー ID です: ${id}`);
    return layer;
  }

  setActive(id: string): void {
    this.require(id);
    this.activeLayerId = id;
  }

  info(): LayerInfo[] {
    return this.list.map((l) => toInfo(l));
  }

  /** 並び順とアクティブレイヤーを置き換える(履歴の復元に使う)。名前の通し番号は変えない */
  setOrder(layers: readonly Layer<S>[], activeId: string): void {
    this.list = [...layers];
    this.setActive(activeId);
  }

  /** 全レイヤーを置き換える(読み込み時に使う)。名前の通し番号はレイヤー数から数え直す */
  replaceAll(layers: readonly Layer<S>[], activeId: string): void {
    this.setOrder(layers, activeId);
    this.nameCounter = layers.length;
  }
}

export function toInfo<S>(l: Layer<S>): LayerInfo {
  return {
    id: l.id,
    name: l.name,
    visible: l.visible,
    opacity: l.opacity,
    locked: l.locked,
    blendMode: l.blendMode,
  };
}
