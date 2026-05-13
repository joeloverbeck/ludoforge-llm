// @test-class: architectural-invariant
//
// Spec 168 Phase 3: run-local decision-stack frame digest cache.

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { forkGameDefRuntimeForRun } from '../../src/kernel/gamedef-runtime.js';
import {
  computeFullHash,
  digestDecisionStackFrame,
  recomputeDecisionStackFrameDigest,
} from '../../src/kernel/zobrist.js';
import {
  collectChooseOneDriveFixtures,
} from '../helpers/drive-parity-helpers.js';
import {
  createFitlRuntime,
  FITL_PLAYER_COUNT,
  runVerifiedGameWithDiagnostics,
} from '../helpers/zobrist-incremental-property-helpers.js';

const ROOT_PARENT_DIGEST = 'root';

describe('Spec 168 zobrist frame digest cache', () => {
  it('returns byte-identical frame digests for cache hits, misses, and recomputes on the FITL canary corpus', () => {
    const { def, runtime } = createFitlRuntime();
    const forkedRuntime = forkGameDefRuntimeForRun(runtime);
    const fixtures = collectChooseOneDriveFixtures(def, forkedRuntime, {
      seed: 1,
      playerCount: FITL_PLAYER_COUNT,
      count: 3,
      expectedMinDepth: 1,
      maxSteps: 24,
    });
    forkedRuntime.zobristTable.frameDigestCache.clear();

    let checkedFrames = 0;
    for (const fixture of fixtures) {
      const frames = fixture.state.decisionStack ?? [];
      assert.ok(frames.length > 0, `${fixture.label}: expected decision-stack frames`);

      let parentDigest = ROOT_PARENT_DIGEST;
      for (const [slot, frame] of frames.entries()) {
        const expected = recomputeDecisionStackFrameDigest(frame, parentDigest);
        const miss = digestDecisionStackFrame(structuredClone(frame), forkedRuntime.zobristTable, parentDigest);
        const hit = digestDecisionStackFrame(structuredClone(frame), forkedRuntime.zobristTable, parentDigest);

        assert.equal(miss, expected, `${fixture.label}: slot ${slot} miss differs from recompute`);
        assert.equal(hit, expected, `${fixture.label}: slot ${slot} hit differs from recompute`);
        parentDigest = hit;
        checkedFrames += 1;
      }
    }

    assert.ok(checkedFrames > 0, 'expected at least one FITL decision-stack frame');
    assert.ok(
      forkedRuntime.zobristTable.frameDigestCache.size >= checkedFrames,
      'expected run-local frame digest cache entries',
    );
  });

  it('keeps WeakMap frame memoization scoped by parent-frame digest', () => {
    const { def, runtime } = createFitlRuntime();
    const forkedRuntime = forkGameDefRuntimeForRun(runtime);
    const [fixture] = collectChooseOneDriveFixtures(def, forkedRuntime, {
      seed: 1,
      playerCount: FITL_PLAYER_COUNT,
      count: 1,
      expectedMinDepth: 1,
      maxSteps: 24,
    });
    assert.ok(fixture, 'expected one FITL drive fixture');
    const [frame] = fixture.state.decisionStack ?? [];
    assert.ok(frame, `${fixture.label}: expected decision-stack frame`);

    const first = digestDecisionStackFrame(frame, forkedRuntime.zobristTable, ROOT_PARENT_DIGEST);
    const alternateParentDigest = 'alternate-parent';
    const second = digestDecisionStackFrame(frame, forkedRuntime.zobristTable, alternateParentDigest);

    assert.equal(first, recomputeDecisionStackFrameDigest(frame, ROOT_PARENT_DIGEST));
    assert.equal(second, recomputeDecisionStackFrameDigest(frame, alternateParentDigest));
    assert.notEqual(first, second);
  });

  it('forks frameDigestCache as run-local state', () => {
    const { runtime } = createFitlRuntime();
    runtime.zobristTable.frameDigestCache.set('frame=1', 'digest=1');

    const forkedRuntime = forkGameDefRuntimeForRun(runtime);

    assert.notEqual(forkedRuntime.zobristTable.frameDigestCache, runtime.zobristTable.frameDigestCache);
    assert.equal(forkedRuntime.zobristTable.frameDigestCache.size, 0);
    assert.equal(runtime.zobristTable.frameDigestCache.size, 1);
  });

  it('preserves replay state-hash identity with populated and empty frame digest caches', () => {
    const { def, runtime } = createFitlRuntime();
    const seededRuntime = forkGameDefRuntimeForRun(runtime);
    const fixtures = collectChooseOneDriveFixtures(def, seededRuntime, {
      seed: 1,
      playerCount: FITL_PLAYER_COUNT,
      count: 2,
      expectedMinDepth: 1,
      maxSteps: 24,
    });
    for (const fixture of fixtures) {
      computeFullHash(seededRuntime.zobristTable, fixture.state);
    }
    assert.ok(seededRuntime.zobristTable.frameDigestCache.size > 0, 'expected populated frame digest cache');

    const cachedResult = runVerifiedGameWithDiagnostics(def, 1, FITL_PLAYER_COUNT, 1, seededRuntime);
    const emptyRuntime = forkGameDefRuntimeForRun(runtime);
    const emptyResult = runVerifiedGameWithDiagnostics(def, 1, FITL_PLAYER_COUNT, 1, emptyRuntime);

    assertCompleted(cachedResult);
    assertCompleted(emptyResult);
    assert.equal(cachedResult.finalStateHash, emptyResult.finalStateHash);
    assert.equal(cachedResult.decisionCount, emptyResult.decisionCount);
    assert.equal(cachedResult.turnsCount, emptyResult.turnsCount);
  });
});

function assertCompleted(
  result: ReturnType<typeof runVerifiedGameWithDiagnostics>,
): asserts result is Extract<ReturnType<typeof runVerifiedGameWithDiagnostics>, { readonly outcome: 'completed' }> {
  assert.equal(result.outcome, 'completed', `expected completed run, got ${result.outcome}`);
}
