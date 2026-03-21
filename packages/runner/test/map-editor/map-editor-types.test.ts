import type { Viewport } from 'pixi-viewport';
import type { Application, Container } from 'pixi.js';

import { describe, expectTypeOf, it } from 'vitest';

import type {
  EditorCanvas,
  EditorLayerSet,
  ConnectionRouteDefinition,
  EditorSnapshot,
  MapEditorDocumentState,
  Position,
} from '../../src/map-editor/map-editor-types.js';

describe('map-editor-types', () => {
  it('defines Position as a readonly numeric pair', () => {
    expectTypeOf<Position>().toEqualTypeOf<{
      readonly x: number;
      readonly y: number;
    }>();
  });

  it('uses the shared connection route contract for editable routes', () => {
    expectTypeOf<MapEditorDocumentState['connectionRoutes']>().toEqualTypeOf<
      ReadonlyMap<string, ConnectionRouteDefinition>
    >();
  });

  it('uses document-only snapshots for history entries', () => {
    expectTypeOf<EditorSnapshot>().toEqualTypeOf<MapEditorDocumentState>();
  });

  it('defines the logical editor layer set as pixi containers', () => {
    expectTypeOf<EditorLayerSet>().toEqualTypeOf<{
      readonly background: Container;
      readonly route: Container;
      readonly zone: Container;
      readonly handle: Container;
    }>();
  });

  it('exposes an editor canvas contract with pixi app, viewport, and controls', () => {
    expectTypeOf<EditorCanvas['app']>().toEqualTypeOf<Application>();
    expectTypeOf<EditorCanvas['viewport']>().toEqualTypeOf<Viewport>();
    expectTypeOf<EditorCanvas['layers']>().toEqualTypeOf<EditorLayerSet>();
    expectTypeOf<EditorCanvas['resize']>().toEqualTypeOf<(width: number, height: number) => void>();
    expectTypeOf<EditorCanvas['centerOnContent']>().toEqualTypeOf<() => void>();
    expectTypeOf<EditorCanvas['destroy']>().toEqualTypeOf<() => void>();
  });
});
