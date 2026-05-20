import type { ActiveDeciderSeatId, Decision } from '../kernel/microturn/types.js';
import type {
  AgentMicroturnDecisionInput,
  AgentPolicyCatalog,
  AgentPolicyExpr,
  CompiledAgentProfile,
  CompiledPlanTemplate,
  CompiledPolicyExpr,
  GameDef,
  GameState,
  Move,
  PolicyPlanTrace,
  StrategyModuleDef,
  CollectionRef,
} from '../kernel/types.js';
import type { PlayerId } from '../kernel/branded.js';
import { toMoveIdentityKey } from '../kernel/move-identity.js';
import { resolveEffectivePolicyProfile } from './policy-profile-resolution.js';
import {
  commitPlanExecutionState,
  type PlanExecutionState,
  type PlanExecutionStateStore,
  type PlanRoleBinding,
} from './plan-execution.js';
import { buildPlanProposalTrace } from './plan-trace.js';
import { evaluateSelector, type SelectedItem, type SelectorEvalCandidate } from './policy-selector-eval.js';

export const PLAN_CAP_CLASS_BUDGETS = {
  standard256: 256,
  deep1024: 1024,
} as const;

type PlanCapClass = keyof typeof PLAN_CAP_CLASS_BUDGETS;

export interface PlanProposalRootCandidate {
  readonly decision: Extract<Decision, { readonly kind: 'actionSelection' }>;
  readonly move: Move;
  readonly stableMoveKey: string;
  readonly actionId: string;
  readonly actionTags: readonly string[];
}

export interface PlanProposalAlternative {
  readonly templateId: string;
  readonly rootStableMoveKey: string;
  readonly score: number;
  readonly priorityTier: number;
  readonly stableKey: string;
  readonly roleBindings: Readonly<Record<string, PlanRoleBinding>>;
}

export interface SelectedPlanProposal extends PlanProposalAlternative {
  readonly intent: string;
  readonly nextStepIndex: number;
}

export interface PlanProposalResult {
  readonly status: PolicyPlanTrace['status'];
  readonly capClass?: string;
  readonly capLimit?: number;
  readonly selected?: SelectedPlanProposal;
  readonly alternatives: readonly PlanProposalAlternative[];
  readonly activeDoctrines: readonly string[];
  readonly rejectedDoctrines: readonly {
    readonly doctrineId: string;
    readonly reason: 'inactive' | 'noRootMatch';
  }[];
  readonly postureStatus: PolicyPlanTrace['postureStatus'];
}

export interface ProposeAdvisoryTurnPlanInput {
  readonly def: GameDef;
  readonly state: GameState;
  readonly seatId: ActiveDeciderSeatId | string;
  readonly playerId: PlayerId;
  readonly profile: CompiledAgentProfile;
  readonly catalog: AgentPolicyCatalog;
  readonly actionDecisions: readonly Extract<Decision, { readonly kind: 'actionSelection' }>[];
}

export const proposeAdvisoryTurnPlan = (input: ProposeAdvisoryTurnPlanInput): PlanProposalResult => {
  const templateIds = input.profile.plan.planTemplates ?? [];
  if (templateIds.length === 0) {
    return emptyProposal('noTemplate', [], [], 'notConfigured');
  }

  const rootCandidates = rootCandidatesFor(input.def, input.actionDecisions);
  const activeDoctrines = activeDoctrineIds(input);
  const rejectedDoctrines = rejectedDoctrineIds(input, activeDoctrines, rootCandidates);
  const alternatives: PlanProposalAlternative[] = [];
  let capClass: string | undefined;
  let capLimit: number | undefined;

  for (const templateId of templateIds) {
    const template = input.catalog.library.planTemplates?.[templateId];
    if (template === undefined) {
      continue;
    }
    capClass ??= template.caps.capClass;
    capLimit ??= capLimitFor(template);
    const matchingRoots = rootCandidates
      .filter((candidate) => rootMatchesTemplate(candidate, template))
      .slice(0, capLimitFor(template));
    for (const root of matchingRoots) {
      const roleBindings = bindPlanRoles(template, input, root);
      if (roleBindings === null) {
        continue;
      }
      const priorityTier = highestDoctrineTier(input, activeDoctrines, root);
      const roleScore = Object.values(roleBindings).reduce((total, binding) => total + binding.quality, 0);
      const considerationScore = scorePlanLeafConsiderations(input, root);
      const stableKey = `${priorityTier}:${templateId}:${root.stableMoveKey}`;
      alternatives.push({
        templateId,
        rootStableMoveKey: root.stableMoveKey,
        score: priorityTier + roleScore + considerationScore,
        priorityTier,
        stableKey,
        roleBindings,
      });
      if (alternatives.length >= capLimitFor(template)) {
        break;
      }
    }
  }

  if (rootCandidates.length === 0 || alternatives.length === 0) {
    const hasAnyRootMatch = templateIds.some((templateId) => {
      const template = input.catalog.library.planTemplates?.[templateId];
      return template !== undefined && rootCandidates.some((candidate) => rootMatchesTemplate(candidate, template));
    });
    return emptyProposal(
      hasAnyRootMatch ? 'noRoleBinding' : 'noRootMatch',
      activeDoctrines,
      rejectedDoctrines,
      postureStatusFor(input, templateIds),
      capClass,
      capLimit,
    );
  }

  const ranked = [...alternatives].sort(compareAlternatives);
  const selected = ranked[0]!;
  return {
    status: 'selected',
    ...(capClass === undefined ? {} : { capClass }),
    ...(capLimit === undefined ? {} : { capLimit }),
    selected: {
      ...selected,
      intent: selected.templateId,
      nextStepIndex: 0,
    },
    alternatives: ranked,
    activeDoctrines,
    rejectedDoctrines,
    postureStatus: postureStatusFor(input, templateIds),
  };
};

export const proposeAndCommitAdvisoryTurnPlan = (
  input: AgentMicroturnDecisionInput,
  store: PlanExecutionStateStore,
  profileIdOverride?: string,
): { readonly result: PlanProposalResult; readonly trace: PolicyPlanTrace } | undefined => {
  if (input.microturn.kind !== 'actionSelection' || input.microturn.seatId === '__chance' || input.microturn.seatId === '__kernel') {
    return undefined;
  }
  const resolved = resolveEffectivePolicyProfile(input.def, input.state.activePlayer, profileIdOverride);
  if (resolved === null || input.def.agents === undefined) {
    return undefined;
  }
  const actionDecisions = input.microturn.legalActions.filter(
    (decision): decision is Extract<Decision, { readonly kind: 'actionSelection' }> =>
      decision.kind === 'actionSelection' && decision.move !== undefined,
  );
  if (actionDecisions.length === 0) {
    return undefined;
  }
  const result = proposeAdvisoryTurnPlan({
    def: input.def,
    state: input.state,
    seatId: input.microturn.seatId,
    playerId: input.state.activePlayer,
    profile: resolved.profile,
    catalog: input.def.agents,
    actionDecisions,
  });
  if (result.selected !== undefined) {
    commitPlanExecutionState(store, planExecutionStateFromProposal(input, result.selected));
  }
  return { result, trace: buildPlanProposalTrace(result) };
};

function planExecutionStateFromProposal(
  input: AgentMicroturnDecisionInput,
  selected: SelectedPlanProposal,
): PlanExecutionState {
  return {
    selectedTemplate: selected.templateId,
    intent: selected.intent,
    roleBindings: selected.roleBindings,
    nextStepIndex: selected.nextStepIndex,
    fallbackHistory: [],
    deviations: [],
    turnId: String(input.microturn.turnId),
    seatId: String(input.microturn.seatId),
  };
}

function rootCandidatesFor(
  def: GameDef,
  actionDecisions: readonly Extract<Decision, { readonly kind: 'actionSelection' }>[],
): readonly PlanProposalRootCandidate[] {
  return actionDecisions
    .map((decision) => {
      const move = decision.move;
      if (move === undefined) {
        return null;
      }
      const actionId = String(move.actionId);
      return {
        decision,
        move,
        stableMoveKey: toMoveIdentityKey(def, move),
        actionId,
        actionTags: def.actionTagIndex?.byAction[actionId] ?? [],
      };
    })
    .filter((candidate): candidate is PlanProposalRootCandidate => candidate !== null)
    .sort((left, right) => compareStable(left.stableMoveKey, right.stableMoveKey));
}

function rootMatchesTemplate(candidate: PlanProposalRootCandidate, template: CompiledPlanTemplate): boolean {
  const ids = new Set(template.root.actionIds.map(String));
  const tags = new Set(template.root.actionTags.map(String));
  return ids.has(candidate.actionId) || candidate.actionTags.some((tag) => tags.has(String(tag)));
}

function bindPlanRoles(
  template: CompiledPlanTemplate,
  input: ProposeAdvisoryTurnPlanInput,
  root: PlanProposalRootCandidate,
): Readonly<Record<string, PlanRoleBinding>> | null {
  const bindings: Record<string, PlanRoleBinding> = {};
  const selectorCandidates = selectorCandidatesFor(input.def, input.actionDecisions);
  const rootCandidate = selectorCandidateFor(input.def, root);
  for (const [roleName, role] of orderedPlanRoles(template)) {
    const selector = input.catalog.compiled.selectors?.[String(role.selectorId)];
    const selectedItems = selector === undefined
      ? undefined
      : evaluateSelector(selector, {
          def: input.def,
          state: input.state,
          candidates: selectorCandidates,
          candidate: rootCandidate,
          ...(input.catalog.compiled.selectors === undefined ? {} : { selectors: input.catalog.compiled.selectors }),
          evaluateExpr: (expr, candidate) => {
            const value = evaluatePlanExpr(expr, input.state, candidate);
            return Array.isArray(value) ? undefined : value;
          },
        }).selected;
    const binding = selectRoleBinding(roleName, role, selectedItems, input.state, bindings);
    if (binding === null) {
      if (role.required) {
        return null;
      }
      continue;
    }
    bindings[roleName] = binding;
  }
  return bindings;
}

function orderedPlanRoles(
  template: CompiledPlanTemplate,
): readonly (readonly [string, CompiledPlanTemplate['roles'][string]])[] {
  const remaining = Object.entries(template.roles).sort(([left], [right]) => compareStable(left, right));
  const ordered: (readonly [string, CompiledPlanTemplate['roles'][string]])[] = [];
  const emitted = new Set<string>();

  while (remaining.length > 0) {
    const index = remaining.findIndex(([, role]) =>
      role.constraints.every((constraint) => emitted.has(constraint.role) || template.roles[constraint.role] === undefined),
    );
    const nextIndex = index === -1 ? 0 : index;
    const [next] = remaining.splice(nextIndex, 1);
    if (next === undefined) {
      break;
    }
    ordered.push(next);
    emitted.add(next[0]);
  }

  return ordered;
}

function selectRoleBinding(
  roleName: string,
  role: CompiledPlanTemplate['roles'][string],
  selectedItems: readonly SelectedItem[] | undefined,
  state: GameState,
  existing: Readonly<Record<string, PlanRoleBinding>>,
): PlanRoleBinding | null {
  const candidates = selectedItems === undefined
    ? fallbackRoleSelections(role, state)
    : selectedItems;
  for (const selected of candidates) {
    const binding: PlanRoleBinding = {
      role: roleName,
      selectedId: selected.key,
      quality: selected.quality,
      rank: selected.rank,
      components: Object.fromEntries(selected.components ?? []),
    };
    if (constraintsSatisfied(binding, role.constraints, existing)) {
      return binding;
    }
  }
  return null;
}

function fallbackRoleSelections(
  role: CompiledPlanTemplate['roles'][string],
  state: GameState,
): readonly SelectedItem[] {
  const selectedId = firstRoleSelection(role.selector.source, state);
  return selectedId === null
    ? []
    : [{ key: selectedId, quality: 0, rank: 0, components: new Map() }];
}

function scorePlanLeafConsiderations(
  input: ProposeAdvisoryTurnPlanInput,
  root: PlanProposalRootCandidate,
): number {
  const candidate = selectorCandidateFor(input.def, root);
  return input.profile.plan.considerations.reduce((total, considerationId) => {
    const consideration = input.catalog.compiled.considerations[considerationId];
    if (consideration === undefined) {
      return total;
    }
    if (consideration.when !== undefined && evaluatePlanExpr(consideration.when, input.state, candidate) !== true) {
      return total;
    }
    const weight = numericExpr(consideration.weight, input.state, candidate);
    const value = numericExpr(consideration.value, input.state, candidate);
    return total + (weight * value);
  }, 0);
}

function selectorCandidatesFor(
  def: GameDef,
  actionDecisions: readonly Extract<Decision, { readonly kind: 'actionSelection' }>[],
): readonly SelectorEvalCandidate[] {
  return rootCandidatesFor(def, actionDecisions).map((candidate) => selectorCandidateFor(def, candidate));
}

function selectorCandidateFor(def: GameDef, root: PlanProposalRootCandidate): SelectorEvalCandidate {
  return {
    stableMoveKey: root.stableMoveKey,
    move: root.move,
    actionId: root.actionId,
  };
}

function firstRoleSelection(
  source: CompiledPlanTemplate['roles'][string]['selector']['source'],
  state: GameState,
): string | null {
  switch (source.kind) {
    case 'collection':
      return firstCollectionKey(source.collection, state);
    case 'product': {
      const left = firstCollectionKey(source.left, state);
      const right = firstCollectionKey(source.right, state);
      return left === null || right === null ? null : `${left}|${right}`;
    }
    case 'routePairs':
    case 'subset':
    case 'candidateParams':
    case 'microturnOptions':
      return null;
  }
}

function firstCollectionKey(
  collection: CollectionRef,
  state: GameState,
): string | null {
  switch (collection.kind) {
    case 'zones':
      return Object.keys(state.zones).sort(compareStable)[0] ?? null;
    case 'players':
      return state.playerCount > 0 ? '1' : null;
    case 'tokens':
      return Object.entries(state.zones)
        .sort(([left], [right]) => compareStable(left, right))
        .flatMap(([, tokens]) => tokens
          .filter((token) => collection.tokenType === undefined || token.type === collection.tokenType)
          .map((token) => String(token.id)))
        .sort(compareStable)[0] ?? null;
    case 'cards':
    case 'authoredFinite':
      return null;
  }
}

function constraintsSatisfied(
  binding: PlanRoleBinding,
  constraints: CompiledPlanTemplate['roles'][string]['constraints'],
  existing: Readonly<Record<string, PlanRoleBinding>>,
): boolean {
  return constraints.every((constraint) => {
    const other = existing[constraint.role];
    if (other === undefined) {
      return true;
    }
    if (constraint.kind === 'notEqual') {
      return binding.selectedId !== other.selectedId;
    }
    return true;
  });
}

function activeDoctrineIds(input: ProposeAdvisoryTurnPlanInput): readonly string[] {
  return (input.profile.plan.strategyModules ?? [])
    .filter((moduleId) => {
      const module = input.catalog.compiled.strategyModules?.[moduleId];
      return module !== undefined && evaluateBooleanExpr(module.when, input.state);
    })
    .sort(compareStable);
}

function rejectedDoctrineIds(
  input: ProposeAdvisoryTurnPlanInput,
  active: readonly string[],
  rootCandidates: readonly PlanProposalRootCandidate[],
): PlanProposalResult['rejectedDoctrines'] {
  const activeSet = new Set(active);
  const inactive = (input.profile.plan.strategyModules ?? [])
    .filter((moduleId) => !activeSet.has(moduleId))
    .map<PlanProposalResult['rejectedDoctrines'][number]>((doctrineId) => ({ doctrineId, reason: 'inactive' }));
  const noRootMatch = active
    .filter((moduleId) => {
      const module = input.catalog.compiled.strategyModules?.[moduleId];
      return module !== undefined && !rootCandidates.some((root) => moduleAppliesToRoot(module, root));
    })
    .map<PlanProposalResult['rejectedDoctrines'][number]>((doctrineId) => ({ doctrineId, reason: 'noRootMatch' }));
  return [...inactive, ...noRootMatch].sort((left, right) => compareStable(left.doctrineId, right.doctrineId));
}

function highestDoctrineTier(
  input: ProposeAdvisoryTurnPlanInput,
  doctrineIds: readonly string[],
  root: PlanProposalRootCandidate,
): number {
  let tier = 0;
  for (const doctrineId of doctrineIds) {
    const module = input.catalog.compiled.strategyModules?.[doctrineId];
    if (module !== undefined && moduleAppliesToRoot(module, root)) {
      tier = Math.max(tier, module.priority.tier + numericExpr(module.priority.value, input.state));
    }
  }
  return tier;
}

function moduleAppliesToRoot(module: StrategyModuleDef, root: PlanProposalRootCandidate): boolean {
  if (!module.applies.scopes.includes('move')) {
    return false;
  }
  if (module.applies.actionTags === undefined || module.applies.actionTags.length === 0) {
    return true;
  }
  const moduleTags = new Set(module.applies.actionTags.map(String));
  return root.actionTags.some((tag) => moduleTags.has(String(tag)));
}

function postureStatusFor(
  input: ProposeAdvisoryTurnPlanInput,
  templateIds: readonly string[],
): PolicyPlanTrace['postureStatus'] {
  const hooks = templateIds
    .map((templateId) => input.catalog.library.planTemplates?.[templateId]?.postureHook)
    .filter((hook): hook is string => hook !== undefined);
  if (hooks.length === 0) {
    return 'notConfigured';
  }
  return 'unavailable';
}

function capLimitFor(template: CompiledPlanTemplate): number {
  return PLAN_CAP_CLASS_BUDGETS[template.caps.capClass as PlanCapClass] ?? PLAN_CAP_CLASS_BUDGETS.standard256;
}

function compareAlternatives(left: PlanProposalAlternative, right: PlanProposalAlternative): number {
  return right.priorityTier - left.priorityTier
    || right.score - left.score
    || compareStable(left.stableKey, right.stableKey);
}

function emptyProposal(
  status: PolicyPlanTrace['status'],
  activeDoctrines: readonly string[],
  rejectedDoctrines: PlanProposalResult['rejectedDoctrines'],
  postureStatus: PolicyPlanTrace['postureStatus'],
  capClass?: string,
  capLimit?: number,
): PlanProposalResult {
  return {
    status,
    ...(capClass === undefined ? {} : { capClass }),
    ...(capLimit === undefined ? {} : { capLimit }),
    alternatives: [],
    activeDoctrines,
    rejectedDoctrines,
    postureStatus,
  };
}

function evaluateBooleanExpr(expr: CompiledPolicyExpr | AgentPolicyExpr, state: GameState): boolean {
  const value = evaluatePlanExpr(expr, state);
  return value === true || value === 1;
}

function numericExpr(
  expr: CompiledPolicyExpr | AgentPolicyExpr | undefined,
  state: GameState,
  candidate?: SelectorEvalCandidate,
): number {
  const value = expr === undefined ? 0 : evaluatePlanExpr(expr, state, candidate);
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function evaluatePlanExpr(
  expr: CompiledPolicyExpr | AgentPolicyExpr,
  state: GameState,
  candidate?: SelectorEvalCandidate,
): string | number | boolean | readonly string[] | undefined {
  switch (expr.kind) {
    case 'literal':
      return typeof expr.value === 'string' || typeof expr.value === 'number' || typeof expr.value === 'boolean'
        ? expr.value
        : undefined;
    case 'op': {
      const values = expr.args.map((arg) => evaluatePlanExpr(arg, state, candidate));
      switch (expr.op) {
        case 'not':
          return values[0] !== true;
        case 'eq':
          return values[0] === values[1];
        case 'boolToNumber':
          return values[0] === true ? 1 : 0;
        case 'add':
          return values.reduce<number>((total, value) => total + (typeof value === 'number' ? value : 0), 0);
        default:
          return undefined;
      }
    }
    case 'ref':
      if (expr.ref.kind === 'candidateIntrinsic') {
        switch (expr.ref.intrinsic) {
          case 'actionId':
            return candidate?.actionId;
          case 'stableMoveKey':
            return candidate?.stableMoveKey;
          default:
            return undefined;
        }
      }
      return undefined;
    case 'param':
      return undefined;
  }
  return undefined;
}

function compareStable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
