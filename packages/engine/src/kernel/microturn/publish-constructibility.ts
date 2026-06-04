import type { SeatId } from '../branded.js';
import { createGameDefRuntime, type GameDefRuntime } from '../gamedef-runtime.js';
import { toMoveIdentityKey } from '../move-identity.js';
import type {
  ChoicePendingRequest,
  GameDef,
  GameState,
  Move,
} from '../types-core.js';
import type { MoveParamScalar } from '../types-ast.js';
import { LruCache } from '../../shared/lru-cache.js';
import type { ChooseNTemplate } from '../choose-n-session.js';
import type { DecisionContinuationResult } from './continuation.js';
import {
  resolveActiveDeciderSeatIdForPlayer,
  type ChooseNStepContext,
  type ChooseNStepDecision,
  type ChooseOneContext,
  type EffectExecutionFrameSnapshot,
} from './types.js';

const PUBLISHABLE_FIRST_CONTINUATION_CACHE_LIMIT = 50_000;
const publishableFirstContinuationCache = new LruCache<string, boolean>(PUBLISHABLE_FIRST_CONTINUATION_CACHE_LIMIT);

const activeSeatForPlayer = (def: GameDef, state: GameState): SeatId =>
  resolveActiveDeciderSeatIdForPlayer(def, Number(state.activePlayer));

const getRuntime = (def: GameDef, runtime?: GameDefRuntime): GameDefRuntime =>
  runtime ?? createGameDefRuntime(def);

const scalarKey = (value: MoveParamScalar): string => JSON.stringify([typeof value, value]);

const toChooseOneContext = (
  request: ChoicePendingRequest & { readonly type: 'chooseOne' },
  seatId: SeatId,
): ChooseOneContext => ({
  kind: 'chooseOne',
  seatId,
  decisionKey: request.decisionKey,
  options: request.options,
  targetKinds: request.targetKinds,
  ...(request.stageIndex === undefined ? {} : { stageIndex: request.stageIndex }),
  ...(request.decisionPath === undefined ? {} : { decisionPath: request.decisionPath }),
});

const toChooseNStepContext = (
  request: ChoicePendingRequest & { readonly type: 'chooseN' },
  seatId: SeatId,
  template?: ChooseNTemplate,
): ChooseNStepContext => ({
  kind: 'chooseNStep',
  seatId,
  decisionKey: request.decisionKey,
  options: request.options,
  targetKinds: request.targetKinds,
  ...(request.stageIndex === undefined ? {} : { stageIndex: request.stageIndex }),
  ...(request.decisionPath === undefined ? {} : { decisionPath: request.decisionPath }),
  selectedSoFar: request.selected,
  cardinality: {
    min: request.min ?? 0,
    max: request.max ?? request.options.length,
  },
  stepCommands: request.canConfirm ? ['add', 'remove', 'confirm'] : ['add', 'remove'],
  ...(template === undefined
    ? {}
    : {
      templateHint: {
        normalizedDomain: template.normalizedDomain,
        prioritizedTierEntries: template.prioritizedTierEntries,
        qualifierMode: template.qualifierMode,
      },
    }),
});

const continuationEffectFrame = (
  continuation: DecisionContinuationResult,
): EffectExecutionFrameSnapshot => ({
  programCounter: 0,
  boundedIterationCursors: {},
  localBindings: {},
  pendingTriggerQueue: [],
  ...(continuation.suspendedFrame === undefined ? {} : { suspendedFrame: continuation.suspendedFrame }),
});

type AdvanceChooseNStepContextResult =
  | { readonly done: false; readonly nextContext: ChooseNStepContext }
  | { readonly done: true; readonly value: readonly MoveParamScalar[] };

interface ConstructibilityCallbacks {
  readonly withResolvedDecisionValue: (
    move: Move,
    context: ChooseOneContext | ChooseNStepContext,
    value: MoveParamScalar | readonly MoveParamScalar[],
  ) => Move;
  readonly isSupportedFrameContinuationMove: (
    def: GameDef,
    state: GameState,
    effectFrame: EffectExecutionFrameSnapshot,
    move: Move,
    runtime?: GameDefRuntime,
  ) => boolean;
  readonly advanceChooseNStepContext: (
    context: ChooseNStepContext,
    decision: ChooseNStepDecision,
  ) => AdvanceChooseNStepContextResult;
}

export const hasPublishableFirstContinuation = (
  def: GameDef,
  state: GameState,
  move: Move,
  continuation: DecisionContinuationResult,
  callbacks: Pick<ConstructibilityCallbacks, 'withResolvedDecisionValue' | 'isSupportedFrameContinuationMove'>,
  runtime?: GameDefRuntime,
  maxOptions = Number.POSITIVE_INFINITY,
): boolean => {
  const nextDecision = continuation.nextDecision;
  if (nextDecision === undefined) {
    return true;
  }
  const resolvedRuntime = getRuntime(def, runtime);
  const cacheKey = [
    'publishable-first-continuation',
    def.metadata.id,
    String(state.stateHash),
    toMoveIdentityKey(def, move),
    String(nextDecision.decisionPath ?? 'main'),
    String(nextDecision.decisionKey),
    String(maxOptions),
  ].join(':');
  const cached = resolvedRuntime.publicationProbeCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  const sharedCached = publishableFirstContinuationCache.get(cacheKey);
  if (sharedCached !== undefined) {
    resolvedRuntime.publicationProbeCache.set(cacheKey, sharedCached);
    return sharedCached;
  }
  const seatId = activeSeatForPlayer(def, state);
  const effectFrame = continuationEffectFrame(continuation);
  const publishable = (() => {
    if (nextDecision.type === 'chooseN') {
      const context = toChooseNStepContext(nextDecision, seatId, continuation.nextChooseNTemplate);
      if (context.stepCommands.includes('confirm')) {
        const candidateMove = callbacks.withResolvedDecisionValue(move, context, context.selectedSoFar);
        if (callbacks.isSupportedFrameContinuationMove(def, state, effectFrame, candidateMove, resolvedRuntime)) {
          return true;
        }
      }
      const selectedKeys = new Set(context.selectedSoFar.map((value) => scalarKey(value)));
      let inspectedOptions = 0;
      for (const option of context.options) {
        if (
          option.legality === 'illegal'
          || Array.isArray(option.value)
          || selectedKeys.has(scalarKey(option.value as MoveParamScalar))
        ) {
          continue;
        }
        if (inspectedOptions >= maxOptions) {
          break;
        }
        inspectedOptions += 1;
        const candidateMove = callbacks.withResolvedDecisionValue(
          move,
          context,
          [...context.selectedSoFar, option.value as MoveParamScalar],
        );
        if (callbacks.isSupportedFrameContinuationMove(def, state, effectFrame, candidateMove, resolvedRuntime)) {
          return true;
        }
      }
      return false;
    }
    const context = toChooseOneContext(nextDecision, seatId);
    return context.options
      .slice(0, maxOptions)
      .filter((option) => option.legality !== 'illegal')
      .some((option) =>
        !Array.isArray(option.value)
        && callbacks.isSupportedFrameContinuationMove(
          def,
          state,
          effectFrame,
          callbacks.withResolvedDecisionValue(move, context, option.value),
          resolvedRuntime,
        ));
  })();
  publishableFirstContinuationCache.set(cacheKey, publishable);
  resolvedRuntime.publicationProbeCache.set(cacheKey, publishable);
  return publishable;
};

export const hasImmediateChooseNStepProgress = (
  def: GameDef,
  state: GameState,
  baseMove: Move,
  context: ChooseNStepContext,
  effectFrame: EffectExecutionFrameSnapshot,
  callbacks: ConstructibilityCallbacks,
  runtime?: GameDefRuntime,
  maxOptions = Number.POSITIVE_INFINITY,
): boolean => {
  if (context.stepCommands.includes('confirm')) {
    const candidateMove = callbacks.withResolvedDecisionValue(baseMove, context, context.selectedSoFar);
    if (callbacks.isSupportedFrameContinuationMove(def, state, effectFrame, candidateMove, runtime)) {
      return true;
    }
  }

  const selectedKeys = new Set(context.selectedSoFar.map((value) => scalarKey(value)));
  let inspectedOptions = 0;
  for (const option of context.options) {
    if (
      option.legality === 'illegal'
      || Array.isArray(option.value)
      || selectedKeys.has(scalarKey(option.value as MoveParamScalar))
    ) {
      continue;
    }
    if (inspectedOptions >= maxOptions) {
      break;
    }
    inspectedOptions += 1;
    const advanced = callbacks.advanceChooseNStepContext(context, {
      kind: 'chooseNStep',
      decisionKey: context.decisionKey,
      command: 'add',
      value: option.value as MoveParamScalar,
    });
    if (advanced.done) {
      const candidateMove = callbacks.withResolvedDecisionValue(baseMove, context, advanced.value);
      if (callbacks.isSupportedFrameContinuationMove(def, state, effectFrame, candidateMove, runtime)) {
        return true;
      }
      continue;
    }
    const candidateMove = callbacks.withResolvedDecisionValue(baseMove, context, advanced.nextContext.selectedSoFar);
    if (callbacks.isSupportedFrameContinuationMove(def, state, effectFrame, candidateMove, runtime)) {
      return true;
    }
  }
  return false;
};
