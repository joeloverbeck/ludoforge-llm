import { buildAdjacencyGraph } from '../kernel/spatial.js';
import { buildRuntimeTableIndex } from '../kernel/runtime-table-index.js';
import { createEvalContext, createEvalRuntimeResources } from '../kernel/eval-context.js';
import { evalValue } from '../kernel/eval-value.js';
import { computeDerivedMetricValue } from '../kernel/derived-values.js';
import { derivePlayerObservation } from '../kernel/observation.js';
import { applyMove, probeMoveViability, type MoveViabilityProbeResult } from '../kernel/apply-move.js';
import { buildSeatResolutionIndex, resolvePlayerIndexForSeatValue, type SeatResolutionIndex } from '../kernel/identity.js';
import type { PlayerId } from '../kernel/branded.js';
import type { CompiledAgentPolicyRef, GameDef, GameState, Move, RngState } from '../kernel/types.js';
import type { GameDefRuntime } from '../kernel/gamedef-runtime.js';
import { getPolicySurfaceVisibility, isSurfaceVisibilityAccessible } from './policy-surface.js';

export interface PolicyPreviewCandidate {
  readonly move: Move;
  readonly stableMoveKey: string;
}

export interface PolicyPreviewDependencies {
  readonly probeMoveViability?: (
    def: GameDef,
    state: GameState,
    move: Move,
    runtime?: GameDefRuntime,
  ) => MoveViabilityProbeResult;
  readonly applyMove?: (
    def: GameDef,
    state: GameState,
    move: Move,
    options?: undefined,
    runtime?: GameDefRuntime,
  ) => { readonly state: GameState };
  readonly derivePlayerObservation?: typeof derivePlayerObservation;
  readonly computeDerivedMetricValue?: typeof computeDerivedMetricValue;
}

export interface CreatePolicyPreviewRuntimeInput {
  readonly def: GameDef;
  readonly state: GameState;
  readonly playerId: PlayerId;
  readonly seatId: string;
  readonly runtime?: GameDefRuntime;
  readonly dependencies?: PolicyPreviewDependencies;
}

export interface PolicyPreviewRuntime {
  resolveNumericRef(
    candidate: PolicyPreviewCandidate,
    ref: Extract<CompiledAgentPolicyRef, { readonly kind: 'surface' }>,
  ): number | undefined;
}

interface VictorySurface {
  readonly marginBySeat: ReadonlyMap<string, number>;
  readonly rankBySeat: ReadonlyMap<string, number>;
}

type PreviewOutcome =
  | {
      readonly kind: 'ready';
      readonly state: GameState;
      readonly requiresHiddenSampling: boolean;
      readonly metricCache: Map<string, number>;
      victorySurface: VictorySurface | null;
    }
  | {
      readonly kind: 'unknown';
      readonly reason: 'random' | 'hidden' | 'unresolved' | 'failed';
    };

const defaultDependencies = {
  probeMoveViability,
  applyMove,
  derivePlayerObservation,
  computeDerivedMetricValue,
} satisfies Required<PolicyPreviewDependencies>;

export function createPolicyPreviewRuntime(input: CreatePolicyPreviewRuntimeInput): PolicyPreviewRuntime {
  const deps = {
    ...defaultDependencies,
    ...input.dependencies,
  } satisfies Required<PolicyPreviewDependencies>;
  const cache = new Map<string, PreviewOutcome>();
  const seatResolutionIndex = buildSeatResolutionIndex(input.def, input.state.playerCount);

  return {
    resolveNumericRef(candidate, ref) {
      const preview = getPreviewOutcome(candidate);
      if (preview.kind !== 'ready') {
        return undefined;
      }
      const visibility = input.def.agents === undefined ? null : getPolicySurfaceVisibility(input.def.agents.surfaceVisibility, ref);
      if (visibility === null) {
        return undefined;
      }
      const resolvedSeatId = ref.seatToken === undefined
        ? undefined
        : resolveSeatToken(input.def, preview.state, ref.seatToken, input.seatId);
      if (!isSurfaceVisibilityAccessible(visibility.preview.visibility, input.seatId, resolvedSeatId)) {
        return undefined;
      }
      if (preview.requiresHiddenSampling && !visibility.preview.allowWhenHiddenSampling) {
        return undefined;
      }
      if (ref.family === 'derivedMetric') {
        const cachedValue = preview.metricCache.get(ref.id);
        if (cachedValue !== undefined) {
          return cachedValue;
        }
        const value = deps.computeDerivedMetricValue(input.def, preview.state, ref.id);
        preview.metricCache.set(ref.id, value);
        return value;
      }
      if (ref.family === 'globalVar') {
        const value = preview.state.globalVars[ref.id];
        return typeof value === 'number' ? value : undefined;
      }
      if (ref.family === 'perPlayerVar') {
        return resolveSeatVarRef(input.def, preview.state, ref, input.seatId, seatResolutionIndex);
      }
      if (ref.family === 'victoryCurrentMargin') {
        if (ref.seatToken === undefined) {
          return undefined;
        }
        return getVictorySurface(input.def, preview).marginBySeat.get(resolveSeatToken(input.def, preview.state, ref.seatToken, input.seatId));
      }
      if (ref.family === 'victoryCurrentRank') {
        if (ref.seatToken === undefined) {
          return undefined;
        }
        return getVictorySurface(input.def, preview).rankBySeat.get(resolveSeatToken(input.def, preview.state, ref.seatToken, input.seatId));
      }
      return undefined;
    },
  };

  function getPreviewOutcome(candidate: PolicyPreviewCandidate): PreviewOutcome {
    const cached = cache.get(candidate.stableMoveKey);
    if (cached !== undefined) {
      return cached;
    }

    const viability = deps.probeMoveViability(input.def, input.state, candidate.move, input.runtime);
    const outcome = classifyPreviewOutcome(candidate.move, viability);
    cache.set(candidate.stableMoveKey, outcome);
    return outcome;
  }

  function classifyPreviewOutcome(move: Move, viability: MoveViabilityProbeResult): PreviewOutcome {
    if (!viability.viable || !viability.complete) {
      return { kind: 'unknown', reason: 'unresolved' };
    }

    try {
      const previewState = deps.applyMove(input.def, input.state, move, undefined, input.runtime).state;
      if (!rngStatesEqual(previewState.rng, input.state.rng)) {
        return { kind: 'unknown', reason: 'random' };
      }
      const observation = deps.derivePlayerObservation(input.def, previewState, input.playerId);
      return {
        kind: 'ready',
        state: previewState,
        requiresHiddenSampling: observation.requiresHiddenSampling,
        metricCache: new Map<string, number>(),
        victorySurface: null,
      };
    } catch {
      return { kind: 'unknown', reason: 'failed' };
    }
  }
}

function resolveSeatVarRef(
  def: GameDef,
  state: GameState,
  ref: Extract<CompiledAgentPolicyRef, { readonly kind: 'surface' }>,
  seatId: string,
  seatResolutionIndex: SeatResolutionIndex,
): number | undefined {
  if (ref.family !== 'perPlayerVar' || ref.seatToken === undefined) {
    return undefined;
  }
  const playerIndex = resolvePlayerIndexForSeatValue(resolveSeatToken(def, state, ref.seatToken, seatId), seatResolutionIndex);
  if (playerIndex === null) {
    return undefined;
  }
  const value = state.perPlayerVars[playerIndex]?.[ref.id];
  return typeof value === 'number' ? value : undefined;
}

function resolveSeatToken(def: GameDef | undefined, state: GameState, seatToken: string, seatId: string): string {
  if (seatToken === 'self') {
    return seatId;
  }
  if (seatToken === 'active') {
    return def?.seats?.[state.activePlayer]?.id ?? seatId;
  }
  return seatToken;
}

function getVictorySurface(def: GameDef, preview: Extract<PreviewOutcome, { readonly kind: 'ready' }>): VictorySurface {
  if (preview.victorySurface !== null) {
    return preview.victorySurface;
  }

  const margins = def.terminal.margins ?? [];
  const adjacencyGraph = buildAdjacencyGraph(def.zones);
  const runtimeTableIndex = buildRuntimeTableIndex(def);
  const resources = createEvalRuntimeResources();
  const evalContext = createEvalContext({
    def,
    adjacencyGraph,
    state: preview.state,
    activePlayer: preview.state.activePlayer,
    actorPlayer: preview.state.activePlayer,
    bindings: {},
    runtimeTableIndex,
    resources,
  });

  const rows = margins.map((marginDef) => {
    const margin = evalValue(marginDef.value, evalContext);
    if (typeof margin !== 'number') {
      throw new Error(`Victory margin "${marginDef.seat}" did not evaluate to a number.`);
    }
    return { seat: marginDef.seat, margin };
  });

  const order = def.terminal.ranking?.order ?? 'desc';
  const tieBreakOrder = def.terminal.ranking?.tieBreakOrder ?? [];
  const tieBreakIndex = new Map(tieBreakOrder.map((seat, index): readonly [string, number] => [seat, index]));
  rows.sort((left, right) => {
    if (left.margin !== right.margin) {
      return order === 'desc' ? right.margin - left.margin : left.margin - right.margin;
    }
    const leftOrder = tieBreakIndex.get(left.seat) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = tieBreakIndex.get(right.seat) ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
    return left.seat.localeCompare(right.seat);
  });

  const marginBySeat = new Map<string, number>();
  const rankBySeat = new Map<string, number>();
  rows.forEach((row, index) => {
    marginBySeat.set(row.seat, row.margin);
    rankBySeat.set(row.seat, index + 1);
  });
  preview.victorySurface = { marginBySeat, rankBySeat };
  return preview.victorySurface;
}

function rngStatesEqual(left: RngState, right: RngState): boolean {
  return left.algorithm === right.algorithm
    && left.version === right.version
    && left.state.length === right.state.length
    && left.state.every((entry, index) => entry === right.state[index]);
}
