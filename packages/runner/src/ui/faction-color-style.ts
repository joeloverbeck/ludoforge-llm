import type { CSSProperties } from 'react';

import type { RenderPlayer } from '../model/render-model.js';

function normalizeFactionId(factionId: string | null): string | null {
  if (typeof factionId !== 'string') {
    return null;
  }

  const normalized = factionId.trim().replace(/[^A-Za-z0-9_-]/gu, '-');
  return normalized.length > 0 ? normalized : null;
}

export function buildFactionColorStyle(
  player: RenderPlayer,
  players: readonly RenderPlayer[],
): CSSProperties {
  const index = players.findIndex((candidate) => candidate.id === player.id);
  const fallbackIndex = index >= 0 ? index : 0;
  const fallbackColor = `var(--faction-${fallbackIndex})`;

  const normalizedFactionId = normalizeFactionId(player.factionId);
  const colorValue = normalizedFactionId === null
    ? fallbackColor
    : `var(--faction-${normalizedFactionId}, ${fallbackColor})`;

  return {
    color: colorValue,
    borderColor: colorValue,
  };
}
