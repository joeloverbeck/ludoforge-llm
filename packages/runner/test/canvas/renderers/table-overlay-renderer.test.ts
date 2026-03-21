import { asPlayerId, type PlayerId } from '@ludoforge/engine/runtime';
import { describe, expect, it, vi } from 'vitest';
import type { Container } from 'pixi.js';

import {
  LABEL_FONT_NAME,
  STROKE_LABEL_FONT_NAME,
} from '../../../src/canvas/text/bitmap-font-registry.js';
import { VisualConfigProvider } from '../../../src/config/visual-config-provider';
import { createTableOverlayRenderer } from '../../../src/canvas/renderers/table-overlay-renderer';
import type { WorldLayoutModel } from '../../../src/layout/world-layout-model.js';
import type { RenderModel, RenderZone } from '../../../src/model/render-model';
import type { RunnerFrame, RunnerProjectionSource } from '../../../src/model/runner-frame.js';
import type { TableOverlayMarkerNode } from '../../../src/presentation/project-table-overlay-surface.js';
import { projectTableOverlaySurface } from '../../../src/presentation/project-table-overlay-surface.js';

interface ProjectionSourceFixture {
  readonly globalVars: readonly { name: string; value: number | boolean }[];
  readonly playerVars: ReadonlyMap<PlayerId, readonly { name: string; value: number | boolean }[]>;
}

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

    visible = true;

    renderable = true;

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

    removeFromParent(): void {
      if (this.parent) {
        const idx = this.parent.children.indexOf(this);
        if (idx >= 0) {
          this.parent.children.splice(idx, 1);
        }
        this.parent = null;
      }
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

    clear(): this {
      this.shape = null;
      this.fillColor = null;
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
  BitmapText: MockText,
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
    choiceContext: null,
    choiceUi: { kind: 'none' },
    moveEnumerationWarnings: [],
    runtimeEligible: [],
    surfaces: {
      tableOverlays: [],
      showdown: null,
    },
    victoryStandings: null,
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

function asVar(name: string, value: number | boolean) {
  return {
    name,
    value,
  } as const;
}

function makeProjectionSource(overrides: Partial<ProjectionSourceFixture> = {}): ProjectionSourceFixture {
  return {
    globalVars: [],
    playerVars: new Map([
      [asPlayerId(0), []],
      [asPlayerId(1), []],
    ]),
    ...overrides,
  };
}

function updateRenderer(
  renderer: ReturnType<typeof createTableOverlayRenderer>,
  provider: VisualConfigProvider,
  renderModel: RenderModel | null,
  positions: ReadonlyMap<string, { x: number; y: number }>,
  projectionSource: ProjectionSourceFixture = makeProjectionSource(),
): void {
  renderer.update(projectTableOverlaySurface({
    projection: renderModel === null
      ? null
      : {
          frame: toRunnerFrame(renderModel),
          source: toRunnerProjectionSource(projectionSource),
        },
    worldLayout: makeWorldLayout(positions),
    visualConfigProvider: provider,
  }));
}

function makeWorldLayout(
  positions: ReadonlyMap<string, { x: number; y: number }>,
): WorldLayoutModel {
  return {
    positions: new Map(positions),
    bounds: { minX: -120, minY: -120, maxX: 240, maxY: 240 },
    boardBounds: { minX: -80, minY: -80, maxX: 200, maxY: 200 },
  };
}

function toRunnerFrame(renderModel: RenderModel): RunnerFrame {
  return {
    zones: renderModel.zones.map((zone) => ({
      id: zone.id,
      ordering: zone.ordering,
      tokenIDs: zone.tokenIDs,
      hiddenTokenCount: zone.hiddenTokenCount,
      markers: zone.markers.map((marker) => ({
        id: marker.id,
        state: marker.state,
        possibleStates: marker.possibleStates,
      })),
      visibility: zone.visibility,
      isSelectable: zone.isSelectable,
      isHighlighted: zone.isHighlighted,
      ownerID: zone.ownerID,
      category: zone.category,
      attributes: zone.attributes,
      metadata: zone.metadata,
    })),
    adjacencies: renderModel.adjacencies,
    tokens: renderModel.tokens,
    activeEffects: renderModel.activeEffects.map((effect) => ({
      id: effect.id,
      sourceCardId: effect.id,
      sourceCardTitle: effect.displayName,
      attributes: effect.attributes.map((attribute) => ({ key: attribute.key, value: attribute.value })),
    })),
    players: renderModel.players.map(({ id, isHuman, isActive, isEliminated, factionId }) => ({ id, isHuman, isActive, isEliminated, factionId })),
    activePlayerID: renderModel.activePlayerID,
    turnOrder: renderModel.turnOrder,
    turnOrderType: renderModel.turnOrderType,
    simultaneousSubmitted: renderModel.simultaneousSubmitted,
    interruptStack: renderModel.interruptStack,
    isInInterrupt: renderModel.isInInterrupt,
    phaseName: renderModel.phaseName,
    eventDecks: renderModel.eventDecks.map(({ id, drawZoneId, discardZoneId, playedCard, lookaheadCard, deckSize, discardSize }) => ({
      id,
      drawZoneId,
      discardZoneId,
      playedCard,
      lookaheadCard,
      deckSize,
      discardSize,
    })),
    actionGroups: renderModel.actionGroups.map(({ groupKey, actions }) => ({ groupKey, actions })),
    choiceBreadcrumb: renderModel.choiceBreadcrumb.map((step) => ({
      decisionKey: step.decisionKey,
      name: step.name,
      chosenValueId: step.chosenValueId,
      chosenValue: step.chosenValue,
      iterationGroupId: step.iterationGroupId,
      iterationEntityId: null,
    })),
    choiceContext: renderModel.choiceContext === null
      ? null
      : {
          selectedActionId: renderModel.choiceContext.actionDisplayName,
          decisionParamName: renderModel.choiceContext.decisionParamName,
          minSelections: null,
          maxSelections: null,
          iterationEntityId: null,
          iterationIndex: null,
          iterationTotal: null,
        },
    choiceUi: renderModel.choiceUi as RunnerFrame['choiceUi'],
    moveEnumerationWarnings: renderModel.moveEnumerationWarnings,
    runtimeEligible: renderModel.runtimeEligible.map(({ seatId, factionId, seatIndex }) => ({ seatId, factionId, seatIndex })),
    victoryStandings: renderModel.victoryStandings,
    terminal: renderModel.terminal,
  };
}

function toRunnerProjectionSource(projectionSource: ProjectionSourceFixture): RunnerProjectionSource {
  return {
    globalVars: projectionSource.globalVars.map(({ name, value }) => ({ name, value })),
    playerVars: new Map(
      Array.from(projectionSource.playerVars.entries()).map(([playerId, variables]) => [
        playerId,
        variables.map(({ name, value }) => ({ name, value })),
      ]),
    ),
  };
}

function makeMarkerNode(
  overrides: Partial<TableOverlayMarkerNode> = {},
): TableOverlayMarkerNode {
  const baseStyle = {
    color: '#fbbf24',
    shape: 'circle',
    label: 'D',
    fontSize: 11,
    fontName: LABEL_FONT_NAME,
    textColor: '#111827',
  } as const;
  const style = {
    ...baseStyle,
    ...(overrides.style ?? {}),
  };

  return {
    key: overrides.key ?? 'overlay:marker',
    type: 'marker',
    point: overrides.point ?? { x: 12, y: 34 },
    signature: 'marker-signature',
    ...(overrides.signature !== undefined ? { signature: overrides.signature } : {}),
    style,
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

    updateRenderer(
      renderer,
      provider,
      makeRenderModel(),
      positions,
      makeProjectionSource({
        globalVars: [asVar('pot', 42)],
      }),
    );

    const label = parent.children[0] as InstanceType<typeof MockText>;
    expect(parent.children).toHaveLength(1);
    expect(label.text).toBe('Pot: 42');
    expect(label.position.x).toBe(60);
    expect(label.position.y).toBe(120);
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

    updateRenderer(renderer, provider, makeRenderModel(), positions, makeProjectionSource({ globalVars: [asVar('pot', 10)] }));

    updateRenderer(renderer, provider, makeRenderModel(), positions, makeProjectionSource({ globalVars: [asVar('pot', 55)] }));
    const secondLabel = parent.children[0] as InstanceType<typeof MockText>;

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

    updateRenderer(renderer, provider,
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
      }),
      positions,
      makeProjectionSource({
        playerVars: new Map([
          [asPlayerId(0), [asVar('streetBet', 25)]],
          [asPlayerId(1), [asVar('streetBet', 99)]],
        ]),
      }),
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

    updateRenderer(
      renderer,
      provider,
      makeRenderModel(),
      positions,
      makeProjectionSource({
        globalVars: [asVar('dealerSeat', 1)],
      }),
    );

    const marker = parent.children[0] as InstanceType<typeof MockContainer>;
    const markerBadge = marker.children[0] as InstanceType<typeof MockGraphics>;
    const markerLabel = marker.children[1] as InstanceType<typeof MockText>;
    expect(parent.children).toHaveLength(1);
    expect(marker.position.x).toBe(40);
    expect(marker.position.y).toBe(80);
    expect(markerBadge.shape?.kind).toBe('circle');
    expect(markerLabel.text).toBe('D');
    expect((markerLabel.style as { fontFamily?: string }).fontFamily).toBe(LABEL_FONT_NAME);
  });

  it('moves marker when marker variable changes and reuses same Container', () => {
    const parent = new MockContainer();
    const provider = new VisualConfigProvider({
      version: 1,
      tableOverlays: {
        playerSeatAnchorZones: ['seat:0', 'seat:1'],
        items: [{ kind: 'marker', varName: 'dealerSeat', position: 'playerSeat', label: 'D' }],
      },
    });
    const renderer = createTableOverlayRenderer(parent as unknown as Container, provider);

    updateRenderer(renderer, provider, makeRenderModel(), positions, makeProjectionSource({ globalVars: [asVar('dealerSeat', 0)] }));
    const firstMarker = parent.children[0] as InstanceType<typeof MockContainer>;
    expect(firstMarker.position.x).toBe(-100);
    expect(firstMarker.position.y).toBe(100);

    updateRenderer(renderer, provider, makeRenderModel(), positions, makeProjectionSource({ globalVars: [asVar('dealerSeat', 1)] }));
    const secondMarker = parent.children[0] as InstanceType<typeof MockContainer>;
    expect(secondMarker.position.x).toBe(100);
    expect(secondMarker.position.y).toBe(100);
    expect(secondMarker).toBe(firstMarker);
  });

  it('renders nothing when tableOverlays config is missing', () => {
    const parent = new MockContainer();
    const provider = new VisualConfigProvider({ version: 1 });
    const renderer = createTableOverlayRenderer(parent as unknown as Container, provider);

    updateRenderer(renderer, provider, makeRenderModel(), positions, makeProjectionSource({ globalVars: [asVar('pot', 12)] }));

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

    updateRenderer(
      renderer,
      provider,
      makeRenderModel(),
      positions,
      makeProjectionSource({
        globalVars: [asVar('dealerSeat', 0)],
      }),
    );

    expect(parent.children).toHaveLength(0);
  });

  describe('marker style caching', () => {
    it('keeps the same marker label style object when style inputs are unchanged', () => {
      const parent = new MockContainer();
      const renderer = createTableOverlayRenderer(parent as unknown as Container);

      renderer.update([makeMarkerNode()]);
      const marker = parent.children[0] as InstanceType<typeof MockContainer>;
      const label = marker.children[1] as InstanceType<typeof MockText>;
      const firstStyle = label.style;

      renderer.update([makeMarkerNode({ point: { x: 50, y: 75 }, signature: 'marker-signature-2' })]);

      expect(parent.children).toHaveLength(1);
      expect(marker.position.x).toBe(50);
      expect(marker.position.y).toBe(75);
      expect(label.style).toBe(firstStyle);
    });

    it('reassigns marker label style when text color changes', () => {
      const parent = new MockContainer();
      const renderer = createTableOverlayRenderer(parent as unknown as Container);

      renderer.update([makeMarkerNode()]);
      const marker = parent.children[0] as InstanceType<typeof MockContainer>;
      const label = marker.children[1] as InstanceType<typeof MockText>;
      const firstStyle = label.style;

      renderer.update([
        makeMarkerNode({
          style: { ...makeMarkerNode().style, textColor: '#ffffff' },
          signature: 'marker-signature-color',
        }),
      ]);

      expect(label.style).not.toBe(firstStyle);
      expect((label.style as { fill?: string }).fill).toBe('#ffffff');
    });

    it('reassigns marker label style when font size changes', () => {
      const parent = new MockContainer();
      const renderer = createTableOverlayRenderer(parent as unknown as Container);

      renderer.update([makeMarkerNode()]);
      const marker = parent.children[0] as InstanceType<typeof MockContainer>;
      const label = marker.children[1] as InstanceType<typeof MockText>;
      const firstStyle = label.style;

      renderer.update([
        makeMarkerNode({
          style: { ...makeMarkerNode().style, fontSize: 13 },
          signature: 'marker-signature-font-size',
        }),
      ]);

      expect(label.style).not.toBe(firstStyle);
      expect((label.style as { fontSize?: number }).fontSize).toBe(13);
    });

    it('reassigns marker label style when font name changes', () => {
      const parent = new MockContainer();
      const renderer = createTableOverlayRenderer(parent as unknown as Container);

      renderer.update([makeMarkerNode()]);
      const marker = parent.children[0] as InstanceType<typeof MockContainer>;
      const label = marker.children[1] as InstanceType<typeof MockText>;
      const firstStyle = label.style;

      renderer.update([
        makeMarkerNode({
          style: { ...makeMarkerNode().style, fontName: STROKE_LABEL_FONT_NAME },
          signature: 'marker-signature-font-name',
        }),
      ]);

      expect(label.style).not.toBe(firstStyle);
      expect((label.style as { fontFamily?: string }).fontFamily).toBe(STROKE_LABEL_FONT_NAME);
    });
  });

  describe('keyed reconciliation', () => {
    it('does not destroy and recreate children when update is called with identical inputs', () => {
      const parent = new MockContainer();
      const provider = new VisualConfigProvider({
        version: 1,
        tableOverlays: {
          items: [{ kind: 'globalVar', varName: 'pot', label: 'Pot', position: 'tableCenter' }],
        },
      });
      const renderer = createTableOverlayRenderer(parent as unknown as Container, provider);

      updateRenderer(renderer, provider, makeRenderModel(), positions, makeProjectionSource({ globalVars: [asVar('pot', 42)] }));

      const firstChild = parent.children[0] as InstanceType<typeof MockText>;
      expect(parent.children).toHaveLength(1);
      expect(firstChild.text).toBe('Pot: 42');

      updateRenderer(renderer, provider, makeRenderModel(), positions, makeProjectionSource({ globalVars: [asVar('pot', 42)] }));

      expect(parent.children).toHaveLength(1);
      expect(parent.children[0]).toBe(firstChild);
      expect(firstChild.destroyed).toBe(false);
    });

    it('reuses Text object in-place when value changes', () => {
      const parent = new MockContainer();
      const provider = new VisualConfigProvider({
        version: 1,
        tableOverlays: {
          items: [{ kind: 'globalVar', varName: 'pot', label: 'Pot', position: 'tableCenter' }],
        },
      });
      const renderer = createTableOverlayRenderer(parent as unknown as Container, provider);

      updateRenderer(renderer, provider, makeRenderModel(), positions, makeProjectionSource({ globalVars: [asVar('pot', 10)] }));
      const firstChild = parent.children[0] as InstanceType<typeof MockText>;

      updateRenderer(renderer, provider, makeRenderModel(), positions, makeProjectionSource({ globalVars: [asVar('pot', 20)] }));

      expect(parent.children).toHaveLength(1);
      expect(parent.children[0]).toBe(firstChild);
      expect(firstChild.text).toBe('Pot: 20');
      expect(firstChild.destroyed).toBe(false);
    });

    it('reuses marker Container in-place when variable changes', () => {
      const parent = new MockContainer();
      const provider = new VisualConfigProvider({
        version: 1,
        tableOverlays: {
          playerSeatAnchorZones: ['seat:0', 'seat:1'],
          items: [{ kind: 'marker', varName: 'dealerSeat', position: 'playerSeat', label: 'D' }],
        },
      });
      const renderer = createTableOverlayRenderer(parent as unknown as Container, provider);

      updateRenderer(renderer, provider, makeRenderModel(), positions, makeProjectionSource({ globalVars: [asVar('dealerSeat', 0)] }));
      const markerRef = parent.children[0] as InstanceType<typeof MockContainer>;

      updateRenderer(renderer, provider, makeRenderModel(), positions, makeProjectionSource({ globalVars: [asVar('dealerSeat', 1)] }));

      expect(parent.children).toHaveLength(1);
      expect(parent.children[0]).toBe(markerRef);
      expect(markerRef.destroyed).toBe(false);
      expect(markerRef.position.x).toBe(100);
      expect(markerRef.position.y).toBe(100);
    });

    it('retires removed per-player overlays when item count decreases', () => {
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
            },
          ],
        },
      });
      const renderer = createTableOverlayRenderer(parent as unknown as Container, provider);

      // Two active players → two text slots
      updateRenderer(renderer, provider,
        makeRenderModel(),
        positions,
        makeProjectionSource({
          playerVars: new Map([
            [asPlayerId(0), [asVar('streetBet', 10)]],
            [asPlayerId(1), [asVar('streetBet', 20)]],
          ]),
        }),
      );
      expect(parent.children).toHaveLength(2);
      const firstSlot = parent.children[0] as InstanceType<typeof MockText>;
      const secondSlot = parent.children[1] as InstanceType<typeof MockText>;

      // One player eliminated -> the removed keyed overlay is retired.
      updateRenderer(renderer, provider,
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
        }),
        positions,
        makeProjectionSource({
          playerVars: new Map([
            [asPlayerId(0), [asVar('streetBet', 10)]],
            [asPlayerId(1), [asVar('streetBet', 20)]],
          ]),
        }),
      );
      expect(parent.children).toHaveLength(1);
      expect(parent.children[0]).toBe(firstSlot);
      expect(secondSlot.destroyed).toBe(true);
    });

    it('creates a new text node when a removed keyed overlay returns', () => {
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
            },
          ],
        },
      });
      const renderer = createTableOverlayRenderer(parent as unknown as Container, provider);

      // Two players
      updateRenderer(renderer, provider,
        makeRenderModel(),
        positions,
        makeProjectionSource({
          playerVars: new Map([
            [asPlayerId(0), [asVar('streetBet', 10)]],
            [asPlayerId(1), [asVar('streetBet', 20)]],
          ]),
        }),
      );
      const firstSlot = parent.children[0];
      const secondSlot = parent.children[1];
      expect(parent.children).toHaveLength(2);

      // One player eliminated.
      updateRenderer(renderer, provider,
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
        }),
        positions,
        makeProjectionSource({
          playerVars: new Map([
            [asPlayerId(0), [asVar('streetBet', 10)]],
            [asPlayerId(1), [asVar('streetBet', 20)]],
          ]),
        }),
      );
      expect(parent.children).toHaveLength(1);
      expect(secondSlot?.destroyed).toBe(true);

      // Both players active again.
      updateRenderer(renderer, provider,
        makeRenderModel(),
        positions,
        makeProjectionSource({
          playerVars: new Map([
            [asPlayerId(0), [asVar('streetBet', 30)]],
            [asPlayerId(1), [asVar('streetBet', 40)]],
          ]),
        }),
      );
      expect(parent.children).toHaveLength(2);
      expect(parent.children[0]).toBe(firstSlot);
      expect(parent.children[1]).not.toBe(secondSlot);
    });

    it('does not call destroy() on Text objects during update cycle', () => {
      const parent = new MockContainer();
      const provider = new VisualConfigProvider({
        version: 1,
        tableOverlays: {
          items: [{ kind: 'globalVar', varName: 'pot', label: 'Pot', position: 'tableCenter' }],
        },
      });
      const renderer = createTableOverlayRenderer(parent as unknown as Container, provider);

      updateRenderer(renderer, provider, makeRenderModel(), positions, makeProjectionSource({ globalVars: [asVar('pot', 10)] }));
      const child = parent.children[0] as InstanceType<typeof MockText>;
      const destroySpy = vi.spyOn(child, 'destroy');

      updateRenderer(renderer, provider, makeRenderModel(), positions, makeProjectionSource({ globalVars: [asVar('pot', 20)] }));

      expect(destroySpy).not.toHaveBeenCalled();
    });

    it('retires children when renderModel becomes null after a non-null update', () => {
      const parent = new MockContainer();
      const provider = new VisualConfigProvider({
        version: 1,
        tableOverlays: {
          items: [{ kind: 'globalVar', varName: 'pot', label: 'Pot', position: 'tableCenter' }],
        },
      });
      const renderer = createTableOverlayRenderer(parent as unknown as Container, provider);

      updateRenderer(renderer, provider, makeRenderModel(), positions, makeProjectionSource({ globalVars: [asVar('pot', 10)] }));
      const child = parent.children[0] as InstanceType<typeof MockText>;
      expect(parent.children).toHaveLength(1);

      updateRenderer(renderer, provider, null, positions);
      expect(parent.children).toHaveLength(0);
      expect(child.destroyed).toBe(true);
    });

    it('preserves semantic player identity instead of reusing slot zero for a different player', () => {
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
            },
          ],
        },
      });
      const renderer = createTableOverlayRenderer(parent as unknown as Container, provider);

      // Two players active.
      updateRenderer(renderer, provider,
        makeRenderModel(),
        positions,
        makeProjectionSource({
          playerVars: new Map([
            [asPlayerId(0), [asVar('streetBet', 10)]],
            [asPlayerId(1), [asVar('streetBet', 20)]],
          ]),
        }),
      );
      const firstSlot = parent.children[0] as InstanceType<typeof MockText>;
      const secondSlot = parent.children[1] as InstanceType<typeof MockText>;

      // Remove player 0, leaving only player 1.
      updateRenderer(renderer, provider,
        makeRenderModel({
          players: [
            {
              id: asPlayerId(1),
              displayName: 'P1',
              isHuman: true,
              isActive: true,
              isEliminated: false,
              factionId: null,
            },
          ],
        }),
        positions,
        makeProjectionSource({
          playerVars: new Map([
            [asPlayerId(1), [asVar('streetBet', 20)]],
          ]),
        }),
      );
      expect(parent.children).toHaveLength(1);
      expect(parent.children[0]).toBe(secondSlot);
      expect(firstSlot.destroyed).toBe(true);
      expect(secondSlot.destroyed).toBe(false);
    });
  });
});
