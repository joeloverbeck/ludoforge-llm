import { EventEmitter } from 'node:events';

import { describe, expect, it } from 'vitest';
import type { GameDef } from '@ludoforge/engine/runtime';

import {
  attachAnchorDragHandlers,
  attachControlPointDragHandlers,
  attachZoneEndpointConvertDragHandlers,
  attachZoneDragHandlers,
  snapToGrid,
} from '../../src/map-editor/map-editor-drag.js';
import { createMapEditorStore } from '../../src/map-editor/map-editor-store.js';
import type { VisualConfig } from '../../src/map-editor/map-editor-types.js';

class MockPoint {
  x = 0;

  y = 0;

  set(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }
}

class MockContainer extends EventEmitter {
  parent: MockContainer | null = null;

  position = new MockPoint();

  cursor = 'default';

  eventMode: 'none' | 'static' | 'passive' = 'none';

  interactiveChildren = true;

  override on(event: string, listener: (...args: unknown[]) => void): this {
    return super.on(event, listener);
  }

  override off(event: string, listener: (...args: unknown[]) => void): this {
    return super.off(event, listener);
  }
}

describe('map-editor-drag', () => {
  it('rounds to the nearest grid intersection', () => {
    expect(snapToGrid({ x: 17, y: 23 }, 10)).toEqual({ x: 20, y: 20 });
    expect(snapToGrid({ x: 5, y: 5 }, 10)).toEqual({ x: 10, y: 10 });
  });

  it('previews drag movement and commits a single undo entry on release', () => {
    const { dragSurface, store, zoneContainer } = createFixture();
    const cleanup = attachZoneDragHandlers(zoneContainer as never, 'zone:a', dragSurface as never, store);

    zoneContainer.emit('pointerdown', pointer(12, 23));
    expect(store.getState().selectedZoneId).toBe('zone:a');
    expect(store.getState().selectedRouteId).toBeNull();
    expect(store.getState().isDragging).toBe(true);
    expect(zoneContainer.cursor).toBe('grabbing');

    dragSurface.emit('globalpointermove', pointer(32, 43));
    expect(store.getState().zonePositions.get('zone:a')).toEqual({ x: 30, y: 40 });
    expect(store.getState().undoStack).toHaveLength(0);

    dragSurface.emit('globalpointermove', pointer(52, 73));
    expect(store.getState().zonePositions.get('zone:a')).toEqual({ x: 50, y: 70 });
    expect(store.getState().undoStack).toHaveLength(0);

    dragSurface.emit('pointerup');
    expect(store.getState().zonePositions.get('zone:a')).toEqual({ x: 50, y: 70 });
    expect(store.getState().undoStack).toHaveLength(1);
    expect(store.getState().undoStack[0]?.zonePositions.get('zone:a')).toEqual({ x: 10, y: 20 });
    expect(store.getState().isDragging).toBe(false);
    expect(zoneContainer.cursor).toBe('grab');

    cleanup();
  });

  it('uses the store grid settings when snap-to-grid is enabled', () => {
    const { dragSurface, store, zoneContainer } = createFixture();
    store.getState().setSnapToGrid(true);
    store.getState().setGridSize(10);
    const cleanup = attachZoneDragHandlers(zoneContainer as never, 'zone:a', dragSurface as never, store);

    zoneContainer.emit('pointerdown', pointer(12, 23));
    dragSurface.emit('globalpointermove', pointer(29, 46));

    expect(store.getState().zonePositions.get('zone:a')).toEqual({ x: 30, y: 40 });

    dragSurface.emit('pointerup');
    cleanup();
  });

  it('closes a no-op interaction without creating undo history', () => {
    const { dragSurface, store, zoneContainer } = createFixture();
    const cleanup = attachZoneDragHandlers(zoneContainer as never, 'zone:a', dragSurface as never, store);

    zoneContainer.emit('pointerdown', pointer(12, 23));
    dragSurface.emit('pointerupoutside');

    expect(store.getState().zonePositions.get('zone:a')).toEqual({ x: 10, y: 20 });
    expect(store.getState().undoStack).toHaveLength(0);
    expect(store.getState().dirty).toBe(false);
    expect(store.getState().isDragging).toBe(false);

    cleanup();
  });

  it('removes all listeners and cancels an active interaction on cleanup', () => {
    const { dragSurface, store, zoneContainer } = createFixture();
    const cleanup = attachZoneDragHandlers(zoneContainer as never, 'zone:a', dragSurface as never, store);

    zoneContainer.emit('pointerdown', pointer(12, 23));
    dragSurface.emit('globalpointermove', pointer(32, 43));
    expect(store.getState().zonePositions.get('zone:a')).toEqual({ x: 30, y: 40 });

    cleanup();

    expect(zoneContainer.listenerCount('pointerdown')).toBe(0);
    expect(dragSurface.listenerCount('globalpointermove')).toBe(0);
    expect(dragSurface.listenerCount('pointerup')).toBe(0);
    expect(dragSurface.listenerCount('pointerupoutside')).toBe(0);
    expect(store.getState().zonePositions.get('zone:a')).toEqual({ x: 10, y: 20 });
    expect(store.getState().isDragging).toBe(false);
    expect(zoneContainer.cursor).toBe('default');
  });

  it('previews anchor drag movement and commits a single undo entry on release', () => {
    const { dragSurface, store } = createFixture();
    const anchorHandle = new MockContainer();
    anchorHandle.parent = dragSurface;
    anchorHandle.position.set(20, 30);
    const cleanup = attachAnchorDragHandlers(
      anchorHandle as never,
      'road:none',
      'bend-1',
      dragSurface as never,
      store,
    );

    anchorHandle.emit('pointerdown', pointer(22, 33));
    dragSurface.emit('globalpointermove', pointer(42, 63));

    expect(store.getState().selectedRouteId).toBe('road:none');
    expect(store.getState().selectedZoneId).toBeNull();
    expect(store.getState().connectionAnchors.get('bend-1')).toEqual({ x: 40, y: 60 });
    expect(store.getState().undoStack).toHaveLength(0);

    dragSurface.emit('pointerup');

    expect(store.getState().connectionAnchors.get('bend-1')).toEqual({ x: 40, y: 60 });
    expect(store.getState().undoStack).toHaveLength(1);
    expect(store.getState().undoStack[0]?.connectionAnchors.get('bend-1')).toEqual({ x: 20, y: 30 });

    cleanup();
  });

  it('previews control point drag movement and commits a single undo entry on release', () => {
    const { dragSurface, store } = createFixture();
    const controlHandle = new MockContainer();
    controlHandle.parent = dragSurface;
    controlHandle.position.set(45, 55);
    const cleanup = attachControlPointDragHandlers(
      controlHandle as never,
      'river:none',
      0,
      dragSurface as never,
      store,
    );

    controlHandle.emit('pointerdown', pointer(46, 57));
    dragSurface.emit('globalpointermove', pointer(78, 92));

    expect(store.getState().selectedRouteId).toBe('river:none');
    expect(store.getState().connectionAnchors.get('curve-ctrl')).toEqual({ x: 77, y: 90 });
    expect(store.getState().undoStack).toHaveLength(0);

    dragSurface.emit('pointerup');

    expect(store.getState().connectionAnchors.get('curve-ctrl')).toEqual({ x: 77, y: 90 });
    expect(store.getState().undoStack).toHaveLength(1);
    expect(store.getState().undoStack[0]?.connectionAnchors.get('curve-ctrl')).toEqual({ x: 45, y: 55 });

    cleanup();
  });

  it('promotes a zone endpoint on first movement and commits convert plus drag as one undo entry', () => {
    const { dragSurface, store } = createFixture();
    const zoneEndpointHandle = new MockContainer();
    zoneEndpointHandle.parent = dragSurface;
    zoneEndpointHandle.position.set(10, 20);
    const cleanup = attachZoneEndpointConvertDragHandlers(
      zoneEndpointHandle as never,
      'road:none',
      0,
      dragSurface as never,
      store,
    );

    zoneEndpointHandle.emit('pointerdown', pointer(12, 23));
    expect(store.getState().selectedRouteId).toBe('road:none');
    expect(store.getState().isDragging).toBe(true);

    dragSurface.emit('globalpointermove', pointer(32, 43));

    expect(store.getState().connectionRoutes.get('road:none')?.points[0]).toEqual({
      kind: 'anchor',
      anchorId: 'road:none:endpoint:zone:a:0',
    });
    expect(store.getState().connectionAnchors.get('road:none:endpoint:zone:a:0')).toEqual({ x: 30, y: 40 });
    expect(store.getState().undoStack).toHaveLength(0);

    dragSurface.emit('pointerup');

    expect(store.getState().undoStack).toHaveLength(1);
    expect(store.getState().undoStack[0]?.connectionRoutes.get('road:none')?.points[0]).toEqual({
      kind: 'zone',
      zoneId: 'zone:a',
    });
    expect(store.getState().isDragging).toBe(false);
    expect(zoneEndpointHandle.cursor).toBe('grab');

    cleanup();
  });
});

function createFixture() {
  const dragSurface = new MockContainer();
  dragSurface.eventMode = 'passive';

  const zoneContainer = new MockContainer();
  zoneContainer.parent = dragSurface;
  zoneContainer.position.set(10, 20);

  const store = createMapEditorStore(
    {
      metadata: {
        id: 'editor-test',
        players: { min: 1, max: 4 },
      },
      zones: [{ id: 'zone:a', owner: 'none', visibility: 'public', ordering: 'stack' }],
    } as unknown as GameDef,
    {
      version: 1,
      zones: {
        connectionAnchors: {
          'bend-1': { x: 20, y: 30 },
          'curve-ctrl': { x: 45, y: 55 },
        },
        connectionRoutes: {
          'road:none': {
            points: [
              { kind: 'zone', zoneId: 'zone:a' },
              { kind: 'anchor', anchorId: 'bend-1' },
              { kind: 'zone', zoneId: 'zone:b' },
            ],
            segments: [
              { kind: 'straight' },
              { kind: 'straight' },
            ],
          },
          'river:none': {
            points: [
              { kind: 'zone', zoneId: 'zone:a' },
              { kind: 'zone', zoneId: 'zone:b' },
            ],
            segments: [
              { kind: 'quadratic', control: { kind: 'anchor', anchorId: 'curve-ctrl' } },
            ],
          },
        },
      },
    } as VisualConfig,
    new Map([
      ['zone:a', { x: 10, y: 20 }],
      ['zone:b', { x: 80, y: 20 }],
    ]),
  );

  return {
    dragSurface,
    store,
    zoneContainer,
  };
}

function pointer(x: number, y: number) {
  return {
    getLocalPosition() {
      return { x, y };
    },
    stopPropagation() {},
  };
}
