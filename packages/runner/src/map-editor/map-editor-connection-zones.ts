import type { ZoneDef } from '@ludoforge/engine/runtime';

import type { VisualConfigProvider } from '../config/visual-config-provider.js';

export function isConnectionZone(
  zone: ZoneDef,
  visualConfigProvider: VisualConfigProvider,
): boolean {
  return visualConfigProvider.resolveZoneVisual(
    zone.id as string,
    zone.category ?? null,
    zone.attributes ?? null,
  ).shape === 'connection';
}
