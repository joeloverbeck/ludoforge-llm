import { asPlayerId, type AttributeValue } from '@ludoforge/engine/runtime';
import { describe, expect, it } from 'vitest';

import { VisualConfigProvider } from '../../src/config/visual-config-provider.js';
import { VisualConfigTokenRenderStyleProvider } from '../../src/canvas/renderers/token-render-style-provider.js';
import { buildPresentationScene } from '../../src/presentation/presentation-scene.js';
import type { RunnerFrame, RunnerZone } from '../../src/model/runner-frame.js';
import type { TableOverlaySurfaceNode } from '../../src/presentation/project-table-overlay-surface.js';

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

describe('buildPresentationScene', () => {
  const positions = new Map([
    ['shared:center', { x: 0, y: 0 }],
    ['seat:0', { x: -100, y: 100 }],
    ['seat:1', { x: 100, y: 100 }],
    ['zone:a', { x: 50, y: 50 }],
    ['zone:b', { x: 250, y: 50 }],
  ]);

  it('renders preprojected overlay nodes before renderer mutation', () => {
    const provider = new VisualConfigProvider({ version: 1 });
    const overlays: readonly TableOverlaySurfaceNode[] = [
      {
        key: 'overlay:0',
        type: 'text',
        text: 'Pot: 42',
        point: { x: 0, y: 40 },
        style: { color: '#f8fafc', fontSize: 12, fontFamily: 'monospace' },
        signature: 'text:pot',
      },
      {
        key: 'overlay:1:player:0',
        type: 'text',
        text: 'Bet: 5',
        point: { x: -100, y: 80 },
        style: { color: '#f8fafc', fontSize: 12, fontFamily: 'monospace' },
        signature: 'text:bet:0',
      },
      {
        key: 'overlay:2',
        type: 'marker',
        point: { x: 70, y: 100 },
        style: {
          color: '#fbbf24',
          shape: 'circle',
          label: 'D',
          fontSize: 11,
          fontFamily: 'monospace',
          textColor: '#111827',
        },
        signature: 'marker:dealer',
      },
    ];

    const scene = buildPresentationScene({
      runnerFrame: makeRunnerFrame(),
      overlays,
      positions,
      visualConfigProvider: provider,
      tokenRenderStyleProvider: new VisualConfigTokenRenderStyleProvider(provider),
      interactionHighlights: { zoneIDs: [], tokenIDs: [] },
    });

    expect(scene.overlays).toHaveLength(3);
    expect(scene.overlays[0]).toMatchObject({ type: 'text', text: 'Pot: 42' });
    expect(scene.overlays[1]).toMatchObject({ type: 'text', text: 'Bet: 5' });
    expect(scene.overlays[2]).toMatchObject({ type: 'marker' });
  });

  it('derives zone scene nodes from visual config instead of semantic frame zone visuals', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      zones: {
        categoryStyles: {
          province: { shape: 'hexagon', width: 120, height: 90, color: '#2a6e3f' },
        },
        overrides: {
          'zone:a': { label: 'Configured Zone A' },
        },
      },
    });

    const runnerFrame = makeRunnerFrame({
      zones: [makeZone('zone:a', { country: 'southVietnam' })],
    });

    const scene = buildPresentationScene({
      runnerFrame,
      overlays: [],
      positions,
      visualConfigProvider: provider,
      tokenRenderStyleProvider: new VisualConfigTokenRenderStyleProvider(provider),
      interactionHighlights: { zoneIDs: [], tokenIDs: [] },
    });

    expect(scene.zones[0]).toMatchObject({
      id: 'zone:a',
      displayName: 'Configured Zone A',
      visual: { shape: 'hexagon', width: 120, height: 90, color: '#2a6e3f' },
      render: { fillColor: '#2a6e3f', nameLabel: { text: 'Configured Zone A' } },
    });
    expect(scene.zones).not.toBe(runnerFrame.zones);
    expect(scene.zones[0]).not.toBe(runnerFrame.zones[0]);
  });

  it('resolves region nodes from provider-resolved zone visuals inside the scene layer', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      zones: {
        categoryStyles: {
          province: { shape: 'rectangle', width: 140, height: 100 },
        },
      },
      regions: {
        styles: {
          southVietnam: {
            fillColor: '#2a6e3f',
            borderColor: '#4a9e6f',
            label: 'South Vietnam',
          },
        },
      },
    });

    const scene = buildPresentationScene({
      runnerFrame: makeRunnerFrame({
        zones: [
          makeZone('zone:a', { country: 'southVietnam' }),
          makeZone('zone:b', { country: 'southVietnam' }),
        ],
      }),
      overlays: [],
      positions,
      visualConfigProvider: provider,
      tokenRenderStyleProvider: new VisualConfigTokenRenderStyleProvider(provider),
      interactionHighlights: { zoneIDs: [], tokenIDs: [] },
    });

    expect(scene.regions).toHaveLength(1);
    expect(scene.regions[0]).toMatchObject({
      key: 'southVietnam',
      label: 'South Vietnam',
      style: expect.objectContaining({ fillColor: '#2a6e3f' }),
    });
  });

  it('resolves interaction highlights into render-ready zone and token strokes', () => {
    const provider = new VisualConfigProvider(null);
    const scene = buildPresentationScene({
      runnerFrame: makeRunnerFrame({
        zones: [makeZone('shared:center')],
        tokens: [
          { id: 'token:1', type: 'troop', zoneID: 'shared:center', ownerID: asPlayerId(0), factionId: null, faceUp: true, properties: {}, isSelectable: false, isSelected: false },
        ],
      }),
      overlays: [],
      positions,
      visualConfigProvider: provider,
      tokenRenderStyleProvider: new VisualConfigTokenRenderStyleProvider(provider),
      interactionHighlights: { zoneIDs: ['shared:center'], tokenIDs: ['token:1'] },
    });

    expect(scene.zones[0]?.render.stroke).toEqual({ color: '#60a5fa', width: 3, alpha: 1 });
    expect(scene.tokens[0]?.render.stroke).toEqual({ color: '#60a5fa', width: 3, alpha: 1 });
  });

  it('resolves token grouping and offsets before renderer mutation', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      zones: {
        tokenLayouts: {
          presets: {
            provinceLanes: {
              mode: 'lanes',
              laneGap: 20,
              laneOrder: ['front', 'back'],
              lanes: {
                front: { anchor: 'center', pack: 'centeredRow', spacingX: 10, spacingY: 0 },
                back: { anchor: 'belowPreviousLane', pack: 'centeredRow', spacingX: 10, spacingY: 0 },
              },
            },
          },
          assignments: {
            byCategory: {
              province: 'provinceLanes',
            },
          },
        },
      },
      tokenTypes: {
        troop: { presentation: { lane: 'front', scale: 1 } },
        support: { presentation: { lane: 'back', scale: 1 } },
      },
    });

    const scene = buildPresentationScene({
      runnerFrame: makeRunnerFrame({
        zones: [makeZone('zone:a')],
        tokens: [
          { id: 'token:1', type: 'troop', zoneID: 'zone:a', ownerID: asPlayerId(0), factionId: null, faceUp: true, properties: {}, isSelectable: false, isSelected: false },
          { id: 'token:2', type: 'troop', zoneID: 'zone:a', ownerID: asPlayerId(0), factionId: null, faceUp: true, properties: {}, isSelectable: false, isSelected: false },
          { id: 'token:3', type: 'support', zoneID: 'zone:a', ownerID: asPlayerId(0), factionId: null, faceUp: true, properties: {}, isSelectable: false, isSelected: false },
        ],
      }),
      overlays: [],
      positions,
      visualConfigProvider: provider,
      tokenRenderStyleProvider: new VisualConfigTokenRenderStyleProvider(provider),
      interactionHighlights: { zoneIDs: [], tokenIDs: [] },
    });

    expect(scene.tokens).toHaveLength(2);
    expect(scene.tokens[0]).toMatchObject({ stackCount: 2, zoneId: 'zone:a', offset: { x: 0, y: 0 } });
    expect(scene.tokens[1]).toMatchObject({ stackCount: 1, zoneId: 'zone:a', offset: { x: 0, y: 48 } });
  });
});
