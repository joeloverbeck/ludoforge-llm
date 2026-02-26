import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asPlayerId, legalMoves, type GameDef, type GameState } from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { makeIsolatedInitialState } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

/**
 * Faction-action filtering integration tests.
 *
 * Verifies that legalMoves only returns actions appropriate for the active
 * player's faction. The primary assertion is **exclusion**: wrong-faction
 * actions must NEVER appear. Inclusion is checked for a known-available
 * subset — some actions require board tokens to have legal targets.
 */
describe('FITL faction-action filtering', () => {
  const US_SEAT = 0;
  const ARVN_SEAT = 1;
  const NVA_SEAT = 2;
  const VC_SEAT = 3;

  // Actions exclusive to each faction (specials + joint ops + transfers)
  const US_EXCLUSIVE = ['advise', 'airLift', 'airStrike', 'usOp'];
  const ARVN_EXCLUSIVE = ['govern', 'transport', 'raid', 'arvnOp'];
  const NVA_EXCLUSIVE = ['infiltrate', 'bombard', 'ambushNva', 'nvaTransferResources'];
  const VC_EXCLUSIVE = ['tax', 'subvert', 'ambushVc', 'vcTransferResources'];

  // Operations exclusive to faction pairs
  const US_ARVN_OPS = ['train', 'patrol', 'sweep', 'assault'];
  const NVA_VC_OPS = ['rally', 'march', 'attack', 'terror'];

  const withActivePlayer = (state: GameState, seat: number): GameState => ({
    ...state,
    activePlayer: asPlayerId(seat),
  });

  const uniqueActionIds = (def: GameDef, state: GameState): ReadonlySet<string> =>
    new Set(legalMoves(def, state).map((move) => String(move.actionId)));

  let def: GameDef;
  let baseState: GameState;

  const setup = (): void => {
    if (def) return;
    const result = compileProductionSpec();
    assertNoErrors(result.parsed);
    assert.notEqual(result.compiled.gameDef, null);
    def = result.compiled.gameDef!;
    baseState = makeIsolatedInitialState(def, 42, 4, { turnOrderMode: 'roundRobin' });
  };

  it('US player (seat 0) never sees NVA/VC/ARVN-exclusive actions', () => {
    setup();
    const state = withActivePlayer(baseState, US_SEAT);
    const actions = uniqueActionIds(def, state);

    // Verify at least some US actions are present (sanity check)
    assert.ok(actions.has('pass'), 'US should see pass');
    assert.ok(actions.size > 1, 'US should have more than just pass');

    // US must NOT see NVA/VC operations
    for (const op of NVA_VC_OPS) {
      assert.ok(!actions.has(op), `US must NOT see NVA/VC operation '${op}'`);
    }

    // US must NOT see other factions' exclusive actions
    for (const a of [...ARVN_EXCLUSIVE, ...NVA_EXCLUSIVE, ...VC_EXCLUSIVE]) {
      assert.ok(!actions.has(a), `US must NOT see '${a}'`);
    }

    // All returned actions must be from US-allowed set
    const usAllowed = new Set([...US_ARVN_OPS, ...US_EXCLUSIVE, 'pass', 'event']);
    for (const actionId of actions) {
      assert.ok(usAllowed.has(actionId), `Unexpected action '${actionId}' for US player`);
    }
  });

  it('ARVN player (seat 1) never sees US/NVA/VC-exclusive actions', () => {
    setup();
    const state = withActivePlayer(baseState, ARVN_SEAT);
    const actions = uniqueActionIds(def, state);

    assert.ok(actions.has('pass'), 'ARVN should see pass');

    // ARVN must NOT see NVA/VC operations
    for (const op of NVA_VC_OPS) {
      assert.ok(!actions.has(op), `ARVN must NOT see NVA/VC operation '${op}'`);
    }

    // ARVN must NOT see other factions' exclusive actions
    for (const a of [...US_EXCLUSIVE, ...NVA_EXCLUSIVE, ...VC_EXCLUSIVE]) {
      assert.ok(!actions.has(a), `ARVN must NOT see '${a}'`);
    }

    // All returned actions must be from ARVN-allowed set
    const arvnAllowed = new Set([...US_ARVN_OPS, ...ARVN_EXCLUSIVE, 'pass', 'event']);
    for (const actionId of actions) {
      assert.ok(arvnAllowed.has(actionId), `Unexpected action '${actionId}' for ARVN player`);
    }
  });

  it('NVA player (seat 2) never sees US/ARVN/VC-exclusive actions', () => {
    setup();
    const state = withActivePlayer(baseState, NVA_SEAT);
    const stateWithResources: GameState = {
      ...state,
      globalVars: { ...state.globalVars, nvaResources: 5 },
    };
    const actions = uniqueActionIds(def, stateWithResources);

    assert.ok(actions.has('pass'), 'NVA should see pass');
    assert.ok(actions.has('nvaTransferResources'), 'NVA should see nvaTransferResources');

    // NVA must NOT see US/ARVN operations
    for (const op of US_ARVN_OPS) {
      assert.ok(!actions.has(op), `NVA must NOT see US/ARVN operation '${op}'`);
    }

    // NVA must NOT see other factions' exclusive actions
    for (const a of [...US_EXCLUSIVE, ...ARVN_EXCLUSIVE, ...VC_EXCLUSIVE]) {
      assert.ok(!actions.has(a), `NVA must NOT see '${a}'`);
    }

    // All returned actions must be from NVA-allowed set
    const nvaAllowed = new Set([...NVA_VC_OPS, ...NVA_EXCLUSIVE, 'pass', 'event']);
    for (const actionId of actions) {
      assert.ok(nvaAllowed.has(actionId), `Unexpected action '${actionId}' for NVA player`);
    }
  });

  it('VC player (seat 3) never sees US/ARVN/NVA-exclusive actions', () => {
    setup();
    const state = withActivePlayer(baseState, VC_SEAT);
    const stateWithResources: GameState = {
      ...state,
      globalVars: { ...state.globalVars, vcResources: 5 },
    };
    const actions = uniqueActionIds(def, stateWithResources);

    assert.ok(actions.has('pass'), 'VC should see pass');
    assert.ok(actions.has('vcTransferResources'), 'VC should see vcTransferResources');

    // VC must NOT see US/ARVN operations
    for (const op of US_ARVN_OPS) {
      assert.ok(!actions.has(op), `VC must NOT see US/ARVN operation '${op}'`);
    }

    // VC must NOT see other factions' exclusive actions
    for (const a of [...US_EXCLUSIVE, ...ARVN_EXCLUSIVE, ...NVA_EXCLUSIVE]) {
      assert.ok(!actions.has(a), `VC must NOT see '${a}'`);
    }

    // All returned actions must be from VC-allowed set
    const vcAllowed = new Set([...NVA_VC_OPS, ...VC_EXCLUSIVE, 'pass', 'event']);
    for (const actionId of actions) {
      assert.ok(vcAllowed.has(actionId), `Unexpected action '${actionId}' for VC player`);
    }
  });
});
