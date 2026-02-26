import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asActionId, asPlayerId, asTokenId, type GameDef, type GameState, type Token } from '../../src/kernel/index.js';
import { findDeep } from '../helpers/ast-search-helpers.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { applyMoveWithResolvedDecisionIds } from '../helpers/decision-param-helpers.js';
import { makeIsolatedInitialState } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

const SWEEP_SPACE = 'quang-tri-thua-thien:none';
const SWEEP_SPACE_2 = 'quang-nam:none';

const addToken = (state: GameState, zoneId: string, token: Token): GameState => ({
  ...state,
  zones: {
    ...state.zones,
    [zoneId]: [...(state.zones[zoneId] ?? []), token],
  },
});

const countFactionTokens = (state: GameState, zoneId: string, faction: string): number =>
  (state.zones[zoneId] ?? []).filter((token) => String(token.props.faction) === faction).length;

/**
 * Builds a clean state ready for Sweep with Booby Traps capability testing.
 * Places 2 troops of the acting faction + 1 underground VC guerrilla per space.
 */
const makeSweepReadyState = (
  def: GameDef,
  seed: number,
  options: {
    readonly faction: 'US' | 'ARVN';
    readonly marker: 'shaded' | 'inactive' | 'unshaded';
    readonly spaces?: readonly string[];
  },
): GameState => {
  const spaces = options.spaces ?? [SWEEP_SPACE];
  const start = makeIsolatedInitialState(def, seed, 4, { turnOrderMode: 'roundRobin' });

  const isUS = options.faction === 'US';
  const playerId = isUS ? asPlayerId(0) : asPlayerId(1);

  let state: GameState = {
    ...start,
    activePlayer: playerId,
    globalVars: {
      ...start.globalVars,
      ...(isUS ? {} : { arvnResources: 30 }),
    },
    globalMarkers: {
      ...start.globalMarkers,
      cap_boobyTraps: options.marker,
      cap_cobras: 'inactive',
      cap_caps: 'inactive',
    },
  };

  for (const space of spaces) {
    const suffix = space.split(':')[0];
    const troop1: Token = {
      id: asTokenId(`test-${options.faction.toLowerCase()}-t1-${suffix}-${seed}`),
      type: isUS ? 'us-troops' : 'arvn-troops',
      props: { faction: options.faction, type: 'troops' },
    };
    const troop2: Token = {
      id: asTokenId(`test-${options.faction.toLowerCase()}-t2-${suffix}-${seed}`),
      type: isUS ? 'us-troops' : 'arvn-troops',
      props: { faction: options.faction, type: 'troops' },
    };
    const guerrilla: Token = {
      id: asTokenId(`test-vc-g-${suffix}-${seed}`),
      type: 'vc-guerrillas',
      props: { faction: 'VC', type: 'guerrilla', activity: 'underground' },
    };
    state = addToken(addToken(addToken(state, space, troop1), space, troop2), space, guerrilla);
  }

  return state;
};

describe('FITL Booby Traps shaded sweep integration', () => {
  it('cap-sweep-booby-traps-shaded-cost macro has rollRandom with <= 3 dice gate', () => {
    const { parsed } = compileProductionSpec();
    assertNoErrors(parsed);

    const macrosById = new Map(
      (parsed.doc.effectMacros ?? []).map((macro: any) => [macro.id, macro]),
    );
    const macro = macrosById.get('cap-sweep-booby-traps-shaded-cost');
    assert.ok(macro, 'Expected cap-sweep-booby-traps-shaded-cost macro');

    const rollRandomNodes = findDeep(macro.effects, (node: any) => node?.rollRandom !== undefined);
    assert.ok(rollRandomNodes.length >= 1, 'Expected rollRandom in booby traps shaded macro');

    const diceGateNodes = findDeep(macro.effects, (node: any) =>
      node?.if?.when?.op === '<=' && node?.if?.when?.right === 3,
    );
    assert.ok(diceGateNodes.length >= 1, 'Expected <= 3 dice gate inside rollRandom');
  });

  it('shaded US sweep: hit (roll 1-3) sends troop to casualties, miss (roll 4-6) leaves troop', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    let hitSeed: number | null = null;
    let missSeed: number | null = null;

    for (let seed = 1; seed <= 128; seed += 1) {
      const state = makeSweepReadyState(def, seed, { faction: 'US', marker: 'shaded' });
      const result = applyMoveWithResolvedDecisionIds(def, state, {
        actionId: asActionId('sweep'),
        params: { targetSpaces: [SWEEP_SPACE] },
      });

      const usInCasualties = countFactionTokens(result.state, 'casualties-US:none', 'US');
      const usInSpace = countFactionTokens(result.state, SWEEP_SPACE, 'US');

      if (usInCasualties >= 1 && hitSeed === null) hitSeed = seed;
      if (usInCasualties === 0 && usInSpace === 2 && missSeed === null) missSeed = seed;
      if (hitSeed !== null && missSeed !== null) break;
    }

    assert.ok(hitSeed !== null, 'Expected at least one seed in [1..128] to produce a hit (roll 1-3)');
    assert.ok(missSeed !== null, 'Expected at least one seed in [1..128] to produce a miss (roll 4-6)');
  });

  it('shaded ARVN sweep: hit (roll 1-3) routes troop to available, miss (roll 4-6) leaves troop', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    let hitSeed: number | null = null;
    let missSeed: number | null = null;

    for (let seed = 1; seed <= 128; seed += 1) {
      const state = makeSweepReadyState(def, seed, { faction: 'ARVN', marker: 'shaded' });
      const result = applyMoveWithResolvedDecisionIds(def, state, {
        actionId: asActionId('sweep'),
        params: { targetSpaces: [SWEEP_SPACE] },
      });

      const arvnInAvailable = countFactionTokens(result.state, 'available-ARVN:none', 'ARVN');
      const arvnInSpace = countFactionTokens(result.state, SWEEP_SPACE, 'ARVN');

      if (arvnInAvailable >= 1 && hitSeed === null) hitSeed = seed;
      if (arvnInAvailable === 0 && arvnInSpace === 2 && missSeed === null) missSeed = seed;
      if (hitSeed !== null && missSeed !== null) break;
    }

    assert.ok(hitSeed !== null, 'Expected at least one seed in [1..128] to route ARVN troop to available');
    assert.ok(missSeed !== null, 'Expected at least one seed in [1..128] to miss and leave ARVN troops in place');
  });

  it('shaded marker: each sweep space gets an independent die roll', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    let foundMixed = false;

    for (let seed = 1; seed <= 128; seed += 1) {
      const state = makeSweepReadyState(def, seed, {
        faction: 'US',
        marker: 'shaded',
        spaces: [SWEEP_SPACE, SWEEP_SPACE_2],
      });
      const result = applyMoveWithResolvedDecisionIds(def, state, {
        actionId: asActionId('sweep'),
        params: { targetSpaces: [SWEEP_SPACE, SWEEP_SPACE_2] },
      });

      const space1Lost = countFactionTokens(result.state, SWEEP_SPACE, 'US') < 2;
      const space2Lost = countFactionTokens(result.state, SWEEP_SPACE_2, 'US') < 2;

      if (space1Lost !== space2Lost) {
        foundMixed = true;
        break;
      }
    }

    assert.ok(foundMixed, 'Expected at least one seed in [1..128] where one space hits and the other misses');
  });

  it('inactive marker: no troop removal regardless of seed', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    for (let seed = 1; seed <= 32; seed += 1) {
      const state = makeSweepReadyState(def, seed, { faction: 'US', marker: 'inactive' });
      const result = applyMoveWithResolvedDecisionIds(def, state, {
        actionId: asActionId('sweep'),
        params: { targetSpaces: [SWEEP_SPACE] },
      });

      const usInCasualties = countFactionTokens(result.state, 'casualties-US:none', 'US');
      assert.equal(usInCasualties, 0, `Seed ${seed}: inactive marker should never remove troops`);
    }
  });

  it('unshaded marker: no troop removal regardless of seed', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    for (let seed = 1; seed <= 32; seed += 1) {
      const state = makeSweepReadyState(def, seed, { faction: 'US', marker: 'unshaded' });
      const result = applyMoveWithResolvedDecisionIds(def, state, {
        actionId: asActionId('sweep'),
        params: { targetSpaces: [SWEEP_SPACE] },
      });

      const usInCasualties = countFactionTokens(result.state, 'casualties-US:none', 'US');
      assert.equal(usInCasualties, 0, `Seed ${seed}: unshaded marker should never remove troops`);
    }
  });
});

/* eslint-enable @typescript-eslint/no-explicit-any */
