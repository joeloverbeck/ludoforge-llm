import type { Diagnostic } from '../kernel/diagnostics.js';
import type { ActionSelectorContractViolation } from '../contracts/index.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from './compiler-diagnostic-codes.js';
import { CNL_XREF_DIAGNOSTIC_CODES } from './cross-validate-diagnostic-codes.js';

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

const ACTION_SELECTOR_VIOLATION_CODES = Object.freeze({
  actor: {
    bindingMalformed: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_ACTION_ACTOR_BINDING_INVALID,
    bindingNotDeclared: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_ACTION_ACTOR_BINDING_MISSING,
  },
  executor: {
    bindingMalformed: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_ACTION_EXECUTOR_BINDING_INVALID,
    bindingNotDeclared: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_ACTION_EXECUTOR_BINDING_MISSING,
    bindingWithPipelineUnsupported: CNL_XREF_DIAGNOSTIC_CODES.CNL_XREF_ACTION_EXECUTOR_PIPELINE_UNSUPPORTED,
  },
} as const);

export const buildActionSelectorContractViolationDiagnostic = ({
  violation,
  path,
  actionId,
  surface,
}: BuildActionSelectorContractViolationDiagnosticInput): Diagnostic => {
  const severity = 'error' as const;

  if (violation.kind === 'bindingMalformed') {
    return {
      code: ACTION_SELECTOR_VIOLATION_CODES[violation.role].bindingMalformed,
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
      code: ACTION_SELECTOR_VIOLATION_CODES[violation.role].bindingNotDeclared,
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
    code: ACTION_SELECTOR_VIOLATION_CODES.executor.bindingWithPipelineUnsupported,
    path,
    severity,
    message: `Action "${actionId}" uses binding-derived ${violation.role} "${violation.binding}" with action pipelines.`,
    suggestion: `Use actor/active/id/relative ${violation.role} selectors for pipelined actions.`,
  };
};
