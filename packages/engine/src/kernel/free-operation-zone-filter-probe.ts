import { isEvalErrorCode } from './eval-error.js';
import type { ZoneId } from './branded.js';
import type { ConditionAST } from './types.js';
import { collectZoneSelectorAliasesFromCondition } from './zone-selector-aliases.js';

export interface FreeOperationZoneFilterProbeInput {
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
): boolean => {
  const rebindableAliases = input.rebindableAliases;
  let bindings: Readonly<Record<string, unknown>> = {
    ...input.baseBindings,
    $zone: input.zoneId,
  };
  const reboundAliases = new Set<string>();
  while (true) {
    try {
      return input.evaluateWithBindings(bindings);
    } catch (error) {
      if (!isEvalErrorCode(error, 'MISSING_BINDING')) {
        throw error;
      }
      const missingBinding = error.context?.binding;
      if (
        typeof missingBinding !== 'string' ||
        missingBinding.length === 0 ||
        missingBinding === '$zone' ||
        !rebindableAliases.has(missingBinding) ||
        Object.prototype.hasOwnProperty.call(bindings, missingBinding)
      ) {
        throw error;
      }
      if (reboundAliases.has(missingBinding)) {
        throw error;
      }
      reboundAliases.add(missingBinding);
      bindings = {
        ...bindings,
        [missingBinding]: input.zoneId,
      };
    }
  }
};
