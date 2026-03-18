/**
 * MCTS agent configuration types, defaults, and validation.
 *
 * All fields are readonly — the config is immutable once validated.
 */

import type { MctsSearchVisitor } from './visitor.js';

/** Allowed rollout policies. */
const ROLLOUT_POLICIES = ['random', 'epsilonGreedy', 'mast'] as const;
type RolloutPolicy = (typeof ROLLOUT_POLICIES)[number];

/** Allowed solver modes. */
const SOLVER_MODES = ['off', 'perfectInfoDeterministic2P'] as const;
type SolverMode = (typeof SOLVER_MODES)[number];

/** Allowed classification policies (spec section 5). */
const CLASSIFICATION_POLICIES = ['auto', 'exhaustive', 'lazy'] as const;
export type ClassificationPolicy = (typeof CLASSIFICATION_POLICIES)[number];

/** Allowed widening modes (spec section 3.7). */
const WIDENING_MODES = ['move', 'familyThenMove'] as const;
export type WideningMode = (typeof WIDENING_MODES)[number];

/** Allowed leaf evaluator types. */
const LEAF_EVALUATOR_TYPES = ['heuristic', 'rollout', 'auto'] as const;

/**
 * Leaf evaluation strategy — discriminated union replacing the old
 * `rolloutMode` top-level switch.
 *
 * - `heuristic`: direct state evaluation, no simulation (formerly `direct`).
 * - `rollout`: run a rollout simulation with the specified policy.
 * - `auto`: choose heuristic or rollout based on measured transition cost.
 */
export type LeafEvaluator =
  | { readonly type: 'heuristic' }
  | {
      readonly type: 'rollout';
      readonly maxSimulationDepth: number;
      readonly policy: RolloutPolicy;
      readonly epsilon?: number;
      readonly candidateSample?: number;
      readonly mastWarmUpThreshold?: number;
      readonly templateCompletionsPerVisit?: number;
      /** Rollout sub-mode: 'full' (legacy) or 'hybrid' (cutoff). */
      readonly mode?: 'full' | 'hybrid';
      /** Maximum plies for hybrid cutoff simulation. */
      readonly hybridCutoffDepth?: number;
    }
  | { readonly type: 'auto' };

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

  /** Temperature for transforming evaluateState() outputs into [0,1] utilities. */
  readonly heuristicTemperature: number;

  /** Restricted solver support only. */
  readonly solverMode: SolverMode;

  /**
   * Leaf evaluation strategy. Defaults to `{ type: 'heuristic' }`.
   * Rollout-specific knobs (policy, epsilon, candidateSample, etc.) live
   * under the `{ type: 'rollout' }` variant.
   */
  readonly leafEvaluator?: LeafEvaluator;

  /** Compress forced sequences (exactly one legal candidate) during selection and simulation. */
  readonly compressForcedSequences?: boolean;

  /** Enable per-search state-info cache for terminalResult/legalMoves/rewards. */
  readonly enableStateInfoCache?: boolean;

  /** Max entries in the state-info cache. Defaults to min(pool.capacity, iterations * 4). */
  readonly maxStateInfoCacheEntries?: number;

  /** Hoeffding-bound delta for confidence-based root stopping. Must be in (0, 1). */
  readonly rootStopConfidenceDelta?: number;

  /** Minimum visits per child before confidence stop is considered. Must be a positive integer. */
  readonly rootStopMinVisits?: number;

  /** Blending weight for heuristic backup in selection.  0 = pure MC (default). */
  readonly heuristicBackupAlpha?: number;

  /** Threshold for bypassing progressive widening at decision nodes. Default 12. */
  readonly decisionWideningCap?: number;

  /** Pool sizing multiplier for decision subtrees. Default 4. Must be >= 1. */
  readonly decisionDepthMultiplier?: number;

  /** Optional search observer for real-time event callbacks. Not validated or frozen. */
  readonly visitor?: MctsSearchVisitor;

  /**
   * Classification policy for move availability checking.
   * - `'auto'`: choose exhaustive or lazy based on branching factor (default).
   * - `'exhaustive'`: full classification sweep (backward compat).
   * - `'lazy'`: incremental per-move classification.
   */
  readonly classificationPolicy?: ClassificationPolicy;

  /**
   * Widening mode for expansion (spec section 3.7).
   * - `'move'`: ordinary move-level progressive widening (default).
   * - `'familyThenMove'`: widen over action families first at depth 0-1,
   *   then over concrete variants within each family.
   */
  readonly wideningMode?: WideningMode;

  /**
   * Cap on concrete siblings per family before all families have at least
   * one child. Only applies when `wideningMode === 'familyThenMove'`.
   * Default: 1.
   */
  readonly maxVariantsPerFamilyBeforeCoverage?: number;

  /**
   * Maximum candidates evaluated with one-step applyMove+evaluate during
   * lazy expansion. When branching is high, only this many frontier
   * candidates pay for the expensive one-step evaluation. Default 4.
   */
  readonly expansionShortlistSize?: number;

  /**
   * Candidate count threshold below which expansion falls back to the
   * exhaustive path (classify all, evaluate all, pick best). Default 10.
   */
  readonly expansionExhaustiveThreshold?: number;

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
  heuristicTemperature: 10_000,
  solverMode: 'off' as const,
  leafEvaluator: Object.freeze({ type: 'heuristic' as const }),
  compressForcedSequences: true,
  rootStopConfidenceDelta: 1e-3,
  rootStopMinVisits: 16,
  decisionWideningCap: 12,
  decisionDepthMultiplier: 4,
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
export type MctsPreset = 'fast' | 'default' | 'strong' | 'background';

/**
 * Named config partials keyed by preset name.
 * `default` is an empty partial — it resolves to `DEFAULT_MCTS_CONFIG`.
 *
 * All presets use `leafEvaluator: { type: 'heuristic' }` — rollout-phase
 * materialization was the dominant cost (~93.8% of total time) and
 * heuristic (direct) evaluation eliminates it.
 */
export const MCTS_PRESETS: Readonly<Record<MctsPreset, Partial<MctsConfig>>> = Object.freeze({
  fast: Object.freeze({ iterations: 200, maxSimulationDepth: 16, timeLimitMs: 2_000, leafEvaluator: Object.freeze({ type: 'heuristic' as const }), decisionWideningCap: 8, decisionDepthMultiplier: 2 }),
  default: Object.freeze({ timeLimitMs: 10_000, leafEvaluator: Object.freeze({ type: 'heuristic' as const }), decisionWideningCap: 12, decisionDepthMultiplier: 4 }),
  strong: Object.freeze({ iterations: 5000, maxSimulationDepth: 64, timeLimitMs: 30_000, leafEvaluator: Object.freeze({ type: 'heuristic' as const }), decisionWideningCap: 20, decisionDepthMultiplier: 6 }),
  background: Object.freeze({
    iterations: 200,
    minIterations: 10,
    leafEvaluator: Object.freeze({ type: 'heuristic' as const }),
    timeLimitMs: 30_000,
    heuristicBackupAlpha: 0.4,
    progressiveWideningK: 1.5,
    progressiveWideningAlpha: 0.5,
    decisionWideningCap: 8,
    decisionDepthMultiplier: 2,
    rootStopMinVisits: 5,
  }),
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

  // Positive reals
  assertPositive('explorationConstant', merged.explorationConstant);
  assertPositive('progressiveWideningK', merged.progressiveWideningK);
  assertPositive('heuristicTemperature', merged.heuristicTemperature);

  // Bounded reals
  assertRange('progressiveWideningAlpha', merged.progressiveWideningAlpha, 0, 1);

  // Enums
  assertOneOf('solverMode', merged.solverMode, SOLVER_MODES);

  // LeafEvaluator validation
  const evaluator = merged.leafEvaluator ?? { type: 'heuristic' as const };
  assertOneOf('leafEvaluator.type', evaluator.type, LEAF_EVALUATOR_TYPES);

  if (evaluator.type === 'rollout') {
    assertPositiveInt('leafEvaluator.maxSimulationDepth', evaluator.maxSimulationDepth);
    assertOneOf('leafEvaluator.policy', evaluator.policy, ROLLOUT_POLICIES);
    if (evaluator.epsilon !== undefined) {
      assertRange('leafEvaluator.epsilon', evaluator.epsilon, 0, 1);
    }
    if (evaluator.candidateSample !== undefined) {
      assertPositiveInt('leafEvaluator.candidateSample', evaluator.candidateSample);
    }
    if (evaluator.mastWarmUpThreshold !== undefined) {
      assertNonNegativeInt('leafEvaluator.mastWarmUpThreshold', evaluator.mastWarmUpThreshold);
    }
    if (evaluator.templateCompletionsPerVisit !== undefined) {
      assertPositiveInt('leafEvaluator.templateCompletionsPerVisit', evaluator.templateCompletionsPerVisit);
    }
    if (evaluator.hybridCutoffDepth !== undefined) {
      assertPositiveInt('leafEvaluator.hybridCutoffDepth', evaluator.hybridCutoffDepth);
    }
    if (evaluator.mode !== undefined) {
      assertOneOf('leafEvaluator.mode', evaluator.mode, ['full', 'hybrid'] as const);
    }
  }

  // Optional wall-clock
  if (merged.timeLimitMs !== undefined) {
    assertPositive('timeLimitMs', merged.timeLimitMs);
  }

  // State-info cache
  if (merged.maxStateInfoCacheEntries !== undefined) {
    assertPositiveInt('maxStateInfoCacheEntries', merged.maxStateInfoCacheEntries);
  }

  // Confidence-based root stopping
  if (merged.rootStopConfidenceDelta !== undefined) {
    if (
      !Number.isFinite(merged.rootStopConfidenceDelta) ||
      merged.rootStopConfidenceDelta <= 0 ||
      merged.rootStopConfidenceDelta >= 1
    ) {
      throw new RangeError(
        `MctsConfig.rootStopConfidenceDelta must be in (0, 1), got ${merged.rootStopConfidenceDelta}`,
      );
    }
  }
  if (merged.rootStopMinVisits !== undefined) {
    assertPositiveInt('rootStopMinVisits', merged.rootStopMinVisits);
  }

  // Heuristic backup alpha
  if (merged.heuristicBackupAlpha !== undefined) {
    assertRange('heuristicBackupAlpha', merged.heuristicBackupAlpha, 0, 1);
  }

  // Decision widening cap
  if (merged.decisionWideningCap !== undefined) {
    assertPositiveInt('decisionWideningCap', merged.decisionWideningCap);
  }

  // Decision depth multiplier
  if (merged.decisionDepthMultiplier !== undefined) {
    assertPositiveInt('decisionDepthMultiplier', merged.decisionDepthMultiplier);
  }

  // Classification policy
  if (merged.classificationPolicy !== undefined) {
    assertOneOf('classificationPolicy', merged.classificationPolicy, CLASSIFICATION_POLICIES);
  }

  // Widening mode
  if (merged.wideningMode !== undefined) {
    assertOneOf('wideningMode', merged.wideningMode, WIDENING_MODES);
  }

  // Max variants per family before coverage
  if (merged.maxVariantsPerFamilyBeforeCoverage !== undefined) {
    assertPositiveInt('maxVariantsPerFamilyBeforeCoverage', merged.maxVariantsPerFamilyBeforeCoverage);
  }

  // Expansion shortlist size
  if (merged.expansionShortlistSize !== undefined) {
    assertPositiveInt('expansionShortlistSize', merged.expansionShortlistSize);
  }

  // Expansion exhaustive threshold
  if (merged.expansionExhaustiveThreshold !== undefined) {
    assertPositiveInt('expansionExhaustiveThreshold', merged.expansionExhaustiveThreshold);
  }

  // visitor: pass through without validation (callback, not tuneable).

  return Object.freeze(merged);
}

/**
 * Resolve a named preset into a fully validated, immutable `MctsConfig`.
 */
export function resolvePreset(preset: MctsPreset): MctsConfig {
  return validateMctsConfig(MCTS_PRESETS[preset]);
}
