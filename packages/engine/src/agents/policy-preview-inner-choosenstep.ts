import { buildSeatResolutionIndex } from '../kernel/identity.js';
import { computeDerivedMetricValue } from '../kernel/derived-values.js';
import {
  applyPublishedDecision,
} from '../kernel/microturn/apply.js';
import {
  publishMicroturn,
} from '../kernel/microturn/publish.js';
import type {
  Decision,
  MicroturnState,
} from '../kernel/microturn/types.js';
import { createMutableState, freezeState } from '../kernel/state-draft.js';
import { getTokenStateIndex } from '../kernel/token-state-index.js';
import type {
  ChoicePendingChooseNRequest,
  GameState,
  MoveParamScalar,
  PolicyPreviewOutcomeBreakdownTrace,
} from '../kernel/types.js';
import {
  buildPolicyVictorySurface,
  type SurfaceResolutionContext,
} from './policy-surface.js';
import {
  pickInnerDecision,
  PolicyPreviewTraceOutcome,
} from './policy-preview.js';
import {
  emptyOutcomeBreakdown,
  incrementOutcome,
  previewOptionRefKey,
  resolveRefs,
  type DriveResult,
  type InnerPreviewBaseInput,
  type PreviewOptionRefStatus,
} from './policy-preview-inner.js';
import {
  microturnConsiderationIdsForProfile,
} from './microturn-option-evaluator.js';
import {
  scoreMicroturnOptionWithContributions,
  type CompletionScoreContribution,
} from './microturn-option-eval.js';
import type {
  PolicyPreviewDriveTrace,
  SyntheticDecisionTraceEntry,
} from '../kernel/types.js';

export type ChooseNStepDecision = Extract<Decision, { readonly kind: 'chooseNStep' }>;
export type ChooseNStepMicroturn = MicroturnState & {
  readonly kind: 'chooseNStep';
  readonly decisionContext: Extract<MicroturnState['decisionContext'], { readonly kind: 'chooseNStep' }>;
};

export interface RunChooseNStepBeamPreviewInput extends InnerPreviewBaseInput {
  readonly microturn: ChooseNStepMicroturn;
  readonly beamWidth?: number;
}

export interface ChooseNStepBeamPrunedTraceEntry {
  readonly step: number;
  readonly stableMoveKey: string;
  readonly partialSelectionStableKeys: readonly string[];
  readonly score: number;
  readonly scoreContributions: readonly CompletionScoreContribution[];
  readonly selectionReason: 'beamPruned';
}

export interface ChooseNStepBeamResult {
  readonly partialSelection: readonly ChooseNStepDecision[];
  readonly partialSelectionStableKeys: readonly string[];
  readonly state: GameState;
  readonly score: number;
  readonly resolvedRefs: ReadonlyMap<string, PreviewOptionRefStatus>;
  readonly outcome: PolicyPreviewTraceOutcome;
}

export interface ChooseNStepBeamPreviewRun {
  readonly beam: readonly ChooseNStepBeamResult[];
  readonly best: ChooseNStepBeamResult | undefined;
  readonly pruned: readonly ChooseNStepBeamPrunedTraceEntry[];
  readonly evaluatedCandidateCount: number;
  readonly outcomeBreakdown: PolicyPreviewOutcomeBreakdownTrace;
}

export interface RunChooseNStepInnerPreviewInput extends InnerPreviewBaseInput {
  readonly microturn: ChooseNStepMicroturn;
  readonly beamWidth?: number;
}

export interface ChooseNStepInnerPreviewResult {
  readonly decision: ChooseNStepDecision;
  readonly stableMoveKey: string;
  readonly state: GameState;
  readonly resolvedRefs: ReadonlyMap<string, PreviewOptionRefStatus>;
  readonly driveDepth: number;
  readonly outcome: PolicyPreviewTraceOutcome;
  readonly previewDrive: PolicyPreviewDriveTrace;
  readonly completionPolicyFallbackCount: number;
  readonly continuationBeam: ChooseNStepBeamPreviewRun | null;
}

export interface ChooseNStepInnerPreviewRun {
  readonly options: readonly ChooseNStepInnerPreviewResult[];
  readonly outcomeBreakdown: PolicyPreviewOutcomeBreakdownTrace;
  readonly evaluatedCandidateCount: number;
}

const chooseNStepStableMoveKey = (
  decision: ChooseNStepDecision,
): string => `${decision.kind}:${String(decision.decisionKey)}:${decision.command}:${JSON.stringify(decision.value ?? null)}`;

const createChooseNRequest = (microturn: ChooseNStepMicroturn): ChoicePendingChooseNRequest => ({
  kind: 'pending',
  complete: false,
  decisionKey: microturn.decisionContext.decisionKey,
  name: String(microturn.decisionContext.decisionKey),
  options: microturn.decisionContext.options,
  targetKinds: [],
  type: 'chooseN',
  min: microturn.decisionContext.cardinality.min,
  max: microturn.decisionContext.cardinality.max,
  selected: microturn.decisionContext.selectedSoFar,
  canConfirm: microturn.decisionContext.stepCommands.includes('confirm'),
});

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
      return chooseNStepStableMoveKey(decision);
    case 'stochasticResolve':
      return `${decision.kind}:${String(decision.decisionKey)}:${JSON.stringify(decision.value)}`;
    case 'outcomeGrantResolve':
      return `${decision.kind}:${String(decision.grantId)}`;
    case 'turnRetirement':
      return `${decision.kind}:${String(decision.retiringTurnId)}`;
  }
};

export const syntheticDecisionTraceEntry = (
  decision: Decision,
  depth: number,
  completionPolicy: PolicyPreviewDriveTrace['completionPolicy'],
): SyntheticDecisionTraceEntry | undefined => {
  if (decision.kind !== 'chooseOne' && decision.kind !== 'chooseNStep') {
    return undefined;
  }
  return {
    depth,
    microturnKind: decision.kind,
    decisionKey: decisionTraceKey(decision),
    selectedOptionStableKey: selectedOptionStableKey(decision),
    selectionReason: completionPolicy === 'policyGuided' ? 'microturnPolicy' : 'greedyAlphabetical',
    score: 0,
    scoreContributions: [],
    completionPolicy,
  };
};

const isSameChooseNStepMicroturn = (
  microturn: ReturnType<typeof publishMicroturn>,
  root: ChooseNStepMicroturn,
): microturn is ChooseNStepMicroturn =>
  microturn.kind === 'chooseNStep'
  && microturn.seatId === root.seatId
  && microturn.turnId === root.turnId;

interface BeamPartial {
  readonly partialSelection: readonly ChooseNStepDecision[];
  readonly partialSelectionStableKeys: readonly string[];
  readonly state: GameState;
  readonly score: number;
}

interface BeamCandidate extends BeamPartial {
  readonly scoreContributions: readonly CompletionScoreContribution[];
}

const legalChooseNAddDecisions = (microturn: ChooseNStepMicroturn): readonly ChooseNStepDecision[] =>
  microturn.legalActions.filter(
    (decision): decision is ChooseNStepDecision =>
      decision.kind === 'chooseNStep'
      && decision.command === 'add'
      && decision.value !== undefined,
  );

const outcomeForBeamState = (
  input: RunChooseNStepBeamPreviewInput,
  state: GameState,
): PolicyPreviewTraceOutcome => {
  const microturn = publishMicroturn(input.def, state, input.runtime);
  if (
    microturn.kind === 'actionSelection'
    || microturn.kind === 'outcomeGrantResolve'
    || microturn.kind === 'turnRetirement'
    || microturn.seatId !== input.microturn.seatId
    || microturn.turnId !== input.microturn.turnId
  ) {
    return 'ready';
  }
  if (microturn.kind === 'stochasticResolve') {
    return 'stochastic';
  }
  return 'depthCap';
};

const scoreChooseNStepCandidate = (
  input: RunChooseNStepBeamPreviewInput,
  state: GameState,
  microturn: ChooseNStepMicroturn,
  decision: ChooseNStepDecision,
): { readonly score: number; readonly scoreContributions: readonly CompletionScoreContribution[] } => {
  const considerationIds = microturnConsiderationIdsForProfile(input.catalog, input.profile);
  const optionIndex = microturn.decisionContext.options.findIndex((option) => Object.is(option.value, decision.value));
  return scoreMicroturnOptionWithContributions(
    state,
    input.def,
    input.catalog,
    input.playerId,
    input.seatId,
    input.profile.params,
    createChooseNRequest(microturn),
    decision.value as MoveParamScalar,
    optionIndex,
    considerationIds,
    input.runtime,
  );
};

const applyChooseNStepPreviewDecision = (
  input: InnerPreviewBaseInput,
  sourceState: GameState,
  stateForApply: GameState,
  microturn: ChooseNStepMicroturn,
  decision: ChooseNStepDecision,
): GameState | null => {
  getTokenStateIndex(sourceState, input.runtime?.tokenStateIndexCache);
  try {
    return applyPublishedDecision(
      input.def,
      stateForApply,
      microturn,
      decision,
      { advanceToDecisionPoint: true },
      input.runtime,
    ).state;
  } catch {
    return null;
  }
};

const resolveBeamResult = (
  input: RunChooseNStepBeamPreviewInput,
  partial: BeamPartial,
  surfaceContext: SurfaceResolutionContext,
  seatResolutionIndex: ReturnType<typeof buildSeatResolutionIndex>,
): ChooseNStepBeamResult => {
  const drive: DriveResult = {
    state: partial.state,
    depth: partial.partialSelection.length,
    outcome: outcomeForBeamState(input, partial.state),
    completionPolicy: input.completionPolicy ?? input.profile.preview.completion ?? 'policyGuided',
    syntheticDecisions: [],
    completionPolicyFallbackCount: 0,
  };
  const resolved = resolveRefs(input, drive, surfaceContext, seatResolutionIndex);
  const outcome = resolved.hidden ? 'hidden' : drive.outcome;
  const withOutcome = new Map(resolved.refs);
  for (const ref of input.refs) {
    if (ref.refKind === 'outcome') {
      withOutcome.set(previewOptionRefKey(ref), { kind: 'ready', value: outcome });
    }
  }
  return {
    partialSelection: partial.partialSelection,
    partialSelectionStableKeys: partial.partialSelectionStableKeys,
    state: partial.state,
    score: partial.score,
    resolvedRefs: withOutcome,
    outcome,
  };
};

export function runChooseNStepBeamPreview(input: RunChooseNStepBeamPreviewInput): ChooseNStepBeamPreviewRun {
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
  const beamWidth = input.beamWidth ?? input.profile.preview.inner?.chooseNBeamWidth ?? 1;
  const depthCap = input.depthCap ?? input.profile.preview.inner?.depthCap ?? input.profile.preview.completionDepthCap ?? 1;
  let beam: readonly BeamPartial[] = [{
    partialSelection: [],
    partialSelectionStableKeys: [],
    state: input.state,
    score: 0,
  }];
  const pruned: ChooseNStepBeamPrunedTraceEntry[] = [];
  let evaluatedCandidateCount = 0;

  for (let step = 1; step <= depthCap; step += 1) {
    const candidates: BeamCandidate[] = [];
    for (const partial of beam) {
      const microturn = publishMicroturn(input.def, partial.state, input.runtime);
      if (
        microturn.kind !== 'chooseNStep'
        || microturn.seatId !== input.microturn.seatId
        || microturn.turnId !== input.microturn.turnId
      ) {
        continue;
      }
      const chooseNStepMicroturn = microturn as ChooseNStepMicroturn;
      for (const decision of legalChooseNAddDecisions(chooseNStepMicroturn)) {
        const nextState = applyChooseNStepPreviewDecision(
          input,
          partial.state,
          freezeState(createMutableState(partial.state)),
          chooseNStepMicroturn,
          decision,
        );
        if (nextState === null) {
          continue;
        }
        const scored = scoreChooseNStepCandidate(input, nextState, chooseNStepMicroturn, decision);
        const stableMoveKey = chooseNStepStableMoveKey(decision);
        candidates.push({
          partialSelection: [...partial.partialSelection, decision],
          partialSelectionStableKeys: [...partial.partialSelectionStableKeys, stableMoveKey],
          state: nextState,
          score: partial.score + scored.score,
          scoreContributions: scored.scoreContributions,
        });
        evaluatedCandidateCount += 1;
      }
    }
    if (candidates.length === 0) {
      break;
    }
    candidates.sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.partialSelectionStableKeys.join('|').localeCompare(right.partialSelectionStableKeys.join('|'));
    });
    for (const candidate of candidates.slice(beamWidth)) {
      pruned.push({
        step,
        stableMoveKey: candidate.partialSelectionStableKeys.join('|'),
        partialSelectionStableKeys: candidate.partialSelectionStableKeys,
        score: candidate.score,
        scoreContributions: candidate.scoreContributions,
        selectionReason: 'beamPruned',
      });
    }
    beam = candidates.slice(0, beamWidth).map((candidate) => ({
      partialSelection: candidate.partialSelection,
      partialSelectionStableKeys: candidate.partialSelectionStableKeys,
      state: candidate.state,
      score: candidate.score,
    }));
  }

  const results = beam.map((partial) => resolveBeamResult(input, partial, surfaceContext, seatResolutionIndex));
  const outcomeBreakdown = emptyOutcomeBreakdown();
  for (const result of results) {
    incrementOutcome(outcomeBreakdown, result.outcome);
  }
  return {
    beam: results,
    best: results[0],
    pruned,
    evaluatedCandidateCount,
    outcomeBreakdown,
  };
}

export const continueChooseNStepInnerPreviewDrive = (
  input: RunChooseNStepInnerPreviewInput,
  stateAfterRoot: GameState,
  initialDepth: number,
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
  let state = stateAfterRoot;
  let depth = initialDepth;

  while (true) {
    const microturn = publishMicroturn(input.def, state, input.runtime);
    if (
      microturn.kind === 'actionSelection'
      || microturn.kind === 'outcomeGrantResolve'
      || microturn.kind === 'turnRetirement'
      || microturn.seatId !== input.microturn.seatId
      || microturn.turnId !== input.microturn.turnId
    ) {
      return finish(state, depth, 'ready');
    }
    if (microturn.kind === 'stochasticResolve') {
      return finish(state, depth, 'stochastic');
    }
    if (depth >= depthCap) {
      return finish(state, depth, 'depthCap');
    }
    const nextDecisionResult = pickInnerDecision(
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
    const nextDecision = nextDecisionResult.decision;
    if (nextDecisionResult.usedFallback) {
      completionPolicyFallbackCount += 1;
    }
    if (nextDecision === undefined) {
      return finish(state, depth, 'noPreviewDecision');
    }
    const traceEntry = syntheticDecisionTraceEntry(
      nextDecision,
      syntheticDecisions.length + 1,
      nextDecisionResult.usedFallback ? 'greedy' : completionPolicy,
    );
    if (traceEntry !== undefined) {
      syntheticDecisions.push(traceEntry);
    }
    const nextState = applyChooseNStepPreviewDecision(
      input,
      state,
      state,
      microturn as ChooseNStepMicroturn,
      nextDecision as ChooseNStepDecision,
    );
    if (nextState === null) {
      return finish(state, depth, 'failed');
    }
    state = nextState;
    depth += 1;
  }
};

const resolvedInnerPreviewResult = (
  input: RunChooseNStepInnerPreviewInput,
  decision: ChooseNStepDecision,
  stableMoveKey: string,
  drive: DriveResult,
  continuationBeam: ChooseNStepBeamPreviewRun | null,
  surfaceContext: SurfaceResolutionContext,
  seatResolutionIndex: ReturnType<typeof buildSeatResolutionIndex>,
): ChooseNStepInnerPreviewResult => {
  const resolved = resolveRefs(input, drive, surfaceContext, seatResolutionIndex);
  const outcome = resolved.hidden ? 'hidden' : drive.outcome;
  const withOutcome = new Map(resolved.refs);
  for (const ref of input.refs) {
    if (ref.refKind === 'outcome') {
      withOutcome.set(previewOptionRefKey(ref), { kind: 'ready', value: outcome });
    }
  }
  return {
    decision,
    stableMoveKey,
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
    continuationBeam,
  };
};

export function runChooseNStepInnerPreview(input: RunChooseNStepInnerPreviewInput): ChooseNStepInnerPreviewRun {
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
  const rootOptions = [...legalChooseNAddDecisions(input.microturn)]
    .sort((left, right) => chooseNStepStableMoveKey(left).localeCompare(chooseNStepStableMoveKey(right)));
  const options: ChooseNStepInnerPreviewResult[] = [];
  let evaluatedCandidateCount = 0;
  const depthCap = input.depthCap ?? input.profile.preview.inner?.depthCap ?? input.profile.preview.completionDepthCap ?? 1;
  const continuationPolicy = input.completionPolicy ?? input.profile.preview.completion ?? 'policyGuided';

  for (const decision of rootOptions) {
    const stableMoveKey = chooseNStepStableMoveKey(decision);
    const stateAfterRoot = applyChooseNStepPreviewDecision(
      input,
      input.state,
      freezeState(createMutableState(input.state)),
      input.microturn,
      decision,
    );
    evaluatedCandidateCount += 1;
    if (stateAfterRoot === null) {
      const drive: DriveResult = {
        state: input.state,
        depth: 0,
        outcome: 'failed',
        completionPolicy: continuationPolicy,
        syntheticDecisions: [],
        completionPolicyFallbackCount: 0,
      };
      options.push(resolvedInnerPreviewResult(
        input,
        decision,
        stableMoveKey,
        drive,
        null,
        surfaceContext,
        seatResolutionIndex,
      ));
      continue;
    }

    const nextMicroturn = publishMicroturn(input.def, stateAfterRoot, input.runtime);
    const remainingDepthCap = Math.max(0, depthCap - 1);
    const canContinueWithAddBeam = isSameChooseNStepMicroturn(nextMicroturn, input.microturn)
      && legalChooseNAddDecisions(nextMicroturn).length > 0
      && remainingDepthCap > 0;

    if (canContinueWithAddBeam) {
      const continuationBeam = runChooseNStepBeamPreview({
        ...input,
        state: stateAfterRoot,
        microturn: nextMicroturn,
        depthCap: remainingDepthCap,
      });
      evaluatedCandidateCount += continuationBeam.evaluatedCandidateCount;
      const best = continuationBeam.best;
      const drive: DriveResult = {
        state: best?.state ?? stateAfterRoot,
        depth: 1 + (best?.partialSelection.length ?? 0),
        outcome: best?.outcome ?? 'depthCap',
        completionPolicy: continuationPolicy,
        syntheticDecisions: (best?.partialSelection ?? [])
          .map((entry, index) => syntheticDecisionTraceEntry(entry, index + 1, continuationPolicy))
          .filter((entry): entry is SyntheticDecisionTraceEntry => entry !== undefined),
        completionPolicyFallbackCount: 0,
      };
      options.push(resolvedInnerPreviewResult(
        input,
        decision,
        stableMoveKey,
        drive,
        continuationBeam,
        surfaceContext,
        seatResolutionIndex,
      ));
      continue;
    }

    const drive = continueChooseNStepInnerPreviewDrive(input, stateAfterRoot, 1);
    evaluatedCandidateCount += Math.max(0, drive.depth - 1);
    options.push(resolvedInnerPreviewResult(
      input,
      decision,
      stableMoveKey,
      drive,
      null,
      surfaceContext,
      seatResolutionIndex,
    ));
  }

  const outcomeBreakdown = emptyOutcomeBreakdown();
  for (const option of options) {
    incrementOutcome(outcomeBreakdown, option.outcome);
  }
  return {
    options,
    outcomeBreakdown,
    evaluatedCandidateCount,
  };
}
