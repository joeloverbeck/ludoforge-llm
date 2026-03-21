import { BitmapText, type Container, type TextStyleOptions } from 'pixi.js';

import { safeDestroyDisplayObject } from '../renderers/safe-destroy.js';
import type { BitmapFontName } from './bitmap-font-registry.js';

export interface BitmapTextStyle {
  readonly fontName: BitmapFontName;
  readonly fill?: string;
  readonly fontSize?: number;
  readonly stroke?: {
    readonly color: string;
    readonly width: number;
  };
  readonly fontWeight?: TextStyleOptions['fontWeight'];
}

export interface ManagedBitmapTextOptions {
  readonly parent?: Container;
  readonly text?: string;
  readonly style: BitmapTextStyle;
  readonly anchor?: { readonly x: number; readonly y: number };
  readonly position?: { readonly x: number; readonly y: number };
  readonly visible?: boolean;
  readonly renderable?: boolean;
}

export interface KeyedBitmapTextSpec {
  readonly key: string;
  readonly text: string;
  readonly style: BitmapTextStyle;
  readonly anchor?: { readonly x: number; readonly y: number };
  readonly position?: { readonly x: number; readonly y: number };
  readonly visible?: boolean;
  readonly renderable?: boolean;
  readonly alpha?: number;
  readonly rotation?: number;
  readonly scale?: { readonly x: number; readonly y: number };
  readonly instanceKey?: string;
  readonly apply?: (text: BitmapText) => void;
}

export interface KeyedBitmapTextReconciler {
  reconcile(specs: readonly KeyedBitmapTextSpec[]): void;
  get(key: string): BitmapText | undefined;
  destroy(): void;
}

interface CreateKeyedBitmapTextReconcilerOptions {
  readonly parentContainer: Container;
}

interface KeyedBitmapTextEntry {
  instanceKey: string | null;
  style: BitmapTextStyle;
  text: BitmapText;
}

export function toPixiBitmapTextStyle(style: BitmapTextStyle): TextStyleOptions {
  return {
    ...(style.fill !== undefined ? { fill: style.fill } : {}),
    fontFamily: style.fontName,
    ...(style.fontSize !== undefined ? { fontSize: style.fontSize } : {}),
    ...(style.fontWeight !== undefined ? { fontWeight: style.fontWeight } : {}),
    ...(style.stroke === undefined
      ? {}
      : {
          stroke: {
            color: style.stroke.color,
            width: style.stroke.width,
          },
        }),
  };
}

export function createManagedBitmapText(options: ManagedBitmapTextOptions): BitmapText {
  const text = new BitmapText({
    text: options.text ?? '',
    style: toPixiBitmapTextStyle(options.style),
  });
  text.eventMode = 'none';
  text.interactiveChildren = false;

  if (options.anchor !== undefined) {
    text.anchor.set(options.anchor.x, options.anchor.y);
  }
  if (options.position !== undefined) {
    text.position.set(options.position.x, options.position.y);
  }
  if (options.visible !== undefined) {
    text.visible = options.visible;
  }
  if (options.renderable !== undefined) {
    text.renderable = options.renderable;
  }
  if (options.parent !== undefined) {
    options.parent.addChild(text);
  }

  return text;
}

function cloneBitmapTextStyle(style: BitmapTextStyle): BitmapTextStyle {
  return {
    fontName: style.fontName,
    ...(style.fill !== undefined ? { fill: style.fill } : {}),
    ...(style.fontSize !== undefined ? { fontSize: style.fontSize } : {}),
    ...(style.fontWeight !== undefined ? { fontWeight: style.fontWeight } : {}),
    ...(style.stroke === undefined
      ? {}
      : {
          stroke: {
            color: style.stroke.color,
            width: style.stroke.width,
          },
        }),
  };
}

function bitmapTextStylesEqual(a: BitmapTextStyle, b: BitmapTextStyle): boolean {
  return (
    a.fontName === b.fontName &&
    a.fill === b.fill &&
    a.fontSize === b.fontSize &&
    a.fontWeight === b.fontWeight &&
    a.stroke?.color === b.stroke?.color &&
    a.stroke?.width === b.stroke?.width
  );
}

export function destroyManagedBitmapText(text: BitmapText): void {
  text.renderable = false;
  text.visible = false;
  text.removeFromParent();
  safeDestroyDisplayObject(text);
}

export function createKeyedBitmapTextReconciler(
  options: CreateKeyedBitmapTextReconcilerOptions,
): KeyedBitmapTextReconciler {
  const entries = new Map<string, KeyedBitmapTextEntry>();

  function applySpec(text: BitmapText, spec: KeyedBitmapTextSpec): void {
    text.text = spec.text;
    if (spec.anchor !== undefined) {
      text.anchor.set(spec.anchor.x, spec.anchor.y);
    }
    if (spec.position !== undefined) {
      text.position.set(spec.position.x, spec.position.y);
    }
    text.visible = spec.visible ?? true;
    text.renderable = spec.renderable ?? true;
    text.alpha = spec.alpha ?? 1;
    text.rotation = spec.rotation ?? 0;
    text.scale.set(spec.scale?.x ?? 1, spec.scale?.y ?? 1);
    spec.apply?.(text);
  }

  function createFromSpec(spec: KeyedBitmapTextSpec): BitmapText {
    const text = createManagedBitmapText({
      parent: options.parentContainer,
      text: spec.text,
      style: spec.style,
      ...(spec.anchor !== undefined ? { anchor: spec.anchor } : {}),
      ...(spec.position !== undefined ? { position: spec.position } : {}),
      ...(spec.visible !== undefined ? { visible: spec.visible } : {}),
      ...(spec.renderable !== undefined ? { renderable: spec.renderable } : {}),
    });
    applySpec(text, spec);
    return text;
  }

  return {
    reconcile(specs): void {
      const activeKeys = new Set<string>();

      for (const spec of specs) {
        activeKeys.add(spec.key);
        const instanceKey = spec.instanceKey ?? null;
        const entry = entries.get(spec.key);
        if (entry === undefined || entry.instanceKey !== instanceKey) {
          if (entry !== undefined) {
            destroyManagedBitmapText(entry.text);
          }
          const text = createFromSpec(spec);
          entries.set(spec.key, {
            instanceKey,
            style: cloneBitmapTextStyle(spec.style),
            text,
          });
          continue;
        }

        if (entry.text.parent !== options.parentContainer) {
          options.parentContainer.addChild(entry.text);
        }
        if (!bitmapTextStylesEqual(entry.style, spec.style)) {
          entry.text.style = toPixiBitmapTextStyle(spec.style);
          entry.style = cloneBitmapTextStyle(spec.style);
        }
        applySpec(entry.text, spec);
      }

      for (const [key, entry] of entries) {
        if (activeKeys.has(key)) {
          continue;
        }
        destroyManagedBitmapText(entry.text);
        entries.delete(key);
      }
    },

    get(key: string): BitmapText | undefined {
      return entries.get(key)?.text;
    },

    destroy(): void {
      for (const entry of entries.values()) {
        destroyManagedBitmapText(entry.text);
      }
      entries.clear();
    },
  };
}
