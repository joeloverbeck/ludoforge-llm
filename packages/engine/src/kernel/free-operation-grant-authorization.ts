import { asZoneId } from './branded.js';
import { compareTurnFlowFreeOperationGrantPriority, isTurnFlowActionClass } from '../contracts/index.js';
import { createCollector } from './execution-collector.js';
import { evalCondition } from './eval-condition.js';
import { createEvalRuntimeResources, type EvalRuntimeResources, type ReadContext } from './eval-context.js';
import { resolveCapturedSequenceZonesByKey } from './free-operation-captured-sequence-zones.js';
import { resolveGrantFreeOperationActionDomain } from './free-operation-action-domain.js';
import {
  collectGrantAwareMoveZoneCandidates,
  resolveGrantAwareMoveRuntimeBindings,
} from './free-operation-grant-bindings.js';
import { pendingFreeOperationGrantEquivalenceKey } from './free-operation-grant-overlap.js';
import { resolvePendingFreeOperationGrantSequenceStatus } from './free-operation-sequence-progression.js';
import { resolveTurnFlowActionClass } from './turn-flow-action-class.js';
import type { FreeOperationZoneFilterSurface } from './free-operation-zone-filter-contract.js';
import {
  collectFreeOperationZoneFilterProbeRebindableAliases,
  evaluateFreeOperationZoneFilterProbe,
} from './free-operation-zone-filter-probe.js';
import { shouldDeferFreeOperationZoneFilterFailure } from './missing-binding-policy.js';
import { kernelRuntimeError } from './runtime-error.js';
import { buildAdjacencyGraph } from './spatial.js';
import { freeOperationZoneFilterEvaluationError } from './turn-flow-error.js';
import type {
  ConditionAST,
  GameDef,
  GameState,
  Move,
  TurnFlowPendingFreeOperationGrant,
  TurnFlowRuntimeState,
} from './types.js';

interface MutableGrantZoneFilterEvalContext {
  def: GameDef;
  adjacencyGraph: ReturnType<typeof buildAdjacencyGraph>;
  state: GameState;
  activePlayer: GameState['activePlayer'];
  actorPlayer: GameState['activePlayer'];
  bindings: Readonly<Record<string, unknown>>;
  resources: EvalRuntimeResources;
  runtimeTableIndex: undefined;
  freeOperationOverlay: ReadContext['freeOperationOverlay'];
  maxQueryResults: undefined;
  collector: EvalRuntimeResources['collector'];
}

export const grantActionIds = (
  def: GameDef,
  grant: TurnFlowPendingFreeOperationGrant,
): readonly string[] => resolveGrantFreeOperationActionDomain(def, grant);

export const moveOperationClass = (
  def: GameDef,
  move: Move,
): TurnFlowPendingFreeOperationGrant['operationClass'] => {
  const resolved = resolveTurnFlowActionClass(def, move);
  if (resolved !== null) {
    if (
      move.actionClass !== undefined &&
      move.actionClass !== resolved &&
      isTurnFlowActionClass(move.actionClass)
    ) {
      if (
        resolved === 'operation' &&
        (move.actionClass === 'limitedOperation' || move.actionClass === 'operationPlusSpecialActivity')
      ) {
        return move.actionClass;
      }
      if (resolved === 'specialActivity' && move.actionClass === 'operationPlusSpecialActivity') {
        return move.actionClass;
      }
    }
    return resolved;
  }
  return 'operation';
};

export const isPendingFreeOperationGrantSequenceReady = (
  pending: readonly TurnFlowPendingFreeOperationGrant[],
  grant: TurnFlowPendingFreeOperationGrant,
  sequenceContexts?: TurnFlowRuntimeState['freeOperationSequenceContexts'],
): boolean => {
  return resolvePendingFreeOperationGrantSequenceStatus(pending, grant, sequenceContexts).ready;
};

export const isGrantOperationClassCompatible = (
  grantClass: TurnFlowPendingFreeOperationGrant['operationClass'],
  moveClass: TurnFlowPendingFreeOperationGrant['operationClass'],
): boolean => {
  if (grantClass === moveClass) {
    return true;
  }
  if (grantClass === 'operation' && moveClass === 'specialActivity') {
    return true;
  }
  return false;
};

const doesGrantApplyToMove = (
  def: GameDef,
  grant: TurnFlowPendingFreeOperationGrant,
  move: Move,
): boolean =>
  isGrantOperationClassCompatible(grant.operationClass, moveOperationClass(def, move)) &&
  grantActionIds(def, grant).includes(String(move.actionId));

export const collectGrantMoveZoneCandidates = (
  def: GameDef,
  state: GameState,
  move: Move,
  grant: Pick<TurnFlowPendingFreeOperationGrant, 'seat' | 'executeAsSeat' | 'executionContext' | 'moveZoneBindings'>,
): readonly string[] =>
  collectGrantAwareMoveZoneCandidates(def, state, move, grant);

export const collectGrantMoveZoneProbeCandidates = (
  def: GameDef,
  state: GameState,
  move: Move,
  grant: Pick<
    TurnFlowPendingFreeOperationGrant,
    'seat' | 'executeAsSeat' | 'executionContext' | 'moveZoneBindings' | 'moveZoneProbeBindings'
  >,
): readonly string[] =>
  collectGrantAwareMoveZoneCandidates(def, state, move, grant, { useProbeBindings: true });

const doesGrantSatisfySequenceContext = (
  def: GameDef,
  state: GameState,
  grant: TurnFlowPendingFreeOperationGrant,
  move: Move,
  options?: {
    readonly allowUnresolvedMoveZones?: boolean;
  },
): boolean => {
  const contextKey = grant.sequenceContext?.requireMoveZoneCandidatesFrom;
  if (contextKey === undefined) {
    return true;
  }
  if (state.turnOrderState.type !== 'cardDriven') {
    return false;
  }
  const captured = resolveCapturedSequenceZonesByKey(state, grant)?.[contextKey];
  if (captured === undefined || captured.length === 0) {
    return false;
  }
  const moveZones = collectGrantMoveZoneCandidates(def, state, move, grant);
  if (moveZones.length === 0) {
    return options?.allowUnresolvedMoveZones === true;
  }
  const capturedSet = new Set(captured);
  return moveZones.some((zoneId) => capturedSet.has(zoneId));
};

export const evaluateZoneFilterForMove = (
  def: GameDef,
  state: GameState,
  move: Move,
  grant: Pick<
    TurnFlowPendingFreeOperationGrant,
    'seat' | 'executeAsSeat' | 'executionContext' | 'moveZoneBindings' | 'sequenceBatchId'
  >,
  zoneFilter: ConditionAST,
  surface: FreeOperationZoneFilterSurface,
): boolean => {
  const shouldDeferZoneFilterFailure = (cause: unknown): boolean =>
    shouldDeferFreeOperationZoneFilterFailure(surface, cause);
  const adjacencyGraph = buildAdjacencyGraph(def.zones);
  const baseBindings = resolveGrantAwareMoveRuntimeBindings(def, state, move, grant);
  const capturedSequenceZonesByKey = resolveCapturedSequenceZonesByKey(state, grant);
  const rebindableAliases = collectFreeOperationZoneFilterProbeRebindableAliases(zoneFilter);
  const zones = collectGrantMoveZoneCandidates(def, state, move, grant);
  const evalRuntimeResources = createEvalRuntimeResources({ collector: createCollector() });
  const freeOperationOverlay = grant.executionContext === undefined && capturedSequenceZonesByKey === undefined
    ? undefined
    : {
        ...(grant.executionContext === undefined ? {} : { grantContext: grant.executionContext }),
        ...(capturedSequenceZonesByKey === undefined ? {} : { capturedSequenceZonesByKey }),
      };
  const evalContext: MutableGrantZoneFilterEvalContext = {
    def,
    adjacencyGraph,
    state,
    activePlayer: state.activePlayer,
    actorPlayer: state.activePlayer,
    bindings: baseBindings,
    resources: evalRuntimeResources,
    runtimeTableIndex: undefined,
    freeOperationOverlay,
    maxQueryResults: undefined,
    collector: evalRuntimeResources.collector,
  };
  const evaluateWithBindings = (bindings: Readonly<Record<string, unknown>>): boolean => {
    evalContext.bindings = bindings;
    return evalCondition(zoneFilter, evalContext);
  };
  if (zones.length === 0) {
    if (grant.moveZoneBindings !== undefined && grant.moveZoneBindings.length > 0) {
      return surface === 'legalChoices';
    }
    try {
      return evaluateWithBindings(baseBindings);
    } catch (cause) {
      if (shouldDeferZoneFilterFailure(cause)) {
        return true;
      }
      throw freeOperationZoneFilterEvaluationError({
        surface,
        actionId: String(move.actionId),
        moveParams: move.params,
        zoneFilter,
        candidateZones: zones,
        cause,
      });
    }
  }
  for (const zone of zones) {
    try {
      if (evaluateFreeOperationZoneFilterProbe({
        zoneId: asZoneId(zone),
        baseBindings,
        rebindableAliases,
        evaluateWithBindings,
      })) {
        return true;
      }
    } catch (cause) {
      if (shouldDeferZoneFilterFailure(cause)) {
        return true;
      }
      throw freeOperationZoneFilterEvaluationError({
        surface,
        actionId: String(move.actionId),
        moveParams: move.params,
        zoneFilter,
        candidateZones: zones,
        candidateZone: zone,
        cause,
      });
    }
  }
  return false;
};

export const doesGrantAuthorizeMove = (
  def: GameDef,
  state: GameState,
  pending: readonly TurnFlowPendingFreeOperationGrant[],
  grant: TurnFlowPendingFreeOperationGrant,
  move: Move,
): boolean =>
  isPendingFreeOperationGrantSequenceReady(
    pending,
    grant,
    state.turnOrderState.type === 'cardDriven' ? state.turnOrderState.runtime.freeOperationSequenceContexts : undefined,
  ) &&
  doesGrantApplyToMove(def, grant, move) &&
  doesGrantSatisfySequenceContext(def, state, grant, move) &&
  (
    grant.zoneFilter === undefined
    || evaluateZoneFilterForMove(def, state, move, grant, grant.zoneFilter, 'turnFlowEligibility')
  );

export const doesGrantPotentiallyAuthorizeMove = (
  def: GameDef,
  state: GameState,
  pending: readonly TurnFlowPendingFreeOperationGrant[],
  grant: TurnFlowPendingFreeOperationGrant,
  move: Move,
): boolean =>
  isPendingFreeOperationGrantSequenceReady(
    pending,
    grant,
    state.turnOrderState.type === 'cardDriven' ? state.turnOrderState.runtime.freeOperationSequenceContexts : undefined,
  ) &&
  doesGrantApplyToMove(def, grant, move) &&
  doesGrantSatisfySequenceContext(def, state, grant, move, { allowUnresolvedMoveZones: true }) &&
  (
    grant.zoneFilter === undefined
    || collectGrantMoveZoneCandidates(def, state, move, grant).length === 0
    || evaluateZoneFilterForMove(def, state, move, grant, grant.zoneFilter, 'turnFlowEligibility')
  );

export const doesGrantRequireSequenceContextMatch = doesGrantSatisfySequenceContext;

const compareAuthorizedPendingFreeOperationGrantPriority = (
  left: TurnFlowPendingFreeOperationGrant,
  right: TurnFlowPendingFreeOperationGrant,
): number => compareTurnFlowFreeOperationGrantPriority(left, right);

const authorizedPendingFreeOperationGrantEquivalenceKey = (
  def: GameDef,
  state: GameState,
  grant: TurnFlowPendingFreeOperationGrant,
): string => pendingFreeOperationGrantEquivalenceKey(def, state, grant);

export interface AuthorizedPendingFreeOperationGrantOverlapAmbiguity {
  readonly strongestGrantIds: readonly string[];
}

export const resolveAuthorizedPendingFreeOperationGrantOverlapAmbiguity = (
  def: GameDef,
  state: GameState,
  matchingGrants: readonly TurnFlowPendingFreeOperationGrant[],
): AuthorizedPendingFreeOperationGrantOverlapAmbiguity | null => {
  if (matchingGrants.length <= 1) {
    return null;
  }
  const canonicalGrant = selectCanonicalPendingFreeOperationGrant(matchingGrants);
  if (canonicalGrant === null) {
    return null;
  }
  const strongestMatches = matchingGrants.filter(
    (grant) => compareAuthorizedPendingFreeOperationGrantPriority(canonicalGrant, grant) === 0,
  );
  if (strongestMatches.length <= 1) {
    return null;
  }
  const equivalenceKeys = new Set(
    strongestMatches.map((grant) => authorizedPendingFreeOperationGrantEquivalenceKey(def, state, grant)),
  );
  if (equivalenceKeys.size <= 1) {
    return null;
  }
  return {
    strongestGrantIds: strongestMatches.map((grant) => grant.grantId),
  };
};

const assertNoAmbiguousAuthorizedPendingFreeOperationGrantOverlap = (
  def: GameDef,
  state: GameState,
  matchingGrants: readonly TurnFlowPendingFreeOperationGrant[],
  move: Move,
): void => {
  if (resolveAuthorizedPendingFreeOperationGrantOverlapAmbiguity(def, state, matchingGrants) === null) {
    return;
  }
  throw kernelRuntimeError(
    'RUNTIME_CONTRACT_INVALID',
    `Ambiguous overlapping free-operation grants matched actionId=${String(move.actionId)}; top-ranked grants must be equivalent or strictly ordered by contract.`,
  );
};

const selectCanonicalPendingFreeOperationGrant = (
  grants: readonly TurnFlowPendingFreeOperationGrant[],
): TurnFlowPendingFreeOperationGrant | null =>
  grants.reduce<TurnFlowPendingFreeOperationGrant | null>((selected, grant) => {
    if (selected === null) {
      return grant;
    }
    return compareAuthorizedPendingFreeOperationGrantPriority(selected, grant) <= 0
      ? selected
      : grant;
  }, null);

export interface AuthorizedPendingFreeOperationGrantResolution {
  readonly matchingGrants: readonly TurnFlowPendingFreeOperationGrant[];
  readonly canonicalGrant: TurnFlowPendingFreeOperationGrant | null;
  readonly strongestOutcomeGrant: TurnFlowPendingFreeOperationGrant | null;
  readonly ambiguity: AuthorizedPendingFreeOperationGrantOverlapAmbiguity | null;
}

export const resolveAuthorizedPendingFreeOperationGrants = (
  def: GameDef,
  state: GameState,
  pending: readonly TurnFlowPendingFreeOperationGrant[],
  activeSeat: string,
  move: Move,
  options?: {
    readonly ambiguityMode?: 'throw' | 'report';
  },
): AuthorizedPendingFreeOperationGrantResolution => {
  const matchingGrants = pending.filter(
    (grant) => grant.seat === activeSeat && doesGrantAuthorizeMove(def, state, pending, grant, move),
  );
  const ambiguity = resolveAuthorizedPendingFreeOperationGrantOverlapAmbiguity(def, state, matchingGrants);
  if (ambiguity !== null && options?.ambiguityMode !== 'report') {
    assertNoAmbiguousAuthorizedPendingFreeOperationGrantOverlap(def, state, matchingGrants, move);
  }
  const canonicalGrant = ambiguity === null ? selectCanonicalPendingFreeOperationGrant(matchingGrants) : null;
  const strongestOutcomeGrant = ambiguity === null
    ? selectCanonicalPendingFreeOperationGrant(
      matchingGrants.filter((grant) => grant.outcomePolicy === 'mustChangeGameplayState'),
    )
    : null;
  return {
    matchingGrants,
    canonicalGrant,
    strongestOutcomeGrant,
    ambiguity,
  };
};
