// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createPolicyRuntimeProviders } from '../../../src/agents/policy-runtime.js';
import { asPlayerId, initialState, type AgentPolicyCatalog, type GameDef, type GameState } from '../../../src/kernel/index.js';
import { compileProductionSpec } from '../../helpers/production-spec-helpers.js';

function createProviders(
  def: GameDef,
  state: GameState,
  seatId: string,
  catalog: AgentPolicyCatalog,
) {
  const seatIndex = def.seats?.findIndex((seat) => seat.id === seatId) ?? -1;
  assert.notEqual(seatIndex, -1, `Expected seat ${seatId} in compiled FITL seat list`);

  return createPolicyRuntimeProviders({
    def,
    state,
    playerId: asPlayerId(seatIndex),
    seatId,
    trustedMoveIndex: new Map(),
    catalog,
    runtimeError: (code, message) => new Error(`${code}: ${message}`),
  });
}

describe('FITL globalMarker policy surface integration', () => {
  it('compiles production FITL catalogs with globalMarkers entries', () => {
    const compiled = compileProductionSpec().compiled.gameDef;
    const agents = compiled.agents;
    const observers = compiled.observers;

    assert.ok(agents, 'Expected compiled FITL agents catalog');
    assert.ok(observers, 'Expected compiled FITL observer catalog');
    assert.ok(agents.surfaceVisibility.globalMarkers['cap_boobyTraps'], 'Expected agent surface visibility for cap_boobyTraps');
    assert.equal(agents.surfaceVisibility.globalMarkers['cap_boobyTraps']!.current, 'public');
    assert.equal(observers.observers['currentPlayer']!.surfaces.globalMarkers['cap_boobyTraps']!.current, 'public');
  });

  it('resolves globalMarker.cap_boobyTraps from explicit state and lattice defaults', () => {
    const def = compileProductionSpec().compiled.gameDef;
    const catalog = def.agents;

    assert.ok(catalog, 'Expected compiled FITL agents catalog');
    assert.ok(def.globalMarkerLattices?.some((lattice) => lattice.id === 'cap_boobyTraps'), 'Expected FITL cap_boobyTraps lattice');

    const baseState = initialState(def, 7, 4).state;
    const shadedState: GameState = {
      ...baseState,
      globalMarkers: {
        ...(baseState.globalMarkers ?? {}),
        cap_boobyTraps: 'shaded',
      },
    };
    const shadedProviders = createProviders(def, shadedState, 'us', catalog);

    const explicit = shadedProviders.currentSurface.resolveSurface({
      kind: 'currentSurface',
      family: 'globalMarker',
      id: 'cap_boobyTraps',
    });
    assert.equal(explicit, 'shaded');

    const unsetState: GameState = {
      ...baseState,
      globalMarkers: {},
    };
    const defaultProviders = createProviders(def, unsetState, 'us', catalog);
    const defaultState = defaultProviders.currentSurface.resolveSurface({
      kind: 'currentSurface',
      family: 'globalMarker',
      id: 'cap_boobyTraps',
    });
    assert.equal(defaultState, 'inactive');
  });
});
