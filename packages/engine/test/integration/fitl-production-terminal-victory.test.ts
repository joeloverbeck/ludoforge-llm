import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asTokenId, initialState, terminalResult, type GameDef, type GameState } from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const compileProductionDef = (): GameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assert.equal(compiled.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
  assert.notEqual(compiled.gameDef, null);
  return compiled.gameDef!;
};

const withClearedZones = (state: GameState): GameState => ({
  ...state,
  zones: Object.fromEntries(Object.keys(state.zones).map((zoneId) => [zoneId, []])),
});

describe('FITL production terminal victory', () => {
  it('compiles production terminal with checkpoint, margin, and ranking metadata', () => {
    const def = compileProductionDef();
    assert.equal(def.terminal.checkpoints?.length, 5);
    assert.equal(def.terminal.margins?.length, 4);
    assert.deepEqual(def.terminal.ranking, {
      order: 'desc',
      tieBreakOrder: ['VC', 'ARVN', 'NVA', 'US'],
    });
  });

  it('does not auto-terminal at initial production state', () => {
    const def = compileProductionDef();
    const start = initialState(def, 7101, 4).state;
    assert.equal(terminalResult(def, start), null);
  });

  it('does not resolve during-coup victory when score equals threshold', () => {
    const def = compileProductionDef();
    const start = withClearedZones(initialState(def, 7102, 4).state);
    const usReserve = Array.from({ length: 50 }, (_unused, index) => ({
      id: asTokenId(`us-reserve-${index}`),
      type: 'piece',
      props: { faction: 'US', type: 'troops' as const },
    }));
    const state: GameState = {
      ...start,
      globalVars: {
        ...start.globalVars,
        patronage: 0,
      },
      markers: {},
      zones: {
        ...start.zones,
        'played:none': [{ id: asTokenId('coup-during'), type: 'card', props: { isCoup: true } }],
        'lookahead:none': [{ id: asTokenId('non-coup-lookahead'), type: 'card', props: { isCoup: false } }],
        'available-US:none': usReserve,
      },
    };

    assert.equal(terminalResult(def, state), null);
  });

  it('resolves during-coup threshold wins from production terminal formulas when score exceeds threshold', () => {
    const def = compileProductionDef();
    const start = withClearedZones(initialState(def, 7103, 4).state);
    const usReserve = Array.from({ length: 51 }, (_unused, index) => ({
      id: asTokenId(`us-reserve-${index}`),
      type: 'piece',
      props: { faction: 'US', type: 'troops' as const },
    }));
    const state: GameState = {
      ...start,
      globalVars: {
        ...start.globalVars,
        patronage: 0,
      },
      markers: {},
      zones: {
        ...start.zones,
        'played:none': [{ id: asTokenId('coup-during'), type: 'card', props: { isCoup: true } }],
        'lookahead:none': [{ id: asTokenId('non-coup-lookahead'), type: 'card', props: { isCoup: false } }],
        'available-US:none': usReserve,
      },
    };

    assert.deepEqual(terminalResult(def, state), {
      type: 'win',
      player: 0,
      victory: {
        timing: 'duringCoup',
        checkpointId: 'us-victory',
        winnerSeat: 'US',
        ranking: [
          { seat: 'US', margin: 1, rank: 1, tieBreakKey: 'US' },
          { seat: 'NVA', margin: -18, rank: 2, tieBreakKey: 'NVA' },
          { seat: 'VC', margin: -35, rank: 3, tieBreakKey: 'VC' },
          { seat: 'ARVN', margin: -50, rank: 4, tieBreakKey: 'ARVN' },
        ],
      },
    });
  });

  it('uses configured final-coup tie-break precedence when margins tie', () => {
    const def = compileProductionDef();
    const start = withClearedZones(initialState(def, 7104, 4).state);
    const state: GameState = {
      ...start,
      globalVars: {
        ...start.globalVars,
        patronage: 0,
      },
      markers: {},
      zones: {
        ...start.zones,
        'played:none': [{ id: asTokenId('coup-final'), type: 'card', props: { isCoup: true } }],
        'lookahead:none': [],
        'deck:none': [],
      },
    };

    assert.deepEqual(terminalResult(def, state), {
      type: 'win',
      player: 3,
      victory: {
        timing: 'finalCoup',
        checkpointId: 'final-coup-ranking',
        winnerSeat: 'NVA',
        ranking: [
          { seat: 'NVA', margin: -18, rank: 1, tieBreakKey: 'NVA' },
          { seat: 'VC', margin: -35, rank: 2, tieBreakKey: 'VC' },
          { seat: 'ARVN', margin: -50, rank: 3, tieBreakKey: 'ARVN' },
          { seat: 'US', margin: -50, rank: 4, tieBreakKey: 'US' },
        ],
      },
    });
  });
});
