import { runtimeContractInvalidError } from './runtime-error.js';
import type { ActionSelectorContractViolation } from './action-selector-contract-registry.js';
import type { ActionDef } from './types.js';

export type SelectorBoundarySurface = 'applyMove' | 'legalChoices' | 'legalMoves';

export type SelectorSurface = 'actor' | 'executor';

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
      reason: 'invalidSelectorSpec',
      ...(selectorContractViolations === undefined ? {} : { selectorContractViolations }),
    },
    cause,
  );
