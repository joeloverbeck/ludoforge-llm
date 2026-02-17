import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  asPhaseId,
  asTokenId,
  asZoneId,
  initialState,
  type GameDef,
  type GameState,
  type Token,
} from '../../src/kernel/index.js';
import { clearAllZones, makeIsolatedInitialState } from '../helpers/isolated-state-helpers.js';

const createCardDrivenDef = (): GameDef =>
  ({
    metadata: { id: 'isolated-state-helper-test', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [
      { id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set' },
      { id: asZoneId('played:none'), owner: 'none', visibility: 'public', ordering: 'queue' },
      { id: asZoneId('lookahead:none'), owner: 'none', visibility: 'public', ordering: 'queue' },
      { id: asZoneId('leader:none'), owner: 'none', visibility: 'public', ordering: 'queue' },
    ],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    turnOrder: {
      type: 'cardDriven',
      config: {
        turnFlow: {
          cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
          eligibility: { factions: ['0', '1'], overrideWindows: [] },
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
        limits: [],
      },
    ],
    triggers: [],
    terminal: { conditions: [] },
  }) as unknown as GameDef;

const token = (id: string, faction: string, type: string): Token => ({
  id: asTokenId(id),
  type,
  props: { faction, type },
});

describe('isolated state helpers', () => {
  it('clearAllZones removes all zone tokens deterministically', () => {
    const def = createCardDrivenDef();
    const base = initialState(def, 5, 2);
    const seeded: GameState = {
      ...base,
      zones: {
        ...base.zones,
        'board:none': [token('u1', 'US', 'troops')],
        'played:none': [token('c1', 'none', 'card')],
      },
    };

    const first = clearAllZones(seeded);
    const second = clearAllZones(seeded);

    assert.deepEqual(first, second);
    for (const zoneTokens of Object.values(first.zones)) {
      assert.equal(zoneTokens.length, 0);
    }
  });

  it('makeIsolatedInitialState preserves or overrides turn order mode', () => {
    const def = createCardDrivenDef();

    const preserved = makeIsolatedInitialState(def, 9, 2, { turnOrderMode: 'preserve' });
    const forcedRoundRobin = makeIsolatedInitialState(def, 9, 2, { turnOrderMode: 'roundRobin' });

    assert.equal(preserved.turnOrderState.type, 'cardDriven');
    assert.equal(forcedRoundRobin.turnOrderState.type, 'roundRobin');
  });
});
