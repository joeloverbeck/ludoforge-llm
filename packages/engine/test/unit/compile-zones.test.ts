import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { canonicalizeZoneSelector, materializeZoneDefs } from '../../src/cnl/compile-zones.js';
import { assertNoDiagnostics } from '../helpers/diagnostic-helpers.js';

describe('materializeZoneDefs', () => {
  it('materializes unowned zones to :none and player zones to :0..max-1', () => {
    const result = materializeZoneDefs(
      [
        { id: 'deck', owner: 'none', visibility: 'hidden', ordering: 'stack' },
        { id: 'hand', owner: 'player', visibility: 'owner', ordering: 'stack' },
      ],
      3,
    );

    assertNoDiagnostics(result);
    assert.deepEqual(
      result.value.zones.map((zone) => zone.id),
      ['deck:none', 'hand:0', 'hand:1', 'hand:2'],
    );
    assert.deepEqual(
      result.value.zones.map((zone) => zone.ownerPlayerIndex ?? null),
      [null, 0, 1, 2],
    );
    assert.deepEqual(result.value.ownershipByBase, {
      deck: 'none',
      hand: 'player',
    });
  });

  it('preserves bare-zone base when input id is already qualified', () => {
    const result = materializeZoneDefs(
      [{ id: 'market:none', owner: 'none', visibility: 'public', ordering: 'set' }],
      2,
    );

    assertNoDiagnostics(result);
    assert.equal(result.value.zones[0]?.id, 'market:none');
    assert.equal(result.value.ownershipByBase.market, 'none');
  });

  it('preserves explicit zone layoutRole in emitted ZoneDef records', () => {
    const result = materializeZoneDefs(
      [
        { id: 'deck', owner: 'none', visibility: 'hidden', ordering: 'stack', layoutRole: 'card' },
        { id: 'pool', owner: 'none', visibility: 'public', ordering: 'set', layoutRole: 'forcePool' },
      ],
      2,
    );

    assertNoDiagnostics(result);
    assert.equal(result.value.zones[0]?.layoutRole, 'card');
    assert.equal(result.value.zones[1]?.layoutRole, 'forcePool');
  });

  it('rejects invalid layoutRole values', () => {
    const result = materializeZoneDefs(
      [{ id: 'deck', owner: 'none', visibility: 'hidden', ordering: 'stack', layoutRole: 'invalid-role' as unknown as 'card' }],
      2,
    );

    assert.equal(result.value.zones.length, 0);
    assert.deepEqual(result.diagnostics, [
      {
        code: 'CNL_COMPILER_ZONE_LAYOUT_ROLE_INVALID',
        path: 'doc.zones.0.layoutRole',
        severity: 'error',
        message: 'Zone layoutRole "invalid-role" is invalid.',
        suggestion: 'Use layoutRole "card", "forcePool", "hand", or "other".',
      },
    ]);
  });
});

describe('canonicalizeZoneSelector', () => {
  const ownershipByBase = {
    deck: 'none',
    hand: 'player',
    bank: 'mixed',
  } as const;

  it('canonicalizes bare unowned base to :none', () => {
    const result = canonicalizeZoneSelector('deck', ownershipByBase, 'doc.actions.0.effects.0.draw.from');
    assert.equal(result.value, 'deck:none');
    assertNoDiagnostics(result);
  });

  it('reports ambiguity for bare player-owned or mixed bases', () => {
    const playerOwned = canonicalizeZoneSelector('hand', ownershipByBase, 'doc.actions.0.effects.0.draw.to');
    assert.equal(playerOwned.value, null);
    assert.equal(playerOwned.diagnostics[0]?.code, 'CNL_COMPILER_ZONE_SELECTOR_AMBIGUOUS');

    const mixed = canonicalizeZoneSelector('bank', ownershipByBase, 'doc.actions.0.effects.0.draw.to');
    assert.equal(mixed.value, null);
    assert.equal(mixed.diagnostics[0]?.code, 'CNL_COMPILER_ZONE_SELECTOR_AMBIGUOUS');
  });

  it('canonicalizes explicit selectors to zoneBase:qualifier form', () => {
    const numeric = canonicalizeZoneSelector('hand:2', ownershipByBase, 'doc.actions.0.effects.0.draw.to');
    assert.equal(numeric.value, 'hand:2');
    assertNoDiagnostics(numeric);
  });

  it('rejects non-canonical owner qualifier aliases with deterministic diagnostics', () => {
    const result = canonicalizeZoneSelector('hand:activePlayer', ownershipByBase, 'doc.actions.0.effects.0.draw.to');
    assert.equal(result.value, null);
    assert.deepEqual(result.diagnostics, [
      {
        code: 'CNL_COMPILER_ZONE_SELECTOR_INVALID',
        path: 'doc.actions.0.effects.0.draw.to',
        severity: 'error',
        message: 'Non-canonical player selector: "activePlayer".',
        suggestion: 'Use "active".',
      },
    ]);
  });

  it('returns stable diagnostic paths for invalid selectors', () => {
    const unknown = canonicalizeZoneSelector('graveyard', ownershipByBase, 'doc.actions.0.effects.0.draw.from');
    assert.equal(unknown.value, null);
    assert.deepEqual(unknown.diagnostics, [
      {
        code: 'CNL_COMPILER_ZONE_SELECTOR_UNKNOWN_BASE',
        path: 'doc.actions.0.effects.0.draw.from',
        severity: 'error',
        message: 'Unknown zone base "graveyard".',
        suggestion: 'Use a zone base declared in doc.zones.',
        alternatives: ['bank', 'deck', 'hand'],
      },
    ]);
  });

  it('resolves static { concat: [...] } to a joined string at compile time', () => {
    const extended = { ...ownershipByBase, 'available-US': 'none' } as const;
    const result = canonicalizeZoneSelector(
      { concat: ['available-', 'US'] },
      extended,
      'doc.effects.0.moveToken.to',
    );
    assert.equal(result.value, 'available-US:none');
    assertNoDiagnostics(result);
  });

  it('resolves { concat: [...] } with number parts', () => {
    const extended = { ...ownershipByBase, 'zone42': 'none' } as const;
    const result = canonicalizeZoneSelector(
      { concat: ['zone', 42] },
      extended,
      'doc.effects.0.moveToken.to',
    );
    assert.equal(result.value, 'zone42:none');
    assertNoDiagnostics(result);
  });

  it('falls through to invalid selector for dynamic concat (handled by caller)', () => {
    const result = canonicalizeZoneSelector(
      { concat: ['available-', { ref: 'binding', name: '$faction' }] },
      ownershipByBase,
      'doc.effects.0.moveToken.to',
    );
    assert.equal(result.value, null);
    assert.equal(result.diagnostics[0]?.code, 'CNL_COMPILER_ZONE_SELECTOR_INVALID');
  });

  it('passes through $-prefixed binding references without canonicalization', () => {
    const result = canonicalizeZoneSelector('$targetSpace', ownershipByBase, 'doc.effects.0.moveToken.to');
    assert.equal(result.value, '$targetSpace');
    assertNoDiagnostics(result);
  });
});
