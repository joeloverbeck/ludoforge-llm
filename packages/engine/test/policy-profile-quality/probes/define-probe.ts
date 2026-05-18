import type { Probe } from './probe-types.js';

export const defineProbe = (probe: Probe): Probe => {
  validateProbe(probe);
  return probe;
};

const validateProbe = (probe: Probe): void => {
  if (probe.id.trim().length === 0) {
    throw new Error('Probe id must be non-empty.');
  }
  if (probe.stateBinding.seed === undefined && probe.stateBinding.seedRange === undefined) {
    throw new Error(`Probe ${probe.id} must set exactly one of stateBinding.seed or stateBinding.seedRange.`);
  }
  if (probe.stateBinding.seed !== undefined && probe.stateBinding.seedRange !== undefined) {
    throw new Error(`Probe ${probe.id} must not set both stateBinding.seed and stateBinding.seedRange.`);
  }
  const seedRange = probe.stateBinding.seedRange;
  if (seedRange !== undefined && seedRange.end < seedRange.start) {
    throw new Error(`Probe ${probe.id} seedRange.end must be >= seedRange.start.`);
  }
  const occurrence = probe.decisionBinding.occurrence;
  if (typeof occurrence === 'object' && occurrence.n < 1) {
    throw new Error(`Probe ${probe.id} nth occurrence must be >= 1.`);
  }
};
