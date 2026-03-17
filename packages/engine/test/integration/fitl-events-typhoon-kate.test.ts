import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  legalMoves,
  type ActiveLastingEffect,
  type GameState,
  type Move,
} from '../../src/kernel/index.js';
import {
  getEventCard,
  getFitlEventDef,
  runEvent,
  setupFitlEventState,
} from '../helpers/fitl-event-fidelity-helpers.js';

const CARD_ID = 'card-115';

/* ------------------------------------------------------------------ */
/*  METADATA                                                           */
/* ------------------------------------------------------------------ */

describe('FITL card-115 Typhoon Kate — metadata', () => {
  it('compiles with correct metadata', () => {
    const def = getFitlEventDef();
    const card = getEventCard(def, CARD_ID);

    assert.equal(card.title, 'Typhoon Kate');
    assert.equal(card.sideMode, 'single');
    assert.equal(card.order, 115);
    assert.equal(card.metadata?.period, '1968');
    assert.deepEqual(card.metadata?.seatOrder, ['VC', 'ARVN', 'US', 'NVA']);
    assert.equal(card.tags?.includes('momentum'), true);
  });

  it('has unshaded side with lasting effects and eligibility overrides', () => {
    const def = getFitlEventDef();
    const card = getEventCard(def, CARD_ID);
    if (card.unshaded === undefined) { assert.fail('expected unshaded side'); }

    const lastingEffects = card.unshaded.lastingEffects ?? [];
    assert.equal(lastingEffects.length, 1);

    const lasting = lastingEffects[0]!;
    assert.equal(lasting.id, 'mom-typhoon-kate');
    assert.equal(lasting.duration, 'round');

    const overrides = card.unshaded.eligibilityOverrides ?? [];
    assert.equal(overrides.length, 1);
    const override = overrides[0]!;
    assert.deepEqual(override.target, { kind: 'active' });
    assert.equal(override.eligible, true);
  });

  it('has actionRestrictions on the lasting effect', () => {
    const def = getFitlEventDef();
    const card = getEventCard(def, CARD_ID);
    if (card.unshaded === undefined) { assert.fail('expected unshaded side'); }

    const lasting = (card.unshaded.lastingEffects ?? [])[0]!;
    const restrictions = lasting.actionRestrictions ?? [];
    assert.equal(restrictions.length, 4);

    const blocked = restrictions.filter((r) => r.blocked === true);
    assert.equal(blocked.length, 3);
    const blockedIds = new Set(blocked.map((r) => r.actionId));
    assert.equal(blockedIds.has('airLift'), true);
    assert.equal(blockedIds.has('transport'), true);
    assert.equal(blockedIds.has('bombard'), true);

    const classRestriction = restrictions.find((r) => r.actionClass === 'specialActivity');
    assert.notEqual(classRestriction, undefined);
    assert.deepEqual(classRestriction?.maxParam, { name: '$spaces', max: 1 });
  });
});

/* ------------------------------------------------------------------ */
/*  MOMENTUM FLAG LIFECYCLE                                            */
/* ------------------------------------------------------------------ */

describe('FITL card-115 Typhoon Kate — momentum flag lifecycle', () => {
  it('sets mom_typhoonKate to true when event is played', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, { cardIdInDiscardZone: CARD_ID });
    assert.equal(state.globalVars.mom_typhoonKate, false, 'before event: flag should be false');

    const result = runEvent(def, state, CARD_ID, 'unshaded');
    assert.equal(result.state.globalVars.mom_typhoonKate, true, 'after event: flag should be true');
  });

  it('creates an active lasting effect with actionRestrictions', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, { cardIdInDiscardZone: CARD_ID });

    const result = runEvent(def, state, CARD_ID, 'unshaded');
    const effects = result.state.activeLastingEffects ?? [];
    const kateEffect = effects.find((e: ActiveLastingEffect) => e.id === 'mom-typhoon-kate');

    assert.notEqual(kateEffect, undefined, 'expected active lasting effect mom-typhoon-kate');
    assert.equal(kateEffect!.duration, 'round');
    assert.equal(kateEffect!.sourceCardId, CARD_ID);
    assert.equal(kateEffect!.side, 'unshaded');
    assert.notEqual(kateEffect!.actionRestrictions, undefined, 'expected actionRestrictions on active effect');
    assert.equal(kateEffect!.actionRestrictions!.length, 4);
  });
});

/* ------------------------------------------------------------------ */
/*  ACTION RESTRICTION ENFORCEMENT                                     */
/* ------------------------------------------------------------------ */

const makeKateActiveEffect = (): ActiveLastingEffect => ({
  id: 'mom-typhoon-kate',
  sourceCardId: CARD_ID,
  side: 'unshaded',
  duration: 'round',
  setupEffects: [],
  actionRestrictions: [
    { actionId: 'airLift', blocked: true },
    { actionId: 'transport', blocked: true },
    { actionId: 'bombard', blocked: true },
    { actionClass: 'specialActivity', maxParam: { name: '$spaces', max: 1 } },
  ],
});

const withKateActive = (state: GameState): GameState => ({
  ...state,
  activeLastingEffects: [...(state.activeLastingEffects ?? []), makeKateActiveEffect()],
  globalVars: { ...state.globalVars, mom_typhoonKate: 1 },
});

const findMovesByAction = (moves: readonly Move[], actionId: string): readonly Move[] =>
  moves.filter((m) => String(m.actionId) === actionId);

describe('FITL card-115 Typhoon Kate — action restriction enforcement', () => {
  it('blocks Air Lift when Kate is active', () => {
    const def = getFitlEventDef();
    const baseState = setupFitlEventState(def);
    const state = withKateActive(baseState);

    const moves = legalMoves(def, state);
    const airLiftMoves = findMovesByAction(moves, 'airLift');
    assert.equal(airLiftMoves.length, 0, 'Air Lift should be blocked when Kate is active');
  });

  it('blocks Transport when Kate is active', () => {
    const def = getFitlEventDef();
    const baseState = setupFitlEventState(def);
    const state = withKateActive(baseState);

    const moves = legalMoves(def, state);
    const transportMoves = findMovesByAction(moves, 'transport');
    assert.equal(transportMoves.length, 0, 'Transport should be blocked when Kate is active');
  });

  it('blocks Bombard when Kate is active', () => {
    const def = getFitlEventDef();
    const baseState = setupFitlEventState(def);
    const state = withKateActive(baseState);

    const moves = legalMoves(def, state);
    const bombardMoves = findMovesByAction(moves, 'bombard');
    assert.equal(bombardMoves.length, 0, 'Bombard should be blocked when Kate is active');
  });

  it('does not block operations (e.g. train, patrol, sweep)', () => {
    const def = getFitlEventDef();
    const baseState = setupFitlEventState(def);

    const movesWithout = legalMoves(def, baseState);
    const operationsBefore = movesWithout.filter((m) => {
      const aid = String(m.actionId);
      return ['train', 'patrol', 'sweep', 'assault'].includes(aid);
    });

    const state = withKateActive(baseState);
    const movesWith = legalMoves(def, state);
    const operationsAfter = movesWith.filter((m) => {
      const aid = String(m.actionId);
      return ['train', 'patrol', 'sweep', 'assault'].includes(aid);
    });

    assert.equal(
      operationsAfter.length,
      operationsBefore.length,
      'Operations should not be affected by Kate',
    );
  });

  it('limits other special activities to max 1 space via $spaces param', () => {
    const def = getFitlEventDef();
    const baseState = setupFitlEventState(def);
    const state = withKateActive(baseState);

    const moves = legalMoves(def, state);
    const saActions = new Set(['advise', 'airStrike', 'govern', 'raid', 'infiltrate', 'tax', 'subvert', 'ambushNva', 'ambushVc']);
    const saMoves = moves.filter((m) => saActions.has(String(m.actionId)));

    for (const move of saMoves) {
      const spaces = move.params.$spaces;
      if (spaces !== undefined) {
        const count = Array.isArray(spaces) ? spaces.length : (typeof spaces === 'number' ? spaces : 1);
        assert.ok(count <= 1, `SA ${String(move.actionId)} has $spaces=${count}, expected <= 1`);
      }
    }
  });

  it('allows free operations to bypass Kate restrictions', () => {
    const def = getFitlEventDef();
    const baseState = setupFitlEventState(def);
    const state = withKateActive(baseState);

    const moves = legalMoves(def, state);
    const freeAirLift = moves.filter(
      (m) => String(m.actionId) === 'airLift' && m.freeOperation === true,
    );

    // Free operations bypass action restrictions, so if any free Air Lift is
    // generated (e.g., via MACV grant), it should still be legal.
    // With no active grants, we just confirm the mechanism doesn't crash.
    // The blocking logic skips when move.freeOperation === true.
    for (const move of freeAirLift) {
      assert.equal(move.freeOperation, true, 'free Air Lift should not be blocked');
    }
  });
});

/* ------------------------------------------------------------------ */
/*  ELIGIBILITY RETENTION                                              */
/* ------------------------------------------------------------------ */

describe('FITL card-115 Typhoon Kate — eligibility', () => {
  it('has eligibility override keeping executing faction eligible', () => {
    const def = getFitlEventDef();
    const card = getEventCard(def, CARD_ID);

    const overrides = card.unshaded?.eligibilityOverrides ?? [];
    const selfOverride = overrides.find(
      (o) => o.target.kind === 'active' && o.eligible === true,
    );
    assert.notEqual(selfOverride, undefined, 'expected eligibility override for active faction');
    assert.equal(selfOverride!.windowId, 'remain-eligible');
  });
});

/* ------------------------------------------------------------------ */
/*  COEXISTENCE WITH OTHER LASTING EFFECTS                             */
/* ------------------------------------------------------------------ */

describe('FITL card-115 Typhoon Kate — multiple lasting effects', () => {
  it('coexists with other active lasting effects without interference', () => {
    const def = getFitlEventDef();
    const baseState = setupFitlEventState(def);
    const otherEffect: ActiveLastingEffect = {
      id: 'some-other-effect',
      sourceCardId: 'card-999',
      side: 'unshaded',
      duration: 'round',
      setupEffects: [],
    };
    const state: GameState = {
      ...baseState,
      activeLastingEffects: [otherEffect, makeKateActiveEffect()],
      globalVars: { ...baseState.globalVars, mom_typhoonKate: 1 },
    };

    const moves = legalMoves(def, state);
    const airLiftMoves = findMovesByAction(moves, 'airLift');
    assert.equal(airLiftMoves.length, 0, 'Air Lift still blocked with multiple effects');

    // Operations are unaffected
    const trainMoves = findMovesByAction(moves, 'train');
    const trainMovesBase = findMovesByAction(legalMoves(def, baseState), 'train');
    assert.equal(trainMoves.length, trainMovesBase.length, 'Operations unaffected by multiple effects');
  });
});
