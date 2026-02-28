import type { ActionSelectorRole } from '../kernel/action-selector-contract-registry.js';

export const ACTION_SELECTOR_CONTRACT_DIAGNOSTIC_CODES = Object.freeze({
  actor: {
    bindingMalformed: 'CNL_COMPILER_ACTION_ACTOR_BINDING_INVALID',
    bindingNotDeclared: 'CNL_COMPILER_ACTION_ACTOR_BINDING_MISSING',
  },
  executor: {
    bindingMalformed: 'CNL_COMPILER_ACTION_EXECUTOR_BINDING_INVALID',
    bindingNotDeclared: 'CNL_COMPILER_ACTION_EXECUTOR_BINDING_MISSING',
    bindingWithPipelineUnsupported: 'CNL_XREF_ACTION_EXECUTOR_PIPELINE_UNSUPPORTED',
  },
} as const);

type ActionSelectorRoleDiagnosticCodes = (typeof ACTION_SELECTOR_CONTRACT_DIAGNOSTIC_CODES)[ActionSelectorRole];

export type ActionSelectorContractDiagnosticCode = ActionSelectorRoleDiagnosticCodes[keyof ActionSelectorRoleDiagnosticCodes];
