import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { lowerConditionNode, lowerQueryNode, lowerValueNode, type ConditionLoweringContext } from '../../src/cnl/compile-conditions.js';
import { assertNoDiagnostics } from '../helpers/diagnostic-helpers.js';

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

    assertNoDiagnostics(result);
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

    assertNoDiagnostics(result);
    assert.deepEqual(result.value, {
      query: 'zones',
      filter: { owner: 'active' },
    });
  });

  it('lowers zoneCount shorthand value node and canonicalizes zone selector', () => {
    const result = lowerValueNode({ zoneCount: 'deck' }, context, 'doc.actions.0.effects.0.addVar.delta');

    assertNoDiagnostics(result);
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

    assertNoDiagnostics(result);
    assert.deepEqual(result.value, { op: '/', left: 10, right: 3 });
  });

  it('lowers floorDiv and ceilDiv operators in value node', () => {
    const floorResult = lowerValueNode(
      { op: 'floorDiv', left: 10, right: 3 },
      context,
      'doc.actions.0.effects.0.addVar.delta',
    );
    const ceilResult = lowerValueNode(
      { op: 'ceilDiv', left: 10, right: 3 },
      context,
      'doc.actions.0.effects.0.addVar.delta',
    );

    assertNoDiagnostics(floorResult);
    assertNoDiagnostics(ceilResult);
    assert.deepEqual(floorResult.value, { op: 'floorDiv', left: 10, right: 3 });
    assert.deepEqual(ceilResult.value, { op: 'ceilDiv', left: 10, right: 3 });
  });

  it('lowers markerState reference with zone canonicalization', () => {
    const result = lowerValueNode(
      { ref: 'markerState', space: 'board', marker: 'support' },
      context,
      'doc.actions.0.pre.left',
    );

    assertNoDiagnostics(result);
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

  it('lowers globalMarkerState reference', () => {
    const result = lowerValueNode(
      { ref: 'globalMarkerState', marker: 'cap_topGun' },
      context,
      'doc.actions.0.pre.left',
    );

    assertNoDiagnostics(result);
    assert.deepEqual(result.value, { ref: 'globalMarkerState', marker: 'cap_topGun' });
  });

  it('lowers tokenZone reference', () => {
    const result = lowerValueNode(
      { ref: 'tokenZone', token: '$piece' },
      context,
      'doc.actions.0.effects.0.moveToken.to',
    );

    assertNoDiagnostics(result);
    assert.deepEqual(result.value, { ref: 'tokenZone', token: '$piece' });
  });

  it('lowers zoneProp reference with zone canonicalization', () => {
    const result = lowerValueNode(
      { ref: 'zoneProp', zone: 'board', prop: 'population' },
      context,
      'doc.actions.0.pre.left',
    );

    assertNoDiagnostics(result);
    assert.deepEqual(result.value, { ref: 'zoneProp', zone: 'board:none', prop: 'population' });
  });

  it('lowers zonePropIncludes condition with zone canonicalization', () => {
    const result = lowerConditionNode(
      { op: 'zonePropIncludes', zone: 'board', prop: 'terrainTags', value: 'highland' },
      context,
      'doc.actions.0.pre',
    );

    assertNoDiagnostics(result);
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

  it('lowers query: binding as a pass-through binding reference', () => {
    const result = lowerQueryNode(
      { query: 'binding', name: '$targetSpaces' },
      context,
      'doc.actionPipelines.0.stages.0.effects.0.forEach.over',
    );

    assertNoDiagnostics(result);
    assert.deepEqual(result.value, { query: 'binding', name: '$targetSpaces' });
  });

  it('lowers boolean literal true as ConditionAST passthrough', () => {
    const result = lowerConditionNode(true, context, 'doc.actionPipelines.0.legality');
    assertNoDiagnostics(result);
    assert.equal(result.value, true);
  });

  it('lowers boolean literal false as ConditionAST passthrough', () => {
    const result = lowerConditionNode(false, context, 'doc.actionPipelines.0.legality');
    assertNoDiagnostics(result);
    assert.equal(result.value, false);
  });

  it('lowers zones query with ConditionAST filter', () => {
    const result = lowerQueryNode(
      {
        query: 'zones',
        filter: {
          op: 'and',
          args: [
            { op: '==', left: { ref: 'zoneProp', zone: 'board', prop: 'spaceType' }, right: 'province' },
            { op: 'not', arg: { op: '==', left: { ref: 'zoneProp', zone: 'board', prop: 'control' }, right: 'NVA' } },
          ],
        },
      },
      context,
      'doc.actionPipelines.0.stages.0.effects.0.chooseN.options',
    );

    assertNoDiagnostics(result);
    assert.deepEqual(result.value, {
      query: 'zones',
      filter: {
        condition: {
          op: 'and',
          args: [
            { op: '==', left: { ref: 'zoneProp', zone: 'board:none', prop: 'spaceType' }, right: 'province' },
            { op: 'not', arg: { op: '==', left: { ref: 'zoneProp', zone: 'board:none', prop: 'control' }, right: 'NVA' } },
          ],
        },
      },
    });
  });

  it('lowers mapSpaces query with ConditionAST filter', () => {
    const result = lowerQueryNode(
      {
        query: 'mapSpaces',
        filter: {
          op: '==',
          left: { ref: 'zoneProp', zone: 'board', prop: 'spaceType' },
          right: 'province',
        },
      },
      context,
      'doc.actionPipelines.0.stages.0.effects.0.chooseN.options',
    );

    assertNoDiagnostics(result);
    assert.deepEqual(result.value, {
      query: 'mapSpaces',
      filter: {
        condition: {
          op: '==',
          left: { ref: 'zoneProp', zone: 'board:none', prop: 'spaceType' },
          right: 'province',
        },
      },
    });
  });

  it('lowers tokensInZone query with string literal token filters', () => {
    const result = lowerQueryNode(
      {
        query: 'tokensInZone',
        zone: 'board',
        filter: [
          { prop: 'type', eq: 'troops' },
          { prop: 'faction', eq: 'ARVN' },
        ],
      },
      context,
      'doc.actionPipelines.0.stages.0.effects.0.forEach.over',
    );

    assertNoDiagnostics(result);
    assert.deepEqual(result.value, {
      query: 'tokensInZone',
      zone: 'board:none',
      filter: [
        { prop: 'type', op: 'eq', value: 'troops' },
        { prop: 'faction', op: 'eq', value: 'ARVN' },
      ],
    });
  });

  it('lowers tokensInZone filter with explicit op and reference value', () => {
    const result = lowerQueryNode(
      {
        query: 'tokensInZone',
        zone: 'board',
        filter: [
          { prop: 'faction', op: 'neq', value: { ref: 'activePlayer' } },
        ],
      },
      context,
      'doc.actionPipelines.0.stages.0.effects.0.forEach.over',
    );

    assertNoDiagnostics(result);
    assert.deepEqual(result.value, {
      query: 'tokensInZone',
      zone: 'board:none',
      filter: [
        { prop: 'faction', op: 'neq', value: { ref: 'activePlayer' } },
      ],
    });
  });

  it('lowers tokensInZone filter with in operator and string array value', () => {
    const result = lowerQueryNode(
      {
        query: 'tokensInZone',
        zone: 'deck',
        filter: [
          { prop: 'faction', op: 'in', value: ['NVA', 'VC'] },
        ],
      },
      context,
      'doc.actions.0.effects.0.forEach.over',
    );

    assertNoDiagnostics(result);
    assert.deepEqual(result.value, {
      query: 'tokensInZone',
      zone: 'deck:none',
      filter: [
        { prop: 'faction', op: 'in', value: ['NVA', 'VC'] },
      ],
    });
  });

  it('lowers tokensInAdjacentZones filter identically to tokensInZone', () => {
    const result = lowerQueryNode(
      {
        query: 'tokensInAdjacentZones',
        zone: 'board',
        filter: [{ prop: 'type', eq: 'guerrilla' }],
      },
      context,
      'doc.effects.0.forEach.over',
    );

    assertNoDiagnostics(result);
    assert.deepEqual(result.value, {
      query: 'tokensInAdjacentZones',
      zone: 'board:none',
      filter: [{ prop: 'type', op: 'eq', value: 'guerrilla' }],
    });
  });

  it('emits diagnostic for zones filter that is neither ConditionAST nor owner', () => {
    const result = lowerQueryNode(
      { query: 'zones', filter: { bogus: true } },
      context,
      'doc.actions.0.params.0.domain',
    );

    assert.equal(result.value, null);
    assert.equal(result.diagnostics.length, 1);
    assert.equal(result.diagnostics[0]?.code, 'CNL_COMPILER_MISSING_CAPABILITY');
  });

  it('emits diagnostic for tokensInZone filter entry missing prop', () => {
    const result = lowerQueryNode(
      {
        query: 'tokensInZone',
        zone: 'board',
        filter: [{ eq: 'troops' }],
      },
      context,
      'doc.actions.0.effects.0.forEach.over',
    );

    assert.equal(result.value, null);
    assert.equal(result.diagnostics.length, 1);
    assert.equal(result.diagnostics[0]?.code, 'CNL_COMPILER_MISSING_CAPABILITY');
  });

  it('preserves tokensInZone without filter when no filter specified', () => {
    const result = lowerQueryNode(
      { query: 'tokensInZone', zone: 'deck' },
      context,
      'doc.actions.0.effects.0.forEach.over',
    );

    assertNoDiagnostics(result);
    assert.deepEqual(result.value, { query: 'tokensInZone', zone: 'deck:none' });
  });

  it('lowers if/then/else value expression', () => {
    const result = lowerValueNode(
      {
        if: {
          when: { op: '>', left: { ref: 'gvar', var: 'score' }, right: 10 },
          then: 1,
          else: 0,
        },
      },
      context,
      'doc.actions.0.effects.0.setVar.value',
    );

    assertNoDiagnostics(result);
    assert.deepEqual(result.value, {
      if: {
        when: { op: '>', left: { ref: 'gvar', var: 'score' }, right: 10 },
        then: 1,
        else: 0,
      },
    });
  });

  it('lowers nested if/then/else value expression', () => {
    const result = lowerValueNode(
      {
        if: {
          when: { op: '==', left: { ref: 'gvar', var: 'x' }, right: 1 },
          then: {
            if: {
              when: { op: '==', left: { ref: 'gvar', var: 'y' }, right: 2 },
              then: 'both',
              else: 'x-only',
            },
          },
          else: 'neither',
        },
      },
      context,
      'doc.actions.0.effects.0.setVar.value',
    );

    assertNoDiagnostics(result);
    assert.ok(result.value !== null);
  });

  it('propagates diagnostics from if/then/else sub-expressions', () => {
    const result = lowerValueNode(
      {
        if: {
          when: { op: '>', left: { ref: 'gvar', var: 'score' }, right: 10 },
          then: 1,
          else: { badExpr: true },
        },
      },
      context,
      'doc.actions.0.effects.0.setVar.value',
    );

    assert.equal(result.value, null);
    assert.ok(result.diagnostics.length > 0);
  });
});
