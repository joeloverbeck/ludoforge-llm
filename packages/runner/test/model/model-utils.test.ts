import { describe, expect, it } from 'vitest';

import { formatScopeEndpointDisplay, formatScopePrefixDisplay, optionalPlayerId } from '../../src/model/model-utils.js';

describe('model-utils', () => {
  it('returns an empty object for undefined playerId', () => {
    expect(optionalPlayerId(undefined)).toEqual({});
  });

  it('returns playerId when present', () => {
    expect(optionalPlayerId(2)).toEqual({ playerId: 2 });
  });

  it('renders per-player scope for endpoint and prefix displays', () => {
    expect(
      formatScopeEndpointDisplay({
        scope: 'perPlayer',
        playerId: 2,
        zoneId: undefined,
        resolvePlayerName: (playerId) => `Player ${playerId}`,
        resolveZoneName: (zoneId) => zoneId,
      }),
    ).toBe('Player 2');

    expect(
      formatScopePrefixDisplay({
        scope: 'perPlayer',
        playerId: 2,
        zoneId: undefined,
        resolvePlayerName: (playerId) => `Player ${playerId}`,
        resolveZoneName: (zoneId) => zoneId,
      }),
    ).toBe('Player 2: ');
  });

  it('uses fallback labels when scope ids are missing', () => {
    expect(
      formatScopeEndpointDisplay({
        scope: 'perPlayer',
        playerId: undefined,
        zoneId: undefined,
        resolvePlayerName: () => 'unused',
        resolveZoneName: (zoneId) => zoneId,
      }),
    ).toBe('Per Player');

    expect(
      formatScopePrefixDisplay({
        scope: 'perPlayer',
        playerId: undefined,
        zoneId: undefined,
        resolvePlayerName: () => 'unused',
        resolveZoneName: (zoneId) => zoneId,
      }),
    ).toBe('Player: ');

    expect(
      formatScopeEndpointDisplay({
        scope: 'zone',
        playerId: undefined,
        zoneId: undefined,
        resolvePlayerName: () => 'unused',
        resolveZoneName: (zoneId) => zoneId,
      }),
    ).toBe('Zone');

    expect(
      formatScopePrefixDisplay({
        scope: 'zone',
        playerId: undefined,
        zoneId: undefined,
        resolvePlayerName: () => 'unused',
        resolveZoneName: (zoneId) => zoneId,
      }),
    ).toBe('Zone: ');
  });

  it('renders global endpoint and empty global prefix', () => {
    expect(
      formatScopeEndpointDisplay({
        scope: 'global',
        playerId: undefined,
        zoneId: undefined,
        resolvePlayerName: () => 'unused',
        resolveZoneName: () => 'unused',
      }),
    ).toBe('Global');

    expect(
      formatScopePrefixDisplay({
        scope: 'global',
        playerId: undefined,
        zoneId: undefined,
        resolvePlayerName: () => 'unused',
        resolveZoneName: () => 'unused',
      }),
    ).toBe('');
  });

  it('throws when endpoint scope is missing at runtime', () => {
    expect(() =>
      formatScopeEndpointDisplay({
        scope: undefined as unknown as 'global',
        playerId: undefined,
        zoneId: undefined,
        resolvePlayerName: () => 'unused',
        resolveZoneName: () => 'unused',
      }),
    ).toThrow('Invalid endpoint scope for event-log rendering');
  });
});
