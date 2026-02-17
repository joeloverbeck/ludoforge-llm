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
} from '@ludoforge/engine/runtime';
import { asPlayerId } from '@ludoforge/engine/runtime';

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
  initGame(def: GameDef, seed: number, playerID: PlayerId): Promise<void>;
  selectAction(actionId: ActionId): Promise<void>;
  chooseOne(choice: Exclude<MoveParamValue, readonly unknown[]>): Promise<void>;
  chooseN(choice: readonly Exclude<MoveParamValue, readonly unknown[]>[]): Promise<void>;
  confirmMove(): Promise<void>;
  cancelChoice(): Promise<void>;
  cancelMove(): void;
  undo(): Promise<void>;
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
type OperationKind = 'init' | 'action';

interface OperationContext {
  readonly epoch: number;
  readonly token: number;
  readonly kind: OperationKind;
}

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
      let sessionEpoch = 0;
      let operationToken = 0;
      let activeOperation: OperationContext | null = null;

      const isCurrentOperation = (operation: OperationContext): boolean => {
        return activeOperation?.epoch === operation.epoch && activeOperation.token === operation.token;
      };

      const beginOperation = (kind: OperationKind): OperationContext => {
        if (kind === 'init') {
          sessionEpoch += 1;
        }
        operationToken += 1;
        const operation: OperationContext = {
          epoch: sessionEpoch,
          token: operationToken,
          kind,
        };
        activeOperation = operation;
        set({ loading: true });
        return operation;
      };

      const finishOperation = (operation: OperationContext): void => {
        if (!isCurrentOperation(operation)) {
          return;
        }
        activeOperation = null;
        set({ loading: false });
      };

      const guardSet = (operation: OperationContext, patch: Partial<MutableGameStoreState>): boolean => {
        if (!isCurrentOperation(operation)) {
          return false;
        }
        set(patch);
        return true;
      };

      const invalidateActiveActionOperation = (): void => {
        if (activeOperation === null || activeOperation.kind !== 'action' || activeOperation.epoch !== sessionEpoch) {
          return;
        }
        activeOperation = null;
        set({ loading: false });
      };

      const setAndDerive = (patch: Partial<MutableGameStoreState>): void => {
        set((current) => {
          const nextState = materializeNextState(current, patch);
          return {
            ...patch,
            renderModel: deriveStoreRenderModel(toRenderDerivationInputs(nextState)),
          };
        });
      };

      const guardSetAndDerive = (operation: OperationContext, patch: Partial<MutableGameStoreState>): boolean => {
        if (!isCurrentOperation(operation)) {
          return false;
        }
        setAndDerive(patch);
        return true;
      };

      const runActionOperation = async (operation: (ctx: OperationContext) => void | Promise<void>): Promise<void> => {
        const ctx = beginOperation('action');
        try {
          await operation(ctx);
        } catch (error) {
          if (isCurrentOperation(ctx)) {
            const lifecycle = get().gameLifecycle;
            set({
              error: toWorkerError(error),
              gameLifecycle: assertLifecycleTransition(lifecycle, lifecycle, 'runBridge:error'),
            });
          }
        } finally {
          finishOperation(ctx);
        }
      };

      const deriveMutationInputs = async (gameState: GameState): Promise<MutationTransitionInputs> => {
        const legalMoveResult = await bridge.enumerateLegalMoves();
        const terminal = await bridge.terminalResult();
        return {
          gameState,
          legalMoveResult,
          terminal,
        };
      };

      const submitChoice = async (choice: MoveParamValue, actionType: ChoiceActionType): Promise<void> => {
        await runActionOperation(async (ctx) => {
          const state = get();
          if (state.selectedAction === null || state.choicePending === null) {
            return;
          }

          const validationError = validateChoiceSubmission(state.choicePending.type, actionType, choice);
          if (validationError !== null) {
            guardSet(ctx, { error: validationError });
            return;
          }

          const nextChoice: PartialChoice = {
            decisionId: state.choicePending.decisionId,
            name: state.choicePending.name,
            value: choice,
          };
          const nextChoiceStack = [...state.choiceStack, nextChoice];
          const nextMove = buildMove(state.selectedAction, nextChoiceStack);
          const choiceRequest = await bridge.legalChoices(nextMove);
          if (choiceRequest.kind === 'illegal') {
            guardSet(ctx, { error: toIllegalChoiceError(choiceRequest) });
            return;
          }

          guardSetAndDerive(ctx, {
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

        async initGame(def, seed, playerID) {
          const operation = beginOperation('init');
          const currentLifecycle = get().gameLifecycle;
          const initializingLifecycle = assertLifecycleTransition(currentLifecycle, 'initializing', 'initGame:start');
          guardSet(operation, {
            gameLifecycle: initializingLifecycle,
            error: null,
          });

          try {
            const gameState = await bridge.init(def, seed);
            const legalMoveResult = await bridge.enumerateLegalMoves();
            const terminal = await bridge.terminalResult();
            const lifecycle = assertLifecycleTransition(
              get().gameLifecycle,
              lifecycleFromTerminal(terminal),
              'initGame:success',
            );
            guardSetAndDerive(operation, buildInitSuccessState(def, gameState, playerID, legalMoveResult, terminal, lifecycle));
          } catch (error) {
            const lifecycle = assertLifecycleTransition(get().gameLifecycle, 'idle', 'initGame:failure');
            guardSetAndDerive(operation, buildInitFailureState(error, lifecycle));
          } finally {
            finishOperation(operation);
          }
        },

        async selectAction(actionId) {
          await runActionOperation(async (ctx) => {
            const baseMove: Move = { actionId, params: {} };
            const choiceRequest = await bridge.legalChoices(baseMove);
            if (choiceRequest.kind === 'illegal') {
              guardSetAndDerive(ctx, {
                error: toIllegalChoiceError(choiceRequest),
                ...resetMoveConstructionState(),
              });
              return;
            }

            guardSetAndDerive(ctx, {
              selectedAction: actionId,
              partialMove: baseMove,
              choiceStack: [],
              choicePending: choiceRequest.kind === 'pending' ? choiceRequest : null,
              error: null,
            });
          });
        },

        async chooseOne(choice) {
          await submitChoice(choice, 'chooseOne');
        },

        async chooseN(choice) {
          await submitChoice(choice, 'chooseN');
        },

        async confirmMove() {
          await runActionOperation(async (ctx) => {
            const state = get();
            if (state.partialMove === null) {
              return;
            }

            const result = await bridge.applyMove(state.partialMove);
            const mutationInputs = await deriveMutationInputs(result.state);
            const lifecycle = assertLifecycleTransition(
              state.gameLifecycle,
              lifecycleFromTerminal(mutationInputs.terminal),
              'confirmMove',
            );
            guardSetAndDerive(ctx, {
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

        async cancelChoice() {
          await runActionOperation(async (ctx) => {
            const state = get();
            if (state.selectedAction === null || state.choiceStack.length === 0) {
              return;
            }

            const nextChoiceStack = state.choiceStack.slice(0, state.choiceStack.length - 1);
            const nextMove = buildMove(state.selectedAction, nextChoiceStack);
            const choiceRequest = await bridge.legalChoices(nextMove);
            if (choiceRequest.kind === 'illegal') {
              guardSet(ctx, { error: toIllegalChoiceError(choiceRequest) });
              return;
            }

            guardSetAndDerive(ctx, {
              partialMove: nextMove,
              choiceStack: nextChoiceStack,
              choicePending: choiceRequest.kind === 'pending' ? choiceRequest : null,
              error: null,
            });
          });
        },

        cancelMove() {
          invalidateActiveActionOperation();
          setAndDerive(resetMoveConstructionState());
        },

        async undo() {
          await runActionOperation(async (ctx) => {
            const state = get();
            const restored = await bridge.undo();
            if (restored === null) {
              return;
            }

            const mutationInputs = await deriveMutationInputs(restored);
            const lifecycle = assertLifecycleTransition(
              state.gameLifecycle,
              lifecycleFromTerminal(mutationInputs.terminal),
              'undo',
            );
            guardSetAndDerive(ctx, {
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
