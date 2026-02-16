import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { applyMove, assertValidatedGameDef, initialState, legalMoves, type GameDef, type GameState, type Move } from '../../src/kernel/index.js';
import { advancePhase, advanceToDecisionPoint } from '../../src/kernel/phase-advance.js';
import { assertNoDiagnostics, assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileTexasProductionSpec } from '../helpers/production-spec-helpers.js';

const compileTexasDef = (): GameDef => {
  const { parsed, compiled } = compileTexasProductionSpec();
  assertNoErrors(parsed);
  assertNoDiagnostics(compiled, parsed.sourceMap);
  if (compiled.gameDef === null) {
    throw new Error('Expected compiled Texas gameDef to be present');
  }
  return assertValidatedGameDef(compiled.gameDef);
};

const zoneCount = (state: GameState, zoneId: string): number => state.zones[zoneId]?.length ?? 0;

const totalCardsAcrossZones = (state: GameState): number =>
  Object.values(state.zones).reduce((sum, entries) => sum + entries.length, 0);

const totalChipsInPlay = (state: GameState): number => {
  const stacks = Array.from({ length: state.playerCount }, (_unused, index) => Number(state.perPlayerVars[String(index)]?.chipStack ?? 0));
  return stacks.reduce((sum, value) => sum + value, 0) + Number(state.globalVars.pot ?? 0);
};

const assertNoNegativeStacks = (state: GameState): void => {
  for (let player = 0; player < state.playerCount; player += 1) {
    const stack = Number(state.perPlayerVars[String(player)]?.chipStack ?? 0);
    assert.equal(stack >= 0, true, `player ${player} chipStack must remain non-negative`);
  }
};

const activeInHandFromFlags = (state: GameState): number => {
  let count = 0;
  for (let player = 0; player < state.playerCount; player += 1) {
    const vars = state.perPlayerVars[String(player)];
    if (vars?.eliminated === false && vars.handActive === true) {
      count += 1;
    }
  }
  return count;
};

const assertNoPlayersInHandCounter = (state: GameState, context: string): void => {
  assert.equal('playersInHand' in state.globalVars, false, `${context}: playersInHand should not be a stored global`);
};

const actionIds = (def: GameDef, state: GameState): ReadonlySet<string> =>
  new Set(legalMoves(def, state).map((move) => String(move.actionId)));

const applyAction = (def: GameDef, state: GameState, actionId: string): GameState => {
  const move = legalMoves(def, state).find((candidate) => String(candidate.actionId) === actionId);
  assert.ok(move, `expected ${actionId} to be legal in phase=${state.currentPhase}`);
  return applyMove(def, state, move).state;
};

const applyActionMatching = (
  def: GameDef,
  state: GameState,
  actionId: string,
  predicate: (move: Move) => boolean,
): GameState => {
  const move = legalMoves(def, state).find((candidate) => String(candidate.actionId) === actionId && predicate(candidate));
  assert.ok(move, `expected ${actionId} with matching params to be legal in phase=${state.currentPhase}`);
  return applyMove(def, state, move).state;
};

const applyPreferredAction = (def: GameDef, state: GameState, priorities: readonly string[]): { readonly state: GameState; readonly actionId: string } => {
  const moves = legalMoves(def, state);
  assert.equal(moves.length > 0, true, `expected legal move in phase=${state.currentPhase}`);

  let selected: Move | undefined;
  for (const actionId of priorities) {
    selected = moves.find((candidate) => String(candidate.actionId) === actionId);
    if (selected !== undefined) {
      break;
    }
  }
  selected ??= moves[0];
  if (selected === undefined) {
    throw new Error(`expected at least one legal move in phase=${state.currentPhase}`);
  }

  return {
    state: applyMove(def, state, selected).state,
    actionId: String(selected.actionId),
  };
};

const mutateStacks = (
  state: GameState,
  stacks: Readonly<Record<string, number>>,
): GameState => {
  const nextPerPlayer: Record<string, GameState['perPlayerVars'][string]> = { ...state.perPlayerVars };
  for (const [playerId, chipStack] of Object.entries(stacks)) {
    const current = nextPerPlayer[playerId];
    assert.ok(current, `missing player vars for player ${playerId}`);
    nextPerPlayer[playerId] = {
      ...current,
      chipStack,
    };
  }

  return {
    ...state,
    perPlayerVars: nextPerPlayer,
  };
};

const runForcedThreeWayAllIn = (
  def: GameDef,
  seed: number,
): {
  readonly state: GameState;
  readonly expectedTotal: number;
  readonly startHandsPlayed: number;
  readonly steps: number;
} => {
  let state = advanceToDecisionPoint(def, initialState(def, seed, 3));
  state = mutateStacks(state, {
    '0': 30,
    '1': 80,
    '2': 200,
  });

  const expectedTotal = totalChipsInPlay(state);
  const startHandsPlayed = Number(state.globalVars.handsPlayed ?? 0);
  let steps = 0;

  while (Number(state.globalVars.handsPlayed ?? 0) === startHandsPlayed && steps < 8) {
    const next = applyPreferredAction(def, state, ['allIn', 'call', 'check', 'fold', 'raise']);
    state = next.state;
    steps += 1;
  }

  return { state, expectedTotal, startHandsPlayed, steps };
};

describe('texas hand mechanics integration', () => {
  it('deals two unique hole cards per player and preserves 52-card conservation', () => {
    const def = compileTexasDef();
    const state = advanceToDecisionPoint(def, initialState(def, 23, 4));

    assert.equal(state.currentPhase, 'preflop');
    for (let player = 0; player < 4; player += 1) {
      assert.equal(zoneCount(state, `hand:${player}`), 2);
    }

    assert.equal(zoneCount(state, 'deck:none'), 44);
    assert.equal(zoneCount(state, 'burn:none'), 0);
    assert.equal(zoneCount(state, 'community:none'), 0);
    assert.equal(zoneCount(state, 'muck:none'), 0);
    assert.equal(totalCardsAcrossZones(state), 52);

    const allCards = Object.values(state.zones).flatMap((zone) => zone.map((token) => token.id));
    assert.equal(new Set(allCards).size, allCards.length);
  });

  it('applies flop/turn/river phase onEnter dealing contracts deterministically', () => {
    const def = compileTexasDef();
    let state = advanceToDecisionPoint(def, initialState(def, 31, 2));

    const dealerSeat = Number(state.globalVars.dealerSeat);
    const bbSeat = dealerSeat === 0 ? 1 : 0;

    assert.equal(Number(state.activePlayer), dealerSeat, 'button should act first preflop in heads-up');
    assert.equal(state.perPlayerVars[String(dealerSeat)]?.streetBet, state.globalVars.smallBlind);
    assert.equal(state.perPlayerVars[String(bbSeat)]?.streetBet, state.globalVars.bigBlind);

    state = advancePhase(def, state);

    assert.equal(state.currentPhase, 'flop');
    assert.equal(zoneCount(state, 'burn:none'), 1);
    assert.equal(zoneCount(state, 'community:none'), 3);
    assert.equal(zoneCount(state, 'deck:none'), 44);

    state = advancePhase(def, state);

    assert.equal(state.currentPhase, 'turn');
    assert.equal(zoneCount(state, 'burn:none'), 2);
    assert.equal(zoneCount(state, 'community:none'), 4);
    assert.equal(zoneCount(state, 'deck:none'), 42);

    state = advancePhase(def, state);

    assert.equal(state.currentPhase, 'river');
    assert.equal(zoneCount(state, 'burn:none'), 3);
    assert.equal(zoneCount(state, 'community:none'), 5);
    assert.equal(zoneCount(state, 'deck:none'), 40);
  });

  it('matches betting legality contracts for check/call/raise/allIn on preflop', () => {
    const def = compileTexasDef();
    let state = advanceToDecisionPoint(def, initialState(def, 53, 2));

    const actor = String(state.activePlayer);
    const actorStreetBet = Number(state.perPlayerVars[actor]?.streetBet ?? 0);
    const actorStack = Number(state.perPlayerVars[actor]?.chipStack ?? 0);
    const currentBet = Number(state.globalVars.currentBet ?? 0);
    const lastRaiseSize = Number(state.globalVars.lastRaiseSize ?? 0);

    const openingActions = actionIds(def, state);
    assert.equal(openingActions.has('check'), false, 'check must be illegal when streetBet < currentBet');
    assert.equal(openingActions.has('call'), true, 'call must be legal when currentBet > streetBet');
    assert.equal(openingActions.has('fold'), true);
    assert.equal(openingActions.has('allIn'), true, 'allIn requires positive chipStack');

    const raiseAmounts = legalMoves(def, state)
      .filter((move) => String(move.actionId) === 'raise')
      .map((move) => Number(move.params.raiseAmount));
    assert.equal(raiseAmounts.length > 0, true, 'raise options should be enumerable when min raise is affordable');
    assert.equal(Math.min(...raiseAmounts), currentBet + lastRaiseSize);
    assert.equal(Math.max(...raiseAmounts), actorStreetBet + actorStack);

    state = applyAction(def, state, 'call');
    const bbOptionActions = actionIds(def, state);
    assert.equal(state.currentPhase, 'preflop');
    assert.equal(bbOptionActions.has('check'), true, 'BB should have check option when no raise occurs preflop');
    assert.equal(bbOptionActions.has('call'), false, 'call must be illegal when streetBet == currentBet');
  });

  it('does not keep preflop BB option open after a raised pot is fully called', () => {
    const def = compileTexasDef();
    let state = advanceToDecisionPoint(def, initialState(def, 77, 3));
    const bbSeat = Number(state.globalVars.preflopBigBlindSeat);

    state = applyActionMatching(def, state, 'raise', (move) => Number(move.params.raiseAmount) === 40);
    state = applyAction(def, state, 'call');
    state = applyAction(def, state, 'call');

    const actions = actionIds(def, state);
    const illegalBbOptionLoop =
      state.currentPhase === 'preflop'
      && Number(state.globalVars.handsPlayed ?? 0) === 0
      && Number(state.activePlayer) === bbSeat
      && actions.has('check');
    assert.equal(illegalBbOptionLoop, false, 'raised pots must not loop into a same-hand BB check-option decision');
  });

  it('reopens betting after a full raise and restores raise rights to prior actors', () => {
    const def = compileTexasDef();
    let state = advanceToDecisionPoint(def, initialState(def, 77, 3));

    state = applyActionMatching(def, state, 'raise', (move) => Number(move.params.raiseAmount) === 40);
    state = applyAction(def, state, 'call');
    state = applyActionMatching(def, state, 'raise', (move) => Number(move.params.raiseAmount) === 60);

    const reopenActions = actionIds(def, state);
    assert.equal(Number(state.activePlayer), 0, 'action should return to the prior actor after a full raise');
    assert.equal(reopenActions.has('raise'), true, 'full raises should reopen raise rights');
    assert.equal(reopenActions.has('call'), true);
    assert.equal(reopenActions.has('fold'), true);
  });

  it('does not reopen raise rights after a short all-in raise from a remaining actor', () => {
    const def = compileTexasDef();
    let state = advanceToDecisionPoint(def, initialState(def, 77, 3));

    state = applyActionMatching(def, state, 'raise', (move) => Number(move.params.raiseAmount) === 40);
    state = applyAction(def, state, 'call');
    state = mutateStacks(state, { '2': 30 });
    state = applyAction(def, state, 'allIn');

    const nonReopenActions = actionIds(def, state);
    assert.equal(Number(state.activePlayer), 0, 'action should return to the prior actor after short all-in');
    assert.equal(Number(state.globalVars.currentBet), 50, 'short all-in still increases the table current bet');
    assert.equal(nonReopenActions.has('raise'), false, 'short all-in should not reopen raise rights');
    assert.equal(nonReopenActions.has('call'), true);
    assert.equal(nonReopenActions.has('fold'), true);
  });

  it('resolves early fold hands without traversing flop/turn/river dealing', () => {
    const def = compileTexasDef();
    const initial = advanceToDecisionPoint(def, initialState(def, 43, 2));
    const next = applyAction(def, initial, 'fold');

    assert.equal(next.globalVars.handsPlayed, 1);
    assert.equal(next.currentPhase, 'preflop');
    assert.equal(zoneCount(next, 'deck:none'), 44);
    assert.equal(zoneCount(next, 'burn:none'), 0);
    assert.equal(zoneCount(next, 'community:none'), 0);
    assert.equal(totalChipsInPlay(next), totalChipsInPlay(initial), 'uncontested path should conserve chips');
    assertNoNegativeStacks(next);
    assertNoPlayersInHandCounter(next, 'early-fold');
  });

  it('handles forced 3-way all-in by auto-resolving contested settlement with side-pot eligibility bounds', () => {
    const def = compileTexasDef();

    for (const seed of [44, 45, 46, 47, 48]) {
      const { state, expectedTotal, startHandsPlayed, steps } = runForcedThreeWayAllIn(def, seed);

      assert.equal(Number(state.globalVars.handsPlayed ?? 0) > startHandsPlayed, true, `seed=${seed} should complete hand`);
      assert.equal(steps <= 3, true, `seed=${seed} should auto-resolve once everyone is all-in`);
      assert.equal(state.currentPhase === 'hand-cleanup' || state.currentPhase === 'preflop', true);
      assert.equal(
        Number(state.globalVars.pot ?? 0) === 0 || (state.currentPhase === 'preflop' && Number(state.globalVars.pot ?? 0) === 30),
        true,
      );
      assert.equal(totalChipsInPlay(state), expectedTotal);
      assert.equal(Number(state.globalVars.oddChipRemainder ?? 0), 0);
      assertNoNegativeStacks(state);
      assertNoPlayersInHandCounter(state, `forced-all-in seed=${seed}`);

      const stack0 = Number(state.perPlayerVars['0']?.chipStack ?? 0);
      const stack1 = Number(state.perPlayerVars['1']?.chipStack ?? 0);
      const stack2 = Number(state.perPlayerVars['2']?.chipStack ?? 0);

      assert.equal(stack0 <= 90, true, 'shortest stack can only win main pot');
      assert.equal(stack1 <= 210, true, 'middle stack cannot win deepest side layer');
      assert.equal(stack2 <= 340, true, 'largest stack cap should not exceed total contributions');
    }
  });

  it('keeps contested odd-chip allocation deterministic across identical forced all-in seeds', () => {
    const def = compileTexasDef();

    for (const seed of [44, 45, 46, 47, 48]) {
      const first = runForcedThreeWayAllIn(def, seed).state;
      const second = runForcedThreeWayAllIn(def, seed).state;

      const firstStacks = [
        Number(first.perPlayerVars['0']?.chipStack ?? 0),
        Number(first.perPlayerVars['1']?.chipStack ?? 0),
        Number(first.perPlayerVars['2']?.chipStack ?? 0),
      ];
      const secondStacks = [
        Number(second.perPlayerVars['0']?.chipStack ?? 0),
        Number(second.perPlayerVars['1']?.chipStack ?? 0),
        Number(second.perPlayerVars['2']?.chipStack ?? 0),
      ];

      assert.deepEqual(firstStacks, secondStacks, `seed=${seed} stack allocation should be deterministic`);
      assert.equal(Number(first.globalVars.oddChipRemainder ?? 0), 0, `seed=${seed} first run odd chip remainder`);
      assert.equal(Number(second.globalVars.oddChipRemainder ?? 0), 0, `seed=${seed} second run odd chip remainder`);
    }
  });

  it('remains deterministic for a fixed seed and deterministic action policy', () => {
    const def = compileTexasDef();

    const runLine = () => {
      let state = advanceToDecisionPoint(def, initialState(def, 101, 4));
      const actionTrace: string[] = [];
      const hashTrace: bigint[] = [state.stateHash];

      for (let step = 0; step < 20; step += 1) {
        const next = applyPreferredAction(def, state, ['call', 'check', 'allIn', 'raise', 'fold']);
        actionTrace.push(next.actionId);
        state = next.state;
        hashTrace.push(state.stateHash);
      }

      return { actionTrace, hashTrace };
    };

    const first = runLine();
    const second = runLine();

    assert.deepEqual(first.actionTrace, second.actionTrace);
    assert.deepEqual(first.hashTrace, second.hashTrace);
  });

  it('uses derived hand-occupancy (no cached counter) on fold/all-in-heavy transitions', () => {
    const def = compileTexasDef();

    for (const seed of [61, 62, 63, 64, 65]) {
      let state = advanceToDecisionPoint(def, initialState(def, seed, 3));
      state = mutateStacks(state, { '0': 35, '1': 45, '2': 55 });
      const startHandsPlayed = Number(state.globalVars.handsPlayed ?? 0);

      for (let step = 0; step < 16; step += 1) {
        const activeInHand = activeInHandFromFlags(state);
        assertNoPlayersInHandCounter(state, `seed=${seed} step=${step} pre`);
        assert.equal(activeInHand <= Number(state.globalVars.activePlayers ?? 0), true);
        const next = applyPreferredAction(def, state, ['allIn', 'fold', 'call', 'check', 'raise']);
        state = next.state;
        const postActiveInHand = activeInHandFromFlags(state);
        assertNoPlayersInHandCounter(state, `seed=${seed} step=${step} post action=${next.actionId}`);
        assert.equal(postActiveInHand <= Number(state.globalVars.activePlayers ?? 0), true);
        if (Number(state.globalVars.handsPlayed ?? 0) > startHandsPlayed) {
          break;
        }
      }
    }
  });

  it('holds chip/card/non-negative invariants across deterministic integration transitions', () => {
    const def = compileTexasDef();

    for (const seed of [13, 17, 19]) {
      let state = advanceToDecisionPoint(def, initialState(def, seed, 4));
      const expectedCardTotal = totalCardsAcrossZones(state);
      const expectedChipTotal = totalChipsInPlay(state);

      for (let step = 0; step < 24; step += 1) {
        assert.equal(totalCardsAcrossZones(state), expectedCardTotal, `seed=${seed} step=${step} card conservation`);
        assert.equal(totalChipsInPlay(state), expectedChipTotal, `seed=${seed} step=${step} chip conservation`);
        assertNoNegativeStacks(state);
        assertNoPlayersInHandCounter(state, `seed=${seed} step=${step}`);

        const next = applyPreferredAction(def, state, ['call', 'check', 'allIn', 'raise', 'fold']);
        state = next.state;
      }

      assert.equal(totalCardsAcrossZones(state), expectedCardTotal, `seed=${seed} final card conservation`);
      assert.equal(totalChipsInPlay(state), expectedChipTotal, `seed=${seed} final chip conservation`);
      assertNoNegativeStacks(state);
      assertNoPlayersInHandCounter(state, `seed=${seed} final`);
    }
  });
});
