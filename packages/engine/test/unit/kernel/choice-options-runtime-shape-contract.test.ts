import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createChoiceOptionsRuntimeShapeDiagnostic,
  getChoiceOptionsRuntimeShapeViolation,
} from '../../../src/kernel/choice-options-runtime-shape-contract.js';

describe('choice options runtime-shape contract', () => {
  it('returns no violation for move-param-encodable option shapes', () => {
    assert.equal(getChoiceOptionsRuntimeShapeViolation({ query: 'players' }), null);
    assert.equal(getChoiceOptionsRuntimeShapeViolation({ query: 'tokensInZone', zone: 'deck:none' }), null);
  });

  it('returns deterministic violation details for non-encodable shapes', () => {
    assert.deepEqual(
      getChoiceOptionsRuntimeShapeViolation({
        query: 'concat',
        sources: [
          { query: 'assetRows', tableId: 'tournament-standard::blindSchedule.levels' },
          { query: 'players' },
          { query: 'enums', values: ['a', 'b'] },
        ],
      }),
      {
        runtimeShapes: ['number', 'object', 'string'],
        invalidShapes: ['object'],
      },
    );
  });

  it('builds standardized diagnostics for compiler and validator call sites', () => {
    const query = { query: 'assetRows', tableId: 'tournament-standard::blindSchedule.levels' } as const;

    const compilerDiagnostic = createChoiceOptionsRuntimeShapeDiagnostic(
      query,
      'doc.actions.0.effects.0.chooseOne.options',
      'chooseOne',
      'CNL_COMPILER_CHOICE_OPTIONS_RUNTIME_SHAPE_INVALID',
    );
    assert.ok(compilerDiagnostic);
    assert.equal(compilerDiagnostic.code, 'CNL_COMPILER_CHOICE_OPTIONS_RUNTIME_SHAPE_INVALID');
    assert.deepEqual(compilerDiagnostic.alternatives, ['object']);

    const validatorDiagnostic = createChoiceOptionsRuntimeShapeDiagnostic(
      query,
      'actions[0].effects[0].chooseOne.options',
      'chooseOne',
      'EFFECT_CHOICE_OPTIONS_RUNTIME_SHAPE_INVALID',
    );
    assert.ok(validatorDiagnostic);
    assert.equal(validatorDiagnostic.code, 'EFFECT_CHOICE_OPTIONS_RUNTIME_SHAPE_INVALID');
    assert.deepEqual(validatorDiagnostic.alternatives, ['object']);
    assert.equal(
      validatorDiagnostic.message,
      'chooseOne options query must produce move-param-encodable values; runtime shape(s) [object] are not fully encodable.',
    );
  });
});
