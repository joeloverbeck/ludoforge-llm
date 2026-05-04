const FNV_OFFSET_BASIS_64 = 0xcbf29ce484222325n;
const FNV_OFFSET_LOW_32 = Number(FNV_OFFSET_BASIS_64 & 0xffff_ffffn) >>> 0;
const FNV_OFFSET_HIGH_32 = Number((FNV_OFFSET_BASIS_64 >> 32n) & 0xffff_ffffn) >>> 0;
const FNV_PRIME_LOW_32 = 0x1b3;
const FNV_PRIME_HIGH_32 = 0x100;

export interface Fnv1a64State {
  readonly low: number;
  readonly high: number;
}

const FNV_OFFSET_STATE: Fnv1a64State = {
  low: FNV_OFFSET_LOW_32,
  high: FNV_OFFSET_HIGH_32,
};

export const updateFnv1a64State = (
  input: string,
  initial: Fnv1a64State = FNV_OFFSET_STATE,
): Fnv1a64State => {
  let low = initial.low;
  let high = initial.high;
  for (let index = 0; index < input.length; index += 1) {
    low = (low ^ input.charCodeAt(index)) >>> 0;
    const lowProduct = low * FNV_PRIME_LOW_32;
    const nextLow = lowProduct >>> 0;
    const carry = Math.floor(lowProduct / 0x1_0000_0000) >>> 0;
    high = (
      Math.imul(high, FNV_PRIME_LOW_32)
      + Math.imul(low, FNV_PRIME_HIGH_32)
      + carry
    ) >>> 0;
    low = nextLow;
  }
  return { low, high };
};

export const fnv1a64FromState = (
  input: string,
  initial: Fnv1a64State,
): bigint => {
  const { low, high } = updateFnv1a64State(input, initial);
  return (BigInt(high) << 32n) | BigInt(low);
};

export const fnv1a64 = (input: string): bigint => {
  let low = FNV_OFFSET_LOW_32;
  let high = FNV_OFFSET_HIGH_32;
  for (let index = 0; index < input.length; index += 1) {
    low = (low ^ input.charCodeAt(index)) >>> 0;
    const lowProduct = low * FNV_PRIME_LOW_32;
    const nextLow = lowProduct >>> 0;
    const carry = Math.floor(lowProduct / 0x1_0000_0000) >>> 0;
    high = (
      Math.imul(high, FNV_PRIME_LOW_32)
      + Math.imul(low, FNV_PRIME_HIGH_32)
      + carry
    ) >>> 0;
    low = nextLow;
  }
  return (BigInt(high) << 32n) | BigInt(low);
};
