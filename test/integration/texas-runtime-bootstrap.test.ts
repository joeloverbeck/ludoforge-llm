import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { join } from 'node:path';

import { compileGameSpecToGameDef, loadGameSpecSource, parseGameSpec } from '../../src/cnl/index.js';
import { applyMove, assertValidatedGameDef, initialState, legalMoves } from '../../src/kernel/index.js';
import { advanceToDecisionPoint } from '../../src/kernel/phase-advance.js';
import { assertNoDiagnostics, assertNoErrors } from '../helpers/diagnostic-helpers.js';

const compileTexasDef = () => {
  const markdown = loadGameSpecSource(join(process.cwd(), 'data', 'games', 'texas-holdem')).markdown;
  const parsed = parseGameSpec(markdown);
  assertNoErrors(parsed);
  const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });
  assertNoDiagnostics(compiled, parsed.sourceMap);
  if (compiled.gameDef === null) {
    throw new Error('Expected compiled Texas gameDef to be present');
  }
  return assertValidatedGameDef(compiled.gameDef);
};

const totalCardsAcrossZones = (zones: Readonly<Record<string, readonly unknown[]>>): number =>
  Object.values(zones).reduce((sum, entries) => sum + entries.length, 0);

describe('texas runtime bootstrap and position flow', () => {
  it('initializes into a playable preflop state with card conservation', () => {
    const def = compileTexasDef();
    const seeded = initialState(def, 23, 4);
    const state = advanceToDecisionPoint(def, seeded);
    const moves = legalMoves(def, state);

    assert.equal(state.currentPhase, 'preflop');
    assert.equal(state.globalVars.activePlayers, 4);
    assert.equal(state.globalVars.playersInHand, 4);
    assert.equal(totalCardsAcrossZones(state.zones), 52);
    assert.equal(moves.length > 0, true);
  });

  it('advances active actor after an opening preflop action and keeps actingPosition synced', () => {
    const def = compileTexasDef();
    const seeded = initialState(def, 29, 4);
    const state = advanceToDecisionPoint(def, seeded);
    const moves = legalMoves(def, state);
    assert.equal(moves.length > 0, true);

    const next = applyMove(def, state, moves[0]!);
    const activeAdvanced =
      next.state.activePlayer !== state.activePlayer
      || next.state.currentPhase !== state.currentPhase;
    assert.equal(activeAdvanced, true);
    assert.equal(Number(next.state.activePlayer), next.state.globalVars.actingPosition);
  });

  it('applies heads-up blind and opening-order policy (button=SB, preflop button acts first)', () => {
    const def = compileTexasDef();
    const seeded = initialState(def, 31, 2);
    const state = advanceToDecisionPoint(def, seeded);

    const dealerSeat = state.globalVars.dealerSeat;
    const bbSeat = dealerSeat === 0 ? 1 : 0;

    assert.equal(state.currentPhase, 'preflop');
    assert.equal(state.globalVars.activePlayers, 2);
    assert.equal(state.globalVars.actingPosition, dealerSeat);
    assert.equal(Number(state.activePlayer), dealerSeat);
    assert.equal(state.perPlayerVars[String(dealerSeat)]?.streetBet, state.globalVars.smallBlind);
    assert.equal(state.perPlayerVars[String(bbSeat)]?.streetBet, state.globalVars.bigBlind);
  });
});
