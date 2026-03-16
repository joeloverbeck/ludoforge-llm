import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asTokenId } from '../../src/kernel/index.js';
import {
  assertEventText,
  assertNoOpEvent,
  findTokenInZone,
  getEventCard,
  getFitlEventDef,
  makeFitlToken,
  runEvent,
  setupFitlEventState,
  tokenIdsInZone,
} from './fitl-events-test-helpers.js';

const CARD_ID = 'card-94';
const QUANG_TRI = 'quang-tri-thua-thien:none';
const BINH_DINH = 'binh-dinh:none';
const PHUOC_LONG = 'phuoc-long:none';
const AVAILABLE_NVA = 'available-NVA:none';
const AVAILABLE_VC = 'available-VC:none';

describe('FITL card-94 Tunnel Rats', () => {
  // ── Compilation tests ──

  it('compiles with correct metadata, text, and structure', () => {
    const def = getFitlEventDef();
    const card = getEventCard(def, CARD_ID);

    assertEventText(def, CARD_ID, {
      title: 'Tunnel Rats',
      unshaded:
        'Place a Tunnel marker on an Insurgent Base in each of 2 Provinces, or remove 1 Tunneled Base from a space with US Troops.',
    });
    assert.equal(card.sideMode, 'single');
    assert.equal(card.metadata?.period, '1968');
    assert.deepEqual(card.metadata?.seatOrder, ['VC', 'US', 'NVA', 'ARVN']);

    const serialized = JSON.stringify(card.unshaded?.effects ?? []);
    assert.match(serialized, /branchACount/, 'Should compute branch A count');
    assert.match(serialized, /branchBCount/, 'Should compute branch B count');
    assert.match(serialized, /tunnelRatsBranch/, 'Should use branch choice binding');
    assert.match(serialized, /setTokenProp/, 'Should use setTokenProp for tunnel placement');
    assert.match(serialized, /moveToken/, 'Should use moveToken for base removal');
  });

  // ── Branch feasibility tests ──

  it('both branches feasible — player gets chooseOne with 2 enum options', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 94001,
      activePlayer: 1,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        // Branch A: 2 provinces with untunneled insurgent bases
        [QUANG_TRI]: [
          makeFitlToken('tr-nva-base-1', 'base', 'NVA', { tunnel: 'untunneled' }),
          makeFitlToken('tr-us-troop-qt', 'troops', 'US'),
        ],
        [BINH_DINH]: [
          makeFitlToken('tr-vc-base-1', 'base', 'VC', { tunnel: 'untunneled' }),
        ],
        // Branch B: tunneled base in space with US troops
        [PHUOC_LONG]: [
          makeFitlToken('tr-nva-tbase-1', 'base', 'NVA', { tunnel: 'tunneled' }),
          makeFitlToken('tr-us-troop-pl', 'troops', 'US'),
        ],
      },
    });

    // Choose place-tunnels branch
    const finalA = runEvent(def, state, CARD_ID, 'unshaded', {
      overrides: [
        {
          when: (req) => req.name === '$tunnelRatsBranch',
          value: 'place-tunnels',
        },
        {
          when: (req) => req.name === '$tunnelProvinces',
          value: [asTokenId(QUANG_TRI), asTokenId(BINH_DINH)],
        },
      ],
    }).state;

    // Verify tunnel markers placed
    const base1 = findTokenInZone(finalA, QUANG_TRI, 'tr-nva-base-1');
    assert.equal(base1?.props.tunnel, 'tunneled', 'NVA base in Quang Tri should be tunneled');
    const base2 = findTokenInZone(finalA, BINH_DINH, 'tr-vc-base-1');
    assert.equal(base2?.props.tunnel, 'tunneled', 'VC base in Binh Dinh should be tunneled');

    // Choose remove-tunneled-base branch
    const finalB = runEvent(def, state, CARD_ID, 'unshaded', {
      overrides: [
        {
          when: (req) => req.name === '$tunnelRatsBranch',
          value: 'remove-tunneled-base',
        },
        {
          when: (req) => req.name === '$tunneledBaseToRemove',
          value: asTokenId('tr-nva-tbase-1'),
        },
      ],
    }).state;

    // Verify tunneled base removed
    assert.equal(
      tokenIdsInZone(finalB, AVAILABLE_NVA).has('tr-nva-tbase-1'),
      true,
      'Tunneled NVA base should be moved to available',
    );
    assert.equal(
      tokenIdsInZone(finalB, PHUOC_LONG).has('tr-nva-tbase-1'),
      false,
      'Tunneled NVA base should no longer be in Phuoc Long',
    );
  });

  it('only Branch A feasible — auto-executes tunnel placement (no branch choice)', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 94002,
      activePlayer: 1,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [QUANG_TRI]: [
          makeFitlToken('tr-a-only-base-1', 'base', 'NVA', { tunnel: 'untunneled' }),
        ],
        [BINH_DINH]: [
          makeFitlToken('tr-a-only-base-2', 'base', 'VC', { tunnel: 'untunneled' }),
        ],
        // No tunneled bases with US troops → Branch B not feasible
      },
    });

    const final = runEvent(def, state, CARD_ID, 'unshaded', {
      overrides: [
        {
          when: (req) => req.name === '$tunnelProvinces',
          value: [asTokenId(QUANG_TRI), asTokenId(BINH_DINH)],
        },
      ],
    }).state;

    const base1 = findTokenInZone(final, QUANG_TRI, 'tr-a-only-base-1');
    assert.equal(base1?.props.tunnel, 'tunneled', 'Base in Quang Tri should be tunneled');
    const base2 = findTokenInZone(final, BINH_DINH, 'tr-a-only-base-2');
    assert.equal(base2?.props.tunnel, 'tunneled', 'Base in Binh Dinh should be tunneled');
  });

  it('only Branch B feasible — auto-executes tunneled base removal', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 94003,
      activePlayer: 1,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        // Only 1 province with untunneled base → Branch A needs >= 2
        [QUANG_TRI]: [
          makeFitlToken('tr-b-only-ubase', 'base', 'NVA', { tunnel: 'untunneled' }),
        ],
        // Branch B: tunneled base with US troops
        [BINH_DINH]: [
          makeFitlToken('tr-b-only-tbase', 'base', 'VC', { tunnel: 'tunneled' }),
          makeFitlToken('tr-b-only-us', 'troops', 'US'),
        ],
      },
    });

    const final = runEvent(def, state, CARD_ID, 'unshaded', {
      overrides: [
        {
          when: (req) => req.name === '$tunneledBaseToRemove',
          value: asTokenId('tr-b-only-tbase'),
        },
      ],
    }).state;

    assert.equal(
      tokenIdsInZone(final, AVAILABLE_VC).has('tr-b-only-tbase'),
      true,
      'Tunneled VC base should be moved to available-VC',
    );
  });

  it('neither branch feasible — event does nothing', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 94004,
      activePlayer: 1,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        // Only 1 province with untunneled base → Branch A not feasible
        [QUANG_TRI]: [
          makeFitlToken('tr-noop-ubase', 'base', 'NVA', { tunnel: 'untunneled' }),
        ],
        // Tunneled base but no US troops → Branch B not feasible
        [BINH_DINH]: [
          makeFitlToken('tr-noop-tbase', 'base', 'VC', { tunnel: 'tunneled' }),
        ],
      },
    });

    assertNoOpEvent(def, state, CARD_ID, 'unshaded');
  });

  // ── Branch A execution tests ──

  it('Branch A: tunnels chosen bases in 2 provinces', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 94010,
      activePlayer: 1,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [QUANG_TRI]: [
          makeFitlToken('tr-a-nva-base', 'base', 'NVA', { tunnel: 'untunneled' }),
        ],
        [BINH_DINH]: [
          makeFitlToken('tr-a-vc-base', 'base', 'VC', { tunnel: 'untunneled' }),
        ],
        [PHUOC_LONG]: [
          makeFitlToken('tr-a-extra-base', 'base', 'NVA', { tunnel: 'untunneled' }),
        ],
      },
    });

    const final = runEvent(def, state, CARD_ID, 'unshaded', {
      overrides: [
        {
          when: (req) => req.name === '$tunnelProvinces',
          value: [asTokenId(QUANG_TRI), asTokenId(BINH_DINH)],
        },
      ],
    }).state;

    const base1 = findTokenInZone(final, QUANG_TRI, 'tr-a-nva-base');
    assert.equal(base1?.props.tunnel, 'tunneled', 'NVA base tunneled');
    const base2 = findTokenInZone(final, BINH_DINH, 'tr-a-vc-base');
    assert.equal(base2?.props.tunnel, 'tunneled', 'VC base tunneled');
    // Unchosen province untouched
    const base3 = findTokenInZone(final, PHUOC_LONG, 'tr-a-extra-base');
    assert.equal(base3?.props.tunnel, 'untunneled', 'Unchosen province base stays untunneled');
  });

  it('Branch A: province with multiple untunneled bases — player picks which to tunnel', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 94011,
      activePlayer: 1,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [QUANG_TRI]: [
          makeFitlToken('tr-a-multi-nva', 'base', 'NVA', { tunnel: 'untunneled' }),
          makeFitlToken('tr-a-multi-vc', 'base', 'VC', { tunnel: 'untunneled' }),
        ],
        [BINH_DINH]: [
          makeFitlToken('tr-a-multi-bd', 'base', 'VC', { tunnel: 'untunneled' }),
        ],
      },
    });

    const final = runEvent(def, state, CARD_ID, 'unshaded', {
      overrides: [
        {
          when: (req) => req.name === '$tunnelProvinces',
          value: [asTokenId(QUANG_TRI), asTokenId(BINH_DINH)],
        },
        {
          when: (req) => req.name === '$baseToTunnel',
          value: (req) => {
            // Pick the VC base in Quang Tri (not the NVA one)
            const vcBase = req.options.find((opt) => String(opt.value) === asTokenId('tr-a-multi-vc'));
            if (vcBase !== undefined) return vcBase.value;
            // Default to first option for other provinces
            return req.options[0]?.value;
          },
        },
      ],
    }).state;

    const nvaBase = findTokenInZone(final, QUANG_TRI, 'tr-a-multi-nva');
    assert.equal(nvaBase?.props.tunnel, 'untunneled', 'Unchosen NVA base stays untunneled');
    const vcBase = findTokenInZone(final, QUANG_TRI, 'tr-a-multi-vc');
    assert.equal(vcBase?.props.tunnel, 'tunneled', 'Chosen VC base becomes tunneled');
    const bdBase = findTokenInZone(final, BINH_DINH, 'tr-a-multi-bd');
    assert.equal(bdBase?.props.tunnel, 'tunneled', 'Binh Dinh base tunneled');
  });

  it('Branch A: province with existing tunneled base — only untunneled base is a target', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 94012,
      activePlayer: 1,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [QUANG_TRI]: [
          makeFitlToken('tr-a-already-t', 'base', 'NVA', { tunnel: 'tunneled' }),
          makeFitlToken('tr-a-target', 'base', 'VC', { tunnel: 'untunneled' }),
        ],
        [BINH_DINH]: [
          makeFitlToken('tr-a-bd-target', 'base', 'NVA', { tunnel: 'untunneled' }),
        ],
      },
    });

    const final = runEvent(def, state, CARD_ID, 'unshaded', {
      overrides: [
        {
          when: (req) => req.name === '$tunnelProvinces',
          value: [asTokenId(QUANG_TRI), asTokenId(BINH_DINH)],
        },
      ],
    }).state;

    const alreadyTunneled = findTokenInZone(final, QUANG_TRI, 'tr-a-already-t');
    assert.equal(alreadyTunneled?.props.tunnel, 'tunneled', 'Already tunneled base stays tunneled');
    const newlyTunneled = findTokenInZone(final, QUANG_TRI, 'tr-a-target');
    assert.equal(newlyTunneled?.props.tunnel, 'tunneled', 'Untunneled base becomes tunneled');
  });

  it('Branch A: all insurgent bases already tunneled — Branch A not feasible', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 94013,
      activePlayer: 1,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [QUANG_TRI]: [
          makeFitlToken('tr-alltunn-1', 'base', 'NVA', { tunnel: 'tunneled' }),
        ],
        [BINH_DINH]: [
          makeFitlToken('tr-alltunn-2', 'base', 'VC', { tunnel: 'tunneled' }),
        ],
        // No untunneled bases → branchACount = 0
        // No US troops with tunneled bases → branchBCount = 0
      },
    });

    assertNoOpEvent(def, state, CARD_ID, 'unshaded');
  });

  // ── Branch B execution tests ──

  it('Branch B: removes tunneled base from space with US troops to correct available zone', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 94020,
      activePlayer: 1,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        // Only 1 province with untunneled base → branchA < 2
        [QUANG_TRI]: [
          makeFitlToken('tr-b-ubase', 'base', 'NVA', { tunnel: 'untunneled' }),
        ],
        [BINH_DINH]: [
          makeFitlToken('tr-b-vc-tbase', 'base', 'VC', { tunnel: 'tunneled' }),
          makeFitlToken('tr-b-us-troop', 'troops', 'US'),
        ],
      },
    });

    const final = runEvent(def, state, CARD_ID, 'unshaded', {
      overrides: [
        {
          when: (req) => req.name === '$tunneledBaseToRemove',
          value: asTokenId('tr-b-vc-tbase'),
        },
      ],
    }).state;

    assert.equal(
      tokenIdsInZone(final, AVAILABLE_VC).has('tr-b-vc-tbase'),
      true,
      'VC tunneled base should go to available-VC',
    );
    assert.equal(
      tokenIdsInZone(final, BINH_DINH).has('tr-b-vc-tbase'),
      false,
      'VC tunneled base should no longer be in Binh Dinh',
    );
  });

  it('Branch B: NVA tunneled base goes to available-NVA', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 94021,
      activePlayer: 1,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [QUANG_TRI]: [
          makeFitlToken('tr-b-nva-tbase', 'base', 'NVA', { tunnel: 'tunneled' }),
          makeFitlToken('tr-b-nva-us-trp', 'troops', 'US'),
        ],
      },
    });

    const final = runEvent(def, state, CARD_ID, 'unshaded', {
      overrides: [
        {
          when: (req) => req.name === '$tunneledBaseToRemove',
          value: asTokenId('tr-b-nva-tbase'),
        },
      ],
    }).state;

    assert.equal(
      tokenIdsInZone(final, AVAILABLE_NVA).has('tr-b-nva-tbase'),
      true,
      'NVA tunneled base should go to available-NVA',
    );
  });

  it('Branch B: multiple valid targets — player picks which', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 94022,
      activePlayer: 1,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [QUANG_TRI]: [
          makeFitlToken('tr-b-multi-nva', 'base', 'NVA', { tunnel: 'tunneled' }),
          makeFitlToken('tr-b-multi-us1', 'troops', 'US'),
        ],
        [BINH_DINH]: [
          makeFitlToken('tr-b-multi-vc', 'base', 'VC', { tunnel: 'tunneled' }),
          makeFitlToken('tr-b-multi-us2', 'troops', 'US'),
        ],
      },
    });

    // Choose the VC base in Binh Dinh
    const final = runEvent(def, state, CARD_ID, 'unshaded', {
      overrides: [
        {
          when: (req) => req.name === '$tunneledBaseToRemove',
          value: asTokenId('tr-b-multi-vc'),
        },
      ],
    }).state;

    assert.equal(
      tokenIdsInZone(final, AVAILABLE_VC).has('tr-b-multi-vc'),
      true,
      'Chosen VC base removed to available',
    );
    assert.equal(
      tokenIdsInZone(final, QUANG_TRI).has('tr-b-multi-nva'),
      true,
      'Unchosen NVA base remains in Quang Tri',
    );
  });

  it('Branch B: tunneled base bypasses tunnel protection (5.1.1)', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 94023,
      activePlayer: 1,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [QUANG_TRI]: [
          makeFitlToken('tr-b-bypass', 'base', 'NVA', { tunnel: 'tunneled' }),
          makeFitlToken('tr-b-bypass-us', 'troops', 'US'),
        ],
      },
    });

    const final = runEvent(def, state, CARD_ID, 'unshaded', {
      overrides: [
        {
          when: (req) => req.name === '$tunneledBaseToRemove',
          value: asTokenId('tr-b-bypass'),
        },
      ],
    }).state;

    // The base IS removed — no die roll, no tunnel protection
    assert.equal(
      tokenIdsInZone(final, AVAILABLE_NVA).has('tr-b-bypass'),
      true,
      'Tunneled base removed despite tunnel status (5.1.1 bypass)',
    );
    assert.equal(
      tokenIdsInZone(final, QUANG_TRI).has('tr-b-bypass'),
      false,
      'Base no longer in space',
    );
  });

  // ── Edge cases ──

  it('tunneled bases exist but none in spaces with US troops — Branch B not feasible', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 94030,
      activePlayer: 1,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        // Tunneled base but no US troops in same space
        [QUANG_TRI]: [
          makeFitlToken('tr-edge-tbase', 'base', 'NVA', { tunnel: 'tunneled' }),
          makeFitlToken('tr-edge-arvn', 'troops', 'ARVN'), // ARVN troops don't count
        ],
        // Only 1 province with untunneled base → Branch A not feasible either
        [BINH_DINH]: [
          makeFitlToken('tr-edge-ubase', 'base', 'VC', { tunnel: 'untunneled' }),
        ],
      },
    });

    assertNoOpEvent(def, state, CARD_ID, 'unshaded');
  });

  it('space has US troops but only untunneled bases — not a Branch B target', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 94031,
      activePlayer: 1,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        // US troops + untunneled base only → not Branch B
        [QUANG_TRI]: [
          makeFitlToken('tr-edge2-ubase', 'base', 'NVA', { tunnel: 'untunneled' }),
          makeFitlToken('tr-edge2-us', 'troops', 'US'),
        ],
        // Need 2 provinces for Branch A
        [BINH_DINH]: [
          makeFitlToken('tr-edge2-ubase2', 'base', 'VC', { tunnel: 'untunneled' }),
        ],
      },
    });

    // Only Branch A feasible (2 provinces with untunneled bases), Branch B = 0
    const final = runEvent(def, state, CARD_ID, 'unshaded', {
      overrides: [
        {
          when: (req) => req.name === '$tunnelProvinces',
          value: [asTokenId(QUANG_TRI), asTokenId(BINH_DINH)],
        },
      ],
    }).state;

    const base1 = findTokenInZone(final, QUANG_TRI, 'tr-edge2-ubase');
    assert.equal(base1?.props.tunnel, 'tunneled', 'Auto-executed Branch A tunnels base');
  });

  it('exactly 1 province with untunneled base — Branch A not feasible (needs 2)', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 94032,
      activePlayer: 1,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [QUANG_TRI]: [
          makeFitlToken('tr-edge3-ubase', 'base', 'NVA', { tunnel: 'untunneled' }),
        ],
        // No tunneled bases with US troops → Branch B not feasible either
      },
    });

    assertNoOpEvent(def, state, CARD_ID, 'unshaded');
  });
});
