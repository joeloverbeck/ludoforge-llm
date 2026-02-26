import { describe, expect, it } from 'vitest';

import {
  endpointVarNameAsString,
  formatTransferEndpointDisplay,
  normalizeTransferEndpoint,
} from '../../src/model/transfer-endpoint-utils.js';

describe('transfer-endpoint-utils', () => {
  it('renders per-player transfer endpoint display', () => {
    expect(
      formatTransferEndpointDisplay({
        scope: 'perPlayer',
        playerId: 2,
        zoneId: undefined,
        resolvePlayerName: (playerId) => `Player ${playerId}`,
        resolveZoneName: (zoneId) => zoneId,
      }),
    ).toBe('Player 2');
  });

  it('throws when per-player endpoint identity is missing', () => {
    expect(() =>
      formatTransferEndpointDisplay({
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
      formatTransferEndpointDisplay({
        scope: 'zone',
        playerId: undefined,
        zoneId: undefined as unknown as string,
        resolvePlayerName: () => 'unused',
        resolveZoneName: (zoneId) => zoneId,
      }),
    ).toThrow('Missing endpoint identity for zone scope: zoneId');
  });

  it('renders global endpoint display', () => {
    expect(
      formatTransferEndpointDisplay({
        scope: 'global',
        playerId: undefined,
        zoneId: undefined,
        resolvePlayerName: () => 'unused',
        resolveZoneName: () => 'unused',
      }),
    ).toBe('Global');
  });

  it('throws when endpoint scope is missing at runtime', () => {
    expect(() =>
      formatTransferEndpointDisplay({
        scope: undefined as unknown as 'global',
        playerId: undefined,
        zoneId: undefined,
        resolvePlayerName: () => 'unused',
        resolveZoneName: () => 'unused',
      }),
    ).toThrow('Invalid transfer endpoint scope');
  });

  it('throws deterministic invalid-scope errors for non-domain endpoint scope values', () => {
    expect(() =>
      formatTransferEndpointDisplay({
        scope: 'bogus' as unknown as 'global',
        playerId: undefined,
        zoneId: undefined,
        resolvePlayerName: () => 'unused',
        resolveZoneName: () => 'unused',
      }),
    ).toThrow('Invalid transfer endpoint scope: bogus');

    expect(() =>
      formatTransferEndpointDisplay({
        scope: null as unknown as 'global',
        playerId: undefined,
        zoneId: undefined,
        resolvePlayerName: () => 'unused',
        resolveZoneName: () => 'unused',
      }),
    ).toThrow('Invalid transfer endpoint scope: null');
  });

  it('returns endpoint varName when it is a string', () => {
    expect(endpointVarNameAsString({ varName: 'pool' }, 'from')).toBe('pool');
  });

  it('throws deterministic error when endpoint varName is missing or non-string', () => {
    expect(() => endpointVarNameAsString({}, 'from')).toThrow(
      'Invalid transfer endpoint payload: from.varName must be a string',
    );

    expect(() => endpointVarNameAsString({ varName: 123 }, 'to')).toThrow(
      'Invalid transfer endpoint payload: to.varName must be a string',
    );
  });

  it('normalizes global transfer endpoints and ignores unrelated identity fields', () => {
    expect(normalizeTransferEndpoint({ scope: 'global', varName: 'bank' }, 'from')).toEqual({
      scope: 'global',
      varName: 'bank',
      playerId: undefined,
      zoneId: undefined,
    });

    expect(
      normalizeTransferEndpoint({ scope: 'global', varName: 'bank', player: 1, zone: 'zone-a' }, 'to'),
    ).toEqual({
      scope: 'global',
      varName: 'bank',
      playerId: undefined,
      zoneId: undefined,
    });
  });

  it('normalizes per-player transfer endpoints', () => {
    expect(normalizeTransferEndpoint({ scope: 'perPlayer', varName: 'coins', player: 2 }, 'from')).toEqual({
      scope: 'perPlayer',
      varName: 'coins',
      playerId: 2,
      zoneId: undefined,
    });
  });

  it('normalizes zone transfer endpoints', () => {
    expect(normalizeTransferEndpoint({ scope: 'zone', varName: 'pool', zone: 'zone-left' }, 'to')).toEqual({
      scope: 'zone',
      varName: 'pool',
      playerId: undefined,
      zoneId: 'zone-left',
    });
  });

  it('throws deterministic errors for malformed transfer endpoint payloads', () => {
    expect(() => normalizeTransferEndpoint(undefined, 'from')).toThrow(
      'Invalid transfer endpoint payload: from must be an object',
    );
    expect(() => normalizeTransferEndpoint('global', 'to')).toThrow(
      'Invalid transfer endpoint payload: to must be an object',
    );
    expect(() => normalizeTransferEndpoint({ scope: 'global' }, 'from')).toThrow(
      'Invalid transfer endpoint payload: from.varName must be a string',
    );
    expect(() => normalizeTransferEndpoint({ scope: 'global', varName: 123 }, 'to')).toThrow(
      'Invalid transfer endpoint payload: to.varName must be a string',
    );
    expect(() => normalizeTransferEndpoint({ scope: 'bogus', varName: 'x' }, 'from')).toThrow(
      'Invalid transfer endpoint scope: bogus',
    );
  });

  it('throws deterministic errors for missing scoped transfer endpoint identity', () => {
    expect(() => normalizeTransferEndpoint({ scope: 'perPlayer', varName: 'coins' }, 'from')).toThrow(
      'Missing endpoint identity for perPlayer scope: playerId',
    );
    expect(() => normalizeTransferEndpoint({ scope: 'perPlayer', varName: 'coins', player: NaN }, 'to')).toThrow(
      'Missing endpoint identity for perPlayer scope: playerId',
    );
    expect(
      () => normalizeTransferEndpoint({ scope: 'perPlayer', varName: 'coins', player: Infinity }, 'from'),
    ).toThrow('Missing endpoint identity for perPlayer scope: playerId');
    expect(() => normalizeTransferEndpoint({ scope: 'zone', varName: 'pool' }, 'to')).toThrow(
      'Missing endpoint identity for zone scope: zoneId',
    );
    expect(() => normalizeTransferEndpoint({ scope: 'zone', varName: 'pool', zone: 1 }, 'from')).toThrow(
      'Missing endpoint identity for zone scope: zoneId',
    );
  });
});
