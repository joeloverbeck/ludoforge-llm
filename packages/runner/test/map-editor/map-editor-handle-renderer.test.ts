import { describe, expect, it, vi } from 'vitest';
import type { GameDef } from '@ludoforge/engine/runtime';
import type { Container } from 'pixi.js';

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
  }

  class HoistedMockContainer extends MockEmitter {
    children: HoistedMockContainer[] = [];

    parent: HoistedMockContainer | null = null;

    position = {
      x: 0,
      y: 0,
      set: (x: number, y: number) => {
        this.position.x = x;
        this.position.y = y;
      },
    };

    visible = true;

    renderable = true;

    eventMode: 'none' | 'static' | 'passive' = 'none';

    interactiveChildren = true;

    cursor = 'default';

    addChild(...children: HoistedMockContainer[]): void {
      for (const child of children) {
        child.parent = this;
        this.children.push(child);
      }
    }

    removeChildren(): HoistedMockContainer[] {
      const removed = [...this.children];
      for (const child of removed) {
        child.parent = null;
      }
      this.children = [];
      return removed;
    }

    removeFromParent(): void {
      if (this.parent === null) {
        return;
      }
      this.parent.children = this.parent.children.filter((child) => child !== this);
      this.parent = null;
    }

    destroy(options?: { children?: boolean }): void {
      if (options?.children === true) {
        this.removeChildren().forEach((child) => child.destroy({ children: true }));
      }
      this.removeFromParent();
    }
  }

  class HoistedMockGraphics extends HoistedMockContainer {
    strokeStyle: unknown;

    fillStyle: unknown;

    polyArgs: number[] | null = null;

    circleArgs: [number, number, number] | null = null;

    lineToArgs: Array<[number, number]> = [];

    moveToArgs: Array<[number, number]> = [];

    moveTo(x: number, y: number): this {
      this.moveToArgs.push([x, y]);
      return this;
    }

    lineTo(x: number, y: number): this {
      this.lineToArgs.push([x, y]);
      return this;
    }

    circle(x: number, y: number, radius: number): this {
      this.circleArgs = [x, y, radius];
      return this;
    }

    poly(points: number[]): this {
      this.polyArgs = points;
      return this;
    }

    stroke(style: unknown): this {
      this.strokeStyle = style;
      return this;
    }

    fill(style: unknown): this {
      this.fillStyle = style;
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
import { createEditorHandleRenderer } from '../../src/map-editor/map-editor-handle-renderer.js';
import type { VisualConfig } from '../../src/map-editor/map-editor-types.js';

describe('createEditorHandleRenderer', () => {
  it('renders no handles when no route is selected', () => {
    const fixture = createFixture();

    createEditorHandleRenderer(
      fixture.handleLayer as unknown as Container,
      fixture.store,
    );

    const root = fixture.handleLayer.children[0] as InstanceType<typeof MockContainer>;
    expect(root.children).toHaveLength(0);
  });

  it('renders point handles, control handles, and tangent lines for the selected route', () => {
    const fixture = createFixture();

    const renderer = createEditorHandleRenderer(
      fixture.handleLayer as unknown as Container,
      fixture.store,
    );

    fixture.store.getState().selectRoute('route:road');

    const root = fixture.handleLayer.children[0] as InstanceType<typeof MockContainer>;
    expect(root.children).toHaveLength(5);

    const tangent = root.children[0] as InstanceType<typeof MockGraphics>;
    const zoneHandle = root.children[1] as InstanceType<typeof MockGraphics>;
    const anchorHandle = root.children[2] as InstanceType<typeof MockGraphics>;
    const zoneHandleB = root.children[3] as InstanceType<typeof MockGraphics>;
    const controlHandle = root.children[4] as InstanceType<typeof MockGraphics>;

    expect(tangent.strokeStyle).toEqual({ color: 0xffffff, width: 1, alpha: 0.5 });
    expect(zoneHandle.strokeStyle).toEqual({ color: 0xffffff, width: 2, alpha: 1 });
    expect(anchorHandle.fillStyle).toEqual({ color: 0xffffff, alpha: 1 });
    expect(zoneHandleB.strokeStyle).toEqual({ color: 0xffffff, width: 2, alpha: 1 });
    expect(anchorHandle.eventMode).toBe('static');
    expect(anchorHandle.cursor).toBe('grab');
    expect(anchorHandle.circleArgs).toEqual([0, 0, 8]);
    expect(anchorHandle.position).toEqual(expect.objectContaining({ x: 40, y: 20 }));
    expect(controlHandle.polyArgs).toEqual([0, -10, 10, 0, 0, 10, -10, 0]);
    expect(controlHandle.position).toEqual(expect.objectContaining({ x: 20, y: 0 }));

    fixture.store.getState().moveAnchor('anchor:mid', { x: 45, y: 25 });
    const updatedRoot = fixture.handleLayer.children[0] as InstanceType<typeof MockContainer>;
    const updatedAnchorHandle = updatedRoot.children[2] as InstanceType<typeof MockGraphics>;
    expect(updatedAnchorHandle.position).toEqual(expect.objectContaining({ x: 45, y: 25 }));

    renderer.destroy();
  });

  it('routes anchor drag interactions through the editor store', () => {
    const fixture = createFixture();
    createEditorHandleRenderer(
      fixture.handleLayer as unknown as Container,
      fixture.store,
    );

    fixture.store.getState().selectRoute('route:road');

    const root = fixture.handleLayer.children[0] as InstanceType<typeof MockContainer>;
    const anchorHandle = root.children[2] as InstanceType<typeof MockGraphics>;
    anchorHandle.emit('pointerdown', pointer(41, 21));
    fixture.handleLayer.emit('globalpointermove', pointer(51, 31));
    fixture.handleLayer.emit('pointerup');

    expect(fixture.store.getState().connectionAnchors.get('anchor:mid')).toEqual({ x: 50, y: 30 });
    expect(fixture.store.getState().undoStack).toHaveLength(1);
  });

  it('removes only non-endpoint anchor waypoints on right-click', () => {
    const fixture = createFixture();
    createEditorHandleRenderer(
      fixture.handleLayer as unknown as Container,
      fixture.store,
    );

    fixture.store.getState().selectRoute('route:road');
    const root = fixture.handleLayer.children[0] as InstanceType<typeof MockContainer>;
    const anchorHandle = root.children[2] as InstanceType<typeof MockGraphics>;
    anchorHandle.emit('pointerdown', { button: 2, stopPropagation() {} });

    expect(fixture.store.getState().connectionRoutes.get('route:road')).toEqual({
      points: [
        { kind: 'zone', zoneId: 'zone:a' },
        { kind: 'zone', zoneId: 'zone:b' },
      ],
      segments: [{ kind: 'straight' }],
    });
    expect(fixture.store.getState().connectionAnchors.has('anchor:mid')).toBe(false);
  });

  it('does not remove endpoint handles on right-click', () => {
    const fixture = createFixture({
      connectionRoutes: {
        'route:road': {
          points: [
            { kind: 'anchor', anchorId: 'anchor:start' },
            { kind: 'zone', zoneId: 'zone:b' },
          ],
          segments: [{ kind: 'straight' }],
        },
      },
      connectionAnchors: {
        'anchor:start': { x: 0, y: 0 },
      },
    });
    createEditorHandleRenderer(
      fixture.handleLayer as unknown as Container,
      fixture.store,
    );

    fixture.store.getState().selectRoute('route:road');
    const root = fixture.handleLayer.children[0] as InstanceType<typeof MockContainer>;
    const endpointHandle = root.children[0] as InstanceType<typeof MockGraphics>;
    endpointHandle.emit('pointerdown', { button: 2, stopPropagation() {} });

    expect(fixture.store.getState().connectionRoutes.get('route:road')?.points).toHaveLength(2);
    expect(fixture.store.getState().connectionAnchors.has('anchor:start')).toBe(true);

  });
});

function createFixture(overrides?: Partial<NonNullable<VisualConfig['zones']>>) {
  const handleLayer = new MockContainer();
  const store = createMapEditorStore(
    {
      metadata: {
        id: 'editor-test',
        players: { min: 1, max: 4 },
      },
      zones: [{ id: 'zone:a' }, { id: 'zone:b' }, { id: 'route:road' }],
    } as unknown as GameDef,
    {
      version: 1,
      zones: {
        connectionAnchors: {
          'anchor:mid': { x: 40, y: 20 },
          ...overrides?.connectionAnchors,
        },
        connectionRoutes: {
          'route:road': {
            points: [
              { kind: 'zone', zoneId: 'zone:a' },
              { kind: 'anchor', anchorId: 'anchor:mid' },
              { kind: 'zone', zoneId: 'zone:b' },
            ],
            segments: [
              { kind: 'quadratic', control: { kind: 'position', x: 20, y: 0 } },
              { kind: 'straight' },
            ],
          },
          ...overrides?.connectionRoutes,
        },
      },
    } as VisualConfig,
    new Map([
      ['zone:a', { x: 0, y: 0 }],
      ['zone:b', { x: 80, y: 0 }],
      ['route:road', { x: 40, y: 0 }],
    ]),
  );

  return {
    handleLayer,
    store,
  };
}

function pointer(x: number, y: number) {
  return {
    button: 0,
    getLocalPosition() {
      return { x, y };
    },
    stopPropagation() {},
  };
}
