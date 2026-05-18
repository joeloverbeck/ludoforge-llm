import type { Probe } from './probe-types.js';

export const defineProbe = (probe: Probe): Probe => {
  validateProbe(probe);
  return probe;
};

const validateProbe = (probe: Probe): void => {
  if (probe.id.trim().length === 0) {
    throw new Error('Probe id must be non-empty.');
  }
  const stateBindingCount = [
    probe.stateBinding.seed,
    probe.stateBinding.seedRange,
    probe.stateBinding.stateSamples,
  ].filter((binding) => binding !== undefined).length;
  if (stateBindingCount !== 1) {
    throw new Error(`Probe ${probe.id} must set exactly one of stateBinding.seed, stateBinding.seedRange, or stateBinding.stateSamples.`);
  }
  const seedRange = probe.stateBinding.seedRange;
  if (seedRange !== undefined && seedRange.end < seedRange.start) {
    throw new Error(`Probe ${probe.id} seedRange.end must be >= seedRange.start.`);
  }
  const stateSamples = probe.stateBinding.stateSamples;
  if (stateSamples !== undefined && stateSamples.length === 0) {
    throw new Error(`Probe ${probe.id} stateBinding.stateSamples must be non-empty.`);
  }
  if (stateSamples !== undefined && probe.stateBinding.replayPrefix !== undefined) {
    throw new Error(`Probe ${probe.id} must not combine stateBinding.stateSamples with replayPrefix.`);
  }
  if (stateSamples !== undefined && probe.stateBinding.expectedStateHash !== undefined) {
    throw new Error(`Probe ${probe.id} must not combine stateBinding.stateSamples with expectedStateHash.`);
  }
  const maxMatchesPerSeed = probe.stateBinding.maxMatchesPerSeed;
  if (
    maxMatchesPerSeed !== undefined
    && (!Number.isSafeInteger(maxMatchesPerSeed) || maxMatchesPerSeed < 1)
  ) {
    throw new Error(`Probe ${probe.id} stateBinding.maxMatchesPerSeed must be a positive integer.`);
  }
  const occurrence = probe.decisionBinding.occurrence;
  if (typeof occurrence === 'object' && occurrence.n < 1) {
    throw new Error(`Probe ${probe.id} nth occurrence must be >= 1.`);
  }
};
