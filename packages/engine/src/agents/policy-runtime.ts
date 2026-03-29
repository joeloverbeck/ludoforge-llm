import { computeDerivedMetricValue } from '../kernel/derived-values.js';
import { buildSeatResolutionIndex, resolvePlayerIndexForSeatValue, type SeatResolutionIndex } from '../kernel/identity.js';
import { resolveTurnFlowActionClass } from '../kernel/turn-flow-action-class.js';
import type { PlayerId } from '../kernel/branded.js';
import type {
  AgentParameterValue,
  AgentPolicyCatalog,
  CompiledAgentPolicyRef,
  CompiledAgentPolicyCurrentSurfaceRef,
  CompiledAgentPolicyPreviewSurfaceRef,
  GameDef,
  GameState,
  Move,
  TrustedExecutableMove,
} from '../kernel/types.js';
import type { GameDefRuntime } from '../kernel/gamedef-runtime.js';
import {
  createPolicyPreviewRuntime,
  type PolicyPreviewTraceOutcome,
  type PolicyPreviewSurfaceResolution,
} from './policy-preview.js';
import {
  buildPolicyVictorySurface,
  getPolicySurfaceVisibility,
  isSurfaceVisibilityAccessible,
  resolvePolicyRoleSelector,
  type PolicyVictorySurface,
} from './policy-surface.js';

export type PolicyValue = AgentParameterValue | undefined;

export interface PolicyRuntimeCandidate {
  readonly move: Move;
  readonly stableMoveKey: string;
  readonly actionId: string;
}

export interface PolicyIntrinsicProvider {
  resolveSeatIntrinsic(intrinsic: Extract<CompiledAgentPolicyRef, { readonly kind: 'seatIntrinsic' }>['intrinsic']): PolicyValue;
  resolveTurnIntrinsic(intrinsic: Extract<CompiledAgentPolicyRef, { readonly kind: 'turnIntrinsic' }>['intrinsic']): PolicyValue;
}

export interface PolicyCandidateProvider {
  resolveCandidateIntrinsic(
    candidate: PolicyRuntimeCandidate,
    intrinsic: Extract<CompiledAgentPolicyRef, { readonly kind: 'candidateIntrinsic' }>['intrinsic'],
  ): PolicyValue;
  resolveCandidateParam(candidate: PolicyRuntimeCandidate, paramId: string): PolicyValue;
}

export interface PolicyCurrentSurfaceProvider {
  resolveSurface(ref: CompiledAgentPolicyCurrentSurfaceRef): PolicyValue;
}

export interface PolicyPreviewSurfaceProvider {
  resolveSurface(
    candidate: PolicyRuntimeCandidate,
    ref: CompiledAgentPolicyPreviewSurfaceRef,
  ): PolicyPreviewSurfaceResolution;
  getOutcome(candidate: PolicyRuntimeCandidate): PolicyPreviewTraceOutcome;
}

export interface PolicyRuntimeProviders {
  readonly intrinsics: PolicyIntrinsicProvider;
  readonly candidates: PolicyCandidateProvider;
  readonly currentSurface: PolicyCurrentSurfaceProvider;
  readonly previewSurface: PolicyPreviewSurfaceProvider;
}

export interface CreatePolicyRuntimeProvidersInput {
  readonly def: GameDef;
  readonly state: GameState;
  readonly playerId: PlayerId;
  readonly seatId: string;
  readonly trustedMoveIndex: ReadonlyMap<string, TrustedExecutableMove>;
  readonly catalog: AgentPolicyCatalog;
  readonly runtime?: GameDefRuntime;
  readonly runtimeError: (code: string, message: string, detail?: Readonly<Record<string, unknown>>) => Error;
}

export function createPolicyRuntimeProviders(input: CreatePolicyRuntimeProvidersInput): PolicyRuntimeProviders {
  const activeSeatId = input.def.seats?.[input.state.activePlayer]?.id ?? null;
  const seatResolutionIndex = buildSeatResolutionIndex(input.def, input.state.playerCount);
  const previewRuntime = createPolicyPreviewRuntime({
    def: input.def,
    state: input.state,
    playerId: input.playerId,
    seatId: input.seatId,
    trustedMoveIndex: input.trustedMoveIndex,
    ...(input.runtime === undefined ? {} : { runtime: input.runtime }),
  });
  const metricCache = new Map<string, number>();
  let victorySurface: PolicyVictorySurface | null = null;

  return {
    intrinsics: {
      resolveSeatIntrinsic(intrinsic) {
        return intrinsic === 'self' ? input.seatId : activeSeatId ?? undefined;
      },
      resolveTurnIntrinsic(intrinsic) {
        if (intrinsic === 'phaseId') {
          return String(input.state.currentPhase);
        }
        if (intrinsic === 'stepId') {
          return undefined;
        }
        return input.state.turnCount;
      },
    },
    candidates: {
      resolveCandidateIntrinsic(candidate, intrinsic) {
        if (intrinsic === 'actionId') {
          return candidate.actionId;
        }
        if (intrinsic === 'stableMoveKey') {
          return candidate.stableMoveKey;
        }
        if (intrinsic === 'paramCount') {
          return Object.keys(candidate.move.params).length;
        }
        return candidate.actionId === 'pass' || resolveTurnFlowActionClass(input.def, candidate.move) === 'pass';
      },
      resolveCandidateParam(candidate, paramId) {
        const candidateParamDef = input.catalog.candidateParamDefs[paramId];
        if (candidateParamDef === undefined) {
          return undefined;
        }
        let paramValue = candidate.move.params[paramId];
        if (paramValue === undefined) {
          const suffix = `::${paramId}`;
          const indexedPrefix = `::${paramId}[`;
          for (const key of Object.keys(candidate.move.params)) {
            if (key.endsWith(suffix) || key.includes(indexedPrefix)) {
              paramValue = candidate.move.params[key];
              break;
            }
          }
        }
        switch (candidateParamDef.type) {
          case 'number':
            return typeof paramValue === 'number' ? paramValue : undefined;
          case 'boolean':
            return typeof paramValue === 'boolean' ? paramValue : undefined;
          case 'id':
            return typeof paramValue === 'string' ? paramValue : undefined;
          case 'idList':
            return Array.isArray(paramValue) && paramValue.every((entry) => typeof entry === 'string')
              ? paramValue as AgentParameterValue
              : undefined;
        }
      },
    },
    currentSurface: {
      resolveSurface(ref) {
        const visibility = getPolicySurfaceVisibility(input.catalog.surfaceVisibility, ref);
        if (visibility === null) {
          throw input.runtimeError(
            'UNSUPPORTED_RUNTIME_REF',
            `Policy runtime ref "${ref.family}:${ref.id}" is unsupported by the non-preview evaluator runtime.`,
            { ref },
          );
        }
        const targetPlayerIndex = ref.family === 'perPlayerVar'
          ? resolvePerPlayerTargetIndex(input.def, input.state, ref, input.playerId, input.seatId, seatResolutionIndex)
          : undefined;
        const resolvedSeatId = ref.selector?.kind !== 'role'
          ? undefined
          : resolvePolicyRoleSelector(input.def, input.state, ref.selector, input.seatId);
        if (!isSurfaceVisibilityAccessible(
          visibility.current,
          input.seatId,
          resolvedSeatId,
          Number(input.playerId),
          targetPlayerIndex,
        )) {
          return undefined;
        }
        if (ref.family === 'derivedMetric') {
          if (metricCache.has(ref.id)) {
            return metricCache.get(ref.id);
          }
          const value = computeDerivedMetricValue(input.def, input.state, ref.id);
          metricCache.set(ref.id, value);
          return value;
        }
        if (ref.family === 'globalVar') {
          const value = input.state.globalVars[ref.id];
          return typeof value === 'number' ? value : undefined;
        }
        if (ref.family === 'perPlayerVar') {
          return resolveSeatVarRef(input.state, ref, targetPlayerIndex);
        }
        if ((input.def.terminal.margins ?? []).length === 0) {
          throw input.runtimeError(
            'UNSUPPORTED_RUNTIME_REF',
            'victory.currentMargin/currentRank refs require def.terminal.margins to be defined.',
          );
        }
        if (victorySurface === null) {
          try {
            victorySurface = buildPolicyVictorySurface(input.def, input.state, input.runtime);
          } catch (error) {
            throw input.runtimeError(
              'RUNTIME_EVALUATION_ERROR',
              error instanceof Error ? error.message : 'Unknown victory surface evaluation failure.',
            );
          }
        }
        if (ref.selector?.kind !== 'role') {
          return undefined;
        }
        const seatId = resolvePolicyRoleSelector(input.def, input.state, ref.selector, input.seatId);
        return ref.family === 'victoryCurrentMargin'
          ? victorySurface.marginBySeat.get(seatId)
          : victorySurface.rankBySeat.get(seatId);
      },
    },
    previewSurface: {
      resolveSurface(candidate, ref) {
        return previewRuntime.resolveSurface(candidate, ref);
      },
      getOutcome(candidate) {
        return previewRuntime.getOutcome(candidate);
      },
    },
  };
}

function resolvePerPlayerTargetIndex(
  def: GameDef,
  state: GameState,
  ref: CompiledAgentPolicyCurrentSurfaceRef | CompiledAgentPolicyPreviewSurfaceRef,
  actingPlayerId: PlayerId,
  seatId: string,
  seatResolutionIndex: SeatResolutionIndex,
): number | undefined {
  if (ref.family !== 'perPlayerVar' || ref.selector === undefined) {
    return undefined;
  }
  return ref.selector.kind === 'player'
    ? (ref.selector.player === 'self' ? Number(actingPlayerId) : Number(state.activePlayer))
    : resolvePlayerIndexForSeatValue(
      resolvePolicyRoleSelector(def, state, ref.selector, seatId),
      seatResolutionIndex,
    ) ?? undefined;
}

function resolveSeatVarRef(
  state: GameState,
  ref: CompiledAgentPolicyCurrentSurfaceRef | CompiledAgentPolicyPreviewSurfaceRef,
  playerIndex: number | undefined,
): number | undefined {
  if (ref.family !== 'perPlayerVar' || playerIndex === undefined) {
    return undefined;
  }
  const value = state.perPlayerVars[playerIndex]?.[ref.id];
  return typeof value === 'number' ? value : undefined;
}
