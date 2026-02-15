import type { PlayerSel } from './types.js';
import { isCanonicalSelectorBindingIdentifier } from './binding-identifier-contract.js';
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

interface ActionSelectorContract {
  readonly role: ActionSelectorRole;
  readonly cardinality: 'single' | 'multi';
  readonly invalidSelectorSuggestion: string;
  readonly malformedBindingDiagnosticCode: string;
  readonly missingBindingDiagnosticCode: string;
  readonly bindingWithPipelineUnsupportedDiagnosticCode?: string;
}

const ACTION_SELECTOR_ROLE_ORDER: readonly ActionSelectorRole[] = ['actor', 'executor'];

const ACTION_SELECTOR_CONTRACTS: Readonly<Record<ActionSelectorRole, ActionSelectorContract>> = {
  actor: {
    role: 'actor',
    cardinality: 'multi',
    invalidSelectorSuggestion: PLAYER_SELECTOR_SUGGESTION,
    malformedBindingDiagnosticCode: 'CNL_COMPILER_ACTION_ACTOR_BINDING_INVALID',
    missingBindingDiagnosticCode: 'CNL_COMPILER_ACTION_ACTOR_BINDING_MISSING',
  },
  executor: {
    role: 'executor',
    cardinality: 'single',
    invalidSelectorSuggestion: ACTION_EXECUTOR_SELECTOR_SUGGESTION,
    malformedBindingDiagnosticCode: 'CNL_COMPILER_ACTION_EXECUTOR_BINDING_INVALID',
    missingBindingDiagnosticCode: 'CNL_COMPILER_ACTION_EXECUTOR_BINDING_MISSING',
    bindingWithPipelineUnsupportedDiagnosticCode: 'CNL_XREF_ACTION_EXECUTOR_PIPELINE_UNSUPPORTED',
  },
};

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
    if (!isCanonicalSelectorBindingIdentifier(binding)) {
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
