import { asZoneId } from './branded.js';
import { compareTurnFlowFreeOperationGrantPriority, isTurnFlowActionClass } from '../contracts/index.js';
import { findActionById } from './action-capabilities.js';
import { resolveActionApplicabilityPreflight } from './action-applicability-preflight.js';
import { createCollector } from './execution-collector.js';
import { evalCondition } from './eval-condition.js';
import { createEvalContext, createEvalRuntimeResources } from './eval-context.js';
import { resolveGrantFreeOperationActionDomain } from './free-operation-action-domain.js';
import { pendingFreeOperationGrantEquivalenceKey } from './free-operation-grant-overlap.js';
import { resolveTurnFlowActionClass } from './turn-flow-action-class.js';
import type { FreeOperationZoneFilterSurface } from './free-operation-zone-filter-contract.js';
import {
  collectFreeOperationZoneFilterProbeRebindableAliases,
  evaluateFreeOperationZoneFilterProbe,
} from './free-operation-zone-filter-probe.js';
import { buildMoveRuntimeBindings, resolvePipelineDecisionBindingsForMove } from './move-runtime-bindings.js';
import { shouldDeferFreeOperationZoneFilterFailure } from './missing-binding-policy.js';
import { kernelRuntimeError } from './runtime-error.js';
import { buildRuntimeTableIndex } from './runtime-table-index.js';
import { buildAdjacencyGraph } from './spatial.js';
import { freeOperationZoneFilterEvaluationError } from './turn-flow-error.js';
import type {
  ConditionAST,
  GameDef,
  GameState,
  Move,
  TurnFlowPendingFreeOperationGrant,
} from './types.js';

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
): boolean => {
  const batchId = grant.sequenceBatchId;
  const sequenceIndex = grant.sequenceIndex;
  if (batchId === undefined || sequenceIndex === undefined) {
    return true;
  }
  return !pending.some(
    (candidate) =>
      candidate.grantId !== grant.grantId &&
      candidate.sequenceBatchId === batchId &&
      (candidate.sequenceIndex ?? Number.POSITIVE_INFINITY) < sequenceIndex,
  );
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

const buildActionAwareMoveRuntimeBindings = (
  def: GameDef,
  state: GameState,
  move: Move,
): Readonly<Record<string, unknown>> => {
  const baseBindings = buildMoveRuntimeBindings(move);
  const action = findActionById(def, move.actionId);
  if (action === undefined) {
    return baseBindings;
  }

  const preflight = resolveActionApplicabilityPreflight({
    def,
    state,
    action,
    adjacencyGraph: buildAdjacencyGraph(def.zones),
    runtimeTableIndex: buildRuntimeTableIndex(def),
    decisionPlayer: state.activePlayer,
    bindings: baseBindings,
    evalRuntimeResources: createEvalRuntimeResources(),
    skipPhaseCheck: true,
  });
  if (preflight.kind !== 'applicable' || preflight.pipelineDispatch.kind !== 'matched') {
    return baseBindings;
  }

  return buildMoveRuntimeBindings(
    move,
    resolvePipelineDecisionBindingsForMove(preflight.pipelineDispatch.profile, move.params),
  );
};

export const collectMoveZoneCandidates = (def: GameDef, move: Move): readonly string[] => {
  const zoneIdSet = new Set(def.zones.map((zone) => String(zone.id)));
  const candidates = new Set<string>();
  const collectFromValue = (paramValue: unknown): void => {
    if (typeof paramValue === 'string' && zoneIdSet.has(paramValue)) {
      candidates.add(paramValue);
      return;
    }
    if (Array.isArray(paramValue)) {
      for (const item of paramValue) {
        if (typeof item === 'string' && zoneIdSet.has(item)) {
          candidates.add(item);
        }
      }
    }
  };
  for (const paramValue of Object.values(move.params)) {
    collectFromValue(paramValue);
  }
  return [...candidates];
};

export const collectGrantMoveZoneCandidates = (
  def: GameDef,
  state: GameState,
  move: Move,
  grant: Pick<TurnFlowPendingFreeOperationGrant, 'moveZoneBindings'>,
): readonly string[] => {
  if (grant.moveZoneBindings === undefined || grant.moveZoneBindings.length === 0) {
    return collectMoveZoneCandidates(def, move);
  }
  const zoneIdSet = new Set(def.zones.map((zone) => String(zone.id)));
  const bindings = buildActionAwareMoveRuntimeBindings(def, state, move);
  const candidates = new Set<string>();
  const collectFromValue = (value: unknown): void => {
    if (typeof value === 'string' && zoneIdSet.has(value)) {
      candidates.add(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string' && zoneIdSet.has(item)) {
          candidates.add(item);
        }
      }
    }
  };
  for (const bindingName of grant.moveZoneBindings) {
    for (const [candidateBindingName, value] of Object.entries(bindings)) {
      if (
        candidateBindingName === bindingName
        || candidateBindingName.startsWith(`${bindingName}@`)
      ) {
        collectFromValue(value);
      }
    }
  }
  return [...candidates];
};

export const collectGrantMoveZoneProbeCandidates = (
  def: GameDef,
  state: GameState,
  move: Move,
  grant: Pick<TurnFlowPendingFreeOperationGrant, 'moveZoneBindings' | 'moveZoneProbeBindings'>,
): readonly string[] =>
  grant.moveZoneProbeBindings === undefined
    ? collectGrantMoveZoneCandidates(def, state, move, grant)
    : collectGrantMoveZoneCandidates(def, state, move, {
      moveZoneBindings: grant.moveZoneProbeBindings,
    });

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
  const batchId = grant.sequenceBatchId;
  if (batchId === undefined) {
    return false;
  }
  const captured = state.turnOrderState.runtime.freeOperationSequenceContexts?.[batchId]?.capturedMoveZonesByKey?.[contextKey];
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
  grant: Pick<TurnFlowPendingFreeOperationGrant, 'moveZoneBindings' | 'executionContext'>,
  zoneFilter: ConditionAST,
  surface: FreeOperationZoneFilterSurface,
): boolean => {
  const shouldDeferZoneFilterFailure = (cause: unknown): boolean =>
    shouldDeferFreeOperationZoneFilterFailure(surface, cause);
  const adjacencyGraph = buildAdjacencyGraph(def.zones);
  const baseBindings = buildActionAwareMoveRuntimeBindings(def, state, move);
  const rebindableAliases = collectFreeOperationZoneFilterProbeRebindableAliases(zoneFilter);
  const zones = collectGrantMoveZoneCandidates(def, state, move, grant);
  if (zones.length === 0) {
    if (grant.moveZoneBindings !== undefined && grant.moveZoneBindings.length > 0) {
      return surface === 'legalChoices';
    }
    try {
      return evalCondition(zoneFilter, createEvalContext({
        def,
        adjacencyGraph,
        state,
        activePlayer: state.activePlayer,
        actorPlayer: state.activePlayer,
        bindings: baseBindings,
        resources: createEvalRuntimeResources({ collector: createCollector() }),
        ...(
          grant.executionContext === undefined
            ? {}
            : { freeOperationOverlay: { grantContext: grant.executionContext } }
        ),
      }));
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
        evaluateWithBindings: (bindings) => evalCondition(zoneFilter, createEvalContext({
          def,
          adjacencyGraph,
          state,
          activePlayer: state.activePlayer,
          actorPlayer: state.activePlayer,
          bindings,
          resources: createEvalRuntimeResources({ collector: createCollector() }),
          ...(
            grant.executionContext === undefined
              ? {}
              : { freeOperationOverlay: { grantContext: grant.executionContext } }
          ),
        })),
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
  isPendingFreeOperationGrantSequenceReady(pending, grant) &&
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
  isPendingFreeOperationGrantSequenceReady(pending, grant) &&
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
