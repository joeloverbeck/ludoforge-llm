import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { MctsBudgetProfile } from '../../../src/agents/index.js';

import { budgetRank } from './fitl-competence-evaluators.js';
import {
  compileFitlDef,
  createPlaybookBaseState,
  engineerScenarioState,
} from './fitl-mcts-test-helpers.js';

describe('FITL competence framework types', () => {
  it('engineerScenarioState applies overrides immutably and preserves untouched branches', () => {
    const def = compileFitlDef();
    const baseState = createPlaybookBaseState(def);

    const zoneEntries = Object.entries(baseState.zones);
    const overriddenZoneId = zoneEntries.find(([, tokens]) => tokens.length > 0)?.[0] ?? zoneEntries[0]?.[0];
    if (overriddenZoneId === undefined) {
      throw new Error('expected at least one zone in the base state');
    }
    const untouchedZoneId = zoneEntries.find(([zoneId]) => zoneId !== overriddenZoneId)?.[0] ?? overriddenZoneId;

    const markerEntries = Object.entries(baseState.markers);
    const overriddenMarkerZoneId = markerEntries[0]?.[0];
    if (overriddenMarkerZoneId === undefined) {
      throw new Error('expected at least one marker entry in the base state');
    }
    const untouchedMarkerZoneId = markerEntries.find(([zoneId]) => zoneId !== overriddenMarkerZoneId)?.[0]
      ?? overriddenMarkerZoneId;

    const playerIds = Object.keys(baseState.perPlayerVars).map(Number);
    const overriddenPlayerId = playerIds[0];
    if (overriddenPlayerId === undefined) {
      throw new Error('expected per-player vars to be initialized');
    }
    const untouchedPlayerId = playerIds.find((playerId) => playerId !== overriddenPlayerId) ?? overriddenPlayerId;

    const zoneVarEntries = Object.entries(baseState.zoneVars);
    const overriddenZoneVarId = zoneVarEntries[0]?.[0] ?? overriddenZoneId;
    const untouchedZoneVarId = zoneVarEntries.find(([zoneId]) => zoneId !== overriddenZoneVarId)?.[0]
      ?? untouchedZoneId;

    const engineered = engineerScenarioState(baseState, {
      globalVars: { patronage: 99 },
      perPlayerVars: { [overriddenPlayerId]: { resources: 7 } },
      zoneVars: { [overriddenZoneVarId]: { testCounter: 3 } },
      zones: { [overriddenZoneId]: [] },
      markers: { [overriddenMarkerZoneId]: { supportOpposition: 'passiveSupport' } },
      globalMarkers: { testFlag: 'armed' },
    });

    assert.notStrictEqual(engineered, baseState);

    assert.equal(engineered.globalVars.patronage, 99);
    assert.notStrictEqual(engineered.globalVars, baseState.globalVars);

    assert.equal(engineered.perPlayerVars[overriddenPlayerId]?.resources, 7);
    assert.notStrictEqual(engineered.perPlayerVars, baseState.perPlayerVars);
    assert.notStrictEqual(engineered.perPlayerVars[overriddenPlayerId], baseState.perPlayerVars[overriddenPlayerId]);
    assert.strictEqual(engineered.perPlayerVars[untouchedPlayerId], baseState.perPlayerVars[untouchedPlayerId]);

    assert.equal(engineered.zoneVars[overriddenZoneVarId]?.testCounter, 3);
    assert.notStrictEqual(engineered.zoneVars[overriddenZoneVarId], baseState.zoneVars[overriddenZoneVarId]);
    assert.strictEqual(engineered.zoneVars[untouchedZoneVarId], baseState.zoneVars[untouchedZoneVarId]);

    assert.deepEqual(engineered.zones[overriddenZoneId], []);
    assert.notStrictEqual(engineered.zones, baseState.zones);
    assert.notStrictEqual(engineered.zones[overriddenZoneId], baseState.zones[overriddenZoneId]);
    assert.strictEqual(engineered.zones[untouchedZoneId], baseState.zones[untouchedZoneId]);

    assert.equal(engineered.markers[overriddenMarkerZoneId]?.supportOpposition, 'passiveSupport');
    assert.notStrictEqual(engineered.markers[overriddenMarkerZoneId], baseState.markers[overriddenMarkerZoneId]);
    assert.strictEqual(engineered.markers[untouchedMarkerZoneId], baseState.markers[untouchedMarkerZoneId]);

    assert.equal(engineered.globalMarkers?.testFlag, 'armed');
    assert.notStrictEqual(engineered.globalMarkers, baseState.globalMarkers);

    assert.notEqual(baseState.globalVars.patronage, 99);
    assert.notEqual(baseState.perPlayerVars[overriddenPlayerId]?.resources, 7);
    assert.equal(baseState.zoneVars[overriddenZoneVarId]?.testCounter, undefined);
    assert.notDeepEqual(baseState.zones[overriddenZoneId], []);
    assert.notEqual(baseState.globalMarkers?.testFlag, 'armed');
  });

  it('budgetRank orders every current MCTS budget profile', () => {
    const orderedBudgets: readonly MctsBudgetProfile[] = ['interactive', 'turn', 'background', 'analysis'];

    for (let i = 0; i < orderedBudgets.length; i += 1) {
      assert.equal(budgetRank(orderedBudgets[i]!), i);
    }

    for (let i = 1; i < orderedBudgets.length; i += 1) {
      assert.ok(
        budgetRank(orderedBudgets[i - 1]!) < budgetRank(orderedBudgets[i]!),
        `expected ${orderedBudgets[i - 1]} < ${orderedBudgets[i]}`,
      );
    }
  });
});
