import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asActionId, asPlayerId, asTokenId, type GameState } from '../../src/kernel/index.js';
import { applyMoveWithResolvedDecisionIds } from '../helpers/decision-param-helpers.js';
import { makeIsolatedInitialState } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const SWEEP_SPACES = ['hue:none', 'quang-nam:none', 'quang-tin-quang-ngai:none'] as const;
const ASSAULT_SPACES = ['hue:none', 'quang-nam:none', 'quang-tin-quang-ngai:none'] as const;

const withArvnSweepState = (state: GameState, arvnResources: number): GameState => ({
  ...state,
  activePlayer: asPlayerId(1),
  globalVars: {
    ...state.globalVars,
    arvnResources,
  },
});

const withArvnAssaultState = (
  state: GameState,
  options: { arvnResources: number; bodyCount?: boolean; abrams?: 'unshaded' | 'shaded' },
): GameState => ({
  ...state,
  activePlayer: asPlayerId(1),
  globalVars: {
    ...state.globalVars,
    arvnResources: options.arvnResources,
    mom_bodyCount: options.bodyCount ?? false,
  },
  globalMarkers: {
    ...state.globalMarkers,
    ...(options.abrams === undefined ? {} : { cap_abrams: options.abrams }),
  },
  zones: {
    ...state.zones,
    [ASSAULT_SPACES[0]]: [
      { id: asTokenId('arvn-assault-a-t'), type: 'troops', props: { faction: 'ARVN', type: 'troops' } },
      { id: asTokenId('arvn-assault-a-e'), type: 'guerrilla', props: { faction: 'NVA', type: 'guerrilla', activity: 'active' } },
    ],
    [ASSAULT_SPACES[1]]: [
      { id: asTokenId('arvn-assault-b-t'), type: 'troops', props: { faction: 'ARVN', type: 'troops' } },
      { id: asTokenId('arvn-assault-b-e'), type: 'guerrilla', props: { faction: 'VC', type: 'guerrilla', activity: 'active' } },
    ],
    [ASSAULT_SPACES[2]]: [
      { id: asTokenId('arvn-assault-c-t'), type: 'troops', props: { faction: 'ARVN', type: 'troops' } },
      { id: asTokenId('arvn-assault-c-e'), type: 'guerrilla', props: { faction: 'NVA', type: 'guerrilla', activity: 'active' } },
    ],
  },
});

describe('FITL ARVN Sweep/Assault affordability', () => {
  it('clamps ARVN Sweep target-space selection to floorDiv(arvnResources, 3)', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const base = withArvnSweepState(makeIsolatedInitialState(def, 2101, 2), 3);
    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, base, {
          actionId: asActionId('sweep'),
          params: { targetSpaces: [SWEEP_SPACES[0], SWEEP_SPACES[1]] },
        }),
      /(?:Illegal move|choiceRuntimeValidationFailed|outside options domain)/,
    );

    const twoSpace = withArvnSweepState(makeIsolatedInitialState(def, 2102, 2), 6);
    const twoBefore = Number(twoSpace.globalVars.arvnResources);
    const twoResult = applyMoveWithResolvedDecisionIds(def, twoSpace, {
      actionId: asActionId('sweep'),
      params: { targetSpaces: [SWEEP_SPACES[0], SWEEP_SPACES[1]] },
    }).state;
    assert.equal(twoResult.globalVars.arvnResources, twoBefore - 6, 'Sweep should spend 3 per selected space (2 spaces)');

    const threeSpace = withArvnSweepState(makeIsolatedInitialState(def, 2103, 2), 9);
    const threeBefore = Number(threeSpace.globalVars.arvnResources);
    const threeResult = applyMoveWithResolvedDecisionIds(def, threeSpace, {
      actionId: asActionId('sweep'),
      params: { targetSpaces: [SWEEP_SPACES[0], SWEEP_SPACES[1], SWEEP_SPACES[2]] },
    }).state;
    assert.equal(threeResult.globalVars.arvnResources, threeBefore - 9, 'Sweep should spend 3 per selected space (3 spaces)');
  });

  it('clamps ARVN Assault target-space selection by affordability when Body Count is false', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const state = withArvnAssaultState(makeIsolatedInitialState(def, 2201, 2), { arvnResources: 6, bodyCount: false });
    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, state, {
          actionId: asActionId('assault'),
          params: { targetSpaces: [ASSAULT_SPACES[0], ASSAULT_SPACES[1], ASSAULT_SPACES[2]] },
        }),
      /(?:Illegal move|choiceRuntimeValidationFailed|outside options domain)/,
    );
  });

  it('lets ARVN Assault bypass affordability cap under Body Count', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const state = withArvnAssaultState(makeIsolatedInitialState(def, 2202, 2), { arvnResources: 0, bodyCount: true });
    const before = Number(state.globalVars.arvnResources);
    const result = applyMoveWithResolvedDecisionIds(def, state, {
      actionId: asActionId('assault'),
      params: { targetSpaces: [ASSAULT_SPACES[0], ASSAULT_SPACES[1], ASSAULT_SPACES[2]] },
    }).state;
    assert.equal(result.globalVars.arvnResources, before, 'Body Count ARVN Assault should not spend ARVN resources');
  });

  it('composes capability caps with affordability for ARVN Sweep/Assault', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const sweepBase = withArvnSweepState(makeIsolatedInitialState(def, 2301, 2), 3);
    const sweepCapped = {
      ...sweepBase,
      globalMarkers: {
        ...sweepBase.globalMarkers,
        cap_caps: 'shaded' as const,
      },
    };
    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, sweepCapped, {
          actionId: asActionId('sweep'),
          params: { targetSpaces: [SWEEP_SPACES[0], SWEEP_SPACES[1]] },
        }),
      /(?:Illegal move|choiceRuntimeValidationFailed|outside options domain)/,
      'With cap_caps shaded and 3 resources, Sweep should cap at 1 space',
    );

    const assaultCapTwo = withArvnAssaultState(makeIsolatedInitialState(def, 2302, 2), {
      arvnResources: 9,
      bodyCount: false,
      abrams: 'shaded',
    });
    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, assaultCapTwo, {
          actionId: asActionId('assault'),
          params: { targetSpaces: [ASSAULT_SPACES[0], ASSAULT_SPACES[1], ASSAULT_SPACES[2]] },
        }),
      /(?:Illegal move|choiceRuntimeValidationFailed|outside options domain)/,
      'With cap_abrams shaded and sufficient resources, Assault should still cap at 2 spaces',
    );

    const assaultCapOne = withArvnAssaultState(makeIsolatedInitialState(def, 2303, 2), {
      arvnResources: 3,
      bodyCount: false,
      abrams: 'shaded',
    });
    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, assaultCapOne, {
          actionId: asActionId('assault'),
          params: { targetSpaces: [ASSAULT_SPACES[0], ASSAULT_SPACES[1]] },
        }),
      /(?:Illegal move|choiceRuntimeValidationFailed|outside options domain)/,
      'With cap_abrams shaded and 3 resources, Assault should cap at 1 space via min(2, affordability)',
    );
  });
});
