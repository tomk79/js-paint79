// Paint79 の公開クラス。各モジュールを組み合わせる薄い層に保つ。
// 仕様: docs/specs/api.md
import { Emitter } from './events/Emitter';
import {
  embedPaint79Data,
  extractPaint79Data,
  hasPaint79Data,
  pixelSize,
  type Paint79Data,
} from './format/paint79-chunk';
import {
  decidePointerDown,
  decidePointerMove,
  strokeBounds,
  strokeWidth,
  toCanvasPoint,
  type ClientRectLike,
  type StrokePoint,
} from './input/policy';
import { History } from './model/History';
import { LayerStack, toInfo, type Layer } from './model/LayerStack';
import {
  normalizeOptions,
  validateBackground,
  validateBoolean,
  validateColor,
  validateIndex,
  validateLayerProps,
  validateLineWidth,
  validatePositiveNumber,
  validateTool,
  type LayerProps,
  type PointerType,
  type ResolvedOptions,
} from './model/options';
import { assertCssColor, isCssColor } from './render/color';
import { drawDot, drawSegment, type StrokeStyle } from './render/stroke';
import {
  canvasToBlob,
  clearSurface,
  cloneSurface,
  composite,
  context,
  copyRect,
  createSurface,
  drawLayer,
  restoreAll,
  restoreRect,
  type Surface,
} from './render/surface';
import type {
  AddLayerOptions,
  ExportPNGOptions,
  ImageSource,
  LayerInfo,
  LayerPropsInput,
  LoadImageOptions,
  LoadImageSource,
  OpenOptions,
  OpenResult,
  Paint79EventMap,
  Paint79EventName,
  Paint79Options,
  Tool,
} from './types';

const EVENT_NAMES: readonly Paint79EventName[] = [
  'strokestart',
  'strokeend',
  'change',
  'historychange',
  'toolchange',
  'layerchange',
];

const SOURCE_TYPE_ERROR =
  'source には Blob、ArrayBuffer、Uint8Array、URL 文字列のいずれかを指定してください';

/** 描画中のストローク */
interface Stroke {
  pointerId: number;
  pointerType: PointerType;
  layer: Layer<Surface>;
  /** ストローク開始前のレイヤーの内容(取り消し・履歴に使う) */
  backup: Surface;
  points: StrokePoint[];
  style: StrokeStyle;
  lineWidth: number;
  rect: ClientRectLike;
}

/** レイヤーの構成(並び順・アクティブレイヤー・属性)のスナップショット */
interface Structure {
  order: Layer<Surface>[];
  activeId: string;
  props: [Layer<Surface>, LayerProps][];
}

function pickProps(l: LayerProps): LayerProps {
  return {
    name: l.name,
    visible: l.visible,
    opacity: l.opacity,
    locked: l.locked,
    blendMode: l.blendMode,
  };
}

async function toBytes(source: unknown): Promise<Uint8Array> {
  if (source instanceof Uint8Array) return source;
  if (source instanceof ArrayBuffer) return new Uint8Array(source);
  if (source instanceof Blob) return new Uint8Array(await source.arrayBuffer());
  if (typeof source === 'string') {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`画像を取得できません(HTTP ${res.status}): ${source}`);
    return new Uint8Array(await res.arrayBuffer());
  }
  throw new TypeError(SOURCE_TYPE_ERROR);
}

/**
 * 画像をデコードする。
 * raw が true の場合は色空間の変換を行わない(paNT のレイヤー画像を、保存時と同じ色の値で復元するため)。
 * 外部の画像は、埋め込まれた ICC プロファイル等をブラウザの既定の方法で解釈する。
 */
async function decodeImage(bytes: Uint8Array, raw = false): Promise<ImageBitmap> {
  try {
    const blob = new Blob([bytes as Uint8Array<ArrayBuffer>]);
    return await (raw
      ? createImageBitmap(blob, { colorSpaceConversion: 'none' })
      : createImageBitmap(blob));
  } catch (e) {
    throw new Error('画像をデコードできません', { cause: e });
  }
}

type Drawable = ImageBitmap | HTMLImageElement;

async function toDrawable(source: LoadImageSource): Promise<Drawable> {
  if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) return source;
  if (source instanceof HTMLImageElement) {
    if (!source.complete || source.naturalWidth === 0) {
      try {
        await source.decode();
      } catch (e) {
        throw new Error('画像をデコードできません', { cause: e });
      }
    }
    return source;
  }
  return decodeImage(await toBytes(source));
}

/**
 * 描画すると canvas が汚染される(ピクセルを読み出せなくなる)画像かどうか。
 * CORS の許可なしに読み込まれた別オリジンの画像などが該当する。
 */
function taintsCanvas(image: Drawable): boolean {
  const probe = createSurface(1, 1);
  const ctx = context(probe);
  ctx.drawImage(image, 0, 0);
  try {
    ctx.getImageData(0, 0, 1, 1);
    return false;
  } catch {
    return true;
  }
}

/**
 * 画像を描画した canvas を作る。stretch が true なら canvas 全体に拡大・縮小して描画する。
 * ブラウザがその大きさの canvas を作成・描画できない場合は Error を投げる。
 */
function surfaceFrom(image: Drawable, width: number, height: number, stretch: boolean): Surface {
  const surface = createSurface(width, height);
  try {
    const ctx = context(surface);
    if (stretch) ctx.drawImage(image, 0, 0, width, height);
    else ctx.drawImage(image, 0, 0);
  } catch (e) {
    throw new Error(`この大きさの画像は読み込めません: ${width} x ${height}`, { cause: e });
  }
  if (surface.width !== width || surface.height !== height) {
    throw new Error(`この大きさの画像は読み込めません: ${width} x ${height}`);
  }
  return surface;
}

export default class Paint79 {
  /** Paint79 のレイヤー情報を含む PNG かどうか(docs/specs/api.md の「静的メソッド」) */
  static async hasData(source: ImageSource): Promise<boolean> {
    return hasPaint79Data(await toBytes(source));
  }

  readonly #canvas: HTMLCanvasElement;
  readonly #opts: ResolvedOptions;
  readonly #layers = new LayerStack<Surface>();
  readonly #history: History;
  readonly #emitter = new Emitter(EVENT_NAMES);
  readonly #unbind: (() => void)[] = [];
  #destroyed = false;
  #penDetected = false;
  #stroke: Stroke | null = null;
  #historyState = { canUndo: false, canRedo: false };

  constructor(container: HTMLElement, options?: Paint79Options) {
    if (!(container instanceof HTMLElement)) {
      throw new TypeError('container には HTMLElement を指定してください');
    }
    this.#opts = normalizeOptions(options, {
      containerWidth: container.clientWidth,
      containerHeight: container.clientHeight,
      devicePixelRatio: window.devicePixelRatio,
    });
    assertCssColor(this.#opts.color, 'color');
    if (this.#opts.background !== null) assertCssColor(this.#opts.background, 'background');
    this.#history = new History(this.#opts.historyLimit);
    this.#history.onChange = () => this.#onHistoryChange();

    const canvas = document.createElement('canvas');
    canvas.style.display = 'block';
    // タッチ操作でページがスクロール・拡大されないようにする
    canvas.style.touchAction = 'none';
    canvas.style.userSelect = 'none';
    this.#canvas = canvas;
    this.#applySize();

    const first = this.#layers.create(this.#newSurface());
    this.#layers.insert(first, 0);
    this.#layers.setActive(first.id);

    container.appendChild(canvas);
    this.#render();
    this.#bindPointerEvents();
  }

  // ---- ツール・描画設定 ----

  setTool(tool: Tool): void {
    this.#alive();
    this.#setToolOption('tool', validateTool(tool));
  }

  getTool(): Tool {
    this.#alive();
    return this.#opts.tool;
  }

  setColor(color: string): void {
    this.#alive();
    this.#setToolOption('color', assertCssColor(validateColor(color), 'color'));
  }

  getColor(): string {
    this.#alive();
    return this.#opts.color;
  }

  setLineWidth(width: number): void {
    this.#alive();
    this.#setToolOption('lineWidth', validateLineWidth(width));
  }

  getLineWidth(): number {
    this.#alive();
    return this.#opts.lineWidth;
  }

  setReadOnly(flag: boolean): void {
    this.#alive();
    this.#opts.readOnly = validateBoolean(flag, 'flag');
  }

  // ---- レイヤー ----

  getLayers(): LayerInfo[] {
    this.#alive();
    return this.#layers.info();
  }

  getLayer(layerId: string): LayerInfo | null {
    this.#alive();
    if (typeof layerId !== 'string') throw new TypeError('layerId には文字列を指定してください');
    const layer = this.#layers.get(layerId);
    return layer ? toInfo(layer) : null;
  }

  addLayer(options?: AddLayerOptions): string {
    this.#alive();
    const props = validateLayerProps(options);
    const count = this.#layers.layers.length;
    const index =
      options?.index === undefined
        ? this.#layers.indexOf(this.#layers.activeId) + 1
        : validateIndex(options.index, count);
    this.#cancelStroke();
    const before = this.#structure();
    const layer = this.#layers.create(this.#newSurface(), props);
    this.#layers.insert(layer, index);
    this.#commitStructure(before);
    return layer.id;
  }

  removeLayer(layerId: string): boolean {
    this.#alive();
    this.#layers.require(layerId);
    if (this.#layers.layers.length <= 1) return false;
    this.#cancelStroke();
    const before = this.#structure();
    const wasActive = this.#layers.activeId === layerId;
    const index = this.#layers.remove(layerId);
    if (wasActive) {
      this.#layers.setActive(this.#layers.layers[Math.max(0, index - 1)]!.id);
    }
    this.#commitStructure(before);
    return true;
  }

  duplicateLayer(layerId: string): string {
    this.#alive();
    const src = this.#layers.require(layerId);
    this.#cancelStroke();
    const before = this.#structure();
    const copy = this.#layers.create(cloneSurface(src.surface), {
      ...pickProps(src),
      name: `${src.name} のコピー`,
    });
    this.#layers.insert(copy, this.#layers.indexOf(layerId) + 1);
    this.#commitStructure(before);
    return copy.id;
  }

  moveLayer(layerId: string, index: number): void {
    this.#alive();
    this.#layers.require(layerId);
    validateIndex(index, this.#layers.layers.length - 1);
    if (this.#layers.indexOf(layerId) === index) return;
    this.#cancelStroke();
    const before = this.#structure();
    this.#layers.move(layerId, index);
    this.#commitStructure(before);
  }

  mergeDown(layerId: string): boolean {
    this.#alive();
    const upper = this.#layers.require(layerId);
    const index = this.#layers.indexOf(layerId);
    if (index === 0) return false;
    const lower = this.#layers.layers[index - 1]!;
    this.#cancelStroke();
    const before = this.#structure();
    const lowerBefore = cloneSurface(lower.surface);
    // 上のレイヤーの visible は考慮せず、opacity と blendMode を適用して描画する
    drawLayer(context(lower.surface), upper);
    const lowerAfter = cloneSurface(lower.surface);
    this.#layers.remove(layerId);
    if (this.#layers.activeId === layerId) this.#layers.setActive(lower.id);
    const after = this.#structure();
    this.#commit(
      () => {
        this.#restoreStructure(before);
        restoreAll(lower.surface, lowerBefore);
      },
      () => {
        this.#restoreStructure(after);
        restoreAll(lower.surface, lowerAfter);
      },
      true,
    );
    return true;
  }

  setLayerProperties(layerId: string, props: LayerPropsInput): void {
    this.#alive();
    const layer = this.#layers.require(layerId);
    const changes = validateLayerProps(props);
    const keys = (Object.keys(changes) as (keyof LayerProps)[]).filter(
      (k) => changes[k] !== layer[k],
    );
    if (keys.length === 0) return;
    this.#cancelStroke();
    const before = this.#structure();
    Object.assign(layer, changes);
    this.#commitStructure(before);
  }

  getActiveLayerId(): string {
    this.#alive();
    return this.#layers.activeId;
  }

  setActiveLayer(layerId: string): void {
    this.#alive();
    this.#layers.require(layerId);
    if (this.#layers.activeId === layerId) return;
    this.#layers.setActive(layerId);
    this.#emitLayerChange();
  }

  clearLayer(layerId?: string): void {
    this.#alive();
    const layer = layerId === undefined ? this.#layers.active : this.#layers.require(layerId);
    this.#cancelStroke();
    const before = cloneSurface(layer.surface);
    clearSurface(layer.surface);
    this.#commit(
      () => restoreAll(layer.surface, before),
      () => clearSurface(layer.surface),
      false,
    );
  }

  // ---- 履歴 ----

  undo(): boolean {
    this.#alive();
    this.#cancelStroke();
    return this.#history.undo();
  }

  redo(): boolean {
    this.#alive();
    this.#cancelStroke();
    return this.#history.redo();
  }

  canUndo(): boolean {
    this.#alive();
    return this.#history.canUndo();
  }

  canRedo(): boolean {
    this.#alive();
    return this.#history.canRedo();
  }

  clearHistory(): void {
    this.#alive();
    this.#history.clear();
  }

  // ---- キャンバス操作 ----

  clear(): void {
    this.#alive();
    this.#cancelStroke();
    const layers = [...this.#layers.layers];
    const before = layers.map((l) => cloneSurface(l.surface));
    layers.forEach((l) => clearSurface(l.surface));
    this.#commit(
      () => layers.forEach((l, i) => restoreAll(l.surface, before[i]!)),
      () => layers.forEach((l) => clearSurface(l.surface)),
      false,
    );
  }

  resize(width: number, height: number): void {
    this.#alive();
    validatePositiveNumber(width, 'width');
    validatePositiveNumber(height, 'height');
    if (width === this.#opts.width && height === this.#opts.height) return;
    this.#cancelStroke();
    const layers = [...this.#layers.layers];
    const oldSize = { width: this.#opts.width, height: this.#opts.height };
    const oldSurfaces = layers.map((l) => l.surface);
    const newSize = { width, height };
    const [pw, ph] = this.#pixelSize(width, height);
    // 描画内容は左上を基準に保持する
    const newSurfaces = layers.map((l) => {
      const s = createSurface(pw, ph);
      context(s).drawImage(l.surface, 0, 0);
      return s;
    });
    const apply = (size: { width: number; height: number }, surfaces: Surface[]) => {
      this.#opts.width = size.width;
      this.#opts.height = size.height;
      layers.forEach((l, i) => (l.surface = surfaces[i]!));
      this.#applySize();
    };
    apply(newSize, newSurfaces);
    this.#commit(
      () => apply(oldSize, oldSurfaces),
      () => apply(newSize, newSurfaces),
      false,
    );
  }

  setBackground(color: string | null): void {
    this.#alive();
    const next = validateBackground(color);
    if (next !== null) assertCssColor(next, 'background');
    const prev = this.#opts.background;
    if (next === prev) return;
    this.#cancelStroke();
    this.#opts.background = next;
    this.#commit(
      () => (this.#opts.background = prev),
      () => (this.#opts.background = next),
      false,
    );
  }

  getBackground(): string | null {
    this.#alive();
    return this.#opts.background;
  }

  getCanvas(): HTMLCanvasElement {
    this.#alive();
    return this.#canvas;
  }

  // ---- 保存・読み込み ----

  async exportPNG(options?: ExportPNGOptions): Promise<Blob> {
    this.#alive();
    const embedData =
      options?.embedData === undefined ? true : validateBoolean(options.embedData, 'embedData');
    const target = createSurface(this.#canvas.width, this.#canvas.height);
    composite(target, this.#layers.layers, this.#opts.background);
    const compositeBlob = await canvasToBlob(target, 'image/png');
    if (!embedData) return compositeBlob;

    const layers = [...this.#layers.layers];
    const images = await Promise.all(
      layers.map(async (l) => new Uint8Array(await (await canvasToBlob(l.surface)).arrayBuffer())),
    );
    const png = embedPaint79Data(new Uint8Array(await compositeBlob.arrayBuffer()), {
      width: this.#opts.width,
      height: this.#opts.height,
      pixelRatio: this.#opts.pixelRatio,
      background: this.#opts.background,
      activeLayerId: this.#layers.activeId,
      layers: layers.map((l, i) => ({ id: l.id, ...pickProps(l), image: images[i]! })),
    });
    return new Blob([png], { type: 'image/png' });
  }

  async open(source: ImageSource, options?: OpenOptions): Promise<OpenResult> {
    this.#alive();
    const ignoreMismatch =
      options?.ignoreMismatch === undefined
        ? false
        : validateBoolean(options.ignoreMismatch, 'ignoreMismatch');
    const bytes = await toBytes(source);
    const extracted = extractPaint79Data(bytes, { ignoreMismatch });
    const pr = this.#opts.pixelRatio;

    // 状態を変更する前に、すべてのレイヤーの canvas を作り終えておく(失敗した場合に状態を変更しないため)
    let reason: OpenResult['reason'];
    if (extracted.status === 'restored') {
      const { data } = extracted;
      const surfaces = await this.#prepareLayers(data);
      if (surfaces) {
        this.#alive();
        this.#cancelStroke();
        this.#opts.width = data.width;
        this.#opts.height = data.height;
        this.#opts.background = data.background;
        const layers = data.layers.map((l, i) =>
          this.#layers.create(surfaces[i]!, pickProps(l), l.id),
        );
        this.#layers.replaceAll(layers, data.activeLayerId);
        this.#afterOpen();
        return { restored: true };
      }
      reason = 'corrupted';
    } else {
      reason = extracted.status;
    }

    const bitmap = await decodeImage(bytes);
    this.#alive();
    const width = bitmap.width / pr;
    const height = bitmap.height / pr;
    const surface = surfaceFrom(bitmap, pixelSize(width, pr), pixelSize(height, pr), false);
    bitmap.close();
    this.#cancelStroke();
    this.#opts.width = width;
    this.#opts.height = height;
    const layer = this.#layers.create(surface, { name: 'レイヤー 1' });
    this.#layers.replaceAll([layer], layer.id);
    this.#afterOpen();
    return { restored: false, reason };
  }

  toDataURL(type?: string, quality?: number): string {
    this.#alive();
    return this.#canvas.toDataURL(type, quality);
  }

  async toBlob(type?: string, quality?: number): Promise<Blob> {
    this.#alive();
    return canvasToBlob(this.#canvas, type, quality);
  }

  async loadImage(source: LoadImageSource, options?: LoadImageOptions): Promise<string> {
    this.#alive();
    const target = options?.layerId === undefined ? null : this.#layers.require(options.layerId).id;
    const image = await toDrawable(source);
    this.#alive();
    // canvas の汚染は元に戻せず、以後保存できなくなるため、汚染する画像は描画しない
    if (taintsCanvas(image)) {
      throw new Error(
        '別オリジンの画像を CORS の許可なしに読み込んだ場合など、ピクセルを読み出せない画像は描画できません',
      );
    }

    // 画像の 1 ピクセルが内部解像度の 1 ピクセルになるように、左上を基準として描画する
    const draw = (surface: Surface) => {
      const ctx = context(surface);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(image, 0, 0);
      ctx.restore();
    };

    if (target !== null) {
      // 画像の読み込みを待つ間に削除されていれば RangeError
      const layer = this.#layers.require(target);
      this.#cancelStroke();
      const before = cloneSurface(layer.surface);
      draw(layer.surface);
      const after = cloneSurface(layer.surface);
      this.#commit(
        () => restoreAll(layer.surface, before),
        () => restoreAll(layer.surface, after),
        false,
      );
      return layer.id;
    }

    this.#cancelStroke();
    const before = this.#structure();
    const layer = this.#layers.create(this.#newSurface());
    draw(layer.surface);
    this.#layers.insert(layer, this.#layers.indexOf(this.#layers.activeId) + 1);
    this.#commitStructure(before);
    return layer.id;
  }

  // ---- イベント ----

  on<K extends Paint79EventName>(eventName: K, listener: (event: Paint79EventMap[K]) => void) {
    this.#alive();
    this.#emitter.on(eventName, listener);
  }

  off<K extends Paint79EventName>(eventName: K, listener: (event: Paint79EventMap[K]) => void) {
    this.#alive();
    this.#emitter.off(eventName, listener);
  }

  // ---- 破棄 ----

  destroy(): void {
    this.#alive();
    this.#stroke = null;
    this.#unbind.forEach((fn) => fn());
    this.#unbind.length = 0;
    this.#emitter.clear();
    this.#history.onChange = null;
    this.#history.clear();
    this.#canvas.remove();
    // canvas のメモリを早めに解放する
    for (const l of this.#layers.layers) {
      l.surface.width = 0;
      l.surface.height = 0;
    }
    this.#destroyed = true;
  }

  // ---- 内部処理 ----

  #alive(): void {
    if (this.#destroyed) throw new Error('この Paint79 インスタンスは destroy() 済みです');
  }

  #pixelSize(width: number, height: number): [number, number] {
    const pr = this.#opts.pixelRatio;
    return [pixelSize(width, pr), pixelSize(height, pr)];
  }

  #newSurface(): Surface {
    return createSurface(this.#canvas.width, this.#canvas.height);
  }

  /** オプションのサイズを表示用 canvas に反映する */
  #applySize(): void {
    const [pw, ph] = this.#pixelSize(this.#opts.width, this.#opts.height);
    this.#canvas.width = pw;
    this.#canvas.height = ph;
    this.#canvas.style.width = `${this.#opts.width}px`;
    this.#canvas.style.height = `${this.#opts.height}px`;
  }

  #render(): void {
    composite(this.#canvas, this.#layers.layers, this.#opts.background);
  }

  #emit<K extends Paint79EventName>(name: K, event: Paint79EventMap[K]): void {
    this.#emitter.emit(name, event);
  }

  #emitLayerChange(): void {
    this.#emit('layerchange', {
      layers: this.#layers.info(),
      activeLayerId: this.#layers.activeId,
    });
  }

  #onHistoryChange(): void {
    const next = { canUndo: this.#history.canUndo(), canRedo: this.#history.canRedo() };
    const prev = this.#historyState;
    if (next.canUndo === prev.canUndo && next.canRedo === prev.canRedo) return;
    this.#historyState = next;
    this.#emit('historychange', { ...next });
  }

  #setToolOption<K extends 'tool' | 'color' | 'lineWidth'>(key: K, value: ResolvedOptions[K]) {
    if (this.#opts[key] === value) return;
    this.#opts[key] = value;
    this.#emit('toolchange', {
      tool: this.#opts.tool,
      color: this.#opts.color,
      lineWidth: this.#opts.lineWidth,
    });
  }

  /** 内容の変更を画面とイベントに反映する */
  #afterChange(layersChanged: boolean): void {
    this.#render();
    if (layersChanged) this.#emitLayerChange();
    this.#emit('change', {});
  }

  /**
   * 実行済みの操作を履歴に記録し、変更を反映する。
   * undo / redo は、その操作の前後の状態を復元する関数。
   */
  #commit(undo: () => void, redo: () => void, layersChanged: boolean): void {
    this.#history.push({
      undo: () => {
        undo();
        this.#afterChange(layersChanged);
      },
      redo: () => {
        redo();
        this.#afterChange(layersChanged);
      },
    });
    this.#afterChange(layersChanged);
  }

  #structure(): Structure {
    const order = [...this.#layers.layers];
    return {
      order,
      activeId: this.#layers.activeId,
      props: order.map((l) => [l, pickProps(l)]),
    };
  }

  #restoreStructure(s: Structure): void {
    for (const [layer, props] of s.props) Object.assign(layer, props);
    this.#layers.setOrder(s.order, s.activeId);
  }

  /** レイヤーの構成の変更(before から現在の状態への変更)を履歴に記録する */
  #commitStructure(before: Structure): void {
    const after = this.#structure();
    this.#commit(
      () => this.#restoreStructure(before),
      () => this.#restoreStructure(after),
      true,
    );
  }

  /**
   * 復元するレイヤーの canvas を作る。レイヤー画像をデコードできない、または背景色を解釈できない場合は
   * null(corrupted)。メモリの使用量を抑えるため、レイヤー画像は 1 枚ずつデコードする。
   */
  async #prepareLayers(data: Paint79Data): Promise<Surface[] | null> {
    if (data.background !== null && !isCssColor(data.background)) return null;
    const pr = this.#opts.pixelRatio;
    const pw = pixelSize(data.width, pr);
    const ph = pixelSize(data.height, pr);
    const surfaces: Surface[] = [];
    for (const layer of data.layers) {
      let bitmap: ImageBitmap;
      try {
        bitmap = await decodeImage(layer.image, true);
      } catch {
        return null;
      }
      // 保存時と pixelRatio が異なる場合は拡大・縮小する
      surfaces.push(surfaceFrom(bitmap, pw, ph, true));
      bitmap.close();
    }
    return surfaces;
  }

  #afterOpen(): void {
    this.#applySize();
    this.#history.clear();
    this.#render();
    this.#emitLayerChange();
    this.#emit('change', {});
  }

  // ---- ポインター操作 ----

  #bindPointerEvents(): void {
    const listen = (type: string, handler: (e: PointerEvent) => void) => {
      const fn = (e: Event) => handler(e as PointerEvent);
      this.#canvas.addEventListener(type, fn);
      this.#unbind.push(() => this.#canvas.removeEventListener(type, fn));
    };
    listen('pointerdown', (e) => this.#onPointerDown(e));
    listen('pointermove', (e) => this.#onPointerMove(e));
    listen('pointerup', (e) => this.#onPointerUp(e));
    listen('pointercancel', (e) => this.#onPointerCancel(e));
    // ポインターの捕捉が解除された場合は、pointerup を取りこぼしたものとして確定する
    listen('lostpointercapture', (e) => this.#onLostPointerCapture(e));
  }

  #onPointerDown(e: PointerEvent): void {
    if (e.pointerType === 'pen') this.#penDetected = true;
    // マウスは主ボタン(左ボタン)のみで描画する
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const layer = this.#layers.active;
    const decision = decidePointerDown({
      pointerType: e.pointerType,
      readOnly: this.#opts.readOnly,
      pointerTypes: this.#opts.pointerTypes,
      palmRejection: this.#opts.palmRejection,
      penDetected: this.#penDetected,
      layerDrawable: layer.visible && !layer.locked,
      pointerId: e.pointerId,
      activeStrokePointerType: this.#stroke?.pointerType ?? null,
      activeStrokePointerId: this.#stroke?.pointerId ?? null,
    });
    if (decision === 'ignore') return;
    if (decision === 'restart') {
      // pointerup を取りこぼしていたので、描画中のストロークを確定してから判断し直す
      this.#finishStroke(this.#stroke!, null);
      this.#onPointerDown(e);
      return;
    }
    e.preventDefault();
    if (decision === 'replace') this.#cancelStroke();
    this.#startStroke(e, layer);
  }

  #pointOf(e: PointerEvent, stroke: Pick<Stroke, 'rect' | 'lineWidth' | 'pointerType'>) {
    const { x, y } = toCanvasPoint(
      e.clientX,
      e.clientY,
      stroke.rect,
      this.#opts.width,
      this.#opts.height,
    );
    const width = strokeWidth({
      lineWidth: stroke.lineWidth,
      pressureEnabled: this.#opts.pressure,
      pointerType: stroke.pointerType,
      pressure: e.pressure,
    });
    return { x, y, width };
  }

  #startStroke(e: PointerEvent, layer: Layer<Surface>): void {
    try {
      this.#canvas.setPointerCapture(e.pointerId);
    } catch {
      // 合成イベント等で、ポインターが存在しない場合は捕捉しない
    }
    const r = this.#canvas.getBoundingClientRect();
    const stroke: Stroke = {
      pointerId: e.pointerId,
      pointerType: e.pointerType as PointerType,
      layer,
      backup: cloneSurface(layer.surface),
      points: [],
      style: {
        tool: this.#opts.tool,
        color: this.#opts.color,
        pixelRatio: this.#opts.pixelRatio,
      },
      lineWidth: this.#opts.lineWidth,
      rect: { left: r.left, top: r.top, width: r.width, height: r.height },
    };
    const p = this.#pointOf(e, stroke);
    stroke.points.push(p);
    this.#stroke = stroke;
    drawDot(layer.surface, p, stroke.style);
    this.#render();
    this.#emit('strokestart', {
      pointerType: stroke.pointerType,
      layerId: layer.id,
      x: p.x,
      y: p.y,
      pressure: e.pressure,
    });
  }

  #extendStroke(stroke: Stroke, events: PointerEvent[]): void {
    for (const ev of events) {
      const p = this.#pointOf(ev, stroke);
      const last = stroke.points[stroke.points.length - 1]!;
      if (p.x === last.x && p.y === last.y) continue;
      drawSegment(stroke.layer.surface, last, p, stroke.style);
      stroke.points.push(p);
    }
    this.#render();
  }

  #onPointerMove(e: PointerEvent): void {
    const stroke = this.#stroke;
    const decision = decidePointerMove({
      isStrokePointer: stroke !== null && e.pointerId === stroke.pointerId,
      pointerType: e.pointerType,
      buttons: e.buttons,
    });
    if (!stroke || decision === 'ignore') return;
    if (decision === 'finish') {
      // ボタンを離した後のホバー位置は、ストロークに含めない
      this.#finishStroke(stroke, null);
      return;
    }
    const coalesced = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    this.#extendStroke(stroke, coalesced.length > 0 ? coalesced : [e]);
  }

  #onPointerUp(e: PointerEvent): void {
    const stroke = this.#stroke;
    if (stroke && e.pointerId === stroke.pointerId) this.#finishStroke(stroke, e);
  }

  #onLostPointerCapture(e: PointerEvent): void {
    const stroke = this.#stroke;
    if (stroke && e.pointerId === stroke.pointerId) this.#finishStroke(stroke, null);
  }

  /**
   * ストロークを確定し、履歴に記録する。
   * up は pointerup のイベントで、その位置まで線を延ばす。取りこぼしによる確定では null。
   */
  #finishStroke(stroke: Stroke, up: PointerEvent | null): void {
    if (up) {
      // 離した位置の筆圧は 0 になるため、位置だけを使い、太さは直前の点に合わせる
      const { x, y } = toCanvasPoint(
        up.clientX,
        up.clientY,
        stroke.rect,
        this.#opts.width,
        this.#opts.height,
      );
      const last = stroke.points[stroke.points.length - 1]!;
      if (x !== last.x || y !== last.y) {
        const p = { x, y, width: last.width };
        drawSegment(stroke.layer.surface, last, p, stroke.style);
        stroke.points.push(p);
      }
    }
    this.#stroke = null;
    this.#render();

    const { layer, backup } = stroke;
    const rect = strokeBounds(stroke.points, {
      width: this.#opts.width,
      height: this.#opts.height,
      pixelRatio: this.#opts.pixelRatio,
    });
    if (rect && rect.width > 0 && rect.height > 0) {
      // 変更された範囲だけを保存して、履歴のメモリ使用量を抑える
      const before = copyRect(backup, rect);
      const after = copyRect(layer.surface, rect);
      this.#history.push({
        undo: () => {
          restoreRect(layer.surface, before, rect);
          this.#afterChange(false);
        },
        redo: () => {
          restoreRect(layer.surface, after, rect);
          this.#afterChange(false);
        },
      });
    }
    this.#emit('strokeend', { pointerType: stroke.pointerType, layerId: layer.id });
    this.#emit('change', {});
  }

  #onPointerCancel(e: PointerEvent): void {
    if (this.#stroke && e.pointerId === this.#stroke.pointerId) this.#cancelStroke();
  }

  /** 描画中のストロークを取り消す(履歴にもイベントにも残さない) */
  #cancelStroke(): void {
    const stroke = this.#stroke;
    if (!stroke) return;
    this.#stroke = null;
    restoreAll(stroke.layer.surface, stroke.backup);
    this.#render();
  }
}
