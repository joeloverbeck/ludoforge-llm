import { describe, expect, it } from 'vitest';

import { formatScopeDisplay, optionalPlayerId } from '../../src/model/model-utils.js';

describe('model-utils', () => {
  it('returns an empty object for undefined playerId', () => {
    expect(optionalPlayerId(undefined)).toEqual({});
  });

  it('returns playerId when present', () => {
    expect(optionalPlayerId(2)).toEqual({ playerId: 2 });
  });

  it('renders per-player scope for endpoint and prefix contexts', () => {
    expect(
      formatScopeDisplay({
        scope: 'perPlayer',
        context: 'endpoint',
        playerId: 2,
        zoneId: undefined,
        resolvePlayerName: (playerId) => `Player ${playerId}`,
        resolveZoneName: (zoneId) => zoneId,
      }),
    ).toBe('Player 2');

    expect(
      formatScopeDisplay({
        scope: 'perPlayer',
        context: 'prefix',
        playerId: 2,
        zoneId: undefined,
        resolvePlayerName: (playerId) => `Player ${playerId}`,
        resolveZoneName: (zoneId) => zoneId,
      }),
    ).toBe('Player 2: ');
  });

  it('uses fallback labels when scope ids are missing', () => {
    expect(
      formatScopeDisplay({
        scope: 'perPlayer',
        context: 'endpoint',
        playerId: undefined,
        zoneId: undefined,
        resolvePlayerName: () => 'unused',
        resolveZoneName: (zoneId) => zoneId,
      }),
    ).toBe('Per Player');

    expect(
      formatScopeDisplay({
        scope: 'perPlayer',
        context: 'prefix',
        playerId: undefined,
        zoneId: undefined,
        resolvePlayerName: () => 'unused',
        resolveZoneName: (zoneId) => zoneId,
      }),
    ).toBe('Player: ');

    expect(
      formatScopeDisplay({
        scope: 'zone',
        context: 'endpoint',
        playerId: undefined,
        zoneId: undefined,
        resolvePlayerName: () => 'unused',
        resolveZoneName: (zoneId) => zoneId,
      }),
    ).toBe('Zone');

    expect(
      formatScopeDisplay({
        scope: 'zone',
        context: 'prefix',
        playerId: undefined,
        zoneId: undefined,
        resolvePlayerName: () => 'unused',
        resolveZoneName: (zoneId) => zoneId,
      }),
    ).toBe('Zone: ');
  });

  it('renders global only for endpoint context', () => {
    expect(
      formatScopeDisplay({
        scope: 'global',
        context: 'endpoint',
        playerId: undefined,
        zoneId: undefined,
        resolvePlayerName: () => 'unused',
        resolveZoneName: () => 'unused',
      }),
    ).toBe('Global');

    expect(
      formatScopeDisplay({
        scope: 'global',
        context: 'prefix',
        playerId: undefined,
        zoneId: undefined,
        resolvePlayerName: () => 'unused',
        resolveZoneName: () => 'unused',
      }),
    ).toBe('');
  });
});
