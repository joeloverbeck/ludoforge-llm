// @test-class: architectural-invariant
// @witness: fitl-seed-5000-shared-runtime-repeated-run
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertValidatedGameDef,
  createGameDefRuntime,
  serializeTrace,
} from '../../src/kernel/index.js';
import { runGame } from '../../src/sim/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import { createSeededChoiceAgents } from '../helpers/test-agents.js';

const MAX_TURNS = 200;
const PLAYER_COUNT = 4;
const SEEDS = [5000, 5001] as const;
const ALLOWED_STOP_REASONS = new Set(['terminal', 'maxTurns', 'noLegalMoves']);

describe('FITL seed 5000 repeated-run regression gate', () => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assertNoErrors(compiled);
  if (compiled.gameDef === null) {
    throw new Error('Expected compiled FITL gameDef');
  }

  const def = assertValidatedGameDef(compiled.gameDef);
  const runtime = createGameDefRuntime(def);

  const runSeed = (seed: number) =>
    runGame(def, seed, createSeededChoiceAgents(PLAYER_COUNT), MAX_TURNS, PLAYER_COUNT, { skipDeltas: true }, runtime);

  it('keeps the stalled shared-runtime seeds bounded', { timeout: 20_000 }, () => {
    for (const seed of SEEDS) {
      const trace = runSeed(seed);
      assert.equal(
        ALLOWED_STOP_REASONS.has(trace.stopReason),
        true,
        `seed ${seed}: expected terminal/maxTurns/noLegalMoves, got ${trace.stopReason} after ${trace.decisions.length} decisions`,
      );
      assert.ok(trace.decisions.length > 0, `seed ${seed}: expected at least one decision`);
      assert.ok(trace.turnsCount >= 2, `seed ${seed}: expected repeated-run witness to retire beyond the opening turn`);
      assert.ok(trace.compoundTurns.length <= MAX_TURNS, `seed ${seed}: compound turns ${trace.compoundTurns.length} exceeded ${MAX_TURNS}`);
    }
  });

  it('remains deterministic across repeated shared-runtime runs', { timeout: 20_000 }, () => {
    const first = JSON.stringify(serializeTrace(runSeed(5000)));
    const second = JSON.stringify(serializeTrace(runSeed(5000)));

    assert.equal(first, second);
  });
});
