import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractBlockers } from '../../../src/kernel/tooltip-blocker-extractor.js';
import type { ConditionAST } from '../../../src/kernel/types-ast.js';
import type { VerbalizationDef } from '../../../src/kernel/verbalization-types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOCK_VERB: VerbalizationDef = {
  labels: {
    aid: 'Aid',
    usTroops: { singular: 'US Troop', plural: 'US Troops' },
    saigon: 'Saigon',
    hue: 'Hue',
  },
  stages: {},
  macros: {},
  sentencePlans: {},
  suppressPatterns: [],
};

/** Create an evaluator that returns the given result for each condition by reference. */
const mockEvaluator = (results: Map<ConditionAST, boolean>) =>
  (cond: ConditionAST): boolean => {
    const result = results.get(cond);
    if (result === undefined) throw new Error('Unknown condition in mock evaluator');
    return result;
  };

// ---------------------------------------------------------------------------
// Satisfied condition
// ---------------------------------------------------------------------------

describe('extractBlockers', () => {
  describe('satisfied condition', () => {
    it('returns satisfied with no blockers when condition passes', () => {
      const cond: ConditionAST = { op: '>=', left: { ref: 'gvar', var: 'aid' }, right: 3 };
      const result = extractBlockers(cond, () => true, undefined);
      assert.equal(result.satisfied, true);
      assert.equal(result.blockers.length, 0);
    });
  });

  // ---------------------------------------------------------------------------
  // Boolean literals
  // ---------------------------------------------------------------------------

  describe('boolean literals', () => {
    it('handles false literal', () => {
      const result = extractBlockers(false, () => false, undefined);
      assert.equal(result.satisfied, false);
      assert.equal(result.blockers.length, 1);
      assert.equal(result.blockers[0]!.description, 'Condition is false');
    });

    it('handles true literal', () => {
      const result = extractBlockers(true, () => true, undefined);
      assert.equal(result.satisfied, true);
      assert.equal(result.blockers.length, 0);
    });
  });

  // ---------------------------------------------------------------------------
  // Leaf comparisons
  // ---------------------------------------------------------------------------

  describe('leaf comparisons', () => {
    it('formats >= comparison with verbalization labels', () => {
      const cond: ConditionAST = { op: '>=', left: { ref: 'gvar', var: 'aid' }, right: 3 };
      const result = extractBlockers(cond, () => false, MOCK_VERB);
      assert.equal(result.satisfied, false);
      assert.equal(result.blockers.length, 1);
      assert.equal(result.blockers[0]!.description, 'Need Aid \u2265 3');
      assert.equal(result.blockers[0]!.requiredValue, '3');
    });

    it('formats == comparison', () => {
      const cond: ConditionAST = { op: '==', left: { ref: 'gvar', var: 'aid' }, right: 0 };
      const result = extractBlockers(cond, () => false, MOCK_VERB);
      assert.equal(result.blockers[0]!.description, 'Need Aid = 0');
    });

    it('formats != comparison', () => {
      const cond: ConditionAST = { op: '!=', left: { ref: 'gvar', var: 'aid' }, right: 0 };
      const result = extractBlockers(cond, () => false, MOCK_VERB);
      assert.ok(result.blockers[0]!.description.includes('\u2260'));
    });

    it('formats < comparison', () => {
      const cond: ConditionAST = { op: '<', left: { ref: 'gvar', var: 'aid' }, right: 5 };
      const result = extractBlockers(cond, () => false, undefined);
      assert.equal(result.blockers[0]!.description, 'Need Aid < 5');
    });

    it('formats in comparison', () => {
      const cond: ConditionAST = { op: 'in', item: 'saigon', set: 'targets' };
      const result = extractBlockers(cond, () => false, MOCK_VERB);
      assert.equal(result.blockers[0]!.description, 'Need Saigon in set');
    });

    it('formats adjacent comparison', () => {
      const cond: ConditionAST = { op: 'adjacent', left: 'saigon', right: 'hue' };
      const result = extractBlockers(cond, () => false, MOCK_VERB);
      assert.equal(result.blockers[0]!.description, 'Need Saigon adjacent to Hue');
    });

    it('formats connected comparison', () => {
      const cond: ConditionAST = { op: 'connected', from: 'saigon', to: 'hue' };
      const result = extractBlockers(cond, () => false, MOCK_VERB);
      assert.equal(result.blockers[0]!.description, 'Need Saigon connected to Hue');
    });

    it('formats zonePropIncludes', () => {
      const cond: ConditionAST = { op: 'zonePropIncludes', zone: 'saigon', prop: 'terrain', value: 'city' };
      const result = extractBlockers(cond, () => false, MOCK_VERB);
      assert.equal(result.blockers[0]!.description, 'Need Saigon.terrain to include City');
    });
  });

  // ---------------------------------------------------------------------------
  // `and` walk rule
  // ---------------------------------------------------------------------------

  describe('and walk rule', () => {
    it('collects only failing children from and', () => {
      const child1: ConditionAST = { op: '>=', left: { ref: 'gvar', var: 'aid' }, right: 3 };
      const child2: ConditionAST = { op: '>=', left: { ref: 'gvar', var: 'aid' }, right: 5 };
      const child3: ConditionAST = { op: '>=', left: { ref: 'gvar', var: 'aid' }, right: 10 };
      const cond: ConditionAST = { op: 'and', args: [child1, child2, child3] };

      const results = new Map<ConditionAST, boolean>();
      results.set(cond, false);
      results.set(child1, true);
      results.set(child2, false);
      results.set(child3, false);

      const result = extractBlockers(cond, mockEvaluator(results), MOCK_VERB);
      assert.equal(result.satisfied, false);
      assert.equal(result.blockers.length, 2);
      assert.ok(result.blockers[0]!.description.includes('5'));
      assert.ok(result.blockers[1]!.description.includes('10'));
    });

    it('returns no blockers when and is satisfied', () => {
      const child1: ConditionAST = { op: '>=', left: { ref: 'gvar', var: 'aid' }, right: 3 };
      const cond: ConditionAST = { op: 'and', args: [child1] };
      const result = extractBlockers(cond, () => true, MOCK_VERB);
      assert.equal(result.satisfied, true);
      assert.equal(result.blockers.length, 0);
    });
  });

  // ---------------------------------------------------------------------------
  // `or` walk rule
  // ---------------------------------------------------------------------------

  describe('or walk rule', () => {
    it('shows smallest failing alternative', () => {
      // Alternative 1: single leaf (size 1)
      const alt1: ConditionAST = { op: '>=', left: { ref: 'gvar', var: 'aid' }, right: 3 };
      // Alternative 2: and with 3 children (size 3)
      const alt2Child1: ConditionAST = { op: '>=', left: 1, right: 2 };
      const alt2Child2: ConditionAST = { op: '>=', left: 3, right: 4 };
      const alt2Child3: ConditionAST = { op: '>=', left: 5, right: 6 };
      const alt2: ConditionAST = { op: 'and', args: [alt2Child1, alt2Child2, alt2Child3] };
      const cond: ConditionAST = { op: 'or', args: [alt1, alt2] };

      const results = new Map<ConditionAST, boolean>();
      results.set(cond, false);
      results.set(alt1, false);
      results.set(alt2, false);
      results.set(alt2Child1, false);
      results.set(alt2Child2, false);
      results.set(alt2Child3, false);

      const result = extractBlockers(cond, mockEvaluator(results), MOCK_VERB);
      assert.equal(result.satisfied, false);
      // Should show alt1 (size 1), not alt2 (size 3)
      assert.equal(result.blockers.length, 1);
      assert.ok(result.blockers[0]!.description.includes('Aid'));
    });

    it('returns no blockers when one alternative passes', () => {
      const alt1: ConditionAST = { op: '>=', left: { ref: 'gvar', var: 'aid' }, right: 3 };
      const alt2: ConditionAST = { op: '>=', left: { ref: 'gvar', var: 'aid' }, right: 5 };
      const cond: ConditionAST = { op: 'or', args: [alt1, alt2] };

      const results = new Map<ConditionAST, boolean>();
      results.set(cond, true);
      results.set(alt1, true);
      results.set(alt2, false);

      const result = extractBlockers(cond, mockEvaluator(results), MOCK_VERB);
      assert.equal(result.satisfied, true);
    });
  });

  // ---------------------------------------------------------------------------
  // `not` walk rule
  // ---------------------------------------------------------------------------

  describe('not walk rule', () => {
    it('describes positive condition violated by not', () => {
      const inner: ConditionAST = { op: '==', left: { ref: 'gvar', var: 'aid' }, right: 0 };
      const cond: ConditionAST = { op: 'not', arg: inner };

      const results = new Map<ConditionAST, boolean>();
      results.set(cond, false);
      results.set(inner, true);

      const result = extractBlockers(cond, mockEvaluator(results), MOCK_VERB);
      assert.equal(result.satisfied, false);
      assert.equal(result.blockers.length, 1);
      assert.equal(result.blockers[0]!.description, 'Need Aid \u2260 0');
    });

    it('describes not(in) condition', () => {
      const inner: ConditionAST = { op: 'in', item: 'saigon', set: 'targets' };
      const cond: ConditionAST = { op: 'not', arg: inner };

      const result = extractBlockers(cond, () => false, MOCK_VERB);
      assert.equal(result.blockers[0]!.description, 'Need Saigon not in set');
    });
  });

  // ---------------------------------------------------------------------------
  // Safe evaluation
  // ---------------------------------------------------------------------------

  describe('safe evaluation', () => {
    it('treats evaluator exceptions as false', () => {
      const cond: ConditionAST = { op: '>=', left: { ref: 'gvar', var: 'aid' }, right: 3 };
      const result = extractBlockers(cond, () => { throw new Error('boom'); }, MOCK_VERB);
      assert.equal(result.satisfied, false);
      assert.equal(result.blockers.length, 1);
    });
  });

  // ---------------------------------------------------------------------------
  // Blocker never includes satisfied conditions
  // ---------------------------------------------------------------------------

  describe('invariant: no satisfied conditions in output', () => {
    it('and with all passing children returns no blockers at top level', () => {
      const child1: ConditionAST = { op: '>=', left: 5, right: 3 };
      const child2: ConditionAST = { op: '>=', left: 10, right: 5 };
      const cond: ConditionAST = { op: 'and', args: [child1, child2] };
      const result = extractBlockers(cond, () => true, undefined);
      assert.equal(result.satisfied, true);
      assert.equal(result.blockers.length, 0);
    });
  });

  // ---------------------------------------------------------------------------
  // astPath traceability
  // ---------------------------------------------------------------------------

  describe('astPath traceability', () => {
    it('generates paths for and children', () => {
      const child1: ConditionAST = { op: '>=', left: 1, right: 3 };
      const child2: ConditionAST = { op: '>=', left: 2, right: 5 };
      const cond: ConditionAST = { op: 'and', args: [child1, child2] };

      const results = new Map<ConditionAST, boolean>();
      results.set(cond, false);
      results.set(child1, false);
      results.set(child2, false);

      const result = extractBlockers(cond, mockEvaluator(results), undefined);
      assert.equal(result.blockers[0]!.astPath, 'root.args[0]');
      assert.equal(result.blockers[1]!.astPath, 'root.args[1]');
    });

    it('generates paths for nested conditions', () => {
      const leaf: ConditionAST = { op: '>=', left: 1, right: 3 };
      const inner: ConditionAST = { op: 'and', args: [leaf] };
      const outer: ConditionAST = { op: 'and', args: [inner] };

      const results = new Map<ConditionAST, boolean>();
      results.set(outer, false);
      results.set(inner, false);
      results.set(leaf, false);

      const result = extractBlockers(outer, mockEvaluator(results), undefined);
      assert.equal(result.blockers[0]!.astPath, 'root.args[0].args[0]');
    });
  });

  // ---------------------------------------------------------------------------
  // ValueExpr stringification
  // ---------------------------------------------------------------------------

  describe('value expression stringification', () => {
    it('resolves gvar reference through verbalization', () => {
      const cond: ConditionAST = { op: '>=', left: { ref: 'gvar', var: 'aid' }, right: 3 };
      const result = extractBlockers(cond, () => false, MOCK_VERB);
      assert.equal(result.blockers[0]!.description, 'Need Aid \u2265 3');
    });

    it('resolves pvar reference', () => {
      const cond: ConditionAST = { op: '>=', left: { ref: 'pvar', player: 'active', var: 'aid' }, right: 3 };
      const result = extractBlockers(cond, () => false, MOCK_VERB);
      assert.ok(result.blockers[0]!.description.includes('Aid'));
    });

    it('resolves zoneCount reference', () => {
      const cond: ConditionAST = { op: '>=', left: { ref: 'zoneCount', zone: 'saigon' }, right: 1 };
      const result = extractBlockers(cond, () => false, MOCK_VERB);
      assert.ok(result.blockers[0]!.description.includes('count(Saigon)'));
    });

    it('resolves binding reference', () => {
      const cond: ConditionAST = { op: '>=', left: { ref: 'binding', name: 'selectedCount' }, right: 1 };
      const result = extractBlockers(cond, () => false, undefined);
      assert.ok(result.blockers[0]!.description.includes('Selected Count'));
    });

    it('uses humanize fallback without verbalization', () => {
      const cond: ConditionAST = { op: '>=', left: { ref: 'gvar', var: 'totalEcon' }, right: 5 };
      const result = extractBlockers(cond, () => false, undefined);
      assert.ok(result.blockers[0]!.description.includes('Total Econ'));
    });
  });
});
