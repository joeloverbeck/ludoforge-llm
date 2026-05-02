// @test-class: architectural-invariant
//
// POLPREVDRIVE-005 — Cross-candidate drive fingerprint identity property.
//
// Permanent record of the empirical finding that closed POLPREVDRIVE-005
// without an implementation: the proposed cross-candidate drive cache key
// `(actionId, canonical-payload-hash, sourceStateHash)` is NOT a sound
// identity oracle for `DriveResult` on the FITL replay corpus, because
// `Move.actionClass` and `Move.freeOperation` are part of the move's
// effective identity (they appear in `stableMoveKey` via
// `kernel/move-identity.ts:toMoveIdentityKey`) but are not part of `params`,
// and the kernel's drive over a move applies these fields in ways that change
// post-state turn-flow tracking.
//
// Empirical evidence (FITL, seed 42, maxTurns 10, all four baseline profiles
// concurrent, `verifyIncrementalHash: true`):
//   - 617 total drives across the corpus
//   - 564 distinct fingerprints (with the proposed shape)
//   - 48 fingerprint partitions with >1 captured drive
//   - **19 of those 48 partitions contain at least one pair of drives whose
//     post-state stateHashes differ** — i.e., the fingerprint says they
//     should produce identical DriveResults, but they don't.
//
// Sample violations from the FITL run:
//   fingerprint=rally|{}|5578f9412c34b9ef
//     drive A: completed depth=3 stateHash=6d649c9bfd8478d1
//     drive B: completed depth=3 stateHash=2d2d88bc48f3261f
//   fingerprint=march|{}|397f4209d6160471
//     drive A: completed depth=4 stateHash=3963d209d61150c4
//     drive B: completed depth=4 stateHash=3963d109d61152b7
//
// In every observed violation pair the drives shared `actionId` and
// `params`, but were enumerated as distinct `stableMoveKey`s (different
// `actionClass` overlay or `freeOperation` flag) per the FITL turn-flow
// option matrix in `kernel/legal-moves.ts:tryPushOptionMatrixFilteredMove`.
//
// Why the dedupe is closed (not enriched):
//   1. Enriching the fingerprint to include `actionClass` and
//      `freeOperation` makes it equivalent to `stableMoveKey` within a
//      single `evaluatePolicyMoveCore` pass (sourceStateHash is already
//      constant within a pass).
//   2. The existing `PolicyPreviewRuntime` cache at
//      `agents/policy-preview.ts:cache = new Map<string, PreviewOutcome>()`
//      already memoizes drives by `stableMoveKey`. A "cross-candidate"
//      cache keyed by anything ≥ stableMoveKey-strong cannot collapse
//      anything beyond what the existing cache already collapses.
//   3. The would-be cross-candidate hit rate at the natural fingerprint
//      shape is 8.59% — already below POLPREVDRIVE-005's 25% perf gate.
//      Even if all 48 collapsible partitions had been sound (they're not),
//      the implementation overhead would not justify the change.
//
// This test is the permanent gate evidence per POLPREVDRIVE-005 §1
// ("If this test cannot be made to pass [as the identity oracle], the
// ticket is closed without a code change, and the gate test stays as a
// permanent record of why the dedupe is not currently sound"). It asserts
// the unsoundness empirically: at least one fingerprint partition with
// divergent DriveResults must be observed on the corpus. If a future
// kernel change accidentally makes the fingerprint sound (e.g., by
// removing the actionClass/freeOperation discrimination), the assertion
// will fail and POLPREVDRIVE-005 should be reassessed.

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../../src/agents/index.js';
import { __internal_for_tests as policyPreviewInternals, type DriveResultCapture } from '../../../src/agents/policy-preview.js';
import {
  assertValidatedGameDef,
  createGameDefRuntime,
  type Agent,
} from '../../../src/kernel/index.js';
import { runGame } from '../../../src/sim/index.js';
import { getFitlProductionFixture } from '../../helpers/production-spec-helpers.js';

const FITL_BASELINE_PROFILES = ['us-baseline', 'arvn-baseline', 'nva-baseline', 'vc-baseline'] as const;

const CORPUS = {
  seed: 42,
  maxTurns: 10,
  playerCount: 4,
} as const;

interface DriveResultIdentity {
  readonly resultKind: DriveResultCapture['resultKind'];
  readonly resultDepth: number | undefined;
  readonly resultStateHash: string | undefined;
  readonly resultReason: string | undefined;
  readonly resultFailureReason: string | undefined;
}

describe('POLPREVDRIVE-005 — drive fingerprint identity property', () => {
  it('records that fingerprint (actionId, paramsJSON, sourceStateHash) is unsound on the FITL replay corpus (POLPREVDRIVE-005 closed without implementation)', () => {
    const def = assertValidatedGameDef(getFitlProductionFixture().gameDef);
    const runtime = createGameDefRuntime(def);
    const agents: Agent[] = FITL_BASELINE_PROFILES.map((profileId) =>
      new PolicyAgent({ profileId, traceLevel: 'summary' }),
    );

    const captures: DriveResultCapture[] = [];
    policyPreviewInternals.setDriveResultSink((capture) => {
      captures.push(capture);
    });

    try {
      runGame(
        def,
        CORPUS.seed,
        agents,
        CORPUS.maxTurns,
        CORPUS.playerCount,
        {
          kernel: { verifyIncrementalHash: true },
          skipDeltas: true,
          traceRetention: 'finalStateOnly',
        },
        runtime,
      );
    } finally {
      policyPreviewInternals.setDriveResultSink(undefined);
    }

    assert.ok(
      captures.length > 0,
      'Expected at least one driveSyntheticCompletion capture on the FITL corpus.',
    );

    const partitions = new Map<string, DriveResultCapture[]>();
    for (const capture of captures) {
      const fingerprint = `${capture.actionId}|${capture.paramsJSON}|${capture.sourceStateHash.toString(16)}`;
      let group = partitions.get(fingerprint);
      if (group === undefined) {
        group = [];
        partitions.set(fingerprint, group);
      }
      group.push(capture);
    }

    let collapsibleGroupCount = 0;
    let violatingGroupCount = 0;
    let firstViolationFingerprint: string | undefined;
    let firstViolationFirst: DriveResultIdentity | undefined;
    let firstViolationOther: DriveResultIdentity | undefined;

    for (const [fingerprint, group] of partitions) {
      if (group.length <= 1) {
        continue;
      }
      collapsibleGroupCount += 1;
      const baseline = identityOf(group[0]!);
      let groupHasViolation = false;
      for (let index = 1; index < group.length; index += 1) {
        const other = identityOf(group[index]!);
        if (
          other.resultKind !== baseline.resultKind
          || other.resultDepth !== baseline.resultDepth
          || other.resultStateHash !== baseline.resultStateHash
          || other.resultReason !== baseline.resultReason
          || other.resultFailureReason !== baseline.resultFailureReason
        ) {
          if (firstViolationFingerprint === undefined) {
            firstViolationFingerprint = fingerprint;
            firstViolationFirst = baseline;
            firstViolationOther = other;
          }
          groupHasViolation = true;
        }
      }
      if (groupHasViolation) {
        violatingGroupCount += 1;
      }
    }

    const totalDrives = captures.length;
    const distinctFingerprints = partitions.size;
    const wouldBeCacheHits = totalDrives - distinctFingerprints;
    const hitRatePct = totalDrives === 0 ? 0 : (wouldBeCacheHits / totalDrives) * 100;

    process.stderr.write(
      `[polprevdrive-005-record] totalDrives=${totalDrives} distinctFingerprints=${distinctFingerprints} ` +
      `collapsibleGroups=${collapsibleGroupCount} violatingGroups=${violatingGroupCount} ` +
      `wouldBeCacheHits=${wouldBeCacheHits} hitRatePct=${hitRatePct.toFixed(2)}\n`,
    );

    assert.ok(
      violatingGroupCount > 0,
      `Expected at least one fingerprint partition with divergent DriveResults on the FITL corpus, ` +
      `proving that fingerprint=(actionId, paramsJSON, sourceStateHash) is not a sound identity oracle. ` +
      `Found violatingGroups=${violatingGroupCount} of collapsibleGroups=${collapsibleGroupCount}. ` +
      `If this assertion fails, the kernel may have changed in a way that affects move-identity discrimination ` +
      `(actionClass/freeOperation overlay in legal-moves.ts:tryPushOptionMatrixFilteredMove); reassess POLPREVDRIVE-005 ` +
      `before re-opening the cache implementation.`,
    );

    if (firstViolationFingerprint !== undefined) {
      process.stderr.write(
        `[polprevdrive-005-record] sample-violation fingerprint=${firstViolationFingerprint} ` +
        `first=${JSON.stringify(firstViolationFirst)} other=${JSON.stringify(firstViolationOther)}\n`,
      );
    }
  });
});

function identityOf(capture: DriveResultCapture): DriveResultIdentity {
  return {
    resultKind: capture.resultKind,
    resultDepth: capture.resultDepth,
    resultStateHash: capture.resultStateHash === undefined ? undefined : capture.resultStateHash.toString(16),
    resultReason: capture.resultReason,
    resultFailureReason: capture.resultFailureReason,
  };
}
