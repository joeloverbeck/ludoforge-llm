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

export const serializeGameState = (state: GameState): SerializedGameState => ({
  ...state,
  rng: {
    algorithm: state.rng.algorithm,
    version: state.rng.version,
    state: state.rng.state.map((word) => toHexBigInt(word)),
  },
  stateHash: toHexBigInt(state.stateHash),
});

export const deserializeGameState = (state: SerializedGameState): GameState => {
  const deserialized: GameState = {
    ...state,
    rng: {
      algorithm: state.rng.algorithm,
      version: state.rng.version,
      state: state.rng.state.map((word, index) => fromHexBigInt(word, `rng.state[${index}]`)),
    },
    stateHash: fromHexBigInt(state.stateHash, 'stateHash'),
  };
  validateTurnFlowRuntimeStateInvariants(deserialized);
  return deserialized;
};

export const serializeTrace = (trace: GameTrace): SerializedGameTrace => ({
  ...trace,
  moves: trace.moves.map((move) => ({
    ...move,
    stateHash: toHexBigInt(move.stateHash),
  })),
  finalState: serializeGameState(trace.finalState),
});

export const deserializeTrace = (trace: SerializedGameTrace): GameTrace => ({
  ...trace,
  moves: trace.moves.map((move, index) => ({
    ...move,
    stateHash: fromHexBigInt(move.stateHash, `moves[${index}].stateHash`),
  })),
  finalState: deserializeGameState(trace.finalState),
});
