import { describe, expect, it, vi } from 'vitest';
import { asPlayerId } from '@ludoforge/engine/runtime';
import type { Container } from 'pixi.js';

const {
  MockContainer,
  MockGraphics,
  MockRectangle,
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

  class HoistedMockContainer {
    children: HoistedMockContainer[] = [];

    parent: HoistedMockContainer | null = null;

    position = new MockPoint();

    scale = new MockPoint();

    pivot = new MockPoint();

    skew = new MockPoint();

    rotation = 0;

    alpha = 1;

    visible = true;

    renderable = true;

    zIndex = 0;

    eventMode: 'none' | 'static' = 'none';

    interactiveChildren = true;

    sortableChildren = false;

    addChild(...children: HoistedMockContainer[]): void {
      for (const child of children) {
        child.parent = this;
        this.children.push(child);
      }
    }

    removeChildren(): void {
      for (const child of this.children) {
        child.parent = null;
      }

      this.children = [];
    }

    removeFromParent(): void {
      if (this.parent === null) {
        return;
      }

      this.parent.children = this.parent.children.filter((child) => child !== this);
      this.parent = null;
    }

    removeAllListeners(): void {}

    destroy(): void {
      this.removeFromParent();
      this.removeChildren();
    }
  }

  class HoistedMockGraphics extends HoistedMockContainer {
    fillStyle: unknown;

    strokeStyle: unknown;

    roundRectArgs: [number, number, number, number, number] | null = null;

    circleArgs: [number, number, number] | null = null;

    ellipseArgs: [number, number, number, number] | null = null;

    polyArgs: number[] | null = null;

    clear(): this {
      this.fillStyle = undefined;
      this.strokeStyle = undefined;
      this.roundRectArgs = null;
      this.circleArgs = null;
      this.ellipseArgs = null;
      this.polyArgs = null;
      return this;
    }

    roundRect(x: number, y: number, width: number, height: number, radius: number): this {
      this.roundRectArgs = [x, y, width, height, radius];
      return this;
    }

    circle(x: number, y: number, radius: number): this {
      this.circleArgs = [x, y, radius];
      return this;
    }

    ellipse(x: number, y: number, halfWidth: number, halfHeight: number): this {
      this.ellipseArgs = [x, y, halfWidth, halfHeight];
      return this;
    }

    poly(points: number[]): this {
      this.polyArgs = points;
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
  }

  class MockAnchor {
    x = 0;

    y = 0;

    set(x: number, y: number): void {
      this.x = x;
      this.y = y;
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

  class HoistedMockRectangle {
    x: number;

    y: number;

    width: number;

    height: number;

    constructor(x: number, y: number, width: number, height: number) {
      this.x = x;
      this.y = y;
      this.width = width;
      this.height = height;
    }
  }

  return {
    MockContainer: HoistedMockContainer,
    MockGraphics: HoistedMockGraphics,
    MockRectangle: HoistedMockRectangle,
    MockText: HoistedMockText,
  };
});

vi.mock('pixi.js', () => ({
  Container: MockContainer,
  Graphics: MockGraphics,
  Rectangle: MockRectangle,
  Text: MockText,
  BitmapText: MockText,
}));

vi.mock('../../../src/canvas/text/bitmap-font-registry', () => ({
  LABEL_FONT_NAME: 'ludoforge-label',
  STROKE_LABEL_FONT_NAME: 'ludoforge-label-stroke',
}));

import { createZoneRenderer } from '../../../src/canvas/renderers/zone-renderer';
import { ContainerPool } from '../../../src/canvas/renderers/container-pool';
import type { Position } from '../../../src/canvas/geometry';
import { VisualConfigProvider } from '../../../src/config/visual-config-provider.js';
import type { RenderZone } from '../../../src/model/render-model';
import type { PresentationZoneNode } from '../../../src/presentation/presentation-scene.js';
import { resolveZoneNodes } from '../../../src/presentation/presentation-scene.js';

function makeZone(overrides: Partial<RenderZone> = {}): RenderZone {
  return {
    id: 'zone:a',
    displayName: 'Zone A',
    ordering: 'stack',
    tokenIDs: [],
    hiddenTokenCount: 0,
    markers: [],
    visibility: 'public',
    isSelectable: false,
    isHighlighted: false,
    ownerID: null,
    category: null,
    attributes: {},
    visual: { shape: 'rectangle', width: 160, height: 100, color: null, connectionStyleKey: null, vertices: null, strokeColor: null },
    metadata: {},
    ...overrides,
  };
}

function createPositions(entries: readonly [string, Position][]): ReadonlyMap<string, Position> {
  return new Map(entries);
}

function toPresentationZones(
  zones: readonly RenderZone[],
  provider: VisualConfigProvider = new VisualConfigProvider(null),
  highlightedZoneIDs?: ReadonlySet<string>,
) {
  return resolveZoneNodes(zones, provider, highlightedZoneIDs);
}

function makePresentationZoneNode(overrides: Partial<PresentationZoneNode> = {}): PresentationZoneNode {
  const baseZone = toPresentationZones([makeZone()])[0]!;
  return {
    ...baseZone,
    ...overrides,
    render: overrides.render ?? baseZone.render,
  };
}

type ZoneRendererHarness = Omit<ReturnType<typeof createZoneRenderer>, 'update'> & {
  update(zones: readonly RenderZone[], positions: ReadonlyMap<string, Position>, highlightedZoneIDs?: ReadonlySet<string>): void;
};

function createRendererHarness(
  provider: VisualConfigProvider = new VisualConfigProvider(null),
  options: Parameters<typeof createZoneRenderer>[2] = {},
): {
  readonly parent: InstanceType<typeof MockContainer>;
  readonly pool: ContainerPool;
  readonly renderer: ZoneRendererHarness;
} {
  const parent = new MockContainer();
  const pool = new ContainerPool();
  const rawRenderer = createZoneRenderer(parent as unknown as Container, pool, options);
  const renderer: ZoneRendererHarness = {
    ...rawRenderer,
    update(
      zones: readonly RenderZone[],
      positions: ReadonlyMap<string, Position>,
      highlightedZoneIDs?: ReadonlySet<string>,
    ): void {
      rawRenderer.update(resolveZoneNodes(zones, provider, highlightedZoneIDs), positions);
    },
  };
  return { parent, pool, renderer };
}

function getHiddenStackContainer(zoneContainer: InstanceType<typeof MockContainer>): InstanceType<typeof MockContainer> {
  return zoneContainer.children[1] as InstanceType<typeof MockContainer>;
}

describe('createZoneRenderer', () => {
  it('update with empty arrays creates no containers', () => {
    const { parent, renderer } = createRendererHarness();

    renderer.update([], new Map());

    expect(renderer.getContainerMap().size).toBe(0);
    expect(parent.children).toHaveLength(0);
  });

  it('creates one container per zone and keeps stable references for existing IDs', () => {
    const { parent, renderer } = createRendererHarness();

    const zones = [makeZone({ id: 'zone:a' }), makeZone({ id: 'zone:b' }), makeZone({ id: 'zone:c' })];
    renderer.update(
      zones,
      createPositions([
        ['zone:a', { x: 10, y: 20 }],
        ['zone:b', { x: 30, y: 40 }],
        ['zone:c', { x: 50, y: 60 }],
      ]),
    );

    const firstA = renderer.getContainerMap().get('zone:a');
    const firstB = renderer.getContainerMap().get('zone:b');

    expect(renderer.getContainerMap().size).toBe(3);
    expect(parent.children).toHaveLength(3);
    const zoneA = renderer.getContainerMap().get('zone:a') as unknown as {
      hitArea?: { width: number; height: number };
    };
    expect(zoneA.hitArea?.width).toBe(160);
    expect(zoneA.hitArea?.height).toBe(140);

    renderer.update(
      [makeZone({ id: 'zone:a' }), makeZone({ id: 'zone:b' }), makeZone({ id: 'zone:d' })],
      createPositions([
        ['zone:a', { x: 100, y: 200 }],
        ['zone:b', { x: 300, y: 400 }],
        ['zone:d', { x: 500, y: 600 }],
      ]),
    );

    expect(renderer.getContainerMap().size).toBe(3);
    expect(renderer.getContainerMap().get('zone:a')).toBe(firstA);
    expect(renderer.getContainerMap().get('zone:b')).toBe(firstB);
    expect(renderer.getContainerMap().has('zone:c')).toBe(false);
    expect(renderer.getContainerMap().has('zone:d')).toBe(true);
  });

  it('releases removed zones and acquires pooled containers for new zones', () => {
    const { pool, renderer } = createRendererHarness();

    const releaseSpy = vi.spyOn(pool, 'release');
    const acquireSpy = vi.spyOn(pool, 'acquire');

    renderer.update(
      [makeZone({ id: 'zone:a' }), makeZone({ id: 'zone:b' }), makeZone({ id: 'zone:c' })],
      new Map(),
    );

    const removedContainer = renderer.getContainerMap().get('zone:c');

    renderer.update([makeZone({ id: 'zone:a' }), makeZone({ id: 'zone:b' })], new Map());

    expect(renderer.getContainerMap().size).toBe(2);
    expect(releaseSpy).toHaveBeenCalledWith(removedContainer);

    renderer.update([makeZone({ id: 'zone:a' }), makeZone({ id: 'zone:b' }), makeZone({ id: 'zone:d' })], new Map());

    expect(renderer.getContainerMap().size).toBe(3);
    expect(acquireSpy).toHaveBeenCalled();
  });

  it('updates existing zone position and presentation-owned label in place', () => {
    const parent = new MockContainer();
    const pool = new ContainerPool();
    const renderer = createZoneRenderer(parent as unknown as Container, pool);
    const baseZone = toPresentationZones([makeZone()])[0]!;
    const updatedZone = {
      ...baseZone,
      displayName: 'Zone Prime',
      render: {
        ...baseZone.render,
        nameLabel: {
          ...baseZone.render.nameLabel,
          text: 'Zone Prime',
        },
      },
    };

    renderer.update(
      [baseZone],
      createPositions([['zone:a', { x: 5, y: 6 }]]),
    );

    const zoneContainer = renderer.getContainerMap().get('zone:a') as InstanceType<typeof MockContainer>;
    const nameLabel = zoneContainer.children[3] as InstanceType<typeof MockText>;

    expect(zoneContainer.position.x).toBe(5);
    expect(zoneContainer.position.y).toBe(6);
    expect(nameLabel.text).toBe('Zone A');

    renderer.update(
      [updatedZone],
      createPositions([['zone:a', { x: 50, y: 60 }]]),
    );

    expect(renderer.getContainerMap().get('zone:a')).toBe(zoneContainer);
    expect(zoneContainer.position.x).toBe(50);
    expect(zoneContainer.position.y).toBe(60);
    expect(nameLabel.text).toBe('Zone Prime');
  });

  it('renders selectable and highlighted states with distinct border styles', () => {
    const { renderer } = createRendererHarness();

    renderer.update([makeZone({ id: 'zone:a', isSelectable: true })], new Map());

    const zoneContainer = renderer.getContainerMap().get('zone:a') as InstanceType<typeof MockContainer>;
    const base = zoneContainer.children[0] as InstanceType<typeof MockGraphics>;

    expect(base.strokeStyle).toEqual({ color: 0x93c5fd, width: 2, alpha: 0.95 });

    renderer.update([makeZone({ id: 'zone:a', isHighlighted: true })], new Map());

    expect(base.strokeStyle).toEqual({ color: 0xfacc15, width: 4, alpha: 1 });
  });

  it('renders interaction-highlighted stroke when zone id is selected from event log', () => {
    const { renderer } = createRendererHarness();

    renderer.update([makeZone({ id: 'zone:a' })], new Map(), new Set(['zone:a']));

    const zoneContainer = renderer.getContainerMap().get('zone:a') as InstanceType<typeof MockContainer>;
    const base = zoneContainer.children[0] as InstanceType<typeof MockGraphics>;

    expect(base.strokeStyle).toEqual({ color: 0x60a5fa, width: 3, alpha: 1 });
  });

  it('renders markers below the name without rendering a zone token badge', () => {
    const { renderer } = createRendererHarness();

    renderer.update(
      [
        makeZone({
          id: 'zone:a',
          tokenIDs: ['token:1', 'token:2'],
          hiddenTokenCount: 1,
          markers: [
            { id: 'control', displayName: 'Control', state: 'red', possibleStates: ['red', 'blue'] },
            { id: 'supply', displayName: 'Supply', state: 'on', possibleStates: ['on', 'off'] },
          ],
        }),
      ],
      new Map(),
    );

    const container = renderer.getContainerMap().get('zone:a') as InstanceType<typeof MockContainer>;
    const markers = container.children[4] as InstanceType<typeof MockText>;

    expect(container.children).toHaveLength(7);
    expect(markers.text).toContain('Control:red');
    expect(markers.text).toContain('Supply:on');
    expect(markers.visible).toBe(true);

    renderer.update([makeZone({ id: 'zone:a', tokenIDs: [], hiddenTokenCount: 0, markers: [] })], new Map());

    expect(markers.visible).toBe(false);
  });

  it('toggles hidden stack visibility based on hiddenTokenCount', () => {
    const { renderer } = createRendererHarness();

    renderer.update([makeZone({ id: 'zone:a', hiddenTokenCount: 2 })], new Map());
    const zoneContainer = renderer.getContainerMap().get('zone:a') as InstanceType<typeof MockContainer>;
    const hiddenStack = getHiddenStackContainer(zoneContainer);
    const cards = hiddenStack.children[0] as InstanceType<typeof MockContainer>;
    const countLabel = hiddenStack.children[2] as InstanceType<typeof MockText>;

    expect(hiddenStack.visible).toBe(true);
    expect(cards.children).toHaveLength(2);
    expect(countLabel.text).toBe('2');

    renderer.update([makeZone({ id: 'zone:a', hiddenTokenCount: 0 })], new Map());

    expect(hiddenStack.visible).toBe(false);
    expect(cards.children).toHaveLength(0);
    expect(countLabel.text).toBe('');
  });

  it('clamps hidden stack card layers to five while keeping exact count badge text', () => {
    const { renderer } = createRendererHarness();

    renderer.update([makeZone({ id: 'zone:a', hiddenTokenCount: 9 })], new Map());
    const zoneContainer = renderer.getContainerMap().get('zone:a') as InstanceType<typeof MockContainer>;
    const hiddenStack = getHiddenStackContainer(zoneContainer);
    const cards = hiddenStack.children[0] as InstanceType<typeof MockContainer>;
    const countLabel = hiddenStack.children[2] as InstanceType<typeof MockText>;

    expect(cards.children).toHaveLength(5);
    expect(countLabel.text).toBe('9');
  });

  it('updates hidden stack count badge text in place as hiddenTokenCount changes', () => {
    const { renderer } = createRendererHarness();

    renderer.update([makeZone({ id: 'zone:a', hiddenTokenCount: 3 })], new Map());
    const zoneContainer = renderer.getContainerMap().get('zone:a') as InstanceType<typeof MockContainer>;
    const hiddenStack = getHiddenStackContainer(zoneContainer);
    const countLabel = hiddenStack.children[2] as InstanceType<typeof MockText>;

    expect(countLabel.text).toBe('3');

    renderer.update([makeZone({ id: 'zone:a', hiddenTokenCount: 12 })], new Map());

    expect(countLabel.text).toBe('12');
  });

  it('getContainerMap returns the live container map and destroy releases all zones', () => {
    const { parent, pool, renderer } = createRendererHarness();

    const releaseSpy = vi.spyOn(pool, 'release');

    renderer.update(
      [
        makeZone({ id: 'zone:a' }),
        makeZone({ id: 'zone:b', ownerID: asPlayerId(1), visibility: 'owner' }),
      ],
      new Map(),
    );

    const mapView = renderer.getContainerMap();
    expect(mapView.size).toBe(2);

    renderer.destroy();

    expect(mapView.size).toBe(0);
    expect(parent.children).toHaveLength(0);
    expect(releaseSpy).toHaveBeenCalledTimes(2);
  });

  it('invokes bound selection cleanup when zones are removed or renderer is destroyed', () => {
    const cleanupByZoneId = new Map<string, ReturnType<typeof vi.fn>>();
    const bindSelection = vi.fn((_: Container, zoneId: string) => {
      const cleanup = vi.fn();
      cleanupByZoneId.set(zoneId, cleanup);
      return cleanup;
    });
    const { renderer } = createRendererHarness(new VisualConfigProvider(null), {
      bindSelection: (
        zoneContainer: Container,
        zoneId: string,
        _isSelectable: () => boolean,
      ) => bindSelection(zoneContainer, zoneId),
    });

    renderer.update([makeZone({ id: 'zone:a' }), makeZone({ id: 'zone:b' })], new Map());
    renderer.update([makeZone({ id: 'zone:a' })], new Map());

    expect(cleanupByZoneId.get('zone:b')).toHaveBeenCalledTimes(1);
    expect(cleanupByZoneId.get('zone:a')).toHaveBeenCalledTimes(0);

    renderer.destroy();

    expect(cleanupByZoneId.get('zone:a')).toHaveBeenCalledTimes(1);
  });

  it('uses displayName and updates label layout from visual dimensions', () => {
    const renderer = createZoneRenderer(new MockContainer() as unknown as Container, new ContainerPool());
    const baseZone = makePresentationZoneNode();
    renderer.update([{
      ...baseZone,
      displayName: 'Saigon',
      visual: { ...baseZone.visual, width: 100, height: 80, shape: 'rectangle' },
      render: {
        ...baseZone.render,
        nameLabel: { text: 'Saigon', x: 0, y: 48, visible: true },
        markersLabel: { text: '', x: 0, y: 66, visible: false },
      },
    }], new Map());

    const zoneContainer = renderer.getContainerMap().get('zone:a') as InstanceType<typeof MockContainer>;
    const nameLabel = zoneContainer.children[3] as InstanceType<typeof MockText>;
    const markersLabel = zoneContainer.children[4] as InstanceType<typeof MockText>;

    expect(nameLabel.text).toBe('Saigon');
    expect(nameLabel.position.x).toBe(0);
    expect(nameLabel.position.y).toBe(48);
    expect(markersLabel.position.x).toBe(0);
    expect(markersLabel.position.y).toBe(66);
  });

  it('uses presentation fill color when valid and falls back to renderer default when invalid', () => {
    const renderer = createZoneRenderer(new MockContainer() as unknown as Container, new ContainerPool());
    const baseZone = makePresentationZoneNode();
    renderer.update([{ ...baseZone, render: { ...baseZone.render, fillColor: '#e63946' } }], new Map());

    const zoneContainer = renderer.getContainerMap().get('zone:a') as InstanceType<typeof MockContainer>;
    const base = zoneContainer.children[0] as InstanceType<typeof MockGraphics>;
    expect(base.fillStyle).toEqual({ color: 0xe63946 });

    const fallbackRenderer = createZoneRenderer(new MockContainer() as unknown as Container, new ContainerPool());
    const hiddenZone = toPresentationZones([makeZone({ visibility: 'hidden' })])[0]!;
    fallbackRenderer.update([{ ...hiddenZone, render: { ...hiddenZone.render, fillColor: 'not-a-color' } }], new Map());
    const fallbackZoneContainer = fallbackRenderer.getContainerMap().get('zone:a') as InstanceType<typeof MockContainer>;
    const fallbackBase = fallbackZoneContainer.children[0] as InstanceType<typeof MockGraphics>;
    expect(fallbackBase.fillStyle).toEqual({ color: 0x4d5c6d });
  });

  it('positions labels below zone for circle shape using radius', () => {
    const renderer = createZoneRenderer(new MockContainer() as unknown as Container, new ContainerPool());
    const baseZone = makePresentationZoneNode();
    renderer.update([{
      ...baseZone,
      displayName: 'Da Nang',
      visual: { ...baseZone.visual, shape: 'circle', width: 160, height: 160 },
      render: {
        ...baseZone.render,
        nameLabel: { text: 'Da Nang', x: 0, y: 88, visible: true },
      },
    }], new Map());

    const zoneContainer = renderer.getContainerMap().get('zone:a') as InstanceType<typeof MockContainer>;
    const nameLabel = zoneContainer.children[3] as InstanceType<typeof MockText>;

    expect(nameLabel.position.x).toBe(0);
    expect(nameLabel.position.y).toBe(88);
  });

  it('name label has white fill and black stroke', () => {
    const { renderer } = createRendererHarness();
    renderer.update([makeZone()], new Map());

    const zoneContainer = renderer.getContainerMap().get('zone:a') as InstanceType<typeof MockContainer>;
    const nameLabel = zoneContainer.children[3] as InstanceType<typeof MockText>;

    const style = nameLabel.style as { fill?: string; stroke?: { color: string; width: number } };
    expect(style.fill).toBe('#ffffff');
    expect(style.stroke).toEqual({ color: '#000000', width: 3 });
  });

  it('renders badge when zone has matching marker and hides when absent', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      zones: {
        markerBadge: {
        markerId: 'support',
        colorMap: {
          activeOpposition: { color: '#dc2626', abbreviation: 'AO' },
        },
      },
      },
    });
    const { renderer } = createRendererHarness(provider);

    renderer.update(
      [
        makeZone({
          markers: [{ id: 'support', displayName: 'Support', state: 'activeOpposition', possibleStates: [] }],
        }),
      ],
      new Map(),
    );

    const zoneContainer = renderer.getContainerMap().get('zone:a') as InstanceType<typeof MockContainer>;
    const badgeGraphics = zoneContainer.children[5] as InstanceType<typeof MockGraphics>;
    const badgeLabel = zoneContainer.children[6] as InstanceType<typeof MockText>;

    expect(badgeGraphics.visible).toBe(true);
    expect(badgeLabel.visible).toBe(true);
    expect(badgeLabel.text).toBe('AO');

    renderer.update([makeZone({ markers: [] })], new Map());

    expect(badgeGraphics.visible).toBe(false);
    expect(badgeLabel.visible).toBe(false);
  });

  it('updates marker labels and badge visuals in place without stale badge leakage', () => {
    const renderer = createZoneRenderer(new MockContainer() as unknown as Container, new ContainerPool());
    const baseZone = makePresentationZoneNode();

    renderer.update([{
      ...baseZone,
      render: {
        ...baseZone.render,
        markersLabel: { text: 'Sabotage', x: 0, y: 66, visible: true },
        badge: { text: 'AO', color: '#dc2626', x: 18, y: -8, width: 30, height: 20 },
      },
    }], new Map());

    const zoneContainer = renderer.getContainerMap().get('zone:a') as InstanceType<typeof MockContainer>;
    const markersLabel = zoneContainer.children[4] as InstanceType<typeof MockText>;
    const badgeGraphics = zoneContainer.children[5] as InstanceType<typeof MockGraphics>;
    const badgeLabel = zoneContainer.children[6] as InstanceType<typeof MockText>;

    expect(markersLabel.text).toBe('Sabotage');
    expect(markersLabel.visible).toBe(true);
    expect(markersLabel.position.x).toBe(0);
    expect(markersLabel.position.y).toBe(66);
    expect(badgeGraphics.visible).toBe(true);
    expect(badgeGraphics.roundRectArgs).toEqual([18, -8, 30, 20, 4]);
    expect(badgeGraphics.fillStyle).toEqual({ color: 0xdc2626 });
    expect(badgeLabel.visible).toBe(true);
    expect(badgeLabel.text).toBe('AO');
    expect(badgeLabel.position.x).toBe(33);
    expect(badgeLabel.position.y).toBe(2);

    renderer.update([{
      ...baseZone,
      render: {
        ...baseZone.render,
        markersLabel: { text: 'Control:COIN', x: 12, y: 84, visible: true },
        badge: null,
      },
    }], new Map());

    const updatedMarkersLabel = zoneContainer.children[4] as InstanceType<typeof MockText>;
    const updatedBadgeGraphics = zoneContainer.children[5] as InstanceType<typeof MockGraphics>;
    const updatedBadgeLabel = zoneContainer.children[6] as InstanceType<typeof MockText>;

    expect(updatedMarkersLabel.text).toBe('Control:COIN');
    expect(updatedMarkersLabel.position.x).toBe(12);
    expect(updatedMarkersLabel.position.y).toBe(84);
    expect(updatedBadgeGraphics.visible).toBe(false);
    expect(updatedBadgeLabel.visible).toBe(false);
    expect(zoneContainer.children[4]).toBe(markersLabel);
    expect(zoneContainer.children[5]).toBe(badgeGraphics);
    expect(zoneContainer.children[6]).toBe(badgeLabel);
  });

  it('filters badge marker from markers text', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      zones: {
        markerBadge: {
        markerId: 'support',
        colorMap: {
          activeOpposition: { color: '#dc2626', abbreviation: 'AO' },
        },
      },
      },
    });
    const { renderer } = createRendererHarness(provider);

    renderer.update(
      [
        makeZone({
          markers: [
            { id: 'support', displayName: 'Support', state: 'activeOpposition', possibleStates: [] },
            { id: 'control', displayName: 'Control', state: 'COIN', possibleStates: [] },
          ],
        }),
      ],
      new Map(),
    );

    const zoneContainer = renderer.getContainerMap().get('zone:a') as InstanceType<typeof MockContainer>;
    const markersLabel = zoneContainer.children[4] as InstanceType<typeof MockText>;

    expect(markersLabel.text).toBe('Control:COIN');
    expect(markersLabel.text).not.toContain('Support');
  });

  it('dispatches all supported zone shapes from visual hints', () => {
    const shapes = [
      { shape: 'rectangle', expect: { roundRectRadius: 12 } },
      { shape: 'circle', expect: { circleRadius: 20 } },
      { shape: 'ellipse', expect: { ellipse: [0, 0, 40, 20] } },
      { shape: 'diamond', expect: { polyPoints: 8 } },
      { shape: 'hexagon', expect: { polyPoints: 12 } },
      { shape: 'triangle', expect: { polyPoints: 6 } },
      { shape: 'octagon', expect: { polyPoints: 16 } },
      { shape: 'line', expect: { roundRectRadius: 4 } },
      { shape: 'connection', expect: {} },
    ] as const;

    for (const entry of shapes) {
      const renderer = createZoneRenderer(new MockContainer() as unknown as Container, new ContainerPool());
      const baseZone = makePresentationZoneNode();
      renderer.update([{
        ...baseZone,
        visual: { ...baseZone.visual, shape: entry.shape, width: 80, height: 40 },
      }], new Map());

      const zoneContainer = renderer.getContainerMap().get('zone:a') as InstanceType<typeof MockContainer>;
      const base = zoneContainer.children[0] as InstanceType<typeof MockGraphics>;

      if ('roundRectRadius' in entry.expect) {
        expect(base.roundRectArgs?.[4]).toBe(entry.expect.roundRectRadius);
      }
      if ('circleRadius' in entry.expect) {
        expect(base.circleArgs).toEqual([0, 0, entry.expect.circleRadius]);
      }
      if ('ellipse' in entry.expect) {
        expect(base.ellipseArgs).toEqual(entry.expect.ellipse);
      }
      if ('polyPoints' in entry.expect) {
        expect(base.polyArgs).toHaveLength(entry.expect.polyPoints);
      }
    }
  });
});
