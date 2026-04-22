import type {
  GameState,
  GameTrace,
  HexBigInt,
  SerializedGameState,
  SerializedGameTrace,
} from './types.js';
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

export const serializeGameState = (state: GameState): SerializedGameState => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructure to strip internal field from serialized output
  const { _runningHash, ...rest } = state;
  const serialized = {
    ...rest,
    rng: {
      algorithm: state.rng.algorithm,
      version: state.rng.version,
      state: state.rng.state.map((word) => toHexBigInt(word)),
    },
    stateHash: toHexBigInt(state.stateHash),
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
  const deserialized: GameState = {
    ...state,
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
  finalState: serializeGameState(trace.finalState),
});

export const deserializeTrace = (trace: SerializedGameTrace): GameTrace => ({
  ...trace,
  decisions: trace.decisions.map((decision, index) => ({
    ...decision,
    stateHash: fromHexBigInt(decision.stateHash, `decisions[${index}].stateHash`),
  })),
  finalState: deserializeGameState(trace.finalState),
});
