import type { Diagnostic } from '../kernel/diagnostics.js';
import type { ActionSelectorContractViolation } from '../kernel/action-selector-contract-registry.js';
import { ACTION_SELECTOR_CONTRACT_DIAGNOSTIC_CODES } from './action-selector-diagnostic-codes.js';

export type ActionSelectorDiagnosticSurface = 'compileLowering' | 'crossValidate';

export interface BuildActionSelectorContractViolationDiagnosticInput {
  readonly violation: ActionSelectorContractViolation;
  readonly path: string;
  readonly actionId: string;
  readonly surface: ActionSelectorDiagnosticSurface;
}

function unsupportedActionSelectorViolation(violation: ActionSelectorContractViolation): never {
  throw new Error(`Unsupported action selector contract violation: role=${violation.role} kind=${violation.kind}`);
}

export const buildActionSelectorContractViolationDiagnostic = ({
  violation,
  path,
  actionId,
  surface,
}: BuildActionSelectorContractViolationDiagnosticInput): Diagnostic => {
  const severity = 'error' as const;

  if (violation.kind === 'bindingMalformed') {
    return {
      code: ACTION_SELECTOR_CONTRACT_DIAGNOSTIC_CODES[violation.role].bindingMalformed,
      path,
      severity,
      message:
        surface === 'compileLowering'
          ? `Action ${violation.role} binding "${violation.binding}" must be a canonical "$name" token.`
          : `Action "${actionId}" uses malformed ${violation.role} binding "${violation.binding}".`,
      suggestion: 'Use a canonical selector binding token like "$owner".',
    };
  }

  if (violation.kind === 'bindingNotDeclared') {
    return {
      code: ACTION_SELECTOR_CONTRACT_DIAGNOSTIC_CODES[violation.role].bindingNotDeclared,
      path,
      severity,
      message:
        surface === 'compileLowering'
          ? `Action ${violation.role} binding "${violation.binding}" is not declared in action params.`
          : `Action "${actionId}" uses undeclared ${violation.role} binding "${violation.binding}".`,
      suggestion: `Declare a matching action param (for example name: "$owner") or use a non-binding ${violation.role} selector.`,
    };
  }

  if (violation.role !== 'executor') {
    return unsupportedActionSelectorViolation(violation);
  }

  return {
    code: ACTION_SELECTOR_CONTRACT_DIAGNOSTIC_CODES.executor.bindingWithPipelineUnsupported,
    path,
    severity,
    message: `Action "${actionId}" uses binding-derived ${violation.role} "${violation.binding}" with action pipelines.`,
    suggestion: `Use actor/active/id/relative ${violation.role} selectors for pipelined actions.`,
  };
};
