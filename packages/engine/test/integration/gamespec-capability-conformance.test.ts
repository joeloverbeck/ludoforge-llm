import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef, parseGameSpec, validateGameSpec } from '../../src/cnl/index.js';
import {
  ILLEGAL_MOVE_REASONS,
  applyMove,
  asActionId,
  asPhaseId,
  asPlayerId,
  initialState,
  legalChoicesDiscover,
  legalMoves,
  validateGameDef,
  type GameDef,
  type GameState,
  type Move,
} from '../../src/kernel/index.js';
import { assertNoDiagnostics, assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { readFixtureText } from '../helpers/fixture-reader.js';

function compileConformanceFixture(name: string): GameDef {
  const markdown = readFixtureText(`cnl/conformance/${name}`);
  const parsed = parseGameSpec(markdown);
  const validatorDiagnostics = validateGameSpec(parsed.doc, { sourceMap: parsed.sourceMap });
  const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });

  assertNoErrors(parsed);
  assert.deepEqual(validatorDiagnostics, []);
  assertNoDiagnostics(compiled, parsed.sourceMap);
  assert.notEqual(compiled.gameDef, null);
  assert.deepEqual(validateGameDef(compiled.gameDef!), []);

  return compiled.gameDef!;
}

function countTokens(state: GameState): number {
  return Object.values(state.zones).reduce((sum, zone) => sum + zone.length, 0);
}

describe('GameSpec capability conformance fixtures', () => {
  it('covers hidden->owner->reveal flow with deterministic reveal grants', () => {
    const def = compileConformanceFixture('hidden-reveal.md');
    const start = initialState(def, 11, 2).state;
    const move: Move = { actionId: asActionId('showCard'), params: {} };

    const result = applyMove(def, start, move).state;

    assert.equal(result.zones['deck:none']?.length, 0);
    assert.equal(result.zones['hand:0']?.length, 1);
    assert.deepEqual(result.reveals?.['hand:0'], [{ observers: 'all' }]);
  });

  it('covers selective conceal from compiled GameSpecDoc with order-insensitive filter matching', () => {
    const def = compileConformanceFixture('hidden-reveal-conceal.md');
    const start = initialState(def, 13, 2).state;
    const revealMove: Move = { actionId: asActionId('revealFiltered'), params: {} };
    const concealMove: Move = { actionId: asActionId('concealFilteredReordered'), params: {} };

    const revealed = applyMove(def, start, revealMove).state;
    assert.deepEqual(revealed.reveals?.['hand:0'], [
      {
        observers: [asPlayerId(1)],
        filter: [
          { prop: 'faction', op: 'eq', value: 'US' },
          { prop: 'rank', op: 'eq', value: 1 },
        ],
      },
    ]);

    const concealed = applyMove(def, revealed, concealMove).state;
    assert.equal(concealed.reveals, undefined);
  });

  it('covers deterministic turn/phase progression from compiled GameSpecDoc', () => {
    const def = compileConformanceFixture('turn-phase.md');
    const move: Move = { actionId: asActionId('commit'), params: {} };

    const first = applyMove(def, initialState(def, 19, 2).state, move).state;
    const second = applyMove(def, initialState(def, 19, 2).state, move).state;

    assert.deepEqual(first, second);
    assert.equal(first.currentPhase, asPhaseId('main'));
    assert.equal(first.activePlayer, asPlayerId(1));
    assert.equal(first.turnCount, 1);
    assert.equal(first.globalVars.steps, 1);
  });

  it('covers applicability parity for action pipelines', () => {
    const def = compileConformanceFixture('pipeline-resource.md');
    const move: Move = { actionId: asActionId('operate'), params: {} };

    const first = applyMove(def, initialState(def, 19, 2).state, move).state;
    const second = applyMove(def, initialState(def, 19, 2).state, move).state;
    const offActorState: GameState = { ...first, activePlayer: asPlayerId(1) };

    assert.deepEqual(first, second);
    assert.equal(first.currentPhase, asPhaseId('main'));
    assert.equal(first.activePlayer, asPlayerId(0));
    assert.equal(first.turnCount, 0);
    assert.equal(first.globalVars.energy, 0);
    assert.equal(first.globalVars.score, 1);

    assert.deepEqual(legalChoicesDiscover(def, offActorState, move), {
      kind: 'illegal',
      complete: false,
      reason: 'pipelineNotApplicable',
    });
    assert.equal(
      legalMoves(def, offActorState).some((candidate) => String(candidate.actionId) === String(move.actionId)),
      false,
    );
    assert.throws(() => applyMove(def, offActorState, move), (error: unknown) => {
      const details = error as Error & { code?: unknown; reason?: unknown };
      assert.equal(details.code, 'ILLEGAL_MOVE');
      assert.equal(details.reason, ILLEGAL_MOVE_REASONS.ACTION_NOT_LEGAL_IN_CURRENT_STATE);
      return true;
    });
  });

  it('covers pipeline legality and cost validation guards for bounded spending', () => {
    const legalityDef = compileConformanceFixture('pipeline-legality.md');
    const def = compileConformanceFixture('pipeline-resource.md');
    const move: Move = { actionId: asActionId('operate'), params: {} };
    const legalityStart = initialState(legalityDef, 23, 2).state;
    const start = initialState(def, 29, 2).state;

    const legalityFailedState: GameState = {
      ...legalityStart,
      globalVars: {
        ...legalityStart.globalVars,
        score: 1,
      },
    };

    assert.deepEqual(legalChoicesDiscover(legalityDef, legalityFailedState, move), {
      kind: 'illegal',
      complete: false,
      reason: 'pipelineLegalityFailed',
    });
    assert.equal(legalMoves(legalityDef, legalityFailedState).length, 0);
    assert.throws(() => applyMove(legalityDef, legalityFailedState, move), (error: unknown) => {
      const details = error as Error & { reason?: unknown };
      assert.equal(details.reason, ILLEGAL_MOVE_REASONS.ACTION_PIPELINE_LEGALITY_PREDICATE_FAILED);
      return true;
    });

    const costFailedState: GameState = {
      ...start,
      globalVars: {
        ...start.globalVars,
        energy: 1,
      },
    };

    assert.deepEqual(legalChoicesDiscover(def, costFailedState, move), {
      kind: 'illegal',
      complete: false,
      reason: 'pipelineAtomicCostValidationFailed',
    });
    assert.equal(
      legalMoves(def, costFailedState).some((candidate) => String(candidate.actionId) === String(move.actionId)),
      false,
    );
    assert.throws(() => applyMove(def, costFailedState, move), (error: unknown) => {
      const details = error as Error & { reason?: unknown };
      assert.equal(details.reason, ILLEGAL_MOVE_REASONS.ACTION_PIPELINE_COST_VALIDATION_FAILED);
      return true;
    });
  });

  it('covers subset scoring primitive deterministically from compiled GameSpecDoc', () => {
    const def = compileConformanceFixture('subset-scoring.md');
    const move: Move = { actionId: asActionId('scoreBestPair'), params: {} };

    const first = applyMove(def, initialState(def, 31, 2).state, move).state;
    const second = applyMove(def, initialState(def, 31, 2).state, move).state;

    assert.deepEqual(first, second);
    assert.equal(first.globalVars.winner, 7);
  });

  it('covers token lifecycle invariants for movement, creation, uniqueness, and conservation', () => {
    const def = compileConformanceFixture('token-lifecycle.md');
    const start = initialState(def, 47, 2).state;
    const move: Move = { actionId: asActionId('deploy'), params: {} };

    const afterFirst = applyMove(def, start, move).state;
    const afterSecond = applyMove(def, afterFirst, move).state;

    const totalInitial = countTokens(start);
    const totalFinal = countTokens(afterSecond);
    const finalTokens = Object.values(afterSecond.zones).flat();
    const uniqueIds = new Set(finalTokens.map((token) => token.id));

    assert.equal(totalInitial, 2);
    assert.equal(afterSecond.zones['reserve:none']?.length, 0);
    assert.equal(afterSecond.zones['board:none']?.length, 4);
    assert.equal(totalFinal, totalInitial + 2);
    assert.equal(uniqueIds.size, finalTokens.length);
    assert.equal(afterSecond.nextTokenOrdinal, 4);
  });
});
