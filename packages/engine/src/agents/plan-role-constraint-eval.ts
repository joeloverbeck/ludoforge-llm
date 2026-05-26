import type { RouteGraphProvider } from '../kernel/route-graph-provider.js';
import { compileRouteGraphProvider } from '../kernel/route-graph-provider.js';
import { applyMove } from '../kernel/apply-move.js';
import type {
  CompiledPlanTemplate,
  GameDef,
  GameState,
  Move,
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
  readonly steps: readonly CompiledPlanTemplate['steps'][number][];
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
  const postState = probeRoleBoundPostState(binding, constraint, context, state);
  if (postState === null) {
    return false;
  }
  switch (constraint.predicate.kind) {
    case 'roleLocatedIn': {
      const { role, container } = constraint.predicate;
      return evaluateLocatedIn(binding, { kind: 'locatedIn', role, container }, existing, postState);
    }
  }
}

export function probeRoleBoundPostState(
  binding: PlanRoleBinding,
  constraint: PostStateConstraint,
  context: PostStateConstraintContext,
  state: GameState,
): GameState | null {
  const step = context.steps.find((entry) => entry.label === constraint.step);
  if (step === undefined || step.role !== constraint.role) {
    return null;
  }
  const move = bindStepTarget(context.rootMove, step, binding.selectedId);
  if (move === null) {
    return null;
  }
  const result = applyMove(
    context.def,
    state,
    move,
    { advanceToDecisionPoint: true, maxPhaseTransitionsPerMove: constraint.maxSteps },
    context.runtime,
  );
  return result.state;
}

function bindStepTarget(
  rootMove: Move,
  step: CompiledPlanTemplate['steps'][number],
  selectedId: string,
): Move | null {
  if (step.match.decisionKind !== 'actionSelection' && step.match.decisionKind !== 'chooseOne') {
    return null;
  }
  if (step.match.decisionPath === 'actionId') {
    return null;
  }
  return {
    ...rootMove,
    params: {
      ...rootMove.params,
      [step.match.decisionPath]: selectedId,
    },
  };
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
