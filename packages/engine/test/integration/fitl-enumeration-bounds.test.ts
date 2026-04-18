// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { enumerateLegalMoves, createGameDefRuntime } from '../../src/kernel/index.js';
import {
  buildDeterministicFitlStateCorpus,
  compileFitlValidatedGameDef,
} from '../helpers/compiled-condition-production-helpers.js';

/**
 * Architectural invariant: `enumerateLegalMoves` returns a bounded move set
 * in finite time for every reachable in-flight state of the FITL production
 * spec. Guards against enumeration-stall regressions (former ply-20 / ply-59
 * hotspots on seeds 1040 and 1012). Property form distilled from
 * convergence-witness `132AGESTUVIA-001` per Spec 137.
 */

const CANARY_SEEDS = [1040, 1012] as const;
const MAX_PLY = 60;
// Observed peak across the [1040, 1012] / maxPly=60 corpus is 31 moves, so 64
// keeps approximately 2x headroom while still detecting meaningful growth.
const MAX_REASONABLE_MOVE_COUNT = 64;

describe('FITL enumerateLegalMoves bounds', () => {
  const def = compileFitlValidatedGameDef();
  const runtime = createGameDefRuntime(def);

  it('enumerates bounded legal-move sets across a sampled FITL state corpus', { timeout: 20_000 }, () => {
    const corpus = buildDeterministicFitlStateCorpus(def, {
      seeds: [...CANARY_SEEDS],
      maxPly: MAX_PLY,
    });

    assert.ok(corpus.length > 0, 'Expected the FITL canary corpus to contain sampled states');

    for (const state of corpus) {
      const legal = enumerateLegalMoves(def, state, undefined, runtime);
      assert.ok(
        legal.moves.length <= MAX_REASONABLE_MOVE_COUNT,
        `enumeration produced ${legal.moves.length} moves (exceeds bound ${MAX_REASONABLE_MOVE_COUNT})`,
      );
    }
  });
});
