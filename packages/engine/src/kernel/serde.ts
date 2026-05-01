import type {
  GameState,
  GameTrace,
  HexBigInt,
  Rng,
  SerializedRng,
  SerializedGameState,
  SerializedGameTrace,
} from './types.js';
import type {
  DecisionStackFrame,
  EffectExecutionFrameSnapshot,
  SerializedDecisionStackFrame,
  SerializedEffectExecutionFrameSnapshot,
  SerializedSuspendedEffectFrameSnapshot,
  SuspendedEffectFrameSnapshot,
} from './microturn/types.js';
import { validateTurnFlowRuntimeStateInvariants } from './turn-flow-runtime-invariants.js';

const HEX_BIGINT_PATTERN = /^0x[0-9a-f]+$/;

const toHexBigInt = (value: bigint): HexBigInt => {
  if (value < 0n) {
    throw new RangeError(`Expected non-negative bigint, received ${value.toString()}`);
  }

  return `0x${value.toString(16)}`;
};

const fromHexBigInt = (value: HexBigInt, path: string): bigint => {
  if (!HEX_BIGINT_PATTERN.test(value)) {
    throw new TypeError(`Invalid hex bigint at ${path}: ${value}`);
  }

  return BigInt(value);
};

const serializeRng = (rng: Rng): SerializedRng => ({
  state: {
    algorithm: rng.state.algorithm,
    version: rng.state.version,
    state: rng.state.state.map((word) => toHexBigInt(word)),
  },
});

const deserializeRng = (serialized: SerializedRng): Rng => ({
  state: {
    algorithm: serialized.state.algorithm,
    version: serialized.state.version,
    state: serialized.state.state.map((word, index) => fromHexBigInt(word, `rng.state.state[${index}]`)),
  },
});

const serializeSuspendedFrame = (
  frame: SuspendedEffectFrameSnapshot,
): SerializedSuspendedEffectFrameSnapshot => ({
  state: serializeGameState(frame.state),
  rng: serializeRng(frame.rng),
  actorPlayer: frame.actorPlayer,
  bindings: frame.bindings,
  ...(frame.freeOperationOverlay !== undefined ? { freeOperationOverlay: frame.freeOperationOverlay } : {}),
  leaf: frame.leaf,
  resumeStack: frame.resumeStack,
});

const deserializeSuspendedFrame = (
  serialized: SerializedSuspendedEffectFrameSnapshot,
): SuspendedEffectFrameSnapshot => ({
  state: deserializeGameState(serialized.state),
  rng: deserializeRng(serialized.rng),
  actorPlayer: serialized.actorPlayer,
  bindings: serialized.bindings,
  ...(serialized.freeOperationOverlay !== undefined ? { freeOperationOverlay: serialized.freeOperationOverlay } : {}),
  leaf: serialized.leaf,
  resumeStack: serialized.resumeStack,
});

const serializeEffectFrame = (
  frame: EffectExecutionFrameSnapshot,
): SerializedEffectExecutionFrameSnapshot => ({
  programCounter: frame.programCounter,
  boundedIterationCursors: frame.boundedIterationCursors,
  localBindings: frame.localBindings,
  pendingTriggerQueue: frame.pendingTriggerQueue,
  ...(frame.decisionHistory !== undefined ? { decisionHistory: frame.decisionHistory } : {}),
  ...(frame.suspendedFrame !== undefined ? { suspendedFrame: serializeSuspendedFrame(frame.suspendedFrame) } : {}),
});

const deserializeEffectFrame = (
  serialized: SerializedEffectExecutionFrameSnapshot,
): EffectExecutionFrameSnapshot => ({
  programCounter: serialized.programCounter,
  boundedIterationCursors: serialized.boundedIterationCursors,
  localBindings: serialized.localBindings,
  pendingTriggerQueue: serialized.pendingTriggerQueue,
  ...(serialized.decisionHistory !== undefined ? { decisionHistory: serialized.decisionHistory } : {}),
  ...(serialized.suspendedFrame !== undefined ? { suspendedFrame: deserializeSuspendedFrame(serialized.suspendedFrame) } : {}),
});

const serializeDecisionStack = (
  stack: readonly DecisionStackFrame[],
): readonly SerializedDecisionStackFrame[] =>
  stack.map((frame) => ({
    frameId: frame.frameId,
    parentFrameId: frame.parentFrameId,
    turnId: frame.turnId,
    context: frame.context,
    ...(frame.continuationBindings !== undefined ? { continuationBindings: frame.continuationBindings } : {}),
    effectFrame: serializeEffectFrame(frame.effectFrame),
  }));

const deserializeDecisionStack = (
  serialized: readonly SerializedDecisionStackFrame[],
): readonly DecisionStackFrame[] =>
  serialized.map((frame) => ({
    frameId: frame.frameId,
    parentFrameId: frame.parentFrameId,
    turnId: frame.turnId,
    context: frame.context,
    ...(frame.continuationBindings !== undefined ? { continuationBindings: frame.continuationBindings } : {}),
    effectFrame: deserializeEffectFrame(frame.effectFrame),
  }));

/**
 * Recursively converts any residual BigInt values inside a serialized
 * structure into hex strings, returning a new object. The top-level
 * conversions in `serializeGameState` and `serializeTrace` cover the primary
 * BigInt fields (`stateHash`, `rng.state`, etc.); this walker catches
 * BigInts that live inside nested snapshots — most notably
 * `decisionStack[i].effectFrame.suspendedFrame.state` and similar
 * effect-frame closures the kernel preserves verbatim through immutable
 * updates. Only invoked as a defensive pass after the primary conversion so
 * the canonical hot path stays cheap. F11 is preserved: the input is never
 * mutated; new arrays/objects are returned for any subtree that contains a
 * BigInt.
 *
 * Retained for 151DECSTACSER-004, which owns deletion plus grep enforcement.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- retained until 151DECSTACSER-004 deletes the walker bodies
const sanitizeNestedBigInts = (value: unknown): unknown => {
  if (typeof value === 'bigint') {
    return toHexBigInt(value);
  }
  if (Array.isArray(value)) {
    let changed = false;
    const next: unknown[] = new Array(value.length);
    for (let i = 0; i < value.length; i += 1) {
      const sanitized = sanitizeNestedBigInts(value[i]);
      next[i] = sanitized;
      if (sanitized !== value[i]) {
        changed = true;
      }
    }
    return changed ? next : value;
  }
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    let changed = false;
    const next: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
      const sanitized = sanitizeNestedBigInts(obj[key]);
      next[key] = sanitized;
      if (sanitized !== obj[key]) {
        changed = true;
      }
    }
    return changed ? next : obj;
  }
  return value;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- retained until 151DECSTACSER-004 deletes the walker bodies
const restoreNestedSerializedBigInts = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    let changed = false;
    const next: unknown[] = new Array(value.length);
    for (let i = 0; i < value.length; i += 1) {
      const restored = restoreNestedSerializedBigInts(value[i]);
      next[i] = restored;
      if (restored !== value[i]) {
        changed = true;
      }
    }
    return changed ? next : value;
  }
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    let changed = false;
    const next: Record<string, unknown> = {};
    const isRngState =
      typeof obj.algorithm === 'string'
      && typeof obj.version === 'number'
      && Array.isArray(obj.state);

    for (const key of Object.keys(obj)) {
      const current = obj[key];
      const restored =
        (key === 'stateHash' || key === '_runningHash') && typeof current === 'string' && HEX_BIGINT_PATTERN.test(current)
          ? BigInt(current)
          : isRngState && key === 'state' && Array.isArray(current)
            ? current.map((word, index) =>
                typeof word === 'string' && HEX_BIGINT_PATTERN.test(word)
                  ? fromHexBigInt(word as HexBigInt, `nested rng.state[${index}]`)
                  : restoreNestedSerializedBigInts(word),
              )
            : restoreNestedSerializedBigInts(current);
      next[key] = restored;
      if (restored !== current) {
        changed = true;
      }
    }
    return changed ? next : obj;
  }
  return value;
};

export const serializeGameState = (state: GameState): SerializedGameState => {
  const {
    _runningHash: strippedRunningHash,
    decisionStack,
    unavailableActionsPerTurn,
    nextFrameId,
    nextTurnId,
    activeDeciderSeatId,
    turnOrderState,
    ...rest
  } = state;
  void strippedRunningHash;
  const serialized = {
    ...rest,
    rng: {
      algorithm: state.rng.algorithm,
      version: state.rng.version,
      state: state.rng.state.map((word) => toHexBigInt(word)),
    },
    stateHash: toHexBigInt(state.stateHash),
    ...(decisionStack !== undefined ? { decisionStack: serializeDecisionStack(decisionStack) } : {}),
    ...(unavailableActionsPerTurn !== undefined ? { unavailableActionsPerTurn } : {}),
    ...(nextFrameId !== undefined ? { nextFrameId } : {}),
    ...(nextTurnId !== undefined ? { nextTurnId } : {}),
    ...(activeDeciderSeatId !== undefined ? { activeDeciderSeatId } : {}),
    turnOrderState,
  } as {
    -readonly [K in keyof SerializedGameState]: SerializedGameState[K];
  };
  if (serialized.reveals === undefined) {
    delete serialized.reveals;
  }
  if (serialized.globalMarkers === undefined) {
    delete serialized.globalMarkers;
  }
  if (serialized.activeLastingEffects === undefined) {
    delete serialized.activeLastingEffects;
  }
  if (serialized.interruptPhaseStack === undefined) {
    delete serialized.interruptPhaseStack;
  }
  return serialized;
};

export const deserializeGameState = (state: SerializedGameState): GameState => {
  const stateHash = fromHexBigInt(state.stateHash, 'stateHash');
  const { decisionStack, ...rest } = state;
  const deserialized: GameState = {
    ...rest,
    rng: {
      algorithm: state.rng.algorithm,
      version: state.rng.version,
      state: state.rng.state.map((word, index) => fromHexBigInt(word, `rng.state[${index}]`)),
    },
    stateHash,
    _runningHash: stateHash,
    reveals: state.reveals,
    globalMarkers: state.globalMarkers,
    activeLastingEffects: state.activeLastingEffects,
    interruptPhaseStack: state.interruptPhaseStack,
    ...(decisionStack !== undefined ? { decisionStack: deserializeDecisionStack(decisionStack) } : {}),
  };
  validateTurnFlowRuntimeStateInvariants(deserialized);
  return deserialized;
};

export const serializeTrace = (trace: GameTrace): SerializedGameTrace => ({
  ...trace,
  decisions: trace.decisions.map((decision) => ({
    ...decision,
    stateHash: toHexBigInt(decision.stateHash),
  })),
  probeHoleRecoveries: trace.probeHoleRecoveries.map((recovery) => ({
    ...recovery,
    stateHashBefore: toHexBigInt(recovery.stateHashBefore),
    stateHashAfter: toHexBigInt(recovery.stateHashAfter),
  })),
  finalState: serializeGameState(trace.finalState),
});

export const deserializeTrace = (trace: SerializedGameTrace): GameTrace => ({
  ...trace,
  decisions: trace.decisions.map((decision, index) => ({
    ...decision,
    stateHash: fromHexBigInt(decision.stateHash, `decisions[${index}].stateHash`),
  })),
  probeHoleRecoveries: trace.probeHoleRecoveries.map((recovery, index) => ({
    ...recovery,
    stateHashBefore: fromHexBigInt(recovery.stateHashBefore, `probeHoleRecoveries[${index}].stateHashBefore`),
    stateHashAfter: fromHexBigInt(recovery.stateHashAfter, `probeHoleRecoveries[${index}].stateHashAfter`),
  })),
  finalState: deserializeGameState(trace.finalState),
});
