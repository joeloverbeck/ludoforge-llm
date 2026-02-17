import { asPlayerId } from '@ludoforge/engine';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_FACTION_PALETTE,
  DefaultFactionColorProvider,
} from '../../../src/canvas/renderers/faction-colors';

describe('DefaultFactionColorProvider', () => {
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
