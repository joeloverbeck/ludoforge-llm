import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { normalizeActionExecutorSelector, normalizePlayerSelector, normalizeZoneOwnerQualifier } from '../../src/cnl/compile-selectors.js';

describe('normalizePlayerSelector', () => {
  it('normalizes canonical string selectors and aliases', () => {
    assert.equal(normalizePlayerSelector('actor', 'doc.actions.0.actor').value, 'actor');
    assert.equal(normalizePlayerSelector('activePlayer', 'doc.actions.0.actor').value, 'active');
    assert.equal(normalizePlayerSelector('active', 'doc.actions.0.actor').value, 'active');
    assert.equal(normalizePlayerSelector('all', 'doc.actions.0.actor').value, 'all');
    assert.equal(normalizePlayerSelector('allOther', 'doc.actions.0.actor').value, 'allOther');
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
        suggestion: 'Use one of: actor, active, activePlayer, all, allOther, left, right, <playerId>, or $binding.',
      },
    ]);
  });
});

describe('normalizeZoneOwnerQualifier', () => {
  it('normalizes none/all and player-qualifier aliases', () => {
    assert.equal(normalizeZoneOwnerQualifier('none', 'doc.actions.0.effects.0.draw.to').value, 'none');
    assert.equal(normalizeZoneOwnerQualifier('all', 'doc.actions.0.effects.0.draw.to').value, 'all');
    assert.equal(normalizeZoneOwnerQualifier('activePlayer', 'doc.actions.0.effects.0.draw.to').value, 'active');
    assert.equal(normalizeZoneOwnerQualifier('2', 'doc.actions.0.effects.0.draw.to').value, '2');
    assert.equal(normalizeZoneOwnerQualifier('$owner', 'doc.actions.0.effects.0.draw.to').value, '$owner');
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
