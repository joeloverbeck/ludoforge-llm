import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asPlayerId,
  asTokenId,
  initialState,
  legalMoves,
  type GameDef,
  type GameState,
  type Token,
} from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import {
  applyMoveWithResolvedDecisionIds,
  type DecisionOverrideRule,
} from '../helpers/decision-param-helpers.js';

const makeToken = (id: string, type: string, faction: string): Token => ({
  id: asTokenId(id),
  type,
  props: { faction, type },
});

const compileDef = (): GameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assert.notEqual(compiled.gameDef, null);
  return compiled.gameDef!;
};

const setupLodgeState = (
  def: GameDef,
  overrides: {
    readonly patronage?: number;
    readonly zoneTokens?: Readonly<Record<string, readonly Token[]>>;
  },
): GameState => {
  const baseState = clearAllZones(initialState(def, 4001, 4).state);
  return {
    ...baseState,
    activePlayer: asPlayerId(0),
    turnOrderState: { type: 'roundRobin' },
    globalVars: {
      ...baseState.globalVars,
      patronage: overrides.patronage ?? 10,
    },
    zones: {
      ...baseState.zones,
      'played:none': [makeToken('card-79', 'card', 'none')],
      ...overrides.zoneTokens,
    },
  };
};

const findShadedMove = (def: GameDef, state: GameState) => {
  const eventMoves = legalMoves(def, state).filter((move) => String(move.actionId) === 'event');
  return eventMoves.find((move) => move.params.side === 'shaded');
};

describe('FITL card-79 Henry Cabot Lodge shaded — ARVN piece removal + patronage', () => {
  it('removes 2 ARVN pieces from the same space and increases patronage by 4', () => {
    const def = compileDef();
    const arvnTroop = makeToken('arvn-trp-0', 'troops', 'ARVN');
    const arvnPolice = makeToken('arvn-pol-0', 'police', 'ARVN');
    const state = setupLodgeState(def, {
      patronage: 10,
      zoneTokens: {
        'saigon:none': [arvnTroop, arvnPolice],
      },
    });
    const move = findShadedMove(def, state);
    assert.notEqual(move, undefined, 'Expected shaded event move');

    const overrides: DecisionOverrideRule[] = [
      {
        when: (req) => req.decisionId.includes('arvnPiecesToRemove') || req.name === '$arvnPiecesToRemove',
        value: [arvnTroop.id, arvnPolice.id],
      },
    ];
    const result = applyMoveWithResolvedDecisionIds(def, state, move!, { overrides });
    assert.equal(result.state.globalVars['patronage'], 14, 'Patronage should increase by 4 (2 pieces * 2)');
    assert.equal(
      (result.state.zones['saigon:none'] ?? []).filter((t) => t.props['faction'] === 'ARVN').length,
      0,
      'Both ARVN pieces should be removed from Saigon',
    );
    const availableArvn = result.state.zones['available-ARVN:none'] ?? [];
    assert.equal(
      availableArvn.some((t) => t.id === arvnTroop.id),
      true,
      'ARVN troop should be in available',
    );
    assert.equal(
      availableArvn.some((t) => t.id === arvnPolice.id),
      true,
      'ARVN police should be in available',
    );
  });

  it('removes 0 pieces when player chooses none — patronage unchanged', () => {
    const def = compileDef();
    const arvnTroop = makeToken('arvn-trp-0', 'troops', 'ARVN');
    const state = setupLodgeState(def, {
      patronage: 10,
      zoneTokens: {
        'saigon:none': [arvnTroop],
      },
    });
    const move = findShadedMove(def, state);
    assert.notEqual(move, undefined, 'Expected shaded event move');

    const overrides: DecisionOverrideRule[] = [
      {
        when: (req) => req.decisionId.includes('arvnPiecesToRemove') || req.name === '$arvnPiecesToRemove',
        value: [],
      },
    ];
    const result = applyMoveWithResolvedDecisionIds(def, state, move!, { overrides });
    assert.equal(result.state.globalVars['patronage'], 10, 'Patronage should be unchanged');
    assert.equal(
      (result.state.zones['saigon:none'] ?? []).some((t) => t.id === arvnTroop.id),
      true,
      'ARVN troop should remain in Saigon',
    );
  });

  it('removes pieces from different spaces and increases patronage by 6', () => {
    const def = compileDef();
    const arvnTroop = makeToken('arvn-trp-0', 'troops', 'ARVN');
    const arvnRanger = makeToken('arvn-rng-0', 'ranger', 'ARVN');
    const arvnBase = makeToken('arvn-base-0', 'base', 'ARVN');
    const state = setupLodgeState(def, {
      patronage: 10,
      zoneTokens: {
        'saigon:none': [arvnTroop],
        'hue:none': [arvnRanger],
        'qui-nhon:none': [arvnBase],
      },
    });
    const move = findShadedMove(def, state);
    assert.notEqual(move, undefined, 'Expected shaded event move');

    const overrides: DecisionOverrideRule[] = [
      {
        when: (req) => req.decisionId.includes('arvnPiecesToRemove') || req.name === '$arvnPiecesToRemove',
        value: [arvnTroop.id, arvnRanger.id, arvnBase.id],
      },
    ];
    const result = applyMoveWithResolvedDecisionIds(def, state, move!, { overrides });
    assert.equal(result.state.globalVars['patronage'], 16, 'Patronage should increase by 6 (3 pieces * 2)');
    assert.equal(
      (result.state.zones['saigon:none'] ?? []).filter((t) => t.props['faction'] === 'ARVN').length,
      0,
      'No ARVN pieces should remain in Saigon',
    );
    assert.equal(
      (result.state.zones['hue:none'] ?? []).filter((t) => t.props['faction'] === 'ARVN').length,
      0,
      'No ARVN pieces should remain in Hue',
    );
    assert.equal(
      (result.state.zones['qui-nhon:none'] ?? []).filter((t) => t.props['faction'] === 'ARVN').length,
      0,
      'No ARVN pieces should remain in Qui Nhon',
    );
    const availableArvn = result.state.zones['available-ARVN:none'] ?? [];
    assert.equal(availableArvn.length >= 3, true, 'All 3 ARVN pieces should be in available');
  });

  it('bases are selectable — removes ARVN base and increases patronage by 2', () => {
    const def = compileDef();
    const arvnBase = makeToken('arvn-base-0', 'base', 'ARVN');
    const state = setupLodgeState(def, {
      patronage: 10,
      zoneTokens: {
        'saigon:none': [arvnBase],
      },
    });
    const move = findShadedMove(def, state);
    assert.notEqual(move, undefined, 'Expected shaded event move');

    const overrides: DecisionOverrideRule[] = [
      {
        when: (req) => req.decisionId.includes('arvnPiecesToRemove') || req.name === '$arvnPiecesToRemove',
        value: [arvnBase.id],
      },
    ];
    const result = applyMoveWithResolvedDecisionIds(def, state, move!, { overrides });
    assert.equal(result.state.globalVars['patronage'], 12, 'Patronage should increase by 2 (1 base * 2)');
    assert.equal(
      (result.state.zones['saigon:none'] ?? []).filter((t) => t.props['faction'] === 'ARVN').length,
      0,
      'ARVN base should be removed from Saigon',
    );
    const availableArvn = result.state.zones['available-ARVN:none'] ?? [];
    assert.equal(
      availableArvn.some((t) => t.id === arvnBase.id),
      true,
      'ARVN base should be in available',
    );
  });
});
