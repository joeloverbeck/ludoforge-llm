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

interface ActionSelectorContract {
  readonly role: ActionSelectorRole;
  readonly cardinality: 'single' | 'multi';
  readonly invalidSelectorSuggestion: string;
}

const ACTION_SELECTOR_ROLE_ORDER: readonly ActionSelectorRole[] = ['actor', 'executor'];

const ACTION_SELECTOR_CONTRACTS: Readonly<Record<ActionSelectorRole, ActionSelectorContract>> = {
  actor: {
    role: 'actor',
    cardinality: 'multi',
    invalidSelectorSuggestion: PLAYER_SELECTOR_SUGGESTION,
  },
  executor: {
    role: 'executor',
    cardinality: 'single',
    invalidSelectorSuggestion: ACTION_EXECUTOR_SELECTOR_SUGGESTION,
  },
};

interface EvaluateActionSelectorContractsInput {
  readonly selectors: Readonly<Partial<Record<ActionSelectorRole, ActionSelectorContractSelector | null>>>;
  readonly declaredBindings: readonly string[];
  readonly hasPipeline: boolean;
  readonly enforceBindingDeclaration?: boolean;
  readonly enforcePipelineBindingCompatibility?: boolean;
}

type ActionSelectorContractSelector = string | Readonly<Record<string, unknown>>;

const resolveSelectorBindingToken = (selector: ActionSelectorContractSelector | null | undefined): string | null => {
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
    if (!isCanonicalBindingIdentifier(binding)) {
      violations.push({ role, kind: 'bindingMalformed', binding });
      continue;
    }

    if (enforceBindingDeclaration && !declared.has(binding)) {
      violations.push({ role, kind: 'bindingNotDeclared', binding });
    }

    if (enforcePipelineBindingCompatibility && hasPipeline && role === 'executor') {
      violations.push({ role, kind: 'bindingWithPipelineUnsupported', binding });
    }
  }

  return violations;
};
