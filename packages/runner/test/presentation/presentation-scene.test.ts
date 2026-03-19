import { asPlayerId, type AttributeValue } from '@ludoforge/engine/runtime';
import { describe, expect, it } from 'vitest';

import { VisualConfigProvider } from '../../src/config/visual-config-provider.js';
import { VisualConfigTokenRenderStyleProvider } from '../../src/canvas/renderers/token-render-style-provider.js';
import { buildPresentationScene } from '../../src/presentation/presentation-scene.js';
import type { RenderModel, RenderVariable, RenderZone } from '../../src/model/render-model.js';

function makeZone(
  id: string,
  attributes: Readonly<Record<string, AttributeValue>> = {},
  overrides: Partial<RenderZone> = {},
): RenderZone {
  return {
    id,
    displayName: id,
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
    visual: { shape: 'rectangle', width: 100, height: 80, color: null },
    metadata: {},
    ...overrides,
  };
}

function asVar(name: string, value: number | boolean): RenderVariable {
  return { name, value, displayName: name };
}

function makeRenderModel(overrides: Partial<RenderModel> = {}): RenderModel {
  return {
    zones: [
      makeZone('shared:center'),
      makeZone('seat:0', {}, { ownerID: asPlayerId(0) }),
      makeZone('seat:1', {}, { ownerID: asPlayerId(1) }),
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
      { id: asPlayerId(0), displayName: 'P0', isHuman: true, isActive: true, isEliminated: false, factionId: null },
      { id: asPlayerId(1), displayName: 'P1', isHuman: true, isActive: false, isEliminated: false, factionId: null },
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

  it('resolves overlay nodes from render model, positions, and visual config before renderer mutation', () => {
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

    const scene = buildPresentationScene({
      renderModel: makeRenderModel({
        globalVars: [asVar('pot', 42), asVar('dealerSeat', 1)],
        playerVars: new Map([
          [asPlayerId(0), [asVar('bet', 5)]],
          [asPlayerId(1), [asVar('bet', 9)]],
        ]),
      }),
      positions,
      visualConfigProvider: provider,
      tokenRenderStyleProvider: new VisualConfigTokenRenderStyleProvider(provider),
      interactionHighlights: { zoneIDs: [], tokenIDs: [] },
    });

    expect(scene.overlays).toHaveLength(4);
    expect(scene.overlays[0]).toMatchObject({
      type: 'text',
      text: 'Pot: 42',
      point: { x: 0, y: 106.66666666666667 },
    });
    expect(scene.overlays[1]).toMatchObject({
      type: 'text',
      text: 'Bet: 5',
      point: { x: -100, y: 80 },
    });
    expect(scene.overlays[2]).toMatchObject({
      type: 'text',
      text: 'Bet: 9',
      point: { x: 100, y: 80 },
    });
    expect(scene.overlays[3]).toMatchObject({
      type: 'marker',
      point: { x: 70, y: 100 },
    });
  });

  it('derives zone scene nodes from visual config instead of passing through render-model zone visuals', () => {
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

    const renderModel = makeRenderModel({
      zones: [
        makeZone('zone:a', { country: 'southVietnam' }, {
          displayName: 'Mixed Display Name',
          visual: { shape: 'rectangle', width: 80, height: 60, color: '#ff00ff' },
        }),
      ],
    });

    const scene = buildPresentationScene({
      renderModel,
      positions,
      visualConfigProvider: provider,
      tokenRenderStyleProvider: new VisualConfigTokenRenderStyleProvider(provider),
      interactionHighlights: { zoneIDs: [], tokenIDs: [] },
    });

    expect(scene.zones).toHaveLength(1);
    expect(scene.zones[0]).toMatchObject({
      id: 'zone:a',
      displayName: 'Configured Zone A',
      visual: { shape: 'hexagon', width: 120, height: 90, color: '#2a6e3f' },
      markers: [],
    });
    expect(scene.zones).not.toBe(renderModel.zones);
    expect(scene.zones[0]).not.toBe(renderModel.zones[0]);
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
      renderModel: makeRenderModel({
        zones: [
          makeZone('zone:a', { country: 'southVietnam' }, { visual: { shape: 'circle', width: 120, height: 90, color: null } }),
          makeZone('zone:b', { country: 'southVietnam' }, { visual: { shape: 'circle', width: 80, height: 60, color: null } }),
        ],
      }),
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
    expect(scene.regions[0]?.cornerPoints).toContainEqual({ x: -20, y: 0 });
    expect(scene.regions[0]?.cornerPoints).toContainEqual({ x: 320, y: 100 });
  });

  it('carries interaction highlight sets as part of the scene contract', () => {
    const provider = new VisualConfigProvider(null);
    const scene = buildPresentationScene({
      renderModel: makeRenderModel(),
      positions,
      visualConfigProvider: provider,
      tokenRenderStyleProvider: new VisualConfigTokenRenderStyleProvider(provider),
      interactionHighlights: { zoneIDs: ['shared:center'], tokenIDs: ['token:1'] },
    });

    expect(scene.highlightedZoneIDs.has('shared:center')).toBe(true);
    expect(scene.highlightedTokenIDs.has('token:1')).toBe(true);
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
      renderModel: makeRenderModel({
        zones: [makeZone('zone:a')],
        tokens: [
          { id: 'token:1', type: 'troop', zoneID: 'zone:a', ownerID: asPlayerId(0), factionId: null, faceUp: true, properties: {}, isSelectable: false, isSelected: false },
          { id: 'token:2', type: 'troop', zoneID: 'zone:a', ownerID: asPlayerId(0), factionId: null, faceUp: true, properties: {}, isSelectable: false, isSelected: false },
          { id: 'token:3', type: 'support', zoneID: 'zone:a', ownerID: asPlayerId(0), factionId: null, faceUp: true, properties: {}, isSelectable: false, isSelected: false },
        ],
      }),
      positions,
      visualConfigProvider: provider,
      tokenRenderStyleProvider: new VisualConfigTokenRenderStyleProvider(provider),
      interactionHighlights: { zoneIDs: [], tokenIDs: [] },
    });

    expect(scene.tokens).toHaveLength(2);
    expect(scene.tokens[0]).toMatchObject({
      stackCount: 2,
      zoneId: 'zone:a',
      offset: { x: 0, y: 0 },
    });
    expect(scene.tokens[1]).toMatchObject({
      stackCount: 1,
      zoneId: 'zone:a',
      offset: { x: 0, y: 48 },
    });
    expect(scene.tokens[0]?.signature).not.toBe(scene.tokens[1]?.signature);
  });
});
