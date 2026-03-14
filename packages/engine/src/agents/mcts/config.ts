/**
 * MCTS agent configuration types, defaults, and validation.
 *
 * All fields are readonly — the config is immutable once validated.
 */

/** Allowed rollout policies. */
const ROLLOUT_POLICIES = ['random', 'epsilonGreedy', 'mast'] as const;
type RolloutPolicy = (typeof ROLLOUT_POLICIES)[number];

/** Allowed solver modes. */
const SOLVER_MODES = ['off', 'perfectInfoDeterministic2P'] as const;
type SolverMode = (typeof SOLVER_MODES)[number];

/** Allowed rollout modes. */
const ROLLOUT_MODES = ['legacy', 'hybrid', 'direct'] as const;
export type MctsRolloutMode = (typeof ROLLOUT_MODES)[number];

export interface MctsConfig {
  /** Hard iteration cap. Deterministic mode uses this as the primary budget. */
  readonly iterations: number;

  /** Minimum iterations before wall-clock early stop is allowed. */
  readonly minIterations: number;

  /** Optional wall-clock budget (ms) for interactive play. */
  readonly timeLimitMs?: number;

  /** Exploration constant for availability-aware selection. */
  readonly explorationConstant: number;

  /** Maximum plies simulated after tree expansion before heuristic cutoff. */
  readonly maxSimulationDepth: number;

  /** Progressive widening constant: maxChildren = K * visits^alpha. */
  readonly progressiveWideningK: number;

  /** Progressive widening exponent. */
  readonly progressiveWideningAlpha: number;

  /** Max concrete completions sampled from a single template move per visit. */
  readonly templateCompletionsPerVisit: number;

  /** Rollout policy. */
  readonly rolloutPolicy: RolloutPolicy;

  /** Exploration rate for epsilon-greedy rollouts. */
  readonly rolloutEpsilon: number;

  /** Max candidate moves sampled per rollout step before heuristic choice. */
  readonly rolloutCandidateSample: number;

  /** Temperature for transforming evaluateState() outputs into [0,1] utilities. */
  readonly heuristicTemperature: number;

  /** Restricted solver support only. */
  readonly solverMode: SolverMode;

  /** Rollout mode: legacy (full rollout), hybrid (cutoff), direct (no simulation). */
  readonly rolloutMode: MctsRolloutMode;

  /** Maximum plies for hybrid cutoff simulation. */
  readonly hybridCutoffDepth: number;

  /** MAST warm-up threshold: minimum `totalUpdates` before exploitation. */
  readonly mastWarmUpThreshold: number;

  /** Optional internal diagnostics for tuning/tests. */
  readonly diagnostics?: boolean;
}

export const DEFAULT_MCTS_CONFIG: MctsConfig = Object.freeze({
  iterations: 1500,
  minIterations: 128,
  explorationConstant: 1.4,
  maxSimulationDepth: 48,
  progressiveWideningK: 2.0,
  progressiveWideningAlpha: 0.5,
  templateCompletionsPerVisit: 2,
  rolloutPolicy: 'mast' as const,
  rolloutEpsilon: 0.15,
  rolloutCandidateSample: 6,
  heuristicTemperature: 10_000,
  solverMode: 'off' as const,
  rolloutMode: 'hybrid' as const,
  hybridCutoffDepth: 6,
  mastWarmUpThreshold: 32,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertPositive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`MctsConfig.${name} must be a positive finite number, got ${value}`);
  }
}

function assertNonNegativeInt(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(
      `MctsConfig.${name} must be a non-negative safe integer, got ${value}`,
    );
  }
}

function assertPositiveInt(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(
      `MctsConfig.${name} must be a positive safe integer, got ${value}`,
    );
  }
}

function assertRange(name: string, value: number, min: number, max: number): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(
      `MctsConfig.${name} must be in [${min}, ${max}], got ${value}`,
    );
  }
}

function assertOneOf<T>(name: string, value: T, allowed: readonly T[]): void {
  if (!allowed.includes(value)) {
    throw new TypeError(
      `MctsConfig.${name} must be one of ${allowed.map(String).join(', ')}, got ${String(value)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

/** Named search-strength presets. */
export type MctsPreset = 'fast' | 'default' | 'strong';

/**
 * Named config partials keyed by preset name.
 * `default` is an empty partial — it resolves to `DEFAULT_MCTS_CONFIG`.
 */
export const MCTS_PRESETS: Readonly<Record<MctsPreset, Partial<MctsConfig>>> = Object.freeze({
  fast: Object.freeze({ iterations: 200, maxSimulationDepth: 16, rolloutPolicy: 'mast' as const, timeLimitMs: 2_000, rolloutMode: 'hybrid' as const, hybridCutoffDepth: 4 }),
  default: Object.freeze({ rolloutPolicy: 'mast' as const, timeLimitMs: 10_000, rolloutMode: 'hybrid' as const, hybridCutoffDepth: 6 }),
  strong: Object.freeze({ iterations: 5000, maxSimulationDepth: 64, rolloutPolicy: 'mast' as const, templateCompletionsPerVisit: 4, timeLimitMs: 30_000, rolloutMode: 'hybrid' as const, hybridCutoffDepth: 8 }),
});

/** All recognised preset names (for validation). */
export const MCTS_PRESET_NAMES: readonly MctsPreset[] = Object.freeze(
  Object.keys(MCTS_PRESETS) as MctsPreset[],
);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Merge a partial config with defaults and validate all field ranges.
 * Returns a fully populated, immutable `MctsConfig`.
 */
export function validateMctsConfig(partial: Partial<MctsConfig>): MctsConfig {
  const merged: MctsConfig = { ...DEFAULT_MCTS_CONFIG, ...partial };

  // Integer fields
  assertPositiveInt('iterations', merged.iterations);
  assertNonNegativeInt('minIterations', merged.minIterations);
  assertPositiveInt('maxSimulationDepth', merged.maxSimulationDepth);
  assertPositiveInt('templateCompletionsPerVisit', merged.templateCompletionsPerVisit);
  assertPositiveInt('rolloutCandidateSample', merged.rolloutCandidateSample);

  // Positive reals
  assertPositive('explorationConstant', merged.explorationConstant);
  assertPositive('progressiveWideningK', merged.progressiveWideningK);
  assertPositive('heuristicTemperature', merged.heuristicTemperature);

  // Bounded reals
  assertRange('progressiveWideningAlpha', merged.progressiveWideningAlpha, 0, 1);
  assertRange('rolloutEpsilon', merged.rolloutEpsilon, 0, 1);

  // Enums
  assertOneOf('rolloutPolicy', merged.rolloutPolicy, ROLLOUT_POLICIES);
  assertOneOf('solverMode', merged.solverMode, SOLVER_MODES);
  assertOneOf('rolloutMode', merged.rolloutMode, ROLLOUT_MODES);

  // Hybrid cutoff depth
  assertPositiveInt('hybridCutoffDepth', merged.hybridCutoffDepth);

  // MAST warm-up threshold
  assertNonNegativeInt('mastWarmUpThreshold', merged.mastWarmUpThreshold);

  // Optional wall-clock
  if (merged.timeLimitMs !== undefined) {
    assertPositive('timeLimitMs', merged.timeLimitMs);
  }

  return Object.freeze(merged);
}

/**
 * Resolve a named preset into a fully validated, immutable `MctsConfig`.
 */
export function resolvePreset(preset: MctsPreset): MctsConfig {
  return validateMctsConfig(MCTS_PRESETS[preset]);
}
