import type { PlayerId } from '../kernel/branded.js';
import { buildSeatResolutionIndex } from '../kernel/identity.js';
import { computeDerivedMetricValue } from '../kernel/derived-values.js';
import { derivePlayerObservation } from '../kernel/observation.js';
import type { GameDefRuntime } from '../kernel/gamedef-runtime.js';
import {
  canonicalizePreviewDriveState,
  applyPublishedDecisionFromPreviewStateNoFinalHash,
} from '../kernel/microturn/drive.js';
import {
  publishMicroturnFromPreviewStateNoHash,
  publishMicroturnPreferredChooseOne,
} from '../kernel/microturn/publish.js';
import { perfHotPathEnd, perfHotPathStart } from '../kernel/perf-profiler.js';
import { createResolveRefCache } from '../kernel/resolve-ref.js';
import type { ChooseOneContext, Decision, MicroturnState } from '../kernel/microturn/types.js';
import { createDraftTokenStateIndex } from '../kernel/token-state-index.js';
import { selectBestMicroturnChooseOneValue } from './microturn-option-evaluator.js';
import type {
  AgentPreviewAuthoredCompletionPolicy,
  AgentPreviewFallbackCompletionPolicy,
  AgentPolicyCatalog,
  ChoicePendingChooseOneRequest,
  CompiledAgentPolicyRef,
  CompiledAgentProfile,
  CompiledSurfaceRefBase,
  GameDef,
  GameState,
  MoveParamScalar,
  PolicyPreviewOutcomeBreakdownTrace,
  PolicyPreviewDriveTrace,
  SyntheticDecisionTraceEntry,
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
  type PolicyPreviewUnavailabilityReason,
} from './policy-preview.js';

type PreviewOptionRef = Extract<CompiledAgentPolicyRef, { readonly kind: 'previewOptionRef' }>;
export type PreviewOptionRefStatus =
  | { readonly kind: 'ready'; readonly value: PolicyValue }
  | { readonly kind: 'unavailable'; readonly reason: PolicyPreviewUnavailabilityReason };

type ChooseOneMicroturn = MicroturnState & {
  readonly kind: 'chooseOne';
  readonly decisionContext: ChooseOneContext;
};

export interface InnerPreviewBaseInput {
  readonly def: GameDef;
  readonly state: GameState;
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

export interface RunChooseOneInnerPreviewInput extends InnerPreviewBaseInput {
  readonly microturn: ChooseOneMicroturn;
}

export interface ChooseOneInnerPreviewResult {
  readonly decision: Extract<Decision, { readonly kind: 'chooseOne' }>;
  readonly stableMoveKey: string;
  readonly state: GameState;
  readonly resolvedRefs: ReadonlyMap<string, PreviewOptionRefStatus>;
  readonly driveDepth: number;
  readonly outcome: PolicyPreviewTraceOutcome;
  readonly previewDrive: PolicyPreviewDriveTrace;
  readonly completionPolicyFallbackCount: number;
}

export interface ChooseOneInnerPreviewRun {
  readonly options: readonly ChooseOneInnerPreviewResult[];
  readonly outcomeBreakdown: PolicyPreviewOutcomeBreakdownTrace;
}

const chooseOneStableMoveKey = (
  microturn: ChooseOneMicroturn,
  decision: Extract<Decision, { readonly kind: 'chooseOne' }>,
): string => `${microturn.kind}:${String(decision.decisionKey)}:${JSON.stringify(decision.value)}`;

export const previewOptionRefKey = (ref: PreviewOptionRef): string => {
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

export const emptyOutcomeBreakdown = (): PolicyPreviewOutcomeBreakdownTrace => ({
  ready: 0,
  stochastic: 0,
  unknownRandom: 0,
  unknownHidden: 0,
  unknownUnresolved: 0,
  unknownDepthCap: 0,
  unknownPostGrantCap: 0,
  unknownFreeOperationCap: 0,
  unknownGrantFlowPartial: 0,
  unknownNoPreviewDecision: 0,
  unknownGated: 0,
  unknownFailed: 0,
});

export const incrementOutcome = (
  breakdown: PolicyPreviewOutcomeBreakdownTrace,
  outcome: PolicyPreviewTraceOutcome,
): void => {
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
    case 'postGrantCap':
      (breakdown as { unknownPostGrantCap: number }).unknownPostGrantCap += 1;
      return;
    case 'freeOperationCap':
      (breakdown as { unknownFreeOperationCap: number }).unknownFreeOperationCap += 1;
      return;
    case 'grantFlowPartial':
      (breakdown as { unknownGrantFlowPartial: number }).unknownGrantFlowPartial += 1;
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

export interface DriveResult {
  readonly state: GameState;
  readonly depth: number;
  readonly outcome: PolicyPreviewTraceOutcome;
  readonly completionPolicy: PolicyPreviewDriveTrace['completionPolicy'];
  readonly syntheticDecisions: readonly SyntheticDecisionTraceEntry[];
  readonly completionPolicyFallbackCount: number;
}

const decisionTraceKey = (decision: Decision): string => {
  switch (decision.kind) {
    case 'chooseOne':
    case 'chooseNStep':
    case 'stochasticResolve':
      return String(decision.decisionKey);
    case 'actionSelection':
      return String(decision.actionId);
    case 'outcomeGrantResolve':
      return String(decision.grantId);
    case 'turnRetirement':
      return String(decision.retiringTurnId);
  }
};

const selectedOptionStableKey = (decision: Decision): string => {
  switch (decision.kind) {
    case 'actionSelection':
      return decision.move === undefined ? String(decision.actionId) : JSON.stringify(decision.move);
    case 'chooseOne':
      return `${decision.kind}:${String(decision.decisionKey)}:${JSON.stringify(decision.value)}`;
    case 'chooseNStep':
      return `${decision.kind}:${String(decision.decisionKey)}:${decision.command}:${JSON.stringify(decision.value ?? null)}`;
    case 'stochasticResolve':
      return `${decision.kind}:${String(decision.decisionKey)}:${JSON.stringify(decision.value)}`;
    case 'outcomeGrantResolve':
      return `${decision.kind}:${String(decision.grantId)}`;
    case 'turnRetirement':
      return `${decision.kind}:${String(decision.retiringTurnId)}`;
  }
};

const createChooseOneRequest = (
  microturn: ChooseOneMicroturn,
): ChoicePendingChooseOneRequest => ({
  kind: 'pending',
  complete: false,
  decisionKey: microturn.decisionContext.decisionKey,
  name: String(microturn.decisionContext.decisionKey),
  options: microturn.decisionContext.options,
  targetKinds: [],
  type: 'chooseOne',
});

const preferredPolicyGuidedChooseOneValue = (
  input: RunChooseOneInnerPreviewInput,
  state: GameState,
  microturn: ChooseOneMicroturn,
): MoveParamScalar | undefined => {
  const selected = selectBestMicroturnChooseOneValue({
    state,
    def: input.def,
    catalog: input.catalog,
    playerId: input.playerId,
    seatId: input.seatId,
    profile: input.profile,
    ...(input.runtime === undefined ? {} : { runtime: input.runtime }),
  }, createChooseOneRequest(microturn), { requirePositiveScore: false })?.value;
  return typeof selected === 'string' || typeof selected === 'number' || typeof selected === 'boolean'
    ? selected
    : undefined;
};

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
  input: InnerPreviewBaseInput,
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
  const syntheticDecisions: SyntheticDecisionTraceEntry[] = [];
  let completionPolicyFallbackCount = 0;
  const finish = (
    state: GameState,
    depth: number,
    outcome: PolicyPreviewTraceOutcome,
  ): DriveResult => ({
    state,
    depth,
    outcome,
    completionPolicy,
    syntheticDecisions: [...syntheticDecisions],
    completionPolicyFallbackCount,
  });
  const refCache = createResolveRefCache();
  const initialDecisionStartedAt = perfHotPathStart();
  let state = applyPublishedDecisionFromPreviewStateNoFinalHash(
    input.def,
    input.state,
    input.microturn,
    decision,
    { advanceToDecisionPoint: true },
    input.runtime,
    refCache,
  ).state;
  perfHotPathEnd('policyInnerPreviewDriveOption:initialDecisionApply', initialDecisionStartedAt);
  let draftTokenStateIndex: ReturnType<typeof createDraftTokenStateIndex> | undefined;
  let depth = 1;
  let stateIsCanonical = false;

  const syncDraftTokenStateIndex = (prevState: GameState, nextState: GameState): void => {
    const syncStartedAt = perfHotPathStart();
    if (draftTokenStateIndex === undefined) {
      draftTokenStateIndex = createDraftTokenStateIndex(prevState, input.runtime?.tokenStateIndexCache);
      draftTokenStateIndex.attachPreviewState(prevState);
    }
    draftTokenStateIndex.applyZoneDelta(prevState.zones, nextState.zones);
    draftTokenStateIndex.attachPreviewState(nextState);
    perfHotPathEnd('policyInnerPreviewDriveOption:syncDraftTokenStateIndex', syncStartedAt);
  };

  const canonicalizeForExit = (): GameState => {
    const canonicalizeStartedAt = perfHotPathStart();
    if (stateIsCanonical) {
      draftTokenStateIndex?.attachAsCanonical(state);
      perfHotPathEnd('policyInnerPreviewDriveOption:canonicalizeForExit', canonicalizeStartedAt);
      return state;
    }
    const canonical = canonicalizePreviewDriveState(input.def, state, input.runtime);
    draftTokenStateIndex?.applyZoneDelta(state.zones, canonical.zones);
    draftTokenStateIndex?.attachAsCanonical(canonical);
    state = canonical;
    stateIsCanonical = true;
    perfHotPathEnd('policyInnerPreviewDriveOption:canonicalizeForExit', canonicalizeStartedAt);
    return canonical;
  };

  while (true) {
    refCache.clear();
    const top = state.decisionStack?.at(-1);
    if (top === undefined) {
      return finish(canonicalizeForExit(), depth, 'ready');
    }
    const ctxKind = top.context.kind;
    const topSeatId = top.context.seatId;
    if (
      ctxKind === 'actionSelection'
      || ctxKind === 'outcomeGrantResolve'
      || ctxKind === 'turnRetirement'
      || topSeatId !== input.microturn.seatId
      || top.turnId !== input.microturn.turnId
    ) {
      return finish(canonicalizeForExit(), depth, 'ready');
    }
    if (ctxKind === 'stochasticResolve') {
      return finish(canonicalizeForExit(), depth, 'stochastic');
    }
    if (depth >= depthCap) {
      return finish(canonicalizeForExit(), depth, 'depthCap');
    }
    if (draftTokenStateIndex === undefined) {
      syncDraftTokenStateIndex(input.state, state);
    }
    const publishStartedAt = perfHotPathStart();
    const topChooseOne = ctxKind === 'chooseOne'
      ? {
          kind: 'chooseOne' as const,
          seatId: topSeatId,
          decisionContext: top.context,
          legalActions: [],
          projectedState: { state },
          turnId: top.turnId,
          frameId: top.frameId,
          compoundTurnTrace: [],
        } satisfies ChooseOneMicroturn
      : undefined;
    const preferredValue = completionPolicy === 'policyGuided' && topChooseOne !== undefined
      ? preferredPolicyGuidedChooseOneValue(input, state, topChooseOne)
      : undefined;
    const preferredPublication = preferredValue === undefined
      ? null
      : publishMicroturnPreferredChooseOne(input.def, state, [preferredValue], input.runtime);
    const microturn = preferredPublication?.microturn
      ?? publishMicroturnFromPreviewStateNoHash(input.def, state, input.runtime);
    perfHotPathEnd('policyInnerPreviewDriveOption:publishMicroturn', publishStartedAt);
    const pickStartedAt = perfHotPathStart();
    const nextDecisionResult = preferredPublication === null
      ? pickInnerDecision(
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
        )
      : { decision: preferredPublication.decision, usedFallback: false };
    perfHotPathEnd('policyInnerPreviewDriveOption:pickInnerDecision', pickStartedAt);
    const nextDecision = nextDecisionResult.decision;
    if (nextDecisionResult.usedFallback) {
      completionPolicyFallbackCount += 1;
    }
    if (nextDecision === undefined) {
      return finish(canonicalizeForExit(), depth, 'noPreviewDecision');
    }
    if (microturn.kind === 'chooseOne' || microturn.kind === 'chooseNStep') {
      syntheticDecisions.push({
        depth: syntheticDecisions.length + 1,
        microturnKind: microturn.kind,
        decisionKey: decisionTraceKey(nextDecision),
        selectedOptionStableKey: selectedOptionStableKey(nextDecision),
        selectionReason: nextDecisionResult.usedFallback
          ? 'fallback'
          : completionPolicy === 'policyGuided'
            ? 'microturnPolicy'
            : 'greedyAlphabetical',
        score: 0,
        scoreContributions: [],
        completionPolicy: nextDecisionResult.usedFallback ? 'greedy' : completionPolicy,
      });
    }
    const prevState = state;
    const continuationApplyStartedAt = perfHotPathStart();
    state = applyPublishedDecisionFromPreviewStateNoFinalHash(
      input.def,
      prevState,
      microturn,
      nextDecision,
      { advanceToDecisionPoint: true },
      input.runtime,
      refCache,
    ).state;
    perfHotPathEnd('policyInnerPreviewDriveOption:continuationDecisionApply', continuationApplyStartedAt);
    syncDraftTokenStateIndex(prevState, state);
    stateIsCanonical = false;
    depth += 1;
  }
};

export const resolveRefs = (
  input: InnerPreviewBaseInput,
  drive: DriveResult,
  surfaceContext: SurfaceResolutionContext,
  seatResolutionIndex: ReturnType<typeof buildSeatResolutionIndex>,
): { readonly refs: ReadonlyMap<string, PreviewOptionRefStatus>; readonly hidden: boolean } => {
  const resolved = new Map<string, PreviewOptionRefStatus>();
  let hidden = false;
  for (const ref of input.refs) {
    const key = previewOptionRefKey(ref);
    if (ref.refKind === 'outcome') {
      resolved.set(key, { kind: 'ready', value: drive.outcome });
      continue;
    }
    if (ref.refKind === 'driveDepth') {
      resolved.set(key, { kind: 'ready', value: drive.depth });
      continue;
    }
    const surfaceRef = surfaceRefForPreviewOptionRef(ref);
    if (surfaceRef === undefined) {
      resolved.set(key, { kind: 'unavailable', reason: 'unresolved' });
      continue;
    }
    const post = resolveVisibleSurface(input, drive.state, surfaceRef, surfaceContext, seatResolutionIndex);
    if (post.kind === 'hidden') {
      hidden = true;
      resolved.set(key, { kind: 'unavailable', reason: 'hidden' });
      continue;
    }
    if (post.kind !== 'value') {
      resolved.set(key, { kind: 'unavailable', reason: drive.outcome === 'depthCap' ? 'depthCap' : 'unresolved' });
      continue;
    }
    if (ref.refKind === 'deltaVictoryCurrentMarginSelf') {
      if (drive.outcome === 'depthCap') {
        resolved.set(key, { kind: 'unavailable', reason: 'depthCap' });
        continue;
      }
      const pre = resolveVisibleSurface(input, input.state, surfaceRef, surfaceContext, seatResolutionIndex);
      if (pre.kind === 'hidden') {
        hidden = true;
        resolved.set(key, { kind: 'unavailable', reason: 'hidden' });
        continue;
      }
      if (pre.kind === 'value' && typeof post.value === 'number' && typeof pre.value === 'number') {
        resolved.set(key, { kind: 'ready', value: post.value - pre.value });
      } else {
        resolved.set(key, { kind: 'unavailable', reason: 'unresolved' });
      }
      continue;
    }
    resolved.set(key, { kind: 'ready', value: post.value });
  }
  return { refs: resolved, hidden };
};

export function runChooseOneInnerPreview(input: RunChooseOneInnerPreviewInput): ChooseOneInnerPreviewRun {
  const surfaceSetupStartedAt = perfHotPathStart();
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
  perfHotPathEnd('policyInnerPreviewSubroutine:surfaceSetup', surfaceSetupStartedAt);
  const options = input.microturn.legalActions
    .filter((decision: Decision): decision is Extract<Decision, { readonly kind: 'chooseOne' }> => decision.kind === 'chooseOne')
    .map((decision): ChooseOneInnerPreviewResult => {
      const driveOptionStartedAt = perfHotPathStart();
      const drive = driveOption(input, decision);
      perfHotPathEnd('policyInnerPreviewSubroutine:driveOption', driveOptionStartedAt);
      const resolveRefsStartedAt = perfHotPathStart();
      const resolved = resolveRefs(input, drive, surfaceContext, seatResolutionIndex);
      perfHotPathEnd('policyInnerPreviewSubroutine:resolveRefs', resolveRefsStartedAt);
      const outcome = resolved.hidden ? 'hidden' : drive.outcome;
      const withOutcome = new Map(resolved.refs);
      for (const ref of input.refs) {
        if (ref.refKind === 'outcome') {
          withOutcome.set(previewOptionRefKey(ref), { kind: 'ready', value: outcome });
        }
      }
      return {
        decision,
        stableMoveKey: chooseOneStableMoveKey(input.microturn, decision),
        state: drive.state,
        resolvedRefs: withOutcome,
        driveDepth: drive.depth,
        outcome,
        previewDrive: {
          depth: drive.depth,
          completionPolicy: drive.completionPolicy,
          syntheticDecisions: drive.syntheticDecisions,
        },
        completionPolicyFallbackCount: drive.completionPolicyFallbackCount,
      };
    });
  const outcomeBreakdown = emptyOutcomeBreakdown();
  for (const option of options) {
    incrementOutcome(outcomeBreakdown, option.outcome);
  }
  return { options, outcomeBreakdown };
}
