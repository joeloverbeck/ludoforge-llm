import type { GameDef } from '@ludoforge/engine/runtime';

import type { VisualConfigProvider } from '../config/visual-config-provider.js';
import type { EditorRouteZoneVisual } from './map-editor-route-geometry.js';

export function resolveMapEditorZoneVisuals(
  gameDef: GameDef,
  visualConfigProvider: VisualConfigProvider,
): ReadonlyMap<string, EditorRouteZoneVisual> {
  return new Map(
    (gameDef.zones ?? []).map((zone) => [
      zone.id as string,
      visualConfigProvider.resolveZoneVisual(
        zone.id as string,
        zone.category ?? null,
        zone.attributes ?? null,
      ),
    ]),
  );
}
