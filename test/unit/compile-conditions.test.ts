import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { lowerConditionNode, lowerQueryNode, lowerValueNode, type ConditionLoweringContext } from '../../src/cnl/compile-conditions.js';

const context: ConditionLoweringContext = {
  ownershipByBase: {
    deck: 'none',
    hand: 'player',
    board: 'none',
  },
};

describe('compile-conditions lowering', () => {
  it('lowers comparator condition with aggregate query and canonicalized zone selectors', () => {
    const result = lowerConditionNode(
      {
        op: '>=',
        left: {
          aggregate: {
            op: 'count',
            query: { query: 'tokensInZone', zone: 'deck' },
          },
        },
        right: 1,
      },
      context,
      'doc.actions.0.pre',
    );

    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(result.value, {
      op: '>=',
      left: {
        aggregate: {
          op: 'count',
          query: { query: 'tokensInZone', zone: 'deck:none' },
        },
      },
      right: 1,
    });
  });

  it('lowers query owner aliases for zones filter', () => {
    const result = lowerQueryNode(
      { query: 'zones', filter: { owner: 'activePlayer' } },
      context,
      'doc.actions.0.params.0.domain',
    );

    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(result.value, {
      query: 'zones',
      filter: { owner: 'active' },
    });
  });

  it('lowers zoneCount shorthand value node and canonicalizes zone selector', () => {
    const result = lowerValueNode({ zoneCount: 'deck' }, context, 'doc.actions.0.effects.0.addVar.delta');

    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(result.value, {
      ref: 'zoneCount',
      zone: 'deck:none',
    });
  });

  it('reports selector diagnostics for unknown zone bases in zoneCount references', () => {
    const result = lowerValueNode({ ref: 'zoneCount', zone: 'graveyard' }, context, 'doc.setup.0.if.when.left');

    assert.equal(result.value, null);
    assert.deepEqual(result.diagnostics, [
      {
        code: 'CNL_COMPILER_ZONE_SELECTOR_UNKNOWN_BASE',
        path: 'doc.setup.0.if.when.left.zone',
        severity: 'error',
        message: 'Unknown zone base "graveyard".',
        suggestion: 'Use a zone base declared in doc.zones.',
        alternatives: ['board', 'deck', 'hand'],
      },
    ]);
  });

  it('lowers division operator in value node', () => {
    const result = lowerValueNode(
      { op: '/', left: 10, right: 3 },
      context,
      'doc.actions.0.effects.0.addVar.delta',
    );

    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(result.value, { op: '/', left: 10, right: 3 });
  });

  it('lowers markerState reference with zone canonicalization', () => {
    const result = lowerValueNode(
      { ref: 'markerState', space: 'board', marker: 'support' },
      context,
      'doc.actions.0.pre.left',
    );

    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(result.value, { ref: 'markerState', space: 'board:none', marker: 'support' });
  });

  it('emits diagnostic for markerState with missing marker', () => {
    const result = lowerValueNode(
      { ref: 'markerState', space: 'board' },
      context,
      'doc.actions.0.pre.left',
    );

    assert.equal(result.value, null);
    assert.equal(result.diagnostics.length, 1);
    assert.equal(result.diagnostics[0]?.code, 'CNL_COMPILER_MISSING_CAPABILITY');
  });

  it('lowers tokenZone reference', () => {
    const result = lowerValueNode(
      { ref: 'tokenZone', token: '$piece' },
      context,
      'doc.actions.0.effects.0.moveToken.to',
    );

    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(result.value, { ref: 'tokenZone', token: '$piece' });
  });

  it('lowers zoneProp reference with zone canonicalization', () => {
    const result = lowerValueNode(
      { ref: 'zoneProp', zone: 'board', prop: 'population' },
      context,
      'doc.actions.0.pre.left',
    );

    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(result.value, { ref: 'zoneProp', zone: 'board:none', prop: 'population' });
  });

  it('lowers zonePropIncludes condition with zone canonicalization', () => {
    const result = lowerConditionNode(
      { op: 'zonePropIncludes', zone: 'board', prop: 'terrainTags', value: 'highland' },
      context,
      'doc.actions.0.pre',
    );

    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(result.value, {
      op: 'zonePropIncludes',
      zone: 'board:none',
      prop: 'terrainTags',
      value: 'highland',
    });
  });

  it('emits missing capability diagnostics with alternatives for unsupported query kinds', () => {
    const result = lowerQueryNode(
      { query: 'tokensMatchingPredicate', predicate: { op: 'truthy', value: '$x' } },
      context,
      'doc.actions.0.params.0.domain',
    );

    assert.equal(result.value, null);
    assert.equal(result.diagnostics.length, 1);
    assert.equal(result.diagnostics[0]?.code, 'CNL_COMPILER_MISSING_CAPABILITY');
    assert.equal(result.diagnostics[0]?.path, 'doc.actions.0.params.0.domain');
    assert.equal(result.diagnostics[0]?.severity, 'error');
    assert.ok((result.diagnostics[0]?.message ?? '').length > 0);
    assert.ok((result.diagnostics[0]?.alternatives ?? []).includes('tokensInZone'));
  });
});
