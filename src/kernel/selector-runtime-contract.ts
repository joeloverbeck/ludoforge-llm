import {
  runtimeContractInvalidError,
  type SelectorBoundarySurface,
  type SelectorSurface,
} from './runtime-error.js';
import { RUNTIME_CONTRACT_REASONS } from './runtime-reasons.js';
import type { ActionSelectorContractViolation } from './action-selector-contract-registry.js';
import type { ActionDef } from './types.js';

export const selectorInvalidSpecError = (
  boundary: SelectorBoundarySurface,
  selector: SelectorSurface,
  action: ActionDef,
  cause: unknown,
  selectorContractViolations?: readonly ActionSelectorContractViolation[],
) =>
  runtimeContractInvalidError(
    `${boundary}: invalid ${selector} selector for actionId=${String(action.id)}`,
    {
      surface: boundary,
      selector,
      actionId: action.id,
      reason: RUNTIME_CONTRACT_REASONS.INVALID_SELECTOR_SPEC,
      ...(selectorContractViolations === undefined ? {} : { selectorContractViolations }),
    },
    cause,
  );
