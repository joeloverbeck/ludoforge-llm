import { performance } from 'node:perf_hooks';

import { PolicyAgent } from '../../../src/agents/index.js';
import {
  advanceAutoresolvable,
  applyDecision,
  applyPublishedDecision,
  createRng,
  initialState,
  publishMicroturn,
  type Decision,
  type DecisionContext,
  type GameState,
  type MicroturnState,
  type PolicyAgentDecisionTrace,
  type Rng,
} from '../../../src/kernel/index.js';
import type {
  Probe,
  ProbeMatch,
  ProbeOutcome,
  ProbeResult,
  ProbeRunOptions,
  ProbeSeedOutcome,
} from './probe-types.js';
import { dispatchAssertion } from './assertions/index.js';

const DEFAULT_MAX_DECISION_STEPS = 256;
const AGENT_RNG_MIX = 0x9e3779b97f4a7c15n;

export const runProbe = (probe: Probe, options: ProbeRunOptions): ProbeResult => {
  const startedAt = performance.now();
  const perSeedOutcomes = seedsForProbe(probe).map((seed) => runProbeForSeed(probe, seed, options));
  const aggregateOutcome = aggregateProbeOutcome(perSeedOutcomes);
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
  options: ProbeRunOptions,
): ProbeSeedOutcome => {
  const loaded = options.loadGame({
    game: probe.game,
    scenario: probe.stateBinding.scenario,
  });
  let state = initialState(loaded.def, seed, loaded.playerCount, undefined, loaded.runtime).state;
  let chanceRng = createRng(BigInt(seed));
  let agentRng = options.createAgentRng?.({ probe, seed, seat: probe.seat })
    ?? createRng(BigInt(seed) ^ AGENT_RNG_MIX);

  for (const decision of probe.stateBinding.replayPrefix ?? []) {
    const applied = applyDecision(loaded.def, state, decision, undefined, loaded.runtime);
    state = applied.state;
  }

  const expectedStateHash = probe.stateBinding.expectedStateHash;
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
  for (let step = 0; step < maxDecisionSteps; step += 1) {
    const auto = advanceAutoresolvable(loaded.def, state, chanceRng, loaded.runtime);
    state = auto.state;
    chanceRng = auto.rng;

    const microturn = publishMicroturn(loaded.def, state, loaded.runtime);
    const selection = selectDecisionForProbe(probe, seed, microturn, state, agentRng, {
      def: loaded.def,
      runtime: loaded.runtime,
    });
    agentRng = selection.rng;

    if (selection.match !== null) {
      matches.push(selection.match);
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
      outcome: evaluateProbeAssertions(probe, matches, { def: loaded.def, state }),
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

const selectDecisionForProbe = (
  probe: Probe,
  seed: number,
  microturn: MicroturnState,
  state: GameState,
  rng: Rng,
  context: {
    readonly def: Parameters<PolicyAgent['chooseDecision']>[0]['def'];
    readonly runtime: NonNullable<Parameters<PolicyAgent['chooseDecision']>[0]['runtime']>;
  },
): {
  readonly decision: Decision;
  readonly rng: Rng;
  readonly match: ProbeMatch | null;
} => {
  const agent = new PolicyAgent({ profileId: probe.profile, traceLevel: 'verbose' });
  const selected = agent.chooseDecision({
    def: context.def,
    state,
    microturn,
    rng,
    runtime: context.runtime,
  });
  const trace = selected.agentDecision?.kind === 'policy' ? selected.agentDecision : null;
  const decisionKey = decisionKeyForContext(microturn.decisionContext);
  const isMatch = microturn.kind === probe.decisionBinding.contextKind
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
          trace,
          contextKind: microturn.kind,
          decisionKey,
          phase: String(state.currentPhase),
        }
      : null,
  };
};

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

const seedsForProbe = (probe: Probe): readonly number[] => {
  if (probe.stateBinding.seed !== undefined) {
    return [probe.stateBinding.seed];
  }
  const range = probe.stateBinding.seedRange;
  if (range === undefined) {
    return [];
  }
  return Array.from({ length: range.end - range.start + 1 }, (_, index) => range.start + index);
};

const aggregateProbeOutcome = (outcomes: readonly ProbeSeedOutcome[]): ProbeOutcome => {
  const firstNonPass = outcomes.find((outcome) => outcome.outcome.kind !== 'pass');
  return firstNonPass?.outcome ?? { kind: 'pass' };
};

const evaluateProbeAssertions = (
  probe: Probe,
  matches: readonly ProbeMatch[],
  context: {
    readonly def: Parameters<PolicyAgent['chooseDecision']>[0]['def'];
    readonly state: GameState;
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

const formatStateHash = (state: GameState): string => `0x${state.stateHash.toString(16)}`;

const deterministicByteLength = (value: unknown): number => Buffer.byteLength(stableStringify(value), 'utf8');

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
