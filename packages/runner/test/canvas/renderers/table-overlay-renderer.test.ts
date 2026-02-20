import { asPlayerId } from '@ludoforge/engine/runtime';
import { describe, expect, it, vi } from 'vitest';
import type { Container } from 'pixi.js';

import { VisualConfigProvider } from '../../../src/config/visual-config-provider';
import { createTableOverlayRenderer } from '../../../src/canvas/renderers/table-overlay-renderer';
import type { RenderModel, RenderVariable, RenderZone } from '../../../src/model/render-model';

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

    eventMode: 'none' | 'static' | 'passive' = 'none';

    interactiveChildren = true;

    destroyed = false;

    addChild(...children: HoistedMockContainer[]): void {
      for (const child of children) {
        child.parent = this;
        this.children.push(child);
      }
    }

    removeChildren(): HoistedMockContainer[] {
      const removed = this.children;
      this.children = [];
      for (const child of removed) {
        child.parent = null;
      }
      return removed;
    }

    destroy(): void {
      this.destroyed = true;
      this.removeChildren();
    }
  }

  class HoistedMockGraphics extends HoistedMockContainer {
    shape: { kind: 'circle' | 'badge'; args: number[] } | null = null;

    fillColor: number | null = null;

    circle(x: number, y: number, radius: number): this {
      this.shape = { kind: 'circle', args: [x, y, radius] };
      return this;
    }

    roundRect(x: number, y: number, width: number, height: number, radius: number): this {
      this.shape = { kind: 'badge', args: [x, y, width, height, radius] };
      return this;
    }

    fill(color: number): this {
      this.fillColor = color;
      return this;
    }
  }

  class HoistedMockText extends HoistedMockContainer {
    text: string;

    style: unknown;

    anchor = new MockPoint();

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

function makeRenderModel(overrides: Partial<RenderModel> = {}): RenderModel {
  return {
    zones: [
      makeZone({ id: 'shared:center', ownerID: null }),
      makeZone({ id: 'seat:0', ownerID: asPlayerId(0) }),
      makeZone({ id: 'seat:1', ownerID: asPlayerId(1) }),
    ],
    adjacencies: [],
    tokens: [],
    globalVars: [],
    playerVars: new Map([
      [asPlayerId(0), []],
      [asPlayerId(1), []],
    ]),
    globalMarkers: [],
    tracks: [],
    activeEffects: [],
    players: [
      {
        id: asPlayerId(0),
        displayName: 'P0',
        isHuman: true,
        isActive: true,
        isEliminated: false,
        factionId: null,
      },
      {
        id: asPlayerId(1),
        displayName: 'P1',
        isHuman: true,
        isActive: false,
        isEliminated: false,
        factionId: null,
      },
    ],
    activePlayerID: asPlayerId(0),
    turnOrder: [asPlayerId(0), asPlayerId(1)],
    turnOrderType: 'roundRobin',
    simultaneousSubmitted: [],
    interruptStack: [],
    isInInterrupt: false,
    phaseName: 'main',
    phaseDisplayName: 'Main',
    eventDecks: [],
    actionGroups: [],
    choiceBreadcrumb: [],
    choiceUi: { kind: 'none' },
    moveEnumerationWarnings: [],
    terminal: null,
    ...overrides,
  };
}

function makeZone(overrides: Partial<RenderZone>): RenderZone {
  return {
    id: 'zone',
    displayName: 'Zone',
    ordering: 'set',
    tokenIDs: [],
    hiddenTokenCount: 0,
    markers: [],
    visibility: 'public',
    isSelectable: false,
    isHighlighted: false,
    ownerID: null,
    category: null,
    attributes: {},
    visual: { shape: 'rectangle', width: 160, height: 100, color: null },
    metadata: {},
    ...overrides,
  };
}

function asVar(name: string, value: number | boolean): RenderVariable {
  return {
    name,
    value,
    displayName: name,
  };
}

describe('createTableOverlayRenderer', () => {
  const positions = new Map([
    ['shared:center', { x: 0, y: 0 }],
    ['seat:0', { x: -100, y: 100 }],
    ['seat:1', { x: 100, y: 100 }],
  ]);

  it('renders globalVar label + value at table center plus offset', () => {
    const parent = new MockContainer();
    const provider = new VisualConfigProvider({
      version: 1,
      tableOverlays: {
        items: [
          {
            kind: 'globalVar',
            varName: 'pot',
            label: 'Pot',
            position: 'tableCenter',
            offsetY: 60,
          },
        ],
      },
    });
    const renderer = createTableOverlayRenderer(parent as unknown as Container, provider);

    renderer.update(
      makeRenderModel({
        globalVars: [asVar('pot', 42)],
      }),
      positions,
    );

    const label = parent.children[0] as InstanceType<typeof MockText>;
    expect(parent.children).toHaveLength(1);
    expect(label.text).toBe('Pot: 42');
    expect(label.position.x).toBe(0);
    expect(label.position.y).toBeCloseTo(126.6666666667, 6);
  });

  it('updates globalVar overlay when value changes', () => {
    const parent = new MockContainer();
    const provider = new VisualConfigProvider({
      version: 1,
      tableOverlays: {
        items: [{ kind: 'globalVar', varName: 'pot', label: 'Pot', position: 'tableCenter' }],
      },
    });
    const renderer = createTableOverlayRenderer(parent as unknown as Container, provider);

    renderer.update(makeRenderModel({ globalVars: [asVar('pot', 10)] }), positions);
    const firstLabel = parent.children[0] as InstanceType<typeof MockText>;

    renderer.update(makeRenderModel({ globalVars: [asVar('pot', 55)] }), positions);
    const secondLabel = parent.children[0] as InstanceType<typeof MockText>;

    expect(firstLabel.destroyed).toBe(true);
    expect(parent.children).toHaveLength(1);
    expect(secondLabel.text).toBe('Pot: 55');
  });

  it('renders perPlayerVar for non-eliminated players and skips eliminated players', () => {
    const parent = new MockContainer();
    const provider = new VisualConfigProvider({
      version: 1,
      tableOverlays: {
        playerSeatAnchorZones: ['seat:0', 'seat:1'],
        items: [
          {
            kind: 'perPlayerVar',
            varName: 'streetBet',
            label: 'Bet',
            position: 'playerSeat',
            offsetY: -40,
          },
        ],
      },
    });
    const renderer = createTableOverlayRenderer(parent as unknown as Container, provider);

    renderer.update(
      makeRenderModel({
        players: [
          {
            id: asPlayerId(0),
            displayName: 'P0',
            isHuman: true,
            isActive: true,
            isEliminated: false,
            factionId: null,
          },
          {
            id: asPlayerId(1),
            displayName: 'P1',
            isHuman: true,
            isActive: false,
            isEliminated: true,
            factionId: null,
          },
        ],
        playerVars: new Map([
          [asPlayerId(0), [asVar('streetBet', 25)]],
          [asPlayerId(1), [asVar('streetBet', 99)]],
        ]),
      }),
      positions,
    );

    const label = parent.children[0] as InstanceType<typeof MockText>;
    expect(parent.children).toHaveLength(1);
    expect(label.text).toBe('Bet: 25');
    expect(label.position.x).toBe(-100);
    expect(label.position.y).toBe(60);
  });

  it('renders marker at the seat whose index equals the marker variable', () => {
    const parent = new MockContainer();
    const provider = new VisualConfigProvider({
      version: 1,
      tableOverlays: {
        playerSeatAnchorZones: ['seat:0', 'seat:1'],
        items: [
          {
            kind: 'marker',
            varName: 'dealerSeat',
            label: 'D',
            position: 'playerSeat',
            offsetX: -60,
            offsetY: -20,
            markerShape: 'circle',
          },
        ],
      },
    });
    const renderer = createTableOverlayRenderer(parent as unknown as Container, provider);

    renderer.update(
      makeRenderModel({
        globalVars: [asVar('dealerSeat', 1)],
      }),
      positions,
    );

    const marker = parent.children[0] as InstanceType<typeof MockContainer>;
    const markerBadge = marker.children[0] as InstanceType<typeof MockGraphics>;
    const markerLabel = marker.children[1] as InstanceType<typeof MockText>;
    expect(parent.children).toHaveLength(1);
    expect(marker.position.x).toBe(40);
    expect(marker.position.y).toBe(80);
    expect(markerBadge.shape?.kind).toBe('circle');
    expect(markerLabel.text).toBe('D');
  });

  it('moves marker when marker variable changes', () => {
    const parent = new MockContainer();
    const provider = new VisualConfigProvider({
      version: 1,
      tableOverlays: {
        playerSeatAnchorZones: ['seat:0', 'seat:1'],
        items: [{ kind: 'marker', varName: 'dealerSeat', position: 'playerSeat', label: 'D' }],
      },
    });
    const renderer = createTableOverlayRenderer(parent as unknown as Container, provider);

    renderer.update(makeRenderModel({ globalVars: [asVar('dealerSeat', 0)] }), positions);
    const firstMarker = parent.children[0] as InstanceType<typeof MockContainer>;
    expect(firstMarker.position.x).toBe(-100);
    expect(firstMarker.position.y).toBe(100);

    renderer.update(makeRenderModel({ globalVars: [asVar('dealerSeat', 1)] }), positions);
    const secondMarker = parent.children[0] as InstanceType<typeof MockContainer>;
    expect(secondMarker.position.x).toBe(100);
    expect(secondMarker.position.y).toBe(100);
  });

  it('renders nothing when tableOverlays config is missing', () => {
    const parent = new MockContainer();
    const provider = new VisualConfigProvider({ version: 1 });
    const renderer = createTableOverlayRenderer(parent as unknown as Container, provider);

    renderer.update(makeRenderModel({ globalVars: [asVar('pot', 12)] }), positions);

    expect(parent.children).toHaveLength(0);
  });

  it('skips playerSeat overlays when no configured anchor zones are available in positions', () => {
    const parent = new MockContainer();
    const provider = new VisualConfigProvider({
      version: 1,
      tableOverlays: {
        playerSeatAnchorZones: ['missing:0', 'missing:1'],
        items: [{ kind: 'marker', varName: 'dealerSeat', position: 'playerSeat', label: 'D' }],
      },
    });
    const renderer = createTableOverlayRenderer(parent as unknown as Container, provider);

    renderer.update(
      makeRenderModel({
        globalVars: [asVar('dealerSeat', 0)],
      }),
      positions,
    );

    expect(parent.children).toHaveLength(0);
  });
});
