import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  inferValueExprType,
  areTypesCompatible,
  type TypeInferenceContext,
} from '../../src/cnl/type-inference.js';

const emptyCtx: TypeInferenceContext = {
  globalVarTypes: {},
  perPlayerVarTypes: {},
  tokenPropTypes: {},
  tableFieldTypes: {},
};

const richCtx: TypeInferenceContext = {
  globalVarTypes: { score: 'int', gameOver: 'boolean' },
  perPlayerVarTypes: { chips: 'int', hasFolded: 'boolean' },
  tokenPropTypes: {
    card: { suit: 'string', rank: 'int', faceUp: 'boolean' },
    piece: { strength: 'int' },
  },
  tableFieldTypes: {
    cardData: { name: 'string', value: 'int', active: 'boolean' },
  },
};

describe('inferValueExprType', () => {
  describe('literal types', () => {
    it('infers number for numeric literal', () => {
      assert.equal(inferValueExprType(42, emptyCtx), 'number');
    });

    it('infers number for zero', () => {
      assert.equal(inferValueExprType(0, emptyCtx), 'number');
    });

    it('infers boolean for true', () => {
      assert.equal(inferValueExprType(true, emptyCtx), 'boolean');
    });

    it('infers boolean for false', () => {
      assert.equal(inferValueExprType(false, emptyCtx), 'boolean');
    });

    it('infers string for string literal', () => {
      assert.equal(inferValueExprType('hello', emptyCtx), 'string');
    });

    it('infers string for empty string', () => {
      assert.equal(inferValueExprType('', emptyCtx), 'string');
    });
  });

  describe('reference types', () => {
    it('infers number for gvar of int type', () => {
      assert.equal(
        inferValueExprType({ ref: 'gvar', var: 'score' }, richCtx),
        'number',
      );
    });

    it('infers boolean for gvar of boolean type', () => {
      assert.equal(
        inferValueExprType({ ref: 'gvar', var: 'gameOver' }, richCtx),
        'boolean',
      );
    });

    it('returns unknown for unknown gvar', () => {
      assert.equal(
        inferValueExprType({ ref: 'gvar', var: 'nonexistent' }, richCtx),
        'unknown',
      );
    });

    it('infers number for pvar of int type', () => {
      assert.equal(
        inferValueExprType({ ref: 'pvar', var: 'chips', player: 'active' }, richCtx),
        'number',
      );
    });

    it('infers boolean for pvar of boolean type', () => {
      assert.equal(
        inferValueExprType({ ref: 'pvar', var: 'hasFolded', player: 'active' }, richCtx),
        'boolean',
      );
    });

    it('returns unknown for unknown pvar', () => {
      assert.equal(
        inferValueExprType({ ref: 'pvar', var: 'nonexistent', player: 'active' }, richCtx),
        'unknown',
      );
    });

    it('infers number for zoneCount', () => {
      assert.equal(
        inferValueExprType({ ref: 'zoneCount', zone: 'hand:0' }, emptyCtx),
        'number',
      );
    });

    it('infers number for activePlayer', () => {
      assert.equal(
        inferValueExprType({ ref: 'activePlayer' }, emptyCtx),
        'number',
      );
    });

    it('infers string for markerState', () => {
      assert.equal(
        inferValueExprType({ ref: 'markerState', space: 'board', marker: 'control' }, emptyCtx),
        'string',
      );
    });

    it('infers string for globalMarkerState', () => {
      assert.equal(
        inferValueExprType({ ref: 'globalMarkerState', marker: 'phase' }, emptyCtx),
        'string',
      );
    });

    it('infers string for tokenZone', () => {
      assert.equal(
        inferValueExprType({ ref: 'tokenZone', token: '$t' }, emptyCtx),
        'string',
      );
    });

    it('infers string for tokenProp with consistent string type', () => {
      assert.equal(
        inferValueExprType({ ref: 'tokenProp', token: '$t', prop: 'suit' }, richCtx),
        'string',
      );
    });

    it('infers number for tokenProp with consistent int type', () => {
      assert.equal(
        inferValueExprType({ ref: 'tokenProp', token: '$t', prop: 'strength' }, richCtx),
        'number',
      );
    });

    it('infers boolean for tokenProp with consistent boolean type', () => {
      assert.equal(
        inferValueExprType({ ref: 'tokenProp', token: '$t', prop: 'faceUp' }, richCtx),
        'boolean',
      );
    });

    it('returns unknown for tokenProp with inconsistent types across token types', () => {
      const ctx: TypeInferenceContext = {
        ...emptyCtx,
        tokenPropTypes: {
          card: { value: 'int' },
          label: { value: 'string' },
        },
      };
      assert.equal(
        inferValueExprType({ ref: 'tokenProp', token: '$t', prop: 'value' }, ctx),
        'unknown',
      );
    });

    it('returns unknown for tokenProp with unknown prop name', () => {
      assert.equal(
        inferValueExprType({ ref: 'tokenProp', token: '$t', prop: 'nonexistent' }, richCtx),
        'unknown',
      );
    });

    it('infers string for assetField with string type', () => {
      assert.equal(
        inferValueExprType({ ref: 'assetField', row: '$r', tableId: 'cardData', field: 'name' }, richCtx),
        'string',
      );
    });

    it('infers number for assetField with int type', () => {
      assert.equal(
        inferValueExprType({ ref: 'assetField', row: '$r', tableId: 'cardData', field: 'value' }, richCtx),
        'number',
      );
    });

    it('infers boolean for assetField with boolean type', () => {
      assert.equal(
        inferValueExprType({ ref: 'assetField', row: '$r', tableId: 'cardData', field: 'active' }, richCtx),
        'boolean',
      );
    });

    it('returns unknown for assetField with unknown table', () => {
      assert.equal(
        inferValueExprType({ ref: 'assetField', row: '$r', tableId: 'unknown', field: 'name' }, richCtx),
        'unknown',
      );
    });

    it('returns unknown for assetField with unknown field', () => {
      assert.equal(
        inferValueExprType({ ref: 'assetField', row: '$r', tableId: 'cardData', field: 'unknown' }, richCtx),
        'unknown',
      );
    });

    it('returns unknown for zoneProp', () => {
      assert.equal(
        inferValueExprType({ ref: 'zoneProp', zone: 'board', prop: 'terrain' }, emptyCtx),
        'unknown',
      );
    });

    it('returns unknown for binding', () => {
      assert.equal(
        inferValueExprType({ ref: 'binding', name: '$x' }, emptyCtx),
        'unknown',
      );
    });
  });

  describe('composite expressions', () => {
    it('infers number for arithmetic op', () => {
      assert.equal(
        inferValueExprType({ op: '+', left: 1, right: 2 }, emptyCtx),
        'number',
      );
    });

    it('infers number for count aggregate', () => {
      assert.equal(
        inferValueExprType(
          { aggregate: { op: 'count', query: { query: 'tokensInZone', zone: 'deck:none' } } },
          emptyCtx,
        ),
        'number',
      );
    });

    it('infers number for sum aggregate', () => {
      assert.equal(
        inferValueExprType(
          {
            aggregate: {
              op: 'sum',
              query: { query: 'intsInRange', min: 1, max: 5 },
              bind: '$n',
              valueExpr: { ref: 'binding', name: '$n' },
            },
          },
          emptyCtx,
        ),
        'number',
      );
    });

    it('infers string for concat', () => {
      assert.equal(
        inferValueExprType({ concat: ['a', 'b'] }, emptyCtx),
        'string',
      );
    });

    it('infers matching type for if with same then/else types', () => {
      assert.equal(
        inferValueExprType(
          { if: { when: { op: '==', left: 1, right: 1 }, then: 42, else: 99 } },
          emptyCtx,
        ),
        'number',
      );
    });

    it('infers known type when one branch is unknown in if', () => {
      assert.equal(
        inferValueExprType(
          {
            if: {
              when: { op: '==', left: 1, right: 1 },
              then: { ref: 'binding', name: '$x' },
              else: 42,
            },
          },
          emptyCtx,
        ),
        'number',
      );
    });

    it('infers known type when then is unknown in if', () => {
      assert.equal(
        inferValueExprType(
          {
            if: {
              when: { op: '==', left: 1, right: 1 },
              then: 'hello',
              else: { ref: 'binding', name: '$x' },
            },
          },
          emptyCtx,
        ),
        'string',
      );
    });

    it('returns unknown for if with mismatched branch types', () => {
      assert.equal(
        inferValueExprType(
          { if: { when: { op: '==', left: 1, right: 1 }, then: 42, else: 'hello' } },
          emptyCtx,
        ),
        'unknown',
      );
    });
  });
});

describe('areTypesCompatible', () => {
  it('returns true when both types match', () => {
    assert.equal(areTypesCompatible('number', 'number'), true);
    assert.equal(areTypesCompatible('string', 'string'), true);
    assert.equal(areTypesCompatible('boolean', 'boolean'), true);
  });

  it('returns true when left is unknown', () => {
    assert.equal(areTypesCompatible('unknown', 'number'), true);
    assert.equal(areTypesCompatible('unknown', 'string'), true);
  });

  it('returns true when right is unknown', () => {
    assert.equal(areTypesCompatible('number', 'unknown'), true);
    assert.equal(areTypesCompatible('string', 'unknown'), true);
  });

  it('returns true when both are unknown', () => {
    assert.equal(areTypesCompatible('unknown', 'unknown'), true);
  });

  it('returns false for incompatible known types', () => {
    assert.equal(areTypesCompatible('number', 'string'), false);
    assert.equal(areTypesCompatible('string', 'boolean'), false);
    assert.equal(areTypesCompatible('boolean', 'number'), false);
  });
});
