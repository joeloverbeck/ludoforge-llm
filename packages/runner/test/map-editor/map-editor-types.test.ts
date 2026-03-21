import { describe, expectTypeOf, it } from 'vitest';

import type {
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
});
