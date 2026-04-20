import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type {
  ActionId,
  AgentDecisionTrace,
  ClassifiedMove,
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
import type {
  ApplyDecisionResult,
  ChooseNStepContext,
  ChooseOneContext,
  Decision,
  MicroturnState,
  StochasticResolveContext,
  TurnId,
} from '../../../engine/src/kernel/microturn/types.js';
import { rebuildMoveFromTrace } from '../../../engine/src/kernel/microturn/publish.js';

import { deriveRunnerFrame } from '../model/derive-runner-frame.js';
import { projectRenderModel } from '../model/project-render-model.js';
import type { RunnerFrame, RunnerProjectionBundle } from '../model/runner-frame.js';
import type { RenderModel } from '../model/render-model.js';
import type { VisualConfigProvider } from '../config/visual-config-provider.js';
import {
  isHumanSeatController,
  normalizeSeatController,
  type PlayerSeatConfig,
  type SeatController,
} from '../seat/seat-controller.js';
import { assertLifecycleTransition, lifecycleFromTerminal, type GameLifecycle } from './lifecycle-transition.js';
import type { PartialChoice, RenderContext } from './store-types.js';
import type { AnimationDetailLevel, AnimationPlaybackSpeed } from '../animation/animation-types.js';
import {
  resolveAiPlaybackDelayMs,
  type AiPlaybackSpeed,
} from './ai-move-policy.js';
import { createAgentTurnOrchestrator, type AgentTurnOrchestrator } from './agent-turn-orchestrator.js';
import type { GameWorkerAPI, OperationStamp, WorkerError } from '../worker/game-worker-api.js';
import type { TraceBus } from '@ludoforge/engine/trace';
import { getOrComputeLayout } from '../layout/layout-cache.js';
import type { WorldLayoutModel } from '../layout/world-layout-model.js';

interface GameStoreState {
  readonly gameDef: GameDef | null;
  readonly gameState: GameState | null;
  readonly playerID: PlayerId | null;
  readonly gameLifecycle: GameLifecycle;
  readonly loading: boolean;
  readonly error: WorkerError | null;
  readonly orchestrationDiagnostic: OrchestrationDiagnostic | null;
  readonly orchestrationDiagnosticSequence: number;
  readonly currentMicroturn: MicroturnState | null;
  readonly legalMoveResult: LegalMoveEnumerationResult | null;
  readonly actionAvailabilityById: ReadonlyMap<string, boolean>;
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
  readonly playerSeats: ReadonlyMap<PlayerId, SeatController>;
  readonly appliedMoveEvent: AppliedMoveEvent | null;
  readonly appliedMoveSequence: number;
  readonly activePhaseBanner: string | null;
  readonly worldLayout: WorldLayoutModel | null;
  readonly runnerProjection: RunnerProjectionBundle | null;
  readonly runnerFrame: RunnerFrame | null;
  readonly renderModel: RenderModel | null;
}
type MutableGameStoreState = Omit<GameStoreState, 'runnerProjection' | 'runnerFrame' | 'renderModel'>;

export type AiStepOutcome =
  | 'advanced'
  | 'no-op'
  | 'human-turn'
  | 'terminal'
  | 'no-legal-moves'
  | 'uncompletable-template'
  | 'illegal-template';

export interface OrchestrationDiagnostic {
  readonly sequence: number;
  readonly code: 'AI_PLAYBACK' | 'UNCOMPLETABLE_TEMPLATE_MOVE';
  readonly message: string;
  readonly details?: unknown;
}

export interface AppliedMoveEvent {
  readonly sequence: number;
  readonly actorId: PlayerId;
  readonly actorController: SeatController | 'unknown';
  readonly move: Move;
}

interface GameStoreActions {
  initGame(def: GameDef, seed: number, playerConfig: readonly PlayerSeatConfig[]): Promise<void>;
  initGameFromHistory(def: GameDef, seed: number, playerConfig: readonly PlayerSeatConfig[], moveHistory: readonly Move[]): Promise<void>;
  hydrateFromReplayStep(
    gameState: GameState,
    currentMicroturn: MicroturnState | null,
    terminal: TerminalResult | null,
    effectTrace: readonly EffectTraceEntry[],
    triggerFirings: readonly TriggerLogEntry[],
  ): void;
  reportBootstrapFailure(error: unknown): void;
  selectAction(actionId: ActionId, actionClass?: string): Promise<void>;
  chooseOne(choice: Exclude<MoveParamValue, readonly unknown[]>): Promise<void>;
  addChooseNItem(choice: Exclude<MoveParamValue, readonly unknown[]>): Promise<void>;
  removeChooseNItem(choice: Exclude<MoveParamValue, readonly unknown[]>): Promise<void>;
  confirmChooseN(): Promise<void>;
  confirmMove(): Promise<void>;
  resolveAiStep(): Promise<AiStepOutcome>;
  resolveAiTurn(): Promise<void>;
  setAiPlaybackDetailLevel(level: AnimationDetailLevel): void;
  setAiPlaybackSpeed(speed: AiPlaybackSpeed): void;
  setAiPlaybackAutoSkip(enabled: boolean): void;
  requestAiTurnSkip(): void;
  cancelChoice(): Promise<void>;
  cancelMove(): Promise<void>;
  undo(): Promise<void>;
  setAnimationPlaying(playing: boolean): void;
  setAnimationPlaybackSpeed(speed: AnimationPlaybackSpeed): void;
  setAnimationPaused(paused: boolean): void;
  requestAnimationSkipCurrent(): void;
  reportPlaybackDiagnostic(message: string): void;
  clearOrchestrationDiagnostic(): void;
  clearError(): void;
  reportCanvasCrash(): void;
  beginCanvasRecovery(): void;
  canvasRecovered(): void;
  setActivePhaseBanner(phase: string | null): void;
}

export type GameStore = GameStoreState & GameStoreActions;

interface RenderDerivationInputs {
  readonly gameDef: GameDef | null;
  readonly gameState: GameState | null;
  readonly playerID: PlayerId | null;
  readonly currentMicroturn: MicroturnState | null;
  readonly legalMoveResult: LegalMoveEnumerationResult | null;
  readonly actionAvailabilityById: ReadonlyMap<string, boolean>;
  readonly choicePending: ChoicePendingRequest | null;
  readonly selectedAction: ActionId | null;
  readonly partialMove: Move | null;
  readonly choiceStack: readonly PartialChoice[];
  readonly playerSeats: ReadonlyMap<PlayerId, SeatController>;
  readonly terminal: TerminalResult | null;
}

interface MutationTransitionInputs {
  readonly gameState: GameState;
  readonly currentMicroturn: MicroturnState | null;
  readonly legalMoveResult: LegalMoveEnumerationResult | null;
  readonly actionAvailabilityById: ReadonlyMap<string, boolean>;
  readonly terminal: TerminalResult | null;
}

interface CreateGameStoreOptions {
  readonly agentTurnOrchestrator?: AgentTurnOrchestrator;
  readonly onMoveApplied?: (move: Move) => void;
  readonly traceBus?: TraceBus;
}

type OperationKind = 'init' | 'action';

interface OperationContext {
  readonly epoch: number;
  readonly token: number;
  readonly kind: OperationKind;
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
  orchestrationDiagnostic: null,
  orchestrationDiagnosticSequence: 0,
  currentMicroturn: null,
  legalMoveResult: null,
  actionAvailabilityById: new Map<string, boolean>(),
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
  appliedMoveEvent: null,
  appliedMoveSequence: 0,
  activePhaseBanner: null,
  worldLayout: null,
  runnerProjection: null,
  runnerFrame: null,
  renderModel: null,
};

const MAX_AI_SKIP_MOVES = 512;
const DEFAULT_AI_PLAYBACK_DELAY_MS = 500;

function resetSessionState(): Pick<
  GameStoreState,
  | 'gameDef'
  | 'gameState'
  | 'playerID'
  | 'orchestrationDiagnostic'
  | 'orchestrationDiagnosticSequence'
  | 'currentMicroturn'
  | 'legalMoveResult'
  | 'actionAvailabilityById'
  | 'choicePending'
  | 'effectTrace'
  | 'triggerFirings'
  | 'terminal'
  | 'selectedAction'
  | 'partialMove'
  | 'choiceStack'
  | 'playerSeats'
  | 'appliedMoveEvent'
  | 'appliedMoveSequence'
  | 'worldLayout'
> {
  return {
    gameDef: null,
    gameState: null,
    playerID: null,
    orchestrationDiagnostic: null,
    orchestrationDiagnosticSequence: 0,
    currentMicroturn: null,
    legalMoveResult: null,
    actionAvailabilityById: new Map<string, boolean>(),
    choicePending: null,
    effectTrace: [],
    triggerFirings: [],
    terminal: null,
    selectedAction: null,
    partialMove: null,
    choiceStack: [],
    playerSeats: new Map<PlayerId, SeatController>(),
    appliedMoveEvent: null,
    appliedMoveSequence: 0,
    worldLayout: null,
  };
}

function buildInitSuccessState(
  def: GameDef,
  gameState: GameState,
  playerConfig: readonly PlayerSeatConfig[],
  currentMicroturn: MicroturnState | null,
  legalMoveResult: LegalMoveEnumerationResult | null,
  actionAvailabilityById: ReadonlyMap<string, boolean>,
  terminal: TerminalResult | null,
  lifecycle: GameLifecycle,
  setupTrace: readonly EffectTraceEntry[],
): Partial<MutableGameStoreState> {
  const humanSeat = playerConfig.find((seat) => isHumanSeatController(seat.controller));
  return {
    gameDef: def,
    gameState,
    playerID: humanSeat !== undefined ? asPlayerId(humanSeat.playerId) : null,
    currentMicroturn,
    legalMoveResult,
    actionAvailabilityById,
    terminal,
    gameLifecycle: lifecycle,
    error: null,
    effectTrace: setupTrace,
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
  currentMicroturn: MicroturnState | null,
  legalMoveResult: LegalMoveEnumerationResult | null,
  actionAvailabilityById: ReadonlyMap<string, boolean>,
  terminal: TerminalResult | null,
  lifecycle: GameLifecycle,
  effectTrace: readonly EffectTraceEntry[],
  triggerFirings: readonly TriggerLogEntry[],
): Partial<MutableGameStoreState> {
  return {
    gameState,
    currentMicroturn,
    legalMoveResult,
    actionAvailabilityById,
    terminal,
    gameLifecycle: lifecycle,
    effectTrace,
    triggerFirings,
    appliedMoveEvent: null,
    error: null,
    ...resetMoveConstructionState(),
  };
}

function buildAppliedMoveEventPatch(
  state: Pick<GameStoreState, 'renderModel' | 'playerSeats' | 'appliedMoveSequence'>,
  move: Move,
): Pick<GameStoreState, 'appliedMoveEvent' | 'appliedMoveSequence'> {
  const actorId = state.renderModel?.activePlayerID;
  if (actorId === undefined) {
    return {
      appliedMoveEvent: null,
      appliedMoveSequence: state.appliedMoveSequence,
    };
  }

  const sequence = state.appliedMoveSequence + 1;
  return {
    appliedMoveSequence: sequence,
    appliedMoveEvent: {
      sequence,
      actorId,
      actorController: state.playerSeats.get(actorId) ?? 'unknown',
      move,
    },
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

function buildPlayerSeatsFromConfig(
  playerConfig: readonly PlayerSeatConfig[],
): ReadonlyMap<PlayerId, SeatController> {
  const seats = new Map<PlayerId, SeatController>();
  for (const seat of playerConfig) {
    seats.set(asPlayerId(seat.playerId), normalizeSeatController(seat.controller));
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
  if (!playerConfig.some((seat) => isHumanSeatController(seat.controller))) {
    throw new Error('Player config must include at least one human seat.');
  }
}

function toClassifiedMove(move: Move): ClassifiedMove {
  return {
    move,
    viability: {
      viable: true,
      complete: true,
      move,
      warnings: [],
      code: undefined,
      context: undefined,
      error: undefined,
      nextDecision: undefined,
      nextDecisionSet: undefined,
      stochasticDecision: undefined,
    },
    trustedMove: undefined,
  };
}

function synthesizeLegalMoveResult(microturn: MicroturnState | null): LegalMoveEnumerationResult | null {
  if (microturn === null || microturn.kind !== 'actionSelection') {
    return null;
  }

  return {
    moves: microturn.legalActions
      .filter((decision): decision is Extract<Decision, { readonly kind: 'actionSelection' }> => decision.kind === 'actionSelection')
      .map((decision) => toClassifiedMove(decision.move ?? { actionId: decision.actionId, params: {} })),
    warnings: [],
  };
}

function deriveCompatibilityChoiceStack(microturn: MicroturnState | null): readonly PartialChoice[] {
  if (microturn === null) {
    return [];
  }

  return microturn.compoundTurnTrace.flatMap<PartialChoice>((entry) => {
    if (entry.decision.kind === 'chooseOne') {
      return [{
        decisionKey: entry.decision.decisionKey,
        name: String(entry.decision.decisionKey),
        value: entry.decision.value,
      }];
    }
    if (entry.decision.kind === 'chooseNStep' && entry.decision.command === 'confirm' && entry.decision.value !== undefined) {
      return [{
        decisionKey: entry.decision.decisionKey,
        name: String(entry.decision.decisionKey),
        value: entry.decision.value,
      }];
    }
    return [];
  });
}

function deriveCompatibilitySelectedAction(microturn: MicroturnState | null): ActionId | null {
  const root = microturn?.compoundTurnTrace[0];
  return root?.decision.kind === 'actionSelection'
    ? root.decision.actionId
    : null;
}

function deriveCompatibilityPartialMove(microturn: MicroturnState | null): Move | null {
  if (microturn === null || microturn.compoundTurnTrace.length === 0) {
    return null;
  }
  return rebuildMoveFromTrace(microturn.compoundTurnTrace);
}

function deriveCompatibilityChoicePending(microturn: MicroturnState | null): ChoicePendingRequest | null {
  if (microturn === null) {
    return null;
  }

  if (microturn.kind === 'chooseOne') {
    const context = microturn.decisionContext as ChooseOneContext;
    return {
      kind: 'pending',
      complete: false,
      decisionKey: context.decisionKey,
      name: String(context.decisionKey),
      type: 'chooseOne',
      options: context.options,
      targetKinds: [],
    };
  }

  if (microturn.kind === 'chooseNStep') {
    const context = microturn.decisionContext as ChooseNStepContext;
    return {
      kind: 'pending',
      complete: false,
      decisionKey: context.decisionKey,
      name: String(context.decisionKey),
      type: 'chooseN',
      options: context.options,
      targetKinds: [],
      min: context.cardinality.min,
      max: context.cardinality.max,
      selected: context.selectedSoFar,
      canConfirm: context.stepCommands.includes('confirm'),
    };
  }

  return null;
}

function buildMicroturnCompatibilityPatch(microturn: MicroturnState | null): Pick<
  GameStoreState,
  'currentMicroturn' | 'legalMoveResult' | 'choicePending' | 'selectedAction' | 'partialMove' | 'choiceStack'
> {
  return {
    currentMicroturn: microturn,
    legalMoveResult: synthesizeLegalMoveResult(microturn),
    choicePending: deriveCompatibilityChoicePending(microturn),
    selectedAction: deriveCompatibilitySelectedAction(microturn),
    partialMove: deriveCompatibilityPartialMove(microturn),
    choiceStack: deriveCompatibilityChoiceStack(microturn),
  };
}

function decisionKeyForMicroturn(microturn: MicroturnState): MicroturnState['compoundTurnTrace'][number]['decisionKey'] {
  if (microturn.kind === 'chooseOne' || microturn.kind === 'chooseNStep' || microturn.kind === 'stochasticResolve') {
    const context = microturn.decisionContext as ChooseOneContext | ChooseNStepContext | StochasticResolveContext;
    return context.decisionKey;
  }
  return null;
}

function appendDecisionToTrace(
  microturn: MicroturnState,
  decision: Decision,
): readonly MicroturnState['compoundTurnTrace'][number][] {
  return [
    ...microturn.compoundTurnTrace,
    {
      seatId: microturn.seatId,
      decisionContextKind: microturn.kind,
      decisionKey: decisionKeyForMicroturn(microturn),
      decision,
      frameId: microturn.frameId,
    },
  ];
}

function maybeCompletedMove(
  microturn: MicroturnState,
  decision: Decision,
  result: ApplyDecisionResult,
): Move | null {
  if (!result.log.turnRetired) {
    return null;
  }

  if (microturn.kind === 'actionSelection' && decision.kind === 'actionSelection' && microturn.compoundTurnTrace.length === 0) {
    return decision.move ?? { actionId: decision.actionId, params: {} };
  }

  return rebuildMoveFromTrace(appendDecisionToTrace(microturn, decision));
}

function toRenderContext(inputs: RenderDerivationInputs): RenderContext | null {
  if (inputs.playerID === null) {
    return null;
  }

  return {
    playerID: inputs.playerID,
    legalMoveResult: inputs.legalMoveResult,
    actionAvailabilityById: inputs.actionAvailabilityById,
    choicePending: inputs.choicePending,
    selectedAction: inputs.selectedAction,
    partialMove: inputs.partialMove,
    choiceStack: inputs.choiceStack,
    playerSeats: inputs.playerSeats,
    terminal: inputs.terminal,
  };
}

function deriveStoreRunnerProjection(
  inputs: RenderDerivationInputs,
  previousProjection: RunnerProjectionBundle | null,
): RunnerProjectionBundle | null {
  if (inputs.gameDef === null || inputs.gameState === null) {
    return null;
  }
  const context = toRenderContext(inputs);
  if (context === null) {
    return null;
  }
  return deriveRunnerFrame(inputs.gameState, inputs.gameDef, context, previousProjection);
}

function deriveStoreWorldLayout(
  gameDef: GameDef | null,
  visualConfigProvider: VisualConfigProvider,
): WorldLayoutModel | null {
  if (gameDef === null || !Array.isArray(gameDef.zones)) {
    return null;
  }

  return getOrComputeLayout(gameDef, visualConfigProvider).worldLayout;
}

function toRenderDerivationInputs(state: MutableGameStoreState): RenderDerivationInputs {
  return {
    gameDef: state.gameDef,
    gameState: state.gameState,
    playerID: state.playerID,
    currentMicroturn: state.currentMicroturn,
    legalMoveResult: state.legalMoveResult,
    actionAvailabilityById: state.actionAvailabilityById,
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
    currentMicroturn: state.currentMicroturn,
    gameLifecycle: state.gameLifecycle,
    loading: state.loading,
    error: state.error,
    orchestrationDiagnostic: state.orchestrationDiagnostic,
    orchestrationDiagnosticSequence: state.orchestrationDiagnosticSequence,
    legalMoveResult: state.legalMoveResult,
    actionAvailabilityById: state.actionAvailabilityById,
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
    appliedMoveEvent: state.appliedMoveEvent,
    appliedMoveSequence: state.appliedMoveSequence,
    activePhaseBanner: state.activePhaseBanner,
    worldLayout: state.worldLayout,
  };
}

function materializeNextState(current: GameStore, patch: Partial<MutableGameStoreState>): MutableGameStoreState {
  return {
    ...snapshotMutableState(current),
    ...patch,
  };
}

function emitMoveAppliedTrace(
  traceBus: TraceBus,
  state: Pick<GameStoreState, 'playerID' | 'renderModel'>,
  mutationInputs: MutationTransitionInputs,
  move: Move,
  result: Pick<ApplyDecisionResult, 'triggerFirings' | 'effectTrace' | 'conditionTrace' | 'decisionTrace' | 'selectorTrace'>,
  agentDecision?: AgentDecisionTrace,
): void {
  const tracePlayer = state.renderModel?.activePlayerID ?? state.playerID;
  if (tracePlayer === null || tracePlayer === undefined) {
    return;
  }

  const tracePlayerName = state.renderModel?.players.find((player) => player.id === tracePlayer)?.displayName;
  traceBus.emit({
    kind: 'move-applied',
    turnCount: mutationInputs.gameState.turnCount,
    player: tracePlayer,
    ...(tracePlayerName !== undefined ? { seatId: tracePlayerName } : {}),
    move,
    deltas: [],
    triggerFirings: result.triggerFirings,
    effectTrace: result.effectTrace ?? [],
    ...(result.conditionTrace !== undefined ? { conditionTrace: result.conditionTrace } : {}),
    ...(result.decisionTrace !== undefined ? { decisionTrace: result.decisionTrace } : {}),
    ...(result.selectorTrace !== undefined ? { selectorTrace: result.selectorTrace } : {}),
    ...(agentDecision === undefined ? {} : { agentDecision }),
  });

  if (mutationInputs.terminal !== null) {
    traceBus.emit({
      kind: 'game-terminal',
      result: mutationInputs.terminal,
      turnCount: mutationInputs.gameState.turnCount,
    });
  }
}

async function deriveActionAvailabilityById(
  bridge: GameWorkerAPI,
  gameState: GameState,
  currentMicroturn: MicroturnState | null,
): Promise<ReadonlyMap<string, boolean>> {
  const actionIds = currentMicroturn?.kind === 'actionSelection'
    ? Array.from(new Set(
      currentMicroturn.legalActions
        .filter((decision): decision is Extract<Decision, { readonly kind: 'actionSelection' }> => decision.kind === 'actionSelection')
        .map((decision) => String(decision.actionId)),
    ))
    : [];
  if (actionIds.length === 0) {
    return new Map<string, boolean>();
  }

  const described = await Promise.all(
    actionIds.map(async (actionId) => ({
      actionId,
      description: await bridge.describeAction(actionId, { actorPlayer: gameState.activePlayer }),
    })),
  );

  const availabilityByActionId = new Map<string, boolean>();
  for (const { actionId, description } of described) {
    availabilityByActionId.set(actionId, description?.tooltipPayload?.ruleState.available ?? true);
  }
  return availabilityByActionId;
}

function toBlockedActionError(
  actionId: ActionId,
  description: Awaited<ReturnType<GameWorkerAPI['describeAction']>>,
): WorkerError {
  return {
    code: 'ILLEGAL_MOVE',
    message: `Blocked action: ${String(actionId)}`,
    details: {
      actionId: String(actionId),
      ...(description?.tooltipPayload?.ruleState === undefined
        ? {}
        : { ruleState: description.tooltipPayload.ruleState }),
    },
  };
}

export function createGameStore(
  bridge: GameWorkerAPI,
  visualConfigProvider: VisualConfigProvider,
  options?: CreateGameStoreOptions,
): UseBoundStore<StoreApi<GameStore>> {
  const agentTurnOrchestrator = options?.agentTurnOrchestrator ?? createAgentTurnOrchestrator();
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
          agentTurnOrchestrator.resetSession();
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

      const setAndDerive = (patch: Partial<MutableGameStoreState>): void => {
        set((current) => {
          const nextState = materializeNextState(current, patch);
          const runnerProjection = deriveStoreRunnerProjection(
            toRenderDerivationInputs(nextState),
            current.runnerProjection,
          );
          const runnerFrame = runnerProjection?.frame ?? null;
          const worldLayout = deriveStoreWorldLayout(nextState.gameDef, visualConfigProvider);
          return {
            ...patch,
            worldLayout,
            runnerProjection,
            runnerFrame,
            renderModel: runnerProjection === null
              ? null
              : projectRenderModel(runnerProjection, visualConfigProvider, current.renderModel),
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
        const terminal = await bridge.terminalResult();
        const currentMicroturn = terminal === null
          ? await bridge.publishMicroturn()
          : null;
        const legalMoveResult = synthesizeLegalMoveResult(currentMicroturn);
        const actionAvailabilityById = await deriveActionAvailabilityById(bridge, gameState, currentMicroturn);
        return {
          gameState,
          currentMicroturn,
          legalMoveResult,
          actionAvailabilityById,
          terminal,
        };
      };

      const submitDecision = async (
        decision: Decision,
        agentDecision?: AgentDecisionTrace,
      ): Promise<void> => {
        await runActionOperation(async (ctx) => {
          const state = get();
          const currentMicroturn = state.currentMicroturn;
          if (currentMicroturn === null) {
            return;
          }
          const applied = await bridge.applyDecision(decision, undefined, toOperationStamp(ctx));
          const mutationInputs = await deriveMutationInputs(applied.state);
          const completedMove = maybeCompletedMove(currentMicroturn, decision, applied);
          const appliedMovePatch = completedMove === null
            ? { appliedMoveEvent: null, appliedMoveSequence: state.appliedMoveSequence }
            : buildAppliedMoveEventPatch(state, completedMove);
          const lifecycle = assertLifecycleTransition(
            state.gameLifecycle,
            lifecycleFromTerminal(mutationInputs.terminal),
            'submitDecision',
          );
          const wasApplied = guardSetAndDerive(ctx, {
            ...buildStateMutationState(
              mutationInputs.gameState,
              mutationInputs.currentMicroturn,
              mutationInputs.legalMoveResult,
              mutationInputs.actionAvailabilityById,
              mutationInputs.terminal,
              lifecycle,
              applied.effectTrace ?? [],
              applied.triggerFirings,
            ),
            ...appliedMovePatch,
            ...buildMicroturnCompatibilityPatch(mutationInputs.currentMicroturn),
          });
          if (!wasApplied || completedMove === null) {
            return;
          }
          options?.onMoveApplied?.(completedMove);
          if (options?.traceBus !== undefined) {
            emitMoveAppliedTrace(options.traceBus, state, mutationInputs, completedMove, applied, agentDecision);
          }
        });
      };

      const resolveSingleAiStep = async (ctx: OperationContext): Promise<AiStepOutcome> => {
        const state = get();
        if (state.gameLifecycle === 'terminal') {
          return 'terminal';
        }
        if (state.renderModel === null || state.gameDef === null || state.gameState === null || state.currentMicroturn === null) {
          return 'no-op';
        }

        const activePlayerId = state.renderModel.activePlayerID;
        const activeController = state.playerSeats.get(activePlayerId);
        const aiStep = agentTurnOrchestrator.resolveStep({
          controller: activeController,
          def: state.gameDef,
          microturn: state.currentMicroturn,
          state: state.gameState,
        });

        if (aiStep.kind === 'no-session') {
          return 'no-op';
        }
        if (aiStep.kind === 'human-turn') {
          return 'human-turn';
        }
        if (aiStep.kind === 'illegal-decision') {
          guardSetAndDerive(ctx, {
            error: toWorkerError(aiStep.error),
          });
          return 'illegal-template';
        }
        if (aiStep.kind === 'no-legal-actions') {
          guardSetAndDerive(ctx, { error: null });
          return 'no-legal-moves';
        }

        let applied;
        try {
          applied = await bridge.applyDecision(aiStep.decision, undefined, toOperationStamp(ctx));
        } catch (error) {
          guardSetAndDerive(ctx, {
            error: toWorkerError(error),
          });
          return 'illegal-template';
        }

        const mutationInputs = await deriveMutationInputs(applied.state);
        const completedMove = maybeCompletedMove(state.currentMicroturn, aiStep.decision, applied);
        const appliedMovePatch = completedMove === null
          ? { appliedMoveEvent: null, appliedMoveSequence: state.appliedMoveSequence }
          : buildAppliedMoveEventPatch(state, completedMove);
        const lifecycle = assertLifecycleTransition(
          state.gameLifecycle,
          lifecycleFromTerminal(mutationInputs.terminal),
          'resolveAiTurn',
        );
        const wasApplied = guardSetAndDerive(ctx, {
          ...buildStateMutationState(
            mutationInputs.gameState,
            mutationInputs.currentMicroturn,
            mutationInputs.legalMoveResult,
            mutationInputs.actionAvailabilityById,
            mutationInputs.terminal,
            lifecycle,
            applied.effectTrace ?? [],
            applied.triggerFirings,
          ),
          ...appliedMovePatch,
          ...buildMicroturnCompatibilityPatch(mutationInputs.currentMicroturn),
        });
        if (!wasApplied) {
          return 'no-op';
        }
        if (completedMove !== null) {
          options?.onMoveApplied?.(completedMove);
        }

        if (options?.traceBus !== undefined && aiStep.agentDecision !== undefined && completedMove !== null) {
          emitMoveAppliedTrace(options.traceBus, state, mutationInputs, completedMove, applied, aiStep.agentDecision);
        }

        return 'advanced';
      };

      return {
        ...INITIAL_STATE,
        playerSeats: new Map<PlayerId, SeatController>(),

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
            const { state: gameState, setupTrace } = await bridge.init(def, seed, { playerCount: playerConfig.length }, toOperationStamp(operation));
            const mutationInputs = await deriveMutationInputs(gameState);
            agentTurnOrchestrator.initializeSession({ def, seed, playerCount: gameState.playerCount });
            const lifecycle = assertLifecycleTransition(
              get().gameLifecycle,
              lifecycleFromTerminal(mutationInputs.terminal),
              'initGame:success',
            );
            guardSetAndDerive(
              operation,
              {
                ...buildInitSuccessState(
                  def,
                  gameState,
                  playerConfig,
                  mutationInputs.currentMicroturn,
                  mutationInputs.legalMoveResult,
                  mutationInputs.actionAvailabilityById,
                  mutationInputs.terminal,
                  lifecycle,
                  setupTrace,
                ),
                ...buildMicroturnCompatibilityPatch(mutationInputs.currentMicroturn),
              },
            );

            if (options?.traceBus !== undefined) {
              options.traceBus.emit({
                kind: 'game-initialized',
                seed,
                playerCount: playerConfig.length,
                phase: String(gameState.currentPhase),
              });
            }
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
            const mutationInputs = await deriveMutationInputs(gameState);
            agentTurnOrchestrator.initializeSession({ def, seed, playerCount: gameState.playerCount });
            const lifecycle = assertLifecycleTransition(
              get().gameLifecycle,
              lifecycleFromTerminal(mutationInputs.terminal),
              'initGameFromHistory:success',
            );
            guardSetAndDerive(
              operation,
              {
                ...buildInitSuccessState(
                  def,
                  gameState,
                  playerConfig,
                  mutationInputs.currentMicroturn,
                  mutationInputs.legalMoveResult,
                  mutationInputs.actionAvailabilityById,
                  mutationInputs.terminal,
                  lifecycle,
                  [],
                ),
                ...buildMicroturnCompatibilityPatch(mutationInputs.currentMicroturn),
              },
            );
          } catch (error) {
            const lifecycle = assertLifecycleTransition(get().gameLifecycle, 'idle', 'initGameFromHistory:failure');
            guardSetAndDerive(operation, buildInitFailureState(error, lifecycle));
          } finally {
            finishOperation(operation);
          }
        },

        hydrateFromReplayStep(gameState, currentMicroturn, terminal, effectTrace, triggerFirings) {
          agentTurnOrchestrator.resetSession();
          const lifecycle = assertLifecycleTransition(
            get().gameLifecycle,
            lifecycleFromTerminal(terminal),
            'hydrateFromReplayStep',
          );
          setAndDerive(
            {
              ...buildStateMutationState(
                gameState,
                currentMicroturn,
                synthesizeLegalMoveResult(currentMicroturn),
                get().actionAvailabilityById,
                terminal,
                lifecycle,
                effectTrace,
                triggerFirings,
              ),
              ...buildMicroturnCompatibilityPatch(currentMicroturn),
            },
          );
        },

        reportBootstrapFailure(error) {
          agentTurnOrchestrator.resetSession();
          const lifecycle = assertLifecycleTransition(get().gameLifecycle, 'idle', 'reportBootstrapFailure');
          setAndDerive(buildInitFailureState(error, lifecycle));
        },

        async selectAction(actionId, actionClass) {
          const state = get();
          const currentMicroturn = state.currentMicroturn;
          if (currentMicroturn === null || currentMicroturn.kind !== 'actionSelection') {
            return;
          }
          const selected = currentMicroturn.legalActions.find(
            (decision): decision is Extract<Decision, { readonly kind: 'actionSelection' }> =>
              decision.kind === 'actionSelection'
              && decision.actionId === actionId
              && (actionClass === undefined || decision.move?.actionClass === actionClass),
          );
          if (selected === undefined) {
            const description = state.gameState === null
              ? null
              : await bridge.describeAction(String(actionId), { actorPlayer: state.gameState.activePlayer });
            await runActionOperation(async (ctx) => {
              guardSetAndDerive(ctx, {
                error: toBlockedActionError(actionId, description),
                ...resetMoveConstructionState(),
              });
            });
            return;
          }
          await submitDecision(selected);
        },

        async chooseOne(choice) {
          const currentMicroturn = get().currentMicroturn;
          if (currentMicroturn === null || currentMicroturn.kind !== 'chooseOne') {
            return;
          }
          const selected = currentMicroturn.legalActions.find(
            (decision): decision is Extract<Decision, { readonly kind: 'chooseOne' }> =>
              decision.kind === 'chooseOne' && decision.value === choice,
          );
          if (selected === undefined) {
            return;
          }
          await submitDecision(selected);
        },

        async addChooseNItem(choice) {
          const currentMicroturn = get().currentMicroturn;
          if (currentMicroturn === null || currentMicroturn.kind !== 'chooseNStep') {
            return;
          }
          const selected = currentMicroturn.legalActions.find(
            (decision): decision is Extract<Decision, { readonly kind: 'chooseNStep' }> =>
              decision.kind === 'chooseNStep' && decision.command === 'add' && decision.value === choice,
          );
          if (selected === undefined) {
            return;
          }
          await submitDecision(selected);
        },

        async removeChooseNItem(choice) {
          const currentMicroturn = get().currentMicroturn;
          if (currentMicroturn === null || currentMicroturn.kind !== 'chooseNStep') {
            return;
          }
          const selected = currentMicroturn.legalActions.find(
            (decision): decision is Extract<Decision, { readonly kind: 'chooseNStep' }> =>
              decision.kind === 'chooseNStep' && decision.command === 'remove' && decision.value === choice,
          );
          if (selected === undefined) {
            return;
          }
          await submitDecision(selected);
        },

        async confirmChooseN() {
          const currentMicroturn = get().currentMicroturn;
          if (currentMicroturn === null || currentMicroturn.kind !== 'chooseNStep') {
            return;
          }
          const selected = currentMicroturn.legalActions.find(
            (decision): decision is Extract<Decision, { readonly kind: 'chooseNStep' }> =>
              decision.kind === 'chooseNStep' && decision.command === 'confirm',
          );
          if (selected === undefined) {
            return;
          }
          await submitDecision(selected);
        },

        async confirmMove() {
          return;
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
            const currentMicroturn = state.currentMicroturn;
            if (currentMicroturn === null || currentMicroturn.compoundTurnTrace.length <= 1) {
              return;
            }
            const rewindTarget = await bridge.rewindToTurnBoundary(currentMicroturn.turnId as TurnId, toOperationStamp(ctx));
            if (rewindTarget === null) {
              return;
            }
            const replayDecisions = currentMicroturn.compoundTurnTrace
              .slice(0, currentMicroturn.compoundTurnTrace.length - 1)
              .map((entry) => entry.decision);
            let replayState = rewindTarget;
            for (const decision of replayDecisions) {
              const applied = await bridge.applyDecision(decision, { trace: false }, toOperationStamp(ctx));
              replayState = applied.state;
            }
            const mutationInputs = await deriveMutationInputs(replayState);
            const lifecycle = assertLifecycleTransition(
              state.gameLifecycle,
              lifecycleFromTerminal(mutationInputs.terminal),
              'cancelChoice',
            );
            guardSetAndDerive(ctx, {
              ...buildStateMutationState(
                mutationInputs.gameState,
                mutationInputs.currentMicroturn,
                mutationInputs.legalMoveResult,
                mutationInputs.actionAvailabilityById,
                mutationInputs.terminal,
                lifecycle,
                [],
                [],
              ),
              ...buildMicroturnCompatibilityPatch(mutationInputs.currentMicroturn),
              error: null,
            });
          });
        },

        async cancelMove() {
          await runActionOperation(async (ctx) => {
            const currentMicroturn = get().currentMicroturn;
            if (currentMicroturn === null) {
              return;
            }
            const isRootActionSelection = currentMicroturn.kind === 'actionSelection' && currentMicroturn.compoundTurnTrace.length === 0;
            if (isRootActionSelection) {
              return;
            }
            const restored = await bridge.rewindToTurnBoundary(currentMicroturn.turnId as TurnId, toOperationStamp(ctx));
            if (restored === null) {
              return;
            }
            const mutationInputs = await deriveMutationInputs(restored);
            const lifecycle = assertLifecycleTransition(
              get().gameLifecycle,
              lifecycleFromTerminal(mutationInputs.terminal),
              'cancelMove',
            );
            guardSetAndDerive(ctx, {
              ...buildStateMutationState(
                mutationInputs.gameState,
                mutationInputs.currentMicroturn,
                mutationInputs.legalMoveResult,
                mutationInputs.actionAvailabilityById,
                mutationInputs.terminal,
                lifecycle,
                [],
                [],
              ),
              ...buildMicroturnCompatibilityPatch(mutationInputs.currentMicroturn),
              error: null,
            });
          });
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
                mutationInputs.currentMicroturn,
                mutationInputs.legalMoveResult,
                mutationInputs.actionAvailabilityById,
                mutationInputs.terminal,
                lifecycle,
                [],
                [],
              ),
              ...buildMicroturnCompatibilityPatch(mutationInputs.currentMicroturn),
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

        reportPlaybackDiagnostic(message) {
          set((state) => {
            const sequence = state.orchestrationDiagnosticSequence + 1;
            return {
              orchestrationDiagnosticSequence: sequence,
              orchestrationDiagnostic: {
                sequence,
                code: 'AI_PLAYBACK',
                message,
              },
            };
          });
        },

        clearOrchestrationDiagnostic() {
          set({ orchestrationDiagnostic: null });
        },

        clearError() {
          set({ error: null });
        },

        reportCanvasCrash() {
          const lifecycle = get().gameLifecycle;
          if (lifecycle !== 'playing' && lifecycle !== 'terminal') {
            return;
          }

          set({
            gameLifecycle: assertLifecycleTransition(lifecycle, 'canvasCrashed', 'reportCanvasCrash'),
          });
        },

        beginCanvasRecovery() {
          const lifecycle = get().gameLifecycle;
          if (lifecycle !== 'canvasCrashed') {
            return;
          }

          set({
            gameLifecycle: assertLifecycleTransition(lifecycle, 'reinitializing', 'beginCanvasRecovery'),
          });
        },

        canvasRecovered() {
          const state = get();
          if (state.gameLifecycle !== 'reinitializing') {
            return;
          }

          set({
            gameLifecycle: assertLifecycleTransition(
              state.gameLifecycle,
              lifecycleFromTerminal(state.terminal),
              'canvasRecovered',
            ),
          });
        },

        setActivePhaseBanner(phase) {
          set({ activePhaseBanner: phase });
        },
      };
    }),
  );
}
