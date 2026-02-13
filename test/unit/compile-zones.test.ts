import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { canonicalizeZoneSelector, materializeZoneDefs } from '../../src/cnl/compile-zones.js';

describe('materializeZoneDefs', () => {
  it('materializes unowned zones to :none and player zones to :0..max-1', () => {
    const result = materializeZoneDefs(
      [
        { id: 'deck', owner: 'none', visibility: 'hidden', ordering: 'stack' },
        { id: 'hand', owner: 'player', visibility: 'owner', ordering: 'stack' },
      ],
      3,
    );

    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(
      result.value.zones.map((zone) => zone.id),
      ['deck:none', 'hand:0', 'hand:1', 'hand:2'],
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

    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.value.zones[0]?.id, 'market:none');
    assert.equal(result.value.ownershipByBase.market, 'none');
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
    assert.deepEqual(result.diagnostics, []);
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
    const activeAlias = canonicalizeZoneSelector('hand:activePlayer', ownershipByBase, 'doc.actions.0.effects.0.draw.to');
    assert.equal(activeAlias.value, 'hand:active');
    assert.deepEqual(activeAlias.diagnostics, []);

    const numeric = canonicalizeZoneSelector('hand:2', ownershipByBase, 'doc.actions.0.effects.0.draw.to');
    assert.equal(numeric.value, 'hand:2');
    assert.deepEqual(numeric.diagnostics, []);
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
    assert.deepEqual(result.diagnostics, []);
  });

  it('resolves { concat: [...] } with number parts', () => {
    const extended = { ...ownershipByBase, 'zone42': 'none' } as const;
    const result = canonicalizeZoneSelector(
      { concat: ['zone', 42] },
      extended,
      'doc.effects.0.moveToken.to',
    );
    assert.equal(result.value, 'zone42:none');
    assert.deepEqual(result.diagnostics, []);
  });

  it('emits diagnostic for dynamic expressions in { concat: [...] }', () => {
    const result = canonicalizeZoneSelector(
      { concat: ['available-', { ref: 'binding', name: '$faction' }] },
      ownershipByBase,
      'doc.effects.0.moveToken.to',
    );
    assert.equal(result.value, null);
    assert.equal(result.diagnostics[0]?.code, 'CNL_COMPILER_ZONE_CONCAT_DYNAMIC');
  });

  it('passes through $-prefixed binding references without canonicalization', () => {
    const result = canonicalizeZoneSelector('$targetSpace', ownershipByBase, 'doc.effects.0.moveToken.to');
    assert.equal(result.value, '$targetSpace');
    assert.deepEqual(result.diagnostics, []);
  });
});
