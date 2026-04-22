// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../src/agents/index.js';
import {
  assertValidatedGameDef,
  type ValidatedGameDef,
} from '../../src/kernel/index.js';
import { runGame } from '../../src/sim/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import {
  compileProductionSpec,
  compileTexasProductionSpec,
} from '../helpers/production-spec-helpers.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const compileFitlDef = (): ValidatedGameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assertNoErrors(compiled);
  if (compiled.gameDef === null) {
    throw new Error('Expected compiled FITL gameDef to be present');
  }
  return assertValidatedGameDef(compiled.gameDef);
};

const compileTexasDef = (): ValidatedGameDef => {
  const { parsed, compiled } = compileTexasProductionSpec();
  assertNoErrors(parsed);
  assertNoErrors(compiled);
  if (compiled.gameDef === null) {
    throw new Error('Expected compiled Texas gameDef to be present');
  }
  return assertValidatedGameDef(compiled.gameDef);
};

const FITL_POLICY_PROFILES = ['us-baseline', 'arvn-baseline', 'nva-baseline', 'vc-baseline'] as const;

const createFitlPolicyAgents = (): readonly PolicyAgent[] =>
  FITL_POLICY_PROFILES.map((profileId) => new PolicyAgent({ profileId, traceLevel: 'summary' }));

const createTexasPolicyAgents = (count: number): readonly PolicyAgent[] =>
  Array.from({ length: count }, () => new PolicyAgent({ traceLevel: 'summary' }));

const FITL_PLAYER_COUNT = 4;
const TEXAS_PLAYER_COUNT = 6;
const MAX_TURNS = 200;
const REPLAY_COUNT = 3;
/**
 * Replay determinism is already exercised elsewhere in the test suite; this
 * file owns a curated production-scale replay parity proof. Keep FITL seed
 * count smaller than Texas because the determinism lane already carries broad
 * FITL random-play hash coverage in the Zobrist property sweep.
 */
const FITL_SEEDS = process.env.RUN_SLOW_E2E === '1'
  ? [1000, 1001, 1002, 1003, 1004, 1005]
  : [1000, 1001, 1002];
const TEXAS_SEEDS = process.env.RUN_SLOW_E2E === '1'
  ? Array.from({ length: 20 }, (_, index) => 2000 + index)
  : Array.from({ length: 10 }, (_, index) => 2000 + index);

type RunOutcome = {
  readonly kind: 'ok';
  readonly hash: bigint;
} | {
  readonly kind: 'error';
  readonly message: string;
};

/**
 * Run a game and capture either its final hash or its error message.
 */
const runOnce = (
  def: ValidatedGameDef,
  seed: number,
  agentsFactory: () => readonly PolicyAgent[],
  playerCount: number,
): RunOutcome => {
  try {
    const agents = agentsFactory();
    const trace = runGame(def, seed, agents, MAX_TURNS, playerCount, {
      skipDeltas: true,
      traceRetention: 'finalStateOnly',
    });
    return { kind: 'ok', hash: trace.finalState.stateHash };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { kind: 'error', message };
  }
};

const assertDeterministic = (
  def: ValidatedGameDef,
  seed: number,
  agentsFactory: () => readonly PolicyAgent[],
  playerCount: number,
  label: string,
): void => {
  const baseline = runOnce(def, seed, agentsFactory, playerCount);

  for (let replay = 1; replay < REPLAY_COUNT; replay += 1) {
    const candidate = runOnce(def, seed, agentsFactory, playerCount);
    assert.equal(
      baseline.kind,
      candidate.kind,
      `${label} seed ${seed}: replay ${replay + 1} outcome kind diverged (${baseline.kind} vs ${candidate.kind})`,
    );

    if (baseline.kind === 'ok' && candidate.kind === 'ok') {
      assert.equal(
        baseline.hash,
        candidate.hash,
        `${label} seed ${seed}: replay ${replay + 1} final state hash diverged (${baseline.hash.toString(16)} vs ${candidate.hash.toString(16)})`,
      );
    } else if (baseline.kind === 'error' && candidate.kind === 'error') {
      assert.equal(
        baseline.message,
        candidate.message,
        `${label} seed ${seed}: replay ${replay + 1} error message diverged`,
      );
    }
  }
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('draft-state determinism parity', () => {
  describe(`FITL — ${FITL_SEEDS.length} curated seeds produce identical replay outcomes across ${REPLAY_COUNT} runs`, () => {
    const def = compileFitlDef();

    for (const seed of FITL_SEEDS) {
      it(`seed ${seed}`, () => {
        assertDeterministic(def, seed, createFitlPolicyAgents, FITL_PLAYER_COUNT, 'FITL');
      });
    }
  });

  describe(`Texas Hold'em — ${TEXAS_SEEDS.length} seeds produce identical replay outcomes across ${REPLAY_COUNT} runs`, () => {
    const def = compileTexasDef();

    for (const seed of TEXAS_SEEDS) {
      it(`seed ${seed}`, () => {
        assertDeterministic(def, seed, () => createTexasPolicyAgents(TEXAS_PLAYER_COUNT), TEXAS_PLAYER_COUNT, 'Texas');
      });
    }
  });
});
