// @test-class: architectural-invariant
/**
 * Tests for stochastic and ambiguous probe classification in chooseN
 * option resolution (ticket 63CHOOPEROPT-006).
 *
 * Verifies:
 * 1. Stochastic singleton probe → unknown, resolution: 'stochastic'
 * 2. Ambiguous singleton probe → unknown, resolution: 'ambiguous'
 * 3. Stochastic/ambiguous options are NOT fed into witness search
 * 4. Option stochastic on one branch but deterministic witness on another → legal
 */
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  runSingletonProbePass,
  runWitnessSearch,
  type SingletonProbeBudget,
  type WitnessSearchBudget,
  type WitnessSearchStats,
} from '../../../src/kernel/choose-n-option-resolution.js';
import { effectRuntimeError } from '../../../src/kernel/effect-error.js';
import { optionKey } from '../../../src/kernel/legal-choices.js';
import { EFFECT_RUNTIME_REASONS } from '../../../src/kernel/runtime-reasons.js';
import type { DecisionSequenceSatisfiability } from '../../../src/kernel/decision-sequence-satisfiability.js';
import type {
  ChoiceOption,
  ChoicePendingChooseNRequest,
  ChoiceRequest,
  Move,
  MoveParamScalar,
} from '../../../src/kernel/types.js';
import type { DecisionKey } from '../../../src/kernel/decision-scope.js';
import { asActionId } from '../../../src/kernel/index.js';

// ── Helpers ─────────────────────────────────────────────────────────────

const asDecisionKey = (value: string): DecisionKey => value as DecisionKey;

const dummyMove: Move = {
  actionId: asActionId('test'),
  params: {} as Move['params'],
};

const makeChooseNRequest = (opts: {
  decisionKey: string;
  domain: readonly MoveParamScalar[];
  selected: readonly MoveParamScalar[];
  min: number;
  max: number;
}): ChoicePendingChooseNRequest => ({
  kind: 'pending',
  complete: false,
  decisionKey: opts.decisionKey as DecisionKey,
  name: 'test',
  type: 'chooseN',
  options: opts.domain.map((v) => ({
    value: v,
    legality: 'unknown' as const,
    illegalReason: null,
    resolution: 'provisional' as const,
  })),
  targetKinds: [],
  min: opts.min,
  max: opts.max,
  selected: [...opts.selected],
  canConfirm: false,
});

const alwaysSatisfiable = (_move: Move): DecisionSequenceSatisfiability => 'satisfiable';

/** Creates an authority-mismatch error recognized by the probe classification pipeline. */
const makeAuthorityMismatchError = (): Error =>
  effectRuntimeError(
    EFFECT_RUNTIME_REASONS.CHOICE_PROBE_AUTHORITY_MISMATCH,
    'test authority mismatch during probe',
    { effectType: 'chooseN' },
  );

// ── Singleton probe: stochastic classification ──────────────────────────

describe('chooseN stochastic and ambiguous probe classification', () => {
  describe('runSingletonProbePass — stochastic', () => {
    it('classifies pendingStochastic probe as unknown with resolution stochastic', () => {
      const domain: MoveParamScalar[] = ['alpha', 'beta'];
      const request = makeChooseNRequest({
        decisionKey: '$items',
        domain,
        selected: [],
        min: 1,
        max: 2,
      });

      const evaluateProbeMove = (_move: Move): ChoiceRequest =>
        ({ kind: 'pendingStochastic' }) as ChoiceRequest;

      const budget: SingletonProbeBudget = { remaining: 10 };
      const result = runSingletonProbePass(
        evaluateProbeMove,
        alwaysSatisfiable,
        dummyMove,
        request,
        domain as Move['params'][string][],
        new Set<string>(),
        budget,
      );

      for (const option of result) {
        assert.equal(option.legality, 'unknown', `${String(option.value)} should be unknown`);
        assert.equal(option.resolution, 'stochastic', `${String(option.value)} should have stochastic resolution`);
      }
    });

    it('does not mark stochastic options as legal or illegal', () => {
      const domain: MoveParamScalar[] = ['x'];
      const request = makeChooseNRequest({
        decisionKey: '$items',
        domain,
        selected: [],
        min: 1,
        max: 1,
      });

      const evaluateProbeMove = (_move: Move): ChoiceRequest =>
        ({ kind: 'pendingStochastic' }) as ChoiceRequest;

      const budget: SingletonProbeBudget = { remaining: 10 };
      const result = runSingletonProbePass(
        evaluateProbeMove,
        alwaysSatisfiable,
        dummyMove,
        request,
        domain as Move['params'][string][],
        new Set<string>(),
        budget,
      );

      assert.equal(result.length, 1);
      const single = result[0]!;
      assert.notEqual(single.legality, 'legal');
      assert.notEqual(single.legality, 'illegal');
    });
  });

  // ── Singleton probe: ambiguous classification ───────────────────────

  describe('runSingletonProbePass — ambiguous', () => {
    it('classifies authority-mismatch probe as unknown with resolution ambiguous', () => {
      const domain: MoveParamScalar[] = ['alpha', 'beta'];
      const request = makeChooseNRequest({
        decisionKey: '$items',
        domain,
        selected: [],
        min: 1,
        max: 2,
      });

      const evaluateProbeMove = (_move: Move): ChoiceRequest => {
        throw makeAuthorityMismatchError();
      };

      const budget: SingletonProbeBudget = { remaining: 10 };
      const result = runSingletonProbePass(
        evaluateProbeMove,
        alwaysSatisfiable,
        dummyMove,
        request,
        domain as Move['params'][string][],
        new Set<string>(),
        budget,
      );

      for (const option of result) {
        assert.equal(option.legality, 'unknown', `${String(option.value)} should be unknown`);
        assert.equal(option.resolution, 'ambiguous', `${String(option.value)} should have ambiguous resolution`);
      }
    });

    it('does not mark ambiguous options as legal or illegal', () => {
      const domain: MoveParamScalar[] = ['y'];
      const request = makeChooseNRequest({
        decisionKey: '$items',
        domain,
        selected: [],
        min: 1,
        max: 1,
      });

      const evaluateProbeMove = (_move: Move): ChoiceRequest => {
        throw makeAuthorityMismatchError();
      };

      const budget: SingletonProbeBudget = { remaining: 10 };
      const result = runSingletonProbePass(
        evaluateProbeMove,
        alwaysSatisfiable,
        dummyMove,
        request,
        domain as Move['params'][string][],
        new Set<string>(),
        budget,
      );

      assert.equal(result.length, 1);
      const single = result[0]!;
      assert.notEqual(single.legality, 'legal');
      assert.notEqual(single.legality, 'illegal');
    });
  });

  // ── Stochastic/ambiguous resolution is distinct from provisional ────

  describe('resolution distinctness', () => {
    it('stochastic resolution is distinct from provisional (budget-exhausted)', () => {
      const domain: MoveParamScalar[] = ['a', 'b'];
      const request = makeChooseNRequest({
        decisionKey: '$items',
        domain,
        selected: [],
        min: 1,
        max: 2,
      });

      // First option gets stochastic, second exhausts budget.
      let callCount = 0;
      const evaluateProbeMove = (_move: Move): ChoiceRequest => {
        callCount += 1;
        return { kind: 'pendingStochastic' } as ChoiceRequest;
      };

      // Budget of 1: first probe succeeds (stochastic), second is budget-exhausted.
      const budget: SingletonProbeBudget = { remaining: 1 };
      const result = runSingletonProbePass(
        evaluateProbeMove,
        alwaysSatisfiable,
        dummyMove,
        request,
        domain as Move['params'][string][],
        new Set<string>(),
        budget,
      );

      const optA = result.find((o) => o.value === 'a');
      const optB = result.find((o) => o.value === 'b');

      assert.ok(optA);
      assert.ok(optB);
      assert.equal(optA.resolution, 'stochastic', 'first option probed → stochastic');
      assert.equal(optB.resolution, 'provisional', 'second option budget-exhausted → provisional');
      assert.equal(callCount, 1, 'only one probe call made before budget exhausted');
    });
  });

  // ── Witness search: stochastic/ambiguous options are skipped ────────

  describe('runWitnessSearch — stochastic/ambiguous exclusion', () => {
    it('does not feed stochastic options into witness search', () => {
      const domain: MoveParamScalar[] = ['s1', 's2'];
      const request = makeChooseNRequest({
        decisionKey: '$items',
        domain,
        selected: [],
        min: 1,
        max: 2,
      });

      // Singleton results: both stochastic.
      const singletonResults: readonly ChoiceOption[] = domain.map((v) => ({
        value: v,
        legality: 'unknown' as const,
        illegalReason: null,
        resolution: 'stochastic' as const,
      }));

      const probeCounter = { count: 0 };
      const evaluateProbeMove = (_move: Move): ChoiceRequest => {
        probeCounter.count += 1;
        return { kind: 'complete' } as ChoiceRequest;
      };

      const budget: WitnessSearchBudget = { remaining: 100 };
      const stats: WitnessSearchStats = { cacheHits: 0, nodesVisited: 0 };

      const result = runWitnessSearch(
        evaluateProbeMove,
        alwaysSatisfiable,
        dummyMove,
        request,
        singletonResults,
        domain as Move['params'][string][],
        new Set<string>(),
        budget,
        stats,
      );

      // No probes should have been made — stochastic options are skipped.
      assert.equal(probeCounter.count, 0, 'no probes for stochastic options');
      assert.equal(stats.nodesVisited, 0, 'no witness search nodes visited');

      // Options should retain their stochastic resolution unchanged.
      for (const option of result) {
        assert.equal(option.legality, 'unknown');
        assert.equal(option.resolution, 'stochastic');
      }
    });

    it('does not feed ambiguous options into witness search', () => {
      const domain: MoveParamScalar[] = ['a1', 'a2'];
      const request = makeChooseNRequest({
        decisionKey: '$items',
        domain,
        selected: [],
        min: 1,
        max: 2,
      });

      const singletonResults: readonly ChoiceOption[] = domain.map((v) => ({
        value: v,
        legality: 'unknown' as const,
        illegalReason: null,
        resolution: 'ambiguous' as const,
      }));

      const probeCounter = { count: 0 };
      const evaluateProbeMove = (_move: Move): ChoiceRequest => {
        probeCounter.count += 1;
        return { kind: 'complete' } as ChoiceRequest;
      };

      const budget: WitnessSearchBudget = { remaining: 100 };
      const stats: WitnessSearchStats = { cacheHits: 0, nodesVisited: 0 };

      const result = runWitnessSearch(
        evaluateProbeMove,
        alwaysSatisfiable,
        dummyMove,
        request,
        singletonResults,
        domain as Move['params'][string][],
        new Set<string>(),
        budget,
        stats,
      );

      assert.equal(probeCounter.count, 0, 'no probes for ambiguous options');
      assert.equal(stats.nodesVisited, 0, 'no witness search nodes visited');

      for (const option of result) {
        assert.equal(option.legality, 'unknown');
        assert.equal(option.resolution, 'ambiguous');
      }
    });

    it('only feeds provisional options into witness search, skipping stochastic and ambiguous', () => {
      // Mix of resolutions: one provisional, one stochastic, one ambiguous.
      const domain: MoveParamScalar[] = ['prov', 'stoch', 'ambig'];
      const request = makeChooseNRequest({
        decisionKey: '$items',
        domain,
        selected: [],
        min: 1,
        max: 3,
      });

      const singletonResults: readonly ChoiceOption[] = [
        { value: 'prov', legality: 'unknown', illegalReason: null, resolution: 'provisional' },
        { value: 'stoch', legality: 'unknown', illegalReason: null, resolution: 'stochastic' },
        { value: 'ambig', legality: 'unknown', illegalReason: null, resolution: 'ambiguous' },
      ];

      const evaluateProbeMove = (_move: Move): ChoiceRequest =>
        ({ kind: 'complete' }) as ChoiceRequest;

      const budget: WitnessSearchBudget = { remaining: 100 };
      const stats: WitnessSearchStats = { cacheHits: 0, nodesVisited: 0 };

      const result = runWitnessSearch(
        evaluateProbeMove,
        alwaysSatisfiable,
        dummyMove,
        request,
        singletonResults,
        domain as Move['params'][string][],
        new Set<string>(),
        budget,
        stats,
      );

      // Only 'prov' should have been probed and found a witness.
      const provOpt = result.find((o) => o.value === 'prov');
      const stochOpt = result.find((o) => o.value === 'stoch');
      const ambigOpt = result.find((o) => o.value === 'ambig');

      assert.ok(provOpt);
      assert.equal(provOpt.legality, 'legal', 'provisional option found witness → legal');
      assert.equal(provOpt.resolution, 'exact');

      assert.ok(stochOpt);
      assert.equal(stochOpt.legality, 'unknown', 'stochastic option unchanged');
      assert.equal(stochOpt.resolution, 'stochastic');

      assert.ok(ambigOpt);
      assert.equal(ambigOpt.legality, 'unknown', 'ambiguous option unchanged');
      assert.equal(ambigOpt.resolution, 'ambiguous');
    });
  });

  // ── Witness search: stochastic branch skipped, deterministic witness found ──

  describe('runWitnessSearch — stochastic branch with deterministic witness', () => {
    it('finds legal witness when one extension is stochastic but another is confirmable', () => {
      // Domain: [X, Y, Z], min=2, max=2, selected=[]
      // Singleton results: all provisional (unresolved by singleton pass).
      // For target X: base=[X], extensions=[Y, Z]
      //   Probe [X, Y] → stochastic (branch exhausted)
      //   Probe [X, Z] → confirmable (witness found!)
      // → X should be legal.
      const domain: MoveParamScalar[] = ['X', 'Y', 'Z'];
      const request = makeChooseNRequest({
        decisionKey: '$items',
        domain,
        selected: [],
        min: 2,
        max: 2,
      });

      const singletonResults: readonly ChoiceOption[] = domain.map((v) => ({
        value: v,
        legality: 'unknown' as const,
        illegalReason: null,
        resolution: 'provisional' as const,
      }));

      const evaluateProbeMove = (move: Move): ChoiceRequest => {
        const selection = move.params[asDecisionKey('$items')] as readonly MoveParamScalar[];
        const keys = new Set(selection.map((v) => optionKey(v)));

        // [X, Y] → stochastic boundary
        if (keys.has(optionKey('X')) && keys.has(optionKey('Y')) && selection.length === 2) {
          return { kind: 'pendingStochastic' } as ChoiceRequest;
        }

        // [Y, Z] → stochastic boundary
        if (keys.has(optionKey('Y')) && keys.has(optionKey('Z')) && selection.length === 2) {
          return { kind: 'pendingStochastic' } as ChoiceRequest;
        }

        // All other pairs → confirmable
        return { kind: 'complete' } as ChoiceRequest;
      };

      const budget: WitnessSearchBudget = { remaining: 100 };
      const stats: WitnessSearchStats = { cacheHits: 0, nodesVisited: 0 };

      const result = runWitnessSearch(
        evaluateProbeMove,
        alwaysSatisfiable,
        dummyMove,
        request,
        singletonResults,
        domain as Move['params'][string][],
        new Set<string>(),
        budget,
        stats,
      );

      const optX = result.find((o) => o.value === 'X');
      const optY = result.find((o) => o.value === 'Y');
      const optZ = result.find((o) => o.value === 'Z');

      assert.ok(optX);
      // X has witness through [X, Z] (confirmable)
      assert.equal(optX.legality, 'legal', 'X should be legal (witness [X,Z] found)');
      assert.equal(optX.resolution, 'exact');

      assert.ok(optZ);
      // Z has witness through [Z, X] (confirmable)
      assert.equal(optZ.legality, 'legal', 'Z should be legal (witness [Z,X] found)');
      assert.equal(optZ.resolution, 'exact');

      assert.ok(optY);
      // Y: [Y, X] → stochastic, [Y, Z] → stochastic → all branches exhausted → illegal
      assert.equal(optY.legality, 'illegal', 'Y should be illegal (all branches stochastic)');
      assert.equal(optY.resolution, 'exact');
    });

    it('marks option illegal when ALL branches are stochastic', () => {
      // Domain: [A, B], min=2, max=2, selected=[]
      // For target A: base=[A], extensions=[B]
      //   Probe [A, B] → stochastic → exhausted → A is illegal (no witness found)
      const domain: MoveParamScalar[] = ['A', 'B'];
      const request = makeChooseNRequest({
        decisionKey: '$items',
        domain,
        selected: [],
        min: 2,
        max: 2,
      });

      const singletonResults: readonly ChoiceOption[] = domain.map((v) => ({
        value: v,
        legality: 'unknown' as const,
        illegalReason: null,
        resolution: 'provisional' as const,
      }));

      const evaluateProbeMove = (_move: Move): ChoiceRequest =>
        ({ kind: 'pendingStochastic' }) as ChoiceRequest;

      const budget: WitnessSearchBudget = { remaining: 100 };
      const result = runWitnessSearch(
        evaluateProbeMove,
        alwaysSatisfiable,
        dummyMove,
        request,
        singletonResults,
        domain as Move['params'][string][],
        new Set<string>(),
        budget,
      );

      for (const option of result) {
        assert.equal(option.legality, 'illegal', `${String(option.value)} all-stochastic → illegal`);
        assert.equal(option.resolution, 'exact');
      }
    });

    it('marks option illegal when ALL branches are ambiguous', () => {
      // Same setup but with ambiguous instead of stochastic.
      const domain: MoveParamScalar[] = ['A', 'B'];
      const request = makeChooseNRequest({
        decisionKey: '$items',
        domain,
        selected: [],
        min: 2,
        max: 2,
      });

      const singletonResults: readonly ChoiceOption[] = domain.map((v) => ({
        value: v,
        legality: 'unknown' as const,
        illegalReason: null,
        resolution: 'provisional' as const,
      }));

      const evaluateProbeMove = (_move: Move): ChoiceRequest => {
        throw makeAuthorityMismatchError();
      };

      const budget: WitnessSearchBudget = { remaining: 100 };
      const result = runWitnessSearch(
        evaluateProbeMove,
        alwaysSatisfiable,
        dummyMove,
        request,
        singletonResults,
        domain as Move['params'][string][],
        new Set<string>(),
        budget,
      );

      for (const option of result) {
        assert.equal(option.legality, 'illegal', `${String(option.value)} all-ambiguous → illegal`);
        assert.equal(option.resolution, 'exact');
      }
    });
  });
});
