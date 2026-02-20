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
import type { VisualConfigProvider } from '../config/visual-config-provider.js';
import type { PlayerSeatConfig } from '../session/session-types.js';
import { assertLifecycleTransition, lifecycleFromTerminal, type GameLifecycle } from './lifecycle-transition.js';
import type { PartialChoice, PlayerSeat, RenderContext } from './store-types.js';
import type { AnimationDetailLevel, AnimationPlaybackSpeed } from '../animation/animation-types.js';
import { resolveAiPlaybackDelayMs, resolveAiSeat, selectAiMove, type AiPlaybackSpeed } from './ai-move-policy.js';
import type { GameWorkerAPI, OperationStamp, WorkerError } from '../worker/game-worker-api.js';

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
  readonly animationPlaybackSpeed: AnimationPlaybackSpeed;
  readonly animationPaused: boolean;
  readonly animationSkipRequestToken: number;
  readonly aiPlaybackDetailLevel: AnimationDetailLevel;
  readonly aiPlaybackSpeed: AiPlaybackSpeed;
  readonly aiPlaybackAutoSkip: boolean;
  readonly aiSkipRequestToken: number;
  readonly playerSeats: ReadonlyMap<PlayerId, PlayerSeat>;
  readonly renderModel: RenderModel | null;
}
type MutableGameStoreState = Omit<GameStoreState, 'renderModel'>;

export type AiStepOutcome = 'advanced' | 'no-op' | 'human-turn' | 'terminal' | 'no-legal-moves';

interface GameStoreActions {
  initGame(def: GameDef, seed: number, playerConfig: readonly PlayerSeatConfig[]): Promise<void>;
  initGameFromHistory(def: GameDef, seed: number, playerConfig: readonly PlayerSeatConfig[], moveHistory: readonly Move[]): Promise<void>;
  hydrateFromReplayStep(
    gameState: GameState,
    legalMoveResult: LegalMoveEnumerationResult,
    terminal: TerminalResult | null,
    effectTrace: readonly EffectTraceEntry[],
    triggerFirings: readonly TriggerLogEntry[],
  ): void;
  reportBootstrapFailure(error: unknown): void;
  selectAction(actionId: ActionId): Promise<void>;
  chooseOne(choice: Exclude<MoveParamValue, readonly unknown[]>): Promise<void>;
  chooseN(choice: readonly Exclude<MoveParamValue, readonly unknown[]>[]): Promise<void>;
  confirmMove(): Promise<void>;
  resolveAiStep(): Promise<AiStepOutcome>;
  resolveAiTurn(): Promise<void>;
  setAiPlaybackDetailLevel(level: AnimationDetailLevel): void;
  setAiPlaybackSpeed(speed: AiPlaybackSpeed): void;
  setAiPlaybackAutoSkip(enabled: boolean): void;
  requestAiTurnSkip(): void;
  cancelChoice(): Promise<void>;
  cancelMove(): void;
  undo(): Promise<void>;
  setAnimationPlaying(playing: boolean): void;
  setAnimationPlaybackSpeed(speed: AnimationPlaybackSpeed): void;
  setAnimationPaused(paused: boolean): void;
  requestAnimationSkipCurrent(): void;
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
  readonly partialMove: Move | null;
  readonly choiceStack: readonly PartialChoice[];
  readonly playerSeats: ReadonlyMap<PlayerId, PlayerSeat>;
  readonly terminal: TerminalResult | null;
}

interface MutationTransitionInputs {
  readonly gameState: GameState;
  readonly legalMoveResult: LegalMoveEnumerationResult;
  readonly terminal: TerminalResult | null;
}

interface CreateGameStoreOptions {
  readonly onMoveApplied?: (move: Move) => void;
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
  'STALE_OPERATION',
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
  animationPlaybackSpeed: '1x',
  animationPaused: false,
  animationSkipRequestToken: 0,
  aiPlaybackDetailLevel: 'standard',
  aiPlaybackSpeed: '1x',
  aiPlaybackAutoSkip: false,
  aiSkipRequestToken: 0,
  renderModel: null,
};

const MAX_AI_SKIP_MOVES = 512;
const DEFAULT_AI_PLAYBACK_DELAY_MS = 500;

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
  playerConfig: readonly PlayerSeatConfig[],
  legalMoveResult: LegalMoveEnumerationResult,
  terminal: TerminalResult | null,
  lifecycle: GameLifecycle,
): Partial<MutableGameStoreState> {
  const humanSeat = playerConfig.find((seat) => seat.type === 'human');
  return {
    gameDef: def,
    gameState,
    playerID: humanSeat !== undefined ? asPlayerId(humanSeat.playerId) : null,
    legalMoveResult,
    terminal,
    gameLifecycle: lifecycle,
    error: null,
    effectTrace: [],
    triggerFirings: [],
    playerSeats: buildPlayerSeatsFromConfig(playerConfig),
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

function buildPlayerSeatsFromConfig(
  playerConfig: readonly PlayerSeatConfig[],
): ReadonlyMap<PlayerId, PlayerSeat> {
  const seats = new Map<PlayerId, PlayerSeat>();
  for (const seat of playerConfig) {
    seats.set(asPlayerId(seat.playerId), seat.type);
  }
  return seats;
}

function validatePlayerConfig(
  playerConfig: readonly PlayerSeatConfig[],
  def: GameDef,
): void {
  const count = playerConfig.length;
  const { min, max } = def.metadata.players;
  if (count < min || count > max) {
    throw new Error(`Player config length ${count} outside allowed range [${min}, ${max}].`);
  }
  if (!playerConfig.some((seat) => seat.type === 'human')) {
    throw new Error('Player config must include at least one human seat.');
  }
}

function buildMove(actionId: ActionId, choices: readonly PartialChoice[]): Move {
  return {
    actionId,
    params: Object.fromEntries(choices.map((choice) => [choice.decisionId, choice.value])),
  };
}

function isHumanTurn(renderModel: RenderModel | null): boolean {
  if (renderModel === null) {
    return false;
  }
  const activePlayer = renderModel.players.find((player) => player.id === renderModel.activePlayerID);
  return activePlayer?.isHuman === true;
}

function toRenderContext(inputs: RenderDerivationInputs, visualConfigProvider: VisualConfigProvider): RenderContext | null {
  if (inputs.playerID === null) {
    return null;
  }

  return {
    playerID: inputs.playerID,
    legalMoveResult: inputs.legalMoveResult,
    choicePending: inputs.choicePending,
    selectedAction: inputs.selectedAction,
    partialMove: inputs.partialMove,
    choiceStack: inputs.choiceStack,
    playerSeats: inputs.playerSeats,
    terminal: inputs.terminal,
    visualConfigProvider,
  };
}

function deriveStoreRenderModel(
  inputs: RenderDerivationInputs,
  previousModel: RenderModel | null,
  visualConfigProvider: VisualConfigProvider,
): RenderModel | null {
  if (inputs.gameDef === null || inputs.gameState === null) {
    return null;
  }
  const context = toRenderContext(inputs, visualConfigProvider);
  if (context === null) {
    return null;
  }
  return deriveRenderModel(inputs.gameState, inputs.gameDef, context, previousModel);
}

function toRenderDerivationInputs(state: MutableGameStoreState): RenderDerivationInputs {
  return {
    gameDef: state.gameDef,
    gameState: state.gameState,
    playerID: state.playerID,
    legalMoveResult: state.legalMoveResult,
    choicePending: state.choicePending,
    selectedAction: state.selectedAction,
    partialMove: state.partialMove,
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
    animationPlaybackSpeed: state.animationPlaybackSpeed,
    animationPaused: state.animationPaused,
    animationSkipRequestToken: state.animationSkipRequestToken,
    aiPlaybackDetailLevel: state.aiPlaybackDetailLevel,
    aiPlaybackSpeed: state.aiPlaybackSpeed,
    aiPlaybackAutoSkip: state.aiPlaybackAutoSkip,
    aiSkipRequestToken: state.aiSkipRequestToken,
    playerSeats: state.playerSeats,
  };
}

function materializeNextState(current: GameStore, patch: Partial<MutableGameStoreState>): MutableGameStoreState {
  return {
    ...snapshotMutableState(current),
    ...patch,
  };
}

export function createGameStore(
  bridge: GameWorkerAPI,
  visualConfigProvider: VisualConfigProvider,
  options?: CreateGameStoreOptions,
) {
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

      const toOperationStamp = (operation: OperationContext): OperationStamp => ({
        epoch: operation.epoch,
        token: operation.token,
      });

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
            renderModel: deriveStoreRenderModel(
              toRenderDerivationInputs(nextState),
              current.renderModel,
              visualConfigProvider,
            ),
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

      const runActionOperation = async <T>(operation: (ctx: OperationContext) => T | Promise<T>): Promise<T | undefined> => {
        const ctx = beginOperation('action');
        try {
          return await operation(ctx);
        } catch (error) {
          if (isCurrentOperation(ctx)) {
            const lifecycle = get().gameLifecycle;
            set({
              error: toWorkerError(error),
              gameLifecycle: assertLifecycleTransition(lifecycle, lifecycle, 'runBridge:error'),
            });
          }
          return undefined;
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

      const resolveSingleAiStep = async (ctx: OperationContext): Promise<AiStepOutcome> => {
        const state = get();
        if (state.gameLifecycle === 'terminal') {
          return 'terminal';
        }
        if (state.renderModel === null) {
          return 'no-op';
        }
        if (isHumanTurn(state.renderModel)) {
          return 'human-turn';
        }

        const legalMoveResult = state.legalMoveResult ?? await bridge.enumerateLegalMoves();
        const activeSeat = resolveAiSeat(state.playerSeats.get(state.renderModel.activePlayerID));
        const aiMove = selectAiMove(activeSeat, legalMoveResult.moves);
        if (aiMove === null) {
          guardSetAndDerive(ctx, {
            legalMoveResult,
            error: null,
          });
          return 'no-legal-moves';
        }

        const result = await bridge.applyMove(aiMove, undefined, toOperationStamp(ctx));
        const mutationInputs = await deriveMutationInputs(result.state);
        const lifecycle = assertLifecycleTransition(
          state.gameLifecycle,
          lifecycleFromTerminal(mutationInputs.terminal),
          'resolveAiTurn',
        );
        const wasApplied = guardSetAndDerive(ctx, {
          ...buildStateMutationState(
            mutationInputs.gameState,
            mutationInputs.legalMoveResult,
            mutationInputs.terminal,
            lifecycle,
            result.effectTrace ?? [],
            result.triggerFirings,
          ),
        });
        if (!wasApplied) {
          return 'no-op';
        }
        options?.onMoveApplied?.(aiMove);
        return 'advanced';
      };

      return {
        ...INITIAL_STATE,
        playerSeats: new Map<PlayerId, PlayerSeat>(),

        async initGame(def, seed, playerConfig) {
          validatePlayerConfig(playerConfig, def);
          const operation = beginOperation('init');
          const currentLifecycle = get().gameLifecycle;
          const initializingLifecycle = assertLifecycleTransition(currentLifecycle, 'initializing', 'initGame:start');
          guardSet(operation, {
            gameLifecycle: initializingLifecycle,
            error: null,
          });

          try {
            const gameState = await bridge.init(def, seed, { playerCount: playerConfig.length }, toOperationStamp(operation));
            const legalMoveResult = await bridge.enumerateLegalMoves();
            const terminal = await bridge.terminalResult();
            const lifecycle = assertLifecycleTransition(
              get().gameLifecycle,
              lifecycleFromTerminal(terminal),
              'initGame:success',
            );
            guardSetAndDerive(operation, buildInitSuccessState(def, gameState, playerConfig, legalMoveResult, terminal, lifecycle));
          } catch (error) {
            const lifecycle = assertLifecycleTransition(get().gameLifecycle, 'idle', 'initGame:failure');
            guardSetAndDerive(operation, buildInitFailureState(error, lifecycle));
          } finally {
            finishOperation(operation);
          }
        },

        async initGameFromHistory(def, seed, playerConfig, moveHistory) {
          validatePlayerConfig(playerConfig, def);
          const operation = beginOperation('init');
          const currentLifecycle = get().gameLifecycle;
          const initializingLifecycle = assertLifecycleTransition(currentLifecycle, 'initializing', 'initGameFromHistory:start');
          guardSet(operation, {
            gameLifecycle: initializingLifecycle,
            error: null,
          });

          try {
            await bridge.init(def, seed, { playerCount: playerConfig.length }, toOperationStamp(operation));
            if (moveHistory.length > 0) {
              await bridge.playSequence(moveHistory, undefined, toOperationStamp(operation));
            }
            const gameState = await bridge.getState();
            const legalMoveResult = await bridge.enumerateLegalMoves();
            const terminal = await bridge.terminalResult();
            const lifecycle = assertLifecycleTransition(
              get().gameLifecycle,
              lifecycleFromTerminal(terminal),
              'initGameFromHistory:success',
            );
            guardSetAndDerive(operation, buildInitSuccessState(def, gameState, playerConfig, legalMoveResult, terminal, lifecycle));
          } catch (error) {
            const lifecycle = assertLifecycleTransition(get().gameLifecycle, 'idle', 'initGameFromHistory:failure');
            guardSetAndDerive(operation, buildInitFailureState(error, lifecycle));
          } finally {
            finishOperation(operation);
          }
        },

        hydrateFromReplayStep(gameState, legalMoveResult, terminal, effectTrace, triggerFirings) {
          const lifecycle = assertLifecycleTransition(
            get().gameLifecycle,
            lifecycleFromTerminal(terminal),
            'hydrateFromReplayStep',
          );
          setAndDerive(
            buildStateMutationState(
              gameState,
              legalMoveResult,
              terminal,
              lifecycle,
              effectTrace,
              triggerFirings,
            ),
          );
        },

        reportBootstrapFailure(error) {
          const lifecycle = assertLifecycleTransition(get().gameLifecycle, 'idle', 'reportBootstrapFailure');
          setAndDerive(buildInitFailureState(error, lifecycle));
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
            const move = state.partialMove;

            const result = await bridge.applyMove(move, undefined, toOperationStamp(ctx));
            const mutationInputs = await deriveMutationInputs(result.state);
            const lifecycle = assertLifecycleTransition(
              state.gameLifecycle,
              lifecycleFromTerminal(mutationInputs.terminal),
              'confirmMove',
            );
            const wasApplied = guardSetAndDerive(ctx, {
              ...buildStateMutationState(
                mutationInputs.gameState,
                mutationInputs.legalMoveResult,
                mutationInputs.terminal,
                lifecycle,
                result.effectTrace ?? [],
                result.triggerFirings,
              ),
            });
            if (wasApplied) {
              options?.onMoveApplied?.(move);
            }
          });
        },

        async resolveAiStep() {
          const outcome = await runActionOperation((ctx) => resolveSingleAiStep(ctx));
          return outcome ?? 'no-op';
        },

        async resolveAiTurn() {
          await runActionOperation(async (ctx) => {
            for (let resolvedMoves = 0; resolvedMoves < MAX_AI_SKIP_MOVES; resolvedMoves += 1) {
              const outcome = await resolveSingleAiStep(ctx);
              if (outcome !== 'advanced') {
                return;
              }
            }

            guardSet(ctx, {
              error: toWorkerError(`AI turn resolution exceeded ${MAX_AI_SKIP_MOVES} moves without reaching a human turn or terminal state.`),
            });
          });
        },

        setAiPlaybackDetailLevel(level) {
          set({ aiPlaybackDetailLevel: level });
        },

        setAiPlaybackSpeed(speed) {
          resolveAiPlaybackDelayMs(speed, DEFAULT_AI_PLAYBACK_DELAY_MS);
          set({ aiPlaybackSpeed: speed });
        },

        setAiPlaybackAutoSkip(enabled) {
          set({ aiPlaybackAutoSkip: enabled });
        },

        requestAiTurnSkip() {
          set((state) => ({ aiSkipRequestToken: state.aiSkipRequestToken + 1 }));
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
            const restored = await bridge.undo(toOperationStamp(ctx));
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
          set({
            animationPlaying: playing,
            ...(playing ? {} : { animationPaused: false }),
          });
        },

        setAnimationPlaybackSpeed(speed) {
          set({ animationPlaybackSpeed: speed });
        },

        setAnimationPaused(paused) {
          set({ animationPaused: paused });
        },

        requestAnimationSkipCurrent() {
          set((state) => ({ animationSkipRequestToken: state.animationSkipRequestToken + 1 }));
        },

        clearError() {
          set({ error: null });
        },
      };
    }),
  );
}
