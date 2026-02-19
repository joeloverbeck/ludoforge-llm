import type { CSSProperties } from 'react';

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

export function buildFactionCssVariableStyle(
  factionIds: readonly string[] | undefined,
  getFactionColor: (factionId: string) => string,
): CSSProperties {
  const style: Record<string, string> = {};
  for (const factionId of factionIds ?? []) {
    const normalizedFactionId = normalizeFactionId(factionId);
    if (normalizedFactionId === null) {
      continue;
    }

    style[`--faction-${normalizedFactionId}`] = getFactionColor(factionId);
  }

  return style as CSSProperties;
}
