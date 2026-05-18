import type {
  Decision,
  DecisionContextKind,
  GameDef,
  GameState,
  PolicyAgentDecisionTrace,
  Rng,
  ValidatedGameDef,
} from '../../../src/kernel/index.js';
import type { GameDefRuntime } from '../../../src/kernel/gamedef-runtime.js';

export type GameId = string;
export type AgentProfileId = string;
export type SeatId = string;
export type ScenarioId = string;
export type PhaseId = string;

export type ProbeSeverity = 'profileQuality' | 'architecturalInvariant';
export type ProbeOutcomeKind = 'pass' | 'fail' | 'error';

export type ProbeAssertion = never;

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
  readonly replayPrefix?: readonly Decision[];
  readonly expectedStateHash?: string;
  readonly decisionFilter?: {
    readonly phase?: PhaseId;
  };
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
  readonly trace: PolicyAgentDecisionTrace | null;
  readonly contextKind: DecisionContextKind;
  readonly decisionKey: string | null;
  readonly phase: string;
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
