import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../src/agents/policy-agent.js';
import { advanceToDecisionPoint } from '../../src/kernel/phase-advance.js';
import {
  assertValidatedGameDef,
  createGameDefRuntime,
  createRng,
  initialState,
  legalMoves,
  type AgentDecisionTrace,
  type GameDef,
  type Move,
} from '../../src/kernel/index.js';
import { readFixtureJson } from '../helpers/fixture-reader.js';
import { compileProductionSpec, compileTexasProductionSpec } from '../helpers/production-spec-helpers.js';

interface PolicyDecisionGolden {
  readonly move: Move;
  readonly agentDecision: Extract<AgentDecisionTrace, { readonly kind: 'policy' }>;
}

describe('policy production golden fixtures', () => {
  it('matches the compiled FITL policy catalog golden', () => {
    const expected = readFixtureJson<NonNullable<GameDef['agents']>>('gamedef/fitl-policy-catalog.golden.json');
    const actual = compileProductionSpec().compiled.gameDef.agents;

    assert.ok(actual);
    assert.deepEqual(actual, expected);
  });

  it('matches the compiled Texas policy catalog golden', () => {
    const expected = readFixtureJson<NonNullable<GameDef['agents']>>('gamedef/texas-policy-catalog.golden.json');
    const actual = compileTexasProductionSpec().compiled.gameDef.agents;

    assert.ok(actual);
    assert.deepEqual(actual, expected);
  });

  it('matches the fixed-seed FITL policy summary golden', () => {
    const expected = readFixtureJson<PolicyDecisionGolden>('trace/fitl-policy-summary.golden.json');
    const actual = chooseFitlSummaryDecision();

    assert.deepEqual(actual, expected);
  });

  it('matches the fixed-seed Texas policy summary golden', () => {
    const expected = readFixtureJson<PolicyDecisionGolden>('trace/texas-policy-summary.golden.json');
    const actual = chooseTexasSummaryDecision();

    assert.deepEqual(actual, expected);
  });
});

function chooseFitlSummaryDecision(): PolicyDecisionGolden {
  const def = assertValidatedGameDef(compileProductionSpec().compiled.gameDef);
  const runtime = createGameDefRuntime(def);
  const state = initialState(def, 7, 4).state;
  const moves = legalMoves(def, state, undefined, runtime);
  const result = new PolicyAgent({ traceLevel: 'summary' }).chooseMove({
    def,
    state,
    playerId: state.activePlayer,
    legalMoves: moves,
    rng: createRng(7n),
    runtime,
  });

  assert.equal(result.agentDecision?.kind, 'policy');
  if (result.agentDecision?.kind !== 'policy') {
    assert.fail('expected policy trace metadata');
  }
  return {
    move: result.move,
    agentDecision: result.agentDecision,
  };
}

function chooseTexasSummaryDecision(): PolicyDecisionGolden {
  const def = assertValidatedGameDef(compileTexasProductionSpec().compiled.gameDef);
  const runtime = createGameDefRuntime(def);
  const seeded = initialState(def, 23, 4).state;
  const state = advanceToDecisionPoint(def, seeded);
  const moves = legalMoves(def, state, undefined, runtime);
  const result = new PolicyAgent({ traceLevel: 'summary' }).chooseMove({
    def,
    state,
    playerId: state.activePlayer,
    legalMoves: moves,
    rng: createRng(23n),
    runtime,
  });

  assert.equal(result.agentDecision?.kind, 'policy');
  if (result.agentDecision?.kind !== 'policy') {
    assert.fail('expected policy trace metadata');
  }
  return {
    move: result.move,
    agentDecision: result.agentDecision,
  };
}
