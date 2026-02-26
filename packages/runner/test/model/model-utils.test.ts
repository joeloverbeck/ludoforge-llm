import { describe, expect, it } from 'vitest';

import { formatScopePrefixDisplay, optionalPlayerId } from '../../src/model/model-utils.js';
import * as modelUtils from '../../src/model/model-utils.js';

describe('model-utils', () => {
  it('returns an empty object for undefined playerId', () => {
    expect(optionalPlayerId(undefined)).toEqual({});
  });

  it('returns playerId when present', () => {
    expect(optionalPlayerId(2)).toEqual({ playerId: 2 });
  });

  it('renders per-player scope prefix display', () => {
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

  it('renders empty prefix for global scope', () => {
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

  it('does not expose transfer-endpoint module APIs', () => {
    expect(modelUtils).not.toHaveProperty('normalizeTransferEndpoint');
    expect(modelUtils).not.toHaveProperty('formatTransferEndpointDisplay');
  });
});
