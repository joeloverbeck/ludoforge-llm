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

export interface TextSlotPool {
  acquire(index: number): Text;
  hideFrom(startIndex: number): void;
  readonly allocatedCount: number;
  destroyAll(): void;
}

interface CreateTextSlotPoolOptions {
  readonly parentContainer: Container;
  readonly createText: () => Text;
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

export function createTextSlotPool(options: CreateTextSlotPoolOptions): TextSlotPool {
  const slots: Text[] = [];

  function acquire(index: number): Text {
    if (index < slots.length) {
      const slot = slots[index]!;
      slot.visible = true;
      slot.renderable = true;
      if (slot.parent !== options.parentContainer) {
        options.parentContainer.addChild(slot);
      }
      return slot;
    }

    while (slots.length < index) {
      const filler = options.createText();
      filler.visible = false;
      filler.renderable = false;
      slots.push(filler);
      options.parentContainer.addChild(filler);
    }

    const slot = options.createText();
    slots.push(slot);
    options.parentContainer.addChild(slot);
    return slot;
  }

  function hideFrom(startIndex: number): void {
    for (let index = startIndex; index < slots.length; index += 1) {
      const slot = slots[index]!;
      slot.visible = false;
      slot.renderable = false;
    }
  }

  function destroyAll(): void {
    for (const slot of slots) {
      destroyManagedText(slot);
    }
    slots.length = 0;
  }

  return {
    acquire,
    hideFrom,
    get allocatedCount(): number {
      return slots.length;
    },
    destroyAll,
  };
}
