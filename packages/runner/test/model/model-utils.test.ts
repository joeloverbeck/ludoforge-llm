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

  it('uses fallback labels for prefix display when scope ids are missing', () => {
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
      formatScopePrefixDisplay({
        scope: 'zone',
        playerId: undefined,
        zoneId: undefined,
        resolvePlayerName: () => 'unused',
        resolveZoneName: (zoneId) => zoneId,
      }),
    ).toBe('Zone: ');
  });

  it('throws when per-player endpoint identity is missing', () => {
    expect(() =>
      formatScopeEndpointDisplay({
        scope: 'perPlayer',
        playerId: undefined as unknown as number,
        zoneId: undefined,
        resolvePlayerName: () => 'unused',
        resolveZoneName: (zoneId) => zoneId,
      }),
    ).toThrow('Missing endpoint identity for perPlayer scope: playerId');
  });

  it('throws when zone endpoint identity is missing', () => {
    expect(() =>
      formatScopeEndpointDisplay({
        scope: 'zone',
        playerId: undefined,
        zoneId: undefined as unknown as string,
        resolvePlayerName: () => 'unused',
        resolveZoneName: (zoneId) => zoneId,
      }),
    ).toThrow('Missing endpoint identity for zone scope: zoneId');
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

  it('throws deterministic invalid-scope errors for non-domain endpoint scope values', () => {
    expect(() =>
      formatScopeEndpointDisplay({
        scope: 'bogus' as unknown as 'global',
        playerId: undefined,
        zoneId: undefined,
        resolvePlayerName: () => 'unused',
        resolveZoneName: () => 'unused',
      }),
    ).toThrow('Invalid endpoint scope for event-log rendering: bogus');

    expect(() =>
      formatScopeEndpointDisplay({
        scope: null as unknown as 'global',
        playerId: undefined,
        zoneId: undefined,
        resolvePlayerName: () => 'unused',
        resolveZoneName: () => 'unused',
      }),
    ).toThrow('Invalid endpoint scope for event-log rendering: null');
  });
});
