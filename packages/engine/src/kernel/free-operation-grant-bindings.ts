import { findActionById } from './action-capabilities.js';
import { resolveActionApplicabilityPreflight } from './action-applicability-preflight.js';
import { asPlayerId } from './branded.js';
import { createEvalRuntimeResources } from './eval-context.js';
import { buildFreeOperationPreflightOverlay } from './free-operation-preflight-overlay.js';
import {
  buildMoveRuntimeBindings,
  resolvePipelineDecisionBindingsForMove,
} from './move-runtime-bindings.js';
import {
  createSeatResolutionContext,
  resolvePlayerIndexForTurnFlowSeat,
} from './identity.js';
import { buildRuntimeTableIndex } from './runtime-table-index.js';
import { buildAdjacencyGraph } from './spatial.js';
import type { GameDef, GameState, Move, TurnFlowPendingFreeOperationGrant } from './types.js';

type GrantBindingContext = Pick<
  TurnFlowPendingFreeOperationGrant,
  'seat' | 'executeAsSeat' | 'executionContext' | 'tokenInterpretations' | 'moveZoneBindings' | 'moveZoneProbeBindings'
>;

const zoneCandidateSetFromMove = (def: GameDef, move: Move): Set<string> => {
  const zoneIdSet = new Set(def.zones.map((zone) => String(zone.id)));
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

  for (const value of Object.values(move.params)) {
    collectFromValue(value);
  }

  return candidates;
};

const zoneCandidateSetFromBindings = (
  def: GameDef,
  bindings: Readonly<Record<string, unknown>>,
  configuredBindings: readonly string[],
): Set<string> => {
  const zoneIdSet = new Set(def.zones.map((zone) => String(zone.id)));
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

  for (const bindingName of configuredBindings) {
    for (const [candidateBindingName, value] of Object.entries(bindings)) {
      if (candidateBindingName === bindingName || candidateBindingName.startsWith(`${bindingName}@`)) {
        collectFromValue(value);
      }
    }
  }

  return candidates;
};

export const resolvePendingFreeOperationGrantExecutionPlayer = (
  def: GameDef,
  state: GameState,
  grant: GrantBindingContext,
): GameState['activePlayer'] | undefined => {
  const executionSeat = grant.executeAsSeat ?? grant.seat;

  const seatResolution = createSeatResolutionContext(def, state.playerCount);
  const playerIndex = resolvePlayerIndexForTurnFlowSeat(executionSeat, seatResolution.index);
  return playerIndex === null ? undefined : asPlayerId(playerIndex);
};

export const resolveGrantAwareMoveRuntimeBindings = (
  def: GameDef,
  state: GameState,
  move: Move,
  grant?: GrantBindingContext,
): Readonly<Record<string, unknown>> => {
  const baseBindings = buildMoveRuntimeBindings(move);
  const action = findActionById(def, move.actionId);
  if (action === undefined) {
    return baseBindings;
  }
  const executionPlayerOverride = grant === undefined
    ? undefined
    : resolvePendingFreeOperationGrantExecutionPlayer(def, state, grant);
  const preflightOverlay = grant === undefined
    ? {}
    : buildFreeOperationPreflightOverlay(
      {
        executionPlayer: executionPlayerOverride ?? state.activePlayer,
        ...(grant.executionContext === undefined ? {} : { executionContext: grant.executionContext }),
        ...(grant.tokenInterpretations === undefined ? {} : { tokenInterpretations: grant.tokenInterpretations }),
      },
      move,
      'turnFlowEligibility',
    );

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
    ...preflightOverlay,
  });
  if (preflight.kind !== 'applicable' || preflight.pipelineDispatch.kind !== 'matched') {
    return baseBindings;
  }

  return buildMoveRuntimeBindings(
    move,
    resolvePipelineDecisionBindingsForMove(preflight.pipelineDispatch.profile, move.params),
  );
};

export const collectMoveZoneCandidates = (
  def: GameDef,
  move: Move,
): readonly string[] => [...zoneCandidateSetFromMove(def, move)];

export const collectGrantAwareMoveZoneCandidates = (
  def: GameDef,
  state: GameState,
  move: Move,
  grant: GrantBindingContext,
  options?: {
    readonly useProbeBindings?: boolean;
  },
): readonly string[] => {
  const configuredBindings = options?.useProbeBindings === true
    ? (grant.moveZoneProbeBindings ?? grant.moveZoneBindings)
    : grant.moveZoneBindings;
  if (configuredBindings === undefined || configuredBindings.length === 0) {
    return collectMoveZoneCandidates(def, move);
  }

  const bindings = resolveGrantAwareMoveRuntimeBindings(def, state, move, grant);
  return [...zoneCandidateSetFromBindings(def, bindings, configuredBindings)];
};
