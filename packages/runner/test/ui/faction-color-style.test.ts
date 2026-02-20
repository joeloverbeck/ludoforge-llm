import { describe, expect, it } from 'vitest';
import { asPlayerId } from '@ludoforge/engine/runtime';

import {
  buildFactionColorStyle,
  buildFactionColorValue,
  buildFactionCssVariableStyle,
  normalizeFactionId,
} from '../../src/ui/faction-color-style.js';

describe('faction-color-style', () => {
  it('normalizes faction IDs for CSS variable keys', () => {
    expect(normalizeFactionId('us')).toBe('us');
    expect(normalizeFactionId('nva force')).toBe('nva-force');
    expect(normalizeFactionId('')).toBeNull();
    expect(normalizeFactionId(null)).toBeNull();
  });

  it('builds fallback-aware faction color CSS value', () => {
    expect(buildFactionColorValue('ussr', 0)).toBe('var(--faction-ussr, var(--faction-0))');
    expect(buildFactionColorValue(null, 2)).toBe('var(--faction-2)');
  });

  it('builds player color style from faction id with fallback index', () => {
    const players = [
      { id: asPlayerId(0), displayName: 'P0', isHuman: true, isActive: true, isEliminated: false, factionId: 'us' },
      { id: asPlayerId(1), displayName: 'P1', isHuman: false, isActive: false, isEliminated: false, factionId: null },
    ];
    const style = buildFactionColorStyle(players[0]!, players);
    expect(style).toEqual({
      color: 'var(--faction-us, var(--faction-0))',
      borderColor: 'var(--faction-us, var(--faction-0))',
    });
  });

  it('projects gameDef factions into CSS custom properties', () => {
    const style = buildFactionCssVariableStyle(
      ['us', 'nva force'],
      (factionId) => (factionId === 'us' ? '#e63946' : '#2a9d8f'),
    );

    expect(style).toMatchObject({
      '--faction-us': '#e63946',
      '--faction-nva-force': '#2a9d8f',
    });
  });
});
