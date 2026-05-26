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
import { PolicyEvaluationContext, type PolicyEvaluationCandidate } from './policy-evaluation-core.js';
import { evaluatePostureEvaluator } from './policy-posture-eval.js';
import type { PreviewOptionRefStatus } from './policy-preview-inner.js';
import { evaluateSelector, type SelectedItem, type SelectorEvalCandidate } from './policy-selector-eval.js';
import { constraintsSatisfied, routeGraphProviderForDef } from './plan-role-constraint-eval.js';
import { eligiblePlanTemplates, type FilteredOutPlanTemplate } from './plan-template-eligibility.js';
import { availabilityForPlanRoot, capLimitFor, compareCompoundAvailability, PLAN_CAP_CLASS_BUDGETS } from './plan-proposal-compound-availability.js';
import type { CompoundAvailability } from '../kernel/microturn/compound-availability-probe.js';

export { PLAN_CAP_CLASS_BUDGETS };

interface PlanExprContext {
  readonly def?: GameDef;
  readonly seatId: string;
}

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
  readonly compoundAvailability?: CompoundAvailability;
  readonly roleBindings: Readonly<Record<string, PlanRoleBinding>>;
  readonly posture: PolicyPlanTrace['posture'];
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
  readonly filteredOutTemplates: readonly FilteredOutPlanTemplate[];
  readonly posture: PolicyPlanTrace['posture'];
}

export interface ProposeAdvisoryTurnPlanInput {
  readonly def: GameDef;
  readonly state: GameState;
  readonly seatId: ActiveDeciderSeatId | string;
  readonly playerId: PlayerId;
  readonly profile: CompiledAgentProfile;
  readonly catalog: AgentPolicyCatalog;
  readonly actionDecisions: readonly Extract<Decision, { readonly kind: 'actionSelection' }>[];
  readonly previewPlanRefsByRootStableMoveKey?: ReadonlyMap<string, ReadonlyMap<string, PreviewOptionRefStatus>>;
  readonly runtime?: import('../kernel/gamedef-runtime.js').GameDefRuntime;
}

export const proposeAdvisoryTurnPlan = (input: ProposeAdvisoryTurnPlanInput): PlanProposalResult => {
  const templateIds = input.profile.plan.planTemplates ?? [];
  if (templateIds.length === 0) {
    return emptyProposal('noTemplate', [], [], notConfiguredPosture());
  }

  const rootCandidates = rootCandidatesFor(input.def, input.actionDecisions);
  const activeDoctrines = activeDoctrineIds(input, rootCandidates);
  const rejectedDoctrines = rejectedDoctrineIds(input, activeDoctrines, rootCandidates);
  const templateEligibility = eligiblePlanTemplates({
    profileStrategyModules: input.profile.plan.strategyModules ?? [],
    compiledStrategyModules: input.catalog.compiled.strategyModules,
    activeDoctrines,
    templateIds,
  });
  const eligibleTemplateIds = templateEligibility.eligible;
  if (eligibleTemplateIds.length === 0) {
    return emptyProposal(
      'noEligibleTemplate',
      activeDoctrines,
      rejectedDoctrines,
      postureForTemplates(input, templateIds),
      undefined,
      undefined,
      templateEligibility.filteredOut,
    );
  }
  const alternatives: PlanProposalAlternative[] = [];
  let capClass: string | undefined;
  let capLimit: number | undefined;

  for (const templateId of eligibleTemplateIds) {
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
      const posture = evaluatePlanPosture(input, template, root);
      if (posture.vetoed) {
        continue;
      }
      const stableKey = `${priorityTier}:${templateId}:${root.stableMoveKey}`;
      alternatives.push({
        templateId,
        rootStableMoveKey: root.stableMoveKey,
        score: priorityTier + roleScore + considerationScore + posture.scoreDelta,
        priorityTier,
        stableKey,
        ...(template.root.compound === undefined
          ? {}
          : { compoundAvailability: availabilityForPlanRoot(input, root.decision, template.root.compound) }),
        roleBindings,
        posture: posture.trace,
      });
      if (alternatives.length >= capLimitFor(template)) {
        break;
      }
    }
  }

  if (rootCandidates.length === 0 || alternatives.length === 0) {
    const hasAnyRootMatch = eligibleTemplateIds.some((templateId) => {
      const template = input.catalog.library.planTemplates?.[templateId];
      return template !== undefined && rootCandidates.some((candidate) => rootMatchesTemplate(candidate, template));
    });
    return emptyProposal(
      hasAnyRootMatch ? 'noRoleBinding' : 'noRootMatch',
      activeDoctrines,
      rejectedDoctrines,
      postureForTemplates(input, eligibleTemplateIds),
      capClass,
      capLimit,
      templateEligibility.filteredOut,
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
    filteredOutTemplates: templateEligibility.filteredOut,
    posture: selected.posture,
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
    ...(input.runtime === undefined ? {} : { runtime: input.runtime }),
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
          evaluateExpr: (expr, candidate, _microturnOption, selectorItemKey) => {
            const value = evaluatePlanExpr(expr, input.state, candidate, selectorItemKey, planExprContextFor(input));
            return Array.isArray(value) ? undefined : value;
          },
        }).selected;
    const binding = selectRoleBinding(roleName, role, selectedItems, input, bindings, template, root);
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
      role.constraints.every((constraint) =>
        constraintRoleRefs(constraint).every((ref) => emitted.has(ref) || template.roles[ref] === undefined),
      ),
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

function constraintRoleRefs(constraint: CompiledPlanTemplate['roles'][string]['constraints'][number]): readonly string[] {
  switch (constraint.kind) {
    case 'notEqual':
      return [constraint.role];
    case 'locatedIn':
      return [constraint.role, constraint.container];
    case 'distinctOriginDestination':
      return [constraint.origin, constraint.destination];
    case 'reachable':
      return [constraint.from, constraint.to];
    case 'adjacent':
      return [constraint.a, constraint.b];
    case 'postState':
      return constraint.predicate.kind === 'roleLocatedIn'
        ? [constraint.role, constraint.predicate.role, constraint.predicate.container]
        : [constraint.role, ...Object.values(constraint.predicate.bindings)];
  }
  return [];
}

function selectRoleBinding(
  roleName: string,
  role: CompiledPlanTemplate['roles'][string],
  selectedItems: readonly SelectedItem[] | undefined,
  input: ProposeAdvisoryTurnPlanInput,
  existing: Readonly<Record<string, PlanRoleBinding>>,
  template: CompiledPlanTemplate,
  root: PlanProposalRootCandidate,
): PlanRoleBinding | null {
  const candidates = selectedItems === undefined
    ? fallbackRoleSelections(role, input.state)
    : selectedItems;
  const routeGraph = routeGraphProviderForDef(input.def);
  for (const selected of candidates) {
    const binding: PlanRoleBinding = {
      role: roleName,
      selectedId: selected.key,
      quality: selected.quality,
      rank: selected.rank,
      components: Object.fromEntries(selected.components ?? []),
    };
    if (constraintsSatisfied(binding, role.constraints, existing, input.state, routeGraph, {
      def: input.def,
      rootMove: root.move,
      root: template.root,
      steps: template.steps,
      playerId: input.playerId,
      ...(input.runtime === undefined ? {} : { runtime: input.runtime }),
    })) {
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
    if (consideration.when !== undefined && evaluatePlanExpr(consideration.when, input.state, candidate, undefined, planExprContextFor(input)) !== true) {
      return total;
    }
    const weight = numericExpr(consideration.weight, input.state, candidate, planExprContextFor(input));
    const value = numericExpr(consideration.value, input.state, candidate, planExprContextFor(input));
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

function activeDoctrineIds(
  input: ProposeAdvisoryTurnPlanInput,
  rootCandidates: readonly PlanProposalRootCandidate[],
): readonly string[] {
  const evaluationCandidates = rootCandidates.map(evaluationCandidateFor);
  const context = new PolicyEvaluationContext({
    def: input.def,
    state: input.state,
    playerId: input.playerId,
    seatId: String(input.seatId),
    catalog: input.catalog,
    parameterValues: input.profile.params,
    trustedMoveIndex: new Map(),
    cacheBinding: input.runtime === undefined ? { kind: 'isolated' } : { kind: 'runtime', runtime: input.runtime },
  }, evaluationCandidates);
  try {
    return (input.profile.plan.strategyModules ?? [])
      .filter((moduleId) => {
        const module = input.catalog.compiled.strategyModules?.[moduleId];
        if (module === undefined) {
          return false;
        }
        if (evaluationCandidates.length === 0) {
          return context.evaluateCompiledExpr(module.when, undefined) === true;
        }
        return evaluationCandidates.some((candidate) => context.evaluateCompiledExpr(module.when, candidate) === true);
      })
      .sort(compareStable);
  } finally {
    context.dispose();
  }
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
      tier = Math.max(tier, module.priority.tier + numericExpr(module.priority.value, input.state, undefined, planExprContextFor(input)));
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

function evaluatePlanPosture(
  input: ProposeAdvisoryTurnPlanInput,
  template: CompiledPlanTemplate,
  root: PlanProposalRootCandidate,
): { readonly trace: PolicyPlanTrace['posture']; readonly scoreDelta: number; readonly vetoed: boolean } {
  if (template.postureHook === undefined) {
    return { trace: notConfiguredPosture(), scoreDelta: 0, vetoed: false };
  }
  const evaluator = input.catalog.compiled.postureEvaluators?.[template.postureHook];
  if (evaluator === undefined) {
    return { trace: unavailablePosture('noPreviewDecision'), scoreDelta: 0, vetoed: false };
  }
  const candidate = evaluationCandidateFor(root);
  const context = new PolicyEvaluationContext({
    def: input.def,
    state: input.state,
    playerId: input.playerId,
    seatId: String(input.seatId),
    catalog: input.catalog,
    parameterValues: input.profile.params,
    trustedMoveIndex: new Map(),
    cacheBinding: input.runtime === undefined ? { kind: 'isolated' } : { kind: 'runtime', runtime: input.runtime },
    previewPlan: {
      resolvedRefs: input.previewPlanRefsByRootStableMoveKey?.get(root.stableMoveKey) ?? new Map(),
    },
  }, [candidate]);
  try {
    const result = evaluatePostureEvaluator(context, evaluator, candidate);
    return {
      trace: {
        status: result.status,
        mustViolations: result.mustViolations,
        preferContributions: result.preferContributions,
        ...(result.allyWeightContext === undefined ? {} : { allyWeightContext: result.allyWeightContext }),
      },
      scoreDelta: result.scoreDelta,
      vetoed: result.vetoed,
    };
  } finally {
    context.dispose();
  }
}

function evaluationCandidateFor(root: PlanProposalRootCandidate): PolicyEvaluationCandidate {
  return {
    move: root.move,
    stableMoveKey: root.stableMoveKey,
    actionId: root.actionId,
    previewRefIds: new Set(),
    unknownPreviewRefs: new Map(),
    unknownLookupRefs: new Map(),
    unknownCandidateParamRefs: new Map(),
  };
}

function postureForTemplates(
  input: ProposeAdvisoryTurnPlanInput,
  templateIds: readonly string[],
): PolicyPlanTrace['posture'] {
  const hooks = templateIds
    .map((templateId) => input.catalog.library.planTemplates?.[templateId]?.postureHook)
    .filter((hook): hook is string => hook !== undefined);
  if (hooks.length === 0) {
    return notConfiguredPosture();
  }
  return unavailablePosture('noPreviewDecision');
}

function notConfiguredPosture(): PolicyPlanTrace['posture'] {
  return {
    status: 'notConfigured',
    mustViolations: [],
    preferContributions: [],
  };
}

function unavailablePosture(reason: string): PolicyPlanTrace['posture'] {
  return {
    status: reason,
    mustViolations: [],
    preferContributions: [],
  };
}

function compareAlternatives(left: PlanProposalAlternative, right: PlanProposalAlternative): number {
  return right.priorityTier - left.priorityTier
    || right.score - left.score
    || compareCompoundAvailability(left.compoundAvailability, right.compoundAvailability)
    || compareStable(left.stableKey, right.stableKey);
}

function emptyProposal(
  status: PolicyPlanTrace['status'],
  activeDoctrines: readonly string[],
  rejectedDoctrines: PlanProposalResult['rejectedDoctrines'],
  posture: PolicyPlanTrace['posture'],
  capClass?: string,
  capLimit?: number,
  filteredOutTemplates: PlanProposalResult['filteredOutTemplates'] = [],
): PlanProposalResult {
  return {
    status,
    ...(capClass === undefined ? {} : { capClass }),
    ...(capLimit === undefined ? {} : { capLimit }),
    alternatives: [],
    activeDoctrines,
    rejectedDoctrines,
    filteredOutTemplates,
    posture,
  };
}

function numericExpr(
  expr: CompiledPolicyExpr | AgentPolicyExpr | undefined,
  state: GameState,
  candidate?: SelectorEvalCandidate,
  context?: PlanExprContext,
): number {
  const value = expr === undefined ? 0 : evaluatePlanExpr(expr, state, candidate, undefined, context);
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function planExprContextFor(input: ProposeAdvisoryTurnPlanInput): PlanExprContext {
  return { def: input.def, seatId: String(input.seatId) };
}

function evaluatePlanExpr(
  expr: CompiledPolicyExpr | AgentPolicyExpr,
  state: GameState,
  candidate?: SelectorEvalCandidate,
  selectorItemKey?: string,
  context?: PlanExprContext,
): string | number | boolean | readonly string[] | undefined {
  switch (expr.kind) {
    case 'literal':
      return typeof expr.value === 'string' || typeof expr.value === 'number' || typeof expr.value === 'boolean'
        ? expr.value
        : undefined;
    case 'op': {
      const values = expr.args.map((arg) => evaluatePlanExpr(arg, state, candidate, selectorItemKey, context));
      switch (expr.op) {
        case 'not':
          return values[0] !== true;
        case 'eq':
          return values[0] === values[1];
        case 'gt':
          return typeof values[0] === 'number' && typeof values[1] === 'number' && values[0] > values[1];
        case 'gte':
          return typeof values[0] === 'number' && typeof values[1] === 'number' && values[0] >= values[1];
        case 'lt':
          return typeof values[0] === 'number' && typeof values[1] === 'number' && values[0] < values[1];
        case 'lte':
          return typeof values[0] === 'number' && typeof values[1] === 'number' && values[0] <= values[1];
        case 'boolToNumber':
          return values[0] === true ? 1 : 0;
        case 'add':
          return values.reduce<number>((total, value) => total + (typeof value === 'number' ? value : 0), 0);
        case 'mul':
          return values.reduce<number>((total, value) => total * (typeof value === 'number' ? value : 0), 1);
        case 'if':
          return values[0] === true ? values[1] : values[2];
        case 'coalesce':
          return values.find((value) => value !== undefined);
        default:
          return undefined;
      }
    }
    case 'zoneProp': {
      const zoneId = typeof expr.zone === 'string'
        ? expr.zone
        : evaluatePlanExpr(expr.zone, state, candidate, selectorItemKey, context);
      if (typeof zoneId !== 'string' || context?.def === undefined) {
        return undefined;
      }
      const zone = context.def.zones.find((entry) => entry.id === zoneId);
      if (zone === undefined) {
        return undefined;
      }
      if (expr.prop === 'id') return zone.id;
      if (expr.prop === 'category') return zone.category;
      const value = zone.attributes?.[expr.prop];
      return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : undefined;
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
      if (expr.ref.kind === 'selectorItemIntrinsic') {
        return selectorItemKey;
      }
      if (expr.ref.kind === 'seatIntrinsic') {
        if (expr.ref.intrinsic === 'self') {
          return context?.seatId;
        }
        return context?.def?.seats?.[state.activePlayer]?.id;
      }
      if (expr.ref.kind === 'lookup') {
        if (expr.ref.surface !== 'policyState' || expr.ref.collection !== 'zones') {
          return undefined;
        }
        const key = evaluatePlanExpr(expr.ref.key, state, candidate, selectorItemKey, context);
        if (typeof key !== 'string' || context?.def?.zones.some((zone) => zone.id === key) !== true) {
          return expr.ref.onMissing !== 'unavailable' ? expr.ref.onMissing.value : undefined;
        }
        const zone = context.def.zones.find((entry) => entry.id === key);
        const root = {
          properties: zone?.attributes ?? {},
          markers: state.markers[key] ?? {},
          variables: state.zoneVars[key] ?? {},
        } as Readonly<Record<string, unknown>>;
        const value = expr.ref.path.reduce<unknown>((current, segment) =>
          current !== null && typeof current === 'object' && !Array.isArray(current)
            ? (current as Readonly<Record<string, unknown>>)[segment]
            : undefined, root);
        return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
          ? value
          : expr.ref.onMissing !== 'unavailable'
            ? expr.ref.onMissing.value
            : undefined;
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
