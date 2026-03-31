import { describe, expect, it } from 'vitest';
import type { GameDef, ZoneDef } from '@ludoforge/engine/runtime';

import { VisualConfigProvider } from '../../src/config/visual-config-provider.js';
import type { Position } from '../../src/canvas/geometry.js';
import {
  buildEditorPresentationScene,
  type BuildEditorPresentationSceneOptions,
} from '../../src/map-editor/map-editor-presentation-adapter.js';

function makeZoneDef(overrides: Record<string, unknown> & { id: string }): ZoneDef {
  return {
    owner: 'none',
    visibility: 'public',
    ordering: 'set',
    ...overrides,
  } as unknown as ZoneDef;
}

function makeGameDef(zones: readonly ZoneDef[]): GameDef {
  return {
    metadata: { id: 'test-game', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones,
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [] },
  } as unknown as GameDef;
}

function makeOptions(
  overrides: Partial<BuildEditorPresentationSceneOptions> = {},
): BuildEditorPresentationSceneOptions {
  return {
    gameDef: makeGameDef([]),
    visualConfigProvider: new VisualConfigProvider(null),
    positions: new Map(),
    zoneVertices: new Map(),
    connectionAnchors: new Map(),
    connectionRoutes: new Map(),
    selectedZoneId: null,
    ...overrides,
  };
}

describe('buildEditorPresentationScene', () => {
  it('returns empty scene when gameDef has no zones', () => {
    const scene = buildEditorPresentationScene(makeOptions());

    expect(scene.zones).toEqual([]);
    expect(scene.adjacencies).toEqual([]);
    expect(scene.connectionRoutes).toEqual([]);
    expect(scene.junctions).toEqual([]);
    expect(scene.tokens).toEqual([]);
    expect(scene.overlays).toEqual([]);
    expect(scene.regions).toEqual([]);
  });

  it('produces one zone node per visible zone def', () => {
    const zones = [
      makeZoneDef({ id: 'zone-a', category: 'province' }),
      makeZoneDef({ id: 'zone-b', category: 'city' }),
    ];
    const positions = new Map<string, Position>([
      ['zone-a', { x: 100, y: 200 }],
      ['zone-b', { x: 300, y: 400 }],
    ]);

    const scene = buildEditorPresentationScene(
      makeOptions({ gameDef: makeGameDef(zones), positions }),
    );

    expect(scene.zones).toHaveLength(2);
    expect(scene.zones.map((z) => z.id)).toEqual(['zone-a', 'zone-b']);
  });

  it('sets editor defaults: ownerID null, isSelectable true, badge null, hiddenStackCount 0', () => {
    const zones = [makeZoneDef({ id: 'zone-a' })];
    const positions = new Map<string, Position>([['zone-a', { x: 0, y: 0 }]]);

    const scene = buildEditorPresentationScene(
      makeOptions({ gameDef: makeGameDef(zones), positions }),
    );

    const zone = scene.zones[0]!;
    expect(zone.ownerID).toBeNull();
    expect(zone.isSelectable).toBe(true);
    expect(zone.render.badge).toBeNull();
    expect(zone.render.hiddenStackCount).toBe(0);
    expect(zone.render.markersLabel.visible).toBe(false);
    expect(zone.render.markersLabel.text).toBe('');
  });

  it('applies selection highlight stroke to selected zone', () => {
    const zones = [
      makeZoneDef({ id: 'zone-a' }),
      makeZoneDef({ id: 'zone-b' }),
    ];
    const positions = new Map<string, Position>([
      ['zone-a', { x: 0, y: 0 }],
      ['zone-b', { x: 100, y: 100 }],
    ]);

    const scene = buildEditorPresentationScene(
      makeOptions({
        gameDef: makeGameDef(zones),
        positions,
        selectedZoneId: 'zone-a',
      }),
    );

    const selected = scene.zones.find((z) => z.id === 'zone-a')!;
    const unselected = scene.zones.find((z) => z.id === 'zone-b')!;

    expect(selected.render.stroke.color).toBe('#facc15');
    expect(selected.render.stroke.width).toBe(3);
    expect(unselected.render.stroke.color).toBe('#111827');
    expect(unselected.render.stroke.width).toBe(1);
  });

  it('tokens is always empty array', () => {
    const zones = [makeZoneDef({ id: 'zone-a' })];
    const positions = new Map<string, Position>([['zone-a', { x: 0, y: 0 }]]);

    const scene = buildEditorPresentationScene(
      makeOptions({ gameDef: makeGameDef(zones), positions }),
    );

    expect(scene.tokens).toEqual([]);
  });

  it('overlays is always empty array', () => {
    const zones = [makeZoneDef({ id: 'zone-a' })];
    const positions = new Map<string, Position>([['zone-a', { x: 0, y: 0 }]]);

    const scene = buildEditorPresentationScene(
      makeOptions({ gameDef: makeGameDef(zones), positions }),
    );

    expect(scene.overlays).toEqual([]);
  });

  it('produces adjacencies from zone adjacentTo pairs', () => {
    const zones = [
      makeZoneDef({
        id: 'zone-a',
        adjacentTo: [{ to: 'zone-b' }],
      }),
      makeZoneDef({
        id: 'zone-b',
        adjacentTo: [{ to: 'zone-a' }],
      }),
    ];
    const positions = new Map<string, Position>([
      ['zone-a', { x: 0, y: 0 }],
      ['zone-b', { x: 100, y: 0 }],
    ]);

    const scene = buildEditorPresentationScene(
      makeOptions({ gameDef: makeGameDef(zones), positions }),
    );

    expect(scene.adjacencies).toHaveLength(1);
    expect(scene.adjacencies[0]).toEqual({
      from: 'zone-a',
      to: 'zone-b',
      category: null,
      isHighlighted: false,
    });
  });

  it('deduplicates bidirectional adjacency pairs', () => {
    const zones = [
      makeZoneDef({
        id: 'zone-a',
        adjacentTo: [{ to: 'zone-b' }, { to: 'zone-c' }],
      }),
      makeZoneDef({
        id: 'zone-b',
        adjacentTo: [{ to: 'zone-a' }],
      }),
      makeZoneDef({ id: 'zone-c', adjacentTo: [{ to: 'zone-a' }] }),
    ];
    const positions = new Map<string, Position>([
      ['zone-a', { x: 0, y: 0 }],
      ['zone-b', { x: 100, y: 0 }],
      ['zone-c', { x: 200, y: 0 }],
    ]);

    const scene = buildEditorPresentationScene(
      makeOptions({ gameDef: makeGameDef(zones), positions }),
    );

    expect(scene.adjacencies).toHaveLength(2);
  });

  it('preserves adjacency category from zone defs', () => {
    const zones = [
      makeZoneDef({
        id: 'zone-a',
        adjacentTo: [{ to: 'zone-b', category: 'trail' }],
      }),
      makeZoneDef({ id: 'zone-b' }),
    ];
    const positions = new Map<string, Position>([
      ['zone-a', { x: 0, y: 0 }],
      ['zone-b', { x: 100, y: 0 }],
    ]);

    const scene = buildEditorPresentationScene(
      makeOptions({ gameDef: makeGameDef(zones), positions }),
    );

    expect(scene.adjacencies[0]!.category).toBe('trail');
  });

  it('excludes aux and internal zones', () => {
    const zones = [
      makeZoneDef({ id: 'visible' }),
      makeZoneDef({ id: 'aux-zone', zoneKind: 'aux' }),
      makeZoneDef({ id: 'internal-zone', isInternal: true }),
    ];
    const positions = new Map<string, Position>([
      ['visible', { x: 0, y: 0 }],
      ['aux-zone', { x: 100, y: 0 }],
      ['internal-zone', { x: 200, y: 0 }],
    ]);

    const scene = buildEditorPresentationScene(
      makeOptions({ gameDef: makeGameDef(zones), positions }),
    );

    expect(scene.zones).toHaveLength(1);
    expect(scene.zones[0]!.id).toBe('visible');
  });

  it('overrides zone vertices from zoneVertices map', () => {
    const zones = [makeZoneDef({ id: 'zone-a', category: 'province' })];
    const positions = new Map<string, Position>([['zone-a', { x: 0, y: 0 }]]);

    const customVertices = [0, 0, 100, 0, 100, 100, 0, 100];
    const zoneVertices = new Map<string, readonly number[]>([
      ['zone-a', customVertices],
    ]);

    const provider = new VisualConfigProvider({
      version: 1,
      zones: {
        categoryStyles: {
          province: { shape: 'polygon', vertices: [10, 10, 20, 20, 30, 30] },
        },
      },
    });

    const scene = buildEditorPresentationScene(
      makeOptions({
        gameDef: makeGameDef(zones),
        positions,
        zoneVertices,
        visualConfigProvider: provider,
      }),
    );

    const zone = scene.zones[0]!;
    expect(zone.visual.vertices).toEqual(customVertices);
  });

  it('uses visual config vertices when zoneVertices map has no entry', () => {
    const zones = [makeZoneDef({ id: 'zone-a', category: 'province' })];
    const positions = new Map<string, Position>([['zone-a', { x: 0, y: 0 }]]);

    const configVertices = [10, 10, 20, 20, 30, 30];
    const provider = new VisualConfigProvider({
      version: 1,
      zones: {
        categoryStyles: {
          province: { shape: 'polygon', vertices: configVertices },
        },
      },
    });

    const scene = buildEditorPresentationScene(
      makeOptions({
        gameDef: makeGameDef(zones),
        positions,
        visualConfigProvider: provider,
      }),
    );

    const zone = scene.zones[0]!;
    expect(zone.visual.vertices).toEqual(configVertices);
  });

  it('produces nameLabel with displayName', () => {
    const zones = [makeZoneDef({ id: 'my-zone' })];
    const positions = new Map<string, Position>([['my-zone', { x: 0, y: 0 }]]);

    const scene = buildEditorPresentationScene(
      makeOptions({ gameDef: makeGameDef(zones), positions }),
    );

    const zone = scene.zones[0]!;
    expect(zone.render.nameLabel.text).toBe('My Zone');
    expect(zone.render.nameLabel.visible).toBe(true);
  });

  it('uses visual config zone label override when available', () => {
    const zones = [makeZoneDef({ id: 'zone-a' })];
    const positions = new Map<string, Position>([['zone-a', { x: 0, y: 0 }]]);

    const provider = new VisualConfigProvider({
      version: 1,
      zones: {
        overrides: { 'zone-a': { label: 'Custom Label' } },
      },
    });

    const scene = buildEditorPresentationScene(
      makeOptions({
        gameDef: makeGameDef(zones),
        positions,
        visualConfigProvider: provider,
      }),
    );

    expect(scene.zones[0]!.displayName).toBe('Custom Label');
    expect(scene.zones[0]!.render.nameLabel.text).toBe('Custom Label');
  });

  it('uses default fill color when visual config provides no color', () => {
    const zones = [makeZoneDef({ id: 'zone-a' })];
    const positions = new Map<string, Position>([['zone-a', { x: 0, y: 0 }]]);

    const scene = buildEditorPresentationScene(
      makeOptions({ gameDef: makeGameDef(zones), positions }),
    );

    expect(scene.zones[0]!.render.fillColor).toBe('#4d5c6d');
  });

  it('uses visual config fill color when provided', () => {
    const zones = [makeZoneDef({ id: 'zone-a', category: 'city' })];
    const positions = new Map<string, Position>([['zone-a', { x: 0, y: 0 }]]);

    const provider = new VisualConfigProvider({
      version: 1,
      zones: {
        categoryStyles: {
          city: { color: '#ff0000' },
        },
      },
    });

    const scene = buildEditorPresentationScene(
      makeOptions({
        gameDef: makeGameDef(zones),
        positions,
        visualConfigProvider: provider,
      }),
    );

    expect(scene.zones[0]!.render.fillColor).toBe('#ff0000');
  });

  it('preserves zone category and attributes', () => {
    const zones = [
      makeZoneDef({
        id: 'zone-a',
        category: 'province',
        attributes: { country: 'north', terrain: 'forest' },
      }),
    ];
    const positions = new Map<string, Position>([['zone-a', { x: 0, y: 0 }]]);

    const scene = buildEditorPresentationScene(
      makeOptions({ gameDef: makeGameDef(zones), positions }),
    );

    const zone = scene.zones[0]!;
    expect(zone.category).toBe('province');
    expect(zone.attributes).toEqual({ country: 'north', terrain: 'forest' });
  });

  it('populates regions when visual config has region boundary config', () => {
    const zones = [
      makeZoneDef({
        id: 'zone-a',
        category: 'province',
        attributes: { country: 'north' },
      }),
      makeZoneDef({
        id: 'zone-b',
        category: 'province',
        attributes: { country: 'north' },
      }),
    ];
    const positions = new Map<string, Position>([
      ['zone-a', { x: 0, y: 0 }],
      ['zone-b', { x: 100, y: 0 }],
    ]);

    const provider = new VisualConfigProvider({
      version: 1,
      zones: {
        categoryStyles: {
          province: { width: 80, height: 60 },
        },
      },
      regions: {
        groupByAttribute: 'country',
        styles: {
          north: { fillColor: '#00ff0026', label: 'North' },
        },
      },
    });

    const scene = buildEditorPresentationScene(
      makeOptions({
        gameDef: makeGameDef(zones),
        positions,
        visualConfigProvider: provider,
      }),
    );

    expect(scene.regions.length).toBeGreaterThan(0);
    expect(scene.regions[0]!.key).toBe('north');
    expect(scene.regions[0]!.label).toBe('North');
  });

  it('populates connectionRoutes and junctions when route data is provided', () => {
    const zones = [
      makeZoneDef({
        id: 'zone-a',
        category: 'city',
        adjacentTo: [{ to: 'route-ab' }],
      }),
      makeZoneDef({
        id: 'route-ab',
        category: 'connection',
        adjacentTo: [{ to: 'zone-a' }, { to: 'zone-b' }],
      }),
      makeZoneDef({
        id: 'zone-b',
        category: 'city',
        adjacentTo: [{ to: 'route-ab' }],
      }),
    ];

    const positions = new Map<string, Position>([
      ['zone-a', { x: 0, y: 0 }],
      ['route-ab', { x: 50, y: 0 }],
      ['zone-b', { x: 100, y: 0 }],
    ]);

    const provider = new VisualConfigProvider({
      version: 1,
      zones: {
        categoryStyles: {
          city: { shape: 'circle', width: 30, height: 30 },
          connection: { shape: 'connection' },
        },
      },
    });

    const scene = buildEditorPresentationScene(
      makeOptions({
        gameDef: makeGameDef(zones),
        positions,
        visualConfigProvider: provider,
      }),
    );

    expect(scene.connectionRoutes.length).toBeGreaterThanOrEqual(1);
    expect(scene.connectionRoutes[0]!.zoneId).toBe('route-ab');
  });
});
