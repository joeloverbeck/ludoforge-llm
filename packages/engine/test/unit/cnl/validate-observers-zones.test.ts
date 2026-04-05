import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Diagnostic } from '../../../src/kernel/diagnostics.js';
import {
  validateObservers,
  type KnownSurfaceIds,
  type KnownZoneInfo,
} from '../../../src/cnl/validate-observers.js';

function errors(diagnostics: readonly Diagnostic[]): readonly Diagnostic[] {
  return diagnostics.filter((d) => d.severity === 'error');
}

function warnings(diagnostics: readonly Diagnostic[]): readonly Diagnostic[] {
  return diagnostics.filter((d) => d.severity === 'warning');
}

const DEFAULT_KNOWN_IDS: KnownSurfaceIds = {
  globalVars: new Set(['score']),
  globalMarkers: new Set(),
  perPlayerVars: new Set(['health']),
  derivedMetrics: new Set(),
};

const DEFAULT_ZONE_INFO: KnownZoneInfo = {
  zoneBaseIds: new Set(['hand', 'deck', 'board', 'discard']),
  zoneOrderingByBase: { hand: 'stack', deck: 'stack', board: 'set', discard: 'queue' },
  zoneOwnershipByBase: { hand: 'player', deck: 'none', board: 'none', discard: 'none' },
};

function makeObservability(zones: Record<string, unknown>) {
  return {
    observers: {
      player: { zones },
    },
  } as never;
}

describe('validateObservers — zone validation', () => {
  // --- Acceptance Criterion 1: Valid zone entries pass ---
  it('accepts valid zone entries with no diagnostics', () => {
    const diagnostics: Diagnostic[] = [];
    validateObservers(
      makeObservability({
        hand: { tokens: 'owner', order: 'owner' },
        deck: { tokens: 'hidden', order: 'hidden' },
      }),
      DEFAULT_KNOWN_IDS,
      DEFAULT_ZONE_INFO,
      diagnostics,
    );
    assert.equal(errors(diagnostics).length, 0, `unexpected errors: ${JSON.stringify(errors(diagnostics))}`);
    assert.equal(warnings(diagnostics).length, 0, `unexpected warnings: ${JSON.stringify(warnings(diagnostics))}`);
  });

  // --- Acceptance Criterion 2: Unknown zone base ID ---
  it('emits error for unknown zone base ID', () => {
    const diagnostics: Diagnostic[] = [];
    validateObservers(
      makeObservability({
        unknownZone: { tokens: 'public', order: 'public' },
      }),
      DEFAULT_KNOWN_IDS,
      DEFAULT_ZONE_INFO,
      diagnostics,
    );
    const errs = errors(diagnostics);
    assert.equal(errs.length, 1);
    assert.equal(errs[0]!.code, 'CNL_VALIDATOR_OBSERVER_ZONE_UNKNOWN_BASE');
    assert.ok(errs[0]!.message.includes('unknownZone'));
  });

  // --- Acceptance Criterion 3: Invalid visibility class ---
  it('emits error for invalid tokens visibility class', () => {
    const diagnostics: Diagnostic[] = [];
    validateObservers(
      makeObservability({
        hand: { tokens: 'seatVisible', order: 'public' },
      }),
      DEFAULT_KNOWN_IDS,
      DEFAULT_ZONE_INFO,
      diagnostics,
    );
    const errs = errors(diagnostics);
    assert.equal(errs.length, 1);
    assert.equal(errs[0]!.code, 'CNL_VALIDATOR_OBSERVER_ZONE_VISIBILITY_INVALID');
    assert.ok(errs[0]!.message.includes('tokens'));
  });

  it('emits error for invalid order visibility class', () => {
    const diagnostics: Diagnostic[] = [];
    validateObservers(
      makeObservability({
        deck: { tokens: 'hidden', order: 'bogus' },
      }),
      DEFAULT_KNOWN_IDS,
      DEFAULT_ZONE_INFO,
      diagnostics,
    );
    const errs = errors(diagnostics);
    assert.equal(errs.length, 1);
    assert.equal(errs[0]!.code, 'CNL_VALIDATOR_OBSERVER_ZONE_VISIBILITY_INVALID');
    assert.ok(errs[0]!.message.includes('order'));
  });

  // --- Acceptance Criterion 4: Empty zone entry ---
  it('emits error for empty zone entry (no tokens or order)', () => {
    const diagnostics: Diagnostic[] = [];
    validateObservers(
      makeObservability({
        hand: {},
      }),
      DEFAULT_KNOWN_IDS,
      DEFAULT_ZONE_INFO,
      diagnostics,
    );
    const errs = errors(diagnostics);
    assert.equal(errs.length, 1);
    assert.equal(errs[0]!.code, 'CNL_VALIDATOR_OBSERVER_ZONE_ENTRY_EMPTY');
  });

  // --- Acceptance Criterion 5: zones key no longer reserved ---
  it('does not emit reserved-key error for zones', () => {
    const diagnostics: Diagnostic[] = [];
    validateObservers(
      makeObservability({
        hand: { tokens: 'owner', order: 'owner' },
      }),
      DEFAULT_KNOWN_IDS,
      DEFAULT_ZONE_INFO,
      diagnostics,
    );
    assert.ok(!diagnostics.some((d) => d.code === 'CNL_VALIDATOR_OBSERVER_RESERVED_KEY'));
  });

  // --- Acceptance Criterion 6: Set-zone order warning ---
  it('warns when order differs from tokens on set-type zone', () => {
    const diagnostics: Diagnostic[] = [];
    validateObservers(
      makeObservability({
        board: { tokens: 'public', order: 'hidden' },
      }),
      DEFAULT_KNOWN_IDS,
      DEFAULT_ZONE_INFO,
      diagnostics,
    );
    assert.equal(errors(diagnostics).length, 0);
    const warns = warnings(diagnostics);
    assert.equal(warns.length, 1);
    assert.equal(warns[0]!.code, 'CNL_VALIDATOR_OBSERVER_ZONE_ORDER_SET_WARNING');
  });

  it('does not warn when order matches tokens on set-type zone', () => {
    const diagnostics: Diagnostic[] = [];
    validateObservers(
      makeObservability({
        board: { tokens: 'public', order: 'public' },
      }),
      DEFAULT_KNOWN_IDS,
      DEFAULT_ZONE_INFO,
      diagnostics,
    );
    assert.equal(warnings(diagnostics).length, 0);
  });

  // --- Acceptance Criterion 7: Owner on non-owned zone ---
  it('warns when tokens: owner on owner: none zone', () => {
    const diagnostics: Diagnostic[] = [];
    validateObservers(
      makeObservability({
        deck: { tokens: 'owner', order: 'hidden' },
      }),
      DEFAULT_KNOWN_IDS,
      DEFAULT_ZONE_INFO,
      diagnostics,
    );
    assert.equal(errors(diagnostics).length, 0);
    const warns = warnings(diagnostics);
    assert.equal(warns.length, 1);
    assert.equal(warns[0]!.code, 'CNL_VALIDATOR_OBSERVER_ZONE_OWNER_NONE_WARNING');
  });

  it('warns when order: owner on owner: none zone', () => {
    const diagnostics: Diagnostic[] = [];
    validateObservers(
      makeObservability({
        deck: { tokens: 'hidden', order: 'owner' },
      }),
      DEFAULT_KNOWN_IDS,
      DEFAULT_ZONE_INFO,
      diagnostics,
    );
    const warns = warnings(diagnostics);
    assert.equal(warns.length, 1);
    assert.equal(warns[0]!.code, 'CNL_VALIDATOR_OBSERVER_ZONE_OWNER_NONE_WARNING');
  });

  it('does not warn for owner visibility on player-owned zone', () => {
    const diagnostics: Diagnostic[] = [];
    validateObservers(
      makeObservability({
        hand: { tokens: 'owner', order: 'owner' },
      }),
      DEFAULT_KNOWN_IDS,
      DEFAULT_ZONE_INFO,
      diagnostics,
    );
    assert.equal(warnings(diagnostics).length, 0);
  });

  // --- Acceptance Criterion 8: _default entry ---
  it('accepts _default entry with valid values', () => {
    const diagnostics: Diagnostic[] = [];
    validateObservers(
      makeObservability({
        _default: { tokens: 'hidden', order: 'hidden' },
        hand: { tokens: 'owner', order: 'owner' },
      }),
      DEFAULT_KNOWN_IDS,
      DEFAULT_ZONE_INFO,
      diagnostics,
    );
    assert.equal(errors(diagnostics).length, 0);
    assert.equal(warnings(diagnostics).length, 0);
  });

  // --- Edge cases ---
  it('emits error when zone entry is not an object', () => {
    const diagnostics: Diagnostic[] = [];
    validateObservers(
      makeObservability({
        hand: 'hidden',
      }),
      DEFAULT_KNOWN_IDS,
      DEFAULT_ZONE_INFO,
      diagnostics,
    );
    const errs = errors(diagnostics);
    assert.equal(errs.length, 1);
    assert.equal(errs[0]!.code, 'CNL_VALIDATOR_OBSERVER_ZONE_ENTRY_INVALID');
  });

  it('emits error when zones is not an object', () => {
    const diagnostics: Diagnostic[] = [];
    validateObservers(
      {
        observers: {
          player: { zones: 'bad' },
        },
      } as never,
      DEFAULT_KNOWN_IDS,
      DEFAULT_ZONE_INFO,
      diagnostics,
    );
    const errs = errors(diagnostics);
    assert.ok(errs.some((d) => d.code === 'CNL_VALIDATOR_OBSERVER_ZONES_INVALID'));
  });

  it('warns for unknown keys in zone entry', () => {
    const diagnostics: Diagnostic[] = [];
    validateObservers(
      makeObservability({
        hand: { tokens: 'owner', order: 'owner', extra: true },
      }),
      DEFAULT_KNOWN_IDS,
      DEFAULT_ZONE_INFO,
      diagnostics,
    );
    assert.equal(errors(diagnostics).length, 0);
    const warns = warnings(diagnostics);
    assert.ok(warns.some((d) => d.code === 'CNL_VALIDATOR_OBSERVER_ZONE_ENTRY_UNKNOWN_KEY'));
  });

  it('skips zone base ID validation when knownZoneInfo is undefined', () => {
    const diagnostics: Diagnostic[] = [];
    validateObservers(
      makeObservability({
        anyZone: { tokens: 'public', order: 'public' },
      }),
      DEFAULT_KNOWN_IDS,
      undefined,
      diagnostics,
    );
    // No error for unknown zone — zone info not available
    assert.ok(!errors(diagnostics).some((d) => d.code === 'CNL_VALIDATOR_OBSERVER_ZONE_UNKNOWN_BASE'));
  });

  it('accepts zone entry with only tokens (no order)', () => {
    const diagnostics: Diagnostic[] = [];
    validateObservers(
      makeObservability({
        hand: { tokens: 'owner' },
      }),
      DEFAULT_KNOWN_IDS,
      DEFAULT_ZONE_INFO,
      diagnostics,
    );
    assert.equal(errors(diagnostics).length, 0);
  });

  it('accepts zone entry with only order (no tokens)', () => {
    const diagnostics: Diagnostic[] = [];
    validateObservers(
      makeObservability({
        hand: { order: 'owner' },
      }),
      DEFAULT_KNOWN_IDS,
      DEFAULT_ZONE_INFO,
      diagnostics,
    );
    assert.equal(errors(diagnostics).length, 0);
  });
});
