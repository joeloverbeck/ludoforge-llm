import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { lowerEffectArray, type EffectLoweringContext } from '../../src/cnl/compile-effects.js';
import type { GameSpecTurnFlowActionClass } from '../../src/cnl/game-spec-doc.js';
import { EffectASTSchema } from '../../src/kernel/schemas-ast.js';
import {
  TURN_FLOW_ACTION_CLASS_VALUES,
  type TurnFlowActionClass,
} from '../../src/kernel/turn-flow-action-class-contract.js';

type GameSpecCoversCanonical = TurnFlowActionClass extends GameSpecTurnFlowActionClass ? true : false;
type CanonicalCoversGameSpec = GameSpecTurnFlowActionClass extends TurnFlowActionClass ? true : false;

const GAME_SPEC_COVERS_CANONICAL: GameSpecCoversCanonical = true;
const CANONICAL_COVERS_GAME_SPEC: CanonicalCoversGameSpec = true;

const effectLoweringContext: EffectLoweringContext = {
  ownershipByBase: {},
};

describe('turn-flow action-class surface parity', () => {
  it('keeps GameSpec turn-flow action-class type contract equal to canonical contract', () => {
    assert.equal(GAME_SPEC_COVERS_CANONICAL, true);
    assert.equal(CANONICAL_COVERS_GAME_SPEC, true);
  });

  it('keeps EffectAST grantFreeOperation schema acceptance aligned with canonical action classes', () => {
    for (const actionClass of TURN_FLOW_ACTION_CLASS_VALUES) {
      const parsed = EffectASTSchema.safeParse({
        grantFreeOperation: {
          seat: 'self',
          operationClass: actionClass,
        },
      });
      assert.equal(parsed.success, true, `Expected schema to accept canonical action class: ${actionClass}`);
    }

    const invalid = EffectASTSchema.safeParse({
      grantFreeOperation: {
        seat: 'self',
        operationClass: 'invalidActionClass',
      },
    });
    assert.equal(invalid.success, false);
  });

  it('keeps compile-effects grantFreeOperation validation aligned with canonical action classes', () => {
    for (const actionClass of TURN_FLOW_ACTION_CLASS_VALUES) {
      const lowered = lowerEffectArray(
        [{ grantFreeOperation: { seat: 'self', operationClass: actionClass } }],
        effectLoweringContext,
        'doc.actions.0.effects',
      );
      assert.equal(lowered.value !== null, true, `Expected lowering to succeed for canonical action class: ${actionClass}`);
      assert.equal(
        lowered.diagnostics.some((diagnostic) => diagnostic.severity === 'error'),
        false,
        `Expected no lowering errors for canonical action class: ${actionClass}`,
      );
    }

    const loweredInvalid = lowerEffectArray(
      [{ grantFreeOperation: { seat: 'self', operationClass: 'invalidActionClass' } }],
      effectLoweringContext,
      'doc.actions.0.effects',
    );

    assert.equal(
      loweredInvalid.diagnostics.some((diagnostic) => diagnostic.path.endsWith('grantFreeOperation.operationClass')),
      true,
      'Expected invalid operationClass diagnostic path for non-canonical value',
    );
    assert.equal(
      loweredInvalid.diagnostics.some((diagnostic) => diagnostic.severity === 'error'),
      true,
      'Expected lowering error for non-canonical action class',
    );
  });
});
