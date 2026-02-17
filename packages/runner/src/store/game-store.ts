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
import { assertLifecycleTransition, lifecycleFromTerminal, type GameLifecycle } from './lifecycle-transition.js';
import type { PartialChoice, PlayerSeat, RenderContext } from './store-types.js';
import type { GameWorkerAPI, WorkerError } from '../worker/game-worker-api.js';

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
type MutableGameStoreState = Omit<GameStoreState, 'renderModel'>;

interface GameStoreActions {
  initGame(def: GameDef, seed: number, playerID: PlayerId): void;
  selectAction(actionId: ActionId): void;
  chooseOne(choice: Exclude<MoveParamValue, readonly unknown[]>): void;
  chooseN(choice: readonly Exclude<MoveParamValue, readonly unknown[]>[]): void;
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

type ChoiceActionType = ChoicePendingRequest['type'];

interface ChoiceValidationIssue {
  readonly reason: 'CHOICE_TYPE_MISMATCH' | 'CHOICE_VALUE_SHAPE_INVALID';
  readonly expected: ChoiceActionType | 'scalar' | 'array';
  readonly received: ChoiceActionType | 'scalar' | 'array';
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
  lifecycle: GameLifecycle,
): Partial<MutableGameStoreState> {
  return {
    gameDef: def,
    gameState,
    playerID,
    legalMoveResult,
    terminal,
    gameLifecycle: lifecycle,
    error: null,
    effectTrace: [],
    triggerFirings: [],
    playerSeats: buildPlayerSeats(gameState.playerCount, playerID),
    ...resetMoveConstructionState(),
  };
}

function buildInitFailureState(error: unknown, lifecycle: GameLifecycle): Partial<MutableGameStoreState> {
  return {
    ...resetSessionState(),
    error: toWorkerError(error),
    gameLifecycle: lifecycle,
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
  lifecycle: GameLifecycle,
  effectTrace: readonly EffectTraceEntry[],
  triggerFirings: readonly TriggerLogEntry[],
): Partial<MutableGameStoreState> {
  return {
    gameState,
    legalMoveResult,
    terminal,
    gameLifecycle: lifecycle,
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

function toChoiceValidationError(issue: ChoiceValidationIssue): WorkerError {
  return {
    code: 'VALIDATION_FAILED',
    message: 'Choice input is incompatible with the current pending choice.',
    details: issue,
  };
}

function validateChoiceSubmission(
  pendingType: ChoicePendingRequest['type'],
  actionType: ChoiceActionType,
  choice: MoveParamValue,
): WorkerError | null {
  if (pendingType !== actionType) {
    return toChoiceValidationError({
      reason: 'CHOICE_TYPE_MISMATCH',
      expected: pendingType,
      received: actionType,
    });
  }

  if (actionType === 'chooseOne' && Array.isArray(choice)) {
    return toChoiceValidationError({
      reason: 'CHOICE_VALUE_SHAPE_INVALID',
      expected: 'scalar',
      received: 'array',
    });
  }

  if (actionType === 'chooseN' && !Array.isArray(choice)) {
    return toChoiceValidationError({
      reason: 'CHOICE_VALUE_SHAPE_INVALID',
      expected: 'array',
      received: 'scalar',
    });
  }

  return null;
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
    params: Object.fromEntries(choices.map((choice) => [choice.decisionId, choice.value])),
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

function toRenderDerivationInputs(state: MutableGameStoreState): RenderDerivationInputs {
  return {
    gameDef: state.gameDef,
    gameState: state.gameState,
    playerID: state.playerID,
    legalMoveResult: state.legalMoveResult,
    choicePending: state.choicePending,
    selectedAction: state.selectedAction,
    choiceStack: state.choiceStack,
    playerSeats: state.playerSeats,
    terminal: state.terminal,
  };
}

function snapshotMutableState(state: GameStore): MutableGameStoreState {
  return {
    gameDef: state.gameDef,
    gameState: state.gameState,
    playerID: state.playerID,
    gameLifecycle: state.gameLifecycle,
    loading: state.loading,
    error: state.error,
    legalMoveResult: state.legalMoveResult,
    choicePending: state.choicePending,
    effectTrace: state.effectTrace,
    triggerFirings: state.triggerFirings,
    terminal: state.terminal,
    selectedAction: state.selectedAction,
    partialMove: state.partialMove,
    choiceStack: state.choiceStack,
    animationPlaying: state.animationPlaying,
    playerSeats: state.playerSeats,
  };
}

function materializeNextState(current: GameStore, patch: Partial<MutableGameStoreState>): MutableGameStoreState {
  return {
    ...snapshotMutableState(current),
    ...patch,
  };
}

export function createGameStore(bridge: GameWorkerAPI) {
  return create<GameStore>()(
    subscribeWithSelector((set, get) => {
      const setAndDerive = (patch: Partial<MutableGameStoreState>): void => {
        set((current) => {
          const nextState = materializeNextState(current, patch);
          return {
            ...patch,
            renderModel: deriveStoreRenderModel(toRenderDerivationInputs(nextState)),
          };
        });
      };

      const runBridge = (operation: () => void): void => {
        set({ loading: true });
        try {
          operation();
        } catch (error) {
          const lifecycle = get().gameLifecycle;
          set({
            error: toWorkerError(error),
            gameLifecycle: assertLifecycleTransition(lifecycle, lifecycle, 'runBridge:error'),
          });
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

      const submitChoice = (choice: MoveParamValue, actionType: ChoiceActionType): void => {
        runBridge(() => {
          const state = get();
          if (state.selectedAction === null || state.choicePending === null) {
            return;
          }

          const validationError = validateChoiceSubmission(state.choicePending.type, actionType, choice);
          if (validationError !== null) {
            set({ error: validationError });
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
      };

      return {
        ...INITIAL_STATE,
        playerSeats: new Map<PlayerId, PlayerSeat>(),

        initGame(def, seed, playerID) {
          const currentLifecycle = get().gameLifecycle;
          const initializingLifecycle = assertLifecycleTransition(currentLifecycle, 'initializing', 'initGame:start');
          set({
            gameLifecycle: initializingLifecycle,
            loading: true,
            error: null,
          });

          try {
            const gameState = bridge.init(def, seed);
            const legalMoveResult = bridge.enumerateLegalMoves();
            const terminal = bridge.terminalResult();
            const lifecycle = assertLifecycleTransition(
              get().gameLifecycle,
              lifecycleFromTerminal(terminal),
              'initGame:success',
            );
            setAndDerive(buildInitSuccessState(def, gameState, playerID, legalMoveResult, terminal, lifecycle));
          } catch (error) {
            const lifecycle = assertLifecycleTransition(get().gameLifecycle, 'idle', 'initGame:failure');
            setAndDerive(buildInitFailureState(error, lifecycle));
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

        chooseOne(choice) {
          submitChoice(choice, 'chooseOne');
        },

        chooseN(choice) {
          submitChoice(choice, 'chooseN');
        },

        confirmMove() {
          runBridge(() => {
            const state = get();
            if (state.partialMove === null) {
              return;
            }

            const result = bridge.applyMove(state.partialMove);
            const mutationInputs = deriveMutationInputs(result.state);
            const lifecycle = assertLifecycleTransition(
              state.gameLifecycle,
              lifecycleFromTerminal(mutationInputs.terminal),
              'confirmMove',
            );
            setAndDerive({
              ...buildStateMutationState(
                mutationInputs.gameState,
                mutationInputs.legalMoveResult,
                mutationInputs.terminal,
                lifecycle,
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
            const state = get();
            const restored = bridge.undo();
            if (restored === null) {
              return;
            }

            const mutationInputs = deriveMutationInputs(restored);
            const lifecycle = assertLifecycleTransition(
              state.gameLifecycle,
              lifecycleFromTerminal(mutationInputs.terminal),
              'undo',
            );
            setAndDerive({
              ...buildStateMutationState(
                mutationInputs.gameState,
                mutationInputs.legalMoveResult,
                mutationInputs.terminal,
                lifecycle,
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
