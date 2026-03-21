import { asPlayerId, type AttributeValue } from '@ludoforge/engine/runtime';
import { describe, expect, it } from 'vitest';

import { LABEL_FONT_NAME } from '../../src/canvas/text/bitmap-font-registry.js';
import { VisualConfigProvider } from '../../src/config/visual-config-provider.js';
import type { WorldLayoutModel } from '../../src/layout/world-layout-model.js';
import type {
  RunnerFrame,
  RunnerProjectionBundle,
  RunnerProjectionSource,
  RunnerVariable,
  RunnerZone,
} from '../../src/model/runner-frame.js';
import {
  projectTableOverlaySurface,
  tableOverlaySurfaceNodesEqual,
} from '../../src/presentation/project-table-overlay-surface.js';

function makeZone(
  id: string,
  attributes: Readonly<Record<string, AttributeValue>> = {},
  overrides: Partial<RunnerZone> = {},
): RunnerZone {
  return {
    id,
    ordering: 'stack',
    tokenIDs: [],
    hiddenTokenCount: 0,
    markers: [],
    visibility: 'public',
    isSelectable: false,
    isHighlighted: false,
    ownerID: null,
    category: 'province',
    attributes,
    metadata: {},
    ...overrides,
  };
}

function asVar(name: string, value: number | boolean): RunnerVariable {
  return { name, value };
}

function makeRunnerFrame(overrides: Partial<RunnerFrame> = {}): RunnerFrame {
  return {
    zones: [
      makeZone('shared:center'),
      makeZone('seat:0', {}, { ownerID: asPlayerId(0) }),
      makeZone('seat:1', {}, { ownerID: asPlayerId(1) }),
    ],
    adjacencies: [],
    tokens: [],
    activeEffects: [],
    players: [
      { id: asPlayerId(0), isHuman: true, isActive: true, isEliminated: false, factionId: null },
      { id: asPlayerId(1), isHuman: true, isActive: false, isEliminated: false, factionId: null },
    ],
    activePlayerID: asPlayerId(0),
    turnOrder: [asPlayerId(0), asPlayerId(1)],
    turnOrderType: 'roundRobin',
    simultaneousSubmitted: [],
    interruptStack: [],
    isInInterrupt: false,
    phaseName: 'main',
    eventDecks: [],
    actionGroups: [],
    choiceBreadcrumb: [],
    choiceContext: null,
    choiceUi: { kind: 'none' },
    moveEnumerationWarnings: [],
    runtimeEligible: [],
    victoryStandings: null,
    terminal: null,
    ...overrides,
  };
}

function makeProjectionSource(overrides: Partial<RunnerProjectionSource> = {}): RunnerProjectionSource {
  return {
    globalVars: [],
    playerVars: new Map([
      [asPlayerId(0), []],
      [asPlayerId(1), []],
    ]),
    ...overrides,
  };
}

function makeProjection(overrides: {
  frame?: Partial<RunnerFrame>;
  source?: Partial<RunnerProjectionSource>;
} = {}): RunnerProjectionBundle {
  return {
    frame: makeRunnerFrame(overrides.frame),
    source: makeProjectionSource(overrides.source),
  };
}

function makeWorldLayout(
  positions: ReadonlyMap<string, { readonly x: number; readonly y: number }>,
  boardBounds: WorldLayoutModel['boardBounds'] = {
    minX: -120,
    minY: -80,
    maxX: 120,
    maxY: 80,
  },
): WorldLayoutModel {
  return {
    positions: new Map(positions),
    bounds: {
      minX: -200,
      minY: -120,
      maxX: 200,
      maxY: 160,
    },
    boardBounds,
  };
}

describe('projectTableOverlaySurface', () => {
  const positions = new Map([
    ['shared:center', { x: 0, y: 0 }],
    ['seat:0', { x: -100, y: 100 }],
    ['seat:1', { x: 100, y: 100 }],
  ]);

  it('projects configured table overlays into explicit surface nodes', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      tableOverlays: {
        playerSeatAnchorZones: ['seat:0', 'seat:1'],
        items: [
          { kind: 'globalVar', varName: 'pot', label: 'Pot', position: 'tableCenter', offsetY: 40 },
          { kind: 'perPlayerVar', varName: 'bet', label: 'Bet', position: 'playerSeat', offsetY: -20 },
          { kind: 'marker', varName: 'dealerSeat', label: 'D', position: 'playerSeat', offsetX: -30 },
        ],
      },
    });

    const overlays = projectTableOverlaySurface({
      projection: makeProjection({
        source: {
          globalVars: [asVar('pot', 42), asVar('dealerSeat', 1)],
          playerVars: new Map([
            [asPlayerId(0), [asVar('bet', 5)]],
            [asPlayerId(1), [asVar('bet', 9)]],
          ]),
        },
      }),
      worldLayout: makeWorldLayout(positions),
      visualConfigProvider: provider,
    });

    expect(overlays).toHaveLength(4);
    expect(overlays[0]).toMatchObject({
      type: 'text',
      text: 'Pot: 42',
      point: { x: 0, y: 40 },
      style: { color: '#f8fafc', fontSize: 12, fontName: LABEL_FONT_NAME },
    });
    expect(overlays[1]).toMatchObject({
      type: 'text',
      text: 'Bet: 5',
      point: { x: -100, y: 80 },
    });
    expect(overlays[2]).toMatchObject({
      type: 'text',
      text: 'Bet: 9',
      point: { x: 100, y: 80 },
    });
    expect(overlays[3]).toMatchObject({
      type: 'marker',
      point: { x: 70, y: 100 },
      style: { label: 'D', shape: 'circle', fontName: LABEL_FONT_NAME },
    });
  });

  it('treats unrelated raw-var churn as overlay-equal when projected output is unchanged', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      tableOverlays: {
        items: [{ kind: 'globalVar', varName: 'pot', label: 'Pot', position: 'tableCenter' }],
      },
    });

    const first = projectTableOverlaySurface({
      projection: makeProjection({
        source: {
          globalVars: [asVar('pot', 42), asVar('round', 1)],
        },
      }),
      worldLayout: makeWorldLayout(positions),
      visualConfigProvider: provider,
    });
    const second = projectTableOverlaySurface({
      projection: makeProjection({
        source: {
          globalVars: [asVar('pot', 42), asVar('round', 2)],
        },
      }),
      worldLayout: makeWorldLayout(positions),
      visualConfigProvider: provider,
    });

    expect(tableOverlaySurfaceNodesEqual(first, second)).toBe(true);
  });

  it('reprojects anchored nodes when world-layout anchors move without semantic changes', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      tableOverlays: {
        playerSeatAnchorZones: ['seat:0', 'seat:1'],
        items: [
          { kind: 'globalVar', varName: 'pot', label: 'Pot', position: 'tableCenter' },
          { kind: 'perPlayerVar', varName: 'bet', label: 'Bet', position: 'playerSeat' },
        ],
      },
    });
    const projection = makeProjection({
      source: {
        globalVars: [asVar('pot', 42)],
        playerVars: new Map([
          [asPlayerId(0), [asVar('bet', 5)]],
          [asPlayerId(1), [asVar('bet', 9)]],
        ]),
      },
    });

    const first = projectTableOverlaySurface({
      projection,
      worldLayout: makeWorldLayout(positions),
      visualConfigProvider: provider,
    });
    const second = projectTableOverlaySurface({
      projection,
      worldLayout: makeWorldLayout(new Map([
        ['shared:center', { x: 0, y: 0 }],
        ['seat:0', { x: -140, y: 130 }],
        ['seat:1', { x: 140, y: 130 }],
      ]), {
        minX: -160,
        minY: -90,
        maxX: 160,
        maxY: 90,
      }),
      visualConfigProvider: provider,
    });

    expect(tableOverlaySurfaceNodesEqual(first, second)).toBe(false);
    expect(second[0]).toMatchObject({
      type: 'text',
      text: 'Pot: 42',
      point: { x: 0, y: 0 },
    });
    expect(second[1]).toMatchObject({
      type: 'text',
      text: 'Bet: 5',
      point: { x: -140, y: 130 },
    });
  });
});
