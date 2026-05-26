import type { RouteGraphProvider } from '../kernel/route-graph-provider.js';
import { compileRouteGraphProvider } from '../kernel/route-graph-provider.js';
import { applyMove } from '../kernel/apply-move.js';
import { pickDeterministicChoiceValue } from '../kernel/choice-option-policy.js';
import { evaluateConditionWithCache } from '../kernel/compiled-condition-expr-cache.js';
import { createEvalContext, createEvalRuntimeResources } from '../kernel/eval-context.js';
import { resolveDecisionContinuation } from '../kernel/microturn/continuation.js';
import { buildAdjacencyGraph } from '../kernel/spatial.js';
import { asActionId, type PlayerId } from '../kernel/branded.js';
import type {
  ChoicePendingRequest,
  CompiledPlanTemplate,
  GameDef,
  GameState,
  Move,
  MoveParamValue,
  RouteGraphPayload,
  RuntimeDataAsset,
} from '../kernel/types.js';
import type { GameDefRuntime } from '../kernel/gamedef-runtime.js';
import { isSupportedPlanRoleConstraintKind } from '../kernel/plan-role-constraints.js';
import type { PlanRoleBinding } from './plan-execution.js';

type PlanRoleConstraint = CompiledPlanTemplate['roles'][string]['constraints'][number];
type PostStateConstraint = Extract<PlanRoleConstraint, { readonly kind: 'postState' }>;

export interface PostStateConstraintContext {
  readonly def: GameDef;
  readonly rootMove: Move;
  readonly root: CompiledPlanTemplate['root'];
  readonly steps: readonly CompiledPlanTemplate['steps'][number][];
  readonly playerId?: PlayerId;
  readonly runtime?: GameDefRuntime;
}

const routeGraphProviderByDef = new WeakMap<GameDef, RouteGraphProvider | null>();

export function routeGraphProviderForDef(def: GameDef): RouteGraphProvider | null {
  const cached = routeGraphProviderByDef.get(def);
  if (cached !== undefined || routeGraphProviderByDef.has(def)) {
    return cached ?? null;
  }
  const asset = (def.runtimeDataAssets ?? []).find(isRouteGraphAsset);
  const provider = asset === undefined ? null : compileRouteGraphProvider(asset.payload);
  routeGraphProviderByDef.set(def, provider);
  return provider;
}

export function constraintsSatisfied(
  binding: PlanRoleBinding,
  constraints: CompiledPlanTemplate['roles'][string]['constraints'],
  existing: Readonly<Record<string, PlanRoleBinding>>,
  state: GameState,
  routeGraph: RouteGraphProvider | null,
  postStateContext?: PostStateConstraintContext,
): boolean {
  return constraints.every((constraint) => {
    switch (constraint.kind) {
      case 'notEqual': {
        const other = existing[constraint.role];
        if (other === undefined) {
          return true;
        }
        return binding.selectedId !== other.selectedId;
      }
      case 'locatedIn':
        return evaluateLocatedIn(binding, constraint, existing, state);
      case 'distinctOriginDestination':
        return evaluateDistinctOriginDestination(binding, constraint, existing, state);
      case 'reachable':
        if (routeGraph === null) {
          throw new Error('reachable constraint reached runtime evaluation without a compiled RouteGraphProvider.');
        }
        return evaluateReachable(binding, constraint, existing, state, routeGraph);
      case 'adjacent':
        if (routeGraph === null) {
          throw new Error('adjacent constraint reached runtime evaluation without a compiled RouteGraphProvider.');
        }
        return evaluateAdjacent(binding, constraint, existing, state, routeGraph);
      case 'postState':
        if (postStateContext === undefined) {
          throw new Error('postState constraint reached runtime evaluation without a bounded post-state probe context.');
        }
        return evaluatePostState(binding, constraint, existing, state, postStateContext);
      default: {
        if (!isSupportedPlanRoleConstraintKind((constraint as { kind: string }).kind)) {
          throw new Error(`Unsupported plan role constraint kind "${(constraint as { kind: string }).kind}" reached runtime evaluation.`);
        }
        const exhaustive: never = constraint;
        return exhaustive;
      }
    }
  });
}

function evaluatePostState(
  binding: PlanRoleBinding,
  constraint: PostStateConstraint,
  existing: Readonly<Record<string, PlanRoleBinding>>,
  state: GameState,
  context: PostStateConstraintContext,
): boolean {
  const postState = probeRoleBoundPostState(binding, constraint, existing, context, state);
  if (postState === null) {
    return false;
  }
  switch (constraint.predicate.kind) {
    case 'roleLocatedIn': {
      const { role, container } = constraint.predicate;
      return evaluateLocatedIn(binding, { kind: 'locatedIn', role, container }, existing, postState);
    }
    case 'condition':
      return evaluatePostStateCondition(binding, constraint.predicate, existing, postState, context);
  }
}

function evaluatePostStateCondition(
  binding: PlanRoleBinding,
  predicate: Extract<PostStateConstraint['predicate'], { readonly kind: 'condition' }>,
  existing: Readonly<Record<string, PlanRoleBinding>>,
  postState: GameState,
  context: PostStateConstraintContext,
): boolean {
  const bindings: Record<string, string> = {};
  for (const [name, role] of Object.entries(predicate.bindings)) {
    const zone = zoneForRole(role, binding, existing, postState);
    if (zone === null) {
      return false;
    }
    bindings[name] = zone;
  }
  const playerId = context.playerId ?? postState.activePlayer;
  const resources = createEvalRuntimeResources({
    ...(context.runtime?.tokenStateIndexCache === undefined ? {} : { tokenStateIndexCache: context.runtime.tokenStateIndexCache }),
    ...(context.runtime?.compiledQueryPlanCache === undefined ? {} : { compiledQueryPlanCache: context.runtime.compiledQueryPlanCache }),
  });
  return evaluateConditionWithCache(predicate.condition, createEvalContext({
    def: context.def,
    adjacencyGraph: context.runtime?.adjacencyGraph ?? buildAdjacencyGraph(context.def.zones),
    state: postState,
    activePlayer: playerId,
    actorPlayer: playerId,
    bindings,
    resources,
    ...(context.runtime?.runtimeTableIndex === undefined ? {} : { runtimeTableIndex: context.runtime.runtimeTableIndex }),
  }));
}

export function probeRoleBoundPostState(
  binding: PlanRoleBinding,
  constraint: PostStateConstraint,
  existing: Readonly<Record<string, PlanRoleBinding>>,
  context: PostStateConstraintContext,
  state: GameState,
): GameState | null {
  const step = context.steps.find((entry) => entry.label === constraint.step);
  if (step === undefined || step.role !== constraint.role) {
    return null;
  }
  const move = materializePostStateProbeMove(binding, constraint, existing, context, state);
  if (move === null) {
    return null;
  }
  try {
    const result = applyMove(
      context.def,
      state,
      move,
      { advanceToDecisionPoint: true, maxPhaseTransitionsPerMove: constraint.maxSteps },
      context.runtime,
    );
    return result.state;
  } catch {
    return null;
  }
}

function materializePostStateProbeMove(
  binding: PlanRoleBinding,
  constraint: PostStateConstraint,
  existing: Readonly<Record<string, PlanRoleBinding>>,
  context: PostStateConstraintContext,
  state: GameState,
): Move | null {
  const constrainedIndex = context.steps.findIndex((entry) => entry.label === constraint.step);
  if (constrainedIndex === -1) {
    return null;
  }
  const steps = context.steps.slice(0, constrainedIndex + 1);
  const bindings = { ...existing, [binding.role]: binding };
  if (steps.some((step) => bindings[step.role] === undefined)) {
    return null;
  }
  const consumed = new Set<string>();
  const result = (() => {
    try {
      return resolveDecisionContinuation(
        context.def,
        state,
        materializeCompoundRootMove(context),
        {
          budgets: { maxDecisionProbeSteps: constraint.maxSteps },
          choose: (request) => {
            const step = steps.find((candidate) =>
              !consumed.has(candidate.label)
              && requestMatchesStep(request, context.root, candidate),
            );
            if (step === undefined) {
              return pickDeterministicChoiceValue(request);
            }
            consumed.add(step.label);
            return materializedStepValue(step, bindings[step.role]!.selectedId);
          },
        },
        context.runtime,
      );
    } catch {
      return null;
    }
  })();
  if (result === null || !result.complete) {
    return null;
  }
  let move = result.move;
  for (const step of steps) {
    if (consumed.has(step.label)) {
      continue;
    }
    const stepBinding = bindings[step.role];
    if (stepBinding === undefined) {
      return null;
    }
    const next = bindStepTargetDirectly(move, context, step, stepBinding.selectedId);
    if (next === null) {
      return null;
    }
    consumed.add(step.label);
    move = next;
  }
  for (const roleBinding of Object.values(bindings)) {
    if (steps.some((step) => step.role === roleBinding.role)) {
      continue;
    }
    move = bindRoleTargetDirectly(move, context, roleBinding.role, roleBinding.selectedId) ?? move;
  }
  return move;
}

function materializeCompoundRootMove(context: PostStateConstraintContext): Move {
  const compound = context.root.compound;
  if (compound === undefined || context.rootMove.compound !== undefined) {
    return context.rootMove;
  }
  const specialActionId = compound.specialTags[0];
  if (specialActionId === undefined) {
    return context.rootMove;
  }
  return {
    ...context.rootMove,
    compound: {
      specialActivity: { actionId: asActionId(specialActionId), params: {} },
      timing: compound.timing,
      ...(compound.interruptAfterStage === undefined ? {} : { insertAfterStage: compound.interruptAfterStage }),
    },
  };
}

function materializedStepValue(
  step: CompiledPlanTemplate['steps'][number],
  selectedId: string,
): MoveParamValue {
  return step.match.decisionKind === 'chooseNStep' ? [selectedId] : selectedId;
}

function bindStepTargetDirectly(
  move: Move,
  context: PostStateConstraintContext,
  step: CompiledPlanTemplate['steps'][number],
  selectedId: string,
): Move | null {
  if (step.match.decisionKind === 'actionSelection' || step.match.decisionPath === 'actionId') {
    return null;
  }
  const value = materializedStepValue(step, selectedId);
  const actionPath = stepActionPath(context.root, step);
  const actionTag = step.match.actionTag;
  const paramNames = actionTag === undefined
    ? [step.match.decisionPath]
    : findActionDecisionBinds(context.def, actionTag, step.match.decisionPath);
  return bindMoveParams(move, actionPath, paramNames.length === 0 ? [step.match.decisionPath] : paramNames, value);
}

function bindRoleTargetDirectly(
  move: Move,
  context: PostStateConstraintContext,
  role: string,
  selectedId: string,
): Move | null {
  const mainTag = context.root.actionTags.find((tag) => findActionDecisionBinds(context.def, tag, role).length > 0);
  if (mainTag !== undefined) {
    return bindMoveParams(
      move,
      'main',
      findActionDecisionBinds(context.def, mainTag, role),
      selectedId,
    );
  }
  const specialTag = context.root.compound?.specialTags
    .find((tag) => findActionDecisionBinds(context.def, tag, role).length > 0);
  if (specialTag !== undefined) {
    return bindMoveParams(
      move,
      'compound.specialActivity',
      findActionDecisionBinds(context.def, specialTag, role),
      selectedId,
    );
  }
  return null;
}

function bindMoveParams(
  move: Move,
  actionPath: 'main' | 'compound.specialActivity' | null,
  paramNames: readonly string[],
  value: MoveParamValue,
): Move | null {
  if (paramNames.length === 0) {
    return null;
  }
  if (actionPath === 'compound.specialActivity') {
    const compound = move.compound;
    if (compound === undefined) {
      return null;
    }
    return {
      ...move,
      compound: {
        ...compound,
        specialActivity: {
          ...compound.specialActivity,
          params: {
            ...compound.specialActivity.params,
            ...Object.fromEntries(paramNames.map((paramName) => [paramName, value])),
          },
        },
      },
    };
  }
  if (actionPath !== 'main') {
    return null;
  }
  return {
    ...move,
    params: {
      ...move.params,
      ...Object.fromEntries(paramNames.map((paramName) => [paramName, value])),
    },
  };
}

function findActionDecisionBinds(def: GameDef, actionTag: string, decisionName: string): readonly string[] {
  const normalized = normalizeDecisionName(decisionName);
  const binds: string[] = [];
  for (const pipeline of def.actionPipelines ?? []) {
    if (pipeline.actionId !== asActionId(actionTag)) {
      continue;
    }
    findDecisionBindsInNode(pipeline, normalized, binds);
  }
  return binds;
}

function findDecisionBindsInNode(node: unknown, normalizedDecisionName: string, binds: string[]): void {
  if (typeof node !== 'object' || node === null) {
    return;
  }
  if (Array.isArray(node)) {
    for (const entry of node) {
      findDecisionBindsInNode(entry, normalizedDecisionName, binds);
    }
    return;
  }
  const record = node as Record<string, unknown>;
  const bind = typeof record.bind === 'string' ? record.bind : null;
  if (bind !== null && normalizeDecisionName(bind) === normalizedDecisionName) {
    const internalDecisionId = typeof record.internalDecisionId === 'string' ? record.internalDecisionId : null;
    if (internalDecisionId?.includes('::') === true) {
      binds.push(internalDecisionId);
    } else if (internalDecisionId?.startsWith('decision:doc.') === true) {
      binds.push(`${internalDecisionId}::${bind}`);
    } else {
      binds.push(bind);
    }
  }
  for (const value of Object.values(record)) {
    findDecisionBindsInNode(value, normalizedDecisionName, binds);
  }
}

function requestMatchesStep(
  request: ChoicePendingRequest,
  root: CompiledPlanTemplate['root'],
  step: CompiledPlanTemplate['steps'][number],
): boolean {
  if (!requestKindMatchesStep(request, step)) {
    return false;
  }
  if (normalizeDecisionName(request.name) !== normalizeDecisionName(step.match.decisionPath)) {
    return false;
  }
  if (stepActionPath(root, step) === 'main') {
    return request.decisionPath === undefined || request.decisionPath === 'main';
  }
  if (stepActionPath(root, step) === 'compound.specialActivity') {
    return request.decisionPath === 'compound.specialActivity';
  }
  return false;
}

function stepActionPath(
  root: CompiledPlanTemplate['root'],
  step: CompiledPlanTemplate['steps'][number],
): 'main' | 'compound.specialActivity' | null {
  const actionTag = step.match.actionTag;
  if (actionTag === undefined || root.actionTags.includes(actionTag)) {
    return 'main';
  }
  return root.compound?.specialTags.includes(actionTag) === true ? 'compound.specialActivity' : null;
}

function requestKindMatchesStep(
  request: ChoicePendingRequest,
  step: CompiledPlanTemplate['steps'][number],
): boolean {
  return step.match.decisionKind === 'chooseNStep'
    ? request.type === 'chooseN'
    : request.type === step.match.decisionKind;
}

function normalizeDecisionName(value: string): string {
  return value.startsWith('$') ? value.slice(1) : value;
}

function evaluateLocatedIn(
  binding: PlanRoleBinding,
  constraint: Extract<PlanRoleConstraint, { readonly kind: 'locatedIn' }>,
  existing: Readonly<Record<string, PlanRoleBinding>>,
  state: GameState,
): boolean {
  const roleZone = zoneForRole(constraint.role, binding, existing, state);
  const containerZone = zoneForRoleOrLiteral(constraint.container, binding, existing, state);
  return roleZone !== null && containerZone !== null && roleZone === containerZone;
}

function evaluateDistinctOriginDestination(
  binding: PlanRoleBinding,
  constraint: Extract<PlanRoleConstraint, { readonly kind: 'distinctOriginDestination' }>,
  existing: Readonly<Record<string, PlanRoleBinding>>,
  state: GameState,
): boolean {
  const origin = zoneForRole(constraint.origin, binding, existing, state);
  const destination = zoneForRole(constraint.destination, binding, existing, state);
  return origin !== null && destination !== null && origin !== destination;
}

function evaluateReachable(
  binding: PlanRoleBinding,
  constraint: Extract<PlanRoleConstraint, { readonly kind: 'reachable' }>,
  existing: Readonly<Record<string, PlanRoleBinding>>,
  state: GameState,
  routeGraph: RouteGraphProvider,
): boolean {
  const from = zoneForRole(constraint.from, binding, existing, state);
  const to = zoneForRole(constraint.to, binding, existing, state);
  return from !== null && to !== null && routeGraph.reachable(from, to, constraint.via, constraint.maxHops);
}

function evaluateAdjacent(
  binding: PlanRoleBinding,
  constraint: Extract<PlanRoleConstraint, { readonly kind: 'adjacent' }>,
  existing: Readonly<Record<string, PlanRoleBinding>>,
  state: GameState,
  routeGraph: RouteGraphProvider,
): boolean {
  const a = zoneForRole(constraint.a, binding, existing, state);
  const b = zoneForRole(constraint.b, binding, existing, state);
  return a !== null && b !== null && routeGraph.adjacent(a, b);
}

function zoneForRoleOrLiteral(
  value: string,
  current: PlanRoleBinding,
  existing: Readonly<Record<string, PlanRoleBinding>>,
  state: GameState,
): string | null {
  if (value === current.role) {
    return zoneForBinding(current, state);
  }
  const roleBinding = existing[value];
  if (roleBinding !== undefined) {
    return zoneForBinding(roleBinding, state);
  }
  return state.zones[value] === undefined ? null : value;
}

function zoneForRole(
  role: string,
  current: PlanRoleBinding,
  existing: Readonly<Record<string, PlanRoleBinding>>,
  state: GameState,
): string | null {
  if (role === current.role) {
    return zoneForBinding(current, state);
  }
  const binding = existing[role];
  return binding === undefined ? null : zoneForBinding(binding, state);
}

function zoneForBinding(binding: PlanRoleBinding, state: GameState): string | null {
  if (state.zones[binding.selectedId] !== undefined) {
    return binding.selectedId;
  }
  for (const [zoneId, tokens] of Object.entries(state.zones)) {
    if (tokens.some((token) => String(token.id) === binding.selectedId)) {
      return zoneId;
    }
  }
  return null;
}

function isRouteGraphAsset(asset: RuntimeDataAsset): asset is RuntimeDataAsset<RouteGraphPayload> {
  return asset.kind === 'routeGraph' && isRouteGraphPayload(asset.payload);
}

function isRouteGraphPayload(payload: unknown): payload is RouteGraphPayload {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return false;
  }
  const record = payload as Partial<RouteGraphPayload>;
  return Array.isArray(record.routeClasses)
    && Array.isArray(record.edges)
    && typeof record.defaultMaxHops === 'number';
}
