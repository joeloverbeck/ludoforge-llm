import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { normalizeActionExecutorSelector, normalizePlayerSelector, normalizeZoneOwnerQualifier } from '../../src/cnl/compile-selectors.js';

describe('normalizePlayerSelector', () => {
  it('normalizes canonical string selectors', () => {
    assert.equal(normalizePlayerSelector('actor', 'doc.actions.0.actor').value, 'actor');
    assert.equal(normalizePlayerSelector('active', 'doc.actions.0.actor').value, 'active');
    assert.equal(normalizePlayerSelector('all', 'doc.actions.0.actor').value, 'all');
    assert.equal(normalizePlayerSelector('allOther', 'doc.actions.0.actor').value, 'allOther');
  });

  it('rejects non-canonical alias selectors with canonical replacement guidance', () => {
    const result = normalizePlayerSelector('activePlayer', 'doc.actions.0.actor');
    assert.equal(result.value, null);
    assert.deepEqual(result.diagnostics, [
      {
        code: 'CNL_COMPILER_PLAYER_SELECTOR_INVALID',
        path: 'doc.actions.0.actor',
        severity: 'error',
        message: 'Non-canonical player selector: "activePlayer".',
        suggestion: 'Use "active".',
      },
    ]);
  });

  it('normalizes relative, numeric, and binding selectors', () => {
    assert.deepEqual(normalizePlayerSelector('left', 'doc.actions.0.actor').value, { relative: 'left' });
    assert.deepEqual(normalizePlayerSelector('right', 'doc.actions.0.actor').value, { relative: 'right' });
    assert.deepEqual(normalizePlayerSelector('2', 'doc.actions.0.actor').value, { id: 2 });
    assert.deepEqual(normalizePlayerSelector('$player', 'doc.actions.0.actor').value, { chosen: '$player' });
  });

  it('accepts already-normalized object selectors', () => {
    assert.deepEqual(normalizePlayerSelector({ id: 1 }, 'doc.actions.0.actor').value, { id: 1 });
    assert.deepEqual(normalizePlayerSelector({ chosen: '$picked' }, 'doc.actions.0.actor').value, { chosen: '$picked' });
    assert.deepEqual(normalizePlayerSelector({ relative: 'right' }, 'doc.actions.0.actor').value, { relative: 'right' });
  });

  it('emits actionable diagnostics for invalid selectors', () => {
    const result = normalizePlayerSelector('nobody', 'doc.actions.0.actor');
    assert.equal(result.value, null);
    assert.deepEqual(result.diagnostics, [
      {
        code: 'CNL_COMPILER_PLAYER_SELECTOR_INVALID',
        path: 'doc.actions.0.actor',
        severity: 'error',
        message: 'Invalid player selector: "nobody".',
        suggestion: 'Use one of: actor, active, all, allOther, left, right, <playerId>, or $binding.',
      },
    ]);
  });

  describe('with seatIds', () => {
    const fitlSeats = ['US', 'ARVN', 'NVA', 'VC'] as const;
    const path = 'doc.effects.0.chooseN.chooser';

    it('resolves seat names to player id indices', () => {
      assert.deepEqual(normalizePlayerSelector('US', path, fitlSeats).value, { id: 0 });
      assert.deepEqual(normalizePlayerSelector('ARVN', path, fitlSeats).value, { id: 1 });
      assert.deepEqual(normalizePlayerSelector('NVA', path, fitlSeats).value, { id: 2 });
      assert.deepEqual(normalizePlayerSelector('VC', path, fitlSeats).value, { id: 3 });
    });

    it('rejects unknown seat names', () => {
      const result = normalizePlayerSelector('unknown', path, fitlSeats);
      assert.equal(result.value, null);
      assert.equal(result.diagnostics.length, 1);
      assert.equal(result.diagnostics[0]?.code, 'CNL_COMPILER_PLAYER_SELECTOR_INVALID');
    });

    it('rejects seat names when seatIds is not provided (backwards compat)', () => {
      const result = normalizePlayerSelector('NVA', path);
      assert.equal(result.value, null);
      assert.equal(result.diagnostics.length, 1);
      assert.equal(result.diagnostics[0]?.code, 'CNL_COMPILER_PLAYER_SELECTOR_INVALID');
    });

    it('keyword selectors take priority over seat names', () => {
      const seatsWithKeyword = ['active', 'actor', 'all'] as const;
      assert.equal(normalizePlayerSelector('active', path, seatsWithKeyword).value, 'active');
      assert.equal(normalizePlayerSelector('actor', path, seatsWithKeyword).value, 'actor');
      assert.equal(normalizePlayerSelector('all', path, seatsWithKeyword).value, 'all');
    });

    it('numeric strings take priority over seat names', () => {
      const seatsWithNumeric = ['0', '1', 'NVA'] as const;
      assert.deepEqual(normalizePlayerSelector('0', path, seatsWithNumeric).value, { id: 0 });
      assert.deepEqual(normalizePlayerSelector('1', path, seatsWithNumeric).value, { id: 1 });
    });

    it('binding tokens take priority over seat names', () => {
      const seatsWithBinding = ['$var', 'NVA'] as const;
      assert.deepEqual(normalizePlayerSelector('$var', path, seatsWithBinding).value, { chosen: '$var' });
    });

    it('resolves seat names case-insensitively', () => {
      const lowerSeats = ['us', 'arvn', 'nva', 'vc'] as const;
      assert.deepEqual(normalizePlayerSelector('NVA', path, lowerSeats).value, { id: 2 });
      assert.deepEqual(normalizePlayerSelector('nva', path, lowerSeats).value, { id: 2 });
      assert.deepEqual(normalizePlayerSelector('US', path, lowerSeats).value, { id: 0 });
      assert.deepEqual(normalizePlayerSelector('Arvn', path, lowerSeats).value, { id: 1 });
    });
  });
});

describe('normalizeZoneOwnerQualifier', () => {
  it('normalizes none/all and canonical player qualifiers', () => {
    assert.equal(normalizeZoneOwnerQualifier('none', 'doc.actions.0.effects.0.draw.to').value, 'none');
    assert.equal(normalizeZoneOwnerQualifier('all', 'doc.actions.0.effects.0.draw.to').value, 'all');
    assert.equal(normalizeZoneOwnerQualifier('active', 'doc.actions.0.effects.0.draw.to').value, 'active');
    assert.equal(normalizeZoneOwnerQualifier('2', 'doc.actions.0.effects.0.draw.to').value, '2');
    assert.equal(normalizeZoneOwnerQualifier('$owner', 'doc.actions.0.effects.0.draw.to').value, '$owner');
  });

  it('rejects non-canonical player owner qualifier aliases', () => {
    const result = normalizeZoneOwnerQualifier('activePlayer', 'doc.actions.0.effects.0.draw.to');
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

  it('reports invalid owner qualifier with zone-selector error code', () => {
    const result = normalizeZoneOwnerQualifier('allPlayers', 'doc.actions.0.effects.0.draw.to');
    assert.equal(result.value, null);
    assert.equal(result.diagnostics[0]?.code, 'CNL_COMPILER_ZONE_SELECTOR_INVALID');
    assert.equal(result.diagnostics[0]?.path, 'doc.actions.0.effects.0.draw.to');
  });
});

describe('normalizeActionExecutorSelector', () => {
  it('accepts single-player executor selectors', () => {
    assert.equal(normalizeActionExecutorSelector('actor', 'doc.actions.0.executor').value, 'actor');
    assert.equal(normalizeActionExecutorSelector('active', 'doc.actions.0.executor').value, 'active');
    assert.deepEqual(normalizeActionExecutorSelector('1', 'doc.actions.0.executor').value, { id: 1 });
    assert.deepEqual(normalizeActionExecutorSelector('left', 'doc.actions.0.executor').value, { relative: 'left' });
    assert.deepEqual(normalizeActionExecutorSelector('$owner', 'doc.actions.0.executor').value, { chosen: '$owner' });
  });

  it('rejects multi-player executor selectors', () => {
    const allResult = normalizeActionExecutorSelector('all', 'doc.actions.0.executor');
    assert.equal(allResult.value, null);
    assert.equal(allResult.diagnostics[0]?.code, 'CNL_COMPILER_PLAYER_SELECTOR_INVALID');
  });
});
