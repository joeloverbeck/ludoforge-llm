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

const DEFAULT_KEYED_TEXT_STYLE: TextStyleOptions = {};

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
  text.renderable = false;
  text.visible = false;
  text.removeFromParent();
  safeDestroyDisplayObject(text);
}

export function createKeyedTextReconciler(options: CreateKeyedTextReconcilerOptions): KeyedTextReconciler {
  const entries = new Map<string, { instanceKey: string | null; text: Text }>();

  function applySpec(text: Text, spec: KeyedTextSpec): void {
    text.text = spec.text;
    text.style = spec.style ?? DEFAULT_KEYED_TEXT_STYLE;
    text.anchor.set(spec.anchor?.x ?? 0, spec.anchor?.y ?? 0);
    text.position.set(spec.position?.x ?? 0, spec.position?.y ?? 0);
    text.visible = spec.visible ?? true;
    text.renderable = spec.renderable ?? true;
    text.alpha = spec.alpha ?? 1;
    text.rotation = spec.rotation ?? 0;
    text.scale.set(spec.scale?.x ?? 1, spec.scale?.y ?? 1);
    spec.apply?.(text);
  }

  function createFromSpec(spec: KeyedTextSpec): Text {
    const text = createManagedText({
      parent: options.parentContainer,
      text: spec.text,
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
