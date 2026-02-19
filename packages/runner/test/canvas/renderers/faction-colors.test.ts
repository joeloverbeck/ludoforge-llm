import { asPlayerId } from '@ludoforge/engine/runtime';
import { describe, expect, it } from 'vitest';

import { VisualConfigProvider } from '../../../src/config/visual-config-provider.js';
import {
  DEFAULT_FACTION_PALETTE,
  DefaultFactionColorProvider,
  VisualConfigFactionColorProvider,
} from '../../../src/canvas/renderers/faction-colors';

describe('DefaultFactionColorProvider', () => {
  it('returns resolved token defaults for unknown token types', () => {
    const provider = new DefaultFactionColorProvider();
    expect(provider.getTokenTypeVisual('vc-guerrillas')).toEqual({
      shape: 'circle',
      color: null,
      size: 28,
      symbol: null,
      backSymbol: null,
    });
  });

  it('returns deterministic color for the same faction id', () => {
    const provider = new DefaultFactionColorProvider();
    expect(provider.getColor('faction-a', asPlayerId(4))).toBe(provider.getColor('faction-a', asPlayerId(99)));
  });

  it('uses a player-derived fallback key when faction id is null', () => {
    const provider = new DefaultFactionColorProvider();
    expect(provider.getColor(null, asPlayerId(8))).toBe(provider.getColor(null, asPlayerId(8)));
    expect(provider.getColor(null, asPlayerId(8))).not.toBe(provider.getColor(null, asPlayerId(9)));
  });

  it('always returns a valid palette hex color', () => {
    const provider = new DefaultFactionColorProvider();

    const outputs = [
      provider.getColor('faction-a', asPlayerId(0)),
      provider.getColor('faction-b', asPlayerId(1)),
      provider.getColor('faction-c', asPlayerId(2)),
      provider.getColor('', asPlayerId(3)),
      provider.getColor(null, asPlayerId(4)),
      provider.getColor(null, asPlayerId(99999)),
    ];

    for (const color of outputs) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/);
      expect(DEFAULT_FACTION_PALETTE).toContain(color);
    }
  });
});

describe('VisualConfigFactionColorProvider', () => {
  it('returns configured visual-config color for known factions', () => {
    const provider = new VisualConfigFactionColorProvider(
      new VisualConfigProvider({
        version: 1,
        factions: {
          us: { color: '#e63946', displayName: 'United States' },
          arvn: { color: '#457b9d', displayName: 'ARVN' },
        },
      }),
    );

    expect(provider.getColor('us', asPlayerId(0))).toBe('#e63946');
    expect(provider.getColor('arvn', asPlayerId(2))).toBe('#457b9d');
  });

  it('falls back to deterministic default color for unknown factions', () => {
    const backingProvider = new VisualConfigProvider({
      version: 1,
      factions: { us: { color: '#e63946' } },
    });
    const provider = new VisualConfigFactionColorProvider(backingProvider);

    expect(provider.getColor('unknown-faction', asPlayerId(7))).toBe(
      backingProvider.getFactionColor('unknown-faction'),
    );
  });

  it('uses player fallback key for null faction IDs', () => {
    const backingProvider = new VisualConfigProvider({ version: 1 });
    const provider = new VisualConfigFactionColorProvider(backingProvider);

    expect(provider.getColor(null, asPlayerId(7))).toBe(backingProvider.getFactionColor('player-7'));
  });

  it('returns token visuals from visual config and defaults unknown token types', () => {
    const backingProvider = new VisualConfigProvider({
      version: 1,
      tokenTypes: {
        'vc-guerrillas': {
          color: 'bright-blue',
          shape: 'card',
          symbol: 'VC',
          size: 24,
        },
      },
    });
    const provider = new VisualConfigFactionColorProvider(backingProvider);

    expect(provider.getTokenTypeVisual('vc-guerrillas')).toEqual({
      color: 'bright-blue',
      shape: 'card',
      size: 24,
      symbol: 'VC',
      backSymbol: null,
    });
    expect(provider.getTokenTypeVisual('unknown')).toEqual({
      color: null,
      shape: 'circle',
      size: 28,
      symbol: null,
      backSymbol: null,
    });
  });
});
