import {
  advancePhase,
  applyMove,
  legalMoves,
  canonicalMoveParamsKey,
  type ExecutionOptions,
  type GameDef,
  type GameState,
  type Move,
  type TriggerLogEntry,
} from '../../src/kernel/index.js';

export interface ReplayScriptStep {
  readonly move: Move;
  readonly expectedStateHash?: bigint;
  readonly expectedLegalCount?: number;
}

export interface ReplayExecutedStep {
  readonly before: GameState;
  readonly legal: readonly Move[];
  readonly move: Move;
  readonly after: GameState;
}

export interface ReplayStepAssertContext {
  readonly stepIndex: number;
  readonly step: ReplayScriptStep;
  readonly executed: ReplayExecutedStep;
}

export interface ReplayScriptConfig {
  readonly def: GameDef;
  readonly initialState: GameState;
  readonly script: readonly ReplayScriptStep[];
  readonly executionOptions?: ExecutionOptions;
  readonly legalityMode?: 'exactMove' | 'actionId';
  readonly keyVars?: readonly string[];
  readonly assertStep?: (context: ReplayStepAssertContext) => void;
}

export interface ReplayScriptResult {
  readonly initial: GameState;
  readonly final: GameState;
  readonly steps: readonly ReplayExecutedStep[];
}

export interface BoundedAdvanceConfig {
  readonly def: GameDef;
  readonly initialState: GameState;
  readonly until: (state: GameState) => boolean;
  readonly maxSteps: number;
  readonly triggerLogCollector?: TriggerLogEntry[];
  readonly keyVars?: readonly string[];
}

export interface BoundedAdvanceResult {
  readonly state: GameState;
  readonly steps: number;
}

const moveKey = (move: Move): string => `${String(move.actionId)} ${canonicalMoveParamsKey(move.params)}`;

const formatKeyVars = (state: GameState, keys: readonly string[] | undefined): string => {
  if (keys === undefined || keys.length === 0) {
    return '{}';
  }

  const values = Object.fromEntries(keys.map((key) => [key, state.globalVars[key] ?? null]));
  return JSON.stringify(values);
};

const formatReplayContext = (
  state: GameState,
  stepIndex: number,
  move: Move,
  keys: readonly string[] | undefined,
): string =>
  `step=${stepIndex} move=${moveKey(move)} phase=${String(state.currentPhase)} activePlayer=${String(state.activePlayer)} keyVars=${formatKeyVars(state, keys)}`;

export const replayScript = (config: ReplayScriptConfig): ReplayScriptResult => {
  const legalityMode = config.legalityMode ?? 'exactMove';
  let state = config.initialState;
  const steps: ReplayExecutedStep[] = [];

  for (let stepIndex = 0; stepIndex < config.script.length; stepIndex += 1) {
    const step = config.script[stepIndex]!;
    const legal = legalMoves(config.def, state);
    const before = state;

    const legalMatch =
      legalityMode === 'actionId'
        ? legal.some((move) => String(move.actionId) === String(step.move.actionId))
        : legal.some((move) => moveKey(move) === moveKey(step.move));
    if (!legalMatch) {
      throw new Error(
        `Replay illegal move at ${formatReplayContext(before, stepIndex, step.move, config.keyVars)} legal=${legal.map(moveKey).join(' | ')}`,
      );
    }

    const applied = applyMove(config.def, state, step.move, config.executionOptions);
    const executed: ReplayExecutedStep = {
      before,
      legal,
      move: step.move,
      after: applied.state,
    };

    if (step.expectedStateHash !== undefined && applied.state.stateHash !== step.expectedStateHash) {
      throw new Error(
        `Replay state hash mismatch at ${formatReplayContext(before, stepIndex, step.move, config.keyVars)} expected=${String(step.expectedStateHash)} actual=${String(applied.state.stateHash)}`,
      );
    }

    if (step.expectedLegalCount !== undefined && legal.length !== step.expectedLegalCount) {
      throw new Error(
        `Replay legal move count mismatch at ${formatReplayContext(before, stepIndex, step.move, config.keyVars)} expected=${step.expectedLegalCount} actual=${legal.length}`,
      );
    }

    if (config.assertStep !== undefined) {
      try {
        config.assertStep({ stepIndex, step, executed });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Replay step assertion failed at ${formatReplayContext(before, stepIndex, step.move, config.keyVars)}: ${message}`);
      }
    }

    steps.push(executed);
    state = applied.state;
  }

  return {
    initial: config.initialState,
    final: state,
    steps,
  };
};

export const advancePhaseBounded = (config: BoundedAdvanceConfig): BoundedAdvanceResult => {
  if (!Number.isSafeInteger(config.maxSteps) || config.maxSteps < 0) {
    throw new RangeError(`maxSteps must be a non-negative safe integer, received ${String(config.maxSteps)}`);
  }

  let state = config.initialState;
  let steps = 0;

  while (!config.until(state)) {
    if (steps >= config.maxSteps) {
      throw new Error(
        `Bounded phase advance exhausted maxSteps=${config.maxSteps} phase=${String(state.currentPhase)} activePlayer=${String(state.activePlayer)} keyVars=${formatKeyVars(state, config.keyVars)}`,
      );
    }
    state = advancePhase(config.def, state, config.triggerLogCollector);
    steps += 1;
  }

  return { state, steps };
};
