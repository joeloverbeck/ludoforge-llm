import { describe, expect, it, vi } from 'vitest';
import { asPlayerId } from '@ludoforge/engine/runtime';
import type { Container } from 'pixi.js';

const {
  MockContainer,
  MockGraphics,
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

    clear(): this {
      this.fillStyle = undefined;
      this.strokeStyle = undefined;
      this.roundRectArgs = null;
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

    stroke(style: unknown): this {
      this.strokeStyle = style;
      return this;
    }
  }

  class HoistedMockText extends HoistedMockContainer {
    text: string;

    style: unknown;

    constructor(options: { text: string; style?: unknown }) {
      super();
      this.text = options.text;
      this.style = options.style;
    }
  }

  return {
    MockContainer: HoistedMockContainer,
    MockGraphics: HoistedMockGraphics,
    MockText: HoistedMockText,
  };
});

vi.mock('pixi.js', () => ({
  Container: MockContainer,
  Graphics: MockGraphics,
  Text: MockText,
}));

import { createZoneRenderer } from '../../../src/canvas/renderers/zone-renderer';
import { ContainerPool } from '../../../src/canvas/renderers/container-pool';
import type { Position } from '../../../src/canvas/geometry';
import type { RenderZone } from '../../../src/model/render-model';

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
    metadata: {},
    ...overrides,
  };
}

function createPositions(entries: readonly [string, Position][]): ReadonlyMap<string, Position> {
  return new Map(entries);
}

function createRendererHarness(): {
  readonly parent: InstanceType<typeof MockContainer>;
  readonly pool: ContainerPool;
  readonly renderer: ReturnType<typeof createZoneRenderer>;
} {
  const parent = new MockContainer();
  const pool = new ContainerPool();
  const renderer = createZoneRenderer(parent as unknown as Container, pool);
  return { parent, pool, renderer };
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

  it('updates existing zone position and display name in place', () => {
    const { renderer } = createRendererHarness();

    renderer.update([makeZone({ id: 'zone:a', displayName: 'Zone A' })], createPositions([['zone:a', { x: 5, y: 6 }]]));

    const zoneContainer = renderer.getContainerMap().get('zone:a') as InstanceType<typeof MockContainer>;
    const nameLabel = zoneContainer.children[1] as InstanceType<typeof MockText>;

    expect(zoneContainer.position.x).toBe(5);
    expect(zoneContainer.position.y).toBe(6);
    expect(nameLabel.text).toBe('Zone A');

    renderer.update(
      [makeZone({ id: 'zone:a', displayName: 'Zone Prime' })],
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

  it('renders markers below the name and updates token badge count', () => {
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
    const badge = container.children[2] as InstanceType<typeof MockText>;
    const markers = container.children[3] as InstanceType<typeof MockText>;

    expect(badge.text).toBe('3');
    expect(badge.visible).toBe(true);
    expect(markers.text).toContain('Control:red');
    expect(markers.text).toContain('Supply:on');
    expect(markers.visible).toBe(true);

    renderer.update([makeZone({ id: 'zone:a', tokenIDs: [], hiddenTokenCount: 0, markers: [] })], new Map());

    expect(badge.visible).toBe(false);
    expect(markers.visible).toBe(false);
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
    const parent = new MockContainer();
    const pool = new ContainerPool();
    const cleanupByZoneId = new Map<string, ReturnType<typeof vi.fn>>();
    const bindSelection = vi.fn((_: Container, zoneId: string) => {
      const cleanup = vi.fn();
      cleanupByZoneId.set(zoneId, cleanup);
      return cleanup;
    });
    const renderer = createZoneRenderer(parent as unknown as Container, pool, {
      bindSelection: (zoneContainer, zoneId, _isSelectable) => bindSelection(zoneContainer, zoneId),
    });

    renderer.update([makeZone({ id: 'zone:a' }), makeZone({ id: 'zone:b' })], new Map());
    renderer.update([makeZone({ id: 'zone:a' })], new Map());

    expect(cleanupByZoneId.get('zone:b')).toHaveBeenCalledTimes(1);
    expect(cleanupByZoneId.get('zone:a')).toHaveBeenCalledTimes(0);

    renderer.destroy();

    expect(cleanupByZoneId.get('zone:a')).toHaveBeenCalledTimes(1);
  });
});
