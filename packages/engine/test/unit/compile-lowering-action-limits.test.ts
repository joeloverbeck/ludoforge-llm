// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { lowerActions, type EffectLoweringSharedContext } from '../../src/cnl/compile-lowering.js';
import { canonicalizeNamedSets } from '../../src/cnl/named-set-utils.js';
import { buildCanonicalLimitId } from '../../src/kernel/limit-identity.js';
import type { Diagnostic } from '../../src/kernel/diagnostics.js';

const makeContext = (): EffectLoweringSharedContext => ({
  ownershipByBase: { board: 'none' },
  tokenTraitVocabulary: {},
  tokenFilterProps: [],
  namedSets: canonicalizeNamedSets({}),
  seatIds: ['0', '1'],
});

const makeMinimalAction = (overrides: Record<string, unknown> = {}) => ({
  id: 'testAction',
  actor: 'active',
  executor: 'active',
  phase: ['main'],
  params: [],
  pre: null,
  cost: [],
  effects: [{ addVar: { scope: 'global', var: 'x', delta: 1 } }],
  limits: [{ scope: 'turn', max: 1 }],
  ...overrides,
});

describe('compile-lowering lowerActions — limit diagnostics', () => {
  it('assigns canonical limit IDs using shared builder', () => {
    const diagnostics: Diagnostic[] = [];
    const actions = lowerActions([makeMinimalAction()], diagnostics, makeContext());

    const limitDiags = diagnostics.filter((d) =>
      d.path.includes('limits'),
    );
    assert.equal(limitDiags.length, 0, `unexpected limit diagnostics: ${JSON.stringify(limitDiags)}`);
    assert.equal(actions.length, 1);
    const first = actions[0]!;
    assert.equal(first.limits.length, 1);
    assert.equal(
      first.limits[0]!.id,
      buildCanonicalLimitId('testAction', 0, 'turn'),
    );
  });

  it('assigns canonical IDs for multiple limits', () => {
    const diagnostics: Diagnostic[] = [];
    const actions = lowerActions(
      [
        makeMinimalAction({
          limits: [
            { scope: 'turn', max: 1 },
            { scope: 'phase', max: 3 },
            { scope: 'game', max: 10 },
          ],
        }),
      ],
      diagnostics,
      makeContext(),
    );

    const limitDiags = diagnostics.filter((d) => d.path.includes('limits'));
    assert.equal(limitDiags.length, 0, `unexpected limit diagnostics: ${JSON.stringify(limitDiags)}`);
    const first = actions[0]!;
    assert.equal(first.limits.length, 3);
    assert.equal(first.limits[0]!.id, buildCanonicalLimitId('testAction', 0, 'turn'));
    assert.equal(first.limits[1]!.id, buildCanonicalLimitId('testAction', 1, 'phase'));
    assert.equal(first.limits[2]!.id, buildCanonicalLimitId('testAction', 2, 'game'));
  });

  it('emits diagnostic for malformed limit entry referencing canonical id shape', () => {
    const diagnostics: Diagnostic[] = [];
    lowerActions(
      [makeMinimalAction({ limits: [{ scope: 'invalid', max: 1 }] })],
      diagnostics,
      makeContext(),
    );

    const limitDiag = diagnostics.find((d) => d.path.includes('limits.0'));
    assert.ok(limitDiag, 'expected a diagnostic for malformed limit');
    assert.equal(limitDiag.severity, 'error');
    // The alternatives array must reference the canonical id format
    const alternatives = limitDiag.alternatives ?? [];
    const combined = [limitDiag.message, limitDiag.suggestion ?? '', ...alternatives].join(' ');
    assert.ok(
      combined.includes('<actionId>::<scope>::<index>'),
      `diagnostic should reference canonical id format, got: ${combined}`,
    );
  });

  it('emits diagnostic for limit with non-integer max', () => {
    const diagnostics: Diagnostic[] = [];
    lowerActions(
      [makeMinimalAction({ limits: [{ scope: 'turn', max: 1.5 }] })],
      diagnostics,
      makeContext(),
    );

    const limitDiag = diagnostics.find((d) => d.path.includes('limits.0'));
    assert.ok(limitDiag, 'expected a diagnostic for non-integer max');
    assert.equal(limitDiag.severity, 'error');
  });

  it('emits diagnostic for limit with negative max', () => {
    const diagnostics: Diagnostic[] = [];
    lowerActions(
      [makeMinimalAction({ limits: [{ scope: 'turn', max: -1 }] })],
      diagnostics,
      makeContext(),
    );

    const limitDiag = diagnostics.find((d) => d.path.includes('limits.0'));
    assert.ok(limitDiag, 'expected a diagnostic for negative max');
    assert.equal(limitDiag.severity, 'error');
  });
});
