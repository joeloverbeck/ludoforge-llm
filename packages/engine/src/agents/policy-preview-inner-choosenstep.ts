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
import type {
  ChoicePendingChooseNRequest,
  GameState,
  MoveParamScalar,
  PolicyPreviewOutcomeBreakdownTrace,
} from '../kernel/types.js';
import {
  buildPolicyVictorySurface,
  type PolicyValue,
  type SurfaceResolutionContext,
} from './policy-surface.js';
import type {
  PolicyPreviewTraceOutcome,
} from './policy-preview.js';
import {
  emptyOutcomeBreakdown,
  incrementOutcome,
  previewOptionRefKey,
  resolveRefs,
  type DriveResult,
  type InnerPreviewBaseInput,
} from './policy-preview-inner.js';
import {
  microturnConsiderationIdsForProfile,
} from './microturn-option-evaluator.js';
import {
  scoreMicroturnOptionWithContributions,
  type CompletionScoreContribution,
} from './microturn-option-eval.js';

type ChooseNStepDecision = Extract<Decision, { readonly kind: 'chooseNStep' }>;
type ChooseNStepMicroturn = MicroturnState & {
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
  readonly resolvedRefs: ReadonlyMap<string, PolicyValue>;
  readonly outcome: PolicyPreviewTraceOutcome;
}

export interface ChooseNStepBeamPreviewRun {
  readonly beam: readonly ChooseNStepBeamResult[];
  readonly best: ChooseNStepBeamResult | undefined;
  readonly pruned: readonly ChooseNStepBeamPrunedTraceEntry[];
  readonly evaluatedCandidateCount: number;
  readonly outcomeBreakdown: PolicyPreviewOutcomeBreakdownTrace;
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
      withOutcome.set(previewOptionRefKey(ref), outcome);
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
      for (const decision of legalChooseNAddDecisions(microturn as ChooseNStepMicroturn)) {
        const nextState = applyPublishedDecision(
          input.def,
          freezeState(createMutableState(partial.state)),
          microturn,
          decision,
          { advanceToDecisionPoint: true },
          input.runtime,
        ).state;
        const scored = scoreChooseNStepCandidate(input, nextState, microturn as ChooseNStepMicroturn, decision);
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
