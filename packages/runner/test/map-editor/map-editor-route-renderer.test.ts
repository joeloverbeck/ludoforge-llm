import { describe, expect, it, vi } from 'vitest';
import type { GameDef } from '@ludoforge/engine/runtime';
import type { Container } from 'pixi.js';

const {
  MockContainer,
  MockGraphics,
  MockPolygon,
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

  class MockPoint {
    x = 0;

    y = 0;

    set(x: number, y: number): void {
      this.x = x;
      this.y = y;
    }
  }

  class HoistedMockContainer extends MockEmitter {
    children: HoistedMockContainer[] = [];

    parent: HoistedMockContainer | null = null;

    position = new MockPoint();

    visible = true;

    renderable = true;

    eventMode: 'none' | 'static' | 'passive' = 'none';

    interactiveChildren = true;

    cursor = 'default';

    hitArea: unknown = null;

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
    moveToArgs: [number, number] | null = null;

    lineToArgs: Array<[number, number]> = [];

    quadraticCurveToArgs: Array<[number, number, number, number]> = [];

    strokeStyle: unknown;

    clear(): this {
      this.moveToArgs = null;
      this.lineToArgs = [];
      this.quadraticCurveToArgs = [];
      this.strokeStyle = undefined;
      this.hitArea = null;
      return this;
    }

    moveTo(x: number, y: number): this {
      this.moveToArgs = [x, y];
      return this;
    }

    lineTo(x: number, y: number): this {
      this.lineToArgs.push([x, y]);
      return this;
    }

    quadraticCurveTo(cx: number, cy: number, x: number, y: number): this {
      this.quadraticCurveToArgs.push([cx, cy, x, y]);
      return this;
    }

    stroke(style: unknown): this {
      this.strokeStyle = style;
      return this;
    }
  }

  class HoistedMockPolygon {
    points: number[];

    constructor(points: number[]) {
      this.points = points;
    }
  }

  return {
    MockContainer: HoistedMockContainer,
    MockGraphics: HoistedMockGraphics,
    MockPolygon: HoistedMockPolygon,
  };
});

vi.mock('pixi.js', () => ({
  BitmapFontManager: { install: vi.fn(), uninstall: vi.fn() },
  Container: MockContainer,
  Graphics: MockGraphics,
  Polygon: MockPolygon,
}));

import { VisualConfigProvider } from '../../src/config/visual-config-provider.js';
import { createMapEditorStore } from '../../src/map-editor/map-editor-store.js';
import { createEditorRouteRenderer } from '../../src/map-editor/map-editor-route-renderer.js';
import type { ConnectionRouteDefinition, VisualConfig } from '../../src/map-editor/map-editor-types.js';

describe('createEditorRouteRenderer', () => {
  it('creates one route graphics container per renderable connection zone', () => {
    const fixture = createFixture();

    const renderer = createEditorRouteRenderer(
      fixture.routeLayer as unknown as Container,
      fixture.store,
      fixture.gameDef,
      fixture.provider,
    );

    expect(renderer.getContainerMap().size).toBe(1);
    expect([...renderer.getContainerMap().keys()]).toEqual(['route:road']);
    expect(fixture.routeLayer.children).toHaveLength(1);
  });

  it('selects a route and clears any zone selection when clicked', () => {
    const fixture = createFixture();
    fixture.store.getState().selectZone('zone:a');

    const renderer = createEditorRouteRenderer(
      fixture.routeLayer as unknown as Container,
      fixture.store,
      fixture.gameDef,
      fixture.provider,
    );

    const graphics = renderer.getContainerMap().get('route:road') as unknown as InstanceType<typeof MockGraphics>;
    graphics.emit('pointertap', pointer(20, 10));

    expect(fixture.store.getState().selectedRouteId).toBe('route:road');
    expect(fixture.store.getState().selectedZoneId).toBeNull();
  });

  it('re-renders route geometry when positions change', () => {
    const fixture = createFixture();
    const renderer = createEditorRouteRenderer(
      fixture.routeLayer as unknown as Container,
      fixture.store,
      fixture.gameDef,
      fixture.provider,
    );

    const graphics = renderer.getContainerMap().get('route:road') as unknown as InstanceType<typeof MockGraphics>;
    expect(graphics.moveToArgs).toEqual([0, 0]);

    fixture.store.getState().moveZone('zone:a', { x: 15, y: 25 });

    expect(graphics.moveToArgs).toEqual([15, 25]);
    expect(graphics.quadraticCurveToArgs[0]).toEqual([40, 30, 80, 0]);
    expect(graphics.hitArea).toBeInstanceOf(MockPolygon);
  });

  it('inserts a waypoint on double-click at the nearest point on the targeted segment', () => {
    const fixture = createFixture();
    const renderer = createEditorRouteRenderer(
      fixture.routeLayer as unknown as Container,
      fixture.store,
      fixture.gameDef,
      fixture.provider,
    );

    const graphics = renderer.getContainerMap().get('route:road') as unknown as InstanceType<typeof MockGraphics>;
    graphics.emit('pointertap', pointer(18, 12));
    graphics.emit('pointertap', pointer(18, 12, { detail: 2 }));

    const route = fixture.store.getState().connectionRoutes.get('route:road');
    expect(route?.points).toHaveLength(3);
    expect(route?.points[1]).toEqual({ kind: 'anchor', anchorId: 'route:road:waypoint:1' });
    expect(route?.segments).toHaveLength(2);
    expect(fixture.store.getState().connectionAnchors.get('route:road:waypoint:1')).toEqual(
      expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
    );
  });

  it('toggles the clicked segment between straight and quadratic on right-click', () => {
    const fixture = createFixture({
      connectionRoutes: {
        'route:road': {
          points: [
            { kind: 'zone', zoneId: 'zone:a' },
            { kind: 'zone', zoneId: 'zone:b' },
          ],
          segments: [{ kind: 'straight' }],
        },
      },
    });
    const renderer = createEditorRouteRenderer(
      fixture.routeLayer as unknown as Container,
      fixture.store,
      fixture.gameDef,
      fixture.provider,
    );

    const graphics = renderer.getContainerMap().get('route:road') as unknown as InstanceType<typeof MockGraphics>;
    graphics.emit('pointerdown', pointer(40, 2, { button: 2 }));

    expect(fixture.store.getState().connectionRoutes.get('route:road')?.segments[0]).toEqual({
      kind: 'quadratic',
      control: { kind: 'position', x: 40, y: 0 },
    });
  });
});

function createFixture(overrides?: Partial<NonNullable<VisualConfig['zones']>>) {
  const gameDef = {
    metadata: {
      id: 'editor-test',
      players: { min: 1, max: 4 },
    },
    zones: [
      { id: 'zone:a', owner: 'none', visibility: 'public', ordering: 'stack' },
      { id: 'zone:b', owner: 'none', visibility: 'public', ordering: 'stack' },
      { id: 'route:road', owner: 'none', visibility: 'public', ordering: 'stack', category: 'road' },
    ],
  } as unknown as GameDef;
  const visualConfig = {
    version: 1,
    zones: {
      ...overrides,
      categoryStyles: {
        road: { shape: 'connection', connectionStyleKey: 'highway' },
      },
      connectionStyles: {
        highway: { strokeWidth: 6, strokeColor: '#8b7355', strokeAlpha: 0.75 },
      },
      connectionRoutes: {
        'route:road': makeRouteDefinition(),
        'not-a-connection': makeRouteDefinition(),
        ...overrides?.connectionRoutes,
      },
    },
  } as VisualConfig;

  const store = createMapEditorStore(
    gameDef,
    visualConfig,
    new Map([
      ['zone:a', { x: 0, y: 0 }],
      ['zone:b', { x: 80, y: 0 }],
      ['route:road', { x: 40, y: 0 }],
    ]),
  );
  const routeLayer = new MockContainer();

  return {
    gameDef,
    provider: new VisualConfigProvider(store.getState().originalVisualConfig),
    routeLayer,
    store,
  };
}

function pointer(
  x: number,
  y: number,
  options?: {
    readonly button?: number;
    readonly detail?: number;
  },
) {
  return {
    button: options?.button ?? 0,
    detail: options?.detail ?? 1,
    getLocalPosition() {
      return { x, y };
    },
    stopPropagation() {},
  };
}

function makeRouteDefinition(): ConnectionRouteDefinition {
  return {
    points: [
      { kind: 'zone', zoneId: 'zone:a' },
      { kind: 'zone', zoneId: 'zone:b' },
    ],
    segments: [
      { kind: 'quadratic', control: { kind: 'position', x: 40, y: 30 } },
    ],
  };
}
