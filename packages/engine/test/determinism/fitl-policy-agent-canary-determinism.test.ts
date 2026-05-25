// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../src/agents/index.js';
import { assertValidatedGameDef, createGameDefRuntime } from '../../src/kernel/index.js';
import { runGameSteps } from '../../src/sim/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

/**
 * Canary test: FITL seeds with production PolicyAgent profiles must produce
 * deterministic bounded early-game outcomes through the opening window.
 *
 * This guards against regressions where kernel changes (e.g., free-operation
 * grant handling) silently alter legal-move enumeration or turn-flow
 * advancement, causing games to diverge, explode in microturn count, or loop
 * inside the historically pathological opening window.
 *
 * FOUNDATIONS §8: Same GameDef + same seed + same agents = identical result.
 * FOUNDATIONS §10: Games must complete within bounded moves.
 */
describe('FITL PolicyAgent determinism canary', () => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assertNoErrors(compiled);
  if (compiled.gameDef === null) {
    throw new Error('Expected compiled FITL gameDef');
  }
  const def = assertValidatedGameDef(compiled.gameDef);
  const runtime = createGameDefRuntime(def);

  const PROFILES = ['us-baseline', 'arvn-baseline', 'nva-baseline', 'vc-baseline'] as const;
  const MAX_TURNS = 200;
  const PLAYER_COUNT = 4;
  const PREFIX_PLAYER_DECISIONS = 5;

  type PrefixOutcome = {
    readonly kind: 'ok';
    readonly hash: bigint;
    readonly playerDecisions: number;
  } | {
    readonly kind: 'error';
    readonly message: string;
  };

  const runPrefix = (seed: number): PrefixOutcome => {
    try {
      const agents = PROFILES.map(
        (profileId) => new PolicyAgent({ profileId, traceLevel: 'summary' }),
      );
      const iterator = runGameSteps({
        def,
        seed,
        agents,
        maxTurns: MAX_TURNS,
        playerCount: PLAYER_COUNT,
        options: {
          skipDeltas: true,
          traceRetention: 'finalStateOnly',
        },
        runtime,
      });
      let playerDecisions = 0;

      for (;;) {
        const next = iterator.next();
        if (next.done) {
          return {
            kind: 'ok',
            hash: next.value.finalState.stateHash,
            playerDecisions,
          };
        }

        if (next.value.kind === 'player') {
          playerDecisions += 1;
          if (playerDecisions >= PREFIX_PLAYER_DECISIONS) {
            return {
              kind: 'ok',
              hash: next.value.state.stateHash,
              playerDecisions,
            };
          }
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { kind: 'error', message };
    }
  };

  // Post-126FREOPEBIN grant-determinism canary seeds. This file owns a bounded
  // opening-window replay proof for seeds that previously blew up in
  // continuation/publication/policy interaction. Full bounded termination still
  // lives in the broader integration canaries.
  for (const seed of [1020, 1040, 1049, 1054, 2046]) {
    it(`seed ${seed}: replay produces identical bounded-prefix outcome`, { timeout: 20_000 }, () => {
      const trace1 = runPrefix(seed);
      const trace2 = runPrefix(seed);
      assert.equal(
        trace1.kind,
        trace2.kind,
        `seed ${seed}: outcome kind diverged (${trace1.kind} vs ${trace2.kind})`,
      );

      if (trace1.kind === 'ok' && trace2.kind === 'ok') {
        assert.equal(
          trace1.hash,
          trace2.hash,
          `seed ${seed}: bounded-prefix state hash diverged (${trace1.hash.toString(16)} vs ${trace2.hash.toString(16)})`,
        );
        assert.equal(
          trace1.playerDecisions,
          PREFIX_PLAYER_DECISIONS,
          `seed ${seed}: baseline did not reach the bounded prefix`,
        );
        assert.equal(
          trace2.playerDecisions,
          PREFIX_PLAYER_DECISIONS,
          `seed ${seed}: replay did not reach the bounded prefix`,
        );
        return;
      }

      if (trace1.kind === 'error' && trace2.kind === 'error') {
        assert.equal(
          trace1.message,
          trace2.message,
          `seed ${seed}: error message diverged`,
        );
      }
    });
  }
});
