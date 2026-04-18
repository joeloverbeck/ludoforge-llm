// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asPlayerId,
  asTokenId,
  initialState,
  legalMoves,
  type GameDef,
  type GameState,
  type Token,
} from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { applyMoveWithResolvedDecisionIds } from '../helpers/decision-param-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import { requireCardDrivenRuntime } from '../helpers/turn-order-helpers.js';

const CARD_ID = 'card-103';

const makeToken = (
  id: string,
  type: string,
  faction: string,
  extraProps?: Readonly<Record<string, unknown>>,
): Token => ({
  id: asTokenId(id),
  type,
  props: {
    faction,
    type,
    ...(extraProps ?? {}),
  },
});

const compileDef = (): GameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assert.notEqual(compiled.gameDef, null);
  return compiled.gameDef!;
};

const countTokens = (
  state: GameState,
  zoneId: string,
  predicate: (token: Token) => boolean,
): number => (state.zones[zoneId] ?? []).filter((token) => predicate(token as Token)).length;

const setupCardDrivenState = (
  def: GameDef,
  seed: number,
  activePlayer: number,
  eligibility: Readonly<Record<'us' | 'arvn' | 'nva' | 'vc', boolean>>,
  firstEligible: 'us' | 'arvn' | 'nva' | 'vc',
  secondEligible: 'us' | 'arvn' | 'nva' | 'vc' | null,
  zones: Readonly<Record<string, readonly Token[]>>,
): GameState => {
  const base = clearAllZones(initialState(def, seed, 4).state);
  const runtime = requireCardDrivenRuntime(base);
  const eventDeck = def.eventDecks?.[0];
  assert.notEqual(eventDeck, undefined, 'Expected event deck');

  return {
    ...base,
    activePlayer: asPlayerId(activePlayer),
    turnOrderState: {
      type: 'cardDriven',
      runtime: {
        ...runtime,
        seatOrder: ['vc', 'nva', 'us', 'arvn'],
        eligibility,
        currentCard: {
          ...runtime.currentCard,
          firstEligible,
          secondEligible,
          actedSeats: [],
          passedSeats: [],
          nonPassCount: 0,
          firstActionClass: null,
        },
      },
    },
    zones: {
      ...base.zones,
      [eventDeck!.discardZone]: [makeToken(CARD_ID, 'card', 'none')],
      ...zones,
    },
  };
};

const findKentStateMove = (def: GameDef, state: GameState, side: 'unshaded' | 'shaded') =>
  legalMoves(def, state).find(
    (move) =>
      String(move.actionId) === 'event'
      && move.params.side === side
      && (move.params.eventCardId === undefined || move.params.eventCardId === CARD_ID),
  );

describe('FITL card-103 Kent State', () => {
  // ── Metadata & compilation ──────────────────────────────────────────

  it('compiles with correct metadata and rules text', () => {
    const def = compileDef();
    const card = def.eventDecks?.[0]?.cards.find((entry) => entry.id === CARD_ID);
    assert.notEqual(card, undefined, 'card-103 must compile');

    assert.equal(card?.metadata?.period, '1968');
    assert.deepEqual(card?.metadata?.seatOrder, ['VC', 'NVA', 'US', 'ARVN']);
    assert.equal(card?.sideMode, 'dual');
    assert.equal(
      card?.unshaded?.text,
      'Any 2 US Casualties to Available. 1 free US LimOp. US Eligible.',
    );
    assert.equal(
      card?.shaded?.text,
      'Up to 3 US Troop Casualties out of play. Aid -6. US Ineligible through next card.',
    );
  });

  it('encodes eligibility overrides for both sides', () => {
    const def = compileDef();
    const card = def.eventDecks?.[0]?.cards.find((entry) => entry.id === CARD_ID);
    assert.notEqual(card, undefined);

    assert.deepEqual(card?.unshaded?.eligibilityOverrides, [
      { target: { kind: 'seat', seat: 'us' }, eligible: true, windowId: 'make-eligible-now' },
    ]);
    assert.deepEqual(card?.shaded?.eligibilityOverrides, [
      { target: { kind: 'seat', seat: 'us' }, eligible: false, windowId: 'make-ineligible' },
    ]);
  });

  it('encodes freeOperationGrants for unshaded LimOp', () => {
    const def = compileDef();
    const card = def.eventDecks?.[0]?.cards.find((entry) => entry.id === CARD_ID);
    assert.notEqual(card, undefined);

    const grants = card?.unshaded?.freeOperationGrants;
    assert.ok(Array.isArray(grants), 'unshaded must have freeOperationGrants');
    assert.equal(grants!.length, 1);
    assert.equal(grants![0].seat, 'us');
    assert.equal(grants![0].operationClass, 'limitedOperation');
    // No actionIds restriction — any LimOp type is allowed
    assert.equal(grants![0].actionIds, undefined);
  });

  // ── Unshaded tests ─────────────────────────────────────────────────

  it('unshaded moves exactly 2 US casualties to available, makes US eligible, and grants LimOp', () => {
    const def = compileDef();
    const setup = setupCardDrivenState(def, 103001, 2, {
      us: false,
      arvn: false,
      nva: true,
      vc: true,
    }, 'vc', 'nva', {
      'casualties-US:none': [
        makeToken('ks-us-t-1', 'troops', 'US'),
        makeToken('ks-us-t-2', 'troops', 'US'),
        makeToken('ks-us-base', 'base', 'US'),
      ],
    });

    const move = findKentStateMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Expected Kent State unshaded event move');

    const result = applyMove(def, setup, move!);
    const final = result.state;
    const runtime = requireCardDrivenRuntime(final);

    // removeByPriority budget=2, no type filter → takes first 2 US pieces
    assert.equal(
      countTokens(final, 'available-US:none', (token) => token.props.faction === 'US'),
      2,
      'Kent State unshaded should move exactly 2 US casualties to Available',
    );
    // US should be eligible now
    assert.equal(runtime.eligibility.us, true, 'US should be eligible after unshaded');
  });

  it('unshaded clamps to 1 when only 1 US casualty exists', () => {
    const def = compileDef();
    const setup = setupCardDrivenState(def, 103002, 2, {
      us: false,
      arvn: false,
      nva: true,
      vc: true,
    }, 'vc', 'nva', {
      'casualties-US:none': [
        makeToken('ks-us-single', 'troops', 'US'),
      ],
    });

    const move = findKentStateMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Expected Kent State unshaded event move');

    const final = applyMove(def, setup, move!).state;

    assert.equal(
      countTokens(final, 'available-US:none', (token) => token.props.faction === 'US'),
      1,
      'Kent State unshaded should clamp to 1 available casualty',
    );
    assert.equal(
      countTokens(final, 'casualties-US:none', (token) => token.props.faction === 'US'),
      0,
    );
  });

  it('unshaded works with 0 casualties — still grants LimOp and makes US eligible', () => {
    const def = compileDef();
    const setup = setupCardDrivenState(def, 103003, 2, {
      us: false,
      arvn: false,
      nva: true,
      vc: true,
    }, 'vc', 'nva', {
      'casualties-US:none': [],
    });

    const move = findKentStateMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Expected Kent State unshaded event move');

    const result = applyMove(def, setup, move!);
    const final = result.state;
    const runtime = requireCardDrivenRuntime(final);

    assert.equal(
      countTokens(final, 'available-US:none', (token) => token.props.faction === 'US'),
      0,
    );
    assert.equal(runtime.eligibility.us, true, 'US should still become eligible');
  });

  it('unshaded moves mixed piece types (troops + base) — "Any" means not restricted to troops', () => {
    const def = compileDef();
    const setup = setupCardDrivenState(def, 103004, 2, {
      us: false,
      arvn: false,
      nva: true,
      vc: true,
    }, 'vc', 'nva', {
      'casualties-US:none': [
        makeToken('ks-us-troop', 'troops', 'US'),
        makeToken('ks-us-base-mix', 'base', 'US'),
      ],
    });

    const move = findKentStateMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Expected Kent State unshaded event move');

    const final = applyMove(def, setup, move!).state;

    assert.equal(
      countTokens(final, 'available-US:none', (token) => token.props.faction === 'US'),
      2,
      'Both troop and base should be moved to available',
    );
    assert.equal(
      countTokens(final, 'casualties-US:none', (token) => token.props.faction === 'US'),
      0,
    );
  });

  it('unshaded takes only 2 when more than 2 casualties exist', () => {
    const def = compileDef();
    const setup = setupCardDrivenState(def, 103005, 2, {
      us: false,
      arvn: false,
      nva: true,
      vc: true,
    }, 'vc', 'nva', {
      'casualties-US:none': [
        makeToken('ks-us-c-1', 'troops', 'US'),
        makeToken('ks-us-c-2', 'troops', 'US'),
        makeToken('ks-us-c-3', 'irregular', 'US'),
        makeToken('ks-us-c-4', 'base', 'US'),
      ],
    });

    const move = findKentStateMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Expected Kent State unshaded event move');

    const final = applyMove(def, setup, move!).state;

    assert.equal(
      countTokens(final, 'available-US:none', (token) => token.props.faction === 'US'),
      2,
      'Exactly 2 pieces should be moved via removeByPriority budget',
    );
    assert.equal(
      countTokens(final, 'casualties-US:none', (token) => token.props.faction === 'US'),
      2,
      'Remaining 2 pieces stay in casualties',
    );
  });

  // ── Shaded tests ───────────────────────────────────────────────────

  it('shaded moves 3 US troop casualties to out-of-play, reduces Aid by 6, and makes US ineligible', () => {
    const def = compileDef();
    const aidBefore = 15;
    const setup = {
      ...setupCardDrivenState(def, 103010, 2, {
        us: true,
        arvn: false,
        nva: true,
        vc: true,
      }, 'vc', 'nva', {
        'casualties-US:none': [
          makeToken('ks-sh-t-1', 'troops', 'US'),
          makeToken('ks-sh-t-2', 'troops', 'US'),
          makeToken('ks-sh-t-3', 'troops', 'US'),
          makeToken('ks-sh-base', 'base', 'US'),
        ],
      }),
      globalVars: {
        ...setupCardDrivenState(def, 103010, 2, {
          us: true, arvn: false, nva: true, vc: true,
        }, 'vc', 'nva', {}).globalVars,
        aid: aidBefore,
      },
    };

    const move = findKentStateMove(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Expected Kent State shaded event move');

    const result = applyMoveWithResolvedDecisionIds(def, setup, move!, {
      overrides: [
        {
          when: (request) => request.name === '$usTroopCasualties',
          value: [
            asTokenId('ks-sh-t-1'),
            asTokenId('ks-sh-t-2'),
            asTokenId('ks-sh-t-3'),
          ],
        },
      ],
    });
    const final = result.state;
    const runtime = requireCardDrivenRuntime(final);

    assert.equal(
      countTokens(final, 'out-of-play-US:none', (token) => token.props.faction === 'US' && token.type === 'troops'),
      3,
      'All 3 selected troops should be in out-of-play',
    );
    assert.equal(
      countTokens(final, 'casualties-US:none', (token) => token.props.faction === 'US' && token.type === 'base'),
      1,
      'Base should remain in casualties (not a valid target)',
    );
    assert.equal(final.globalVars.aid, aidBefore - 6, 'Aid should decrease by 6');
    assert.deepEqual(runtime.pendingEligibilityOverrides ?? [], [
      { seat: 'us', eligible: false, windowId: 'make-ineligible', duration: 'nextTurn' },
    ]);
  });

  it('shaded allows partial selection — choose 1 of 3 available troops', () => {
    const def = compileDef();
    const aidBefore = 10;
    const setup = {
      ...setupCardDrivenState(def, 103011, 2, {
        us: true,
        arvn: false,
        nva: true,
        vc: true,
      }, 'vc', 'nva', {
        'casualties-US:none': [
          makeToken('ks-sh-partial-1', 'troops', 'US'),
          makeToken('ks-sh-partial-2', 'troops', 'US'),
          makeToken('ks-sh-partial-3', 'troops', 'US'),
        ],
      }),
      globalVars: {
        ...setupCardDrivenState(def, 103011, 2, {
          us: true, arvn: false, nva: true, vc: true,
        }, 'vc', 'nva', {}).globalVars,
        aid: aidBefore,
      },
    };

    const move = findKentStateMove(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Expected Kent State shaded event move');

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, {
      overrides: [
        {
          when: (request) => request.name === '$usTroopCasualties',
          value: [asTokenId('ks-sh-partial-1')],
        },
      ],
    }).state;

    assert.equal(
      countTokens(final, 'out-of-play-US:none', (token) => token.id === asTokenId('ks-sh-partial-1')),
      1,
    );
    assert.equal(
      countTokens(final, 'casualties-US:none', (token) => token.props.faction === 'US' && token.type === 'troops'),
      2,
      'Remaining 2 troops should stay in casualties',
    );
    assert.equal(final.globalVars.aid, aidBefore - 6, 'Aid -6 regardless of selection count');
  });

  it('shaded allows zero selection — player opts out of moving troops', () => {
    const def = compileDef();
    const aidBefore = 10;
    const setup = {
      ...setupCardDrivenState(def, 103012, 2, {
        us: true,
        arvn: false,
        nva: true,
        vc: true,
      }, 'vc', 'nva', {
        'casualties-US:none': [
          makeToken('ks-sh-zero-1', 'troops', 'US'),
          makeToken('ks-sh-zero-2', 'troops', 'US'),
        ],
      }),
      globalVars: {
        ...setupCardDrivenState(def, 103012, 2, {
          us: true, arvn: false, nva: true, vc: true,
        }, 'vc', 'nva', {}).globalVars,
        aid: aidBefore,
      },
    };

    const move = findKentStateMove(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Expected Kent State shaded event move');

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, {
      overrides: [
        {
          when: (request) => request.name === '$usTroopCasualties',
          value: [],
        },
      ],
    }).state;

    assert.equal(
      countTokens(final, 'out-of-play-US:none', (token) => token.props.faction === 'US'),
      0,
      'No troops should move when player selects 0',
    );
    assert.equal(
      countTokens(final, 'casualties-US:none', (token) => token.props.faction === 'US' && token.type === 'troops'),
      2,
      'All troops remain in casualties',
    );
    assert.equal(final.globalVars.aid, aidBefore - 6, 'Aid -6 still applies');
  });

  it('shaded with only non-troop casualties — no valid targets for chooseN', () => {
    const def = compileDef();
    const aidBefore = 10;
    const setup = {
      ...setupCardDrivenState(def, 103013, 2, {
        us: true,
        arvn: false,
        nva: true,
        vc: true,
      }, 'vc', 'nva', {
        'casualties-US:none': [
          makeToken('ks-sh-base-only', 'base', 'US'),
          makeToken('ks-sh-irreg-only', 'irregular', 'US'),
        ],
      }),
      globalVars: {
        ...setupCardDrivenState(def, 103013, 2, {
          us: true, arvn: false, nva: true, vc: true,
        }, 'vc', 'nva', {}).globalVars,
        aid: aidBefore,
      },
    };

    const move = findKentStateMove(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Expected Kent State shaded event move');

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, {
      overrides: [
        {
          when: (request) => request.name === '$usTroopCasualties',
          value: [],
        },
      ],
    }).state;

    assert.equal(
      countTokens(final, 'out-of-play-US:none', (token) => token.props.faction === 'US'),
      0,
      'No pieces should move — only bases and irregulars in casualties',
    );
    assert.equal(final.globalVars.aid, aidBefore - 6, 'Aid -6 still applies');
  });

  it('shaded selects only troops even when mixed casualties exist', () => {
    const def = compileDef();
    const aidBefore = 20;
    const setup = {
      ...setupCardDrivenState(def, 103014, 2, {
        us: true,
        arvn: false,
        nva: true,
        vc: true,
      }, 'vc', 'nva', {
        'casualties-US:none': [
          makeToken('ks-sh-mix-t-1', 'troops', 'US'),
          makeToken('ks-sh-mix-t-2', 'troops', 'US'),
          makeToken('ks-sh-mix-base', 'base', 'US'),
          makeToken('ks-sh-mix-irreg', 'irregular', 'US'),
        ],
      }),
      globalVars: {
        ...setupCardDrivenState(def, 103014, 2, {
          us: true, arvn: false, nva: true, vc: true,
        }, 'vc', 'nva', {}).globalVars,
        aid: aidBefore,
      },
    };

    const move = findKentStateMove(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Expected Kent State shaded event move');

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, {
      overrides: [
        {
          when: (request) => request.name === '$usTroopCasualties',
          value: [asTokenId('ks-sh-mix-t-1'), asTokenId('ks-sh-mix-t-2')],
        },
      ],
    }).state;

    assert.equal(
      countTokens(final, 'out-of-play-US:none', (token) => token.props.faction === 'US' && token.type === 'troops'),
      2,
    );
    assert.equal(
      countTokens(final, 'casualties-US:none', (token) => token.props.faction === 'US' && token.type === 'base'),
      1,
      'Base stays in casualties — not a valid troop target',
    );
    assert.equal(
      countTokens(final, 'casualties-US:none', (token) => token.props.faction === 'US' && token.type === 'irregular'),
      1,
      'Irregular stays in casualties — not a valid troop target',
    );
    assert.equal(final.globalVars.aid, aidBefore - 6);
  });
});
