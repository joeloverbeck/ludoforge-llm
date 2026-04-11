import { isEvalErrorCode } from './eval-error.js';
import type { ZoneId } from './branded.js';
import type { ConditionAST } from './types.js';
import type { FreeOperationZoneFilterSurface } from './free-operation-zone-filter-contract.js';
import {
  zoneFilterDeferred,
  zoneFilterResolved,
  zoneFilterFailed,
  type ZoneFilterEvaluationResult,
} from './zone-filter-evaluation-result.js';
import { collectZoneSelectorAliasesFromCondition } from './zone-selector-aliases.js';
import {
  isPerZoneInterpolatedBindingMissingVar,
  isUnresolvedTemplateBindingMissingVar,
} from './missing-binding-policy.js';

export interface FreeOperationZoneFilterProbeInput {
  readonly surface: FreeOperationZoneFilterSurface;
  readonly zoneId: ZoneId;
  readonly baseBindings: Readonly<Record<string, unknown>>;
  readonly rebindableAliases: ReadonlySet<string>;
  readonly evaluateWithBindings: (bindings: Readonly<Record<string, unknown>>) => boolean;
}

export const collectFreeOperationZoneFilterProbeRebindableAliases = (
  condition: ConditionAST,
): ReadonlySet<string> => {
  const aliases = new Set(collectZoneSelectorAliasesFromCondition(condition));
  aliases.delete('$zone');
  return aliases;
};

/**
 * Canonical probe contract for free-operation zone filters:
 * - always bind $zone to the candidate zone
 * - when probe-time missing bindings are encountered, deterministically bind
 *   each unresolved alias to the same candidate zone and retry
 * - fail fast for invalid/malicious rebinding cases
 */
export const evaluateFreeOperationZoneFilterProbe = (
  input: FreeOperationZoneFilterProbeInput,
): ZoneFilterEvaluationResult => {
  const rebindableAliases = input.rebindableAliases;
  let bindings: Readonly<Record<string, unknown>> = {
    ...input.baseBindings,
    $zone: input.zoneId,
  };
  const reboundAliases = new Set<string>();
  while (true) {
    try {
      return zoneFilterResolved(input.evaluateWithBindings(bindings));
    } catch (error) {
      if (isPerZoneInterpolatedBindingMissingVar(error, input.zoneId)) {
        return zoneFilterDeferred('missingVar');
      }
      if (
        input.surface === 'legalChoices' &&
        isUnresolvedTemplateBindingMissingVar(error, bindings)
      ) {
        return zoneFilterDeferred('missingVar');
      }
      if (!isEvalErrorCode(error, 'MISSING_BINDING')) {
        // Non-MISSING_BINDING errors cannot be retried — return as failed
        // so the caller can apply surface-aware deferral policy.
        return zoneFilterFailed(error);
      }
      const missingBinding = error.context?.binding;
      if (
        typeof missingBinding !== 'string' ||
        missingBinding.length === 0 ||
        missingBinding === '$zone' ||
        !rebindableAliases.has(missingBinding) ||
        Object.prototype.hasOwnProperty.call(bindings, missingBinding)
      ) {
        // Non-rebindable MISSING_BINDING — return as failed so the caller
        // can apply surface-aware deferral policy.
        return zoneFilterFailed(error);
      }
      if (reboundAliases.has(missingBinding)) {
        return zoneFilterFailed(error);
      }
      reboundAliases.add(missingBinding);
      bindings = {
        ...bindings,
        [missingBinding]: input.zoneId,
      };
    }
  }
};
