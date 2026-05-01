// @test-class: architectural-invariant
//
// F10 (Bounded Computation) regression guard. When a card-driven game's draw
// pile and lookahead are both exhausted with the played top still present
// (FITL's accumulating semantic: discardZone == played), the kernel must
// surface a typed `progressed=false` signal from `applyTurnFlowCardBoundary`
// instead of letting callers spin on a stalled lifecycle. The simulator
// translates that signal into a `noLegalMoves` stop via the
// `LIFECYCLE_NO_PROGRESS` kernel error finalizeSuspendedOrEndedCard throws.

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { applyTurnFlowCardBoundary } from '../../src/kernel/turn-flow-lifecycle.js';
import { asActionId, asPhaseId, initialState, type GameDef, type GameState } from '../../src/kernel/index.js';
import { asTaggedGameDef } from '../helpers/gamedef-fixtures.js';

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

describe('turn-flow-lifecycle no-progress signal', () => {
  it('returns progressed=true when the boundary promotes a card from lookahead', () => {
    const def = accumulatingCardDrivenDef();
    const start = initialState(def, 1, 2).state;
    // Initial reveal already populated played + lookahead. A boundary advance
    // should promote and reveal at least once.
    const result = applyTurnFlowCardBoundary(def, start);
    assert.equal(result.progressed, true);
  });

  it('returns progressed=false when deck and lookahead are exhausted under accumulating semantics', () => {
    const def = accumulatingCardDrivenDef();
    const start = initialState(def, 1, 2).state;
    const drained = drainDeckAndLookahead(start);
    // played still has its top card (accumulating: cards never leave played).
    const playedSize = drained.zones['played:none']?.length ?? 0;
    assert.ok(playedSize >= 1, 'fixture should leave at least one card on played');

    const result = applyTurnFlowCardBoundary(def, drained);
    assert.equal(result.progressed, false, 'no card to promote and no card to reveal under accumulating semantics');
  });
});
