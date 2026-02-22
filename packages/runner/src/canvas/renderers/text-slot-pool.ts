import { Text, type Container } from 'pixi.js';

import { safeDestroyDisplayObject } from './safe-destroy.js';

export interface TextSlotPool {
  acquire(index: number): Text;
  hideFrom(startIndex: number): void;
  readonly allocatedCount: number;
  destroyAll(): void;
}

export function createTextSlotPool(parentContainer: Container): TextSlotPool {
  const slots: Text[] = [];

  function acquire(index: number): Text {
    if (index < slots.length) {
      const slot = slots[index]!;
      slot.visible = true;
      slot.renderable = true;
      if (slot.parent !== parentContainer) {
        parentContainer.addChild(slot);
      }
      return slot;
    }

    while (slots.length < index) {
      const filler = createSlot();
      filler.visible = false;
      filler.renderable = false;
      slots.push(filler);
      parentContainer.addChild(filler);
    }

    const slot = createSlot();
    slots.push(slot);
    parentContainer.addChild(slot);
    return slot;
  }

  function hideFrom(startIndex: number): void {
    for (let i = startIndex; i < slots.length; i++) {
      const slot = slots[i]!;
      slot.visible = false;
      slot.renderable = false;
    }
  }

  function destroyAll(): void {
    for (const slot of slots) {
      safeDestroyDisplayObject(slot);
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

function createSlot(): Text {
  const slot = new Text({ text: '', style: { fill: '#f8fafc', fontSize: 12, fontFamily: 'monospace' } });
  slot.eventMode = 'none';
  slot.interactiveChildren = false;
  return slot;
}
