import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeChooseN,
  isSpaceQuery,
  isTokenQuery,
  isPlayerQuery,
  isValueQuery,
  isMarkerQuery,
  isRowQuery,
  isEnumQuery,
} from '../../../src/kernel/tooltip-normalizer-compound.js';
import type { EffectAST, OptionsQuery } from '../../../src/kernel/types-ast.js';
import type { NormalizerContext } from '../../../src/kernel/tooltip-normalizer.js';
import type { SelectMessage } from '../../../src/kernel/tooltip-ir.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EMPTY_CTX: NormalizerContext = {
  verbalization: undefined,
  suppressPatterns: [],
};

const chooseNPayload = (options: OptionsQuery, n = 1): Extract<EffectAST, { chooseN: unknown }> => ({
  chooseN: {
    internalDecisionId: 'test-decision',
    options,
    bind: 'sel',
    n,
  },
});

// ---------------------------------------------------------------------------
// Query type classification helpers
// ---------------------------------------------------------------------------

describe('query type classification helpers', () => {
  it('isSpaceQuery matches mapSpaces', () => {
    assert.ok(isSpaceQuery({ query: 'mapSpaces' }));
  });

  it('isSpaceQuery matches zones', () => {
    assert.ok(isSpaceQuery({ query: 'zones' }));
  });

  it('isSpaceQuery matches adjacentZones', () => {
    assert.ok(isSpaceQuery({ query: 'adjacentZones', zone: 'x' }));
  });

  it('isSpaceQuery matches connectedZones', () => {
    assert.ok(isSpaceQuery({ query: 'connectedZones', zone: 'x' }));
  });

  it('isSpaceQuery matches tokenZones', () => {
    assert.ok(isSpaceQuery({ query: 'tokenZones', source: { query: 'enums', values: [] } }));
  });

  it('isTokenQuery matches tokensInZone', () => {
    assert.ok(isTokenQuery({ query: 'tokensInZone', zone: 'x' }));
  });

  it('isPlayerQuery matches players', () => {
    assert.ok(isPlayerQuery({ query: 'players' }));
  });

  it('isValueQuery matches intsInRange', () => {
    assert.ok(isValueQuery({ query: 'intsInRange', min: 0, max: 10 }));
  });

  it('isValueQuery matches intsInVarRange', () => {
    assert.ok(isValueQuery({ query: 'intsInVarRange', var: 'betAmount' }));
  });

  it('isMarkerQuery matches globalMarkers', () => {
    assert.ok(isMarkerQuery({ query: 'globalMarkers' }));
  });

  it('isRowQuery matches assetRows', () => {
    assert.ok(isRowQuery({ query: 'assetRows', tableId: 'events' }));
  });

  it('isEnumQuery matches enums', () => {
    assert.ok(isEnumQuery({ query: 'enums', values: ['a', 'b'] }));
  });
});

// ---------------------------------------------------------------------------
// normalizeChooseN classification
// ---------------------------------------------------------------------------

describe('normalizeChooseN domain classification', () => {
  it('players query produces target: players', () => {
    const result = normalizeChooseN(chooseNPayload({ query: 'players' }), EMPTY_CTX, 'r');
    assert.equal(result.length, 1);
    const msg = result[0] as SelectMessage;
    assert.equal(msg.kind, 'select');
    assert.equal(msg.target, 'players');
  });

  it('intsInRange query produces target: values', () => {
    const result = normalizeChooseN(chooseNPayload({ query: 'intsInRange', min: 1, max: 100 }), EMPTY_CTX, 'r');
    assert.equal(result.length, 1);
    const msg = result[0] as SelectMessage;
    assert.equal(msg.kind, 'select');
    assert.equal(msg.target, 'values');
  });

  it('intsInVarRange query produces target: values', () => {
    const result = normalizeChooseN(chooseNPayload({ query: 'intsInVarRange', var: 'bet' }), EMPTY_CTX, 'r');
    assert.equal(result.length, 1);
    const msg = result[0] as SelectMessage;
    assert.equal(msg.kind, 'select');
    assert.equal(msg.target, 'values');
  });

  it('globalMarkers query produces target: markers', () => {
    const result = normalizeChooseN(chooseNPayload({ query: 'globalMarkers' }), EMPTY_CTX, 'r');
    assert.equal(result.length, 1);
    const msg = result[0] as SelectMessage;
    assert.equal(msg.kind, 'select');
    assert.equal(msg.target, 'markers');
  });

  it('assetRows query produces target: rows', () => {
    const result = normalizeChooseN(chooseNPayload({ query: 'assetRows', tableId: 'events' }), EMPTY_CTX, 'r');
    assert.equal(result.length, 1);
    const msg = result[0] as SelectMessage;
    assert.equal(msg.kind, 'select');
    assert.equal(msg.target, 'rows');
  });

  it('enums query produces target: items with optionHints', () => {
    const result = normalizeChooseN(
      chooseNPayload({ query: 'enums', values: ['Fold', 'Call', 'Raise'] }),
      EMPTY_CTX,
      'r',
    );
    assert.equal(result.length, 1);
    const msg = result[0] as SelectMessage;
    assert.equal(msg.kind, 'select');
    assert.equal(msg.target, 'items');
    assert.deepEqual(msg.optionHints, ['Fold', 'Call', 'Raise']);
  });

  it('connectedZones query produces target: spaces', () => {
    const result = normalizeChooseN(
      chooseNPayload({ query: 'connectedZones', zone: 'start' }),
      EMPTY_CTX,
      'r',
    );
    assert.equal(result.length, 1);
    const msg = result[0] as SelectMessage;
    assert.equal(msg.kind, 'select');
    assert.equal(msg.target, 'spaces');
  });

  it('tokenZones query produces target: spaces', () => {
    const result = normalizeChooseN(
      chooseNPayload({ query: 'tokenZones', source: { query: 'enums', values: [] } }),
      EMPTY_CTX,
      'r',
    );
    assert.equal(result.length, 1);
    const msg = result[0] as SelectMessage;
    assert.equal(msg.kind, 'select');
    assert.equal(msg.target, 'spaces');
  });

  it('existing space queries still produce target: spaces', () => {
    const result = normalizeChooseN(chooseNPayload({ query: 'mapSpaces' }), EMPTY_CTX, 'r');
    const msg = result[0] as SelectMessage;
    assert.equal(msg.target, 'spaces');
  });

  it('existing token queries still produce target: zones', () => {
    const result = normalizeChooseN(
      chooseNPayload({ query: 'tokensInZone', zone: 'hand' }),
      EMPTY_CTX,
      'r',
    );
    const msg = result[0] as SelectMessage;
    assert.equal(msg.target, 'zones');
  });

  it('unknown query falls back to target: items without optionHints', () => {
    const result = normalizeChooseN(
      chooseNPayload({ query: 'binding', name: 'x' } as OptionsQuery),
      EMPTY_CTX,
      'r',
    );
    const msg = result[0] as SelectMessage;
    assert.equal(msg.target, 'items');
    assert.equal(msg.optionHints, undefined);
  });
});
