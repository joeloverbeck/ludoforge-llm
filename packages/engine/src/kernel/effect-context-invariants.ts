import type { EffectContext } from './effect-context.js';
import { effectRuntimeError } from './effect-error.js';
import { EFFECT_RUNTIME_REASONS } from './runtime-reasons.js';

export const assertEffectContextEntryInvariant = (ctx: EffectContext): void => {
  const mode = (ctx as { readonly mode?: unknown }).mode;
  const ownershipEnforcement = (ctx as { readonly decisionAuthority?: { readonly ownershipEnforcement?: unknown } })
    .decisionAuthority?.ownershipEnforcement;

  if (mode === 'execution' && ownershipEnforcement === 'strict') {
    return;
  }
  if (mode === 'discovery' && (ownershipEnforcement === 'strict' || ownershipEnforcement === 'probe')) {
    return;
  }

  throw effectRuntimeError(
    EFFECT_RUNTIME_REASONS.INTERNAL_INVARIANT_VIOLATION,
    'EffectContext mode/decisionAuthority ownershipEnforcement invariant violated at effect entry',
    { mode, ownershipEnforcement },
  );
};
