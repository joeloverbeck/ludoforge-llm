// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../src/agents/index.js';
import {
  assertValidatedGameDef,
  type ValidatedGameDef,
} from '../../src/kernel/index.js';
import { createGameDefRuntime } from '../../src/kernel/gamedef-runtime.js';
import { runGame } from '../../src/sim/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileTexasProductionSpec } from '../helpers/production-spec-helpers.js';

const compileTexasDef = (): ValidatedGameDef => {
  const { parsed, compiled } = compileTexasProductionSpec();
  assertNoErrors(parsed);
  assertNoErrors(compiled);
  if (compiled.gameDef === null) {
    throw new Error('Texas compilation produced null gameDef');
  }
  return assertValidatedGameDef(compiled.gameDef);
};

const createTexasPolicyAgents = (count: number): readonly PolicyAgent[] =>
  Array.from({ length: count }, () => new PolicyAgent({ traceLevel: 'summary' }));

describe('Zobrist incremental parity — Texas Hold\'em', () => {
  const TEXAS_PLAYER_COUNT = 4;
  const TEXAS_MAX_TURNS = 100;
  const TEXAS_SEEDS = [1, 17, 42, 99, 256];

  const def = compileTexasDef();
  const runtime = createGameDefRuntime(def);

  for (const seed of TEXAS_SEEDS) {
    it(`seed=${seed}: incremental hash matches full recompute every move`, () => {
      const agents = createTexasPolicyAgents(TEXAS_PLAYER_COUNT);

      // Run with verification enabled — throws HASH_DRIFT on mismatch
      const trace = runGame(def, seed, agents, TEXAS_MAX_TURNS, TEXAS_PLAYER_COUNT, {
        kernel: { verifyIncrementalHash: true },
      }, runtime);

      assert.ok(trace.decisions.length > 0, `seed=${seed} should produce at least one move`);
    });
  }
});

describe('Zobrist incremental parity — interval mode', () => {
  const def = compileTexasDef();
  const runtime = createGameDefRuntime(def);

  it('verifies every 5th move without error', () => {
    const agents = createTexasPolicyAgents(4);

    const trace = runGame(def, 42, agents, 100, 4, {
      kernel: { verifyIncrementalHash: { interval: 5 } },
    }, runtime);

    assert.ok(trace.decisions.length > 0, 'should produce at least one move');
  });
});
