// 公開 API の型(docs/specs/api.md)
import type { BlendMode } from './format/paint79-chunk';
import type { PointerType, Tool } from './model/options';
import type { LayerInfo } from './model/LayerStack';

export type { BlendMode } from './format/paint79-chunk';
export type { Paint79Options, PointerType, Tool } from './model/options';
export type { LayerInfo } from './model/LayerStack';

export interface AddLayerOptions {
  name?: string;
  visible?: boolean;
  opacity?: number;
  locked?: boolean;
  blendMode?: BlendMode;
  index?: number;
}

export type LayerPropsInput = Partial<Omit<LayerInfo, 'id'>>;

export type ImageSource = Blob | ArrayBuffer | Uint8Array | string;
export type LoadImageSource = ImageSource | HTMLImageElement | ImageBitmap;

export interface ExportPNGOptions {
  embedData?: boolean;
}

export interface OpenOptions {
  ignoreMismatch?: boolean;
}

export interface OpenResult {
  restored: boolean;
  reason?: 'no-data' | 'image-modified' | 'unsupported-version' | 'corrupted';
}

export interface LoadImageOptions {
  layerId?: string;
}

export interface Paint79EventMap {
  strokestart: {
    pointerType: PointerType;
    layerId: string;
    x: number;
    y: number;
    pressure: number;
  };
  strokeend: { pointerType: PointerType; layerId: string };
  change: Record<string, never>;
  historychange: { canUndo: boolean; canRedo: boolean };
  toolchange: { tool: Tool; color: string; lineWidth: number };
  layerchange: { layers: LayerInfo[]; activeLayerId: string };
}

export type Paint79EventName = keyof Paint79EventMap;
