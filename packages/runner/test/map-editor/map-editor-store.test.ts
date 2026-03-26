import { describe, expect, it } from 'vitest';
import type { GameDef } from '@ludoforge/engine/runtime';

import { createMapEditorStore } from '../../src/map-editor/map-editor-store.js';
import type { ConnectionRouteDefinition, VisualConfig } from '../../src/map-editor/map-editor-types.js';

const GAME_DEF = {
  metadata: {
    id: 'editor-test',
    players: { min: 1, max: 4 },
  },
  zones: [
    { id: 'zone:a' },
    { id: 'zone:b' },
  ],
} as unknown as GameDef;

describe('createMapEditorStore', () => {
  it('initializes cloned document state from positions and visual config', () => {
    const initialPositions = makeInitialPositions();
    const visualConfig = makeVisualConfig();

    const store = createMapEditorStore(GAME_DEF, visualConfig, initialPositions);
    const state = store.getState();

    expect(state.zonePositions).toEqual(initialPositions);
    expect(state.zonePositions).not.toBe(initialPositions);
    expect(state.connectionAnchors).toEqual(new Map([
      ['bend-1', { x: 20, y: 30 }],
      ['curve-ctrl', { x: 45, y: 55 }],
    ]));
    expect(state.connectionRoutes.get('road:none')).toEqual(visualConfig.zones?.connectionRoutes?.['road:none']);
    expect(state.connectionRoutes.get('road:none')).not.toBe(visualConfig.zones?.connectionRoutes?.['road:none']);
    expect(state.dirty).toBe(false);
  });

  it('moveZone commits a zone update and records undo history', () => {
    const store = makeStore();
    const beforePositions = store.getState().zonePositions;

    store.getState().moveZone('zone:a', { x: 100, y: 200 });

    const state = store.getState();
    expect(state.zonePositions.get('zone:a')).toEqual({ x: 100, y: 200 });
    expect(state.zonePositions).not.toBe(beforePositions);
    expect(state.undoStack).toHaveLength(1);
    expect(state.undoStack[0]?.zonePositions.get('zone:a')).toEqual({ x: 0, y: 0 });
    expect(state.redoStack).toHaveLength(0);
    expect(state.dirty).toBe(true);
  });

  it('initializes route snapshots with optional zone endpoint anchor metadata intact', () => {
    const anchoredRoute: ConnectionRouteDefinition = {
      points: [
        { kind: 'zone', zoneId: 'zone:a', anchor: 45 },
        { kind: 'zone', zoneId: 'zone:b' },
      ],
      segments: [{ kind: 'straight' }],
    };
    const visualConfig = makeVisualConfig({
      routes: new Map([
        ['road:none', anchoredRoute],
      ]),
    });

    const store = createMapEditorStore(GAME_DEF, visualConfig, makeInitialPositions());
    const route = store.getState().connectionRoutes.get('road:none');

    expect(route).toEqual(anchoredRoute);
    expect(route).not.toBe(anchoredRoute);
    expect(route?.points[0]).not.toBe(anchoredRoute.points[0]);
  });

  it('undo and redo restore committed document state', () => {
    const store = makeStore();
    store.getState().moveZone('zone:a', { x: 100, y: 200 });

    store.getState().undo();
    expect(store.getState().zonePositions.get('zone:a')).toEqual({ x: 0, y: 0 });
    expect(store.getState().redoStack).toHaveLength(1);

    store.getState().redo();
    expect(store.getState().zonePositions.get('zone:a')).toEqual({ x: 100, y: 200 });
    expect(store.getState().undoStack).toHaveLength(1);
    expect(store.getState().redoStack).toHaveLength(0);
  });

  it('clears redo stack after a new committed edit', () => {
    const store = makeStore();
    store.getState().moveZone('zone:a', { x: 100, y: 200 });
    store.getState().undo();

    expect(store.getState().redoStack).toHaveLength(1);

    store.getState().moveAnchor('bend-1', { x: 70, y: 80 });

    expect(store.getState().redoStack).toHaveLength(0);
  });

  it('caps the undo stack at 50 entries', () => {
    const store = makeStore();

    for (let index = 1; index <= 51; index += 1) {
      store.getState().moveZone('zone:a', { x: index, y: index });
    }

    const state = store.getState();
    expect(state.undoStack).toHaveLength(50);
    expect(state.undoStack[0]?.zonePositions.get('zone:a')).toEqual({ x: 1, y: 1 });
    expect(state.undoStack[49]?.zonePositions.get('zone:a')).toEqual({ x: 50, y: 50 });
  });

  it('groups interaction previews into a single undo entry', () => {
    const store = makeStore();

    store.getState().beginInteraction();
    store.getState().previewZoneMove('zone:a', { x: 10, y: 10 });
    store.getState().previewZoneMove('zone:a', { x: 20, y: 20 });
    store.getState().previewZoneMove('zone:a', { x: 30, y: 30 });
    store.getState().commitInteraction();

    expect(store.getState().zonePositions.get('zone:a')).toEqual({ x: 30, y: 30 });
    expect(store.getState().undoStack).toHaveLength(1);
    expect(store.getState().undoStack[0]?.zonePositions.get('zone:a')).toEqual({ x: 0, y: 0 });
  });

  it('cancelInteraction restores the pre-interaction snapshot without creating history', () => {
    const store = makeStore();

    store.getState().beginInteraction();
    store.getState().previewAnchorMove('bend-1', { x: 90, y: 120 });
    expect(store.getState().connectionAnchors.get('bend-1')).toEqual({ x: 90, y: 120 });

    store.getState().cancelInteraction();

    expect(store.getState().connectionAnchors.get('bend-1')).toEqual({ x: 20, y: 30 });
    expect(store.getState().undoStack).toHaveLength(0);
    expect(store.getState().redoStack).toHaveLength(0);
    expect(store.getState().dirty).toBe(false);
  });

  it('markSaved clears dirty state and establishes a new saved baseline', () => {
    const store = makeStore();

    store.getState().moveZone('zone:a', { x: 100, y: 200 });
    expect(store.getState().dirty).toBe(true);

    store.getState().markSaved();
    expect(store.getState().dirty).toBe(false);

    store.getState().undo();
    expect(store.getState().zonePositions.get('zone:a')).toEqual({ x: 0, y: 0 });
    expect(store.getState().dirty).toBe(true);

    store.getState().redo();
    expect(store.getState().zonePositions.get('zone:a')).toEqual({ x: 100, y: 200 });
    expect(store.getState().dirty).toBe(false);
  });

  it('undoing back to the original saved snapshot clears dirty state', () => {
    const store = makeStore();

    store.getState().moveZone('zone:a', { x: 100, y: 200 });
    expect(store.getState().dirty).toBe(true);

    store.getState().undo();
    expect(store.getState().dirty).toBe(false);
  });

  it('preserves endpoint anchor metadata through saved snapshots and undo', () => {
    const store = makeStore({
      routes: new Map<string, ConnectionRouteDefinition>([
        ['road:none', {
          points: [
            { kind: 'zone', zoneId: 'zone:a', anchor: 135 },
            { kind: 'zone', zoneId: 'zone:b' },
          ],
          segments: [{ kind: 'straight' }],
        }],
      ]),
    });

    store.getState().markSaved();
    store.getState().moveZone('zone:a', { x: 100, y: 200 });
    store.getState().undo();

    expect(store.getState().connectionRoutes.get('road:none')).toEqual({
      points: [
        { kind: 'zone', zoneId: 'zone:a', anchor: 135 },
        { kind: 'zone', zoneId: 'zone:b' },
      ],
      segments: [{ kind: 'straight' }],
    });
    expect(store.getState().dirty).toBe(false);
  });

  it('insertWaypoint adds a generated anchor and splits the segment', () => {
    const store = makeStore({
      routes: new Map<string, ConnectionRouteDefinition>([
        ['road:none', {
          points: [
            { kind: 'zone', zoneId: 'zone:a' },
            { kind: 'zone', zoneId: 'zone:b' },
          ],
          segments: [{ kind: 'straight' }],
        }],
      ]),
    });

    store.getState().insertWaypoint('road:none', 0, { x: 25, y: 35 });

    const route = store.getState().connectionRoutes.get('road:none');
    expect(route?.points).toHaveLength(3);
    expect(route?.segments).toEqual([{ kind: 'straight' }, { kind: 'straight' }]);
    expect(route?.points[1]).toEqual({ kind: 'anchor', anchorId: 'road:none:waypoint:1' });
    expect(store.getState().connectionAnchors.get('road:none:waypoint:1')).toEqual({ x: 25, y: 35 });
  });

  it('removeWaypoint removes a non-endpoint anchor and merges surrounding segments', () => {
    const store = makeStore({
      anchors: new Map([
        ['bend-1', { x: 20, y: 30 }],
      ]),
      routes: new Map<string, ConnectionRouteDefinition>([
        ['road:none', {
          points: [
            { kind: 'zone', zoneId: 'zone:a' },
            { kind: 'anchor', anchorId: 'bend-1' },
            { kind: 'zone', zoneId: 'zone:b' },
          ],
          segments: [{ kind: 'straight' }, { kind: 'quadratic', control: { kind: 'position', x: 30, y: 35 } }],
        }],
      ]),
    });

    store.getState().removeWaypoint('road:none', 1);

    const route = store.getState().connectionRoutes.get('road:none');
    expect(route).toEqual({
      points: [
        { kind: 'zone', zoneId: 'zone:a' },
        { kind: 'zone', zoneId: 'zone:b' },
      ],
      segments: [{ kind: 'straight' }],
    });
    expect(store.getState().connectionAnchors.has('bend-1')).toBe(false);
  });

  it('convertSegment toggles between straight and quadratic using midpoint control positions', () => {
    const store = makeStore({
      routes: new Map<string, ConnectionRouteDefinition>([
        ['road:none', {
          points: [
            { kind: 'zone', zoneId: 'zone:a' },
            { kind: 'zone', zoneId: 'zone:b' },
          ],
          segments: [{ kind: 'straight' }],
        }],
      ]),
    });

    store.getState().convertSegment('road:none', 0, 'quadratic');

    expect(store.getState().connectionRoutes.get('road:none')?.segments[0]).toEqual({
      kind: 'quadratic',
      control: { kind: 'position', x: 30, y: 0 },
    });

    store.getState().convertSegment('road:none', 0, 'straight');

    expect(store.getState().connectionRoutes.get('road:none')?.segments[0]).toEqual({ kind: 'straight' });
  });

  it('convertSegment seeds quadratic controls from anchored endpoint geometry instead of zone centers', () => {
    const store = makeStore({
      zoneOverrides: {
        'zone:a': { shape: 'rectangle', width: 40, height: 20 },
        'zone:b': { shape: 'rectangle', width: 40, height: 40 },
      },
      routes: new Map<string, ConnectionRouteDefinition>([
        ['road:none', {
          points: [
            { kind: 'zone', zoneId: 'zone:a', anchor: 90 },
            { kind: 'zone', zoneId: 'zone:b', anchor: 180 },
          ],
          segments: [{ kind: 'straight' }],
        }],
      ]),
    });

    store.getState().convertSegment('road:none', 0, 'quadratic');

    expect(store.getState().connectionRoutes.get('road:none')?.segments[0]).toEqual({
      kind: 'quadratic',
      control: { kind: 'position', x: 20, y: -5 },
    });
  });

  it('moves anchor-backed control points by updating the referenced anchor', () => {
    const store = makeStore({
      routes: new Map<string, ConnectionRouteDefinition>([
        ['river:none', {
          points: [
            { kind: 'zone', zoneId: 'zone:a' },
            { kind: 'zone', zoneId: 'zone:b' },
          ],
          segments: [{ kind: 'quadratic', control: { kind: 'anchor', anchorId: 'curve-ctrl' } }],
        }],
      ]),
    });

    store.getState().moveControlPoint('river:none', 0, { x: 77, y: 88 });

    expect(store.getState().connectionAnchors.get('curve-ctrl')).toEqual({ x: 77, y: 88 });
    expect(store.getState().connectionRoutes.get('river:none')?.segments[0]).toEqual({
      kind: 'quadratic',
      control: { kind: 'anchor', anchorId: 'curve-ctrl' },
    });
  });

  it('setEndpointAnchor updates a zone endpoint and records undo history', () => {
    const store = makeStore();
    const previousRoutes = store.getState().connectionRoutes;
    const previousRoute = previousRoutes.get('road:none');

    store.getState().setEndpointAnchor('road:none', 0, 90);

    const state = store.getState();
    expect(state.connectionRoutes).not.toBe(previousRoutes);
    expect(state.connectionRoutes.get('road:none')).not.toBe(previousRoute);
    expect(state.connectionRoutes.get('road:none')).toEqual({
      points: [
        { kind: 'zone', zoneId: 'zone:a', anchor: 90 },
        { kind: 'zone', zoneId: 'zone:b' },
      ],
      segments: [{ kind: 'straight' }],
    });
    expect(previousRoute).toEqual({
      points: [
        { kind: 'zone', zoneId: 'zone:a' },
        { kind: 'zone', zoneId: 'zone:b' },
      ],
      segments: [{ kind: 'straight' }],
    });
    expect(state.undoStack).toHaveLength(1);
    expect(state.undoStack[0]?.connectionRoutes.get('road:none')).toEqual(previousRoute);
    expect(state.redoStack).toHaveLength(0);
    expect(state.dirty).toBe(true);
  });

  it('setEndpointAnchor is a no-op for anchor endpoints, invalid targets, and unchanged values', () => {
    const store = makeStore({
      routes: new Map<string, ConnectionRouteDefinition>([
        ['road:none', {
          points: [
            { kind: 'anchor', anchorId: 'bend-1' },
            { kind: 'zone', zoneId: 'zone:b', anchor: 180 },
          ],
          segments: [{ kind: 'straight' }],
        }],
      ]),
    });
    const initialRoutes = store.getState().connectionRoutes;

    store.getState().setEndpointAnchor('road:none', 0, 90);
    store.getState().setEndpointAnchor('road:none', 1, 180);
    store.getState().setEndpointAnchor('road:none', 5, 90);
    store.getState().setEndpointAnchor('missing:none', 0, 90);

    const state = store.getState();
    expect(state.connectionRoutes).toBe(initialRoutes);
    expect(state.connectionRoutes.get('road:none')).toEqual({
      points: [
        { kind: 'anchor', anchorId: 'bend-1' },
        { kind: 'zone', zoneId: 'zone:b', anchor: 180 },
      ],
      segments: [{ kind: 'straight' }],
    });
    expect(state.undoStack).toHaveLength(0);
    expect(state.redoStack).toHaveLength(0);
    expect(state.dirty).toBe(false);
  });

  it('previewEndpointAnchor previews within an interaction and commit makes it undoable', () => {
    const store = makeStore();

    store.getState().beginInteraction();
    store.getState().previewEndpointAnchor('road:none', 0, 45);

    expect(store.getState().connectionRoutes.get('road:none')).toEqual({
      points: [
        { kind: 'zone', zoneId: 'zone:a', anchor: 45 },
        { kind: 'zone', zoneId: 'zone:b' },
      ],
      segments: [{ kind: 'straight' }],
    });
    expect(store.getState().undoStack).toHaveLength(0);
    expect(store.getState().dirty).toBe(true);

    store.getState().commitInteraction();

    expect(store.getState().undoStack).toHaveLength(1);
    expect(store.getState().undoStack[0]?.connectionRoutes.get('road:none')).toEqual({
      points: [
        { kind: 'zone', zoneId: 'zone:a' },
        { kind: 'zone', zoneId: 'zone:b' },
      ],
      segments: [{ kind: 'straight' }],
    });

    store.getState().undo();

    expect(store.getState().connectionRoutes.get('road:none')).toEqual({
      points: [
        { kind: 'zone', zoneId: 'zone:a' },
        { kind: 'zone', zoneId: 'zone:b' },
      ],
      segments: [{ kind: 'straight' }],
    });
  });

  it('cancelInteraction discards previewEndpointAnchor changes', () => {
    const store = makeStore();

    store.getState().beginInteraction();
    store.getState().previewEndpointAnchor('road:none', 0, 135);
    expect(store.getState().connectionRoutes.get('road:none')?.points[0]).toEqual({
      kind: 'zone',
      zoneId: 'zone:a',
      anchor: 135,
    });

    store.getState().cancelInteraction();

    expect(store.getState().connectionRoutes.get('road:none')).toEqual({
      points: [
        { kind: 'zone', zoneId: 'zone:a' },
        { kind: 'zone', zoneId: 'zone:b' },
      ],
      segments: [{ kind: 'straight' }],
    });
    expect(store.getState().undoStack).toHaveLength(0);
    expect(store.getState().redoStack).toHaveLength(0);
    expect(store.getState().dirty).toBe(false);
  });

  it('convertEndpointToAnchor promotes a zone endpoint into a new anchor at the current zone position', () => {
    const store = makeStore({
      routes: new Map<string, ConnectionRouteDefinition>([
        ['road:none', {
          points: [
            { kind: 'zone', zoneId: 'zone:a' },
            { kind: 'zone', zoneId: 'zone:b' },
          ],
          segments: [{ kind: 'straight' }],
        }],
      ]),
    });

    const anchorId = store.getState().convertEndpointToAnchor('road:none', 0);

    expect(anchorId).toBe('road:none:endpoint:zone:a:0');
    expect(store.getState().connectionAnchors.get('road:none:endpoint:zone:a:0')).toEqual({ x: 0, y: 0 });
    expect(store.getState().connectionRoutes.get('road:none')).toEqual({
      points: [
        { kind: 'anchor', anchorId: 'road:none:endpoint:zone:a:0' },
        { kind: 'zone', zoneId: 'zone:b' },
      ],
      segments: [{ kind: 'straight' }],
    });
  });

  it('convertEndpointToAnchor returns null for non-zone points', () => {
    const store = makeStore({
      routes: new Map<string, ConnectionRouteDefinition>([
        ['road:none', {
          points: [
            { kind: 'anchor', anchorId: 'bend-1' },
            { kind: 'zone', zoneId: 'zone:b' },
          ],
          segments: [{ kind: 'straight' }],
        }],
      ]),
    });

    expect(store.getState().convertEndpointToAnchor('road:none', 0)).toBeNull();
    expect(store.getState().connectionAnchors.get('bend-1')).toEqual({ x: 20, y: 30 });
  });

  it('convertEndpointToAnchor generates a unique id when the base endpoint anchor id already exists', () => {
    const store = makeStore({
      anchors: new Map([
        ['bend-1', { x: 20, y: 30 }],
        ['curve-ctrl', { x: 45, y: 55 }],
        ['road:none:endpoint:zone:a:0', { x: 999, y: 999 }],
      ]),
    });

    const anchorId = store.getState().convertEndpointToAnchor('road:none', 0);

    expect(anchorId).toBe('road:none:endpoint:zone:a:0:2');
    expect(store.getState().connectionAnchors.get('road:none:endpoint:zone:a:0:2')).toEqual({ x: 0, y: 0 });
  });

  it('preserves previous map and route instances during immutable updates', () => {
    const store = makeStore();
    const previousZonePositions = store.getState().zonePositions;
    const previousRoutes = store.getState().connectionRoutes;
    const previousRoute = previousRoutes.get('road:none');

    store.getState().convertSegment('road:none', 0, 'quadratic');

    expect(previousZonePositions.get('zone:a')).toEqual({ x: 0, y: 0 });
    expect(previousRoutes.get('road:none')).toEqual(previousRoute);
    expect(store.getState().connectionRoutes).not.toBe(previousRoutes);
    expect(store.getState().connectionRoutes.get('road:none')).not.toBe(previousRoute);
  });
});

function makeStore(overrides?: {
  readonly anchors?: ReadonlyMap<string, { readonly x: number; readonly y: number }>;
  readonly routes?: ReadonlyMap<string, ConnectionRouteDefinition>;
  readonly zoneOverrides?: NonNullable<VisualConfig['zones']>['overrides'];
}) {
  return createMapEditorStore(
    GAME_DEF,
    makeVisualConfig(overrides),
    makeInitialPositions(),
  );
}

function makeInitialPositions(): ReadonlyMap<string, { readonly x: number; readonly y: number }> {
  return new Map([
    ['zone:a', { x: 0, y: 0 }],
    ['zone:b', { x: 60, y: 0 }],
    ['road:none', { x: 30, y: 0 }],
  ]);
}

function makeVisualConfig(overrides?: {
  readonly anchors?: ReadonlyMap<string, { readonly x: number; readonly y: number }>;
  readonly routes?: ReadonlyMap<string, ConnectionRouteDefinition>;
  readonly zoneOverrides?: NonNullable<VisualConfig['zones']>['overrides'];
}): VisualConfig {
  const anchors = overrides?.anchors ?? new Map([
    ['bend-1', { x: 20, y: 30 }],
    ['curve-ctrl', { x: 45, y: 55 }],
  ]);
  const routes = overrides?.routes ?? new Map<string, ConnectionRouteDefinition>([
    ['road:none', {
      points: [
        { kind: 'zone', zoneId: 'zone:a' },
        { kind: 'zone', zoneId: 'zone:b' },
      ],
      segments: [{ kind: 'straight' }],
    }],
  ]);

  return {
    version: 1,
    zones: {
      overrides: overrides?.zoneOverrides,
      connectionAnchors: Object.fromEntries(anchors),
      connectionRoutes: Object.fromEntries(routes),
    },
  };
}
