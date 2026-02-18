import type { CSSProperties } from 'react';
import type { FactionDef } from '@ludoforge/engine/runtime';

import type { RenderPlayer } from '../model/render-model.js';

export function normalizeFactionId(factionId: string | null): string | null {
  if (typeof factionId !== 'string') {
    return null;
  }

  const normalized = factionId.trim().replace(/[^A-Za-z0-9_-]/gu, '-');
  return normalized.length > 0 ? normalized : null;
}

export function buildFactionColorValue(factionId: string | null, fallbackIndex: number): string {
  const fallbackColor = `var(--faction-${fallbackIndex})`;
  const normalizedFactionId = normalizeFactionId(factionId);

  return normalizedFactionId === null
    ? fallbackColor
    : `var(--faction-${normalizedFactionId}, ${fallbackColor})`;
}

export function buildFactionColorStyle(
  player: RenderPlayer,
  players: readonly RenderPlayer[],
): CSSProperties {
  const index = players.findIndex((candidate) => candidate.id === player.id);
  const fallbackIndex = index >= 0 ? index : 0;
  const colorValue = buildFactionColorValue(player.factionId, fallbackIndex);

  return {
    color: colorValue,
    borderColor: colorValue,
  };
}

export function buildFactionCssVariableStyle(factions: readonly FactionDef[] | undefined): CSSProperties {
  const style: Record<string, string> = {};
  for (const faction of factions ?? []) {
    const normalizedFactionId = normalizeFactionId(faction.id);
    if (normalizedFactionId === null) {
      continue;
    }

    style[`--faction-${normalizedFactionId}`] = faction.color;
  }

  return style as CSSProperties;
}
