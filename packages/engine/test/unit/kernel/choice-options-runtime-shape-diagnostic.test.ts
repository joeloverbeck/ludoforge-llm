import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildChoiceOptionsRuntimeShapeDiagnostic,
  type BuildChoiceOptionsRuntimeShapeDiagnosticArgs,
  CHOICE_OPTIONS_RUNTIME_SHAPE_DIAGNOSTIC_CODES,
} from '../../../src/kernel/choice-options-runtime-shape-diagnostic.js';

describe('choice options runtime-shape shared diagnostic builder', () => {
  it('owns canonical compiler/validator code literals in a single source', () => {
    assert.deepEqual(CHOICE_OPTIONS_RUNTIME_SHAPE_DIAGNOSTIC_CODES, {
      compiler: 'CNL_COMPILER_CHOICE_OPTIONS_RUNTIME_SHAPE_INVALID',
      validator: 'EFFECT_CHOICE_OPTIONS_RUNTIME_SHAPE_INVALID',
    });
  });

  it('returns null when options query runtime shapes are move-param-encodable', () => {
    const diagnostic = buildChoiceOptionsRuntimeShapeDiagnostic({
      code: CHOICE_OPTIONS_RUNTIME_SHAPE_DIAGNOSTIC_CODES.compiler,
      path: 'doc.actions.0.effects.0.chooseOne.options',
      effectName: 'chooseOne',
      query: { query: 'players' },
    });

    assert.equal(diagnostic, null);
  });

  it('builds deterministic diagnostics with alternatives derived from invalid shapes', () => {
    const args: BuildChoiceOptionsRuntimeShapeDiagnosticArgs = {
      code: CHOICE_OPTIONS_RUNTIME_SHAPE_DIAGNOSTIC_CODES.validator,
      path: 'actions[0].effects[0].chooseN.options',
      effectName: 'chooseN' as const,
      query: {
        query: 'concat' as const,
        sources: [
          { query: 'assetRows' as const, tableId: 'tournament-standard::blindSchedule.levels' },
          { query: 'players' as const },
        ] as const,
      },
    };
    const first = buildChoiceOptionsRuntimeShapeDiagnostic(args);
    const second = buildChoiceOptionsRuntimeShapeDiagnostic(args);

    assert.ok(first);
    assert.equal(first.code, CHOICE_OPTIONS_RUNTIME_SHAPE_DIAGNOSTIC_CODES.validator);
    assert.deepEqual(first, second);
    assert.deepEqual(first.alternatives, ['object']);
  });

  it('emits canonical code literals for each supported surface', () => {
    const invalidQuery = {
      query: 'concat' as const,
      sources: [
        { query: 'players' as const },
        { query: 'assetRows' as const, tableId: 'tournament-standard::blindSchedule.levels' },
      ] as const,
    };

    const compilerDiagnostic = buildChoiceOptionsRuntimeShapeDiagnostic({
      code: CHOICE_OPTIONS_RUNTIME_SHAPE_DIAGNOSTIC_CODES.compiler,
      path: 'doc.actions.0.effects.0.chooseOne.options',
      effectName: 'chooseOne',
      query: invalidQuery,
    });
    assert.ok(compilerDiagnostic);
    assert.equal(compilerDiagnostic.code, CHOICE_OPTIONS_RUNTIME_SHAPE_DIAGNOSTIC_CODES.compiler);

    const validatorDiagnostic = buildChoiceOptionsRuntimeShapeDiagnostic({
      code: CHOICE_OPTIONS_RUNTIME_SHAPE_DIAGNOSTIC_CODES.validator,
      path: 'actions[0].effects[0].chooseN.options',
      effectName: 'chooseN',
      query: invalidQuery,
    });
    assert.ok(validatorDiagnostic);
    assert.equal(validatorDiagnostic.code, CHOICE_OPTIONS_RUNTIME_SHAPE_DIAGNOSTIC_CODES.validator);
  });

  it('emits full deterministic payloads for compiler and validator surfaces', () => {
    const invalidQuery = {
      query: 'concat' as const,
      sources: [
        { query: 'players' as const },
        { query: 'assetRows' as const, tableId: 'tournament-standard::blindSchedule.levels' },
      ] as const,
    };
    const cases: ReadonlyArray<{
      readonly code: BuildChoiceOptionsRuntimeShapeDiagnosticArgs['code'];
      readonly path: string;
      readonly effectName: BuildChoiceOptionsRuntimeShapeDiagnosticArgs['effectName'];
    }> = [
      {
        code: CHOICE_OPTIONS_RUNTIME_SHAPE_DIAGNOSTIC_CODES.compiler,
        path: 'doc.actions.0.effects.0.chooseOne.options',
        effectName: 'chooseOne',
      },
      {
        code: CHOICE_OPTIONS_RUNTIME_SHAPE_DIAGNOSTIC_CODES.validator,
        path: 'actions[0].effects[0].chooseN.options',
        effectName: 'chooseN',
      },
    ];

    for (const testCase of cases) {
      const diagnostic = buildChoiceOptionsRuntimeShapeDiagnostic({
        code: testCase.code,
        path: testCase.path,
        effectName: testCase.effectName,
        query: invalidQuery,
      });

      assert.ok(diagnostic);
      assert.deepEqual(diagnostic, {
        code: testCase.code,
        path: testCase.path,
        severity: 'error',
        message: `${testCase.effectName} options query must produce move-param-encodable values; runtime shape(s) [number, object] are not fully encodable.`,
        suggestion:
          'Use queries yielding token/string/number values (or binding queries that resolve to encodable values) and avoid object-valued option domains like assetRows.',
        alternatives: ['object'],
      });
    }
  });
});
