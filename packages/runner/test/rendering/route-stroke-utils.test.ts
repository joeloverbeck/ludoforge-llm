import { describe, expect, it } from 'vitest';

import { sanitizePositiveNumber, sanitizeUnitInterval } from '../../src/rendering/route-stroke-utils.js';

describe('sanitizePositiveNumber', () => {
  it('returns the value when positive and finite', () => {
    expect(sanitizePositiveNumber(5, 1)).toBe(5);
    expect(sanitizePositiveNumber(0.01, 1)).toBe(0.01);
  });

  it('returns fallback for zero', () => {
    expect(sanitizePositiveNumber(0, 7)).toBe(7);
  });

  it('returns fallback for negative values', () => {
    expect(sanitizePositiveNumber(-3, 7)).toBe(7);
  });

  it('returns fallback for undefined', () => {
    expect(sanitizePositiveNumber(undefined, 7)).toBe(7);
  });

  it('returns fallback for NaN', () => {
    expect(sanitizePositiveNumber(NaN, 7)).toBe(7);
  });

  it('returns fallback for Infinity', () => {
    expect(sanitizePositiveNumber(Infinity, 7)).toBe(7);
  });
});

describe('sanitizeUnitInterval', () => {
  it('returns the value when in [0, 1]', () => {
    expect(sanitizeUnitInterval(0, 0.5)).toBe(0);
    expect(sanitizeUnitInterval(0.5, 0.1)).toBe(0.5);
    expect(sanitizeUnitInterval(1, 0.5)).toBe(1);
  });

  it('returns fallback for values below 0', () => {
    expect(sanitizeUnitInterval(-0.1, 0.5)).toBe(0.5);
  });

  it('returns fallback for values above 1', () => {
    expect(sanitizeUnitInterval(1.1, 0.5)).toBe(0.5);
  });

  it('returns fallback for undefined', () => {
    expect(sanitizeUnitInterval(undefined, 0.75)).toBe(0.75);
  });

  it('returns fallback for NaN', () => {
    expect(sanitizeUnitInterval(NaN, 0.75)).toBe(0.75);
  });
});
