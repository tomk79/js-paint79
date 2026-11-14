// オプションと引数の検証(DOM 非依存)
// 仕様: docs/specs/api.md の「オプション」「引数の検証」
import { BLEND_MODES, type BlendMode } from '../format/paint79-chunk';

export const TOOLS = ['pen', 'eraser'] as const;
export type Tool = (typeof TOOLS)[number];

export const POINTER_TYPES = ['mouse', 'touch', 'pen'] as const;
export type PointerType = (typeof POINTER_TYPES)[number];

export interface Paint79Options {
  width?: number;
  height?: number;
  background?: string | null;
  tool?: Tool;
  color?: string;
  lineWidth?: number;
  pressure?: boolean;
  pointerTypes?: PointerType[];
  palmRejection?: boolean;
  historyLimit?: number;
  pixelRatio?: number;
  readOnly?: boolean;
}

export type ResolvedOptions = Required<Paint79Options>;

export interface OptionsEnvironment {
  containerWidth: number;
  containerHeight: number;
  devicePixelRatio: number;
}

export interface LayerProps {
  name: string;
  visible: boolean;
  opacity: number;
  locked: boolean;
  blendMode: BlendMode;
}

function typeError(name: string, expected: string): TypeError {
  return new TypeError(`${name} には${expected}を指定してください`);
}

export function validatePositiveNumber(value: unknown, name: string): number {
  if (typeof value !== 'number') throw typeError(name, '数値');
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} には正の有限数を指定してください: ${value}`);
  }
  return value;
}

export function validateBoolean(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') throw typeError(name, '真偽値');
  return value;
}

function validateString(value: unknown, name: string): string {
  if (typeof value !== 'string') throw typeError(name, '文字列');
  if (value === '') throw new RangeError(`${name} に空文字列は指定できません`);
  return value;
}

function validateEnum<T extends string>(value: unknown, values: readonly T[], name: string): T {
  if (typeof value !== 'string') throw typeError(name, '文字列');
  if (!values.includes(value as T)) {
    throw new RangeError(
      `${name} には ${values.join(', ')} のいずれかを指定してください: ${value}`,
    );
  }
  return value as T;
}

export const validateTool = (value: unknown): Tool => validateEnum(value, TOOLS, 'tool');
export const validateColor = (value: unknown): string => validateString(value, 'color');
export const validateLineWidth = (value: unknown): number =>
  validatePositiveNumber(value, 'lineWidth');

export function validateBackground(value: unknown): string | null {
  return value === null ? null : validateString(value, 'background');
}

export function validateIndex(value: unknown, max: number, name = 'index'): number {
  if (typeof value !== 'number') throw typeError(name, '数値');
  if (!Number.isInteger(value) || value < 0 || value > max) {
    throw new RangeError(`${name} には 0 以上 ${max} 以下の整数を指定してください: ${value}`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** オプションを検証し、既定値を補う */
export function normalizeOptions(input: unknown, env: OptionsEnvironment): ResolvedOptions {
  if (input === undefined || input === null) input = {};
  if (!isRecord(input)) throw typeError('options', 'オブジェクト');
  const o = input;
  const given = (key: string) => o[key] !== undefined;

  let historyLimit = 50;
  if (given('historyLimit')) {
    const v = o.historyLimit;
    if (typeof v !== 'number') throw typeError('historyLimit', '数値');
    if (!Number.isInteger(v) || v < 1) {
      throw new RangeError(`historyLimit には 1 以上の整数を指定してください: ${v}`);
    }
    historyLimit = v;
  }

  let pointerTypes: PointerType[] = [...POINTER_TYPES];
  if (given('pointerTypes')) {
    if (!Array.isArray(o.pointerTypes)) throw typeError('pointerTypes', '配列');
    pointerTypes = o.pointerTypes.map((t) => validateEnum(t, POINTER_TYPES, 'pointerTypes'));
  }

  return {
    width: given('width')
      ? validatePositiveNumber(o.width, 'width')
      : env.containerWidth > 0
        ? env.containerWidth
        : 300,
    height: given('height')
      ? validatePositiveNumber(o.height, 'height')
      : env.containerHeight > 0
        ? env.containerHeight
        : 150,
    background: given('background') ? validateBackground(o.background) : '#ffffff',
    tool: given('tool') ? validateTool(o.tool) : 'pen',
    color: given('color') ? validateColor(o.color) : '#000000',
    lineWidth: given('lineWidth') ? validateLineWidth(o.lineWidth) : 4,
    pressure: given('pressure') ? validateBoolean(o.pressure, 'pressure') : true,
    pointerTypes,
    palmRejection: given('palmRejection')
      ? validateBoolean(o.palmRejection, 'palmRejection')
      : false,
    historyLimit,
    pixelRatio: given('pixelRatio')
      ? validatePositiveNumber(o.pixelRatio, 'pixelRatio')
      : env.devicePixelRatio > 0
        ? env.devicePixelRatio
        : 1,
    readOnly: given('readOnly') ? validateBoolean(o.readOnly, 'readOnly') : false,
  };
}

/** レイヤーの属性を検証する。指定された既知の属性だけを返す */
export function validateLayerProps(input: unknown): Partial<LayerProps> {
  if (input === undefined || input === null) return {};
  if (!isRecord(input)) throw typeError('props', 'オブジェクト');
  const out: Partial<LayerProps> = {};
  if (input.name !== undefined) {
    if (typeof input.name !== 'string') throw typeError('name', '文字列');
    out.name = input.name;
  }
  if (input.visible !== undefined) out.visible = validateBoolean(input.visible, 'visible');
  if (input.locked !== undefined) out.locked = validateBoolean(input.locked, 'locked');
  if (input.opacity !== undefined) {
    const v = input.opacity;
    if (typeof v !== 'number') throw typeError('opacity', '数値');
    if (!(v >= 0 && v <= 1)) {
      throw new RangeError(`opacity には 0 以上 1 以下の数値を指定してください: ${v}`);
    }
    out.opacity = v;
  }
  if (input.blendMode !== undefined) {
    out.blendMode = validateEnum(input.blendMode, BLEND_MODES, 'blendMode');
  }
  return out;
}
