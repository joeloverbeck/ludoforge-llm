import {
  applyMove as engineApplyMove,
  assertValidatedGameDefInput,
  createGameDefRuntime,
  describeAction as engineDescribeAction,
  initialState,
  terminalResult,
} from '@ludoforge/engine/runtime';
import { advanceAutoresolvable as engineAdvanceAutoresolvable } from '../../../engine/src/kernel/microturn/advance.js';
import { applyDecision as engineApplyDecision } from '../../../engine/src/kernel/microturn/apply.js';
import { publishMicroturn as enginePublishMicroturn } from '../../../engine/src/kernel/microturn/publish.js';
import type {
  AdvanceAutoresolvableResult,
  ApplyDecisionResult,
  MicroturnState,
  TurnId,
} from '../../../engine/src/kernel/microturn/types.js';

import type {
  AnnotatedActionDescription,
  AnnotationContext,
  EffectTraceEntry,
  ExecutionOptions,
  GameDef,
  GameDefRuntime,
  GameState,
  Move,
  PlayerId,
  TerminalResult,
} from '@ludoforge/engine/runtime';

export interface WorkerError {
  readonly code: 'ILLEGAL_MOVE' | 'VALIDATION_FAILED' | 'NOT_INITIALIZED' | 'INTERNAL_ERROR' | 'STALE_OPERATION';
  readonly message: string;
  readonly details?: unknown;
}

export interface OperationStamp {
  readonly epoch: number;
  readonly token: number;
}

export interface GameMetadata {
  readonly gameId: string;
  readonly playerCount: number;
  readonly phaseNames: readonly string[];
  readonly actionNames: readonly string[];
  readonly zoneNames: readonly string[];
}

export interface BridgeInitOptions {
  readonly playerCount?: number;
  readonly enableTrace?: boolean;
}

export interface InitResult {
  readonly state: GameState;
  readonly setupTrace: readonly EffectTraceEntry[];
}

export interface GameWorkerAPI {
  init(nextDef: GameDef, seed: number, options: BridgeInitOptions | undefined, stamp: OperationStamp): Promise<InitResult>;
  publishMicroturn(): Promise<MicroturnState>;
  applyDecision(
    decision: MicroturnState['legalActions'][number],
    options: { readonly trace?: boolean } | undefined,
    stamp: OperationStamp,
  ): Promise<ApplyDecisionResult>;
  advanceAutoresolvable(
    options: { readonly trace?: boolean } | undefined,
    stamp: OperationStamp,
  ): Promise<AdvanceAutoresolvableResult>;
  applyReplayMove(
    move: Move,
    options: { readonly trace?: boolean } | undefined,
    stamp: OperationStamp,
  ): Promise<{
    readonly state: GameState;
    readonly triggerFirings: ApplyDecisionResult['triggerFirings'];
    readonly warnings: ApplyDecisionResult['warnings'];
    readonly effectTrace?: ApplyDecisionResult['effectTrace'];
    readonly conditionTrace?: ApplyDecisionResult['conditionTrace'];
    readonly decisionTrace?: ApplyDecisionResult['decisionTrace'];
    readonly selectorTrace?: ApplyDecisionResult['selectorTrace'];
  }>;
  playSequence(
    moves: readonly Move[],
    options: { readonly trace?: boolean } | undefined,
    stamp: OperationStamp,
    onStep?: (result: Awaited<ReturnType<GameWorkerAPI['applyReplayMove']>>, moveIndex: number) => void,
  ): Promise<readonly Awaited<ReturnType<GameWorkerAPI['applyReplayMove']>>[]>;
  rewindToTurnBoundary(turnId: TurnId, stamp: OperationStamp): Promise<GameState | null>;
  describeAction(actionId: string, context?: { readonly actorPlayer?: number }): Promise<AnnotatedActionDescription | null>;
  terminalResult(): Promise<TerminalResult | null>;
  getState(): Promise<GameState>;
  getMetadata(): Promise<GameMetadata>;
  getHistoryLength(): Promise<number>;
  undo(stamp: OperationStamp): Promise<GameState | null>;
  reset(nextDef: GameDef | undefined, seed: number | undefined, options: BridgeInitOptions | undefined, stamp: OperationStamp): Promise<InitResult>;
  loadFromUrl(url: string, seed: number, options: BridgeInitOptions | undefined, stamp: OperationStamp): Promise<InitResult>;
}

const isWorkerErrorCode = (value: unknown): value is WorkerError['code'] => {
  return value === 'ILLEGAL_MOVE'
    || value === 'VALIDATION_FAILED'
    || value === 'NOT_INITIALIZED'
    || value === 'INTERNAL_ERROR'
    || value === 'STALE_OPERATION';
};

const isWorkerError = (error: unknown): error is WorkerError => {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const code = Reflect.get(error, 'code');
  const message = Reflect.get(error, 'message');
  return isWorkerErrorCode(code) && typeof message === 'string';
};

const toWorkerError = (code: WorkerError['code'], error: unknown, fallbackMessage: string): WorkerError => {
  if (isWorkerError(error)) {
    const details = Reflect.get(error, 'details');
    return {
      code: error.code,
      message: error.message,
      ...(details === undefined ? {} : { details }),
    };
  }

  if (error instanceof Error) {
    return {
      code,
      message: error.message,
      details: {
        name: error.name,
        stack: error.stack,
      },
    };
  }

  if (typeof error === 'string') {
    return {
      code,
      message: error,
    };
  }

  if (typeof error === 'object' && error !== null) {
    const message = Reflect.get(error, 'message');
    const details = Reflect.get(error, 'details');
    if (typeof message === 'string') {
      return {
        code,
        message,
        ...(details === undefined ? {} : { details }),
      };
    }
  }

  return {
    code,
    message: fallbackMessage,
    ...(error === undefined ? {} : { details: error }),
  };
};

const assertInitialized = (
  def: GameDef | null,
  state: GameState | null,
): { readonly def: GameDef; readonly state: GameState } => {
  if (def === null || state === null) {
    throw toWorkerError('NOT_INITIALIZED', undefined, 'Worker is not initialized. Call init() first.');
  }
  return { def, state };
};

const withInternalErrorMapping = async <T>(run: () => T | Promise<T>): Promise<T> => {
  try {
    return await run();
  } catch (error) {
    throw toWorkerError('INTERNAL_ERROR', error, 'Unexpected worker error.');
  }
};

const withIllegalMoveMapping = async <T>(run: () => T | Promise<T>): Promise<T> => {
  try {
    return await run();
  } catch (error) {
    throw toWorkerError('ILLEGAL_MOVE', error, 'Illegal move.');
  }
};

const withValidationFailureMapping = async <T>(run: () => Promise<T>): Promise<T> => {
  try {
    return await run();
  } catch (error) {
    throw toWorkerError('VALIDATION_FAILED', error, 'GameDef validation failed.');
  }
};

const isTurnBoundaryState = (state: GameState, turnId: TurnId): boolean =>
  (state.decisionStack?.length ?? 0) === 0
  && state.nextTurnId === turnId;

export function createGameWorker(): GameWorkerAPI {
  let def: GameDef | null = null;
  let state: GameState | null = null;
  let runtime: GameDefRuntime | null = null;
  let history: GameState[] = [];
  let enableTrace = true;
  let latestMutationStamp: OperationStamp | null = null;

  const compareOperationStamp = (left: OperationStamp, right: OperationStamp): number => {
    if (left.epoch !== right.epoch) {
      return left.epoch - right.epoch;
    }
    return left.token - right.token;
  };

  const ensureFreshMutation = (stamp: OperationStamp): void => {
    if (latestMutationStamp !== null && compareOperationStamp(stamp, latestMutationStamp) <= 0) {
      throw toWorkerError('STALE_OPERATION', undefined, 'Mutation rejected because a newer operation already executed.');
    }
    latestMutationStamp = stamp;
  };

  const initState = (nextDef: GameDef, seed: number, options?: BridgeInitOptions): InitResult => {
    const traceEnabled = options?.enableTrace ?? true;
    const nextRuntime = createGameDefRuntime(nextDef);
    const nextInit = initialState(nextDef, seed, options?.playerCount, { trace: traceEnabled });

    def = nextDef;
    runtime = nextRuntime;
    state = nextInit.state;
    history = [];
    enableTrace = traceEnabled;
    return { state: nextInit.state, setupTrace: nextInit.setupTrace };
  };

  const applyReplayMove = (
    currentDef: GameDef,
    currentState: GameState,
    move: Move,
    options: { readonly trace?: boolean } | undefined,
  ): Awaited<ReturnType<GameWorkerAPI['applyReplayMove']>> => {
    history.push(currentState);
    try {
      const executionOptions: ExecutionOptions = {
        trace: options?.trace ?? enableTrace,
      };
      const result = engineApplyMove(currentDef, currentState, move, executionOptions, runtime ?? undefined);
      state = result.state;
      return result;
    } catch (error) {
      history.pop();
      throw error;
    }
  };

  const applyDecision = (
    currentDef: GameDef,
    currentState: GameState,
    decision: MicroturnState['legalActions'][number],
    options: { readonly trace?: boolean } | undefined,
  ): ApplyDecisionResult => {
    history.push(currentState);
    try {
      const executionOptions: ExecutionOptions = {
        trace: options?.trace ?? enableTrace,
      };
      const result = engineApplyDecision(currentDef, currentState, decision, executionOptions, runtime ?? undefined);
      state = result.state;
      return result;
    } catch (error) {
      history.pop();
      throw error;
    }
  };

  const advanceAutoresolvable = (
    currentDef: GameDef,
    currentState: GameState,
    _options: { readonly trace?: boolean } | undefined,
  ): AdvanceAutoresolvableResult => {
    history.push(currentState);
    try {
      const result = engineAdvanceAutoresolvable(currentDef, currentState, { state: currentState.rng }, runtime ?? undefined);
      state = result.state;
      return result;
    } catch (error) {
      history.pop();
      throw error;
    }
  };

  const api: GameWorkerAPI = {
    async init(nextDef, seed, options, stamp): Promise<InitResult> {
      return withInternalErrorMapping(() => {
        ensureFreshMutation(stamp);
        return initState(nextDef, seed, options);
      });
    },

    async publishMicroturn(): Promise<MicroturnState> {
      return withInternalErrorMapping(() => {
        const current = assertInitialized(def, state);
        return enginePublishMicroturn(current.def, current.state, runtime ?? undefined);
      });
    },

    async applyDecision(decision, options, stamp): Promise<ApplyDecisionResult> {
      const current = assertInitialized(def, state);
      ensureFreshMutation(stamp);
      return withIllegalMoveMapping(() => applyDecision(current.def, current.state, decision, options));
    },

    async advanceAutoresolvable(options, stamp): Promise<AdvanceAutoresolvableResult> {
      const current = assertInitialized(def, state);
      ensureFreshMutation(stamp);
      return withIllegalMoveMapping(() => advanceAutoresolvable(current.def, current.state, options));
    },

    async applyReplayMove(move, options, stamp): Promise<Awaited<ReturnType<GameWorkerAPI['applyReplayMove']>>> {
      const current = assertInitialized(def, state);
      ensureFreshMutation(stamp);
      return withIllegalMoveMapping(() => applyReplayMove(current.def, current.state, move, options));
    },

    async playSequence(moves, options, stamp, onStep) {
      const current = assertInitialized(def, state);
      ensureFreshMutation(stamp);
      return withIllegalMoveMapping(async () => {
        const results = [];
        let replayState = current.state;
        for (let index = 0; index < moves.length; index += 1) {
          const result = applyReplayMove(current.def, replayState, moves[index]!, options);
          replayState = result.state;
          results.push(result);
          onStep?.(result, index);
        }
        return results;
      });
    },

    async rewindToTurnBoundary(turnId, stamp) {
      ensureFreshMutation(stamp);
      return withInternalErrorMapping(() => {
        const current = assertInitialized(def, state);
        const currentWithPresent = [current.state, ...history.slice().reverse()];
        const matchIndex = currentWithPresent.findIndex((candidate) => isTurnBoundaryState(candidate, turnId));
        if (matchIndex < 0) {
          return null;
        }
        const matched = currentWithPresent[matchIndex]!;
        const retainedHistory = currentWithPresent
          .slice(matchIndex + 1)
          .reverse();
        history = retainedHistory;
        state = matched;
        return matched;
      });
    },

    async describeAction(actionId, callerContext) {
      return withInternalErrorMapping(() => {
        const current = assertInitialized(def, state);
        const actionDef = current.def.actions.find((action) => String(action.id) === actionId);
        if (actionDef === undefined) {
          return null;
        }
        const currentRuntime = runtime ?? createGameDefRuntime(current.def);
        const actorPlayer = callerContext?.actorPlayer != null
          ? (callerContext.actorPlayer as PlayerId)
          : current.state.activePlayer;
        const context: AnnotationContext = {
          def: current.def,
          state: current.state,
          activePlayer: current.state.activePlayer,
          actorPlayer,
          runtime: currentRuntime,
        };
        return engineDescribeAction(actionDef, context);
      });
    },

    async terminalResult() {
      return withInternalErrorMapping(() => {
        const current = assertInitialized(def, state);
        return terminalResult(current.def, current.state);
      });
    },

    async getState() {
      return withInternalErrorMapping(() => {
        const current = assertInitialized(def, state);
        return current.state;
      });
    },

    async getMetadata() {
      return withInternalErrorMapping(() => {
        const current = assertInitialized(def, state);
        return {
          gameId: current.def.metadata.id,
          playerCount: current.state.playerCount,
          phaseNames: current.def.turnStructure.phases.map((phase) => String(phase.id)),
          actionNames: current.def.actions.map((action) => String(action.id)),
          zoneNames: current.def.zones.map((zone) => String(zone.id)),
        };
      });
    },

    async getHistoryLength() {
      return history.length;
    },

    async undo(stamp) {
      ensureFreshMutation(stamp);
      if (history.length === 0) {
        return null;
      }
      state = history.pop() ?? null;
      return state;
    },

    async reset(nextDef, seed, options, stamp) {
      return withInternalErrorMapping(() => {
        ensureFreshMutation(stamp);
        const resolvedDef = nextDef ?? def;
        if (resolvedDef === null) {
          throw toWorkerError('NOT_INITIALIZED', undefined, 'No GameDef available. Provide one or call init() first.');
        }
        return initState(resolvedDef, seed ?? 0, options);
      });
    },

    async loadFromUrl(url, seed, options, stamp) {
      ensureFreshMutation(stamp);
      return withValidationFailureMapping(async () => {
        const response = await fetch(url);
        if (!response.ok) {
          throw {
            message: `Failed to fetch GameDef: ${response.status} ${response.statusText}`.trim(),
            details: {
              url,
              status: response.status,
              statusText: response.statusText,
            },
          };
        }

        const parsed = await response.json();
        const nextDef = assertValidatedGameDefInput(parsed, `URL ${url}`);
        if (latestMutationStamp === null || compareOperationStamp(stamp, latestMutationStamp) !== 0) {
          throw toWorkerError('STALE_OPERATION', undefined, 'Mutation rejected because a newer operation already executed.');
        }
        return initState(nextDef, seed, options);
      });
    },
  };

  return api;
}
