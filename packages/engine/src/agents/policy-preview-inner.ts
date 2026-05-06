import type { PlayerId } from '../kernel/branded.js';
import { buildSeatResolutionIndex } from '../kernel/identity.js';
import { computeDerivedMetricValue } from '../kernel/derived-values.js';
import { derivePlayerObservation } from '../kernel/observation.js';
import type { GameDefRuntime } from '../kernel/gamedef-runtime.js';
import {
  applyPublishedDecision,
} from '../kernel/microturn/apply.js';
import {
  publishMicroturn,
} from '../kernel/microturn/publish.js';
import type {
  ChooseOneContext,
  Decision,
  MicroturnState,
} from '../kernel/microturn/types.js';
import { createMutableState, freezeState } from '../kernel/state-draft.js';
import type {
  AgentPreviewAuthoredCompletionPolicy,
  AgentPreviewFallbackCompletionPolicy,
  AgentPolicyCatalog,
  CompiledAgentPolicyRef,
  CompiledAgentProfile,
  CompiledSurfaceRefBase,
  GameDef,
  GameState,
  PolicyPreviewOutcomeBreakdownTrace,
} from '../kernel/types.js';
import {
  buildPolicyVictorySurface,
  getPolicySurfaceVisibility,
  isSurfaceVisibilityAccessible,
  resolvePolicyRoleSelector,
  resolveSurfaceRefValue,
  type PolicyValue,
  type SurfaceResolutionContext,
} from './policy-surface.js';
import {
  pickInnerDecision,
  type PolicyPreviewTraceOutcome,
} from './policy-preview.js';

type PreviewOptionRef = Extract<CompiledAgentPolicyRef, { readonly kind: 'previewOptionRef' }>;
type ChooseOneMicroturn = MicroturnState & {
  readonly kind: 'chooseOne';
  readonly decisionContext: ChooseOneContext;
};

export interface RunChooseOneInnerPreviewInput {
  readonly def: GameDef;
  readonly state: GameState;
  readonly microturn: ChooseOneMicroturn;
  readonly playerId: PlayerId;
  readonly seatId: string;
  readonly catalog: AgentPolicyCatalog;
  readonly profile: CompiledAgentProfile;
  readonly refs: readonly PreviewOptionRef[];
  readonly runtime?: GameDefRuntime;
  readonly depthCap?: number;
  readonly completionPolicy?: AgentPreviewAuthoredCompletionPolicy;
  readonly fallbackCompletionPolicy?: AgentPreviewFallbackCompletionPolicy;
}

export interface ChooseOneInnerPreviewResult {
  readonly decision: Extract<Decision, { readonly kind: 'chooseOne' }>;
  readonly stableMoveKey: string;
  readonly resolvedRefs: ReadonlyMap<string, PolicyValue>;
  readonly driveDepth: number;
  readonly outcome: PolicyPreviewTraceOutcome;
}

export interface ChooseOneInnerPreviewRun {
  readonly options: readonly ChooseOneInnerPreviewResult[];
  readonly outcomeBreakdown: PolicyPreviewOutcomeBreakdownTrace;
}

const chooseOneStableMoveKey = (
  microturn: ChooseOneMicroturn,
  decision: Extract<Decision, { readonly kind: 'chooseOne' }>,
): string => `${microturn.kind}:${String(decision.decisionKey)}:${JSON.stringify(decision.value)}`;

const previewOptionRefKey = (ref: PreviewOptionRef): string => {
  switch (ref.refKind) {
    case 'victoryCurrentMarginSelf':
      return 'preview.option.victory.currentMargin.self';
    case 'victoryCurrentRankSelf':
      return 'preview.option.victory.currentRank.self';
    case 'deltaVictoryCurrentMarginSelf':
      return 'preview.option.delta.victory.currentMargin.self';
    case 'globalVar':
      return `preview.option.var.global.${ref.id ?? ''}`;
    case 'perPlayerVarSelf':
      return `preview.option.var.player.self.${ref.id ?? ''}`;
    case 'derivedMetric':
      return `preview.option.metric.${ref.id ?? ''}`;
    case 'outcome':
      return 'preview.option.outcome';
    case 'driveDepth':
      return 'preview.option.driveDepth';
  }
};

const surfaceRefForPreviewOptionRef = (ref: PreviewOptionRef): CompiledSurfaceRefBase | undefined => {
  switch (ref.refKind) {
    case 'victoryCurrentMarginSelf':
    case 'deltaVictoryCurrentMarginSelf':
      return {
        family: 'victoryCurrentMargin',
        id: 'currentMargin',
        selector: { kind: 'role', seatToken: 'self' },
      };
    case 'victoryCurrentRankSelf':
      return {
        family: 'victoryCurrentRank',
        id: 'currentRank',
        selector: { kind: 'role', seatToken: 'self' },
      };
    case 'globalVar':
      return { family: 'globalVar', id: ref.id ?? '' };
    case 'perPlayerVarSelf':
      return {
        family: 'perPlayerVar',
        id: ref.id ?? '',
        selector: { kind: 'player', player: 'self' },
      };
    case 'derivedMetric':
      return { family: 'derivedMetric', id: ref.id ?? '' };
    case 'outcome':
    case 'driveDepth':
      return undefined;
  }
};

const emptyOutcomeBreakdown = (): PolicyPreviewOutcomeBreakdownTrace => ({
  ready: 0,
  stochastic: 0,
  unknownRandom: 0,
  unknownHidden: 0,
  unknownUnresolved: 0,
  unknownDepthCap: 0,
  unknownNoPreviewDecision: 0,
  unknownGated: 0,
  unknownFailed: 0,
});

const incrementOutcome = (breakdown: PolicyPreviewOutcomeBreakdownTrace, outcome: PolicyPreviewTraceOutcome): void => {
  switch (outcome) {
    case 'ready':
      (breakdown as { ready: number }).ready += 1;
      return;
    case 'stochastic':
      (breakdown as { stochastic: number }).stochastic += 1;
      return;
    case 'random':
      (breakdown as { unknownRandom: number }).unknownRandom += 1;
      return;
    case 'hidden':
      (breakdown as { unknownHidden: number }).unknownHidden += 1;
      return;
    case 'unresolved':
      (breakdown as { unknownUnresolved: number }).unknownUnresolved += 1;
      return;
    case 'depthCap':
      (breakdown as { unknownDepthCap: number }).unknownDepthCap += 1;
      return;
    case 'noPreviewDecision':
      (breakdown as { unknownNoPreviewDecision: number }).unknownNoPreviewDecision += 1;
      return;
    case 'gated':
      (breakdown as { unknownGated: number }).unknownGated += 1;
      return;
    case 'failed':
      (breakdown as { unknownFailed: number }).unknownFailed += 1;
      return;
  }
};

interface SurfaceResolution {
  readonly kind: 'value' | 'hidden' | 'unavailable';
  readonly value?: PolicyValue;
}

interface DriveResult {
  readonly state: GameState;
  readonly depth: number;
  readonly outcome: PolicyPreviewTraceOutcome;
}

const targetVisibilityContext = (
  def: GameDef,
  state: GameState,
  ref: CompiledSurfaceRefBase,
  seatId: string,
  playerId: PlayerId,
  seatResolutionIndex: ReturnType<typeof buildSeatResolutionIndex>,
): {
  readonly resolvedSeatId?: string;
  readonly targetPlayerIndex?: number;
} => {
  if (ref.family === 'perPlayerVar' && ref.selector !== undefined) {
    if (ref.selector.kind === 'player') {
      return {
        targetPlayerIndex: ref.selector.player === 'self'
          ? Number(playerId)
          : Number(state.activePlayer),
      };
    }
    const resolvedSeatId = resolvePolicyRoleSelector(def, state, ref.selector, seatId);
    const targetPlayerIndex = resolvedSeatId === undefined
      ? undefined
      : seatResolutionIndex.playerIndexBySeatId.get(resolvedSeatId);
    return {
      ...(resolvedSeatId === undefined ? {} : { resolvedSeatId }),
      ...(targetPlayerIndex === undefined ? {} : { targetPlayerIndex }),
    };
  }
  if (ref.selector?.kind === 'role') {
    const resolvedSeatId = resolvePolicyRoleSelector(def, state, ref.selector, seatId);
    return {
      ...(resolvedSeatId === undefined ? {} : { resolvedSeatId }),
    };
  }
  return {};
};

const resolveVisibleSurface = (
  input: RunChooseOneInnerPreviewInput,
  state: GameState,
  ref: CompiledSurfaceRefBase,
  surfaceContext: SurfaceResolutionContext,
  seatResolutionIndex: ReturnType<typeof buildSeatResolutionIndex>,
): SurfaceResolution => {
  if (input.def.agents === undefined) {
    return { kind: 'unavailable' };
  }
  const visibility = getPolicySurfaceVisibility(input.def.agents.surfaceVisibility, {
    ...ref,
    kind: 'previewSurface',
  });
  if (visibility === null) {
    return { kind: 'unavailable' };
  }
  const { resolvedSeatId, targetPlayerIndex } = targetVisibilityContext(
    input.def,
    state,
    ref,
    input.seatId,
    input.playerId,
    seatResolutionIndex,
  );
  if (!isSurfaceVisibilityAccessible(
    visibility.preview.visibility,
    input.seatId,
    resolvedSeatId,
    Number(input.playerId),
    targetPlayerIndex,
  )) {
    return { kind: 'hidden' };
  }
  const hiddenSamplingZones = derivePlayerObservation(input.def, state, input.playerId).hiddenSamplingZones;
  if (hiddenSamplingZones.length > 0 && !visibility.preview.allowWhenHiddenSampling) {
    return { kind: 'hidden' };
  }
  const value = resolveSurfaceRefValue(state, ref, input.seatId, input.playerId, surfaceContext);
  return value === undefined ? { kind: 'unavailable' } : { kind: 'value', value };
};

const driveOption = (
  input: RunChooseOneInnerPreviewInput,
  decision: Extract<Decision, { readonly kind: 'chooseOne' }>,
): DriveResult => {
  const depthCap = input.depthCap ?? input.profile.preview.inner?.depthCap ?? input.profile.preview.completionDepthCap ?? 1;
  const completionPolicy = input.completionPolicy ?? input.profile.preview.completion ?? 'policyGuided';
  const fallbackCompletionPolicy = input.fallbackCompletionPolicy ?? input.profile.preview.fallbackCompletionPolicy ?? 'greedy';
  let state = applyPublishedDecision(
    input.def,
    freezeState(createMutableState(input.state)),
    input.microturn,
    decision,
    { advanceToDecisionPoint: true },
    input.runtime,
  ).state;
  let depth = 1;

  while (true) {
    const microturn = publishMicroturn(input.def, state, input.runtime);
    if (
      microturn.kind === 'actionSelection'
      || microturn.kind === 'outcomeGrantResolve'
      || microturn.kind === 'turnRetirement'
      || microturn.seatId !== input.microturn.seatId
      || microturn.turnId !== input.microturn.turnId
    ) {
      return { state, depth, outcome: 'ready' };
    }
    if (microturn.kind === 'stochasticResolve') {
      return { state, depth, outcome: 'stochastic' };
    }
    if (depth >= depthCap) {
      return { state, depth, outcome: 'depthCap' };
    }
    const { decision: nextDecision } = pickInnerDecision(
      state,
      input.def,
      microturn,
      completionPolicy,
      fallbackCompletionPolicy,
      {
        def: input.def,
        state: input.state,
        playerId: input.playerId,
        seatId: input.seatId,
        trustedMoveIndex: new Map(),
        previewMode: input.profile.preview.mode,
        completionPolicy,
        fallbackCompletionPolicy,
        completionDepthCap: depthCap,
        ...(input.runtime === undefined ? {} : { runtime: input.runtime }),
        policyGuidedDeps: {
          catalog: input.catalog,
          profile: input.profile,
        },
      },
    );
    if (nextDecision === undefined) {
      return { state, depth, outcome: 'noPreviewDecision' };
    }
    state = applyPublishedDecision(
      input.def,
      state,
      microturn,
      nextDecision,
      { advanceToDecisionPoint: true },
      input.runtime,
    ).state;
    depth += 1;
  }
};

const resolveRefs = (
  input: RunChooseOneInnerPreviewInput,
  drive: DriveResult,
  surfaceContext: SurfaceResolutionContext,
  seatResolutionIndex: ReturnType<typeof buildSeatResolutionIndex>,
): { readonly refs: ReadonlyMap<string, PolicyValue>; readonly hidden: boolean } => {
  const resolved = new Map<string, PolicyValue>();
  let hidden = false;
  for (const ref of input.refs) {
    const key = previewOptionRefKey(ref);
    if (ref.refKind === 'outcome') {
      resolved.set(key, drive.outcome);
      continue;
    }
    if (ref.refKind === 'driveDepth') {
      resolved.set(key, drive.depth);
      continue;
    }
    const surfaceRef = surfaceRefForPreviewOptionRef(ref);
    if (surfaceRef === undefined) {
      continue;
    }
    const post = resolveVisibleSurface(input, drive.state, surfaceRef, surfaceContext, seatResolutionIndex);
    if (post.kind === 'hidden') {
      hidden = true;
      continue;
    }
    if (post.kind !== 'value') {
      continue;
    }
    if (ref.refKind === 'deltaVictoryCurrentMarginSelf') {
      const pre = resolveVisibleSurface(input, input.state, surfaceRef, surfaceContext, seatResolutionIndex);
      if (pre.kind === 'hidden') {
        hidden = true;
        continue;
      }
      if (pre.kind === 'value' && typeof post.value === 'number' && typeof pre.value === 'number') {
        resolved.set(key, post.value - pre.value);
      }
      continue;
    }
    resolved.set(key, post.value);
  }
  return { refs: resolved, hidden };
};

export function runChooseOneInnerPreview(input: RunChooseOneInnerPreviewInput): ChooseOneInnerPreviewRun {
  const seatResolutionIndex = buildSeatResolutionIndex(input.def, input.state.playerCount);
  const surfaceContext: SurfaceResolutionContext = {
    def: input.def,
    seatResolutionIndex,
    resolveDerivedMetric(state, metricId) {
      return computeDerivedMetricValue(input.def, state, metricId);
    },
    resolveVictorySurface(state) {
      return buildPolicyVictorySurface(input.def, state, input.runtime);
    },
  };
  const options = input.microturn.legalActions
    .filter((decision: Decision): decision is Extract<Decision, { readonly kind: 'chooseOne' }> => decision.kind === 'chooseOne')
    .map((decision): ChooseOneInnerPreviewResult => {
      const drive = driveOption(input, decision);
      const resolved = resolveRefs(input, drive, surfaceContext, seatResolutionIndex);
      const outcome = resolved.hidden ? 'hidden' : drive.outcome;
      const withOutcome = new Map(resolved.refs);
      for (const ref of input.refs) {
        if (ref.refKind === 'outcome') {
          withOutcome.set(previewOptionRefKey(ref), outcome);
        }
      }
      return {
        decision,
        stableMoveKey: chooseOneStableMoveKey(input.microturn, decision),
        resolvedRefs: withOutcome,
        driveDepth: drive.depth,
        outcome,
      };
    });
  const outcomeBreakdown = emptyOutcomeBreakdown();
  for (const option of options) {
    incrementOutcome(outcomeBreakdown, option.outcome);
  }
  return { options, outcomeBreakdown };
}
