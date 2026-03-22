import { describe, expect, it, vi } from 'vitest';
import type { GameDef } from '@ludoforge/engine/runtime';
import type { Container } from 'pixi.js';

const {
  attachZoneDragHandlers,
  MockBitmapText,
  MockContainer,
  MockGraphics,
  MockRectangle,
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

    cursor = 'default';

    eventMode: 'none' | 'static' | 'passive' = 'none';

    interactiveChildren = true;

    hitArea: unknown;

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

    on(): this {
      return this;
    }

    off(): this {
      return this;
    }
  }

  class HoistedMockGraphics extends HoistedMockContainer {
    fillStyle: unknown;

    strokeStyle: unknown;

    clear(): this {
      this.fillStyle = undefined;
      this.strokeStyle = undefined;
      return this;
    }

    roundRect(): this {
      return this;
    }

    circle(): this {
      return this;
    }

    ellipse(): this {
      return this;
    }

    poly(): this {
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

  class HoistedMockBitmapText extends HoistedMockContainer {
    text: string;

    style: unknown;

    anchor = new MockPoint();

    constructor(options: { text: string; style?: unknown; anchor?: { x: number; y: number } }) {
      super();
      this.text = options.text;
      this.style = options.style;
      if (options.anchor !== undefined) {
        this.anchor.set(options.anchor.x, options.anchor.y);
      }
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
    attachZoneDragHandlers: vi.fn(() => vi.fn()),
    MockBitmapText: HoistedMockBitmapText,
    MockContainer: HoistedMockContainer,
    MockGraphics: HoistedMockGraphics,
    MockRectangle: HoistedMockRectangle,
  };
});

vi.mock('pixi.js', () => ({
  BitmapText: MockBitmapText,
  Container: MockContainer,
  Graphics: MockGraphics,
  Rectangle: MockRectangle,
}));

vi.mock('../../src/canvas/text/bitmap-font-registry.js', () => ({
  STROKE_LABEL_FONT_NAME: 'ludoforge-label-stroke',
}));

vi.mock('../../src/canvas/text/bitmap-text-runtime.js', () => ({
  createManagedBitmapText: (options: { text: string; style?: unknown; anchor?: { x: number; y: number } }) =>
    new MockBitmapText(options),
}));

vi.mock('../../src/map-editor/map-editor-drag.js', () => ({
  attachZoneDragHandlers,
}));

import { VisualConfigProvider } from '../../src/config/visual-config-provider.js';
import { createMapEditorStore } from '../../src/map-editor/map-editor-store.js';
import type { VisualConfig } from '../../src/map-editor/map-editor-types.js';
import { createEditorZoneRenderer } from '../../src/map-editor/map-editor-zone-renderer.js';

describe('createEditorZoneRenderer', () => {
  it('creates one container per actual zone and ignores non-zone position entries', () => {
    const fixture = createFixture();

    const renderer = createEditorZoneRenderer(
      fixture.zoneLayer as unknown as Container,
      fixture.store,
      fixture.provider,
    );

    expect(renderer.getContainerMap().size).toBe(2);
    expect([...renderer.getContainerMap().keys()]).toEqual(['zone:a', 'zone:b']);
    expect(fixture.zoneLayer.children).toHaveLength(2);
    expect(attachZoneDragHandlers).toHaveBeenCalledTimes(2);
  });

  it('excludes connection-shaped zones from zone containers and drag bindings', () => {
    const fixture = createFixture({
      zones: {
        categoryStyles: {
          city: { shape: 'circle', color: '#336699', width: 120, height: 80 },
          road: { shape: 'connection' },
        },
      },
      gameDef: {
        zones: [
          { id: 'zone:a', owner: 'none', visibility: 'public', ordering: 'stack' },
          { id: 'zone:b', owner: 'none', visibility: 'public', ordering: 'stack', category: 'city' },
          { id: 'route:road', owner: 'none', visibility: 'public', ordering: 'stack', category: 'road' },
        ],
      } as unknown as GameDef,
      zonePositions: new Map([
        ['zone:a', { x: 10, y: 20 }],
        ['zone:b', { x: 60, y: 70 }],
        ['route:road', { x: 40, y: 50 }],
      ]),
    });

    const renderer = createEditorZoneRenderer(
      fixture.zoneLayer as unknown as Container,
      fixture.store,
      fixture.provider,
    );

    expect(renderer.getContainerMap().size).toBe(2);
    expect(renderer.getContainerMap().has('route:road')).toBe(false);
    expect(fixture.zoneLayer.children).toHaveLength(2);
    expect(attachZoneDragHandlers).toHaveBeenCalledTimes(2);
  });

  it('resolves labels from visual config overrides and formatted IDs', () => {
    const fixture = createFixture();
    const renderer = createEditorZoneRenderer(
      fixture.zoneLayer as unknown as Container,
      fixture.store,
      fixture.provider,
    );

    const zoneAContainer = renderer.getContainerMap().get('zone:a') as unknown as InstanceType<typeof MockContainer>;
    const zoneBContainer = renderer.getContainerMap().get('zone:b') as unknown as InstanceType<typeof MockContainer>;
    const zoneALabel = zoneAContainer.children[1] as InstanceType<typeof MockBitmapText>;
    const zoneBLabel = zoneBContainer.children[1] as InstanceType<typeof MockBitmapText>;

    expect(zoneALabel.text).toBe('Alpha Override');
    expect(zoneBLabel.text).toBe('Zone B');
  });

  it('syncs positions and selected-zone highlighting from the store', () => {
    const fixture = createFixture();
    const renderer = createEditorZoneRenderer(
      fixture.zoneLayer as unknown as Container,
      fixture.store,
      fixture.provider,
    );

    fixture.store.getState().moveZone('zone:b', { x: 160, y: 180 });
    fixture.store.getState().selectZone('zone:b');

    const zoneBContainer = renderer.getContainerMap().get('zone:b') as unknown as InstanceType<typeof MockContainer>;
    const zoneBBase = zoneBContainer.children[0] as InstanceType<typeof MockGraphics>;

    expect(zoneBContainer.position.x).toBe(160);
    expect(zoneBContainer.position.y).toBe(180);
    expect(zoneBBase.strokeStyle).toEqual({
      color: 0xf59e0b,
      width: 4,
      alpha: 1,
    });
  });

  it('cleans up containers and drag bindings on destroy', () => {
    const fixture = createFixture();
    const renderer = createEditorZoneRenderer(
      fixture.zoneLayer as unknown as Container,
      fixture.store,
      fixture.provider,
    );

    const cleanups = attachZoneDragHandlers.mock.results.map((result) => result.value as ReturnType<typeof vi.fn>);

    renderer.destroy();

    expect(fixture.zoneLayer.children).toHaveLength(0);
    expect(renderer.getContainerMap().size).toBe(0);
    expect(cleanups).toHaveLength(2);
    for (const cleanup of cleanups) {
      expect(cleanup).toHaveBeenCalledTimes(1);
    }
  });
});

function createFixture(overrides?: {
  readonly gameDef?: GameDef;
  readonly zones?: VisualConfig['zones'];
  readonly zonePositions?: Map<string, { x: number; y: number }>;
}) {
  attachZoneDragHandlers.mockClear();

  const zoneLayer = new MockContainer();
  const defaultGameDef = {
    metadata: {
      id: 'editor-test',
      players: { min: 1, max: 4 },
    },
    zones: [
      { id: 'zone:a', owner: 'none', visibility: 'public', ordering: 'stack' },
      { id: 'zone:b', owner: 'none', visibility: 'public', ordering: 'stack', category: 'city' },
    ],
  } as unknown as GameDef;
  const gameDef = overrides?.gameDef ?? defaultGameDef;
  const visualConfig = {
    version: 1,
    zones: {
      categoryStyles: {
        city: { shape: 'circle', color: '#336699', width: 120, height: 80 },
      },
      overrides: {
        'zone:a': { label: 'Alpha Override', color: '#112233' },
      },
      ...overrides?.zones,
    },
  } as VisualConfig;
  const store = createMapEditorStore(
    gameDef,
    visualConfig,
    overrides?.zonePositions ?? new Map([
      ['zone:a', { x: 10, y: 20 }],
      ['zone:b', { x: 60, y: 70 }],
      ['route:extra', { x: 999, y: 999 }],
    ]),
  );

  return {
    provider: new VisualConfigProvider(store.getState().originalVisualConfig),
    store,
    zoneLayer,
  };
}
