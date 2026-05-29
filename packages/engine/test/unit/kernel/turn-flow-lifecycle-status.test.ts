// @test-class: architectural-invariant
//
// F10 (Bounded Computation) regression guard. When a card-driven game's draw
// pile and lookahead are both exhausted with the played top still present
// (FITL's accumulating semantic: discardZone == played), the kernel must
// surface a structural `lifecycleStatus.stalled` signal instead of letting
// callers spin on a stalled lifecycle.

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { applyTurnFlowCardBoundary } from '../../../src/kernel/turn-flow-lifecycle.js';
import { enumerateLegalMoves, legalMoves } from '../../../src/kernel/legal-moves.js';
import { applyMove, probeMoveLegality, probeMoveViability } from '../../../src/kernel/apply-move.js';
import { publishMicroturn } from '../../../src/kernel/microturn/publish.js';
import { ILLEGAL_MOVE_REASONS } from '../../../src/kernel/runtime-reasons.js';
import { asActionId, asPhaseId, asPlayerId, initialState, type GameDef, type GameState } from '../../../src/kernel/index.js';
import { asTaggedGameDef } from '../../helpers/gamedef-fixtures.js';

const accumulatingCardDrivenDef = (): GameDef =>
  asTaggedGameDef({
    metadata: { id: 'lifecycle-no-progress-fixture', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
    seats: [{ id: '0' }, { id: '1' }],
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [
      { id: 'deck:none', owner: 'none', visibility: 'hidden', ordering: 'stack' },
      { id: 'played:none', owner: 'none', visibility: 'public', ordering: 'queue' },
      { id: 'lookahead:none', owner: 'none', visibility: 'public', ordering: 'queue' },
      { id: 'leader:none', owner: 'none', visibility: 'public', ordering: 'queue' },
    ],
    tokenTypes: [{ id: 'card', props: { isCoup: 'boolean' } }],
    setup: [
      { createToken: { type: 'card', zone: 'deck:none', props: { isCoup: false } } },
      { createToken: { type: 'card', zone: 'deck:none', props: { isCoup: false } } },
      { createToken: { type: 'card', zone: 'deck:none', props: { isCoup: false } } },
    ],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    turnOrder: {
      type: 'cardDriven',
      config: {
        turnFlow: {
          cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
          eligibility: { seats: ['0', '1'] },
          windows: [],
          actionClassByActionId: { pass: 'pass' },
          optionMatrix: [],
          passRewards: [],
          durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
        },
      },
    },
    actions: [
      {
        id: asActionId('pass'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [{ id: 'pass::turn::0', scope: 'turn', max: 1 }],
      },
    ],
    triggers: [],
    terminal: { conditions: [] },
  });

const drainDeckAndLookahead = (state: GameState): GameState => ({
  ...state,
  zones: {
    ...state.zones,
    'deck:none': [],
    'lookahead:none': [],
  },
});

const withReadySecondSeatOnDrainedCard = (state: GameState): GameState => {
  if (state.turnOrderState.type !== 'cardDriven') {
    throw new Error('fixture must be card-driven');
  }
  return {
    ...drainDeckAndLookahead(state),
    activePlayer: asPlayerId(1),
    turnOrderState: {
      type: 'cardDriven',
      runtime: {
        ...state.turnOrderState.runtime,
        lifecycleStatus: { stalled: false },
        eligibility: { '0': false, '1': true },
        currentCard: {
          firstEligible: '1',
          secondEligible: null,
          actedSeats: ['0'],
          passedSeats: ['0'],
          nonPassCount: 0,
          firstActionClass: null,
        },
      },
    },
  };
};

describe('turn-flow-lifecycle status signal', () => {
  it('keeps lifecycleStatus.stalled=false when the boundary promotes a card from lookahead', () => {
    const def = accumulatingCardDrivenDef();
    const start = initialState(def, 1, 2).state;
    // Initial reveal already populated played + lookahead. A boundary advance
    // should promote and reveal at least once.
    const result = applyTurnFlowCardBoundary(def, start);
    assert.equal(result.state.turnOrderState.type, 'cardDriven');
    assert.equal(result.state.turnOrderState.runtime.lifecycleStatus.stalled, false);
  });

  it('sets lifecycleStatus.stalled=true when deck and lookahead are exhausted under accumulating semantics', () => {
    const def = accumulatingCardDrivenDef();
    const start = initialState(def, 1, 2).state;
    const drained = drainDeckAndLookahead(start);
    // played still has its top card (accumulating: cards never leave played).
    const playedSize = drained.zones['played:none']?.length ?? 0;
    assert.ok(playedSize >= 1, 'fixture should leave at least one card on played');

    const result = applyTurnFlowCardBoundary(def, drained);
    assert.equal(result.state.turnOrderState.type, 'cardDriven');
    assert.equal(result.state.turnOrderState.runtime.lifecycleStatus.stalled, true);
  });

  it('is idempotent once lifecycleStatus.stalled=true', () => {
    const def = accumulatingCardDrivenDef();
    const start = initialState(def, 1, 2).state;
    const stalled = applyTurnFlowCardBoundary(def, drainDeckAndLookahead(start)).state;

    const result = applyTurnFlowCardBoundary(def, stalled);

    assert.equal(result.state, stalled);
    assert.deepEqual(result.traceEntries, []);
  });

  it('returns no legal moves from a stalled lifecycle state', () => {
    const def = accumulatingCardDrivenDef();
    const start = initialState(def, 1, 2).state;
    const stalled = applyTurnFlowCardBoundary(def, drainDeckAndLookahead(start)).state;

    assert.deepEqual(legalMoves(def, stalled), []);
    assert.deepEqual(enumerateLegalMoves(def, stalled).moves, []);
  });

  it('rejects publish/apply/probe surfaces from a stalled lifecycle state', () => {
    const def = accumulatingCardDrivenDef();
    const start = initialState(def, 1, 2).state;
    const stalled = applyTurnFlowCardBoundary(def, drainDeckAndLookahead(start)).state;
    const move = { actionId: asActionId('pass'), params: {} };

    assert.throws(
      () => publishMicroturn(def, stalled),
      /actionSelection context has no bridgeable continuations/,
    );
    assert.throws(
      () => applyMove(def, stalled, move),
      (error: unknown) =>
        typeof error === 'object'
        && error !== null
        && 'context' in error
        && (error as { context?: { reason?: unknown } }).context?.reason === ILLEGAL_MOVE_REASONS.MOVE_NOT_LEGAL_IN_CURRENT_STATE,
    );

    const legality = probeMoveLegality(def, stalled, move);
    assert.equal(legality.legal, false);
    assert.equal(legality.code, 'ILLEGAL_MOVE');
    assert.equal(legality.context.reason, ILLEGAL_MOVE_REASONS.MOVE_NOT_LEGAL_IN_CURRENT_STATE);

    const viability = probeMoveViability(def, stalled, move);
    assert.equal(viability.viable, false);
    assert.equal(viability.code, 'ILLEGAL_MOVE');
    assert.equal(viability.context?.reason, ILLEGAL_MOVE_REASONS.MOVE_NOT_LEGAL_IN_CURRENT_STATE);
  });

  it('direct applyMove returns the post-finalize stalled state without throwing', () => {
    const def = accumulatingCardDrivenDef();
    const start = initialState(def, 1, 2).state;
    const readyToFinalize = withReadySecondSeatOnDrainedCard(start);

    const result = applyMove(def, readyToFinalize, { actionId: asActionId('pass'), params: {} });

    assert.equal(result.state.turnOrderState.type, 'cardDriven');
    assert.equal(result.state.turnOrderState.runtime.lifecycleStatus.stalled, true);
    assert.deepEqual(result.state.turnOrderState.runtime.currentCard.actedSeats, []);
    assert.deepEqual(result.state.turnOrderState.runtime.currentCard.passedSeats, []);
  });
});
