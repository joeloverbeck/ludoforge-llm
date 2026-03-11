// ---------------------------------------------------------------------------
// validate-gamedef-behavior.ts — Thin orchestrator
//
// This file re-exports validators from focused sub-modules.  Consumers that
// imported from this module continue to work unchanged.
// ---------------------------------------------------------------------------

export {
  validateStaticMapSpaceSelector,
  validateMapSpacePropertyReference,
  validateCanonicalBinding,
  EFFECT_DECLARED_BINDER_POLICY_BY_PATTERN,
  collectEffectDeclaredBinderPolicyPatternsForTest,
  normalizeDeclaredBinderDiagnosticPath,
  validateReference,
  tryStaticStringValue,
  validateMarkerStateLiteral,
  validateScopedVarReference,
  getBooleanCapableScopedVarType,
} from './validate-behavior-shared.js';

export { validateEffectAst, validateFreeOperationGrantContract } from './validate-effects.js';

export { validateValueExpr, validateNumericValueExpr, validateZoneRef } from './validate-values.js';

export { validateConditionAst } from './validate-conditions.js';

export {
  validateTokenFilter,
  validateChoiceOptionsQueryContract,
  validateOptionsQuery,
} from './validate-queries.js';

export { validatePostAdjacencyBehavior } from './validate-events.js';
