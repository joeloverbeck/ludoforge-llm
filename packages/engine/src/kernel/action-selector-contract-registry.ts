import type { PlayerSel } from './types.js';
import type { Diagnostic } from './diagnostics.js';
import { isCanonicalBindingIdentifier } from './binding-identifier-contract.js';
import { ACTION_EXECUTOR_SELECTOR_SUGGESTION, PLAYER_SELECTOR_SUGGESTION } from './player-selector-vocabulary.js';

export type ActionSelectorRole = 'actor' | 'executor';

export type ActionSelectorContractViolationKind =
  | 'bindingMalformed'
  | 'bindingNotDeclared'
  | 'bindingWithPipelineUnsupported';

export interface ActionSelectorContractViolation {
  readonly role: ActionSelectorRole;
  readonly kind: ActionSelectorContractViolationKind;
  readonly binding: string;
}

export const ACTION_SELECTOR_CONTRACT_DIAGNOSTIC_CODES = Object.freeze({
  actor: {
    malformedBinding: 'CNL_COMPILER_ACTION_ACTOR_BINDING_INVALID',
    missingBinding: 'CNL_COMPILER_ACTION_ACTOR_BINDING_MISSING',
  },
  executor: {
    malformedBinding: 'CNL_COMPILER_ACTION_EXECUTOR_BINDING_INVALID',
    missingBinding: 'CNL_COMPILER_ACTION_EXECUTOR_BINDING_MISSING',
    bindingWithPipelineUnsupported: 'CNL_XREF_ACTION_EXECUTOR_PIPELINE_UNSUPPORTED',
  },
} as const);

type ActionSelectorRoleDiagnosticCodes = (typeof ACTION_SELECTOR_CONTRACT_DIAGNOSTIC_CODES)[ActionSelectorRole];
type ActionSelectorRoleDiagnosticCode = ActionSelectorRoleDiagnosticCodes[keyof ActionSelectorRoleDiagnosticCodes];

export type ActionSelectorMalformedBindingDiagnosticCode = ActionSelectorRoleDiagnosticCodes['malformedBinding'];
export type ActionSelectorMissingBindingDiagnosticCode = ActionSelectorRoleDiagnosticCodes['missingBinding'];
export type ActionSelectorPipelineBindingUnsupportedDiagnosticCode =
  (typeof ACTION_SELECTOR_CONTRACT_DIAGNOSTIC_CODES)['executor']['bindingWithPipelineUnsupported'];
export type ActionSelectorContractDiagnosticCode = ActionSelectorRoleDiagnosticCode;

interface ActionSelectorContract {
  readonly role: ActionSelectorRole;
  readonly cardinality: 'single' | 'multi';
  readonly invalidSelectorSuggestion: string;
  readonly malformedBindingDiagnosticCode: ActionSelectorMalformedBindingDiagnosticCode;
  readonly missingBindingDiagnosticCode: ActionSelectorMissingBindingDiagnosticCode;
  readonly bindingWithPipelineUnsupportedDiagnosticCode?: ActionSelectorPipelineBindingUnsupportedDiagnosticCode;
}

const ACTION_SELECTOR_ROLE_ORDER: readonly ActionSelectorRole[] = ['actor', 'executor'];

const ACTION_SELECTOR_CONTRACTS: Readonly<Record<ActionSelectorRole, ActionSelectorContract>> = {
  actor: {
    role: 'actor',
    cardinality: 'multi',
    invalidSelectorSuggestion: PLAYER_SELECTOR_SUGGESTION,
    malformedBindingDiagnosticCode: ACTION_SELECTOR_CONTRACT_DIAGNOSTIC_CODES.actor.malformedBinding,
    missingBindingDiagnosticCode: ACTION_SELECTOR_CONTRACT_DIAGNOSTIC_CODES.actor.missingBinding,
  },
  executor: {
    role: 'executor',
    cardinality: 'single',
    invalidSelectorSuggestion: ACTION_EXECUTOR_SELECTOR_SUGGESTION,
    malformedBindingDiagnosticCode: ACTION_SELECTOR_CONTRACT_DIAGNOSTIC_CODES.executor.malformedBinding,
    missingBindingDiagnosticCode: ACTION_SELECTOR_CONTRACT_DIAGNOSTIC_CODES.executor.missingBinding,
    bindingWithPipelineUnsupportedDiagnosticCode: ACTION_SELECTOR_CONTRACT_DIAGNOSTIC_CODES.executor.bindingWithPipelineUnsupported,
  },
};

export type ActionSelectorDiagnosticSurface = 'compileLowering' | 'crossValidate';

export interface BuildActionSelectorContractViolationDiagnosticInput {
  readonly violation: ActionSelectorContractViolation;
  readonly path: string;
  readonly actionId: string;
  readonly surface: ActionSelectorDiagnosticSurface;
}

interface EvaluateActionSelectorContractsInput {
  readonly selectors: Readonly<Partial<Record<ActionSelectorRole, PlayerSel | null>>>;
  readonly declaredBindings: readonly string[];
  readonly hasPipeline: boolean;
  readonly enforceBindingDeclaration?: boolean;
  readonly enforcePipelineBindingCompatibility?: boolean;
}

const resolveSelectorBindingToken = (selector: PlayerSel | null | undefined): string | null => {
  if (selector === null || selector === undefined || typeof selector === 'string' || typeof selector !== 'object') {
    return null;
  }
  return 'chosen' in selector && typeof selector.chosen === 'string' ? selector.chosen : null;
};

export const getActionSelectorContract = (role: ActionSelectorRole): Readonly<ActionSelectorContract> =>
  ACTION_SELECTOR_CONTRACTS[role];

export const getActionSelectorRoleOrder = (): readonly ActionSelectorRole[] => ACTION_SELECTOR_ROLE_ORDER;

export const buildActionSelectorContractViolationDiagnostic = ({
  violation,
  path,
  actionId,
  surface,
}: BuildActionSelectorContractViolationDiagnosticInput): Diagnostic | null => {
  const contract = getActionSelectorContract(violation.role);
  const severity = 'error' as const;

  if (violation.kind === 'bindingMalformed') {
    return {
      code: contract.malformedBindingDiagnosticCode,
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
      code: contract.missingBindingDiagnosticCode,
      path,
      severity,
      message:
        surface === 'compileLowering'
          ? `Action ${violation.role} binding "${violation.binding}" is not declared in action params.`
          : `Action "${actionId}" uses undeclared ${violation.role} binding "${violation.binding}".`,
      suggestion: `Declare a matching action param (for example name: "$owner") or use a non-binding ${violation.role} selector.`,
    };
  }

  const code = contract.bindingWithPipelineUnsupportedDiagnosticCode;
  if (code === undefined) {
    return null;
  }

  return {
    code,
    path,
    severity,
    message: `Action "${actionId}" uses binding-derived ${violation.role} "${violation.binding}" with action pipelines.`,
    suggestion: `Use actor/active/id/relative ${violation.role} selectors for pipelined actions.`,
  };
};

export const evaluateActionSelectorContracts = ({
  selectors,
  declaredBindings,
  hasPipeline,
  enforceBindingDeclaration = true,
  enforcePipelineBindingCompatibility = true,
}: EvaluateActionSelectorContractsInput): readonly ActionSelectorContractViolation[] => {
  const violations: ActionSelectorContractViolation[] = [];
  const declared = new Set(declaredBindings);

  for (const role of ACTION_SELECTOR_ROLE_ORDER) {
    const selector = selectors[role];
    const binding = resolveSelectorBindingToken(selector);
    if (binding === null) {
      continue;
    }
    if (!isCanonicalBindingIdentifier(binding)) {
      violations.push({ role, kind: 'bindingMalformed', binding });
      continue;
    }

    if (enforceBindingDeclaration && !declared.has(binding)) {
      violations.push({ role, kind: 'bindingNotDeclared', binding });
    }

    const contract = ACTION_SELECTOR_CONTRACTS[role];
    if (
      enforcePipelineBindingCompatibility &&
      hasPipeline &&
      contract.bindingWithPipelineUnsupportedDiagnosticCode !== undefined
    ) {
      violations.push({ role, kind: 'bindingWithPipelineUnsupported', binding });
    }
  }

  return violations;
};
