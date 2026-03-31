import { describe, expect, it, vi } from 'vitest';

const { MockGraphics } = vi.hoisted(() => {
  class MockEmitter {
    private readonly listeners = new Map<string, Set<(...args: unknown[]) => void>>();

    on(event: string, listener: (...args: unknown[]) => void): this {
      const listeners = this.listeners.get(event) ?? new Set<(...args: unknown[]) => void>();
      listeners.add(listener);
      this.listeners.set(event, listeners);
      return this;
    }

    off(event: string, listener: (...args: unknown[]) => void): this {
      this.listeners.get(event)?.delete(listener);
      return this;
    }

    emit(event: string, ...args: unknown[]): boolean {
      const listeners = this.listeners.get(event);
      if (listeners === undefined) {
        return false;
      }
      for (const listener of listeners) {
        listener(...args);
      }
      return listeners.size > 0;
    }

    listenerCount(event: string): number {
      return this.listeners.get(event)?.size ?? 0;
    }
  }

  class HoistedMockGraphics extends MockEmitter {
    children: HoistedMockGraphics[] = [];

    parent: HoistedMockGraphics | null = null;

    position = {
      x: 0,
      y: 0,
      set: (x: number, y: number) => {
        this.position.x = x;
        this.position.y = y;
      },
    };

    eventMode: 'none' | 'static' | 'passive' = 'none';

    cursor = 'default';

    circleArgs: [number, number, number] | null = null;

    fillStyle: unknown;

    strokeStyle: unknown;

    clear(): this {
      this.circleArgs = null;
      this.fillStyle = undefined;
      this.strokeStyle = undefined;
      return this;
    }

    circle(x: number, y: number, radius: number): this {
      this.circleArgs = [x, y, radius];
      return this;
    }

    fill(style: unknown): this {
      this.fillStyle = style;
      return this;
    }

    stroke(style: unknown): this {
      this.strokeStyle = style;
      return this;
    }

    addChild(...children: HoistedMockGraphics[]): void {
      for (const child of children) {
        child.parent = this;
        this.children.push(child);
      }
    }

    removeFromParent(): void {
      if (this.parent === null) {
        return;
      }
      this.parent.children = this.parent.children.filter((child) => child !== this);
      this.parent = null;
    }

    destroy(): void {
      this.removeFromParent();
    }
  }

  return { MockGraphics: HoistedMockGraphics };
});

vi.mock('pixi.js', () => ({
  Graphics: MockGraphics,
}));

import {
  createDraggableHandle,
  createMidpointHandle,
  DOUBLE_CLICK_MS,
  DRAGGABLE_HANDLE_COLOR,
  MIDPOINT_HANDLE_COLOR,
  MIDPOINT_HANDLE_ALPHA,
} from '../../src/map-editor/handle-graphics.js';

describe('handle-graphics', () => {
  describe('createMidpointHandle', () => {
    it('creates a Graphics at the given position', () => {
      const handle = createMidpointHandle(100, 200);
      expect(handle.position.x).toBe(100);
      expect(handle.position.y).toBe(200);
    });

    it('sets the event mode to static and cursor to pointer', () => {
      const handle = createMidpointHandle(0, 0);
      expect(handle.eventMode).toBe('static');
      expect(handle.cursor).toBe('pointer');
    });

    it('draws a blue circle with the midpoint style', () => {
      const handle = createMidpointHandle(0, 0) as unknown as InstanceType<typeof MockGraphics>;
      expect(handle.circleArgs).toEqual([0, 0, 5]);
      expect(handle.fillStyle).toEqual({ color: MIDPOINT_HANDLE_COLOR, alpha: MIDPOINT_HANDLE_ALPHA });
    });
  });

  describe('createDraggableHandle', () => {
    it('creates a Graphics at the given position', () => {
      const handle = createDraggableHandle(50, 75);
      expect(handle.position.x).toBe(50);
      expect(handle.position.y).toBe(75);
    });

    it('sets the event mode to static and cursor to grab', () => {
      const handle = createDraggableHandle(0, 0);
      expect(handle.eventMode).toBe('static');
      expect(handle.cursor).toBe('grab');
    });

    it('draws an amber circle with the draggable style', () => {
      const handle = createDraggableHandle(0, 0) as unknown as InstanceType<typeof MockGraphics>;
      expect(handle.circleArgs).toEqual([0, 0, 7]);
      expect(handle.fillStyle).toEqual({ color: DRAGGABLE_HANDLE_COLOR });
    });

    it('wires up pointerover and pointerout hover handlers', () => {
      const handle = createDraggableHandle(0, 0) as unknown as InstanceType<typeof MockGraphics>;
      expect(handle.listenerCount('pointerover')).toBe(1);
      expect(handle.listenerCount('pointerout')).toBe(1);
    });
  });

  describe('DOUBLE_CLICK_MS', () => {
    it('exports a positive threshold value', () => {
      expect(DOUBLE_CLICK_MS).toBeGreaterThan(0);
      expect(DOUBLE_CLICK_MS).toBe(300);
    });
  });
});
