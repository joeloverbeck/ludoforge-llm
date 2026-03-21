import { EventEmitter } from 'node:events';

import { describe, expect, it } from 'vitest';
import type { GameDef } from '@ludoforge/engine/runtime';

import { attachZoneDragHandlers, snapToGrid } from '../../src/map-editor/map-editor-drag.js';
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
      zones: {},
    } as VisualConfig,
    new Map([
      ['zone:a', { x: 10, y: 20 }],
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
