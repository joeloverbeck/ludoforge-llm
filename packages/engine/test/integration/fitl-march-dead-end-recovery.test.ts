// @test-class: convergence-witness
// @witness: spec-144-seed-1001-nva-march

import * as assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { PolicyAgent } from '../../src/agents/index.js';
import {
  assertValidatedGameDef,
  createGameDefRuntime,
  initialState,
  serializeGameState,
} from '../../src/kernel/index.js';
import { runGame } from '../../src/sim/index.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const VARIANT_PROFILES = ['us-baseline', 'arvn-evolved', 'nva-baseline', 'vc-baseline'] as const;
const SEED = 1001;
const MAX_TURNS = 500;
const PLAYER_COUNT = 4;
const FIXTURE_DIR = fileURLToPath(new URL('../../../test/fixtures/spec-144-probe-recovery/seed-1001-nva-march-dead-end/', import.meta.url));

const readFixtureText = (name: string): string =>
  readFileSync(join(FIXTURE_DIR, name), 'utf8').trim();

const readFixtureJson = <T>(name: string): T =>
  JSON.parse(readFileSync(join(FIXTURE_DIR, name), 'utf8')) as T;

describe('Spec 144 seed-1001 NVA march recovery', () => {
  const { compiled } = compileProductionSpec();
  const def = assertValidatedGameDef(compiled.gameDef);
  const fixtureGameDefHash = readFixtureText('game-def-hash.txt');
  const fixtureInitialState = readFixtureJson<{ readonly stateHash: string }>('initial-state.json');
  const fixtureDecisionSequence = readFixtureJson<readonly unknown[]>('decision-sequence.json');

  const runWitness = () => {
    const agents = VARIANT_PROFILES.map((profileId) => new PolicyAgent({ profileId, traceLevel: 'summary' }));
    return runGame(def, SEED, agents, MAX_TURNS, PLAYER_COUNT, { skipDeltas: true }, createGameDefRuntime(def));
  };

  it('reaches terminal instead of noLegalMoves after the card-59 NVA march dead end', () => {
    assert.equal(createHash('sha256').update(JSON.stringify(def)).digest('hex'), fixtureGameDefHash);
    assert.equal(
      serializeGameState(initialState(def, SEED, PLAYER_COUNT, undefined, createGameDefRuntime(def)).state).stateHash,
      fixtureInitialState.stateHash,
    );

    const first = runWitness();
    assert.deepEqual(
      first.decisions.slice(0, fixtureDecisionSequence.length).map((entry) => entry.decision),
      fixtureDecisionSequence,
      'seed 1001 should preserve the recorded pre-recovery decision prefix',
    );
    assert.equal(
      first.stopReason,
      'terminal',
      `seed ${SEED} stopped with ${first.stopReason} after ${first.decisions.length} decisions`,
    );

    const second = runWitness();
    assert.equal(second.stopReason, 'terminal');
    assert.equal(
      serializeGameState(second.finalState).stateHash,
      serializeGameState(first.finalState).stateHash,
      'seed 1001 should replay to the same final state hash',
    );
  });
});
