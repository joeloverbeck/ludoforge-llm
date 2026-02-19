import { asPlayerId } from '@ludoforge/engine/runtime';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_FACTION_PALETTE,
  DefaultFactionColorProvider,
  GameDefFactionColorProvider,
} from '../../../src/canvas/renderers/faction-colors';

describe('DefaultFactionColorProvider', () => {
  it('returns null for token type visuals by default', () => {
    const provider = new DefaultFactionColorProvider();
    expect(provider.getTokenTypeVisual('vc-guerrillas')).toBeNull();
  });

  it('returns deterministic color for the same faction/player pair', () => {
    const provider = new DefaultFactionColorProvider();

    const first = provider.getColor('faction-a', asPlayerId(4));
    const second = provider.getColor('faction-a', asPlayerId(4));

    expect(second).toBe(first);
  });

  it('uses faction id when present and keeps mapping deterministic across players', () => {
    const provider = new DefaultFactionColorProvider();

    const colorForPlayer0 = provider.getColor('faction-shared', asPlayerId(0));
    const colorForPlayer99 = provider.getColor('faction-shared', asPlayerId(99));

    expect(colorForPlayer99).toBe(colorForPlayer0);
  });

  it('falls back to player id when faction id is null', () => {
    const provider = new DefaultFactionColorProvider();

    expect(provider.getColor(null, asPlayerId(8))).toBe(provider.getColor(null, asPlayerId(0)));
    expect(provider.getColor(null, asPlayerId(1234))).toBe(provider.getColor(null, asPlayerId(1234)));
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

  it('maps representative distinct faction ids to more than one palette slot', () => {
    const provider = new DefaultFactionColorProvider();

    const colors = new Set([
      provider.getColor('faction-alpha', asPlayerId(0)),
      provider.getColor('faction-beta', asPlayerId(0)),
      provider.getColor('faction-gamma', asPlayerId(0)),
      provider.getColor('faction-delta', asPlayerId(0)),
      provider.getColor('faction-epsilon', asPlayerId(0)),
      provider.getColor('faction-zeta', asPlayerId(0)),
      provider.getColor('faction-eta', asPlayerId(0)),
      provider.getColor('faction-theta', asPlayerId(0)),
    ]);

    expect(colors.size).toBeGreaterThan(1);
  });
});

describe('GameDefFactionColorProvider', () => {
  it('returns configured game-def color for known factions', () => {
    const provider = new GameDefFactionColorProvider([
      { id: 'us', color: '#e63946', displayName: 'United States' },
      { id: 'arvn', color: '#457b9d', displayName: 'ARVN' },
    ]);

    expect(provider.getColor('us', asPlayerId(0))).toBe('#e63946');
    expect(provider.getColor('arvn', asPlayerId(2))).toBe('#457b9d');
  });

  it('falls back to default provider for unknown factions', () => {
    const fallback = new DefaultFactionColorProvider();
    const provider = new GameDefFactionColorProvider([{ id: 'us', color: '#e63946' }], fallback);

    expect(provider.getColor('unknown-faction', asPlayerId(7))).toBe(fallback.getColor('unknown-faction', asPlayerId(7)));
  });

  it('falls back to default provider for null faction IDs', () => {
    const fallback = new DefaultFactionColorProvider();
    const provider = new GameDefFactionColorProvider([{ id: 'us', color: '#e63946' }], fallback);

    expect(provider.getColor(null, asPlayerId(7))).toBe(fallback.getColor(null, asPlayerId(7)));
  });

  it('behaves like default provider when no factions are defined', () => {
    const fallback = new DefaultFactionColorProvider();
    const provider = new GameDefFactionColorProvider([], fallback);

    expect(provider.getColor('faction-a', asPlayerId(1))).toBe(fallback.getColor('faction-a', asPlayerId(1)));
    expect(provider.getColor(null, asPlayerId(9))).toBe(fallback.getColor(null, asPlayerId(9)));
  });

  it('supports updating factions after construction', () => {
    const fallback = new DefaultFactionColorProvider();
    const provider = new GameDefFactionColorProvider(undefined, fallback);

    expect(provider.getColor('us', asPlayerId(0))).toBe(fallback.getColor('us', asPlayerId(0)));
    provider.setFactions([{ id: 'us', color: '#e63946' }]);
    expect(provider.getColor('us', asPlayerId(0))).toBe('#e63946');
  });

  it('resolves token type visuals when declared', () => {
    const fallback = new DefaultFactionColorProvider();
    const provider = new GameDefFactionColorProvider(undefined, fallback);

    expect(provider.getTokenTypeVisual('vc-guerrillas')).toBeNull();

    provider.setTokenTypes([
      { id: 'vc-guerrillas', faction: 'vc', props: {}, visual: { color: 'bright-blue', shape: 'card', symbol: 'VC' } },
      { id: 'nva-guerrillas', faction: 'nva', props: {}, visual: { color: '#ff0000' } },
    ]);

    expect(provider.getTokenTypeVisual('vc-guerrillas')).toEqual({ color: 'bright-blue', shape: 'card', symbol: 'VC' });
    expect(provider.getTokenTypeVisual('nva-guerrillas')).toEqual({ color: '#ff0000' });
    expect(provider.getTokenTypeVisual('unknown')).toBeNull();
  });
});
