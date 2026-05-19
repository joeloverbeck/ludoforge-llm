import type {
  Decision,
  DecisionContextKind,
  GameDef,
  GameState,
  PolicyAgentDecisionTrace,
  Rng,
  SerializedGameState,
  ValidatedGameDef,
} from '../../../src/kernel/index.js';
import type { PolicyDecisionTraceLevel } from '../../../src/agents/index.js';
import type { GameDefRuntime } from '../../../src/kernel/gamedef-runtime.js';

export type GameId = string;
export type AgentProfileId = string;
export type SeatId = string;
export type ScenarioId = string;
export type PhaseId = string;

export type ProbeSeverity = 'profileQuality' | 'architecturalInvariant';
export type ProbeOutcomeKind = 'pass' | 'fail' | 'error';

export type ActionTagId = string;
export type SelectorId = string;
export type GuardrailId = string;
export type AdvisoryCode = string;
export type SelectedByReason = 'scored' | 'tiebreak' | 'fallbackExplicit' | 'tiebreakAfterPreviewNoSignal' | string;
export type PreviewRefStatus =
  | 'ready'
  | 'stochastic'
  | 'random'
  | 'hidden'
  | 'unresolved'
  | 'failed'
  | 'depthCap'
  | 'postGrantCap'
  | 'noPreviewDecision'
  | 'gated'
  | 'unavailableWithFallback';

export type StandingRoleId = 'currentLeader' | 'nearestThreat' | 'closestAhead' | 'closestBehind';

export type ProbeAssertion =
  | { readonly id?: string; readonly kind: 'selectedCandidateHasTag'; readonly tag: ActionTagId }
  | { readonly id?: string; readonly kind: 'selectedCandidateLacksTag'; readonly tag: ActionTagId }
  | { readonly id?: string; readonly kind: 'selectedCandidateRankWithinTopK'; readonly k: number }
  | { readonly id?: string; readonly kind: 'selectedTargetSatisfiesSelector'; readonly selector: SelectorId; readonly minRank?: number }
  | { readonly id?: string; readonly kind: 'selectedSeatTargetMatchesRole'; readonly role: StandingRoleId }
  | { readonly id?: string; readonly kind: 'previewRefStatusIn'; readonly ref: string; readonly allowed: readonly PreviewRefStatus[] }
  | { readonly id?: string; readonly kind: 'selectedNotByReason'; readonly reason: SelectedByReason; readonly maxRate?: number }
  | {
      readonly id?: string;
      readonly kind: 'actionFamilyDistributionBelow';
      readonly family: 'any' | { readonly tags: readonly ActionTagId[] };
      readonly threshold: number;
      readonly windowMinDecisions: number;
    }
  | {
      readonly id?: string;
      readonly kind: 'moduleActiveContributionRateAtLeast';
      readonly module: string;
      readonly traceLabel: string;
      readonly minActiveRate: number;
      readonly minNonZeroContributionRate: number;
      readonly windowMinDecisions: number;
    }
  | { readonly id?: string; readonly kind: 'traceContainsField'; readonly field: string }
  | { readonly id?: string; readonly kind: 'traceHasAdvisory'; readonly code: AdvisoryCode }
  | { readonly id?: string; readonly kind: 'traceLacksAdvisory'; readonly code: AdvisoryCode }
  | { readonly id?: string; readonly kind: 'publishedFrontierConstructible' }
  | { readonly id?: string; readonly kind: 'guardrailFired'; readonly guardrail: GuardrailId }
  | { readonly id?: string; readonly kind: 'guardrailNotFired'; readonly guardrail: GuardrailId }
  | {
      readonly id?: string;
      readonly kind: 'guardrailFiresUniformAcross';
      readonly guardrail: GuardrailId;
      readonly threshold: number;
      readonly windowMinDecisions: number;
    };

export interface Probe {
  readonly id: string;
  readonly game: GameId;
  readonly profile: AgentProfileId;
  readonly seat: SeatId;
  readonly stateBinding: ProbeStateBinding;
  readonly decisionBinding: ProbeDecisionBinding;
  readonly assertions: readonly ProbeAssertion[];
  readonly severity: ProbeSeverity;
  readonly tags: readonly string[];
}

export interface ProbeStateBinding {
  readonly scenario: ScenarioId;
  readonly seed?: number;
  readonly seedRange?: {
    readonly start: number;
    readonly end: number;
  };
  readonly stateSamples?: readonly ProbeStateSample[];
  readonly replayPrefix?: readonly Decision[];
  readonly expectedStateHash?: string;
  readonly maxMatchesPerSeed?: number;
  readonly decisionFilter?: {
    readonly phase?: PhaseId;
  };
}

export interface ProbeStateSample {
  readonly seed: number;
  readonly stateHash: string;
  readonly state: SerializedGameState;
}

export interface ProbeDecisionBinding {
  readonly contextKind: DecisionContextKind;
  readonly decisionKey?: string;
  readonly occurrence: 'first' | 'every' | { readonly kind: 'nth'; readonly n: number };
}

export interface ProbeLoadedGame {
  readonly def: ValidatedGameDef;
  readonly runtime: GameDefRuntime;
  readonly playerCount: number;
  readonly scenario: ScenarioId;
}

export interface ProbeRunOptions {
  readonly loadGame: (request: ProbeLoadGameRequest) => ProbeLoadedGame;
  readonly createAgentRng?: (request: ProbeAgentRngRequest) => Rng;
  readonly maxDecisionSteps?: number;
  readonly traceLevel?: PolicyDecisionTraceLevel;
  readonly verboseOnFailure?: boolean;
}

export interface ProbeLoadGameRequest {
  readonly game: GameId;
  readonly scenario: ScenarioId;
}

export interface ProbeAgentRngRequest {
  readonly probe: Probe;
  readonly seed: number;
  readonly seat: SeatId;
}

export interface ProbeMatch {
  readonly seed: number;
  readonly stateHash: string;
  readonly selectedDecision: Decision;
  readonly selectedActionTags: readonly ActionTagId[];
  readonly selectedByReason?: SelectedByReason;
  readonly trace: PolicyAgentDecisionTrace | null;
  readonly publishedFrontierConstructibility?: ProbePublishedFrontierConstructibility;
  readonly contextKind: DecisionContextKind;
  readonly decisionKey: string | null;
  readonly phase: string;
}

export interface ProbePublishedFrontierConstructibility {
  readonly total: number;
  readonly passed: number;
  readonly failures: readonly ProbePublishedFrontierConstructibilityFailure[];
}

export interface ProbePublishedFrontierConstructibilityFailure {
  readonly index: number;
  readonly decisionKind: Decision['kind'];
  readonly reason: string;
}

export interface ProbeSeedOutcome {
  readonly seed: number;
  readonly outcome: ProbeOutcome;
  readonly matches: readonly ProbeMatch[];
}

export type ProbeOutcome =
  | {
      readonly kind: 'pass';
    }
  | {
      readonly kind: 'fail';
      readonly assertionId: string;
      readonly reason: string;
      readonly trace?: PolicyAgentDecisionTrace | null;
    }
  | {
      readonly kind: 'error';
      readonly message: string;
    };

export interface ProbeResult {
  readonly probe: Probe;
  readonly perSeedOutcomes: readonly ProbeSeedOutcome[];
  readonly aggregateOutcome: ProbeOutcome;
  readonly durationMs: number;
  readonly traceBytes: number;
}

export type ProbeStateFactory = (
  def: GameDef,
  seed: number,
  playerCount: number,
  runtime: GameDefRuntime,
) => GameState;
