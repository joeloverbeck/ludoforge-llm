import { describe, expect, it } from 'vitest';

import { applyDetailTemplate } from '../../src/utils/apply-detail-template.js';

describe('applyDetailTemplate', () => {
  it('substitutes factor keys and the contribution token', () => {
    expect(applyDetailTemplate(
      '(pop {population}) x{multiplier} = {contribution}',
      { population: 3, multiplier: 2 },
      6,
    )).toBe('(pop 3) x2 = 6');
  });

  it('leaves unknown keys unchanged', () => {
    expect(applyDetailTemplate(
      '{unknown} => {contribution}',
      { population: 5 },
      7,
    )).toBe('{unknown} => 7');
  });

  it('supports contribution-only templates', () => {
    expect(applyDetailTemplate('{contribution}', { count: 1 }, 4)).toBe('4');
  });
});
