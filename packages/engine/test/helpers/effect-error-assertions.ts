import { isEffectErrorCode } from '../../src/kernel/index.js';

export const isNormalizedEffectRuntimeFailure = (
  error: unknown,
  expectedMessage: string,
): boolean =>
  isEffectErrorCode(error, 'EFFECT_RUNTIME') &&
  String(error).includes(expectedMessage) &&
  String(error).includes('sourceErrorCode');
