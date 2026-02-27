import * as assert from 'node:assert/strict';

import {
  ILLEGAL_MOVE_REASONS,
  asPlayerId,
  type EffectAST,
  type MoveParamValue,
  type PlayerId,
} from '../../src/kernel/index.js';

export type ChoiceOwnershipPrimitive = 'chooseOne' | 'chooseN';

export const CHOICE_OWNER_PLAYER: PlayerId = asPlayerId(1);

export const buildChooserOwnedChoiceEffect = (
  primitive: ChoiceOwnershipPrimitive,
  decisionId: string,
  bind: string,
  values: readonly string[],
): EffectAST => {
  if (primitive === 'chooseOne') {
    return {
      chooseOne: {
        internalDecisionId: decisionId,
        bind,
        chooser: { id: CHOICE_OWNER_PLAYER },
        options: { query: 'enums', values },
      },
    };
  }

  return {
    chooseN: {
      internalDecisionId: decisionId,
      bind,
      chooser: { id: CHOICE_OWNER_PLAYER },
      options: { query: 'enums', values },
      n: 1,
    },
  };
};

export const ownershipSelection = (
  primitive: ChoiceOwnershipPrimitive,
  value: Exclude<MoveParamValue, readonly unknown[]>,
): MoveParamValue => (primitive === 'chooseOne' ? value : [value]);

export const assertChoiceRuntimeValidationFailed = (fn: () => unknown): void => {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof Error);
    const details = error as Error & { code?: unknown; context?: Record<string, unknown> };
    assert.equal(details.code, 'EFFECT_RUNTIME');
    assert.equal(details.context?.reason, 'choiceRuntimeValidationFailed');
    return true;
  });
};

export const assertIllegalMoveParamsInvalid = (fn: () => unknown): void => {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof Error);
    const details = error as Error & { code?: unknown; reason?: unknown };
    assert.equal(details.code, 'ILLEGAL_MOVE');
    assert.equal(details.reason, ILLEGAL_MOVE_REASONS.MOVE_PARAMS_INVALID);
    return true;
  });
};

export const assertDecisionOwnerMismatch = (fn: () => unknown): void => {
  assert.throws(
    fn,
    (error: unknown) => error instanceof Error && error.message.includes('decision owner mismatch'),
  );
};
