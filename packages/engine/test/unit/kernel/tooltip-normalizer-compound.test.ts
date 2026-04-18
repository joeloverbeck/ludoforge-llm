// @test-class: architectural-invariant
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeChooseN,
  tryMacroOverride,
  isSpaceQuery,
  isTokenQuery,
  isPlayerQuery,
  isValueQuery,
  isMarkerQuery,
  isRowQuery,
  isEnumQuery,
} from '../../../src/kernel/tooltip-normalizer-compound.js';
import type { EffectAST, OptionsQuery } from '../../../src/kernel/types-ast.js';
import type { NormalizerContext } from '../../../src/kernel/tooltip-normalizer.js';
import type { SelectMessage, SummaryMessage } from '../../../src/kernel/tooltip-ir.js';
import type { VerbalizationDef } from '../../../src/kernel/verbalization-types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EMPTY_CTX: NormalizerContext = {
  verbalization: undefined,
  suppressPatterns: [],
};

const chooseNPayload = (options: OptionsQuery, n = 1): Extract<EffectAST, { chooseN: unknown }> => eff({
  chooseN: {
    internalDecisionId: 'test-decision',
    options,
    bind: 'sel',
    n,
  },
}) as Extract<EffectAST, { chooseN: unknown }>;

// ---------------------------------------------------------------------------
// Query type classification helpers
// ---------------------------------------------------------------------------

describe('query type classification helpers', () => {
  it('isSpaceQuery matches mapSpaces', () => {
    assert.ok(isSpaceQuery({ query: 'mapSpaces' }));
  });

  it('isSpaceQuery matches zones', () => {
    assert.ok(isSpaceQuery({ query: 'zones' }));
  });

  it('isSpaceQuery matches adjacentZones', () => {
    assert.ok(isSpaceQuery({ query: 'adjacentZones', zone: 'x' }));
  });

  it('isSpaceQuery matches connectedZones', () => {
    assert.ok(isSpaceQuery({ query: 'connectedZones', zone: 'x' }));
  });

  it('isSpaceQuery matches tokenZones', () => {
    assert.ok(isSpaceQuery({ query: 'tokenZones', source: { query: 'enums', values: [] } }));
  });

  it('isTokenQuery matches tokensInZone', () => {
    assert.ok(isTokenQuery({ query: 'tokensInZone', zone: 'x' }));
  });

  it('isPlayerQuery matches players', () => {
    assert.ok(isPlayerQuery({ query: 'players' }));
  });

  it('isValueQuery matches intsInRange', () => {
    assert.ok(isValueQuery({ query: 'intsInRange', min: 0, max: 10 }));
  });

  it('isValueQuery matches intsInVarRange', () => {
    assert.ok(isValueQuery({ query: 'intsInVarRange', var: 'betAmount' }));
  });

  it('isMarkerQuery matches globalMarkers', () => {
    assert.ok(isMarkerQuery({ query: 'globalMarkers' }));
  });

  it('isRowQuery matches assetRows', () => {
    assert.ok(isRowQuery({ query: 'assetRows', tableId: 'events' }));
  });

  it('isEnumQuery matches enums', () => {
    assert.ok(isEnumQuery({ query: 'enums', values: ['a', 'b'] }));
  });
});

// ---------------------------------------------------------------------------
// normalizeChooseN classification
// ---------------------------------------------------------------------------

describe('normalizeChooseN domain classification', () => {
  it('players query produces target: players', () => {
    const result = normalizeChooseN(chooseNPayload({ query: 'players' }), EMPTY_CTX, 'r');
    assert.equal(result.length, 1);
    const msg = result[0] as SelectMessage;
    assert.equal(msg.kind, 'select');
    assert.equal(msg.target, 'players');
  });

  it('intsInRange query produces target: values', () => {
    const result = normalizeChooseN(chooseNPayload({ query: 'intsInRange', min: 1, max: 100 }), EMPTY_CTX, 'r');
    assert.equal(result.length, 1);
    const msg = result[0] as SelectMessage;
    assert.equal(msg.kind, 'select');
    assert.equal(msg.target, 'values');
  });

  it('intsInVarRange query produces target: values', () => {
    const result = normalizeChooseN(chooseNPayload({ query: 'intsInVarRange', var: 'bet' }), EMPTY_CTX, 'r');
    assert.equal(result.length, 1);
    const msg = result[0] as SelectMessage;
    assert.equal(msg.kind, 'select');
    assert.equal(msg.target, 'values');
  });

  it('globalMarkers query produces target: markers', () => {
    const result = normalizeChooseN(chooseNPayload({ query: 'globalMarkers' }), EMPTY_CTX, 'r');
    assert.equal(result.length, 1);
    const msg = result[0] as SelectMessage;
    assert.equal(msg.kind, 'select');
    assert.equal(msg.target, 'markers');
  });

  it('assetRows query produces target: rows', () => {
    const result = normalizeChooseN(chooseNPayload({ query: 'assetRows', tableId: 'events' }), EMPTY_CTX, 'r');
    assert.equal(result.length, 1);
    const msg = result[0] as SelectMessage;
    assert.equal(msg.kind, 'select');
    assert.equal(msg.target, 'rows');
  });

  it('enums query produces target: options with optionHints', () => {
    const result = normalizeChooseN(
      chooseNPayload({ query: 'enums', values: ['Fold', 'Call', 'Raise'] }),
      EMPTY_CTX,
      'r',
    );
    assert.equal(result.length, 1);
    const msg = result[0] as SelectMessage;
    assert.equal(msg.kind, 'select');
    assert.equal(msg.target, 'options');
    assert.deepEqual(msg.optionHints, ['Fold', 'Call', 'Raise']);
  });

  it('connectedZones query produces target: spaces', () => {
    const result = normalizeChooseN(
      chooseNPayload({ query: 'connectedZones', zone: 'start' }),
      EMPTY_CTX,
      'r',
    );
    assert.equal(result.length, 1);
    const msg = result[0] as SelectMessage;
    assert.equal(msg.kind, 'select');
    assert.equal(msg.target, 'spaces');
  });

  it('tokenZones query produces target: spaces', () => {
    const result = normalizeChooseN(
      chooseNPayload({ query: 'tokenZones', source: { query: 'enums', values: [] } }),
      EMPTY_CTX,
      'r',
    );
    assert.equal(result.length, 1);
    const msg = result[0] as SelectMessage;
    assert.equal(msg.kind, 'select');
    assert.equal(msg.target, 'spaces');
  });

  it('existing space queries still produce target: spaces', () => {
    const result = normalizeChooseN(chooseNPayload({ query: 'mapSpaces' }), EMPTY_CTX, 'r');
    const msg = result[0] as SelectMessage;
    assert.equal(msg.target, 'spaces');
  });

  it('existing token queries still produce target: zones', () => {
    const result = normalizeChooseN(
      chooseNPayload({ query: 'tokensInZone', zone: 'hand' }),
      EMPTY_CTX,
      'r',
    );
    const msg = result[0] as SelectMessage;
    assert.equal(msg.target, 'zones');
  });

  it('concat query with uniform sources derives target from sources', () => {
    const result = normalizeChooseN(
      chooseNPayload({
        query: 'concat',
        sources: [{ query: 'mapSpaces' }, { query: 'zones' }],
      }),
      EMPTY_CTX,
      'r',
    );
    const msg = result[0] as SelectMessage;
    assert.equal(msg.target, 'spaces');
  });

  it('concat query with mixed sources falls back to items', () => {
    const result = normalizeChooseN(
      chooseNPayload({
        query: 'concat',
        sources: [{ query: 'mapSpaces' }, { query: 'players' }],
      }),
      EMPTY_CTX,
      'r',
    );
    const msg = result[0] as SelectMessage;
    assert.equal(msg.target, 'items');
  });

  it('nextInOrderByCondition derives target from its source', () => {
    const result = normalizeChooseN(
      chooseNPayload({
        query: 'nextInOrderByCondition',
        source: { query: 'intsInRange', min: 0, max: 10 },
        from: 0,
        bind: 'v',
        where: true,
      }),
      EMPTY_CTX,
      'r',
    );
    const msg = result[0] as SelectMessage;
    assert.equal(msg.target, 'values');
  });

  it('unknown query falls back to target: items without optionHints', () => {
    const result = normalizeChooseN(
      chooseNPayload({ query: 'binding', name: 'x' } as OptionsQuery),
      EMPTY_CTX,
      'r',
    );
    const msg = result[0] as SelectMessage;
    assert.equal(msg.target, 'items');
    assert.equal(msg.optionHints, undefined);
  });
});

// ---------------------------------------------------------------------------
// conditionAST population on SelectMessage (ACTTOOHUMGAP-005)
// ---------------------------------------------------------------------------

describe('SelectMessage conditionAST population', () => {
  it('populates conditionAST for mapSpaces query with condition filter', () => {
    const condition = { op: '>=', left: { ref: 'gvar', var: 'population' }, right: 1 } as const;
    const result = normalizeChooseN(
      chooseNPayload({
        query: 'mapSpaces',
        filter: { condition },
      } as OptionsQuery),
      EMPTY_CTX,
      'r',
    );
    const msg = result[0] as SelectMessage;
    assert.equal(msg.kind, 'select');
    assert.deepEqual(msg.conditionAST, condition);
    assert.ok(msg.filter !== undefined, 'filter string should also be present');
  });

  it('populates conditionAST for zones query with condition filter', () => {
    const condition = { op: '==', left: { ref: 'gvar', var: 'terrain' }, right: 'city' } as const;
    const result = normalizeChooseN(
      chooseNPayload({
        query: 'zones',
        filter: { condition },
      } as OptionsQuery),
      EMPTY_CTX,
      'r',
    );
    const msg = result[0] as SelectMessage;
    assert.deepEqual(msg.conditionAST, condition);
  });

  it('leaves conditionAST undefined for queries without conditions', () => {
    const result = normalizeChooseN(
      chooseNPayload({ query: 'mapSpaces' }),
      EMPTY_CTX,
      'r',
    );
    const msg = result[0] as SelectMessage;
    assert.equal(msg.conditionAST, undefined);
  });

  it('leaves conditionAST undefined for token queries (TokenFilterExpr, not ConditionAST)', () => {
    const result = normalizeChooseN(
      chooseNPayload({
        query: 'tokensInZone',
        zone: 'hand',
        filter: { prop: 'type', op: 'eq', value: 'troop' },
      } as OptionsQuery),
      EMPTY_CTX,
      'r',
    );
    const msg = result[0] as SelectMessage;
    assert.equal(msg.conditionAST, undefined);
    assert.ok(msg.filter !== undefined, 'filter string should still be present for token queries');
  });

  it('leaves conditionAST undefined for enum queries', () => {
    const result = normalizeChooseN(
      chooseNPayload({ query: 'enums', values: ['a', 'b'] }),
      EMPTY_CTX,
      'r',
    );
    const msg = result[0] as SelectMessage;
    assert.equal(msg.conditionAST, undefined);
  });
});

// ---------------------------------------------------------------------------
// tryMacroOverride — SummaryMessage production
// ---------------------------------------------------------------------------

describe('tryMacroOverride', () => {
  const makeVerb = (macros: VerbalizationDef['macros']): VerbalizationDef => ({
    labels: {},
    stages: {},
    macros,
    sentencePlans: {},
    suppressPatterns: [],
    stageDescriptions: {},
    modifierEffects: {},
  });

  const forEachWithMacro = (macroId: string): EffectAST => (eff({
    forEach: {
      over: { query: 'mapSpaces' },
      bind: 'sp',
      effects: [],
      macroOrigin: { macroId, stem: macroId },
    },
  }));

  it('returns undefined when no verbalization context', () => {
    const result = tryMacroOverride(forEachWithMacro('trainUs'), EMPTY_CTX, 'r');
    assert.equal(result, undefined);
  });

  it('returns humanized fallback when macro has no summary', () => {
    const ctx: NormalizerContext = {
      verbalization: makeVerb({ trainUs: { class: 'Train', summary: undefined as unknown as string } }),
      suppressPatterns: [],
    };
    const result = tryMacroOverride(forEachWithMacro('trainUs'), ctx, 'r');
    assert.ok(result !== undefined, 'expected fallback summary, not undefined');
    assert.equal(result!.length, 1);
    const msg = result![0] as SummaryMessage;
    assert.equal(msg.kind, 'summary');
    assert.equal(msg.text, 'Train Us');
    assert.equal(msg.macroOrigin, 'trainUs');
  });

  it('produces SummaryMessage instead of SetMessage', () => {
    const ctx: NormalizerContext = {
      verbalization: makeVerb({ trainUs: { class: 'Train', summary: 'Place troops' } }),
      suppressPatterns: [],
    };
    const result = tryMacroOverride(forEachWithMacro('trainUs'), ctx, 'r');
    assert.ok(result !== undefined);
    assert.equal(result!.length, 1);
    const msg = result![0] as SummaryMessage;
    assert.equal(msg.kind, 'summary');
    assert.equal(msg.text, 'Place troops');
    assert.equal(msg.macroClass, 'Train');
    assert.equal(msg.macroOrigin, 'trainUs');
  });

  it('interpolates {slotName} placeholders from slots map', () => {
    const ctx: NormalizerContext = {
      verbalization: makeVerb({
        placeGuerrillas: {
          class: 'Rally',
          summary: 'Place {piece} from {source}',
          slots: { piece: 'guerrillas', source: 'Available' },
        },
      }),
      suppressPatterns: [],
    };
    const result = tryMacroOverride(forEachWithMacro('placeGuerrillas'), ctx, 'r');
    assert.ok(result !== undefined);
    const msg = result![0] as SummaryMessage;
    assert.equal(msg.text, 'Place guerrillas from Available');
    assert.equal(msg.macroClass, 'Rally');
  });

  it('leaves text unchanged when no slots defined', () => {
    const ctx: NormalizerContext = {
      verbalization: makeVerb({ simple: { class: 'Op', summary: 'Do {thing}' } }),
      suppressPatterns: [],
    };
    const result = tryMacroOverride(forEachWithMacro('simple'), ctx, 'r');
    assert.ok(result !== undefined);
    const msg = result![0] as SummaryMessage;
    assert.equal(msg.text, 'Do {thing}');
  });
});

// ---------------------------------------------------------------------------
// extractMacroIdFromBinding (Fix 4)
// ---------------------------------------------------------------------------

import { extractMacroIdFromBinding } from '../../../src/kernel/tooltip-normalizer-compound.js';

describe('extractMacroIdFromBinding', () => {
  it('extracts macro ID from __macro_ prefixed name with space separator', () => {
    assert.equal(
      extractMacroIdFromBinding('__macro_place_from_available_or_map_action Pipelines_0__stages_1__effects_0__piece'),
      'place_from_available_or_map_action',
    );
  });

  it('extracts macro ID from simple __macro_ name without space', () => {
    assert.equal(
      extractMacroIdFromBinding('__macro_simple_macro'),
      'simple_macro',
    );
  });

  it('returns undefined for non-macro names', () => {
    assert.equal(extractMacroIdFromBinding('normalBinding'), undefined);
  });

  it('returns undefined for empty string', () => {
    assert.equal(extractMacroIdFromBinding(''), undefined);
  });
});

// ---------------------------------------------------------------------------
// extractBranchLabel guarding (Fix 2)
// ---------------------------------------------------------------------------

import { normalizeIf } from '../../../src/kernel/tooltip-normalizer-compound.js';
import type { EffectAST as IfEffectAST } from '../../../src/kernel/types-ast.js';
import { eff } from '../../helpers/effect-tag-helper.js';

describe('extractBranchLabel guarding', () => {
  const noopRecurse = (effects: readonly IfEffectAST[], _ctx: NormalizerContext, basePath: string) =>
    effects.map((_, i) => ({ kind: 'suppressed' as const, reason: 'test', astPath: `${basePath}[${i}]` }));

  it('does not produce branch label for capability condition', () => {
    const ctx: NormalizerContext = {
      verbalization: {
        labels: {},
        stages: {},
        macros: {},
        sentencePlans: {},
        suppressPatterns: [],
        stageDescriptions: {},
        modifierEffects: {
          cap_cords: [{ condition: 'cap_cords is unshaded', effect: 'Coordinated ops' }],
        },
        modifierClassification: {
          choiceFlowPatterns: ['*Choice'],
          leaderPatterns: ['Active Leader*'],
        },
      },
      suppressPatterns: [],
    };

    const ifEffect: IfEffectAST = eff({
      if: {
        when: { op: '==', left: { _t: 2, ref: 'gvar', var: 'cap_cords' }, right: 'unshaded' },
        then: [eff({ addVar: { scope: 'global', var: 'gold', delta: 1 } })],
      },
    });

    const result = normalizeIf(
      ifEffect as Extract<IfEffectAST, { if: unknown }>,
      ctx,
      'root',
      noopRecurse,
    );

    const selects = result.filter((m) => m.kind === 'select');
    for (const sel of selects) {
      assert.equal((sel as SelectMessage).choiceBranchLabel, undefined, 'Should not have branch label from capability');
    }
  });

  it('produces branch label for choice-flow condition', () => {
    const ctx: NormalizerContext = {
      verbalization: {
        labels: {},
        stages: {},
        macros: {},
        sentencePlans: {},
        suppressPatterns: [],
        stageDescriptions: {},
        modifierEffects: {},
        modifierClassification: {
          choiceFlowPatterns: ['*Choice'],
          leaderPatterns: [],
        },
      },
      suppressPatterns: [],
    };

    const ifEffect: IfEffectAST = eff({
      if: {
        when: { op: '==', left: { _t: 2, ref: 'gvar', var: 'Train Choice' }, right: 'Place Irregulars' },
        then: [eff({
          chooseN: {
            internalDecisionId: 'd1',
            options: { query: 'binding', name: 'items' } as OptionsQuery,
            bind: 'sel',
            n: 2,
          },
        })],
      },
    });

    const innerRecurse = (effects: readonly IfEffectAST[], innerCtx: NormalizerContext, basePath: string) => {
      return effects.flatMap((e, i) => {
        if ('chooseN' in e) {
          return normalizeChooseN(
            e as Extract<IfEffectAST, { chooseN: unknown }>,
            innerCtx,
            `${basePath}[${i}]`,
          );
        }
        return [{ kind: 'suppressed' as const, reason: 'test', astPath: `${basePath}[${i}]` }];
      });
    };

    const result = normalizeIf(
      ifEffect as Extract<IfEffectAST, { if: unknown }>,
      ctx,
      'root',
      innerRecurse,
    );

    const selects = result.filter((m) => m.kind === 'select') as SelectMessage[];
    assert.ok(selects.length > 0, 'Should have a SelectMessage');
    assert.equal(selects[0]!.choiceBranchLabel, 'Place Irregulars');
  });
});
