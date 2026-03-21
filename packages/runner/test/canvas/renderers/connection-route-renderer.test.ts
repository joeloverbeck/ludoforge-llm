import { describe, expect, it, vi } from 'vitest';
import type { Container } from 'pixi.js';

const {
  MockContainer,
  MockGraphics,
  MockPolygon,
  MockText,
} = vi.hoisted(() => {
  class MockPoint {
    x = 0;

    y = 0;

    set(x: number, y: number): void {
      this.x = x;
      this.y = y;
    }
  }

  class MockAnchor {
    x = 0;

    y = 0;

    set(x: number, y: number): void {
      this.x = x;
      this.y = y;
    }
  }

  class HoistedMockContainer {
    children: HoistedMockContainer[] = [];

    parent: HoistedMockContainer | null = null;

    position = new MockPoint();

    visible = true;

    renderable = true;

    rotation = 0;

    eventMode: 'none' | 'static' = 'none';

    interactiveChildren = true;

    hitArea: unknown = null;

    cursor = 'default';

    on = vi.fn((_event: string, _handler: unknown) => this);

    off = vi.fn((_event: string, _handler: unknown) => this);

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

    quadraticCurveToArgs: [number, number, number, number] | null = null;

    lineToArgs: Array<[number, number]> = [];

    strokeStyle: unknown;

    fillStyle: unknown;

    circleArgs: [number, number, number] | null = null;

    clear(): this {
      this.moveToArgs = null;
      this.quadraticCurveToArgs = null;
      this.lineToArgs = [];
      this.strokeStyle = undefined;
      this.fillStyle = undefined;
      this.circleArgs = null;
      return this;
    }

    moveTo(x: number, y: number): this {
      this.moveToArgs = [x, y];
      return this;
    }

    quadraticCurveTo(cx: number, cy: number, x: number, y: number): this {
      this.quadraticCurveToArgs = [cx, cy, x, y];
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

    circle(x: number, y: number, radius: number): this {
      this.circleArgs = [x, y, radius];
      return this;
    }

    fill(style: unknown): this {
      this.fillStyle = style;
      return this;
    }
  }

  class HoistedMockText extends HoistedMockContainer {
    text: string;

    style: unknown;

    anchor = new MockAnchor();

    constructor(options: { text: string; style?: unknown }) {
      super();
      this.text = options.text;
      this.style = options.style;
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
    MockText: HoistedMockText,
  };
});

vi.mock('pixi.js', () => ({
  BitmapText: MockText,
  Container: MockContainer,
  Graphics: MockGraphics,
  Polygon: MockPolygon,
}));

vi.mock('../../../src/canvas/text/bitmap-font-registry', () => ({
  STROKE_LABEL_FONT_NAME: 'ludoforge-label-stroke',
}));

import { createConnectionRouteRenderer } from '../../../src/canvas/renderers/connection-route-renderer.js';
import { VisualConfigProvider } from '../../../src/config/visual-config-provider.js';
import type { ConnectionRouteNode, JunctionNode } from '../../../src/presentation/connection-route-resolver.js';
import type { PresentationZoneNode } from '../../../src/presentation/presentation-scene.js';

function makeZone(overrides: Partial<PresentationZoneNode> = {}): PresentationZoneNode {
  return {
    id: 'loc-alpha-beta:none',
    displayName: 'Alpha Beta',
    ownerID: null,
    isSelectable: false,
    category: 'loc',
    attributes: {},
    visual: {
      shape: 'connection',
      width: 160,
      height: 100,
      color: null,
      connectionStyleKey: 'highway',
    },
    render: {
      fillColor: '#4d5c6d',
      stroke: { color: '#111827', width: 1, alpha: 0.7 },
      hiddenStackCount: 0,
      nameLabel: { text: 'Alpha Beta', x: 0, y: 0, visible: true },
      markersLabel: { text: '', x: 0, y: 0, visible: false },
      badge: null,
    },
    ...overrides,
  };
}

function makeRoute(overrides: Partial<ConnectionRouteNode> = {}): ConnectionRouteNode {
  const zone = makeZone();
  return {
    zoneId: zone.id,
    displayName: zone.displayName,
    endpointZoneIds: ['alpha:none', 'beta:none'],
    touchingZoneIds: [],
    connectedConnectionIds: [],
    connectionStyleKey: 'highway',
    zone,
    ...overrides,
  };
}

describe('createConnectionRouteRenderer', () => {
  it('renders straight routes, midpoint containers, and junctions', () => {
    const parent = new MockContainer();
    const provider = new VisualConfigProvider({
      version: 1,
      zones: {
        connectionStyles: {
          highway: { strokeWidth: 8, strokeColor: '#8b7355', strokeAlpha: 0.8 },
        },
      },
    });
    const renderer = createConnectionRouteRenderer(parent as unknown as Container, provider);

    renderer.update(
      [makeRoute()],
      [{
        id: 'junction:alpha-beta',
        connectionIds: ['loc-alpha-beta:none', 'loc-alpha-beta:none'],
        position: { x: 100, y: 20 },
      }],
      new Map([
        ['alpha:none', { x: 0, y: 0 }],
        ['beta:none', { x: 200, y: 0 }],
      ]),
    );

    expect(parent.children).toHaveLength(2);
    const routeRoot = parent.children[0] as InstanceType<typeof MockContainer>;
    const routeCurve = routeRoot.children[0] as InstanceType<typeof MockGraphics>;
    const midpoint = renderer.getContainerMap().get('loc-alpha-beta:none') as unknown as InstanceType<typeof MockContainer>;
    const label = routeRoot.children[2] as InstanceType<typeof MockText>;
    const junction = parent.children[1] as InstanceType<typeof MockGraphics>;

    expect(routeCurve.quadraticCurveToArgs).not.toBeNull();
    expect(routeCurve.lineToArgs).toEqual([]);
    expect(routeCurve.strokeStyle).toEqual({ color: 0x8b7355, width: 8, alpha: 0.8 });
    expect(midpoint.position.x).toBeCloseTo(100);
    expect(midpoint.position.y).toBeCloseTo(15);
    expect(label.text).toBe('Alpha Beta');
    expect(routeRoot.hitArea).toBeInstanceOf(MockPolygon);
    expect(junction.circleArgs).toEqual([100, 20, 6]);
  });

  it('binds selection to midpoint containers and cleans bindings on removal and destroy', () => {
    const parent = new MockContainer();
    const cleanup = vi.fn();
    const bindSelection = vi.fn(() => cleanup);
    const renderer = createConnectionRouteRenderer(
      parent as unknown as Container,
      new VisualConfigProvider(null),
      { bindSelection },
    );

    renderer.update(
      [makeRoute({ zone: makeZone({ isSelectable: true }) })],
      [],
      new Map([
        ['alpha:none', { x: 0, y: 0 }],
        ['beta:none', { x: 200, y: 0 }],
      ]),
    );

    expect(bindSelection).toHaveBeenCalledTimes(1);
    expect(bindSelection).toHaveBeenCalledWith(
      expect.any(MockContainer),
      'loc-alpha-beta:none',
      expect.any(Function),
    );
    const bindSelectionCalls = bindSelection.mock.calls as unknown[][];
    const isSelectable = bindSelectionCalls[0]?.[2] as (() => boolean) | undefined;
    expect(isSelectable?.()).toBe(true);

    renderer.update([], [], new Map());
    expect(cleanup).toHaveBeenCalledTimes(1);

    renderer.destroy();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('renders wavy routes as polylines and uses interaction stroke overrides when present', () => {
    const parent = new MockContainer();
    const provider = new VisualConfigProvider({
      version: 1,
      zones: {
        connectionStyles: {
          mekong: {
            strokeWidth: 12,
            strokeColor: '#4a7a8c',
            strokeAlpha: 0.9,
            wavy: true,
            waveAmplitude: 4,
            waveFrequency: 0.08,
          },
        },
      },
    });
    const renderer = createConnectionRouteRenderer(parent as unknown as Container, provider, {
      wavySegments: 8,
    });

    renderer.update(
      [makeRoute({
        zoneId: 'loc-mekong:none',
        displayName: 'Mekong',
        connectionStyleKey: 'mekong',
        zone: makeZone({
          id: 'loc-mekong:none',
          displayName: 'Mekong',
          render: {
            fillColor: '#4d5c6d',
            stroke: { color: '#60a5fa', width: 3, alpha: 1 },
            hiddenStackCount: 0,
            nameLabel: { text: 'Mekong', x: 0, y: 0, visible: true },
            markersLabel: { text: '', x: 0, y: 0, visible: false },
            badge: null,
          },
        }),
      })],
      [],
      new Map([
        ['alpha:none', { x: 0, y: 0 }],
        ['beta:none', { x: 200, y: 0 }],
      ]),
    );

    const routeRoot = parent.children[0] as InstanceType<typeof MockContainer>;
    const routeCurve = routeRoot.children[0] as InstanceType<typeof MockGraphics>;
    expect(routeCurve.quadraticCurveToArgs).toBeNull();
    expect(routeCurve.lineToArgs).toHaveLength(8);
    expect(routeCurve.strokeStyle).toEqual({ color: 0x60a5fa, width: 3, alpha: 1 });
  });

  it('hides routes with missing endpoint positions and destroys all children on destroy', () => {
    const parent = new MockContainer();
    const renderer = createConnectionRouteRenderer(parent as unknown as Container, new VisualConfigProvider(null));

    renderer.update(
      [makeRoute({ connectionStyleKey: null })],
      [] satisfies readonly JunctionNode[],
      new Map([['alpha:none', { x: 0, y: 0 }]]),
    );

    const routeRoot = parent.children[0] as InstanceType<typeof MockContainer>;
    expect(routeRoot.visible).toBe(false);
    expect(renderer.getContainerMap().has('loc-alpha-beta:none')).toBe(true);

    renderer.destroy();

    expect(parent.children).toHaveLength(0);
    expect(renderer.getContainerMap()).toEqual(new Map());
  });
});
