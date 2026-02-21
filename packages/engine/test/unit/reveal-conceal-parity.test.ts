import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  EFFECT_RUNTIME_REASONS,
  EffectASTSchema,
  GameDefSchema,
  KERNEL_RUNTIME_REASONS,
  validateGameDef,
} from '../../src/kernel/index.js';
import { withSingleActionEffect } from '../helpers/gamedef-fixtures.js';

describe('reveal/conceal parity guardrails', () => {
  it('accepts equivalent AST schema shapes for zone + selector + filter', () => {
    const reveal = EffectASTSchema.safeParse({
      reveal: {
        zone: { zoneExpr: 'market:none' },
        to: { chosen: '$targetPlayer' },
        filter: [{ prop: 'faction', op: 'eq', value: 'US' }],
      },
    });
    const conceal = EffectASTSchema.safeParse({
      conceal: {
        zone: { zoneExpr: 'market:none' },
        from: { chosen: '$targetPlayer' },
        filter: [{ prop: 'faction', op: 'eq', value: 'US' }],
      },
    });

    assert.equal(reveal.success, true);
    assert.equal(conceal.success, true);
  });

  it('rejects mirrored malformed AST schema payloads for selectors and filters', () => {
    const mirroredCases = [
      {
        reveal: { reveal: { zone: 'market:none', to: { playerId: 1 } } },
        conceal: { conceal: { zone: 'market:none', from: { playerId: 1 } } },
      },
      {
        reveal: { reveal: { zone: 'market:none', to: 'all', filter: [{ prop: 'faction', op: 'contains', value: 'US' }] } },
        conceal: { conceal: { zone: 'market:none', filter: [{ prop: 'faction', op: 'contains', value: 'US' }] } },
      },
      {
        reveal: { reveal: { zone: 'market:none', to: 'all', filter: [{ prop: 'faction', op: 'in', value: ['US', { bad: true }] }] } },
        conceal: { conceal: { zone: 'market:none', filter: [{ prop: 'faction', op: 'in', value: ['US', { bad: true }] }] } },
      },
      {
        reveal: { reveal: { zone: 'market:none', to: 'all', extra: true } },
        conceal: { conceal: { zone: 'market:none', from: 'all', extra: true } },
      },
    ] as const;

    for (const testCase of mirroredCases) {
      const reveal = EffectASTSchema.safeParse(testCase.reveal);
      const conceal = EffectASTSchema.safeParse(testCase.conceal);
      assert.equal(reveal.success, false);
      assert.equal(conceal.success, false);
    }
  });

  it('accepts and rejects mirrored GameDef schema shapes for reveal/conceal effect payloads', () => {
    const validReveal = GameDefSchema.safeParse(withSingleActionEffect({ reveal: { zone: 'market:none', to: 'all' } }));
    const validConceal = GameDefSchema.safeParse(withSingleActionEffect({ conceal: { zone: 'market:none', from: 'all' } }));
    const invalidReveal = GameDefSchema.safeParse(withSingleActionEffect({ reveal: { zone: 'market:none', to: { playerId: 1 } } }));
    const invalidConceal = GameDefSchema.safeParse(withSingleActionEffect({ conceal: { zone: 'market:none', from: { playerId: 1 } } }));

    assert.equal(validReveal.success, true);
    assert.equal(validConceal.success, true);
    assert.equal(invalidReveal.success, false);
    assert.equal(invalidConceal.success, false);
  });

  it('emits mirrored behavior-validation diagnostics for selector and filter contracts', () => {
    const selectorDiagnostics = validateGameDef(withSingleActionEffect({ reveal: { zone: 'market:none', to: { id: 99 } } }));
    const fromDiagnostics = validateGameDef(withSingleActionEffect({ conceal: { zone: 'market:none', from: { id: 99 } } }));

    assert.equal(
      selectorDiagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'PLAYER_SELECTOR_ID_OUT_OF_BOUNDS' && diagnostic.path === 'actions[0].effects[0].reveal.to',
      ),
      true,
    );
    assert.equal(
      fromDiagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'PLAYER_SELECTOR_ID_OUT_OF_BOUNDS' && diagnostic.path === 'actions[0].effects[0].conceal.from',
      ),
      true,
    );

    const revealFilterDiagnostics = validateGameDef(
      withSingleActionEffect({
        reveal: {
          zone: 'market:none',
          to: 'all',
          filter: [{ prop: 'faction', op: 'eq', value: { ref: 'gvar', var: 'missingVar' } }],
        },
      }),
    );
    const concealFilterDiagnostics = validateGameDef(
      withSingleActionEffect({
        conceal: {
          zone: 'market:none',
          filter: [{ prop: 'faction', op: 'eq', value: { ref: 'gvar', var: 'missingVar' } }],
        },
      }),
    );

    assert.equal(
      revealFilterDiagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'REF_GVAR_MISSING' && diagnostic.path === 'actions[0].effects[0].reveal.filter[0].value.var',
      ),
      true,
    );
    assert.equal(
      concealFilterDiagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'REF_GVAR_MISSING' && diagnostic.path === 'actions[0].effects[0].conceal.filter[0].value.var',
      ),
      true,
    );
  });

  it('maintains mirrored reveal/conceal runtime reason taxonomy entries', () => {
    assert.equal(EFFECT_RUNTIME_REASONS.REVEAL_RUNTIME_VALIDATION_FAILED, 'revealRuntimeValidationFailed');
    assert.equal(EFFECT_RUNTIME_REASONS.CONCEAL_RUNTIME_VALIDATION_FAILED, 'concealRuntimeValidationFailed');

    assert.equal(
      KERNEL_RUNTIME_REASONS.filter((reason) => reason === EFFECT_RUNTIME_REASONS.REVEAL_RUNTIME_VALIDATION_FAILED).length,
      1,
    );
    assert.equal(
      KERNEL_RUNTIME_REASONS.filter((reason) => reason === EFFECT_RUNTIME_REASONS.CONCEAL_RUNTIME_VALIDATION_FAILED).length,
      1,
    );
  });
});
