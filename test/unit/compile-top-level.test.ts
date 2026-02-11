import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '../../src/cnl/index.js';

describe('compile top-level actions/triggers/end conditions', () => {
  it('preserves trigger/end-condition order and generates deterministic trigger ids', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'top-level', players: { min: 2, max: 2 } },
      globalVars: [{ name: 'tick', type: 'int', init: 0, min: 0, max: 10 }],
      zones: [{ id: 'deck', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
      turnStructure: { phases: [{ id: 'main' }], activePlayerOrder: 'roundRobin' },
      actions: [
        { id: 'pass', actor: 'active', phase: 'main', params: [], pre: null, cost: [], effects: [], limits: [] },
      ],
      triggers: [
        { event: { type: 'turnStart' }, effects: [{ addVar: { scope: 'global', var: 'tick', delta: 1 } }] },
        {
          id: 'afterPass',
          event: { type: 'actionResolved', action: 'pass' },
          effects: [{ addVar: { scope: 'global', var: 'tick', delta: 1 } }],
        },
      ],
      endConditions: [
        { when: { op: '>=', left: { ref: 'gvar', var: 'tick' }, right: 3 }, result: { type: 'win', player: 'activePlayer' } },
        { when: { op: '>=', left: { ref: 'gvar', var: 'tick' }, right: 5 }, result: { type: 'draw' } },
      ],
    };

    const result = compileGameSpecToGameDef(doc);

    assert.equal(result.gameDef !== null, true);
    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(
      result.gameDef?.triggers.map((trigger) => trigger.id),
      ['trigger_0', 'afterPass'],
    );
    assert.deepEqual(
      result.gameDef?.endConditions.map((condition) => condition.result.type),
      ['win', 'draw'],
    );
    assert.equal(result.gameDef?.endConditions[0]?.result.type, 'win');
    if (result.gameDef?.endConditions[0]?.result.type === 'win') {
      assert.equal(result.gameDef.endConditions[0].result.player, 'active');
    }
  });

  it('returns deterministic blocking diagnostics for unknown trigger action references', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'bad-trigger-action', players: { min: 2, max: 2 } },
      zones: [{ id: 'deck', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
      turnStructure: { phases: [{ id: 'main' }], activePlayerOrder: 'roundRobin' },
      actions: [{ id: 'pass', actor: 'active', phase: 'main', params: [], pre: null, cost: [], effects: [], limits: [] }],
      triggers: [{ event: { type: 'actionResolved', action: 'psas' }, effects: [] }],
      endConditions: [{ when: { op: '>=', left: 1, right: 2 }, result: { type: 'draw' } }],
    };

    const first = compileGameSpecToGameDef(doc);
    const second = compileGameSpecToGameDef(doc);

    assert.equal(first.gameDef, null);
    assert.equal(second.gameDef, null);
    assert.deepEqual(first.diagnostics, second.diagnostics);
    assert.equal(
      first.diagnostics.some((diagnostic) => diagnostic.code === 'REF_ACTION_MISSING' && diagnostic.path === 'triggers[0].event.action'),
      true,
    );
  });

  it('preserves turnFlow contracts when declared', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'turn-flow-pass-through', players: { min: 2, max: 4 } },
      zones: [{ id: 'deck:none', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
      turnStructure: { phases: [{ id: 'main' }], activePlayerOrder: 'roundRobin' },
      turnFlow: {
        cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
        eligibility: {
          factions: ['us', 'arvn', 'nva', 'vc'],
          overrideWindows: [{ id: 'remain-eligible', duration: 'nextCard' as const }],
        },
        optionMatrix: [{ first: 'event' as const, second: ['operation', 'operationPlusSpecialActivity'] as const }],
        passRewards: [
          { factionClass: 'coin', resource: 'arvnResources', amount: 3 },
          { factionClass: 'insurgent', resource: 'factionResource', amount: 1 },
        ],
        durationWindows: ['card', 'nextCard', 'coup', 'campaign'] as const,
      },
      actions: [{ id: 'pass', actor: 'active', phase: 'main', params: [], pre: null, cost: [], effects: [], limits: [] }],
      triggers: [],
      endConditions: [{ when: { op: '>=', left: 1, right: 1 }, result: { type: 'draw' } }],
    };

    const result = compileGameSpecToGameDef(doc);

    assert.equal(result.gameDef !== null, true);
    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.gameDef?.turnFlow?.cardLifecycle.played, 'played:none');
    assert.deepEqual(result.gameDef?.turnFlow?.durationWindows, ['card', 'nextCard', 'coup', 'campaign']);
  });

  it('returns blocking diagnostics for malformed turnFlow metadata', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'turn-flow-invalid', players: { min: 2, max: 4 } },
      zones: [{ id: 'deck:none', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
      turnStructure: { phases: [{ id: 'main' }], activePlayerOrder: 'roundRobin' },
      turnFlow: {
        cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none' },
        eligibility: { factions: ['us'], overrideWindows: [] },
      },
      actions: [{ id: 'pass', actor: 'active', phase: 'main', params: [], pre: null, cost: [], effects: [], limits: [] }],
      triggers: [],
      endConditions: [{ when: { op: '>=', left: 1, right: 1 }, result: { type: 'draw' } }],
    };

    const result = compileGameSpecToGameDef(doc as unknown as Parameters<typeof compileGameSpecToGameDef>[0]);

    assert.equal(result.gameDef, null);
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_TURN_FLOW_REQUIRED_FIELD_MISSING' &&
          diagnostic.path === 'doc.turnFlow.optionMatrix',
      ),
      true,
    );
  });

  it('returns blocking diagnostics for unresolved turnFlow ordering metadata', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'turn-flow-ordering-invalid', players: { min: 2, max: 4 } },
      zones: [{ id: 'deck:none', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
      turnStructure: { phases: [{ id: 'main' }], activePlayerOrder: 'roundRobin' },
      turnFlow: {
        cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
        eligibility: {
          factions: ['us', 'arvn', 'us'],
          overrideWindows: [],
        },
        optionMatrix: [
          { first: 'event' as const, second: ['operation'] as const },
          { first: 'event' as const, second: ['operationPlusSpecialActivity'] as const },
        ],
        passRewards: [],
        durationWindows: ['card', 'nextCard', 'coup', 'campaign'] as const,
        pivotal: {
          actionIds: ['pivotalA', 'pivotalB'],
          interrupt: {
            precedence: ['us', 'vc', 'us'],
          },
        },
      },
      actions: [
        { id: 'pass', actor: 'active', phase: 'main', params: [], pre: null, cost: [], effects: [], limits: [] },
        { id: 'pivotalA', actor: 'active', phase: 'main', params: [], pre: null, cost: [], effects: [], limits: [] },
        { id: 'pivotalB', actor: 'active', phase: 'main', params: [], pre: null, cost: [], effects: [], limits: [] },
      ],
      triggers: [],
      endConditions: [{ when: { op: '>=', left: 1, right: 1 }, result: { type: 'draw' } }],
    };

    const result = compileGameSpecToGameDef(doc);

    assert.equal(result.gameDef, null);
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_TURN_FLOW_ORDERING_DUPLICATE_FACTION' &&
          diagnostic.path === 'doc.turnFlow.eligibility.factions.2',
      ),
      true,
    );
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_TURN_FLOW_ORDERING_DUPLICATE_OPTION_ROW' &&
          diagnostic.path === 'doc.turnFlow.optionMatrix.1.first',
      ),
      true,
    );
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_TURN_FLOW_ORDERING_PRECEDENCE_UNKNOWN_FACTION' &&
          diagnostic.path === 'doc.turnFlow.pivotal.interrupt.precedence.1',
      ),
      true,
    );
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_TURN_FLOW_ORDERING_PRECEDENCE_DUPLICATE' &&
          diagnostic.path === 'doc.turnFlow.pivotal.interrupt.precedence.2',
      ),
      true,
    );
  });

  it('requires interrupt precedence when multiple pivotal actions are declared', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'turn-flow-ordering-missing-precedence', players: { min: 2, max: 4 } },
      zones: [{ id: 'deck:none', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
      turnStructure: { phases: [{ id: 'main' }], activePlayerOrder: 'roundRobin' },
      turnFlow: {
        cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
        eligibility: {
          factions: ['us', 'arvn', 'nva', 'vc'],
          overrideWindows: [],
        },
        optionMatrix: [{ first: 'event' as const, second: ['operation'] as const }],
        passRewards: [],
        durationWindows: ['card', 'nextCard', 'coup', 'campaign'] as const,
        pivotal: {
          actionIds: ['pivotalA', 'pivotalB'],
        },
      },
      actions: [
        { id: 'pass', actor: 'active', phase: 'main', params: [], pre: null, cost: [], effects: [], limits: [] },
        { id: 'pivotalA', actor: 'active', phase: 'main', params: [], pre: null, cost: [], effects: [], limits: [] },
        { id: 'pivotalB', actor: 'active', phase: 'main', params: [], pre: null, cost: [], effects: [], limits: [] },
      ],
      triggers: [],
      endConditions: [{ when: { op: '>=', left: 1, right: 1 }, result: { type: 'draw' } }],
    };

    const result = compileGameSpecToGameDef(doc);

    assert.equal(result.gameDef, null);
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_TURN_FLOW_ORDERING_PRECEDENCE_REQUIRED' &&
          diagnostic.path === 'doc.turnFlow.pivotal.interrupt.precedence',
      ),
      true,
    );
  });
});
