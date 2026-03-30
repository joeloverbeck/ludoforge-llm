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

    roundRectArgs: [number, number, number, number, number] | null = null;

    clear(): this {
      this.moveToArgs = null;
      this.quadraticCurveToArgs = null;
      this.lineToArgs = [];
      this.strokeStyle = undefined;
      this.fillStyle = undefined;
      this.circleArgs = null;
      this.roundRectArgs = null;
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

    roundRect(x: number, y: number, width: number, height: number, radius: number): this {
      this.roundRectArgs = [x, y, width, height, radius];
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
  LABEL_FONT_NAME: 'ludoforge-label',
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
      vertices: null,
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
    path: [
      { kind: 'zone', id: 'alpha:none', position: { x: 0, y: 0 } },
      { kind: 'anchor', id: 'beta-anchor', position: { x: 200, y: 0 } },
    ],
    segments: [
      {
        kind: 'quadratic',
        controlPoint: { kind: 'position', id: null, position: { x: 100, y: 30 } },
      },
    ],
    touchingZoneIds: [],
    spurs: [],
    connectionStyleKey: 'highway',
    zone,
    ...overrides,
  };
}

describe('createConnectionRouteRenderer', () => {
  it('renders explicit quadratic routes, midpoint containers, and shared-anchor junctions', () => {
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
        id: 'junction:anchor:beta-anchor',
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
    const labelCluster = midpoint.children[0] as InstanceType<typeof MockContainer>;
    const label = labelCluster.children[0] as InstanceType<typeof MockText>;
    const junction = parent.children[1] as InstanceType<typeof MockGraphics>;

    expect(routeCurve.quadraticCurveToArgs).toEqual([100, 30, 200, 0]);
    expect(routeCurve.lineToArgs).toEqual([]);
    expect(routeCurve.strokeStyle).toEqual({ color: 0x8b7355, width: 8, alpha: 0.8 });
    expect(midpoint.position.x).toBeCloseTo(100);
    expect(midpoint.position.y).toBeCloseTo(15);
    expect(labelCluster.rotation).toBeCloseTo(0, 1);
    expect(label.text).toBe('Alpha Beta');
    expect(routeRoot.hitArea).toBeInstanceOf(MockPolygon);
    expect(junction.circleArgs).toEqual([100, 20, 6]);
  });

  it('averages route colors for shared-anchor junctions referenced by multiple routes', () => {
    const parent = new MockContainer();
    const provider = new VisualConfigProvider({
      version: 1,
      zones: {
        connectionStyles: {
          highway: { strokeWidth: 8, strokeColor: '#ff0000', strokeAlpha: 0.8 },
          river: { strokeWidth: 8, strokeColor: '#0000ff', strokeAlpha: 0.8 },
          trail: { strokeWidth: 8, strokeColor: '#00ff00', strokeAlpha: 0.8 },
        },
      },
    });
    const renderer = createConnectionRouteRenderer(parent as unknown as Container, provider);

    renderer.update(
      [
        makeRoute(),
        makeRoute({
          zoneId: 'loc-beta-gamma:none',
          displayName: 'Beta Gamma',
          connectionStyleKey: 'river',
          zone: makeZone({
            id: 'loc-beta-gamma:none',
            displayName: 'Beta Gamma',
            visual: {
              shape: 'connection',
              width: 160,
              height: 100,
              color: null,
              connectionStyleKey: 'river',
              vertices: null,
            },
          }),
        }),
        makeRoute({
          zoneId: 'loc-gamma-delta:none',
          displayName: 'Gamma Delta',
          connectionStyleKey: 'trail',
          zone: makeZone({
            id: 'loc-gamma-delta:none',
            displayName: 'Gamma Delta',
            visual: {
              shape: 'connection',
              width: 160,
              height: 100,
              color: null,
              connectionStyleKey: 'trail',
              vertices: null,
            },
          }),
        }),
      ],
      [{
        id: 'junction:anchor:shared-node',
        connectionIds: ['loc-alpha-beta:none', 'loc-beta-gamma:none', 'loc-gamma-delta:none'],
        position: { x: 100, y: 20 },
      }],
      new Map(),
    );

    const junction = parent.children[3] as InstanceType<typeof MockGraphics>;
    expect(junction.fillStyle).toEqual({ color: 0x555555, alpha: 0.95 });
  });

  it('renders marker labels and badge visuals inside the midpoint label cluster and updates them in place', () => {
    const parent = new MockContainer();
    const renderer = createConnectionRouteRenderer(parent as unknown as Container, new VisualConfigProvider(null));

    const routeWithMarkers = makeRoute({
      zone: makeZone({
        render: {
          fillColor: '#4d5c6d',
          stroke: { color: '#111827', width: 1, alpha: 0.7 },
          hiddenStackCount: 0,
          nameLabel: { text: 'Alpha Beta', x: 0, y: 0, visible: true },
          markersLabel: { text: 'Sabotage', x: 0, y: 66, visible: true },
          badge: { text: 'AO', color: '#dc2626', x: 18, y: -8, width: 30, height: 20 },
        },
      }),
    });

    renderer.update(
      [routeWithMarkers],
      [],
      new Map([
        ['alpha:none', { x: 0, y: 0 }],
        ['beta:none', { x: 200, y: 0 }],
      ]),
    );

    const midpoint = renderer.getContainerMap().get('loc-alpha-beta:none') as unknown as InstanceType<typeof MockContainer>;
    const labelCluster = midpoint.children[0] as InstanceType<typeof MockContainer>;
    const label = labelCluster.children[0] as InstanceType<typeof MockText>;
    const markersLabel = labelCluster.children[1] as InstanceType<typeof MockText>;
    const badgeGraphics = labelCluster.children[2] as InstanceType<typeof MockGraphics>;
    const badgeLabel = labelCluster.children[3] as InstanceType<typeof MockText>;

    expect(label.text).toBe('Alpha Beta');
    expect(markersLabel.text).toBe('Sabotage');
    expect(markersLabel.visible).toBe(true);
    expect(markersLabel.position.x).toBe(0);
    expect(markersLabel.position.y).toBe(18);
    expect(badgeGraphics.visible).toBe(true);
    expect(badgeGraphics.roundRectArgs).toEqual([18, -8, 30, 20, 4]);
    expect(badgeGraphics.fillStyle).toEqual({ color: 0xdc2626 });
    expect(badgeLabel.visible).toBe(true);
    expect(badgeLabel.text).toBe('AO');
    expect(badgeLabel.position.x).toBe(33);
    expect(badgeLabel.position.y).toBe(2);

    renderer.update(
      [makeRoute({
        zone: makeZone({
          render: {
            fillColor: '#4d5c6d',
            stroke: { color: '#111827', width: 1, alpha: 0.7 },
            hiddenStackCount: 0,
            nameLabel: { text: 'Alpha Beta', x: 0, y: 0, visible: true },
            markersLabel: { text: 'Control:COIN', x: 12, y: 84, visible: true },
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

    const updatedLabelCluster = midpoint.children[0] as InstanceType<typeof MockContainer>;
    const updatedMarkersLabel = updatedLabelCluster.children[1] as InstanceType<typeof MockText>;
    const updatedBadgeGraphics = updatedLabelCluster.children[2] as InstanceType<typeof MockGraphics>;
    const updatedBadgeLabel = updatedLabelCluster.children[3] as InstanceType<typeof MockText>;

    expect(updatedMarkersLabel.text).toBe('Control:COIN');
    expect(updatedMarkersLabel.position.x).toBe(12);
    expect(updatedMarkersLabel.position.y).toBe(18);
    expect(updatedBadgeGraphics.visible).toBe(false);
    expect(updatedBadgeLabel.visible).toBe(false);
    expect(updatedLabelCluster.children[1]).toBe(markersLabel);
    expect(updatedLabelCluster.children[2]).toBe(badgeGraphics);
    expect(updatedLabelCluster.children[3]).toBe(badgeLabel);
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

  it('renders explicit multi-point routes as deterministic polylines', () => {
    const parent = new MockContainer();
    const renderer = createConnectionRouteRenderer(parent as unknown as Container, new VisualConfigProvider(null));

    renderer.update(
      [makeRoute({
        path: [
          { kind: 'zone', id: 'alpha:none', position: { x: 0, y: 0 } },
          { kind: 'anchor', id: 'an-loc', position: { x: 100, y: -20 } },
          { kind: 'anchor', id: 'ban-me-thuot', position: { x: 220, y: -10 } },
        ],
        segments: [
          { kind: 'straight' },
          { kind: 'straight' },
        ],
      })],
      [],
      new Map(),
    );

    const routeRoot = parent.children[0] as InstanceType<typeof MockContainer>;
    const routeCurve = routeRoot.children[0] as InstanceType<typeof MockGraphics>;
    const midpoint = renderer.getContainerMap().get('loc-alpha-beta:none') as unknown as InstanceType<typeof MockContainer>;

    expect(routeCurve.quadraticCurveToArgs).toBeNull();
    expect(routeCurve.lineToArgs).toEqual([
      [100, -20],
      [220, -10],
    ]);
    expect(routeRoot.hitArea).toBeInstanceOf(MockPolygon);
    expect(midpoint.position.x).toBeGreaterThan(100);
    expect(midpoint.position.x).toBeLessThan(220);
  });

  it('renders spur segments using the parent route stroke', () => {
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
      [makeRoute({
        spurs: [
          {
            from: { x: 80, y: 10 },
            to: { x: 80, y: 60 },
            targetZoneId: 'quang-tin-quang-ngai:none',
          },
        ],
      })],
      [],
      new Map([
        ['alpha:none', { x: 0, y: 0 }],
        ['beta:none', { x: 200, y: 0 }],
      ]),
    );

    const routeRoot = parent.children[0] as InstanceType<typeof MockContainer>;
    const routeCurve = routeRoot.children[0] as InstanceType<typeof MockGraphics>;

    expect(routeCurve.lineToArgs).toEqual([[80, 60]]);
    expect(routeCurve.strokeStyle).toEqual({ color: 0x8b7355, width: 8, alpha: 0.8 });
  });

  it('renders from embedded route geometry without consulting the positions map and destroys all children on destroy', () => {
    const parent = new MockContainer();
    const renderer = createConnectionRouteRenderer(parent as unknown as Container, new VisualConfigProvider(null));

    renderer.update(
      [makeRoute({ connectionStyleKey: null })],
      [] satisfies readonly JunctionNode[],
      new Map(),
    );

    const routeRoot = parent.children[0] as InstanceType<typeof MockContainer>;
    expect(routeRoot.visible).toBe(true);
    expect(renderer.getContainerMap().has('loc-alpha-beta:none')).toBe(true);

    renderer.destroy();

    expect(parent.children).toHaveLength(0);
    expect(renderer.getContainerMap()).toEqual(new Map());
  });
});
