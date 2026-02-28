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

  it('lowers non-count aggregate with bind + valueExpr', () => {
    const result = lowerValueNode(
      {
        aggregate: {
          op: 'sum',
          query: { query: 'intsInRange', min: 1, max: 3 },
          bind: '$n',
          valueExpr: { ref: 'binding', name: '$n' },
        },
      },
      context,
      'doc.actions.0.effects.0.setVar.value',
    );

    assertNoDiagnostics(result);
    assert.deepEqual(result.value, {
      aggregate: {
        op: 'sum',
        query: { query: 'intsInRange', min: 1, max: 3 },
        bind: '$n',
        valueExpr: { ref: 'binding', name: '$n' },
      },
    });
  });

  it('emits warning when aggregate bind shadows an outer scope binding', () => {
    const result = lowerValueNode(
      {
        aggregate: {
          op: 'sum',
          query: { query: 'intsInRange', min: 1, max: 3 },
          bind: '$n',
          valueExpr: { ref: 'binding', name: '$n' },
        },
      },
      { ...context, bindingScope: ['$n'] },
      'doc.actions.0.effects.0.setVar.value',
    );

    assert.equal(result.value !== null, true);
    assert.deepEqual(
      result.diagnostics.filter((diagnostic) => diagnostic.code === 'CNL_COMPILER_BINDING_SHADOWED'),
      [
        {
          code: 'CNL_COMPILER_BINDING_SHADOWED',
          path: 'doc.actions.0.effects.0.setVar.value.aggregate.bind',
          severity: 'warning',
          message: 'Binding "$n" shadows an outer binding.',
          suggestion: 'Rename the inner binding to avoid accidental capture.',
        },
      ],
    );
  });

  it('does not emit shadow warnings for non-shadowing aggregate binders', () => {
    const result = lowerValueNode(
      {
        aggregate: {
          op: 'sum',
          query: { query: 'intsInRange', min: 1, max: 3 },
          bind: '$n',
          valueExpr: { ref: 'binding', name: '$n' },
        },
      },
      { ...context, bindingScope: ['$other'] },
      'doc.actions.0.effects.0.setVar.value',
    );

    assert.equal(result.value !== null, true);
    assert.deepEqual(
      result.diagnostics.filter((diagnostic) => diagnostic.code === 'CNL_COMPILER_BINDING_SHADOWED'),
      [],
    );
  });

  it('rejects legacy aggregate prop syntax', () => {
    const result = lowerValueNode(
      {
        aggregate: {
          op: 'sum',
          query: { query: 'tokensInZone', zone: 'deck' },
          prop: 'cost',
        },
      },
      context,
      'doc.actions.0.effects.0.setVar.value',
    );

    assert.equal(result.value, null);
    assert.equal(result.diagnostics[0]?.code, 'CNL_COMPILER_MISSING_CAPABILITY');
    assert.equal(result.diagnostics[0]?.path, 'doc.actions.0.effects.0.setVar.value.aggregate.bind');
  });

  it('lowers canonical query owner selectors for zones filter', () => {
    const result = lowerQueryNode(
      { query: 'zones', filter: { owner: 'active' } },
      context,
      'doc.actions.0.params.0.domain',
    );

    assertNoDiagnostics(result);
    assert.deepEqual(result.value, {
      query: 'zones',
      filter: { owner: 'active' },
    });
  });

  it('rejects non-canonical query owner alias selectors for zones filter', () => {
    const result = lowerQueryNode(
      { query: 'zones', filter: { owner: 'activePlayer' } },
      context,
      'doc.actions.0.params.0.domain',
    );

    assert.equal(result.value, null);
    assert.deepEqual(result.diagnostics, [
      {
        code: 'CNL_COMPILER_PLAYER_SELECTOR_INVALID',
        path: 'doc.actions.0.params.0.domain.filter.owner',
        severity: 'error',
        message: 'Non-canonical player selector: "activePlayer".',
        suggestion: 'Use "active".',
      },
    ]);
  });

  it('lowers intsInRange query with dynamic ValueExpr bounds', () => {
    const result = lowerQueryNode(
      {
        query: 'intsInRange',
        min: { ref: 'binding', name: '$min' },
        max: { op: '+', left: { ref: 'binding', name: '$min' }, right: 2 },
      },
      context,
      'doc.actions.0.params.0.domain',
    );

    assertNoDiagnostics(result);
    assert.deepEqual(result.value, {
      query: 'intsInRange',
      min: { ref: 'binding', name: '$min' },
      max: { op: '+', left: { ref: 'binding', name: '$min' }, right: 2 },
    });
  });

  it('lowers intsInRange query with optional cardinality controls', () => {
    const result = lowerQueryNode(
      {
        query: 'intsInRange',
        min: 10,
        max: 100,
        step: 10,
        alwaysInclude: [15, { ref: 'binding', name: '$anchor' }],
        maxResults: 8,
      },
      context,
      'doc.actions.0.params.0.domain',
    );

    assertNoDiagnostics(result);
    assert.deepEqual(result.value, {
      query: 'intsInRange',
      min: 10,
      max: 100,
      step: 10,
      alwaysInclude: [15, { ref: 'binding', name: '$anchor' }],
      maxResults: 8,
    });
  });

  it('lowers intsInVarRange query with optional scope and bound overrides', () => {
    const result = lowerQueryNode(
      {
        query: 'intsInVarRange',
        var: 'nvaResources',
        scope: 'global',
        min: 1,
        max: { op: '+', left: { ref: 'binding', name: '$cap' }, right: 0 },
        step: 2,
        alwaysInclude: [5, { ref: 'binding', name: '$anchor' }],
        maxResults: 6,
      },
      context,
      'doc.actions.0.params.0.domain',
    );

    assertNoDiagnostics(result);
    assert.deepEqual(result.value, {
      query: 'intsInVarRange',
      var: 'nvaResources',
      scope: 'global',
      min: 1,
      max: { op: '+', left: { ref: 'binding', name: '$cap' }, right: 0 },
      step: 2,
      alwaysInclude: [5, { ref: 'binding', name: '$anchor' }],
      maxResults: 6,
    });
  });

  it('lowers nextInOrderByCondition query with dynamic anchor and predicate', () => {
    const result = lowerQueryNode(
      {
        query: 'nextInOrderByCondition',
                source: { query: 'players' },
                from: { ref: 'gvar', var: 'dealerSeat' },
        bind: '$seatCandidate',
        where: {
          op: 'and',
          args: [
            { op: '==', left: { ref: 'pvar', player: { chosen: '$seatCandidate' }, var: 'eliminated' }, right: false },
            { op: '==', left: { ref: 'pvar', player: { chosen: '$seatCandidate' }, var: 'handActive' }, right: true },
          ],
        },
        includeFrom: false,
      },
      context,
      'doc.actions.0.params.0.domain',
    );

    assertNoDiagnostics(result);
    assert.deepEqual(result.value, {
      query: 'nextInOrderByCondition',
                source: { query: 'players' },
                from: { ref: 'gvar', var: 'dealerSeat' },
      bind: '$seatCandidate',
      where: {
        op: 'and',
        args: [
          { op: '==', left: { ref: 'pvar', player: { chosen: '$seatCandidate' }, var: 'eliminated' }, right: false },
          { op: '==', left: { ref: 'pvar', player: { chosen: '$seatCandidate' }, var: 'handActive' }, right: true },
        ],
      },
      includeFrom: false,
    });
  });

  it('rejects non-canonical nextInOrderByCondition bind tokens', () => {
    const result = lowerQueryNode(
      {
        query: 'nextInOrderByCondition',
                source: { query: 'players' },
                from: 0,
        bind: 'seatCandidate',
        where: { op: '==', left: 1, right: 1 },
      },
      context,
      'doc.actions.0.params.0.domain',
    );

    assert.equal(result.value, null);
    assert.equal(result.diagnostics[0]?.code, 'CNL_COMPILER_NEXT_IN_ORDER_BIND_INVALID');
    assert.equal(result.diagnostics[0]?.path, 'doc.actions.0.params.0.domain.bind');
  });

  it('rejects nextInOrderByCondition queries without source order', () => {
    const result = lowerQueryNode(
      {
        query: 'nextInOrderByCondition',
                from: 0,
        bind: '$seat',
        where: { op: '==', left: { ref: 'binding', name: '$seat' }, right: 1 },
      },
      context,
      'doc.actions.0.params.0.domain',
    );

    assert.equal(result.value, null);
    assert.equal(result.diagnostics[0]?.code, 'CNL_COMPILER_MISSING_CAPABILITY');
    assert.equal(result.diagnostics[0]?.path, 'doc.actions.0.params.0.domain.source');
  });

  it('emits warning when nextInOrderByCondition bind shadows an outer scope binding', () => {
    const result = lowerQueryNode(
      {
        query: 'nextInOrderByCondition',
                source: { query: 'players' },
                from: 0,
        bind: '$seat',
        where: {
          op: '==',
          left: { ref: 'binding', name: '$seat' },
          right: 1,
        },
      },
      { ...context, bindingScope: ['$seat'] },
      'doc.actions.0.params.0.domain',
    );

    assert.equal(result.value !== null, true);
    assert.deepEqual(
      result.diagnostics.filter((diagnostic) => diagnostic.code === 'CNL_COMPILER_BINDING_SHADOWED'),
      [
        {
          code: 'CNL_COMPILER_BINDING_SHADOWED',
          path: 'doc.actions.0.params.0.domain.bind',
          severity: 'warning',
          message: 'Binding "$seat" shadows an outer binding.',
          suggestion: 'Rename the inner binding to avoid accidental capture.',
        },
      ],
    );
  });

  it('rejects non-numeric intsInRange bounds during lowering', () => {
    const result = lowerQueryNode(
      {
        query: 'intsInRange',
        min: { concat: ['1'] },
        max: 3,
      },
      context,
      'doc.actions.0.params.0.domain',
    );

    assert.equal(result.value, null);
    assert.equal(result.diagnostics[0]?.code, 'CNL_COMPILER_MISSING_CAPABILITY');
    assert.equal(result.diagnostics[0]?.path, 'doc.actions.0.params.0.domain.min');
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

  it('lowers floorDiv/ceilDiv/min/max operators in value node', () => {
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
    const minResult = lowerValueNode(
      { op: 'min', left: 10, right: 3 },
      context,
      'doc.actions.0.effects.0.addVar.delta',
    );
    const maxResult = lowerValueNode(
      { op: 'max', left: 10, right: 3 },
      context,
      'doc.actions.0.effects.0.addVar.delta',
    );

    assertNoDiagnostics(floorResult);
    assertNoDiagnostics(ceilResult);
    assertNoDiagnostics(minResult);
    assertNoDiagnostics(maxResult);
    assert.deepEqual(floorResult.value, { op: 'floorDiv', left: 10, right: 3 });
    assert.deepEqual(ceilResult.value, { op: 'ceilDiv', left: 10, right: 3 });
    assert.deepEqual(minResult.value, { op: 'min', left: 10, right: 3 });
    assert.deepEqual(maxResult.value, { op: 'max', left: 10, right: 3 });
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

  it('lowers assetField reference and validates binding scope', () => {
    const withScope: ConditionLoweringContext = {
      ...context,
      bindingScope: ['$row'],
    };
    const result = lowerValueNode(
      { ref: 'assetField', row: '$row', tableId: 'tournament-standard::blindSchedule.levels', field: 'smallBlind' },
      withScope,
      'doc.actions.0.effects.0.setVar.value',
    );

    assertNoDiagnostics(result);
    assert.deepEqual(result.value, {
      ref: 'assetField',
      row: '$row',
      tableId: 'tournament-standard::blindSchedule.levels',
      field: 'smallBlind',
    });
  });

  it('emits unbound diagnostic for assetField row binding', () => {
    const withScope: ConditionLoweringContext = {
      ...context,
      bindingScope: ['$other'],
    };
    const result = lowerValueNode(
      { ref: 'assetField', row: '$row', tableId: 'tournament-standard::blindSchedule.levels', field: 'smallBlind' },
      withScope,
      'doc.actions.0.effects.0.setVar.value',
    );

    assert.equal(result.value, null);
    assert.equal(result.diagnostics[0]?.code, 'CNL_COMPILER_BINDING_UNBOUND');
    assert.equal(result.diagnostics[0]?.path, 'doc.actions.0.effects.0.setVar.value.row');
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

  it('lowers concat query sources recursively', () => {
    const result = lowerQueryNode(
      {
        query: 'concat',
        sources: [
          { query: 'tokensInZone', zone: 'deck' },
          { query: 'tokensInZone', zone: 'board' },
          { query: 'enums', values: ['wild'] },
        ],
      },
      context,
      'doc.actions.0.params.0.domain',
    );

    assertNoDiagnostics(result);
    assert.deepEqual(result.value, {
      query: 'concat',
      sources: [
        { query: 'tokensInZone', zone: 'deck:none' },
        { query: 'tokensInZone', zone: 'board:none' },
        { query: 'enums', values: ['wild'] },
      ],
    });
  });

  it('rejects concat query payloads with empty sources', () => {
    const result = lowerQueryNode(
      {
        query: 'concat',
        sources: [],
      },
      context,
      'doc.actions.0.params.0.domain',
    );

    assert.equal(result.value, null);
    assert.equal(result.diagnostics[0]?.code, 'CNL_COMPILER_MISSING_CAPABILITY');
    assert.equal(result.diagnostics[0]?.path, 'doc.actions.0.params.0.domain');
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
            { op: '==', left: { ref: 'zoneProp', zone: 'board', prop: 'category' }, right: 'province' },
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
            { op: '==', left: { ref: 'zoneProp', zone: 'board:none', prop: 'category' }, right: 'province' },
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
          left: { ref: 'zoneProp', zone: 'board', prop: 'category' },
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
          left: { ref: 'zoneProp', zone: 'board:none', prop: 'category' },
          right: 'province',
        },
      },
    });
  });

  it('lowers tokensInMapSpaces query with map-space condition and token filters', () => {
    const result = lowerQueryNode(
      {
        query: 'tokensInMapSpaces',
        spaceFilter: {
          op: '==',
          left: { ref: 'zoneProp', zone: 'board', prop: 'country' },
          right: 'southVietnam',
        },
        filter: [{ prop: 'type', eq: 'guerrilla' }],
      },
      context,
      'doc.actions.0.effects.0.forEach.over',
    );

    assertNoDiagnostics(result);
    assert.deepEqual(result.value, {
      query: 'tokensInMapSpaces',
      spaceFilter: {
        condition: {
          op: '==',
          left: { ref: 'zoneProp', zone: 'board:none', prop: 'country' },
          right: 'southVietnam',
        },
      },
      filter: [{ prop: 'type', op: 'eq', value: 'guerrilla' }],
    });
  });

  it('lowers assetRows query with where predicates', () => {
    const result = lowerQueryNode(
      {
        query: 'assetRows',
        tableId: 'tournament-standard::blindSchedule.levels',
        where: [
          { field: 'level', op: 'eq', value: 2 },
          { field: 'phase', op: 'in', value: ['early', 'mid'] },
        ],
      },
      context,
      'doc.actions.0.params.0.domain',
    );

    assertNoDiagnostics(result);
    assert.deepEqual(result.value, {
      query: 'assetRows',
      tableId: 'tournament-standard::blindSchedule.levels',
      where: [
        { field: 'level', op: 'eq', value: 2 },
        { field: 'phase', op: 'in', value: ['early', 'mid'] },
      ],
    });
  });

  it('lowers assetRows query cardinality when provided', () => {
    const result = lowerQueryNode(
      {
        query: 'assetRows',
        tableId: 'tournament-standard::blindSchedule.levels',
        cardinality: 'exactlyOne',
        where: [{ field: 'level', op: 'eq', value: 2 }],
      },
      context,
      'doc.actions.0.params.0.domain',
    );

    assertNoDiagnostics(result);
    assert.deepEqual(result.value, {
      query: 'assetRows',
      tableId: 'tournament-standard::blindSchedule.levels',
      cardinality: 'exactlyOne',
      where: [{ field: 'level', op: 'eq', value: 2 }],
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

  it('emits diagnostic for undeclared token filter prop when token prop vocabulary is available', () => {
    const result = lowerQueryNode(
      {
        query: 'tokensInZone',
        zone: 'board',
        filter: [
          { prop: 'typoType', eq: 'troops' },
        ],
      },
      {
        ...context,
        tokenFilterProps: ['faction', 'type'],
      },
      'doc.actionPipelines.0.stages.0.effects.0.forEach.over',
    );

    assert.equal(result.value, null);
    assert.deepEqual(result.diagnostics, [
      {
        code: 'CNL_COMPILER_TOKEN_FILTER_PROP_UNKNOWN',
        path: 'doc.actionPipelines.0.stages.0.effects.0.forEach.over.filter[0].prop',
        severity: 'error',
        message: 'Token filter references undeclared prop "typoType".',
        suggestion: 'Use a token prop declared by selected token types/piece runtime props.',
        alternatives: ['faction', 'id', 'type'],
      },
    ]);
  });

  it('accepts intrinsic token filter prop id when token prop vocabulary is available', () => {
    const result = lowerQueryNode(
      {
        query: 'tokensInZone',
        zone: 'board',
        filter: [
          { prop: 'id', eq: 'token-1' },
        ],
      },
      {
        ...context,
        tokenFilterProps: ['faction', 'type'],
      },
      'doc.actionPipelines.0.stages.0.effects.0.forEach.over',
    );

    assertNoDiagnostics(result);
    assert.deepEqual(result.value, {
      query: 'tokensInZone',
      zone: 'board:none',
      filter: [{ prop: 'id', op: 'eq', value: 'token-1' }],
    });
  });

  it('lowers tokensInZone query with dynamic zoneExpr', () => {
    const result = lowerQueryNode(
      {
        query: 'tokensInZone',
        zone: { zoneExpr: { ref: 'binding', name: '$zone' } },
      },
      context,
      'doc.actions.0.effects.0.forEach.over',
    );

    assertNoDiagnostics(result);
    assert.deepEqual(result.value, {
      query: 'tokensInZone',
      zone: { zoneExpr: { ref: 'binding', name: '$zone' } },
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

  it('lowers tokensInZone filter with in operator and metadata namedSet reference', () => {
    const result = lowerQueryNode(
      {
        query: 'tokensInZone',
        zone: 'deck',
        filter: [
          { prop: 'faction', op: 'in', value: { ref: 'namedSet', name: 'COIN' } },
        ],
      },
      {
        ...context,
        namedSets: {
          COIN: ['US', 'ARVN'],
          Insurgent: ['NVA', 'VC'],
        },
      },
      'doc.actions.0.effects.0.forEach.over',
    );

    assertNoDiagnostics(result);
    assert.deepEqual(result.value, {
      query: 'tokensInZone',
      zone: 'deck:none',
      filter: [
        { prop: 'faction', op: 'in', value: ['US', 'ARVN'] },
      ],
    });
  });

  it('emits diagnostic for unknown metadata namedSet reference in token filter', () => {
    const result = lowerQueryNode(
      {
        query: 'tokensInZone',
        zone: 'deck',
        filter: [
          { prop: 'faction', op: 'in', value: { ref: 'namedSet', name: 'MissingSet' } },
        ],
      },
      {
        ...context,
        namedSets: {
          COIN: ['US', 'ARVN'],
        },
      },
      'doc.actions.0.effects.0.forEach.over',
    );

    assert.equal(result.value, null);
    assert.equal(result.diagnostics.length, 1);
    assert.deepEqual(result.diagnostics[0], {
      code: 'CNL_COMPILER_UNKNOWN_NAMED_SET',
      path: 'doc.actions.0.effects.0.forEach.over.filter[0].value.name',
      severity: 'error',
      message: 'Unknown metadata.namedSets entry "MissingSet".',
      suggestion: 'Declare the set under metadata.namedSets or use a literal string array.',
      alternatives: ['COIN'],
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

  it('lowers spatial zone queries with dynamic zoneExpr selectors', () => {
    const adjacent = lowerQueryNode(
      { query: 'adjacentZones', zone: { zoneExpr: { ref: 'binding', name: '$zone' } } },
      context,
      'doc.effects.0.forEach.over',
    );
    const nearbyTokens = lowerQueryNode(
      { query: 'tokensInAdjacentZones', zone: { zoneExpr: { ref: 'binding', name: '$zone' } } },
      context,
      'doc.effects.1.forEach.over',
    );
    const connected = lowerQueryNode(
      { query: 'connectedZones', zone: { zoneExpr: { ref: 'binding', name: '$zone' } }, includeStart: true },
      context,
      'doc.effects.2.forEach.over',
    );

    assertNoDiagnostics(adjacent);
    assertNoDiagnostics(nearbyTokens);
    assertNoDiagnostics(connected);
    assert.deepEqual(adjacent.value, {
      query: 'adjacentZones',
      zone: { zoneExpr: { ref: 'binding', name: '$zone' } },
    });
    assert.deepEqual(nearbyTokens.value, {
      query: 'tokensInAdjacentZones',
      zone: { zoneExpr: { ref: 'binding', name: '$zone' } },
    });
    assert.deepEqual(connected.value, {
      query: 'connectedZones',
      zone: { zoneExpr: { ref: 'binding', name: '$zone' } },
      includeStart: true,
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

  it('emits diagnostic for tokensInZone zone object missing zoneExpr', () => {
    const result = lowerQueryNode(
      {
        query: 'tokensInZone',
        zone: { concat: ['board:', 'none'] },
      },
      context,
      'doc.actions.0.effects.0.forEach.over',
    );

    assert.equal(result.value, null);
    assert.equal(result.diagnostics.length, 1);
    assert.equal(result.diagnostics[0]?.code, 'CNL_COMPILER_ZONE_SELECTOR_INVALID');
    assert.equal(result.diagnostics[0]?.path, 'doc.actions.0.effects.0.forEach.over.zone');
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

describe('compile-conditions type mismatch warnings', () => {
  const typedContext: ConditionLoweringContext = {
    ownershipByBase: { deck: 'none', hand: 'player', board: 'none' },
    typeInference: {
      globalVarTypes: { score: 'int', gameOver: 'boolean' },
      perPlayerVarTypes: { chips: 'int' },
      tokenPropTypes: {},
      tableFieldTypes: {},
    },
  };

  it('emits warning when comparing number ref to string literal', () => {
    const result = lowerConditionNode(
      { op: '==', left: { ref: 'gvar', var: 'score' }, right: 'hello' },
      typedContext,
      'doc.actions.0.pre',
    );

    assert.ok(result.value !== null);
    const warnings = result.diagnostics.filter(
      (d) => d.code === 'CNL_COMPILER_CONDITION_TYPE_MISMATCH',
    );
    assert.equal(warnings.length, 1);
    const w0 = warnings[0]!;
    assert.equal(w0.severity, 'warning');
    assert.ok(w0.message.includes('number'));
    assert.ok(w0.message.includes('string'));
  });

  it('emits warning for != with incompatible types', () => {
    const result = lowerConditionNode(
      { op: '!=', left: { ref: 'gvar', var: 'gameOver' }, right: 42 },
      typedContext,
      'doc.actions.0.pre',
    );

    assert.ok(result.value !== null);
    const warnings = result.diagnostics.filter(
      (d) => d.code === 'CNL_COMPILER_CONDITION_TYPE_MISMATCH',
    );
    assert.equal(warnings.length, 1);
    assert.ok(warnings[0]!.message.includes('true'));
  });

  it('does not emit warning for compatible types', () => {
    const result = lowerConditionNode(
      { op: '==', left: { ref: 'gvar', var: 'score' }, right: 10 },
      typedContext,
      'doc.actions.0.pre',
    );

    assertNoDiagnostics(result);
    assert.ok(result.value !== null);
  });

  it('does not emit warning when typeInference is absent', () => {
    const result = lowerConditionNode(
      { op: '==', left: { ref: 'gvar', var: 'score' }, right: 'hello' },
      context,
      'doc.actions.0.pre',
    );

    assertNoDiagnostics(result);
    assert.ok(result.value !== null);
  });

  it('does not emit warning for non-equality operators', () => {
    const result = lowerConditionNode(
      { op: '>=', left: { ref: 'gvar', var: 'score' }, right: 'hello' },
      typedContext,
      'doc.actions.0.pre',
    );

    const warnings = result.diagnostics.filter(
      (d) => d.code === 'CNL_COMPILER_CONDITION_TYPE_MISMATCH',
    );
    assert.equal(warnings.length, 0);
  });

  it('does not emit warning when one side is unknown', () => {
    const result = lowerConditionNode(
      { op: '==', left: { ref: 'binding', name: '$x' }, right: 42 },
      typedContext,
      'doc.actions.0.pre',
    );

    const warnings = result.diagnostics.filter(
      (d) => d.code === 'CNL_COMPILER_CONDITION_TYPE_MISMATCH',
    );
    assert.equal(warnings.length, 0);
  });
});
