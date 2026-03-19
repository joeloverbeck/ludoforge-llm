import { Text, type Container, type TextStyleOptions } from 'pixi.js';

import { safeDestroyDisplayObject } from '../renderers/safe-destroy.js';

export interface ManagedTextOptions {
  readonly parent?: Container;
  readonly text?: string;
  readonly style?: TextStyleOptions;
  readonly anchor?: { readonly x: number; readonly y: number };
  readonly position?: { readonly x: number; readonly y: number };
  readonly visible?: boolean;
  readonly renderable?: boolean;
}

export interface KeyedTextSpec {
  readonly key: string;
  readonly text: string;
  readonly style?: TextStyleOptions;
  readonly anchor?: { readonly x: number; readonly y: number };
  readonly position?: { readonly x: number; readonly y: number };
  readonly visible?: boolean;
  readonly renderable?: boolean;
  readonly alpha?: number;
  readonly rotation?: number;
  readonly scale?: { readonly x: number; readonly y: number };
  readonly instanceKey?: string;
  readonly apply?: (text: Text) => void;
}

export interface KeyedTextReconciler {
  reconcile(specs: readonly KeyedTextSpec[]): void;
  get(key: string): Text | undefined;
  destroy(): void;
}

interface CreateKeyedTextReconcilerOptions {
  readonly parentContainer: Container;
}

export function createManagedText(options: ManagedTextOptions = {}): Text {
  const text = options.style === undefined
    ? new Text({ text: options.text ?? '' })
    : new Text({ text: options.text ?? '', style: options.style });
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

export function destroyManagedText(text: Text): void {
  text.removeFromParent();
  safeDestroyDisplayObject(text);
}

export function createKeyedTextReconciler(options: CreateKeyedTextReconcilerOptions): KeyedTextReconciler {
  const entries = new Map<string, { instanceKey: string | null; text: Text }>();

  function applySpec(text: Text, spec: KeyedTextSpec): void {
    text.text = spec.text;
    if (spec.style !== undefined) {
      text.style = spec.style;
    }
    if (spec.anchor !== undefined) {
      text.anchor.set(spec.anchor.x, spec.anchor.y);
    }
    if (spec.position !== undefined) {
      text.position.set(spec.position.x, spec.position.y);
    }
    text.visible = spec.visible ?? true;
    text.renderable = spec.renderable ?? true;
    if (spec.alpha !== undefined) {
      text.alpha = spec.alpha;
    }
    if (spec.rotation !== undefined) {
      text.rotation = spec.rotation;
    }
    if (spec.scale !== undefined) {
      text.scale.set(spec.scale.x, spec.scale.y);
    }
    spec.apply?.(text);
  }

  function createFromSpec(spec: KeyedTextSpec): Text {
    const text = createManagedText({
      parent: options.parentContainer,
      text: spec.text,
      ...(spec.style !== undefined ? { style: spec.style } : {}),
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
            destroyManagedText(entry.text);
          }
          const text = createFromSpec(spec);
          entries.set(spec.key, { instanceKey, text });
          continue;
        }

        if (entry.text.parent !== options.parentContainer) {
          options.parentContainer.addChild(entry.text);
        }
        applySpec(entry.text, spec);
      }

      for (const [key, entry] of entries) {
        if (activeKeys.has(key)) {
          continue;
        }
        destroyManagedText(entry.text);
        entries.delete(key);
      }
    },

    get(key: string): Text | undefined {
      return entries.get(key)?.text;
    },

    destroy(): void {
      for (const entry of entries.values()) {
        destroyManagedText(entry.text);
      }
      entries.clear();
    },
  };
}
