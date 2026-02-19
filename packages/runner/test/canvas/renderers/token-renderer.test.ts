import { describe, expect, it, vi } from 'vitest';
import { asPlayerId } from '@ludoforge/engine/runtime';
import type { Container } from 'pixi.js';

const {
  MockContainer,
  MockCircle,
  MockGraphics,
  MockPolygon,
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

    destroyed = false;

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
      this.destroyed = true;
      this.removeFromParent();
      this.removeChildren();
    }
  }

  class HoistedMockGraphics extends HoistedMockContainer {
    fillStyle: unknown;

    strokeStyle: unknown;

    circleArgs: [number, number, number] | null = null;

    roundRectArgs: [number, number, number, number, number] | null = null;

    polyArgs: number[] | null = null;

    clear(): this {
      this.fillStyle = undefined;
      this.strokeStyle = undefined;
      this.circleArgs = null;
      this.roundRectArgs = null;
      this.polyArgs = null;
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

  class HoistedMockCircle {
    x: number;

    y: number;

    radius: number;

    constructor(x: number, y: number, radius: number) {
      this.x = x;
      this.y = y;
      this.radius = radius;
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

  class HoistedMockPolygon {
    points: number[];

    constructor(points: number[]) {
      this.points = points;
    }
  }

  return {
    MockContainer: HoistedMockContainer,
    MockCircle: HoistedMockCircle,
    MockGraphics: HoistedMockGraphics,
    MockPolygon: HoistedMockPolygon,
    MockRectangle: HoistedMockRectangle,
    MockText: HoistedMockText,
  };
});

vi.mock('pixi.js', () => ({
  Circle: MockCircle,
  Container: MockContainer,
  Graphics: MockGraphics,
  Polygon: MockPolygon,
  Rectangle: MockRectangle,
  Text: MockText,
}));

import { createTokenRenderer } from '../../../src/canvas/renderers/token-renderer';
import type { TokenShape } from '../../../src/config/visual-config-defaults';
import type { RenderToken } from '../../../src/model/render-model';

function makeToken(overrides: Partial<RenderToken> = {}): RenderToken {
  return {
    id: 'token:1',
    type: 'troop',
    zoneID: 'zone:a',
    ownerID: asPlayerId(0),
    factionId: 'faction:a',
    faceUp: true,
    properties: {},
    isSelectable: false,
    isSelected: false,
    ...overrides,
  };
}

function createZoneContainers(entries: readonly [string, { x: number; y: number }][]): ReadonlyMap<string, Container> {
  const zoneMap = new Map<string, Container>();

  for (const [zoneId, position] of entries) {
    const zoneContainer = new MockContainer();
    zoneContainer.position.set(position.x, position.y);
    zoneMap.set(zoneId, zoneContainer as unknown as Container);
  }

  return zoneMap;
}

function createColorProvider(overrides: {
  readonly tokenVisual?: {
    readonly shape?: TokenShape;
    readonly color?: string;
    readonly symbol?: string;
    readonly backSymbol?: string;
    readonly size?: number;
  };
  readonly cardTemplatesByTokenType?: Readonly<Record<string, {
    readonly width: number;
    readonly height: number;
    readonly layout?: Readonly<Record<string, {
      readonly y?: number;
      readonly fontSize?: number;
      readonly align?: string;
      readonly wrap?: number;
    }>>;
  }>>;
  readonly factionColor?: string;
} = {}) {
  const defaultSymbol = overrides.tokenVisual?.symbol ?? null;
  const defaultBackSymbol = overrides.tokenVisual?.backSymbol ?? null;
  return {
    getTokenTypeVisual: vi.fn(() => ({
      shape: overrides.tokenVisual?.shape ?? 'circle',
      color: overrides.tokenVisual?.color ?? null,
      symbol: defaultSymbol,
      backSymbol: defaultBackSymbol,
      size: overrides.tokenVisual?.size ?? 28,
    })),
    resolveTokenSymbols: vi.fn((_tokenTypeId: string, _tokenProperties: Readonly<Record<string, string | number | boolean>>) => ({
      symbol: defaultSymbol,
      backSymbol: defaultBackSymbol,
    })),
    getCardTemplateForTokenType: vi.fn(
      (tokenTypeId: string) => overrides.cardTemplatesByTokenType?.[tokenTypeId] ?? null,
    ),
    getColor: vi.fn(() => overrides.factionColor ?? '#112233'),
  };
}

describe('createTokenRenderer', () => {
  it('update with empty token array creates no containers', () => {
    const parent = new MockContainer();
    const colorProvider = createColorProvider({ factionColor: '#abcdef' });
    const renderer = createTokenRenderer(parent as unknown as Container, colorProvider);

    renderer.update([], new Map());

    expect(renderer.getContainerMap().size).toBe(0);
    expect(parent.children).toHaveLength(0);
  });

  it('creates token containers and calls color provider for owned tokens', () => {
    const parent = new MockContainer();
    const colorProvider = createColorProvider();
    const renderer = createTokenRenderer(parent as unknown as Container, colorProvider);

    renderer.update(
      [
        makeToken({ id: 'token:1', type: 'troop-a', ownerID: asPlayerId(1) }),
        makeToken({ id: 'token:2', type: 'troop-b', ownerID: asPlayerId(2) }),
        makeToken({ id: 'token:3', type: 'troop-c', ownerID: asPlayerId(3) }),
      ],
      createZoneContainers([
        ['zone:a', { x: 100, y: 200 }],
      ]),
    );

    expect(renderer.getContainerMap().size).toBe(3);
    expect(parent.children).toHaveLength(3);
    expect(colorProvider.getColor).toHaveBeenCalledTimes(3);
    expect(colorProvider.getColor).toHaveBeenCalledWith('faction:a', asPlayerId(1));
    const tokenContainer = renderer.getContainerMap().get('token:1') as unknown as { hitArea?: { radius: number } };
    expect(tokenContainer.hitArea?.radius).toBe(14);
  });

  it('uses neutral fallback for unowned tokens without calling color provider', () => {
    const parent = new MockContainer();
    const colorProvider = createColorProvider();
    const renderer = createTokenRenderer(parent as unknown as Container, colorProvider);

    renderer.update(
      [makeToken({ id: 'token:1', ownerID: null, factionId: null })],
      createZoneContainers([
        ['zone:a', { x: 100, y: 200 }],
      ]),
    );

    const tokenContainer = renderer.getContainerMap().get('token:1') as InstanceType<typeof MockContainer>;
    const base = tokenContainer.children[2] as InstanceType<typeof MockGraphics>;

    expect(colorProvider.getColor).not.toHaveBeenCalled();
    expect(base.fillStyle).toEqual({ color: 0x6b7280 });
  });

  it('parses owned token colors from #RGB and falls back to neutral for invalid provider colors', () => {
    const parent = new MockContainer();
    const colorProvider = createColorProvider({ factionColor: '#abc' });
    const renderer = createTokenRenderer(parent as unknown as Container, colorProvider);

    renderer.update(
      [makeToken({ id: 'token:1', ownerID: asPlayerId(0) })],
      createZoneContainers([
        ['zone:a', { x: 0, y: 0 }],
      ]),
    );

    const tokenContainer = renderer.getContainerMap().get('token:1') as InstanceType<typeof MockContainer>;
    const base = tokenContainer.children[2] as InstanceType<typeof MockGraphics>;
    expect(base.fillStyle).toEqual({ color: 0xaabbcc });

    colorProvider.getColor.mockReturnValue('invalid');
    renderer.update(
      [makeToken({ id: 'token:1', ownerID: asPlayerId(0) })],
      createZoneContainers([
        ['zone:a', { x: 0, y: 0 }],
      ]),
    );
    expect(base.fillStyle).toEqual({ color: 0x6b7280 });
  });

  it('prioritizes token type visual color over faction color and supports named colors', () => {
    const parent = new MockContainer();
    const colorProvider = createColorProvider({
      tokenVisual: { color: 'bright-blue' },
      factionColor: '#ff0000',
    });
    const renderer = createTokenRenderer(parent as unknown as Container, colorProvider);

    renderer.update(
      [makeToken({ id: 'token:1', type: 'vc-guerrillas', ownerID: asPlayerId(0), factionId: 'vc' })],
      createZoneContainers([
        ['zone:a', { x: 0, y: 0 }],
      ]),
    );

    const tokenContainer = renderer.getContainerMap().get('token:1') as InstanceType<typeof MockContainer>;
    const base = tokenContainer.children[2] as InstanceType<typeof MockGraphics>;
    expect(base.fillStyle).toEqual({ color: 0x00bfff });
    expect(colorProvider.getColor).not.toHaveBeenCalled();
  });

  it('shows only symbol graphics for token identity and toggles front/back layers by faceUp', () => {
    const parent = new MockContainer();
    const colorProvider = createColorProvider();
    const renderer = createTokenRenderer(parent as unknown as Container, colorProvider);

    renderer.update(
      [makeToken({ id: 'token:1', type: 'leader', faceUp: false, isSelectable: true })],
      createZoneContainers([
        ['zone:a', { x: 0, y: 0 }],
      ]),
    );

    const tokenContainer = renderer.getContainerMap().get('token:1') as InstanceType<typeof MockContainer>;
    const backSymbol = tokenContainer.children[1] as InstanceType<typeof MockGraphics>;
    const frontSymbol = tokenContainer.children[3] as InstanceType<typeof MockGraphics>;
    expect(frontSymbol.visible).toBe(false);
    expect(backSymbol.visible).toBe(true);
    expect(backSymbol.polyArgs).toBeNull();
    expect(backSymbol.circleArgs).toBeNull();

    renderer.update(
      [makeToken({ id: 'token:1', type: 'leader', faceUp: true, isSelectable: true })],
      createZoneContainers([
        ['zone:a', { x: 0, y: 0 }],
      ]),
    );

    expect(frontSymbol.visible).toBe(true);
    expect(backSymbol.visible).toBe(false);
    expect(frontSymbol.polyArgs).toBeNull();
    expect(frontSymbol.circleArgs).toBeNull();
  });

  it('resolves token symbols from token properties through provider', () => {
    const parent = new MockContainer();
    const colorProvider = createColorProvider({ tokenVisual: { shape: 'beveled-cylinder' } });
    colorProvider.resolveTokenSymbols.mockImplementation((_tokenTypeId, tokenProperties) => ({
      symbol: tokenProperties.activity === 'active' ? 'star' : null,
      backSymbol: null,
    }));
    const renderer = createTokenRenderer(parent as unknown as Container, colorProvider);

    renderer.update(
      [makeToken({ id: 'token:1', type: 'vc-guerrillas', properties: { activity: 'underground' } })],
      createZoneContainers([
        ['zone:a', { x: 0, y: 0 }],
      ]),
    );

    const tokenContainer = renderer.getContainerMap().get('token:1') as InstanceType<typeof MockContainer>;
    const frontSymbol = tokenContainer.children[3] as InstanceType<typeof MockGraphics>;
    expect(frontSymbol.polyArgs).toBeNull();

    renderer.update(
      [makeToken({ id: 'token:1', type: 'vc-guerrillas', properties: { activity: 'active' } })],
      createZoneContainers([
        ['zone:a', { x: 0, y: 0 }],
      ]),
    );

    expect(frontSymbol.polyArgs).toHaveLength(20);
    expect(colorProvider.resolveTokenSymbols).toHaveBeenCalledWith('vc-guerrillas', { activity: 'active' });
  });

  it('renders card-shaped tokens with front/back primitives from token visuals', () => {
    const parent = new MockContainer();
    const colorProvider = createColorProvider({
      tokenVisual: { shape: 'card', symbol: 'diamond', backSymbol: 'circle-dot', color: '#ff0000' },
    });
    const renderer = createTokenRenderer(parent as unknown as Container, colorProvider);

    renderer.update(
      [makeToken({ id: 'token:1', type: 'playing-card', faceUp: false })],
      createZoneContainers([
        ['zone:a', { x: 0, y: 0 }],
      ]),
    );

    const tokenContainer = renderer.getContainerMap().get('token:1') as InstanceType<typeof MockContainer>;
    const backBase = tokenContainer.children[0] as InstanceType<typeof MockGraphics>;
    const backSymbol = tokenContainer.children[1] as InstanceType<typeof MockGraphics>;
    const frontBase = tokenContainer.children[2] as InstanceType<typeof MockGraphics>;
    const frontSymbol = tokenContainer.children[3] as InstanceType<typeof MockGraphics>;

    expect(backBase.roundRectArgs).not.toBeNull();
    expect(frontBase.roundRectArgs).not.toBeNull();
    expect(backBase.visible).toBe(true);
    expect(frontBase.visible).toBe(false);
    expect(backSymbol.circleArgs).not.toBeNull();
    expect(frontSymbol.polyArgs).toHaveLength(8);

    renderer.update(
      [makeToken({ id: 'token:1', type: 'playing-card', faceUp: true })],
      createZoneContainers([
        ['zone:a', { x: 0, y: 0 }],
      ]),
    );

    expect(backBase.visible).toBe(false);
    expect(frontBase.visible).toBe(true);
  });

  it('uses card template dimensions when token type maps to a template', () => {
    const parent = new MockContainer();
    const colorProvider = createColorProvider({
      tokenVisual: { shape: 'card', color: '#ff0000' },
      cardTemplatesByTokenType: {
        'card-AS': {
          width: 48,
          height: 68,
          layout: {
            rank: { y: 8, align: 'center' },
          },
        },
      },
    });
    const renderer = createTokenRenderer(parent as unknown as Container, colorProvider);

    renderer.update(
      [makeToken({ id: 'token:1', type: 'card-AS', faceUp: true, properties: { rank: 'A' } })],
      createZoneContainers([
        ['zone:a', { x: 0, y: 0 }],
      ]),
    );

    const tokenContainer = renderer.getContainerMap().get('token:1') as InstanceType<typeof MockContainer>;
    const frontBase = tokenContainer.children[2] as InstanceType<typeof MockGraphics>;
    expect(frontBase.roundRectArgs).toEqual([-24, -34, 48, 68, 4]);
  });

  it('renders template text only while card is face up', () => {
    const parent = new MockContainer();
    const colorProvider = createColorProvider({
      tokenVisual: { shape: 'card', color: '#ff0000' },
      cardTemplatesByTokenType: {
        'card-AS': {
          width: 48,
          height: 68,
          layout: {
            rank: { y: 8, align: 'center' },
          },
        },
      },
    });
    const renderer = createTokenRenderer(parent as unknown as Container, colorProvider);

    renderer.update(
      [makeToken({ id: 'token:1', type: 'card-AS', faceUp: false, properties: { rank: 'A' } })],
      createZoneContainers([
        ['zone:a', { x: 0, y: 0 }],
      ]),
    );

    const tokenContainer = renderer.getContainerMap().get('token:1') as InstanceType<typeof MockContainer>;
    const cardContent = tokenContainer.children[5] as InstanceType<typeof MockContainer>;
    expect(cardContent).toBeDefined();
    expect(cardContent.visible).toBe(false);
    expect(cardContent.children).toHaveLength(1);

    renderer.update(
      [makeToken({ id: 'token:1', type: 'card-AS', faceUp: true, properties: { rank: 'A' } })],
      createZoneContainers([
        ['zone:a', { x: 0, y: 0 }],
      ]),
    );

    expect(cardContent.visible).toBe(true);
  });

  it('renders non-card token shapes using shape-specific primitives instead of circle fallback', () => {
    const parent = new MockContainer();
    const colorProvider = createColorProvider({
      tokenVisual: { shape: 'cube', color: '#ff0000' },
    });
    const renderer = createTokenRenderer(parent as unknown as Container, colorProvider);

    renderer.update(
      [makeToken({ id: 'token:1', type: 'us-troops', faceUp: true })],
      createZoneContainers([
        ['zone:a', { x: 0, y: 0 }],
      ]),
    );

    const tokenContainer = renderer.getContainerMap().get('token:1') as InstanceType<typeof MockContainer>;
    const frontBase = tokenContainer.children[2] as InstanceType<typeof MockGraphics>;
    expect(frontBase.polyArgs).not.toBeNull();
    expect(frontBase.circleArgs).toBeNull();
  });

  it('uses rectangle hitArea for card tokens and polygon hitArea for hexagon tokens', () => {
    const parent = new MockContainer();
    const colorProvider = createColorProvider({
      tokenVisual: { shape: 'card', size: 28 },
    });
    const renderer = createTokenRenderer(parent as unknown as Container, colorProvider);

    renderer.update(
      [makeToken({ id: 'token:1', type: 'playing-card' })],
      createZoneContainers([
        ['zone:a', { x: 0, y: 0 }],
      ]),
    );

    const cardContainer = renderer.getContainerMap().get('token:1') as unknown as { hitArea?: unknown };
    expect(cardContainer.hitArea).toBeInstanceOf(MockRectangle);

    colorProvider.getTokenTypeVisual.mockReturnValue({
      shape: 'hexagon',
      color: null,
      symbol: null,
      backSymbol: null,
      size: 28,
    });
    renderer.update(
      [makeToken({ id: 'token:1', type: 'hex-token' })],
      createZoneContainers([
        ['zone:a', { x: 0, y: 0 }],
      ]),
    );

    const hexContainer = renderer.getContainerMap().get('token:1') as unknown as { hitArea?: { points?: number[] } };
    expect(hexContainer.hitArea).toBeInstanceOf(MockPolygon);
    expect(hexContainer.hitArea?.points).toHaveLength(12);
  });

  it('renders selectable and selected states with distinct stroke styles and scale', () => {
    const parent = new MockContainer();
    const colorProvider = createColorProvider();
    const renderer = createTokenRenderer(parent as unknown as Container, colorProvider);

    renderer.update(
      [makeToken({ id: 'token:1', isSelectable: true })],
      createZoneContainers([
        ['zone:a', { x: 0, y: 0 }],
      ]),
    );

    const tokenContainer = renderer.getContainerMap().get('token:1') as InstanceType<typeof MockContainer>;
    const base = tokenContainer.children[2] as InstanceType<typeof MockGraphics>;

    expect(base.strokeStyle).toEqual({ color: 0x93c5fd, width: 2.5, alpha: 0.95 });
    expect(tokenContainer.scale.x).toBe(1);

    renderer.update(
      [makeToken({ id: 'token:1', isSelected: true })],
      createZoneContainers([
        ['zone:a', { x: 0, y: 0 }],
      ]),
    );

    expect(base.strokeStyle).toEqual({ color: 0xf8fafc, width: 3.5, alpha: 1 });
    expect(tokenContainer.scale.x).toBe(1.08);
  });

  it('removes and destroys containers for deleted token IDs', () => {
    const parent = new MockContainer();
    const colorProvider = createColorProvider();
    const renderer = createTokenRenderer(parent as unknown as Container, colorProvider);

    renderer.update(
      [makeToken({ id: 'token:1', isSelectable: true }), makeToken({ id: 'token:2', isSelectable: true })],
      createZoneContainers([
        ['zone:a', { x: 0, y: 0 }],
      ]),
    );

    const removed = renderer.getContainerMap().get('token:2') as InstanceType<typeof MockContainer>;

    renderer.update(
      [makeToken({ id: 'token:1', type: 'troop-a' }), makeToken({ id: 'token:2', type: 'troop-b' })],
      createZoneContainers([
        ['zone:a', { x: 0, y: 0 }],
      ]),
    );

    renderer.update(
      [makeToken({ id: 'token:1', type: 'troop-a' })],
      createZoneContainers([
        ['zone:a', { x: 0, y: 0 }],
      ]),
    );

    expect(renderer.getContainerMap().has('token:2')).toBe(false);
    expect(parent.children).toHaveLength(1);
    expect(removed.destroyed).toBe(true);
  });

  it('hides tokens whose zone container is missing and restores when zone reappears', () => {
    const parent = new MockContainer();
    const colorProvider = createColorProvider();
    const renderer = createTokenRenderer(parent as unknown as Container, colorProvider);

    renderer.update([makeToken({ id: 'token:1', zoneID: 'zone:missing', isSelectable: true })], new Map());

    const tokenContainer = renderer.getContainerMap().get('token:1') as InstanceType<typeof MockContainer>;
    expect(tokenContainer.visible).toBe(false);
    expect(tokenContainer.alpha).toBe(0);

    renderer.update(
      [makeToken({ id: 'token:1', zoneID: 'zone:a', isSelectable: true })],
      createZoneContainers([
        ['zone:a', { x: 300, y: 400 }],
      ]),
    );

    expect(tokenContainer.visible).toBe(true);
    expect(tokenContainer.alpha).toBe(1);
    expect(tokenContainer.position.x).toBe(255);
    expect(tokenContainer.position.y).toBe(385);
  });

  it('keeps container references stable for unchanged token IDs across updates', () => {
    const parent = new MockContainer();
    const colorProvider = createColorProvider();
    const renderer = createTokenRenderer(parent as unknown as Container, colorProvider);

    renderer.update(
      [makeToken({ id: 'token:1', isSelectable: true }), makeToken({ id: 'token:2', isSelectable: true })],
      createZoneContainers([
        ['zone:a', { x: 0, y: 0 }],
      ]),
    );

    const firstTokenOne = renderer.getContainerMap().get('token:1');
    const firstTokenTwo = renderer.getContainerMap().get('token:2');

    renderer.update(
      [makeToken({ id: 'token:1', faceUp: false, isSelectable: true }), makeToken({ id: 'token:2', isSelectable: true })],
      createZoneContainers([
        ['zone:a', { x: 50, y: 75 }],
      ]),
    );

    expect(renderer.getContainerMap().get('token:1')).toBe(firstTokenOne);
    expect(renderer.getContainerMap().get('token:2')).toBe(firstTokenTwo);
  });

  it('positions tokens using zone anchor plus per-zone deterministic offsets', () => {
    const parent = new MockContainer();
    const colorProvider = createColorProvider();
    const renderer = createTokenRenderer(parent as unknown as Container, colorProvider);

    renderer.update(
      [
        makeToken({ id: 'token:1' }),
        makeToken({ id: 'token:2', type: 'troop-b' }),
        makeToken({ id: 'token:3', type: 'troop-c' }),
      ],
      createZoneContainers([
        ['zone:a', { x: 500, y: 250 }],
      ]),
    );

    const tokenOne = renderer.getContainerMap().get('token:1') as InstanceType<typeof MockContainer>;
    const tokenTwo = renderer.getContainerMap().get('token:2') as InstanceType<typeof MockContainer>;
    const tokenThree = renderer.getContainerMap().get('token:3') as InstanceType<typeof MockContainer>;

    expect(tokenOne.position.x).toBe(455);
    expect(tokenOne.position.y).toBe(235);
    expect(tokenTwo.position.x).toBe(485);
    expect(tokenTwo.position.y).toBe(235);
    expect(tokenThree.position.x).toBe(515);
    expect(tokenThree.position.y).toBe(235);
  });

  it('getContainerMap returns a live map and destroy clears all containers', () => {
    const parent = new MockContainer();
    const colorProvider = createColorProvider();
    const renderer = createTokenRenderer(parent as unknown as Container, colorProvider);

    renderer.update(
      [makeToken({ id: 'token:1' }), makeToken({ id: 'token:2' })],
      createZoneContainers([
        ['zone:a', { x: 0, y: 0 }],
      ]),
    );

    const mapView = renderer.getContainerMap();
    expect(mapView.size).toBe(2);

    renderer.destroy();

    expect(mapView.size).toBe(0);
    expect(parent.children).toHaveLength(0);
  });

  it('invokes bound selection cleanup when tokens are removed or renderer is destroyed', () => {
    const parent = new MockContainer();
    const colorProvider = createColorProvider();
    const cleanupByTokenId = new Map<string, ReturnType<typeof vi.fn>>();
    const bindSelection = vi.fn((_: Container, tokenId: string) => {
      const cleanup = vi.fn();
      cleanupByTokenId.set(tokenId, cleanup);
      return cleanup;
    });
    const renderer = createTokenRenderer(parent as unknown as Container, colorProvider, {
      bindSelection: (tokenContainer, tokenId, _isSelectable) => bindSelection(tokenContainer, tokenId),
    });

    renderer.update(
      [makeToken({ id: 'token:1', isSelectable: true }), makeToken({ id: 'token:2', isSelectable: true })],
      createZoneContainers([
        ['zone:a', { x: 0, y: 0 }],
      ]),
    );
    renderer.update(
      [makeToken({ id: 'token:1', isSelectable: true })],
      createZoneContainers([
        ['zone:a', { x: 0, y: 0 }],
      ]),
    );

    expect(cleanupByTokenId.get('token:2')).toHaveBeenCalledTimes(1);
    expect(cleanupByTokenId.get('token:1')).toHaveBeenCalledTimes(0);

    renderer.destroy();

    expect(cleanupByTokenId.get('token:1')).toHaveBeenCalledTimes(1);
  });

  it('stacks non-selectable tokens of same type/faction and shows a count badge', () => {
    const parent = new MockContainer();
    const colorProvider = createColorProvider();
    const renderer = createTokenRenderer(parent as unknown as Container, colorProvider);

    renderer.update(
      [
        makeToken({ id: 'token:1', type: 'troop', zoneID: 'zone:a', isSelectable: false }),
        makeToken({ id: 'token:2', type: 'troop', zoneID: 'zone:a', isSelectable: false }),
        makeToken({ id: 'token:3', type: 'troop', zoneID: 'zone:a', isSelectable: false }),
      ],
      createZoneContainers([
        ['zone:a', { x: 50, y: 75 }],
      ]),
    );

    expect(parent.children).toHaveLength(1);
    const tokenContainer = renderer.getContainerMap().get('token:1') as InstanceType<typeof MockContainer>;
    expect(renderer.getContainerMap().get('token:2')).toBe(tokenContainer);
    expect(renderer.getContainerMap().get('token:3')).toBe(tokenContainer);
    const countBadge = tokenContainer.children[4] as InstanceType<typeof MockText>;
    expect(countBadge.text).toBe('3');
    expect(countBadge.visible).toBe(true);
  });

  it('does not stack non-selectable tokens when ownerID differs', () => {
    const parent = new MockContainer();
    const colorProvider = createColorProvider();
    const renderer = createTokenRenderer(parent as unknown as Container, colorProvider);

    renderer.update(
      [
        makeToken({ id: 'token:1', type: 'troop', zoneID: 'zone:a', ownerID: asPlayerId(0), isSelectable: false }),
        makeToken({ id: 'token:2', type: 'troop', zoneID: 'zone:a', ownerID: asPlayerId(1), isSelectable: false }),
      ],
      createZoneContainers([
        ['zone:a', { x: 50, y: 75 }],
      ]),
    );

    expect(parent.children).toHaveLength(2);
    const firstContainer = renderer.getContainerMap().get('token:1');
    const secondContainer = renderer.getContainerMap().get('token:2');
    expect(firstContainer).toBeDefined();
    expect(secondContainer).toBeDefined();
    expect(firstContainer).not.toBe(secondContainer);
  });

  it('uses collision-safe stack keying for zone/type dimensions', () => {
    const parent = new MockContainer();
    const colorProvider = createColorProvider();
    const renderer = createTokenRenderer(parent as unknown as Container, colorProvider);

    renderer.update(
      [
        makeToken({ id: 'token:1', zoneID: 'zone:a', type: 'troop', isSelectable: false }),
        makeToken({ id: 'token:2', zoneID: 'zone', type: 'a:troop', isSelectable: false }),
      ],
      createZoneContainers([
        ['zone:a', { x: 50, y: 75 }],
        ['zone', { x: 80, y: 75 }],
      ]),
    );

    expect(parent.children).toHaveLength(2);
    expect(renderer.getContainerMap().get('token:1')).not.toBe(renderer.getContainerMap().get('token:2'));
  });

  it('rebinds stack hover/selection handlers when representative token id changes', () => {
    const parent = new MockContainer();
    const colorProvider = createColorProvider();
    const cleanupByTokenId = new Map<string, ReturnType<typeof vi.fn>>();
    const bindSelection = vi.fn((_: Container, tokenId: string) => {
      const cleanup = vi.fn();
      cleanupByTokenId.set(tokenId, cleanup);
      return cleanup;
    });
    const renderer = createTokenRenderer(parent as unknown as Container, colorProvider, {
      bindSelection: (tokenContainer, tokenId, _isSelectable) => bindSelection(tokenContainer, tokenId),
    });

    renderer.update(
      [
        makeToken({ id: 'token:1', type: 'troop', zoneID: 'zone:a', isSelectable: false }),
        makeToken({ id: 'token:2', type: 'troop', zoneID: 'zone:a', isSelectable: false }),
      ],
      createZoneContainers([
        ['zone:a', { x: 50, y: 75 }],
      ]),
    );

    renderer.update(
      [
        makeToken({ id: 'token:2', type: 'troop', zoneID: 'zone:a', isSelectable: false }),
        makeToken({ id: 'token:3', type: 'troop', zoneID: 'zone:a', isSelectable: false }),
      ],
      createZoneContainers([
        ['zone:a', { x: 50, y: 75 }],
      ]),
    );

    expect(bindSelection).toHaveBeenCalledTimes(2);
    expect(bindSelection).toHaveBeenNthCalledWith(1, expect.any(MockContainer), 'token:1');
    expect(bindSelection).toHaveBeenNthCalledWith(2, expect.any(MockContainer), 'token:2');
    expect(cleanupByTokenId.get('token:1')).toHaveBeenCalledTimes(1);
    expect(cleanupByTokenId.get('token:2')).toHaveBeenCalledTimes(0);
  });
});
