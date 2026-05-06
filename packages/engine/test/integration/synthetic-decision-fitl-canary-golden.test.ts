// @test-class: golden-trace
import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { createPolicyPreviewRuntime } from '../../src/agents/policy-preview.js';
import {
  asPlayerId,
  enumerateLegalMoves,
  initialState,
  type GameDef,
  type Move,
} from '../../src/kernel/index.js';
import { getFitlProductionFixture } from '../helpers/production-spec-helpers.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(here, '../../../test/fixtures/trace/synthetic-decision-fitl-canary.json');

function findMove(def: GameDef, state: ReturnType<typeof initialState>['state'], actionId: string): Move {
  const legal = enumerateLegalMoves(def, state).moves;
  const classified = legal.find((entry) => String(entry.move.actionId) === actionId);
  if (classified === undefined) {
    assert.fail(`Expected FITL action ${actionId}; legal actions: ${legal.map((entry) => String(entry.move.actionId)).join(', ')}`);
  }
  return classified.move;
}

function captureFitlSyntheticDecisions(): unknown {
  const def = getFitlProductionFixture().gameDef;
  const state = initialState(def, 156, 4).state;
  const move = findMove(def, state, 'rally');
  const runtime = createPolicyPreviewRuntime({
    def,
    state,
    playerId: asPlayerId(3),
    seatId: 'vc',
    trustedMoveIndex: new Map(),
    previewMode: 'tolerateStochastic',
    completionPolicy: 'greedy',
    completionDepthCap: 8,
    captureSyntheticDecisions: true,
  });
  const candidate = {
    move,
    stableMoveKey: `fitl-rally-${state.stateHash.toString()}`,
    actionId: 'rally',
  };
  assert.equal(runtime.getOutcome(candidate), 'ready');
  return runtime.getPreviewDrive(candidate)?.syntheticDecisions;
}

describe('synthetic decision FITL canary golden', () => {
  it('matches the frozen verbose synthetic decision fixture', () => {
    const expected = JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown;
    const actual = captureFitlSyntheticDecisions();

    assert.deepEqual(actual, expected);
  });
});
