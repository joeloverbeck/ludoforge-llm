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

const setupBrinksState = (
  def: GameDef,
  overrides: {
    readonly activeLeader?: string;
    readonly leaderFlipped?: string;
    readonly aid?: number;
    readonly patronage?: number;
    readonly terrorSabotageMarkersPlaced?: number;
    readonly zoneTokens?: Readonly<Record<string, readonly Token[]>>;
    readonly markers?: Readonly<Record<string, Readonly<Record<string, string>>>>;
    readonly zoneVars?: Readonly<Record<string, Readonly<Record<string, number>>>>;
  },
): GameState => {
  const eventDeck = def.eventDecks?.[0];
  assert.notEqual(eventDeck, undefined, 'Expected at least one event deck');
  const baseState = clearAllZones(initialState(def, 3001, 4).state);
  return {
    ...baseState,
    activePlayer: asPlayerId(0),
    turnOrderState: { type: 'roundRobin' },
    globalVars: {
      ...baseState.globalVars,
      aid: overrides.aid ?? 10,
      patronage: overrides.patronage ?? 15,
      terrorSabotageMarkersPlaced: overrides.terrorSabotageMarkersPlaced ?? 0,
    },
    globalMarkers: {
      ...baseState.globalMarkers,
      activeLeader: overrides.activeLeader ?? 'khanh',
      leaderFlipped: overrides.leaderFlipped ?? 'normal',
    },
    markers: {
      ...baseState.markers,
      ...overrides.markers,
    },
    zoneVars: {
      ...baseState.zoneVars,
      ...overrides.zoneVars,
    },
    zones: {
      ...baseState.zones,
      [eventDeck!.discardZone]: [makeToken('card-97', 'card', 'none')],
      ...overrides.zoneTokens,
    },
  };
};

const findUnshadedBranch = (def: GameDef, state: GameState, branchId: string) => {
  const eventMoves = legalMoves(def, state).filter((move) => String(move.actionId) === 'event');
  return eventMoves.find(
    (move) => move.params.side === 'unshaded' && move.params.branch === branchId,
  );
};

const findShadedMove = (def: GameDef, state: GameState) => {
  const eventMoves = legalMoves(def, state).filter((move) => String(move.actionId) === 'event');
  return eventMoves.find((move) => move.params.side === 'shaded');
};

describe('FITL card-97 Brinks Hotel unshaded — leader flip + aid/patronage', () => {
  it('aid+10 branch flips leader when activeLeader is khanh', () => {
    const def = compileDef();
    const state = setupBrinksState(def, { activeLeader: 'khanh', aid: 10 });
    const move = findUnshadedBranch(def, state, 'aid-plus-ten-and-flip-leader');
    assert.notEqual(move, undefined, 'Expected aid+10 branch move');

    const result = applyMoveWithResolvedDecisionIds(def, state, move!);
    assert.equal(result.state.globalVars['aid'], 20, 'Aid should increase by 10');
    assert.equal(
      result.state.globalMarkers?.['leaderFlipped'],
      'flipped',
      'Leader should be flipped when activeLeader is khanh',
    );
  });

  it('aid+10 branch does NOT flip leader when activeLeader is minh', () => {
    const def = compileDef();
    const state = setupBrinksState(def, { activeLeader: 'minh', aid: 5 });
    const move = findUnshadedBranch(def, state, 'aid-plus-ten-and-flip-leader');
    assert.notEqual(move, undefined, 'Expected aid+10 branch move');

    const result = applyMoveWithResolvedDecisionIds(def, state, move!);
    assert.equal(result.state.globalVars['aid'], 15, 'Aid should increase by 10');
    assert.equal(
      result.state.globalMarkers?.['leaderFlipped'],
      'normal',
      'Leader should remain normal when activeLeader is minh (Duong Van Minh is not a card)',
    );
  });

  it('patronage transfer branch transfers exactly 4 when patronage >= 4', () => {
    const def = compileDef();
    const state = setupBrinksState(def, { activeLeader: 'khanh', aid: 10, patronage: 15 });
    const move = findUnshadedBranch(def, state, 'transfer-patronage-to-aid-and-flip-leader');
    assert.notEqual(move, undefined, 'Expected patronage transfer branch move');

    const result = applyMoveWithResolvedDecisionIds(def, state, move!);
    assert.equal(result.state.globalVars['patronage'], 11, 'Patronage should decrease by 4');
    assert.equal(result.state.globalVars['aid'], 14, 'Aid should increase by 4');
    assert.equal(
      result.state.globalMarkers?.['leaderFlipped'],
      'flipped',
      'Leader should be flipped when activeLeader is khanh',
    );
  });

  it('patronage transfer branch transfers available patronage when < 4', () => {
    const def = compileDef();
    const state = setupBrinksState(def, { activeLeader: 'ky', aid: 10, patronage: 2 });
    const move = findUnshadedBranch(def, state, 'transfer-patronage-to-aid-and-flip-leader');
    assert.notEqual(move, undefined, 'Expected patronage transfer branch move');

    const result = applyMoveWithResolvedDecisionIds(def, state, move!);
    assert.equal(result.state.globalVars['patronage'], 0, 'Patronage should be fully consumed');
    assert.equal(result.state.globalVars['aid'], 12, 'Aid should increase by 2 (all available patronage)');
    assert.equal(
      result.state.globalMarkers?.['leaderFlipped'],
      'flipped',
      'Leader should be flipped when activeLeader is ky',
    );
  });
});

describe('FITL card-97 Brinks Hotel shaded — VC city shift + terror', () => {
  it('shifts city with VC by 2 toward Active Opposition', () => {
    const def = compileDef();
    const state = setupBrinksState(def, {
      zoneTokens: {
        'saigon:none': [makeToken('vc-g-0', 'guerrilla', 'VC')],
      },
      markers: {
        'saigon:none': { supportOpposition: 'passiveSupport' },
      },
    });
    const move = findShadedMove(def, state);
    assert.notEqual(move, undefined, 'Expected shaded event move');

    const overrides: DecisionOverrideRule[] = [
      {
        when: (req) => req.decisionId.includes('targetCity') || req.name === '$targetCity',
        value: 'saigon:none',
      },
    ];
    const result = applyMoveWithResolvedDecisionIds(def, state, move!, { overrides });
    assert.equal(
      result.state.markers['saigon:none']?.['supportOpposition'],
      'passiveOpposition',
      'Support should shift by 2 from passiveSupport → passiveOpposition',
    );
  });

  it('places terror marker (terrorCount incremented) on target city', () => {
    const def = compileDef();
    const state = setupBrinksState(def, {
      zoneTokens: {
        'saigon:none': [makeToken('vc-g-0', 'guerrilla', 'VC')],
      },
      markers: {
        'saigon:none': { supportOpposition: 'neutral' },
      },
    });
    const move = findShadedMove(def, state);
    assert.notEqual(move, undefined, 'Expected shaded event move');

    const overrides: DecisionOverrideRule[] = [
      {
        when: (req) => req.decisionId.includes('targetCity') || req.name === '$targetCity',
        value: 'saigon:none',
      },
    ];
    const result = applyMoveWithResolvedDecisionIds(def, state, move!, { overrides });
    assert.equal(
      result.state.zoneVars?.['saigon:none']?.['terrorCount'],
      1,
      'Terror count should be 1 after placing terror marker',
    );
  });

  it('stacks terror — increments existing terrorCount > 0', () => {
    const def = compileDef();
    const baseZoneVars = clearAllZones(initialState(def, 3001, 4).state).zoneVars ?? {};
    const state = setupBrinksState(def, {
      zoneTokens: {
        'saigon:none': [makeToken('vc-g-0', 'guerrilla', 'VC')],
      },
      markers: {
        'saigon:none': { supportOpposition: 'neutral' },
      },
      zoneVars: {
        ...baseZoneVars,
        'saigon:none': {
          ...(baseZoneVars['saigon:none'] ?? {}),
          terrorCount: 2,
        },
      },
    });
    const move = findShadedMove(def, state);
    assert.notEqual(move, undefined, 'Expected shaded event move');

    const overrides: DecisionOverrideRule[] = [
      {
        when: (req) => req.decisionId.includes('targetCity') || req.name === '$targetCity',
        value: 'saigon:none',
      },
    ];
    const result = applyMoveWithResolvedDecisionIds(def, state, move!, { overrides });
    assert.equal(
      result.state.zoneVars?.['saigon:none']?.['terrorCount'],
      3,
      'Terror count should stack: 2 + 1 = 3',
    );
  });

  it('increments global terrorSabotageMarkersPlaced counter', () => {
    const def = compileDef();
    const state = setupBrinksState(def, {
      terrorSabotageMarkersPlaced: 5,
      zoneTokens: {
        'saigon:none': [makeToken('vc-g-0', 'guerrilla', 'VC')],
      },
      markers: {
        'saigon:none': { supportOpposition: 'neutral' },
      },
    });
    const move = findShadedMove(def, state);
    assert.notEqual(move, undefined, 'Expected shaded event move');

    const overrides: DecisionOverrideRule[] = [
      {
        when: (req) => req.decisionId.includes('targetCity') || req.name === '$targetCity',
        value: 'saigon:none',
      },
    ];
    const result = applyMoveWithResolvedDecisionIds(def, state, move!, { overrides });
    assert.equal(
      result.state.globalVars['terrorSabotageMarkersPlaced'],
      6,
      'Global terror counter should increment: 5 + 1 = 6',
    );
  });

  it('only targets cities with VC presence (skips cities without VC)', () => {
    const def = compileDef();
    const state = setupBrinksState(def, {
      zoneTokens: {
        'saigon:none': [makeToken('us-trp-0', 'troops', 'US')],
        'hue:none': [makeToken('vc-g-0', 'guerrilla', 'VC')],
      },
      markers: {
        'saigon:none': { supportOpposition: 'passiveSupport' },
        'hue:none': { supportOpposition: 'passiveSupport' },
      },
    });
    const move = findShadedMove(def, state);
    assert.notEqual(move, undefined, 'Expected shaded event move');

    const result = applyMoveWithResolvedDecisionIds(def, state, move!);
    assert.equal(
      result.state.markers['saigon:none']?.['supportOpposition'],
      'passiveSupport',
      'Saigon should be unaffected (no VC)',
    );
    assert.equal(
      result.state.markers['hue:none']?.['supportOpposition'],
      'passiveOpposition',
      'Hue should shift by 2 (has VC)',
    );
    assert.equal(
      result.state.zoneVars?.['hue:none']?.['terrorCount'],
      1,
      'Terror placed on Hue (the eligible city)',
    );
  });
});
