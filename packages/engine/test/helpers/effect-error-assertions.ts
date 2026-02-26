import * as assert from 'node:assert/strict';
import { isEffectErrorCode } from '../../src/kernel/index.js';
import { isEvalErrorCode } from '../../src/kernel/eval-error.js';

export const isNormalizedEffectRuntimeFailure = (
  error: unknown,
  expectedMessage: string,
): boolean =>
  isEffectErrorCode(error, 'EFFECT_RUNTIME') &&
  String(error).includes(expectedMessage) &&
  String(error).includes('sourceErrorCode');

export const isMissingBindingEvalError = (error: unknown): boolean => isEvalErrorCode(error, 'MISSING_BINDING');

export const assertSelectorResolutionPolicyBoundary = (params: {
  readonly executionRun: () => unknown;
  readonly discoveryRun: () => unknown;
  readonly normalizedMessage: string;
}): void => {
  assert.throws(params.executionRun, (error: unknown) =>
    isNormalizedEffectRuntimeFailure(error, params.normalizedMessage),
  );
  assert.throws(params.discoveryRun, (error: unknown) => isMissingBindingEvalError(error));
};
