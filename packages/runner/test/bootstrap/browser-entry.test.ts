import { describe, expect, it } from 'vitest';

import { resolveBrowserBootstrapEntryRequest } from '../../src/bootstrap/browser-entry.js';

describe('browser-entry', () => {
  it('returns null when no game query param is present', () => {
    expect(resolveBrowserBootstrapEntryRequest('')).toBeNull();
  });

  it('parses a known game query into a typed entry request', () => {
    expect(resolveBrowserBootstrapEntryRequest('?game=fitl&seed=77&player=3')).toEqual({
      gameId: 'fitl',
      seed: 77,
      playerId: 3,
    });
  });

  it('falls back to descriptor defaults for invalid numeric params', () => {
    expect(resolveBrowserBootstrapEntryRequest('?game=fitl&seed=NaN&player=-1')).toEqual({
      gameId: 'fitl',
      seed: 42,
      playerId: 0,
    });
  });

  it('returns null for unknown game query values instead of falling through to a hidden default', () => {
    expect(resolveBrowserBootstrapEntryRequest('?game=missing')).toBeNull();
  });
});
