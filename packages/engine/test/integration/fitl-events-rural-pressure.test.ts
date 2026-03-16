import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  legalChoicesEvaluate,
  legalMoves,
  type GameState,
  type Move,
} from '../../src/kernel/index.js';
import { matchesDecisionRequest } from '../helpers/decision-key-matchers.js';
import { applyMoveWithResolvedDecisionIds } from '../helpers/decision-param-helpers.js';
import {
  getEventCard,
  getFitlEventDef,
  makeFitlToken,
  requireEventMove,
  setupFitlEventState,
} from '../helpers/fitl-event-fidelity-helpers.js';
import { withNeutralSupportOppositionMarkers } from '../helpers/isolated-state-helpers.js';

const requireBranchMove = (
  def: Parameters<typeof legalMoves>[0],
  state: Parameters<typeof legalMoves>[1],
  cardId: string,
  side: string,
  branch: string,
): Move => {
  const move = legalMoves(def, state).find(
    (m) =>
      String(m.actionId) === 'event'
      && m.params.eventCardId === cardId
      && m.params.side === side
      && m.params.branch === branch,
  );
  if (move === undefined) {
    assert.fail(`Expected ${cardId} ${side} branch=${branch} event move`);
  }
  return move;
};

const CARD_ID = 'card-105';

// Valid FITL province zone IDs
const QUANG_TRI_THUA_THIEN = 'quang-tri-thua-thien:none';
const BINH_DINH = 'binh-dinh:none';
const PLEIKU_DARLAC = 'pleiku-darlac:none';
const QUANG_NAM = 'quang-nam:none';
const CENTRAL_LAOS = 'central-laos:none'; // Pop 0
const TAY_NINH = 'tay-ninh:none';
const KHANH_HOA = 'khanh-hoa:none';

const supportState = (state: GameState, zone: string): string =>
  String(state.markers[zone]?.supportOpposition ?? 'neutral');

describe('FITL card-105 Rural Pressure', () => {
  it('compiles with correct metadata', () => {
    const def = getFitlEventDef();
    const card = getEventCard(def, CARD_ID);

    assert.equal(card.title, 'Rural Pressure');
    assert.equal(card.sideMode, 'dual');
    assert.equal(card.metadata?.period, '1965');
    assert.deepEqual(card.metadata?.seatOrder, ['VC', 'NVA', 'US', 'ARVN']);
    assert.equal(card.metadata?.flavorText, 'Onerous VC taxation.');
    assert.equal(
      card.unshaded?.text,
      'Shift 4 Provinces with any VC each by 1 level toward Active Support.',
    );
    assert.equal(
      card.shaded?.text,
      'Local government corruption: Shift 3 Provinces with Police each by 1 level toward Active Opposition. Patronage +6 or -6.',
    );
  });

  // ── Unshaded: Shift up to 4 Provinces with VC toward Active Support ──

  it('unshaded happy path: shifts selected provinces with VC each +1 toward Active Support', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 105001,
      cardIdInDiscardZone: CARD_ID,
    });
    const setup = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [QUANG_TRI_THUA_THIEN]: { supportOpposition: 'neutral' },
        [BINH_DINH]: { supportOpposition: 'passiveOpposition' },
        [PLEIKU_DARLAC]: { supportOpposition: 'passiveSupport' },
        [QUANG_NAM]: { supportOpposition: 'neutral' },
      },
      zones: {
        ...base.zones,
        [QUANG_TRI_THUA_THIEN]: [makeFitlToken('rp-vc-qt', 'guerrilla', 'VC')],
        [BINH_DINH]: [makeFitlToken('rp-vc-bd', 'guerrilla', 'VC')],
        [PLEIKU_DARLAC]: [makeFitlToken('rp-vc-pd', 'guerrilla', 'VC')],
        [QUANG_NAM]: [makeFitlToken('rp-vc-qn', 'guerrilla', 'VC')],
      },
    } satisfies GameState;

    const move = requireEventMove(def, setup, CARD_ID, 'unshaded');
    const pending = legalChoicesEvaluate(def, setup, move);
    assert.equal(pending.kind, 'pending');
    if (pending.kind !== 'pending') throw new Error('Expected pending');
    if (pending.type !== 'chooseN') throw new Error('Expected chooseN');

    // Card specifies max:4 but no min — selection is optional (min=0)
    assert.equal(pending.max, 4);

    const options = pending.options.map((o) => String(o.value)).sort();
    assert.ok(options.includes(QUANG_TRI_THUA_THIEN));
    assert.ok(options.includes(BINH_DINH));
    assert.ok(options.includes(PLEIKU_DARLAC));
    assert.ok(options.includes(QUANG_NAM));

    const final = applyMoveWithResolvedDecisionIds(def, setup, move, {
      overrides: [
        {
          when: matchesDecisionRequest({ name: '$targetProvince' }),
          value: [QUANG_TRI_THUA_THIEN, BINH_DINH, PLEIKU_DARLAC, QUANG_NAM],
        },
      ],
    }).state;

    assert.equal(supportState(final, QUANG_TRI_THUA_THIEN), 'passiveSupport');
    assert.equal(supportState(final, BINH_DINH), 'neutral');
    assert.equal(supportState(final, PLEIKU_DARLAC), 'activeSupport');
    assert.equal(supportState(final, QUANG_NAM), 'passiveSupport');
  });

  it('unshaded scales max cardinality when fewer than 4 eligible provinces exist', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 105002,
      cardIdInDiscardZone: CARD_ID,
    });
    const setup = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [BINH_DINH]: { supportOpposition: 'passiveOpposition' },
        [PLEIKU_DARLAC]: { supportOpposition: 'neutral' },
      },
      zones: {
        ...base.zones,
        [BINH_DINH]: [makeFitlToken('rp-sc-vc-bd', 'guerrilla', 'VC')],
        [PLEIKU_DARLAC]: [makeFitlToken('rp-sc-vc-pd', 'guerrilla', 'VC')],
      },
    } satisfies GameState;

    const move = requireEventMove(def, setup, CARD_ID, 'unshaded');
    const pending = legalChoicesEvaluate(def, setup, move);
    assert.equal(pending.kind, 'pending');
    if (pending.kind !== 'pending') throw new Error('Expected pending');
    if (pending.type !== 'chooseN') throw new Error('Expected chooseN');

    assert.equal(pending.max, 2);
    assert.equal(pending.options.length, 2);

    const final = applyMoveWithResolvedDecisionIds(def, setup, move, {
      overrides: [
        {
          when: matchesDecisionRequest({ name: '$targetProvince' }),
          value: [BINH_DINH, PLEIKU_DARLAC],
        },
      ],
    }).state;

    assert.equal(supportState(final, BINH_DINH), 'neutral');
    assert.equal(supportState(final, PLEIKU_DARLAC), 'passiveSupport');
  });

  it('unshaded no-op when no provinces have VC', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 105003,
      cardIdInDiscardZone: CARD_ID,
    });
    const setup = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
      },
    } satisfies GameState;

    const move = requireEventMove(def, setup, CARD_ID, 'unshaded');
    const pending = legalChoicesEvaluate(def, setup, move);
    assert.equal(pending.kind, 'pending');
    if (pending.kind !== 'pending') throw new Error('Expected pending');
    if (pending.type !== 'chooseN') throw new Error('Expected chooseN');

    assert.equal(pending.min, 0);
    assert.equal(pending.max, 0);
    assert.deepEqual(pending.options, []);
  });

  it('unshaded includes provinces with only a VC base (no guerrillas)', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 105004,
      cardIdInDiscardZone: CARD_ID,
    });
    const setup = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [BINH_DINH]: { supportOpposition: 'neutral' },
      },
      zones: {
        ...base.zones,
        [BINH_DINH]: [makeFitlToken('rp-vc-base-bd', 'base', 'VC')],
      },
    } satisfies GameState;

    const move = requireEventMove(def, setup, CARD_ID, 'unshaded');
    const pending = legalChoicesEvaluate(def, setup, move);
    assert.equal(pending.kind, 'pending');
    if (pending.kind !== 'pending') throw new Error('Expected pending');
    if (pending.type !== 'chooseN') throw new Error('Expected chooseN');

    const options = pending.options.map((o) => String(o.value));
    assert.ok(options.includes(BINH_DINH), 'Province with only VC base should be eligible');
  });

  it('unshaded excludes Pop 0 provinces at neutral via markerShiftAllowed', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 105005,
      cardIdInDiscardZone: CARD_ID,
    });
    const setup = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [CENTRAL_LAOS]: { supportOpposition: 'neutral' },
        [BINH_DINH]: { supportOpposition: 'neutral' },
      },
      zones: {
        ...base.zones,
        [CENTRAL_LAOS]: [makeFitlToken('rp-vc-laos', 'guerrilla', 'VC')],
        [BINH_DINH]: [makeFitlToken('rp-vc-bd-pop0', 'guerrilla', 'VC')],
      },
    } satisfies GameState;

    const move = requireEventMove(def, setup, CARD_ID, 'unshaded');
    const pending = legalChoicesEvaluate(def, setup, move);
    assert.equal(pending.kind, 'pending');
    if (pending.kind !== 'pending') throw new Error('Expected pending');
    if (pending.type !== 'chooseN') throw new Error('Expected chooseN');

    const options = pending.options.map((o) => String(o.value));
    assert.ok(!options.includes(CENTRAL_LAOS), 'Pop 0 province at neutral should be excluded');
    assert.ok(options.includes(BINH_DINH), 'Normal province with VC should be included');
  });

  it('unshaded excludes provinces already at activeSupport via markerShiftAllowed', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 105006,
      cardIdInDiscardZone: CARD_ID,
    });
    const setup = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [BINH_DINH]: { supportOpposition: 'activeSupport' },
        [PLEIKU_DARLAC]: { supportOpposition: 'neutral' },
      },
      zones: {
        ...base.zones,
        [BINH_DINH]: [makeFitlToken('rp-vc-bd-as', 'guerrilla', 'VC')],
        [PLEIKU_DARLAC]: [makeFitlToken('rp-vc-pd-as', 'guerrilla', 'VC')],
      },
    } satisfies GameState;

    const move = requireEventMove(def, setup, CARD_ID, 'unshaded');
    const pending = legalChoicesEvaluate(def, setup, move);
    assert.equal(pending.kind, 'pending');
    if (pending.kind !== 'pending') throw new Error('Expected pending');
    if (pending.type !== 'chooseN') throw new Error('Expected chooseN');

    const options = pending.options.map((o) => String(o.value));
    assert.ok(!options.includes(BINH_DINH), 'Province at activeSupport should be excluded');
    assert.ok(options.includes(PLEIKU_DARLAC), 'Province at neutral should be included');
  });

  // ── Shaded: Shift up to 3 Provinces with Police toward Active Opposition + Patronage ──

  it('shaded happy path with +6 patronage', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 105007,
      cardIdInDiscardZone: CARD_ID,
      globalVars: { patronage: 30 },
    });
    const setup = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [BINH_DINH]: { supportOpposition: 'neutral' },
        [PLEIKU_DARLAC]: { supportOpposition: 'passiveSupport' },
        [KHANH_HOA]: { supportOpposition: 'activeSupport' },
      },
      zones: {
        ...base.zones,
        [BINH_DINH]: [makeFitlToken('rp-sh-pol-bd', 'police', 'ARVN')],
        [PLEIKU_DARLAC]: [makeFitlToken('rp-sh-pol-pd', 'police', 'ARVN')],
        [KHANH_HOA]: [makeFitlToken('rp-sh-pol-kh', 'police', 'ARVN')],
      },
    } satisfies GameState;

    const move = requireEventMove(def, setup, CARD_ID, 'shaded');
    const pending = legalChoicesEvaluate(def, setup, move);
    assert.equal(pending.kind, 'pending');
    if (pending.kind !== 'pending') throw new Error('Expected pending');
    if (pending.type !== 'chooseN') throw new Error('Expected chooseN');

    assert.equal(pending.max, 3);

    const final = applyMoveWithResolvedDecisionIds(def, setup, move, {
      overrides: [
        {
          when: matchesDecisionRequest({ name: '$targetProvince' }),
          value: [BINH_DINH, PLEIKU_DARLAC, KHANH_HOA],
        },
      ],
    }).state;

    assert.equal(supportState(final, BINH_DINH), 'passiveOpposition');
    assert.equal(supportState(final, PLEIKU_DARLAC), 'neutral');
    assert.equal(supportState(final, KHANH_HOA), 'passiveSupport');
    assert.equal(final.globalVars.patronage, 36);
  });

  it('shaded with -6 patronage', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 105008,
      cardIdInDiscardZone: CARD_ID,
      globalVars: { patronage: 30 },
    });
    const setup = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [BINH_DINH]: { supportOpposition: 'neutral' },
        [PLEIKU_DARLAC]: { supportOpposition: 'passiveSupport' },
        [KHANH_HOA]: { supportOpposition: 'activeSupport' },
      },
      zones: {
        ...base.zones,
        [BINH_DINH]: [makeFitlToken('rp-sh2-pol-bd', 'police', 'ARVN')],
        [PLEIKU_DARLAC]: [makeFitlToken('rp-sh2-pol-pd', 'police', 'ARVN')],
        [KHANH_HOA]: [makeFitlToken('rp-sh2-pol-kh', 'police', 'ARVN')],
      },
    } satisfies GameState;

    const move = requireBranchMove(def, setup, CARD_ID, 'shaded', 'rural-pressure-minus-patronage');
    const final = applyMoveWithResolvedDecisionIds(def, setup, move, {
      overrides: [
        {
          when: matchesDecisionRequest({ name: '$targetProvince' }),
          value: [BINH_DINH, PLEIKU_DARLAC, KHANH_HOA],
        },
      ],
    }).state;

    assert.equal(supportState(final, BINH_DINH), 'passiveOpposition');
    assert.equal(supportState(final, PLEIKU_DARLAC), 'neutral');
    assert.equal(supportState(final, KHANH_HOA), 'passiveSupport');
    assert.equal(final.globalVars.patronage, 24);
  });

  it('shaded scales max cardinality when only 1 province with Police exists', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 105009,
      cardIdInDiscardZone: CARD_ID,
      globalVars: { patronage: 10 },
    });
    const setup = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [BINH_DINH]: { supportOpposition: 'passiveSupport' },
      },
      zones: {
        ...base.zones,
        [BINH_DINH]: [makeFitlToken('rp-sc-sh-pol-bd', 'police', 'ARVN')],
      },
    } satisfies GameState;

    const move = requireEventMove(def, setup, CARD_ID, 'shaded');
    const pending = legalChoicesEvaluate(def, setup, move);
    assert.equal(pending.kind, 'pending');
    if (pending.kind !== 'pending') throw new Error('Expected pending');
    if (pending.type !== 'chooseN') throw new Error('Expected chooseN');

    assert.equal(pending.max, 1);
    assert.equal(pending.options.length, 1);
  });

  it('shaded patronage clamps at 0 when choosing -6', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 105010,
      cardIdInDiscardZone: CARD_ID,
      globalVars: { patronage: 3 },
    });
    const setup = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [BINH_DINH]: { supportOpposition: 'passiveSupport' },
      },
      zones: {
        ...base.zones,
        [BINH_DINH]: [makeFitlToken('rp-clamp0-pol', 'police', 'ARVN')],
      },
    } satisfies GameState;

    const move = requireBranchMove(def, setup, CARD_ID, 'shaded', 'rural-pressure-minus-patronage');
    const final = applyMoveWithResolvedDecisionIds(def, setup, move, {
      overrides: [
        {
          when: matchesDecisionRequest({ name: '$targetProvince' }),
          value: [BINH_DINH],
        },
      ],
    }).state;

    assert.equal(final.globalVars.patronage, 0, 'Patronage should clamp at 0');
  });

  it('shaded patronage clamps at 75 when choosing +6', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 105011,
      cardIdInDiscardZone: CARD_ID,
      globalVars: { patronage: 72 },
    });
    const setup = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [BINH_DINH]: { supportOpposition: 'passiveSupport' },
      },
      zones: {
        ...base.zones,
        [BINH_DINH]: [makeFitlToken('rp-clamp75-pol', 'police', 'ARVN')],
      },
    } satisfies GameState;

    const move = requireBranchMove(def, setup, CARD_ID, 'shaded', 'rural-pressure-plus-patronage');
    const final = applyMoveWithResolvedDecisionIds(def, setup, move, {
      overrides: [
        {
          when: matchesDecisionRequest({ name: '$targetProvince' }),
          value: [BINH_DINH],
        },
      ],
    }).state;

    assert.equal(final.globalVars.patronage, 75, 'Patronage should clamp at 75');
  });

  // ── Edge cases ──

  it('province with both VC and Police is eligible for both unshaded and shaded', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 105012,
      cardIdInDiscardZone: CARD_ID,
    });
    const setup = {
      ...base,
      markers: {
        ...withNeutralSupportOppositionMarkers(base),
        [TAY_NINH]: { supportOpposition: 'neutral' },
      },
      zones: {
        ...base.zones,
        [TAY_NINH]: [
          makeFitlToken('rp-both-vc', 'guerrilla', 'VC'),
          makeFitlToken('rp-both-pol', 'police', 'ARVN'),
        ],
      },
    } satisfies GameState;

    const unshadedMove = requireEventMove(def, setup, CARD_ID, 'unshaded');
    const unshadedPending = legalChoicesEvaluate(def, setup, unshadedMove);
    assert.equal(unshadedPending.kind, 'pending');
    if (unshadedPending.kind !== 'pending') throw new Error('Expected pending');
    if (unshadedPending.type !== 'chooseN') throw new Error('Expected chooseN');
    const unshadedOptions = unshadedPending.options.map((o) => String(o.value));
    assert.ok(unshadedOptions.includes(TAY_NINH), 'Province with both VC and Police should be eligible for unshaded');

    const shadedMove = requireEventMove(def, setup, CARD_ID, 'shaded');
    const shadedPending = legalChoicesEvaluate(def, setup, shadedMove);
    assert.equal(shadedPending.kind, 'pending');
    if (shadedPending.kind !== 'pending') throw new Error('Expected pending');
    if (shadedPending.type !== 'chooseN') throw new Error('Expected chooseN');
    const shadedOptions = shadedPending.options.map((o) => String(o.value));
    assert.ok(shadedOptions.includes(TAY_NINH), 'Province with both VC and Police should be eligible for shaded');
  });
});
