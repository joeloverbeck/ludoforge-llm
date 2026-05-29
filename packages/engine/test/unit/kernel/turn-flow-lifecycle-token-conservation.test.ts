// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { applyTurnFlowCardBoundary, applyTurnFlowInitialReveal } from '../../../src/kernel/turn-flow-lifecycle.js';
import { applyMove, asActionId, asPhaseId, initialState, legalMoves, type GameDef, type GameState, type Token } from '../../../src/kernel/index.js';
import { asTaggedGameDef } from '../../helpers/gamedef-fixtures.js';

const collectCardMultiset = (state: GameState): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const tokens of Object.values(state.zones)) {
    if (tokens === undefined) {
      continue;
    }
    for (const token of tokens as readonly Token[]) {
      if (token.type !== 'card') {
        continue;
      }
      counts.set(String(token.id), (counts.get(String(token.id)) ?? 0) + 1);
    }
  }
  return counts;
};

const assertMultisetEqual = (left: Map<string, number>, right: Map<string, number>): void => {
  assert.equal(left.size, right.size);
  for (const [id, count] of left) {
    assert.equal(right.get(id), count, `token ${id}`);
  }
};

const baseAccumulatingDef = (): GameDef =>
  asTaggedGameDef({
    metadata: { id: 'lifecycle-conservation-accumulating', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
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
      { createToken: { type: 'card', zone: 'deck:none', props: { isCoup: true } } },
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

const baseRoutingDef = (): GameDef =>
  asTaggedGameDef({
    metadata: { id: 'lifecycle-conservation-routing', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
    seats: [{ id: '0' }, { id: '1' }],
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [
      { id: 'deck:none', owner: 'none', visibility: 'hidden', ordering: 'stack' },
      { id: 'played:none', owner: 'none', visibility: 'public', ordering: 'queue' },
      { id: 'lookahead:none', owner: 'none', visibility: 'public', ordering: 'queue' },
      { id: 'leader:none', owner: 'none', visibility: 'public', ordering: 'queue' },
      { id: 'discard:none', owner: 'none', visibility: 'public', ordering: 'queue' },
    ],
    tokenTypes: [{ id: 'card', props: { isCoup: 'boolean' } }],
    setup: [
      { createToken: { type: 'card', zone: 'deck:none', props: { isCoup: false } } },
      { createToken: { type: 'card', zone: 'deck:none', props: { isCoup: false } } },
      { createToken: { type: 'card', zone: 'deck:none', props: { isCoup: true } } },
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
    eventDecks: [
      {
        id: 'test-deck',
        drawZone: 'deck:none',
        discardZone: 'discard:none',
        cards: [],
      },
    ],
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

describe('turn-flow lifecycle: card-token conservation', () => {
  it('preserves the multiset of card tokens across applyTurnFlowCardBoundary in the accumulating case', () => {
    const def = baseAccumulatingDef();
    const start = initialState(def, 17, 2).state;

    const initial = collectCardMultiset(start);
    assert.equal(initial.size, 6);

    let state = start;
    for (let advance = 0; advance < 8; advance += 1) {
      const before = collectCardMultiset(state);
      const next = applyTurnFlowCardBoundary(def, state).state;
      const after = collectCardMultiset(next);
      assertMultisetEqual(before, after);
      state = next;
    }
  });

  it('preserves the multiset of card tokens when discardZone is a separate zone', () => {
    const def = baseRoutingDef();
    const start = initialState(def, 17, 2).state;

    const initial = collectCardMultiset(start);
    assert.equal(initial.size, 6);

    let state = start;
    for (let advance = 0; advance < 8; advance += 1) {
      const before = collectCardMultiset(state);
      const next = applyTurnFlowCardBoundary(def, state).state;
      const after = collectCardMultiset(next);
      assertMultisetEqual(before, after);
      state = next;
    }
  });

  it('preserves card tokens across an entire applyMove sequence in the accumulating case', () => {
    const def = baseAccumulatingDef();
    const start = initialState(def, 17, 2).state;
    const expected = collectCardMultiset(start);

    let state = start;
    for (let move = 0; move < 4; move += 1) {
      const moves = legalMoves(def, state);
      if (moves.length === 0) {
        break;
      }
      state = applyMove(def, state, moves[0]!).state;
      const observed = collectCardMultiset(state);
      assertMultisetEqual(expected, observed);
    }
  });
});

describe('turn-flow lifecycle: discard routing', () => {
  it('routes the popped played card to the discard zone when discardZone differs from played', () => {
    const def = baseRoutingDef();
    const start = applyTurnFlowInitialReveal(def, initialState(def, 17, 2).state).state;
    const playedTopBefore = start.zones['played:none']?.[0];
    assert.ok(playedTopBefore !== undefined);

    const next = applyTurnFlowCardBoundary(def, start).state;
    const discardTop = next.zones['discard:none']?.[0];
    assert.equal(discardTop?.id, playedTopBefore?.id);
  });

  it('emits a discardPlayed lifecycle step when routing to a separate discard zone', () => {
    const def = baseRoutingDef();
    const start = applyTurnFlowInitialReveal(def, initialState(def, 17, 2).state).state;

    const result = applyTurnFlowCardBoundary(def, start);
    const steps = result.traceEntries
      .filter((entry) => entry.kind === 'turnFlowLifecycle')
      .map((entry) => (entry as { readonly step: string }).step);
    assert.ok(steps.includes('discardPlayed'), `expected discardPlayed in [${steps.join(', ')}]`);
  });

  it('leaves the played top in place when discardZone === played (accumulating semantic)', () => {
    const def = baseAccumulatingDef();
    const start = applyTurnFlowInitialReveal(def, initialState(def, 17, 2).state).state;
    const playedTopBefore = start.zones['played:none']?.[0];
    assert.ok(playedTopBefore !== undefined);

    const next = applyTurnFlowCardBoundary(def, start).state;
    const playedTokens = next.zones['played:none'] ?? [];
    // The new top is the lookahead-promoted card; the previous top is now
    // immediately below it.
    assert.equal(playedTokens[1]?.id, playedTopBefore?.id);
  });

  it('still runs Coup handoff when discardZone differs from played', () => {
    const def = baseRoutingDef();
    let state = applyTurnFlowInitialReveal(def, initialState(def, 17, 2).state).state;
    // Advance until a Coup card sits on top of played, then verify it ends up in leader.
    for (let advance = 0; advance < 6; advance += 1) {
      const playedTop = state.zones['played:none']?.[0];
      if (playedTop?.props.isCoup === true) {
        const next = applyTurnFlowCardBoundary(def, state).state;
        assert.equal(next.zones['leader:none']?.[0]?.id, playedTop.id);
        // The Coup card must NOT have been routed to discard.
        const discard = next.zones['discard:none'] ?? [];
        assert.ok(discard.every((token) => token.id !== playedTop.id));
        return;
      }
      state = applyTurnFlowCardBoundary(def, state).state;
    }
    assert.fail('expected to encounter a Coup card on top of played within 6 advances');
  });
});
