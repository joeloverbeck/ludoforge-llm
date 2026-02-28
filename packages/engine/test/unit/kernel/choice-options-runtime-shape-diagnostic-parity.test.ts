import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { lowerEffectArray, type EffectLoweringContext } from '../../../src/cnl/compile-effects.js';
import {
  CNL_COMPILER_CHOICE_OPTIONS_RUNTIME_SHAPE_INVALID,
  EFFECT_CHOICE_OPTIONS_RUNTIME_SHAPE_INVALID,
} from '../../../src/kernel/choice-options-runtime-shape-diagnostic.js';
import { type GameDef, validateGameDef } from '../../../src/kernel/index.js';
import { createValidGameDef } from '../../helpers/gamedef-fixtures.js';

const compileContext: EffectLoweringContext = {
  ownershipByBase: {
    deck: 'none',
    hand: 'player',
    discard: 'none',
    board: 'none',
  },
  bindingScope: ['$actor'],
};

describe('choice options runtime-shape diagnostic parity', () => {
  const choiceCases: ReadonlyArray<{
    readonly effectName: 'chooseOne' | 'chooseN';
    readonly effectNode: Record<string, unknown>;
  }> = [
    {
      effectName: 'chooseOne',
      effectNode: {
        chooseOne: {
          bind: '$row',
          options: { query: 'assetRows', tableId: 'tournament-standard::blindSchedule.levels' },
        },
      },
    },
    {
      effectName: 'chooseN',
      effectNode: {
        chooseN: {
          bind: '$rows',
          options: { query: 'assetRows', tableId: 'tournament-standard::blindSchedule.levels' },
          max: 1,
        },
      },
    },
  ];

  for (const testCase of choiceCases) {
    it(`keeps compiler and validator diagnostic detail payloads in sync for ${testCase.effectName}`, () => {
      const compileResult = lowerEffectArray([testCase.effectNode], compileContext, 'doc.actions.0.effects');
      const compilerDiagnostic = compileResult.diagnostics.find(
        (diagnostic) => diagnostic.code === CNL_COMPILER_CHOICE_OPTIONS_RUNTIME_SHAPE_INVALID,
      );
      assert.ok(compilerDiagnostic);
      assert.equal(compilerDiagnostic.code, CNL_COMPILER_CHOICE_OPTIONS_RUNTIME_SHAPE_INVALID);

      const base = createValidGameDef();
      const def = {
        ...base,
        runtimeDataAssets: [{ id: 'tournament-standard', kind: 'scenario', payload: { blindSchedule: { levels: [] } } }],
        tableContracts: [
          {
            id: 'tournament-standard::blindSchedule.levels',
            assetId: 'tournament-standard',
            tablePath: 'blindSchedule.levels',
            fields: [{ field: 'bigBlind', type: 'int' }],
          },
        ],
        actions: [
          {
            ...base.actions[0],
            effects: [testCase.effectNode],
          },
        ],
      } as unknown as GameDef;
      const validatorDiagnostics = validateGameDef(def);
      const validatorDiagnostic = validatorDiagnostics.find(
        (diagnostic) => diagnostic.code === EFFECT_CHOICE_OPTIONS_RUNTIME_SHAPE_INVALID,
      );
      assert.ok(validatorDiagnostic);
      assert.equal(validatorDiagnostic.code, EFFECT_CHOICE_OPTIONS_RUNTIME_SHAPE_INVALID);

      assert.equal(compilerDiagnostic.message, validatorDiagnostic.message);
      assert.equal(compilerDiagnostic.suggestion, validatorDiagnostic.suggestion);
      assert.deepEqual(compilerDiagnostic.alternatives, validatorDiagnostic.alternatives);
    });
  }
});
