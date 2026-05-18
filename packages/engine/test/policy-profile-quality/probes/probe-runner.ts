import { performance } from 'node:perf_hooks';

import { PolicyAgent, type PolicyDecisionTraceLevel } from '../../../src/agents/index.js';
import {
  advanceAutoresolvable,
  applyDecision,
  applyPublishedDecision,
  createRng,
  deserializeGameState,
  initialState,
  publishMicroturn,
  terminalResult,
  type Decision,
  type DecisionContext,
  type GameState,
  type MicroturnState,
  type PolicyAgentDecisionTrace,
  type Rng,
} from '../../../src/kernel/index.js';
import { forkGameDefRuntimeForRun } from '../../../src/kernel/gamedef-runtime.js';
import type {
  Probe,
  ProbeLoadedGame,
  ProbeMatch,
  ProbeOutcome,
  ProbeResult,
  ProbeRunOptions,
  ProbeSeedOutcome,
  ProbeStateSample,
} from './probe-types.js';
import { dispatchAssertion } from './assertions/index.js';

const DEFAULT_MAX_DECISION_STEPS = 256;
const AGENT_RNG_MIX = 0x9e3779b97f4a7c15n;

export const runProbe = (probe: Probe, options: ProbeRunOptions): ProbeResult => {
  const result = runProbeOnce(probe, options);
  if (
    result.aggregateOutcome.kind === 'fail'
    && result.aggregateOutcome.trace === undefined
    && options.traceLevel !== 'verbose'
    && options.verboseOnFailure !== false
  ) {
    const verboseResult = runProbeOnce(probe, {
      ...options,
      traceLevel: 'verbose',
      verboseOnFailure: false,
    });
    return {
      ...result,
      aggregateOutcome: {
        ...result.aggregateOutcome,
        trace: firstMatchedTrace(verboseResult),
      },
    };
  }
  return result;
};

const runProbeOnce = (probe: Probe, options: ProbeRunOptions): ProbeResult => {
  const startedAt = performance.now();
  const aggregateWindow = aggregateWindowSize(probe);
  const perSeedOutcomes: ProbeSeedOutcome[] = [];
  const aggregateMatches: ProbeMatch[] = [];
  const loaded = options.loadGame({
    game: probe.game,
    scenario: probe.stateBinding.scenario,
  });
  for (const runBinding of runBindingsForProbe(probe)) {
    const remainingAggregateMatches = aggregateWindow === null
      ? undefined
      : Math.max(0, aggregateWindow - aggregateMatches.length);
    if (remainingAggregateMatches === 0) {
      break;
    }
    const seedMaxMatches = maxMatchesForSeed(probe, remainingAggregateMatches);
    const seedOutcome = runProbeForSeed(probe, runBinding.seed, loaded, options, seedMaxMatches, runBinding.sample);
    perSeedOutcomes.push(seedOutcome);
    aggregateMatches.push(...seedOutcome.matches);
    if (seedOutcome.outcome.kind !== 'pass') {
      break;
    }
  }
  const aggregateOutcome = aggregateWindow === null
    ? aggregateProbeOutcome(perSeedOutcomes)
    : aggregateProbeOutcome(perSeedOutcomes, probe, aggregateMatches);
  const traceBytes = deterministicByteLength({
    probeId: probe.id,
    perSeedOutcomes,
    aggregateOutcome,
  });

  return {
    probe,
    perSeedOutcomes,
    aggregateOutcome,
    durationMs: performance.now() - startedAt,
    traceBytes,
  };
};

const runProbeForSeed = (
  probe: Probe,
  seed: number,
  loadedGame: ProbeLoadedGame,
  options: ProbeRunOptions,
  maxMatches?: number,
  sample?: ProbeStateSample,
): ProbeSeedOutcome => {
  const loaded = {
    ...loadedGame,
    runtime: forkGameDefRuntimeForRun(loadedGame.runtime),
  };
  let state = sample === undefined
    ? initialState(loaded.def, seed, loaded.playerCount, undefined, loaded.runtime).state
    : deserializeGameState(sample.state);
  let chanceRng = sample === undefined ? createRng(BigInt(seed)) : { state: state.rng };
  let agentRng = options.createAgentRng?.({ probe, seed, seat: probe.seat })
    ?? createRng(BigInt(seed) ^ AGENT_RNG_MIX);

  for (const decision of probe.stateBinding.replayPrefix ?? []) {
    const applied = applyDecision(loaded.def, state, decision, undefined, loaded.runtime);
    state = applied.state;
  }

  const expectedStateHash = sample?.stateHash ?? probe.stateBinding.expectedStateHash;
  if (expectedStateHash !== undefined && formatStateHash(state) !== expectedStateHash) {
    return {
      seed,
      outcome: {
        kind: 'error',
        message: `state hash drift: expected ${expectedStateHash}, got ${formatStateHash(state)}`,
      },
      matches: [],
    };
  }

  const matches: ProbeMatch[] = [];
  const maxDecisionSteps = options.maxDecisionSteps ?? DEFAULT_MAX_DECISION_STEPS;
  const targetSeatAgent = new PolicyAgent({ profileId: probe.profile, traceLevel: traceLevelForProbe(probe, options) });
  const defaultAgentsBySeat = new Map<string, PolicyAgent>();
  for (let step = 0; step < maxDecisionSteps; step += 1) {
    const auto = advanceAutoresolvable(loaded.def, state, chanceRng, loaded.runtime);
    state = auto.state;
    chanceRng = auto.rng;

    if (terminalResult(loaded.def, state, loaded.runtime) !== null) {
      return terminalProbeSeedOutcome(probe, seed, matches, loaded.def, state, maxMatches);
    }

    const microturn = publishMicroturn(loaded.def, state, loaded.runtime);
    const selection = selectDecisionForProbe(
      probe,
      seed,
      microturn,
      state,
      agentRng,
      agentForProbeSeat(probe, microturn, {
        targetSeatAgent,
        defaultAgentsBySeat,
      }),
      {
        def: loaded.def,
        runtime: loaded.runtime,
        ...(options.traceLevel === undefined ? {} : { traceLevel: options.traceLevel }),
      },
    );
    agentRng = selection.rng;

    if (selection.match !== null) {
      matches.push(selection.match);
      if (maxMatches !== undefined && matches.length >= maxMatches) {
        return {
          seed,
          outcome: { kind: 'pass' },
          matches,
        };
      }
      if (isOccurrenceSatisfied(probe, matches.length)) {
        return {
          seed,
          outcome: evaluateProbeAssertions(probe, matches, { def: loaded.def, state }),
          matches,
        };
      }
    }

    state = applyPublishedDecision(loaded.def, state, microturn, selection.decision, undefined, loaded.runtime).state;
  }

  if (probe.decisionBinding.occurrence === 'every' && matches.length > 0) {
    return {
      seed,
      outcome: maxMatches === undefined
        ? evaluateProbeAssertions(probe, matches, { def: loaded.def, state })
        : { kind: 'pass' },
      matches,
    };
  }

  return {
    seed,
    outcome: {
      kind: 'error',
      message: `probe decision binding did not match within ${String(maxDecisionSteps)} decision step(s)`,
    },
    matches,
  };
};

const terminalProbeSeedOutcome = (
  probe: Probe,
  seed: number,
  matches: readonly ProbeMatch[],
  def: Parameters<PolicyAgent['chooseDecision']>[0]['def'],
  state: GameState,
  maxMatches?: number,
): ProbeSeedOutcome => {
  if (probe.decisionBinding.occurrence === 'every' && matches.length > 0) {
    return {
      seed,
      outcome: maxMatches === undefined
        ? evaluateProbeAssertions(probe, matches, { def, state })
        : { kind: 'pass' },
      matches,
    };
  }
  return {
    seed,
    outcome: {
      kind: 'error',
      message: 'probe decision binding reached terminal state before matching',
    },
    matches,
  };
};

const selectDecisionForProbe = (
  probe: Probe,
  seed: number,
  microturn: MicroturnState,
  state: GameState,
  rng: Rng,
  agent: PolicyAgent,
  context: {
    readonly def: Parameters<PolicyAgent['chooseDecision']>[0]['def'];
    readonly runtime: NonNullable<Parameters<PolicyAgent['chooseDecision']>[0]['runtime']>;
    readonly traceLevel?: PolicyDecisionTraceLevel;
  },
): {
  readonly decision: Decision;
  readonly rng: Rng;
  readonly match: ProbeMatch | null;
} => {
  const selected = agent.chooseDecision({
    def: context.def,
    state,
    microturn,
    rng,
    runtime: context.runtime,
  });
  const trace = selected.agentDecision?.kind === 'policy' ? selected.agentDecision : null;
  const decisionKey = decisionKeyForContext(microturn.decisionContext);
  const isMatch = seatMatchesProbe(probe, microturn)
    && microturn.kind === probe.decisionBinding.contextKind
    && (probe.decisionBinding.decisionKey === undefined || probe.decisionBinding.decisionKey === decisionKey)
    && (probe.stateBinding.decisionFilter?.phase === undefined
      || String(state.currentPhase) === probe.stateBinding.decisionFilter.phase);

  return {
    decision: selected.decision,
    rng: selected.rng,
    match: isMatch
      ? {
          seed,
          stateHash: formatStateHash(state),
          selectedDecision: selected.decision,
          selectedActionTags: actionTagsForDecision(context.def, selected.decision),
          ...(selected.selectedByReason === undefined ? {} : { selectedByReason: selected.selectedByReason }),
          trace,
          ...(probeNeedsPublishedFrontierConstructibility(probe)
            ? {
                publishedFrontierConstructibility: evaluatePublishedFrontierConstructibility(
                  context.def,
                  state,
                  microturn,
                  context.runtime,
                ),
              }
            : {}),
          contextKind: microturn.kind,
          decisionKey,
          phase: String(state.currentPhase),
        }
      : null,
  };
};

const agentForProbeSeat = (
  probe: Probe,
  microturn: MicroturnState,
  agents: {
    readonly targetSeatAgent: PolicyAgent;
    readonly defaultAgentsBySeat: Map<string, PolicyAgent>;
  },
): PolicyAgent => {
  if (seatMatchesProbe(probe, microturn)) {
    return agents.targetSeatAgent;
  }
  const seatId = normalizedSeatId(microturn);
  const existing = agents.defaultAgentsBySeat.get(seatId);
  if (existing !== undefined) {
    return existing;
  }
  const created = new PolicyAgent({ traceLevel: 'none' });
  agents.defaultAgentsBySeat.set(seatId, created);
  return created;
};

const seatMatchesProbe = (probe: Probe, microturn: MicroturnState): boolean =>
  normalizedSeatId(microturn) === probe.seat.toLowerCase();

const normalizedSeatId = (microturn: MicroturnState): string => String(microturn.seatId).toLowerCase();

const decisionKeyForContext = (context: DecisionContext): string | null => {
  switch (context.kind) {
    case 'chooseOne':
    case 'chooseNStep':
    case 'stochasticResolve':
      return String(context.decisionKey);
    case 'actionSelection':
    case 'outcomeGrantResolve':
    case 'turnRetirement':
      return null;
  }
};

const isOccurrenceSatisfied = (probe: Probe, matchCount: number): boolean => {
  const occurrence = probe.decisionBinding.occurrence;
  if (occurrence === 'first') {
    return true;
  }
  if (occurrence === 'every') {
    return false;
  }
  return matchCount >= occurrence.n;
};

const runBindingsForProbe = (probe: Probe): readonly {
  readonly seed: number;
  readonly sample?: ProbeStateSample;
}[] => {
  const samples = probe.stateBinding.stateSamples;
  if (samples !== undefined) {
    return samples.map((sample) => ({ seed: sample.seed, sample }));
  }
  if (probe.stateBinding.seed !== undefined) {
    return [{ seed: probe.stateBinding.seed }];
  }
  const range = probe.stateBinding.seedRange;
  if (range === undefined) {
    return [];
  }
  return Array.from({ length: range.end - range.start + 1 }, (_, index) => ({ seed: range.start + index }));
};

const aggregateWindowSize = (probe: Probe): number | null => {
  if (
    probe.decisionBinding.occurrence !== 'every'
    || (probe.stateBinding.seedRange === undefined && probe.stateBinding.stateSamples === undefined)
  ) {
    return null;
  }
  const windows = probe.assertions.flatMap((assertion) => (
    assertion.kind === 'actionFamilyDistributionBelow' ? [assertion.windowMinDecisions] : []
  ));
  return windows.length === 0 ? null : Math.max(...windows);
};

const maxMatchesForSeed = (probe: Probe, remainingAggregateMatches: number | undefined): number | undefined => {
  const perSeedCap = probe.stateBinding.maxMatchesPerSeed;
  if (remainingAggregateMatches === undefined) {
    return perSeedCap;
  }
  return perSeedCap === undefined
    ? remainingAggregateMatches
    : Math.min(remainingAggregateMatches, perSeedCap);
};

const traceLevelForProbe = (probe: Probe, options: ProbeRunOptions): PolicyDecisionTraceLevel => {
  if (options.traceLevel !== undefined) {
    return options.traceLevel;
  }
  return probeNeedsFullTrace(probe) ? 'summary' : 'none';
};

const probeNeedsFullTrace = (probe: Probe): boolean =>
  probe.assertions.some((assertion) => ![
    'actionFamilyDistributionBelow',
    'selectedNotByReason',
    'publishedFrontierConstructible',
  ].includes(assertion.kind));

const probeNeedsPublishedFrontierConstructibility = (probe: Probe): boolean => (
  probe.assertions.some((assertion) => assertion.kind === 'publishedFrontierConstructible')
);

const aggregateProbeOutcome = (
  outcomes: readonly ProbeSeedOutcome[],
  probe?: Probe,
  aggregateMatches?: readonly ProbeMatch[],
): ProbeOutcome => {
  const firstNonPass = outcomes.find((outcome) => outcome.outcome.kind !== 'pass');
  if (firstNonPass !== undefined) {
    return firstNonPass.outcome;
  }
  if (probe !== undefined && aggregateMatches !== undefined) {
    return evaluateProbeAssertions(probe, aggregateMatches, {});
  }
  return { kind: 'pass' };
};

const evaluateProbeAssertions = (
  probe: Probe,
  matches: readonly ProbeMatch[],
  context: {
    readonly def?: Parameters<PolicyAgent['chooseDecision']>[0]['def'];
    readonly state?: GameState;
  },
): ProbeOutcome => {
  for (const assertion of probe.assertions) {
    const outcome = dispatchAssertion(assertion, { probe, matches, ...context });
    if (outcome.kind !== 'pass') {
      return outcome;
    }
  }
  return { kind: 'pass' };
};

const actionTagsForDecision = (
  def: Parameters<PolicyAgent['chooseDecision']>[0]['def'],
  decision: Decision,
): readonly string[] => (
  decision.kind === 'actionSelection'
    ? def.actionTagIndex?.byAction[String(decision.actionId)] ?? []
    : []
);

const evaluatePublishedFrontierConstructibility = (
  def: Parameters<PolicyAgent['chooseDecision']>[0]['def'],
  state: GameState,
  microturn: MicroturnState,
  runtime: NonNullable<Parameters<PolicyAgent['chooseDecision']>[0]['runtime']>,
) => {
  const failures = microturn.legalActions.flatMap((decision, index) => {
    try {
      applyPublishedDecision(def, state, microturn, decision, undefined, runtime);
      return [];
    } catch (error) {
      return [{
        index,
        decisionKind: decision.kind,
        reason: error instanceof Error ? error.message : String(error),
      }];
    }
  });

  return {
    total: microturn.legalActions.length,
    passed: microturn.legalActions.length - failures.length,
    failures,
  };
};

const formatStateHash = (state: GameState): string => `0x${state.stateHash.toString(16)}`;

const deterministicByteLength = (value: unknown): number => Buffer.byteLength(stableStringify(value), 'utf8');

const firstMatchedTrace = (result: ProbeResult): PolicyAgentDecisionTrace | null => {
  for (const seedOutcome of result.perSeedOutcomes) {
    for (const match of seedOutcome.matches) {
      if (match.trace !== null) {
        return match.trace;
      }
    }
  }
  return null;
};

const stableStringify = (value: unknown): string => {
  if (typeof value === 'bigint') {
    return JSON.stringify(`0x${value.toString(16)}`);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Readonly<Record<string, unknown>>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

export type { ProbeResult, PolicyAgentDecisionTrace };
