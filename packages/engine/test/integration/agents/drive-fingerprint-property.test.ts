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
// Original empirical evidence (FITL, seed 42, maxTurns 10, all four baseline
// profiles concurrent, `verifyIncrementalHash: true`, drive-result capture):
//   - 617 total drives across the corpus
//   - 564 distinct fingerprints (with the proposed shape)
//   - 48 fingerprint partitions with >1 captured drive
//   - **19 of those 48 partitions contained at least one pair of drives whose
//     post-state stateHashes differed** — i.e., the fingerprint said they
//     should produce identical DriveResults, but they didn't.
//
// Sample violations from the original FITL run:
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
//      shape was 8.59% on the original corpus — already below
//      POLPREVDRIVE-005's 25% perf gate. Even if all 48 collapsible
//      partitions had been sound (they weren't), the implementation
//      overhead would not justify the change.
//
// This test is the permanent gate evidence per POLPREVDRIVE-005 §1
// ("If this test cannot be made to pass [as the identity oracle], the
// ticket is closed without a code change, and the gate test stays as a
// permanent record of why the dedupe is not currently sound").
//
// Distilled assertion (architectural form, replaces the corpus-witness
// observation above):
//
//   On the FITL corpus, there exists at least one reachable state whose
//   `legalMoves(state)` enumeration contains a `(actionId, canonicalParamsJSON)`
//   group with two or more distinct `toMoveIdentityKey` results.
//
// This is a strictly structural property of the kernel's option-matrix
// expansion (`legal-moves.ts:tryPushOptionMatrixFilteredMove`): when two
// option-matrix variants of the same `(actionId, params)` overlay are
// simultaneously legal at a state, they share the proposed fingerprint
// `(actionId, paramsJSON, sourceStateHash)` but produce distinct
// `stableMoveKey`s. Any cross-candidate cache keyed at fingerprint
// granularity would alias these into a single entry — unsound.
//
// The distilled form does not depend on whether the preview-budget allocator
// elects to drive both variants. As long as the kernel publishes both as
// legal at any one state in the corpus, the test passes. If a future kernel
// change collapses `actionClass`/`freeOperation` into `params` (or otherwise
// removes the option-matrix discrimination), the assertion fails and
// POLPREVDRIVE-005 should be reassessed before re-opening the cache
// implementation.

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertValidatedGameDef,
  createGameDefRuntime,
  legalMoves,
  type Agent,
  type AgentMicroturnDecisionInput,
  type AgentMicroturnDecisionResult,
} from '../../../src/kernel/index.js';
import { toMoveIdentityKey } from '../../../src/kernel/move-identity.js';
import { runGame } from '../../../src/sim/index.js';
import { getFitlProductionFixture } from '../../helpers/production-spec-helpers.js';
import { createSeededChoiceAgents } from '../../helpers/test-agents.js';

// Exploration vehicle: seeded-choice agents pick a legal action uniformly from
// the published frontier. They depend on no policy semantics, so policy-layer
// evolutions (e.g. Spec 190 plan-primary root authority) cannot shift the
// trajectory away from option-matrix-overlapping states the way PolicyAgent
// can. The original empirical corpus this test guards was captured with
// PolicyAgent baselines (`us-baseline`/`arvn-baseline`/`nva-baseline`/
// `vc-baseline`) on seed 42; Spec 190's plan-primary trajectory observed
// 0 collisions on that exact corpus while the kernel property remained
// unchanged. Seeded-choice agents reach option-matrix-overlapping states on
// every probed seed (42/100/200/500/1000) under both pre- and post-Spec-190
// kernels, so the test now exercises the kernel-structural property
// (`legal-moves.ts:tryPushOptionMatrixFilteredMove`) independently of policy
// trajectory.

const CORPUS_SEEDS = [42, 100, 200, 500, 1000] as const;
const CORPUS = {
  maxTurns: 10,
  playerCount: 4,
} as const;

interface FingerprintCollision {
  readonly stateHash: string;
  readonly actionId: string;
  readonly paramsJSON: string;
  readonly stableMoveKeys: readonly string[];
}

describe('POLPREVDRIVE-005 — drive fingerprint identity property', () => {
  it('proves fingerprint=(actionId, paramsJSON, sourceStateHash) is structurally weaker than stableMoveKey on the FITL legal-moves corpus (POLPREVDRIVE-005 closed without implementation)', () => {
    const def = assertValidatedGameDef(getFitlProductionFixture().gameDef);
    const runtime = createGameDefRuntime(def);

    let totalStatesObserved = 0;
    let totalLegalMoveEnumerations = 0;
    let collisionCount = 0;
    let firstCollision: FingerprintCollision | undefined;

    const observe = (input: AgentMicroturnDecisionInput): void => {
      totalStatesObserved += 1;
      const moves = legalMoves(input.def, input.state, undefined, input.runtime);
      if (moves.length === 0) {
        return;
      }
      totalLegalMoveEnumerations += 1;

      const partitions = new Map<string, Map<string, true>>();
      for (const move of moves) {
        const fingerprint = `${String(move.actionId)}|${stableStringify(move.params)}`;
        let stableMoveKeysInGroup = partitions.get(fingerprint);
        if (stableMoveKeysInGroup === undefined) {
          stableMoveKeysInGroup = new Map();
          partitions.set(fingerprint, stableMoveKeysInGroup);
        }
        const stableMoveKey = toMoveIdentityKey(input.def, move);
        stableMoveKeysInGroup.set(stableMoveKey, true);
      }

      for (const [fingerprint, stableMoveKeysInGroup] of partitions) {
        if (stableMoveKeysInGroup.size <= 1) {
          continue;
        }
        collisionCount += 1;
        if (firstCollision === undefined) {
          const separatorIndex = fingerprint.indexOf('|');
          firstCollision = {
            stateHash: input.state.stateHash.toString(16),
            actionId: fingerprint.slice(0, separatorIndex),
            paramsJSON: fingerprint.slice(separatorIndex + 1),
            stableMoveKeys: [...stableMoveKeysInGroup.keys()],
          };
        }
      }
    };

    for (const seed of CORPUS_SEEDS) {
      const inner = createSeededChoiceAgents(CORPUS.playerCount);
      const agents: Agent[] = inner.map((agent) => wrapAgentWithLegalMoveObserver(agent, observe));
      runGame(
        def,
        seed,
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
    }

    process.stderr.write(
      `[polprevdrive-005-record] seeds=${CORPUS_SEEDS.join(',')} ` +
      `statesObserved=${totalStatesObserved} ` +
      `legalMoveEnumerations=${totalLegalMoveEnumerations} ` +
      `fingerprintCollisions=${collisionCount}\n`,
    );

    if (firstCollision !== undefined) {
      process.stderr.write(
        `[polprevdrive-005-record] sample-collision actionId=${firstCollision.actionId} ` +
        `paramsJSON=${firstCollision.paramsJSON} ` +
        `sourceStateHash=${firstCollision.stateHash} ` +
        `stableMoveKeys=${JSON.stringify(firstCollision.stableMoveKeys)}\n`,
      );
    }

    assert.ok(
      collisionCount > 0,
      `Expected at least one reachable state where legalMoves(state) contains a (actionId, canonicalParamsJSON) ` +
      `group with two or more distinct stableMoveKeys, proving that fingerprint=(actionId, paramsJSON, sourceStateHash) ` +
      `is strictly weaker than stableMoveKey and therefore unsound as a drive cache identity oracle. ` +
      `Found 0 such collisions across ${totalLegalMoveEnumerations} legal-move enumerations on the FITL corpus ` +
      `(seeds ${CORPUS_SEEDS.join(',')}). ` +
      `If this assertion fails, the kernel may have collapsed actionClass/freeOperation into params, removing ` +
      `the option-matrix discrimination in legal-moves.ts:tryPushOptionMatrixFilteredMove; reassess POLPREVDRIVE-005 ` +
      `before re-opening the cache implementation.`,
    );
  });
});

function wrapAgentWithLegalMoveObserver(
  inner: Agent,
  observe: (input: AgentMicroturnDecisionInput) => void,
): Agent {
  return {
    chooseDecision(input: AgentMicroturnDecisionInput): AgentMicroturnDecisionResult {
      observe(input);
      return inner.chooseDecision(input);
    },
  };
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`);
  return `{${entries.join(',')}}`;
}
