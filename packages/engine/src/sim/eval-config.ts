export interface EvalConfig {
  readonly trivialWinThreshold?: number;
  readonly stallTurnThreshold?: number;
  readonly dominantActionThreshold?: number;
  readonly scoringVar?: string;
}

export const DEFAULT_EVAL_CONFIG = {
  trivialWinThreshold: 5,
  stallTurnThreshold: 10,
  dominantActionThreshold: 0.8,
} as const satisfies Required<Omit<EvalConfig, 'scoringVar'>>;
