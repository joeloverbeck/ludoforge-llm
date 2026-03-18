import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  compileFitlDef,
  createPlaybookBaseState,
  engineerScenarioState,
} from '../../e2e/mcts-fitl/fitl-mcts-test-helpers.js';

describe('fitl engineerScenarioState', () => {
  it('applies a global var override without mutating the base state', () => {
    const def = compileFitlDef();
    const baseState = createPlaybookBaseState(def);

    const engineered = engineerScenarioState(baseState, {
      globalVars: { nvaResources: 0 },
    });

    assert.equal(engineered.globalVars.nvaResources, 0);
    assert.notEqual(baseState.globalVars.nvaResources, 0);
  });

  it('replaces a target zone token stack exactly', () => {
    const def = compileFitlDef();
    const baseState = createPlaybookBaseState(def);
    const targetZoneId = 'saigon:none';
    const originalTokens = baseState.zones[targetZoneId] ?? [];
    const replacement = originalTokens.slice(0, 1);

    const engineered = engineerScenarioState(baseState, {
      zones: { [targetZoneId]: replacement },
    });

    assert.deepEqual(engineered.zones[targetZoneId], replacement);
    assert.deepEqual(baseState.zones[targetZoneId], originalTokens);
  });

  it('applies marker overrides on top of existing marker branches', () => {
    const def = compileFitlDef();
    const baseState = createPlaybookBaseState(def);

    const engineered = engineerScenarioState(baseState, {
      markers: {
        'saigon:none': { supportOpposition: 'activeSupport' },
      },
    });

    assert.equal(engineered.markers['saigon:none']?.supportOpposition, 'activeSupport');
    assert.equal(baseState.markers['saigon:none']?.supportOpposition, 'passiveSupport');
  });

  it('applies global marker overrides without mutating the original branch', () => {
    const def = compileFitlDef();
    const baseState = createPlaybookBaseState(def);

    const engineered = engineerScenarioState(baseState, {
      globalMarkers: { scenarioWindow: 'monsoon' },
    });

    assert.equal(engineered.globalMarkers?.scenarioWindow, 'monsoon');
    assert.equal(baseState.globalMarkers?.scenarioWindow, undefined);
  });

  it('applies combined override branches together while preserving untouched references', () => {
    const def = compileFitlDef();
    const baseState = createPlaybookBaseState(def);

    const engineered = engineerScenarioState(baseState, {
      globalVars: { trail: 4 },
      zoneVars: { 'saigon:none': { terrorCount: 2 } },
      markers: { 'saigon:none': { supportOpposition: 'activeOpposition' } },
    });

    assert.equal(engineered.globalVars.trail, 4);
    assert.equal(engineered.zoneVars['saigon:none']?.terrorCount, 2);
    assert.equal(engineered.markers['saigon:none']?.supportOpposition, 'activeOpposition');
    assert.strictEqual(engineered.zones['hue:none'], baseState.zones['hue:none']);
    assert.notEqual(baseState.globalVars.trail, 4);
    assert.notEqual(baseState.zoneVars['saigon:none']?.terrorCount, 2);
    assert.notEqual(baseState.markers['saigon:none']?.supportOpposition, 'activeOpposition');
  });
});
