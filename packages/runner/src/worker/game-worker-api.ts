import {
  applyMove,
  assertValidatedGameDefInput,
  enumerateLegalMoves,
  initialState,
  legalChoices,
  legalMoves,
  terminalResult,
} from '@ludoforge/engine/runtime';

import type {
  ApplyMoveResult,
  ChoiceRequest,
  ExecutionOptions,
  GameDef,
  GameState,
  LegalChoicesOptions,
  LegalMoveEnumerationOptions,
  LegalMoveEnumerationResult,
  Move,
  TerminalResult,
} from '@ludoforge/engine/runtime';

export interface WorkerError {
  readonly code: 'ILLEGAL_MOVE' | 'VALIDATION_FAILED' | 'NOT_INITIALIZED' | 'INTERNAL_ERROR';
  readonly message: string;
  readonly details?: unknown;
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

export interface GameWorkerAPI {
  init(nextDef: GameDef, seed: number, options?: BridgeInitOptions): Promise<GameState>;
  legalMoves(options?: LegalMoveEnumerationOptions): Promise<readonly Move[]>;
  enumerateLegalMoves(options?: LegalMoveEnumerationOptions): Promise<LegalMoveEnumerationResult>;
  legalChoices(partialMove: Move, options?: LegalChoicesOptions): Promise<ChoiceRequest>;
  applyMove(move: Move, options?: { readonly trace?: boolean }): Promise<ApplyMoveResult>;
  playSequence(
    moves: readonly Move[],
    onStep?: (result: ApplyMoveResult, moveIndex: number) => void,
  ): Promise<readonly ApplyMoveResult[]>;
  terminalResult(): Promise<TerminalResult | null>;
  getState(): Promise<GameState>;
  getMetadata(): Promise<GameMetadata>;
  getHistoryLength(): Promise<number>;
  undo(): Promise<GameState | null>;
  reset(nextDef?: GameDef, seed?: number, options?: BridgeInitOptions): Promise<GameState>;
  loadFromUrl(url: string, seed: number, options?: BridgeInitOptions): Promise<GameState>;
}

const isWorkerErrorCode = (value: unknown): value is WorkerError['code'] => {
  return value === 'ILLEGAL_MOVE'
    || value === 'VALIDATION_FAILED'
    || value === 'NOT_INITIALIZED'
    || value === 'INTERNAL_ERROR';
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
    return error;
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

export function createGameWorker(): GameWorkerAPI {
  let def: GameDef | null = null;
  let state: GameState | null = null;
  let history: GameState[] = [];
  let enableTrace = true;

  const api: GameWorkerAPI = {
    async init(nextDef: GameDef, seed: number, options?: BridgeInitOptions): Promise<GameState> {
      return withInternalErrorMapping(() => {
        def = nextDef;
        state = initialState(nextDef, seed, options?.playerCount);
        history = [];
        enableTrace = options?.enableTrace ?? true;
        return state;
      });
    },

    async legalMoves(options?: LegalMoveEnumerationOptions): Promise<readonly Move[]> {
      return withInternalErrorMapping(() => {
        const current = assertInitialized(def, state);
        return legalMoves(current.def, current.state, options);
      });
    },

    async enumerateLegalMoves(options?: LegalMoveEnumerationOptions): Promise<LegalMoveEnumerationResult> {
      return withInternalErrorMapping(() => {
        const current = assertInitialized(def, state);
        return enumerateLegalMoves(current.def, current.state, options);
      });
    },

    async legalChoices(partialMove: Move, options?: LegalChoicesOptions): Promise<ChoiceRequest> {
      return withInternalErrorMapping(() => {
        const current = assertInitialized(def, state);
        return legalChoices(current.def, current.state, partialMove, {
          probeOptionLegality: true,
          ...options,
        });
      });
    },

    async applyMove(move: Move, options?: { readonly trace?: boolean }): Promise<ApplyMoveResult> {
      const current = assertInitialized(def, state);
      history.push(current.state);
      return withIllegalMoveMapping(() => {
        try {
          const executionOptions: ExecutionOptions = {
            trace: options?.trace ?? enableTrace,
          };
          const result = applyMove(current.def, current.state, move, executionOptions);
          state = result.state;
          return result;
        } catch (error) {
          history.pop();
          throw error;
        }
      });
    },

    playSequence(
      moves: readonly Move[],
      onStep?: (result: ApplyMoveResult, moveIndex: number) => void,
    ): Promise<readonly ApplyMoveResult[]> {
      const current = assertInitialized(def, state);
      const results: ApplyMoveResult[] = [];

      return withIllegalMoveMapping(() => {
        for (let index = 0; index < moves.length; index += 1) {
          const currentState = state;
          if (currentState === null) {
            throw toWorkerError('NOT_INITIALIZED', undefined, 'Worker is not initialized. Call init() first.');
          }
          history.push(currentState);

          try {
            const executionOptions: ExecutionOptions = { trace: enableTrace };
            const result = applyMove(current.def, currentState, moves[index]!, executionOptions);
            state = result.state;
            results.push(result);
            onStep?.(result, index);
          } catch (error) {
            history.pop();
            throw error;
          }
        }

        return results;
      });
    },

    async terminalResult(): Promise<TerminalResult | null> {
      return withInternalErrorMapping(() => {
        const current = assertInitialized(def, state);
        return terminalResult(current.def, current.state);
      });
    },

    async getState(): Promise<GameState> {
      return withInternalErrorMapping(() => {
        const current = assertInitialized(def, state);
        return current.state;
      });
    },

    async getMetadata(): Promise<GameMetadata> {
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

    async getHistoryLength(): Promise<number> {
      return history.length;
    },

    async undo(): Promise<GameState | null> {
      if (history.length === 0) {
        return null;
      }
      state = history.pop() ?? null;
      return state;
    },

    async reset(nextDef?: GameDef, seed?: number, options?: BridgeInitOptions): Promise<GameState> {
      const resolvedDef = nextDef ?? def;
      if (resolvedDef === null) {
        throw toWorkerError('NOT_INITIALIZED', undefined, 'No GameDef available. Provide one or call init() first.');
      }
      const resolvedSeed = seed ?? 0;
      return await api.init(resolvedDef, resolvedSeed, options);
    },

    async loadFromUrl(url: string, seed: number, options?: BridgeInitOptions): Promise<GameState> {
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

        return api.init(nextDef, seed, options);
      });
    },
  };

  return api;
}
