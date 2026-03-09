import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { humanizeMacroId } from '../../src/kernel/tooltip-value-stringifier.js';
import { normalizeEffect, type NormalizerContext } from '../../src/kernel/tooltip-normalizer.js';
import type { EffectAST } from '../../src/kernel/types-ast.js';
import type { VerbalizationDef } from '../../src/kernel/verbalization-types.js';

// ---------------------------------------------------------------------------
// Fix 3: humanizeMacroId
// ---------------------------------------------------------------------------

describe('humanizeMacroId', () => {
  it('converts underscore-separated words to title case', () => {
    assert.equal(humanizeMacroId('place_from_available'), 'Place From Available');
  });

  it('strips trailing "action" segment', () => {
    assert.equal(
      humanizeMacroId('place_from_available_or_map_action'),
      'Place From Available Or Map',
    );
  });

  it('expands known generic abbreviations', () => {
    assert.equal(humanizeMacroId('player_id'), 'Player ID');
    assert.equal(humanizeMacroId('ai_turn'), 'AI Turn');
    assert.equal(humanizeMacroId('hp_loss'), 'HP Loss');
  });

  it('title-cases game-specific terms (not hardcoded)', () => {
    assert.equal(humanizeMacroId('nva_march_attack'), 'Nva March Attack');
    assert.equal(humanizeMacroId('arvn_train'), 'Arvn Train');
    assert.equal(humanizeMacroId('us_sweep'), 'Us Sweep');
  });

  it('handles single-word macro IDs', () => {
    assert.equal(humanizeMacroId('sweep'), 'Sweep');
  });

  it('does not strip "action" when it is the only word', () => {
    assert.equal(humanizeMacroId('action'), 'Action');
  });

  it('passes through empty string', () => {
    assert.equal(humanizeMacroId(''), '');
  });
});

// ---------------------------------------------------------------------------
// Fix 3: tryMacroOverride / tryLeafMacroOverride fallback
// ---------------------------------------------------------------------------

describe('macro override fallback', () => {
  // Verbalization must be defined (but with empty macros) so that the
  // fallback path fires.  When verbalization is undefined the guard
  // returns early and falls through to normal processing.
  const baseCtx: NormalizerContext = {
    verbalization: {
      labels: {},
      stages: {},
      macros: {},
      sentencePlans: {},
      suppressPatterns: [],
      stageDescriptions: {},
      modifierEffects: {},
    },
    suppressPatterns: [],
  };

  it('tryMacroOverride generates humanized summary when no verbalization exists', () => {
    const effect: EffectAST = {
      forEach: {
        bind: '$space',
        over: { query: 'mapSpaces' },
        effects: [],
        macroOrigin: { macroId: 'place_from_available_or_map_action', stem: '$space' },
      },
    };
    const messages = normalizeEffect(effect, baseCtx, 'root[0]');
    const summaries = messages.filter((m) => m.kind === 'summary');
    assert.ok(summaries.length > 0, 'expected at least one summary message');
    const summary = summaries[0]!;
    assert.equal(summary.kind, 'summary');
    if (summary.kind === 'summary') {
      assert.equal(summary.text, 'Place From Available Or Map');
    }
  });

  it('tryMacroOverride prefers verbalization summary over fallback', () => {
    const verbalization: VerbalizationDef = {
      labels: {},
      sentencePlans: {},
      macros: {
        place_from_available_or_map_action: {
          class: 'placement',
          summary: 'Place pieces from available or on map',
        },
      },
      suppressPatterns: [],
      modifierEffects: {},
      modifierClassification: {
        choiceFlowPatterns: [],
        leaderPatterns: [],
      },
      stages: {},
      stageDescriptions: {},
    };
    const ctx: NormalizerContext = {
      verbalization,
      suppressPatterns: [],
    };
    const effect: EffectAST = {
      forEach: {
        bind: '$space',
        over: { query: 'mapSpaces' },
        effects: [],
        macroOrigin: { macroId: 'place_from_available_or_map_action', stem: '$space' },
      },
    };
    const messages = normalizeEffect(effect, ctx, 'root[0]');
    const summaries = messages.filter((m) => m.kind === 'summary');
    assert.ok(summaries.length > 0);
    if (summaries[0]!.kind === 'summary') {
      assert.equal(summaries[0]!.text, 'Place pieces from available or on map');
    }
  });

  it('tryLeafMacroOverride generates humanized summary for leaf effects', () => {
    const effect: EffectAST = {
      moveToken: {
        token: '__macro_nva_march_attack Pipelines_0__stages_1__effects_0__piece',
        from: 'available-nva',
        to: 'saigon',
      },
    };
    const messages = normalizeEffect(effect, baseCtx, 'root[0]');
    const summaries = messages.filter((m) => m.kind === 'summary');
    assert.ok(summaries.length > 0, 'expected summary from leaf macro override');
    if (summaries[0]!.kind === 'summary') {
      assert.equal(summaries[0]!.text, 'Nva March Attack');
    }
  });
});

// ---------------------------------------------------------------------------
// Fix 2: contextual chooseN — realizeSelect with optionHints
// ---------------------------------------------------------------------------

describe('normalizeChooseN context derivation', () => {
  const baseCtx: NormalizerContext = {
    verbalization: undefined,
    suppressPatterns: [],
  };

  it('derives choiceBranchLabel from binding query', () => {
    const effect: EffectAST = {
      chooseN: {
        internalDecisionId: 'test-decision-1',
        bind: '$target',
        options: { query: 'binding', name: 'available_targets' },
        min: 0,
        max: 2,
      },
    };
    const messages = normalizeEffect(effect, baseCtx, 'root[0]');
    const selects = messages.filter((m) => m.kind === 'select');
    assert.ok(selects.length > 0);
    const select = selects[0]!;
    if (select.kind === 'select') {
      assert.equal(select.choiceBranchLabel, 'available_targets');
    }
  });

  it('propagates parent choiceBranchLabel over query-derived label', () => {
    const ctx: NormalizerContext = {
      ...baseCtx,
      choiceBranchLabel: 'Place Irregulars',
    };
    const effect: EffectAST = {
      chooseN: {
        internalDecisionId: 'test-decision-2',
        bind: '$target',
        options: { query: 'binding', name: 'available_targets' },
        min: 0,
        max: 2,
      },
    };
    const messages = normalizeEffect(effect, ctx, 'root[0]');
    const selects = messages.filter((m) => m.kind === 'select');
    assert.ok(selects.length > 0);
    if (selects[0]!.kind === 'select') {
      assert.equal(selects[0]!.choiceBranchLabel, 'Place Irregulars');
    }
  });
});

// ---------------------------------------------------------------------------
// Fix 1: __actionClass branch selection
// ---------------------------------------------------------------------------

describe('normalizeIf __actionClass branch selection', () => {
  const baseCtx: NormalizerContext = {
    verbalization: undefined,
    suppressPatterns: [],
  };

  const makeActionClassIfEffect = (
    thenEffects: readonly EffectAST[],
    elseEffects: readonly EffectAST[],
  ): EffectAST => ({
    if: {
      when: {
        op: '==' as const,
        left: { ref: 'binding' as const, name: '__actionClass' },
        right: 'limitedOperation',
      },
      then: thenEffects,
      else: elseEffects,
    },
  });

  it('emits only then branch when actionClassBinding matches', () => {
    const ctx: NormalizerContext = {
      ...baseCtx,
      actionClassBinding: 'limitedOperation',
    };
    const effect = makeActionClassIfEffect(
      [{ addVar: { var: 'resources', delta: -1, scope: 'global' } }],
      [{ addVar: { var: 'resources', delta: -3, scope: 'global' } }],
    );
    const messages = normalizeEffect(effect, ctx, 'root[0]');
    const nonSuppressed = messages.filter((m) => m.kind !== 'suppressed');
    assert.equal(nonSuppressed.length, 1);
    assert.equal(nonSuppressed[0]!.kind, 'pay');
    if (nonSuppressed[0]!.kind === 'pay') {
      assert.equal(nonSuppressed[0]!.amount, 1);
    }
  });

  it('emits only else branch when actionClassBinding does not match', () => {
    const ctx: NormalizerContext = {
      ...baseCtx,
      actionClassBinding: 'fullOperation',
    };
    const effect = makeActionClassIfEffect(
      [{ addVar: { var: 'resources', delta: -1, scope: 'global' } }],
      [{ addVar: { var: 'resources', delta: -3, scope: 'global' } }],
    );
    const messages = normalizeEffect(effect, ctx, 'root[0]');
    const nonSuppressed = messages.filter((m) => m.kind !== 'suppressed');
    assert.equal(nonSuppressed.length, 1);
    assert.equal(nonSuppressed[0]!.kind, 'pay');
    if (nonSuppressed[0]!.kind === 'pay') {
      assert.equal(nonSuppressed[0]!.amount, 3);
    }
  });

  it('falls through to existing behavior when actionClassBinding is undefined', () => {
    const effect = makeActionClassIfEffect(
      [{ addVar: { var: 'resources', delta: -1, scope: 'global' } }],
      [{ addVar: { var: 'resources', delta: -3, scope: 'global' } }],
    );
    const messages = normalizeEffect(effect, baseCtx, 'root[0]');
    // Without actionClassBinding, both branches are shown (existing behavior)
    const nonSuppressed = messages.filter((m) => m.kind !== 'suppressed');
    assert.equal(nonSuppressed.length, 2, 'both branches should be shown when no actionClassBinding');
  });
});
