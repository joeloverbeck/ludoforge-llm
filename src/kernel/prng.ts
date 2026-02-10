import type { Rng } from './types.js';

const MASK_64 = (1n << 64n) - 1n;
const TWO_TO_64 = 1n << 64n;
const MASK_128 = (1n << 128n) - 1n;
const DEFAULT_INCREMENT = 0xda3e39cb94b95bdbn;
const PCG_128_MULTIPLIER = 0x2360ed051fc65da44385df649fccf645n;
const DXSM_MULTIPLIER = 0xda942042e4dd58b5n;
const SEED_MIX = 0x9e3779b97f4a7c15f39cc0605cedc835n;

const mask64 = (value: bigint): bigint => value & MASK_64;
const mask128 = (value: bigint): bigint => value & MASK_128;

const requireStateWords = (state: readonly bigint[]): [bigint, bigint] => {
  if (state.length !== 2) {
    throw new RangeError(`Expected exactly 2 RNG state words, received ${state.length}`);
  }

  const first = state.at(0);
  const second = state.at(1);

  if (first === undefined || second === undefined) {
    throw new RangeError('RNG state words are missing');
  }

  return [first, second];
};

const requirePcgStateContract = (rng: Rng): [bigint, bigint] => {
  const { algorithm, version, state } = rng.state;

  if (algorithm !== 'pcg-dxsm-128' || version !== 1) {
    throw new RangeError(`Unsupported RNG state contract: ${algorithm}@v${version}`);
  }

  return requireStateWords(state);
};

const ensureOdd = (value: bigint): bigint => value | 1n;

const dxsm = (state128: bigint): bigint => {
  const hi = mask64(state128 >> 64n);
  const lo = mask64(state128);

  let word = mask64((hi ^ (hi >> 32n)) * DXSM_MULTIPLIER);
  word = mask64(word ^ (word >> 48n));
  word = mask64(word * ensureOdd(lo));
  return word;
};

export const createRng = (seed: bigint): Rng => {
  const seed128 = mask128(seed);
  const state = mask128(seed128 ^ SEED_MIX);
  const increment = mask128((seed128 << 1n) ^ DEFAULT_INCREMENT);

  return {
    state: {
      algorithm: 'pcg-dxsm-128',
      version: 1,
      state: [state, ensureOdd(increment)],
    },
  };
};

export const stepRng = (rng: Rng): readonly [bigint, Rng] => {
  const { algorithm, version } = rng.state;
  const [lcgState, increment] = requirePcgStateContract(rng);
  const maskedState = mask128(lcgState);
  const maskedIncrement = ensureOdd(mask128(increment));

  const nextState = mask128(maskedState * PCG_128_MULTIPLIER + maskedIncrement);
  const output = dxsm(maskedState);

  return [
    output,
    {
      state: {
        algorithm,
        version,
        state: [nextState, maskedIncrement],
      },
    },
  ] as const;
};

export const serialize = (rng: Rng): Rng['state'] => {
  const [lcgState, increment] = requirePcgStateContract(rng);

  return {
    algorithm: 'pcg-dxsm-128',
    version: 1,
    state: [mask128(lcgState), ensureOdd(mask128(increment))],
  };
};

export const deserialize = (state: Rng['state']): Rng => {
  const rng = { state };
  const [lcgState, increment] = requirePcgStateContract(rng);

  return {
    state: {
      algorithm: 'pcg-dxsm-128',
      version: 1,
      state: [mask128(lcgState), ensureOdd(mask128(increment))],
    },
  };
};

export const fork = (rng: Rng): readonly [Rng, Rng] => {
  // Use two deterministic draws from a local cursor so parent remains unchanged.
  const [leftSeed, afterLeft] = stepRng(rng);
  const [rightSeed] = stepRng(afterLeft);

  return [createRng(mask128(leftSeed ^ SEED_MIX)), createRng(mask128(rightSeed ^ (SEED_MIX << 1n)))] as const;
};

export const nextInt = (rng: Rng, min: number, max: number): readonly [number, Rng] => {
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max)) {
    throw new RangeError('nextInt bounds must be safe integers');
  }

  if (min > max) {
    throw new RangeError(`nextInt requires min <= max, received min=${min}, max=${max}`);
  }

  const minBigInt = BigInt(min);
  const maxBigInt = BigInt(max);
  const range = maxBigInt - minBigInt + 1n;

  if (range > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError('nextInt range exceeds Number.MAX_SAFE_INTEGER');
  }

  const threshold = TWO_TO_64 - (TWO_TO_64 % range);
  let cursor = rng;

  while (true) {
    const [raw, nextRng] = stepRng(cursor);
    cursor = nextRng;

    if (raw < threshold) {
      const offset = raw % range;
      return [Number(minBigInt + offset), cursor] as const;
    }
  }
};
