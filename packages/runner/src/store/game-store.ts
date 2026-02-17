import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type {
  ActionId,
  ChoiceIllegalRequest,
  ChoicePendingRequest,
  EffectTraceEntry,
  GameDef,
  GameState,
  LegalMoveEnumerationResult,
  Move,
  MoveParamValue,
  PlayerId,
  TerminalResult,
  TriggerLogEntry,
} from '@ludoforge/engine';
import { asPlayerId } from '@ludoforge/engine';

import { deriveRenderModel } from '../model/derive-render-model.js';
import type { RenderModel } from '../model/render-model.js';
import type { PartialChoice, PlayerSeat, RenderContext } from './store-types.js';
import type { GameWorkerAPI, WorkerError } from '../worker/game-worker-api.js';

type GameLifecycle = 'idle' | 'initializing' | 'playing' | 'terminal';

interface GameStoreState {
  readonly gameDef: GameDef | null;
  readonly gameState: GameState | null;
  readonly playerID: PlayerId | null;
  readonly gameLifecycle: GameLifecycle;
  readonly loading: boolean;
  readonly error: WorkerError | null;
  readonly legalMoveResult: LegalMoveEnumerationResult | null;
  readonly choicePending: ChoicePendingRequest | null;
  readonly effectTrace: readonly EffectTraceEntry[];
  readonly triggerFirings: readonly TriggerLogEntry[];
  readonly terminal: TerminalResult | null;
  readonly selectedAction: ActionId | null;
  readonly partialMove: Move | null;
  readonly choiceStack: readonly PartialChoice[];
  readonly animationPlaying: boolean;
  readonly playerSeats: ReadonlyMap<PlayerId, PlayerSeat>;
  readonly renderModel: RenderModel | null;
}

interface GameStoreActions {
  initGame(def: GameDef, seed: number, playerID: PlayerId): void;
  selectAction(actionId: ActionId): void;
  makeChoice(choice: MoveParamValue): void;
  confirmMove(): void;
  cancelChoice(): void;
  cancelMove(): void;
  undo(): void;
  setAnimationPlaying(playing: boolean): void;
  clearError(): void;
}

export type GameStore = GameStoreState & GameStoreActions;

interface RenderDerivationInputs {
  readonly gameDef: GameDef | null;
  readonly gameState: GameState | null;
  readonly playerID: PlayerId | null;
  readonly legalMoveResult: LegalMoveEnumerationResult | null;
  readonly choicePending: ChoicePendingRequest | null;
  readonly selectedAction: ActionId | null;
  readonly choiceStack: readonly PartialChoice[];
  readonly playerSeats: ReadonlyMap<PlayerId, PlayerSeat>;
  readonly terminal: TerminalResult | null;
}

interface MutationTransitionInputs {
  readonly gameState: GameState;
  readonly legalMoveResult: LegalMoveEnumerationResult;
  readonly terminal: TerminalResult | null;
}

const WORKER_ERROR_CODES: readonly WorkerError['code'][] = [
  'ILLEGAL_MOVE',
  'VALIDATION_FAILED',
  'NOT_INITIALIZED',
  'INTERNAL_ERROR',
];

const INITIAL_STATE: Omit<GameStoreState, 'playerSeats'> = {
  gameDef: null,
  gameState: null,
  playerID: null,
  gameLifecycle: 'idle',
  loading: false,
  error: null,
  legalMoveResult: null,
  choicePending: null,
  effectTrace: [],
  triggerFirings: [],
  terminal: null,
  selectedAction: null,
  partialMove: null,
  choiceStack: [],
  animationPlaying: false,
  renderModel: null,
};

function resetSessionState(): Pick<
  GameStoreState,
  | 'gameDef'
  | 'gameState'
  | 'playerID'
  | 'legalMoveResult'
  | 'choicePending'
  | 'effectTrace'
  | 'triggerFirings'
  | 'terminal'
  | 'selectedAction'
  | 'partialMove'
  | 'choiceStack'
  | 'playerSeats'
> {
  return {
    gameDef: null,
    gameState: null,
    playerID: null,
    legalMoveResult: null,
    choicePending: null,
    effectTrace: [],
    triggerFirings: [],
    terminal: null,
    selectedAction: null,
    partialMove: null,
    choiceStack: [],
    playerSeats: new Map<PlayerId, PlayerSeat>(),
  };
}

function buildInitSuccessState(
  def: GameDef,
  gameState: GameState,
  playerID: PlayerId,
  legalMoveResult: LegalMoveEnumerationResult,
  terminal: TerminalResult | null,
): Partial<GameStoreState> {
  return {
    gameDef: def,
    gameState,
    playerID,
    legalMoveResult,
    terminal,
    gameLifecycle: toLifecycle(terminal),
    error: null,
    effectTrace: [],
    triggerFirings: [],
    playerSeats: buildPlayerSeats(gameState.playerCount, playerID),
    ...resetMoveConstructionState(),
  };
}

function buildInitFailureState(error: unknown): Partial<GameStoreState> {
  return {
    ...resetSessionState(),
    error: toWorkerError(error),
    gameLifecycle: 'idle',
  };
}

function resetMoveConstructionState(): Pick<GameStoreState, 'selectedAction' | 'partialMove' | 'choiceStack' | 'choicePending'> {
  return {
    selectedAction: null,
    partialMove: null,
    choiceStack: [],
    choicePending: null,
  };
}

function buildStateMutationState(
  gameState: GameState,
  legalMoveResult: LegalMoveEnumerationResult,
  terminal: TerminalResult | null,
  effectTrace: readonly EffectTraceEntry[],
  triggerFirings: readonly TriggerLogEntry[],
): Partial<GameStoreState> {
  return {
    gameState,
    legalMoveResult,
    terminal,
    gameLifecycle: toLifecycle(terminal),
    effectTrace,
    triggerFirings,
    error: null,
    ...resetMoveConstructionState(),
  };
}

function isWorkerError(error: unknown): error is WorkerError {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const code = Reflect.get(error, 'code');
  const message = Reflect.get(error, 'message');
  return typeof message === 'string'
    && typeof code === 'string'
    && WORKER_ERROR_CODES.includes(code as WorkerError['code']);
}

function toWorkerError(error: unknown): WorkerError {
  if (isWorkerError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return {
      code: 'INTERNAL_ERROR',
      message: error.message,
      details: {
        name: error.name,
        stack: error.stack,
      },
    };
  }

  if (typeof error === 'string') {
    return {
      code: 'INTERNAL_ERROR',
      message: error,
    };
  }

  return {
    code: 'INTERNAL_ERROR',
    message: 'Unexpected store error.',
    ...(error === undefined ? {} : { details: error }),
  };
}

function toIllegalChoiceError(request: ChoiceIllegalRequest): WorkerError {
  return {
    code: 'ILLEGAL_MOVE',
    message: `Illegal choice: ${request.reason}`,
    details: request,
  };
}

function toLifecycle(terminal: TerminalResult | null): GameLifecycle {
  return terminal === null ? 'playing' : 'terminal';
}

function buildPlayerSeats(playerCount: number, humanPlayer: PlayerId): ReadonlyMap<PlayerId, PlayerSeat> {
  const seats = new Map<PlayerId, PlayerSeat>();
  for (let player = 0; player < playerCount; player += 1) {
    const id = asPlayerId(player);
    seats.set(id, id === humanPlayer ? 'human' : 'ai-random');
  }
  return seats;
}

function buildMove(actionId: ActionId, choices: readonly PartialChoice[]): Move {
  return {
    actionId,
    params: Object.fromEntries(choices.map((choice) => [choice.name, choice.value])),
  };
}

function toRenderContext(inputs: RenderDerivationInputs): RenderContext | null {
  if (inputs.playerID === null) {
    return null;
  }

  return {
    playerID: inputs.playerID,
    legalMoveResult: inputs.legalMoveResult,
    choicePending: inputs.choicePending,
    selectedAction: inputs.selectedAction,
    choiceStack: inputs.choiceStack,
    playerSeats: inputs.playerSeats,
    terminal: inputs.terminal,
  };
}

function deriveStoreRenderModel(inputs: RenderDerivationInputs): RenderModel | null {
  if (inputs.gameDef === null || inputs.gameState === null) {
    return null;
  }
  const context = toRenderContext(inputs);
  if (context === null) {
    return null;
  }
  return deriveRenderModel(inputs.gameState, inputs.gameDef, context);
}

function toRenderDerivationInputs(store: GameStore, patch: Partial<GameStoreState>): RenderDerivationInputs {
  const fromPatch = <K extends keyof RenderDerivationInputs>(key: K, current: RenderDerivationInputs[K]): RenderDerivationInputs[K] =>
    key in patch ? (patch[key as keyof GameStoreState] as RenderDerivationInputs[K]) : current;

  return {
    gameDef: fromPatch('gameDef', store.gameDef),
    gameState: fromPatch('gameState', store.gameState),
    playerID: fromPatch('playerID', store.playerID),
    legalMoveResult: fromPatch('legalMoveResult', store.legalMoveResult),
    choicePending: fromPatch('choicePending', store.choicePending),
    selectedAction: fromPatch('selectedAction', store.selectedAction),
    choiceStack: fromPatch('choiceStack', store.choiceStack),
    playerSeats: fromPatch('playerSeats', store.playerSeats),
    terminal: fromPatch('terminal', store.terminal),
  };
}

export function createGameStore(bridge: GameWorkerAPI) {
  return create<GameStore>()(
    subscribeWithSelector((set, get) => {
      const setAndDerive = (patch: Partial<GameStoreState>): void => {
        const current = get();
        const inputs = toRenderDerivationInputs(current, patch);
        set({
          ...patch,
          renderModel: deriveStoreRenderModel(inputs),
        });
      };

      const runBridge = (operation: () => void): void => {
        set({ loading: true });
        try {
          operation();
        } catch (error) {
          set({ error: toWorkerError(error) });
        } finally {
          set({ loading: false });
        }
      };

      const deriveMutationInputs = (gameState: GameState): MutationTransitionInputs => {
        const legalMoveResult = bridge.enumerateLegalMoves();
        const terminal = bridge.terminalResult();
        return {
          gameState,
          legalMoveResult,
          terminal,
        };
      };

      return {
        ...INITIAL_STATE,
        playerSeats: new Map<PlayerId, PlayerSeat>(),

        initGame(def, seed, playerID) {
          set({
            gameLifecycle: 'initializing',
            loading: true,
            error: null,
          });

          try {
            const gameState = bridge.init(def, seed);
            const legalMoveResult = bridge.enumerateLegalMoves();
            const terminal = bridge.terminalResult();
            setAndDerive(buildInitSuccessState(def, gameState, playerID, legalMoveResult, terminal));
          } catch (error) {
            setAndDerive(buildInitFailureState(error));
          } finally {
            set({ loading: false });
          }
        },

        selectAction(actionId) {
          runBridge(() => {
            const baseMove: Move = { actionId, params: {} };
            const choiceRequest = bridge.legalChoices(baseMove);
            if (choiceRequest.kind === 'illegal') {
              setAndDerive({
                error: toIllegalChoiceError(choiceRequest),
                ...resetMoveConstructionState(),
              });
              return;
            }

            setAndDerive({
              selectedAction: actionId,
              partialMove: baseMove,
              choiceStack: [],
              choicePending: choiceRequest.kind === 'pending' ? choiceRequest : null,
              error: null,
            });
          });
        },

        makeChoice(choice) {
          runBridge(() => {
            const state = get();
            if (state.selectedAction === null || state.choicePending === null) {
              return;
            }

            const nextChoice: PartialChoice = {
              decisionId: state.choicePending.decisionId,
              name: state.choicePending.name,
              value: choice,
            };
            const nextChoiceStack = [...state.choiceStack, nextChoice];
            const nextMove = buildMove(state.selectedAction, nextChoiceStack);
            const choiceRequest = bridge.legalChoices(nextMove);
            if (choiceRequest.kind === 'illegal') {
              set({ error: toIllegalChoiceError(choiceRequest) });
              return;
            }

            setAndDerive({
              partialMove: nextMove,
              choiceStack: nextChoiceStack,
              choicePending: choiceRequest.kind === 'pending' ? choiceRequest : null,
              error: null,
            });
          });
        },

        confirmMove() {
          runBridge(() => {
            const state = get();
            if (state.partialMove === null) {
              return;
            }

            const result = bridge.applyMove(state.partialMove);
            const mutationInputs = deriveMutationInputs(result.state);
            setAndDerive({
              ...buildStateMutationState(
                mutationInputs.gameState,
                mutationInputs.legalMoveResult,
                mutationInputs.terminal,
                result.effectTrace ?? [],
                result.triggerFirings,
              ),
            });
          });
        },

        cancelChoice() {
          runBridge(() => {
            const state = get();
            if (state.selectedAction === null || state.choiceStack.length === 0) {
              return;
            }

            const nextChoiceStack = state.choiceStack.slice(0, state.choiceStack.length - 1);
            const nextMove = buildMove(state.selectedAction, nextChoiceStack);
            const choiceRequest = bridge.legalChoices(nextMove);
            if (choiceRequest.kind === 'illegal') {
              set({ error: toIllegalChoiceError(choiceRequest) });
              return;
            }

            setAndDerive({
              partialMove: nextMove,
              choiceStack: nextChoiceStack,
              choicePending: choiceRequest.kind === 'pending' ? choiceRequest : null,
              error: null,
            });
          });
        },

        cancelMove() {
          setAndDerive(resetMoveConstructionState());
        },

        undo() {
          runBridge(() => {
            const restored = bridge.undo();
            if (restored === null) {
              return;
            }

            const mutationInputs = deriveMutationInputs(restored);
            setAndDerive({
              ...buildStateMutationState(
                mutationInputs.gameState,
                mutationInputs.legalMoveResult,
                mutationInputs.terminal,
                [],
                [],
              ),
            });
          });
        },

        setAnimationPlaying(playing) {
          set({ animationPlaying: playing });
        },

        clearError() {
          set({ error: null });
        },
      };
    }),
  );
}
