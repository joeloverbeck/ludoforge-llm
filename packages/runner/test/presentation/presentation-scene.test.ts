import { asPlayerId, type AttributeValue } from '@ludoforge/engine/runtime';
import { describe, expect, it } from 'vitest';

import { LABEL_FONT_NAME } from '../../src/canvas/text/bitmap-font-registry.js';
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
        style: { color: '#f8fafc', fontSize: 12, fontName: LABEL_FONT_NAME },
        signature: 'text:pot',
      },
      {
        key: 'overlay:1:player:0',
        type: 'text',
        text: 'Bet: 5',
        point: { x: -100, y: 80 },
        style: { color: '#f8fafc', fontSize: 12, fontName: LABEL_FONT_NAME },
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
          fontName: LABEL_FONT_NAME,
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
      visual: { shape: 'hexagon', width: 120, height: 90, color: '#2a6e3f', connectionStyleKey: null },
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

  it('projects connection-shaped zones into connection routes while keeping route tokens visible', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      zones: {
        categoryStyles: {
          province: { shape: 'rectangle', width: 120, height: 90, color: '#2a6e3f' },
          loc: { shape: 'connection', connectionStyleKey: 'highway' },
        },
        connectionStyles: {
          highway: { strokeWidth: 8, strokeColor: '#8b7355', strokeAlpha: 0.8 },
        },
        markerBadge: {
          markerId: 'support',
          colorMap: {
            activeOpposition: { color: '#dc2626', abbreviation: 'AO' },
          },
        },
      },
    });

    const scene = buildPresentationScene({
      runnerFrame: makeRunnerFrame({
        zones: [
          makeZone('alpha:none', {}, { category: 'province' }),
          makeZone('beta:none', {}, { category: 'province' }),
          makeZone('loc-alpha-beta:none', {}, {
            category: 'loc',
            markers: [
              { id: 'support', state: 'activeOpposition', possibleStates: [] },
              { id: 'sabotage', state: 'sabotage', possibleStates: [] },
            ],
          }),
        ],
        adjacencies: [
          { from: 'loc-alpha-beta:none', to: 'alpha:none', category: null, isHighlighted: false },
          { from: 'loc-alpha-beta:none', to: 'beta:none', category: null, isHighlighted: false },
        ],
        tokens: [
          { id: 'token:route', type: 'troop', zoneID: 'loc-alpha-beta:none', ownerID: asPlayerId(0), factionId: null, faceUp: true, properties: {}, isSelectable: false, isSelected: false },
        ],
      }),
      overlays: [],
      positions: new Map([
        ['alpha:none', { x: 0, y: 0 }],
        ['beta:none', { x: 200, y: 0 }],
        ['loc-alpha-beta:none', { x: 100, y: 0 }],
      ]),
      visualConfigProvider: provider,
      tokenRenderStyleProvider: new VisualConfigTokenRenderStyleProvider(provider),
      interactionHighlights: { zoneIDs: [], tokenIDs: [] },
    });

    expect(scene.zones.map((zone) => zone.id)).toEqual(['alpha:none', 'beta:none']);
    expect(scene.connectionRoutes).toEqual([
      expect.objectContaining({
        zoneId: 'loc-alpha-beta:none',
        path: [
          { kind: 'zone', id: 'alpha:none', position: { x: 0, y: 0 } },
          { kind: 'zone', id: 'beta:none', position: { x: 200, y: 0 } },
        ],
        connectionStyleKey: 'highway',
        zone: expect.objectContaining({
          render: expect.objectContaining({
            markersLabel: expect.objectContaining({
              text: 'Sabotage:sabotage',
              visible: true,
            }),
            badge: {
              text: 'AO',
              color: '#dc2626',
              x: 46,
              y: 26,
              width: 30,
              height: 20,
            },
          }),
        }),
      }),
    ]);
    expect(scene.connectionRoutes[0]).not.toHaveProperty('connectedConnectionIds');
    expect(scene.adjacencies).toEqual([]);
    expect(scene.tokens).toEqual([
      expect.objectContaining({
        zoneId: 'loc-alpha-beta:none',
      }),
    ]);
  });

  it('projects connection routes without requiring a layout position for the connection zone', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      zones: {
        categoryStyles: {
          province: { shape: 'rectangle', width: 120, height: 90, color: '#2a6e3f' },
          loc: { shape: 'connection', connectionStyleKey: 'highway' },
        },
        connectionStyles: {
          highway: { strokeWidth: 8, strokeColor: '#8b7355', strokeAlpha: 0.8 },
        },
      },
    });

    const scene = buildPresentationScene({
      runnerFrame: makeRunnerFrame({
        zones: [
          makeZone('alpha:none'),
          makeZone('beta:none'),
          makeZone('loc-alpha-beta:none', {}, {
            category: 'loc',
            markers: [{ id: 'sabotage', state: 'sabotage', possibleStates: [] }],
          }),
        ],
        adjacencies: [
          { from: 'loc-alpha-beta:none', to: 'alpha:none', category: null, isHighlighted: false },
          { from: 'loc-alpha-beta:none', to: 'beta:none', category: null, isHighlighted: false },
        ],
        tokens: [
          { id: 'token:route', type: 'troop', zoneID: 'loc-alpha-beta:none', ownerID: asPlayerId(0), factionId: null, faceUp: true, properties: {}, isSelectable: false, isSelected: false },
        ],
      }),
      overlays: [],
      positions: new Map([
        ['alpha:none', { x: 0, y: 0 }],
        ['beta:none', { x: 200, y: 0 }],
      ]),
      visualConfigProvider: provider,
      tokenRenderStyleProvider: new VisualConfigTokenRenderStyleProvider(provider),
      interactionHighlights: { zoneIDs: [], tokenIDs: [] },
    });

    expect(scene.zones.map((zone) => zone.id)).toEqual(['alpha:none', 'beta:none']);
    expect(scene.connectionRoutes).toEqual([
      expect.objectContaining({
        zoneId: 'loc-alpha-beta:none',
        path: [
          { kind: 'zone', id: 'alpha:none', position: { x: 0, y: 0 } },
          { kind: 'zone', id: 'beta:none', position: { x: 200, y: 0 } },
        ],
      }),
    ]);
    expect(scene.tokens).toEqual([
      expect.objectContaining({
        zoneId: 'loc-alpha-beta:none',
      }),
    ]);
  });

  it('uses provider-owned unified route definitions for otherwise ambiguous connection routes', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      zones: {
        categoryStyles: {
          province: { shape: 'rectangle', width: 120, height: 90, color: '#2a6e3f' },
          loc: { shape: 'connection', connectionStyleKey: 'mekong' },
        },
        connectionAnchors: {
          'long-phu': { x: 220, y: -20 },
        },
        connectionStyles: {
          mekong: { strokeWidth: 12, strokeColor: '#4a7a8c', wavy: true, waveAmplitude: 4, waveFrequency: 0.08 },
        },
        connectionRoutes: {
          'loc-can-tho-long-phu:none': {
            points: [
              { kind: 'zone', zoneId: 'can-tho:none' },
              { kind: 'anchor', anchorId: 'long-phu' },
            ],
            segments: [
              { kind: 'quadratic', control: { kind: 'position', x: 120, y: -40 } },
            ],
          },
        },
      },
    });

    const scene = buildPresentationScene({
      runnerFrame: makeRunnerFrame({
        zones: [
          makeZone('can-tho:none', {}, { category: 'province' }),
          makeZone('ba-xuyen:none', {}, { category: 'province' }),
          makeZone('kien-hoa-vinh-binh:none', {}, { category: 'province' }),
          makeZone('loc-can-tho-long-phu:none', { terrainTags: ['mekong'] }, { category: 'loc' }),
        ],
        adjacencies: [
          { from: 'loc-can-tho-long-phu:none', to: 'can-tho:none', category: null, isHighlighted: false },
          { from: 'loc-can-tho-long-phu:none', to: 'ba-xuyen:none', category: null, isHighlighted: false },
          { from: 'loc-can-tho-long-phu:none', to: 'kien-hoa-vinh-binh:none', category: null, isHighlighted: false },
        ],
      }),
      overlays: [],
      positions: new Map([
        ['can-tho:none', { x: 0, y: 0 }],
        ['ba-xuyen:none', { x: 100, y: 40 }],
        ['kien-hoa-vinh-binh:none', { x: 200, y: 0 }],
        ['loc-can-tho-long-phu:none', { x: 100, y: 0 }],
      ]),
      visualConfigProvider: provider,
      tokenRenderStyleProvider: new VisualConfigTokenRenderStyleProvider(provider),
      interactionHighlights: { zoneIDs: [], tokenIDs: [] },
    });

    expect(scene.connectionRoutes).toEqual([
      expect.objectContaining({
        zoneId: 'loc-can-tho-long-phu:none',
        path: [
          { kind: 'zone', id: 'can-tho:none', position: { x: 0, y: 0 } },
          { kind: 'anchor', id: 'long-phu', position: { x: 220, y: -20 } },
        ],
        segments: [
          {
            kind: 'quadratic',
            controlPoint: { kind: 'position', id: null, position: { x: 120, y: -40 } },
          },
        ],
        touchingZoneIds: ['ba-xuyen:none', 'kien-hoa-vinh-binh:none'],
        connectionStyleKey: 'mekong',
      }),
    ]);
    expect(scene.zones.map((zone) => zone.id)).toEqual([
      'can-tho:none',
      'ba-xuyen:none',
      'kien-hoa-vinh-binh:none',
    ]);
  });

  it('threads explicit multi-point connection routes through the scene pipeline', () => {
    const provider = new VisualConfigProvider({
      version: 1,
      zones: {
        categoryStyles: {
          province: { shape: 'rectangle', width: 120, height: 90, color: '#2a6e3f' },
          loc: { shape: 'connection', connectionStyleKey: 'highway' },
        },
        connectionAnchors: {
          'an-loc': { x: 120, y: -20 },
          'ban-me-thuot': { x: 240, y: -10 },
        },
        connectionStyles: {
          highway: { strokeWidth: 8, strokeColor: '#8b7355' },
        },
        connectionRoutes: {
          'loc-saigon-an-loc-ban-me-thuot:none': {
            points: [
              { kind: 'zone', zoneId: 'saigon:none' },
              { kind: 'anchor', anchorId: 'an-loc' },
              { kind: 'anchor', anchorId: 'ban-me-thuot' },
            ],
            segments: [
              { kind: 'straight' },
              { kind: 'quadratic', control: { kind: 'position', x: 180, y: -40 } },
            ],
          },
        },
      },
    });

    const scene = buildPresentationScene({
      runnerFrame: makeRunnerFrame({
        zones: [
          makeZone('saigon:none', {}, { category: 'province' }),
          makeZone('phu-bon:none', {}, { category: 'province' }),
          makeZone('loc-saigon-an-loc-ban-me-thuot:none', { terrainTags: ['highway'] }, { category: 'loc' }),
        ],
        adjacencies: [
          { from: 'loc-saigon-an-loc-ban-me-thuot:none', to: 'saigon:none', category: null, isHighlighted: false },
          { from: 'loc-saigon-an-loc-ban-me-thuot:none', to: 'phu-bon:none', category: null, isHighlighted: false },
        ],
      }),
      overlays: [],
      positions: new Map([
        ['saigon:none', { x: 0, y: 0 }],
        ['phu-bon:none', { x: 260, y: 0 }],
        ['loc-saigon-an-loc-ban-me-thuot:none', { x: 120, y: 0 }],
      ]),
      visualConfigProvider: provider,
      tokenRenderStyleProvider: new VisualConfigTokenRenderStyleProvider(provider),
      interactionHighlights: { zoneIDs: [], tokenIDs: [] },
    });

    expect(scene.connectionRoutes).toEqual([
      expect.objectContaining({
        zoneId: 'loc-saigon-an-loc-ban-me-thuot:none',
        path: [
          { kind: 'zone', id: 'saigon:none', position: { x: 0, y: 0 } },
          { kind: 'anchor', id: 'an-loc', position: { x: 120, y: -20 } },
          { kind: 'anchor', id: 'ban-me-thuot', position: { x: 240, y: -10 } },
        ],
        segments: [
          { kind: 'straight' },
          {
            kind: 'quadratic',
            controlPoint: { kind: 'position', id: null, position: { x: 180, y: -40 } },
          },
        ],
        touchingZoneIds: ['phu-bon:none'],
        connectionStyleKey: 'highway',
      }),
    ]);
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
