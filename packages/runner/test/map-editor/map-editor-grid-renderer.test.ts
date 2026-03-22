import { describe, expect, it, vi } from 'vitest';
import type { Container } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { GameDef } from '@ludoforge/engine/runtime';

const {
  MockContainer,
  MockGraphics,
} = vi.hoisted(() => {
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

  class HoistedMockContainer extends MockEmitter {
    children: HoistedMockContainer[] = [];

    parent: HoistedMockContainer | null = null;

    eventMode: 'none' | 'static' | 'passive' = 'none';

    interactiveChildren = true;

    visible = true;

    addChild(...children: HoistedMockContainer[]): void {
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
      this.children = [];
    }
  }

  class HoistedMockGraphics extends HoistedMockContainer {
    moveToArgs: Array<[number, number]> = [];

    lineToArgs: Array<[number, number]> = [];

    strokeStyle: unknown;

    clear(): this {
      this.moveToArgs = [];
      this.lineToArgs = [];
      this.strokeStyle = undefined;
      return this;
    }

    moveTo(x: number, y: number): this {
      this.moveToArgs.push([x, y]);
      return this;
    }

    lineTo(x: number, y: number): this {
      this.lineToArgs.push([x, y]);
      return this;
    }

    stroke(style: unknown): this {
      this.strokeStyle = style;
      return this;
    }
  }

  return {
    MockContainer: HoistedMockContainer,
    MockGraphics: HoistedMockGraphics,
  };
});

vi.mock('pixi.js', () => ({
  Container: MockContainer,
  Graphics: MockGraphics,
}));

import { createMapEditorStore } from '../../src/map-editor/map-editor-store.js';
import { createEditorGridRenderer } from '../../src/map-editor/map-editor-grid-renderer.js';
import type { VisualConfig } from '../../src/map-editor/map-editor-types.js';

describe('createEditorGridRenderer', () => {
  it('draws grid lines at the configured interval when enabled', () => {
    const fixture = createFixture();
    const renderer = createEditorGridRenderer(
      fixture.backgroundLayer as unknown as Container,
      fixture.viewport as unknown as Viewport,
      fixture.store,
    );
    const graphics = fixture.backgroundLayer.children[0] as InstanceType<typeof MockGraphics>;

    expect(graphics.visible).toBe(false);

    fixture.store.getState().toggleGrid();

    expect(graphics.visible).toBe(true);
    expect(graphics.moveToArgs).toEqual([
      [0, 0],
      [20, 0],
      [40, 0],
      [60, 0],
      [0, 0],
      [0, 20],
      [0, 40],
      [0, 60],
    ]);
    expect(graphics.lineToArgs).toEqual([
      [0, 60],
      [20, 60],
      [40, 60],
      [60, 60],
      [60, 0],
      [60, 20],
      [60, 40],
      [60, 60],
    ]);
    expect(graphics.strokeStyle).toEqual({
      color: 0x8f7751,
      alpha: 0.18,
      width: 1,
    });

    fixture.store.getState().setGridSize(10);

    expect(graphics.moveToArgs).toHaveLength(11);
    expect(graphics.lineToArgs).toHaveLength(11);

    renderer.destroy();
  });

  it('re-renders against the latest viewport bounds when the viewport moves', () => {
    const fixture = createFixture();
    fixture.store.getState().toggleGrid();
    createEditorGridRenderer(
      fixture.backgroundLayer as unknown as Container,
      fixture.viewport as unknown as Viewport,
      fixture.store,
    );
    const graphics = fixture.backgroundLayer.children[0] as InstanceType<typeof MockGraphics>;

    fixture.viewport.left = 25;
    fixture.viewport.right = 65;
    fixture.viewport.top = 15;
    fixture.viewport.bottom = 55;
    fixture.viewport.emit('moved');

    expect(graphics.moveToArgs[0]).toEqual([20, 0]);
    expect(graphics.lineToArgs[0]).toEqual([20, 60]);
  });

  it('cleans up the viewport listener and graphics on destroy', () => {
    const fixture = createFixture();
    const renderer = createEditorGridRenderer(
      fixture.backgroundLayer as unknown as Container,
      fixture.viewport as unknown as Viewport,
      fixture.store,
    );

    expect(fixture.viewport.listenerCount('moved')).toBe(1);

    renderer.destroy();

    expect(fixture.viewport.listenerCount('moved')).toBe(0);
    expect(fixture.backgroundLayer.children).toHaveLength(0);
  });
});

function createFixture() {
  const backgroundLayer = new MockContainer();
  const viewport = new MockContainer() as InstanceType<typeof MockContainer> & {
    left: number;
    right: number;
    top: number;
    bottom: number;
  };
  viewport.left = 5;
  viewport.right = 45;
  viewport.top = 10;
  viewport.bottom = 50;

  const store = createMapEditorStore(
    {
      metadata: {
        id: 'editor-test',
        players: { min: 1, max: 4 },
      },
      zones: [{ id: 'zone:a' }],
    } as unknown as GameDef,
    {
      version: 1,
      zones: {
        connectionRoutes: {},
      },
    } as VisualConfig,
    new Map([['zone:a', { x: 0, y: 0 }]]),
  );

  return {
    backgroundLayer,
    store,
    viewport,
  };
}
