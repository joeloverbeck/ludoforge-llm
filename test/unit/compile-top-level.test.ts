import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '../../src/cnl/index.js';
import { assertNoDiagnostics } from '../helpers/diagnostic-helpers.js';

const minimalCardDrivenTurnFlow = {
  cardLifecycle: { played: 'deck:none', lookahead: 'deck:none', leader: 'deck:none' },
  eligibility: { factions: ['us', 'arvn', 'nva', 'vc'], overrideWindows: [] },
  optionMatrix: [],
  passRewards: [],
  durationWindows: ['turn', 'nextTurn', 'round', 'cycle'] as const,
};

describe('compile top-level actions/triggers/end conditions', () => {
  it('preserves trigger/end-condition order and generates deterministic trigger ids', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'top-level', players: { min: 2, max: 2 } },
      globalVars: [{ name: 'tick', type: 'int', init: 0, min: 0, max: 10 }],
      zones: [{ id: 'deck', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
      turnStructure: { phases: [{ id: 'main' }] },
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
      terminal: {
        conditions: [
          { when: { op: '>=', left: { ref: 'gvar', var: 'tick' }, right: 3 }, result: { type: 'win', player: 'activePlayer' } },
          { when: { op: '>=', left: { ref: 'gvar', var: 'tick' }, right: 5 }, result: { type: 'draw' } },
        ],
      },
    };

    const result = compileGameSpecToGameDef(doc);

    assert.equal(result.gameDef !== null, true);
    assertNoDiagnostics(result);
    assert.deepEqual(
      result.gameDef?.triggers.map((trigger) => trigger.id),
      ['trigger_0', 'afterPass'],
    );
    assert.deepEqual(
      result.gameDef?.terminal.conditions.map((condition) => condition.result.type),
      ['win', 'draw'],
    );
    assert.equal(result.gameDef?.terminal.conditions[0]?.result.type, 'win');
    if (result.gameDef?.terminal.conditions[0]?.result.type === 'win') {
      assert.equal(result.gameDef.terminal.conditions[0].result.player, 'active');
    }
  });

  it('returns deterministic blocking diagnostics for unknown trigger action references', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'bad-trigger-action', players: { min: 2, max: 2 } },
      zones: [{ id: 'deck', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
      turnStructure: { phases: [{ id: 'main' }] },
      actions: [{ id: 'pass', actor: 'active', phase: 'main', params: [], pre: null, cost: [], effects: [], limits: [] }],
      triggers: [{ event: { type: 'actionResolved', action: 'psas' }, effects: [] }],
      terminal: { conditions: [{ when: { op: '>=', left: 1, right: 2 }, result: { type: 'draw' } }] },
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
      globalVars: [
        { name: 'arvnResources', type: 'int', init: 0, min: 0, max: 99 },
        { name: 'factionResource', type: 'int', init: 0, min: 0, max: 99 },
      ],
      zones: [
        { id: 'deck:none', owner: 'none', visibility: 'hidden', ordering: 'stack' },
        { id: 'played:none', owner: 'none', visibility: 'public', ordering: 'stack' },
        { id: 'lookahead:none', owner: 'none', visibility: 'hidden', ordering: 'stack' },
        { id: 'leader:none', owner: 'none', visibility: 'hidden', ordering: 'stack' },
      ],
      turnStructure: { phases: [{ id: 'main' }] },
      turnOrder: {
        type: 'cardDriven' as const,
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: {
              factions: ['us', 'arvn', 'nva', 'vc'],
              overrideWindows: [{ id: 'remain-eligible', duration: 'nextTurn' as const }],
            },
            optionMatrix: [{ first: 'event' as const, second: ['operation', 'operationPlusSpecialActivity'] as const }],
            passRewards: [
              { factionClass: 'coin', resource: 'arvnResources', amount: 3 },
              { factionClass: 'insurgent', resource: 'factionResource', amount: 1 },
            ],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'] as const,
          },
        },
      },
      actions: [{ id: 'pass', actor: 'active', phase: 'main', params: [], pre: null, cost: [], effects: [], limits: [] }],
      triggers: [],
      terminal: { conditions: [{ when: { op: '>=', left: 1, right: 1 }, result: { type: 'draw' } }] },
    };

    const result = compileGameSpecToGameDef(doc);

    assert.equal(result.gameDef !== null, true);
    assertNoDiagnostics(result);
    assert.equal(result.gameDef?.turnOrder?.type, 'cardDriven');
    assert.equal(
      result.gameDef?.turnOrder?.type === 'cardDriven' ? result.gameDef.turnOrder.config.turnFlow.cardLifecycle.played : undefined,
      'played:none',
    );
    assert.deepEqual(
      result.gameDef?.turnOrder?.type === 'cardDriven' ? result.gameDef.turnOrder.config.turnFlow.durationWindows : undefined,
      ['turn', 'nextTurn', 'round', 'cycle'],
    );
  });

  it('compiles simultaneous turnOrder with a non-blocking warning', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'turn-order-simultaneous', players: { min: 2, max: 4 } },
      zones: [{ id: 'deck:none', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
      turnStructure: { phases: [{ id: 'main' }] },
      turnOrder: { type: 'simultaneous' as const },
      actions: [{ id: 'pass', actor: 'active', phase: 'main', params: [], pre: null, cost: [], effects: [], limits: [] }],
      triggers: [],
      terminal: { conditions: [{ when: { op: '>=', left: 1, right: 1 }, result: { type: 'draw' } }] },
    };

    const result = compileGameSpecToGameDef(doc);

    assert.notEqual(result.gameDef, null);
    assert.equal(result.gameDef?.turnOrder?.type, 'simultaneous');
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_SIMULTANEOUS_NOT_IMPLEMENTED' &&
          diagnostic.path === 'doc.turnOrder.type' &&
          diagnostic.severity === 'warning',
      ),
      true,
    );
  });

  it('returns a blocking diagnostic when fixedOrder is declared with an empty order array', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'turn-order-fixed-empty', players: { min: 2, max: 4 } },
      zones: [{ id: 'deck:none', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
      turnStructure: { phases: [{ id: 'main' }] },
      turnOrder: { type: 'fixedOrder' as const, order: [] },
      actions: [{ id: 'pass', actor: 'active', phase: 'main', params: [], pre: null, cost: [], effects: [], limits: [] }],
      triggers: [],
      terminal: { conditions: [{ when: { op: '>=', left: 1, right: 1 }, result: { type: 'draw' } }] },
    };

    const result = compileGameSpecToGameDef(doc);

    assert.equal(result.gameDef, null);
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_FIXED_ORDER_EMPTY'
          && diagnostic.path === 'doc.turnOrder.order'
          && diagnostic.severity === 'error',
      ),
      true,
    );
  });

  it('returns blocking diagnostics for malformed turnFlow metadata', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'turn-flow-invalid', players: { min: 2, max: 4 } },
      zones: [{ id: 'deck:none', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
      turnStructure: { phases: [{ id: 'main' }] },
      turnOrder: {
        type: 'cardDriven' as const,
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none' },
            eligibility: { factions: ['us'], overrideWindows: [] },
          },
        },
      },
      actions: [{ id: 'pass', actor: 'active', phase: 'main', params: [], pre: null, cost: [], effects: [], limits: [] }],
      triggers: [],
      terminal: { conditions: [{ when: { op: '>=', left: 1, right: 1 }, result: { type: 'draw' } }] },
    };

    const result = compileGameSpecToGameDef(doc as unknown as Parameters<typeof compileGameSpecToGameDef>[0]);

    assert.equal(result.gameDef, null);
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_TURN_FLOW_REQUIRED_FIELD_MISSING' &&
          diagnostic.path === 'doc.turnOrder.config.turnFlow.optionMatrix',
      ),
      true,
    );
  });

  it('returns blocking diagnostics for unresolved turnFlow ordering metadata', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'turn-flow-ordering-invalid', players: { min: 2, max: 4 } },
      zones: [{ id: 'deck:none', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
      turnStructure: { phases: [{ id: 'main' }] },
      turnOrder: {
        type: 'cardDriven' as const,
        config: {
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
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'] as const,
            pivotal: {
              actionIds: ['pivotalA', 'pivotalB'],
              interrupt: {
                precedence: ['us', 'vc', 'us'],
              },
            },
          },
        },
      },
      actions: [
        { id: 'pass', actor: 'active', phase: 'main', params: [], pre: null, cost: [], effects: [], limits: [] },
        { id: 'pivotalA', actor: 'active', phase: 'main', params: [], pre: null, cost: [], effects: [], limits: [] },
        { id: 'pivotalB', actor: 'active', phase: 'main', params: [], pre: null, cost: [], effects: [], limits: [] },
      ],
      triggers: [],
      terminal: { conditions: [{ when: { op: '>=', left: 1, right: 1 }, result: { type: 'draw' } }] },
    };

    const result = compileGameSpecToGameDef(doc);

    assert.equal(result.gameDef, null);
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_TURN_FLOW_ORDERING_DUPLICATE_FACTION' &&
          diagnostic.path === 'doc.turnOrder.config.turnFlow.eligibility.factions.2',
      ),
      true,
    );
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_TURN_FLOW_ORDERING_DUPLICATE_OPTION_ROW' &&
          diagnostic.path === 'doc.turnOrder.config.turnFlow.optionMatrix.1.first',
      ),
      true,
    );
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_TURN_FLOW_ORDERING_PRECEDENCE_UNKNOWN_FACTION' &&
          diagnostic.path === 'doc.turnOrder.config.turnFlow.pivotal.interrupt.precedence.1',
      ),
      true,
    );
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_TURN_FLOW_ORDERING_PRECEDENCE_DUPLICATE' &&
          diagnostic.path === 'doc.turnOrder.config.turnFlow.pivotal.interrupt.precedence.2',
      ),
      true,
    );
  });

  it('preserves actionPipelines contracts when declared', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'operation-profile-pass-through', players: { min: 2, max: 4 } },
      zones: [{ id: 'deck:none', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
      turnStructure: { phases: [{ id: 'main' }] },
      actions: [{ id: 'patrol', actor: 'active', phase: 'main', params: [], pre: null, cost: [], effects: [], limits: [] }],
      actionPipelines: [
        {
          id: 'patrol-profile',
          actionId: 'patrol',
          accompanyingOps: ['train', 'patrol'],
          legality: null,
          costValidation: null, costEffects: [],
          targeting: {},
          stages: [{ effects: [] }],
          atomicity: 'atomic' as const,
          linkedWindows: ['window-a'],
        },
      ],
      triggers: [],
      terminal: { conditions: [{ when: { op: '>=', left: 1, right: 1 }, result: { type: 'draw' } }] },
    };

    const result = compileGameSpecToGameDef(doc);

    assert.equal(result.gameDef !== null, true);
    assertNoDiagnostics(result);
    assert.equal(result.gameDef?.actionPipelines?.[0]?.id, 'patrol-profile');
    assert.equal(result.gameDef?.actionPipelines?.[0]?.atomicity, 'atomic');
    assert.deepEqual(result.gameDef?.actionPipelines?.[0]?.accompanyingOps, ['train', 'patrol']);
  });

  it('returns blocking diagnostics for ambiguous or incomplete actionPipelines metadata', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'operation-profile-invalid', players: { min: 2, max: 4 } },
      zones: [{ id: 'deck:none', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
      turnStructure: { phases: [{ id: 'main' }] },
      actions: [
        { id: 'patrol', actor: 'active', phase: 'main', params: [], pre: null, cost: [], effects: [], limits: [] },
        { id: 'sweep', actor: 'active', phase: 'main', params: [], pre: null, cost: [], effects: [], limits: [] },
      ],
      actionPipelines: [
        {
          id: 'patrol-profile',
          actionId: 'patrol',
          legality: null,
          costValidation: null, costEffects: [],
          targeting: {},
          stages: [{ stage: 'resolve' }],
          atomicity: 'atomic',
        },
        {
          id: 'ambiguous-profile',
          actionId: 'patrol',
          legality: null,
          costValidation: null, costEffects: [],
          targeting: {},
          stages: [{ stage: 'resolve' }],
          atomicity: 'partial',
        },
        {
          id: 'invalid-stages-profile',
          actionId: 'sweep',
          legality: null,
          costValidation: null, costEffects: [],
          targeting: {},
          stages: [],
          atomicity: 'invalid',
        },
        {
          id: 'unknown-action-profile',
          actionId: 'missing-action',
          legality: null,
          costValidation: null, costEffects: [],
          targeting: {},
          stages: [{ stage: 'resolve' }],
          atomicity: 'atomic',
        },
        {
          id: 'invalid-accompanying-profile',
          actionId: 'sweep',
          accompanyingOps: [123],
          legality: null,
          costValidation: null, costEffects: [],
          targeting: {},
          stages: [{ stage: 'resolve' }],
          atomicity: 'atomic',
        },
      ],
      triggers: [],
      terminal: { conditions: [{ when: { op: '>=', left: 1, right: 1 }, result: { type: 'draw' } }] },
    };

    const result = compileGameSpecToGameDef(doc as unknown as Parameters<typeof compileGameSpecToGameDef>[0]);

    assert.equal(result.gameDef, null);
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_ACTION_PIPELINE_ACTION_MAPPING_AMBIGUOUS' &&
          diagnostic.path === 'doc.actionPipelines',
      ),
      true,
    );
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_ACTION_PIPELINE_UNKNOWN_ACTION' &&
            diagnostic.path === 'doc.actionPipelines.3.actionId',
      ),
      true,
    );
    assert.equal(
      result.diagnostics.some((diagnostic) => diagnostic.path === 'doc.actionPipelines.2.stages')
      || result.diagnostics.some((diagnostic) => diagnostic.path === 'doc.actionPipelines.2.atomicity'),
      true,
    );
    assert.equal(
      result.diagnostics.some((diagnostic) => diagnostic.path === 'doc.actionPipelines.4.accompanyingOps'),
      true,
    );
  });

  it('requires interrupt precedence when multiple pivotal actions are declared', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'turn-flow-ordering-missing-precedence', players: { min: 2, max: 4 } },
      zones: [{ id: 'deck:none', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
      turnStructure: { phases: [{ id: 'main' }] },
      turnOrder: {
        type: 'cardDriven' as const,
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: {
              factions: ['us', 'arvn', 'nva', 'vc'],
              overrideWindows: [],
            },
            optionMatrix: [{ first: 'event' as const, second: ['operation'] as const }],
            passRewards: [],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'] as const,
            pivotal: {
              actionIds: ['pivotalA', 'pivotalB'],
            },
          },
        },
      },
      actions: [
        { id: 'pass', actor: 'active', phase: 'main', params: [], pre: null, cost: [], effects: [], limits: [] },
        { id: 'pivotalA', actor: 'active', phase: 'main', params: [], pre: null, cost: [], effects: [], limits: [] },
        { id: 'pivotalB', actor: 'active', phase: 'main', params: [], pre: null, cost: [], effects: [], limits: [] },
      ],
      triggers: [],
      terminal: { conditions: [{ when: { op: '>=', left: 1, right: 1 }, result: { type: 'draw' } }] },
    };

    const result = compileGameSpecToGameDef(doc);

    assert.equal(result.gameDef, null);
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_TURN_FLOW_ORDERING_PRECEDENCE_REQUIRED' &&
          diagnostic.path === 'doc.turnOrder.config.turnFlow.pivotal.interrupt.precedence',
      ),
      true,
    );
  });

  it('preserves coupPlan and victory contracts when declared', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'coup-victory-pass-through', players: { min: 2, max: 4 } },
      zones: [{ id: 'deck:none', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
      turnStructure: { phases: [{ id: 'main' }] },
      turnOrder: {
        type: 'cardDriven' as const,
        config: {
          turnFlow: minimalCardDrivenTurnFlow,
          coupPlan: {
            phases: [
              { id: 'victory', steps: ['check-thresholds'] },
              { id: 'resources', steps: ['resource-income', 'aid-penalty'] },
            ],
            finalRoundOmitPhases: ['resources'],
            maxConsecutiveRounds: 1,
          },
        },
      },
      actions: [{ id: 'pass', actor: 'active', phase: 'main', params: [], pre: null, cost: [], effects: [], limits: [] }],
      triggers: [],
      terminal: {
        conditions: [{ when: { op: '>=', left: 1, right: 1 }, result: { type: 'draw' } }],
        checkpoints: [
          {
            id: 'us-threshold',
            faction: 'us',
            timing: 'duringCoup' as const,
            when: { op: '>' as const, left: 51, right: 50 },
          },
        ],
        margins: [{ faction: 'us', value: { op: '-' as const, left: 55, right: 50 } }],
        ranking: { order: 'desc' as const },
      },
    };

    const result = compileGameSpecToGameDef(doc);

    assert.equal(result.gameDef !== null, true);
    assertNoDiagnostics(result);
    assert.equal(result.gameDef?.turnOrder?.type, 'cardDriven');
    assert.equal(
      result.gameDef?.turnOrder?.type === 'cardDriven' ? result.gameDef.turnOrder.config.coupPlan?.phases[0]?.id : undefined,
      'victory',
    );
    assert.equal(result.gameDef?.terminal.checkpoints?.[0]?.id, 'us-threshold');
  });

  it('returns blocking diagnostics for malformed coupPlan and victory metadata', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'coup-victory-invalid', players: { min: 2, max: 4 } },
      zones: [{ id: 'deck:none', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
      turnStructure: { phases: [{ id: 'main' }] },
      turnOrder: {
        type: 'cardDriven' as const,
        config: {
          turnFlow: minimalCardDrivenTurnFlow,
          coupPlan: {
            phases: [{ id: 'victory', steps: [] }],
            finalRoundOmitPhases: ['missing-phase'],
            maxConsecutiveRounds: 0,
          },
        },
      },
      actions: [{ id: 'pass', actor: 'active', phase: 'main', params: [], pre: null, cost: [], effects: [], limits: [] }],
      triggers: [],
      terminal: {
        conditions: [{ when: { op: '>=', left: 1, right: 1 }, result: { type: 'draw' } }],
        checkpoints: [{ id: 'c1', faction: 'us', timing: 'not-valid', when: null }],
        margins: [{ faction: '', value: null }],
        ranking: { order: 'up' },
      },
    };

    const result = compileGameSpecToGameDef(doc as unknown as Parameters<typeof compileGameSpecToGameDef>[0]);

    assert.equal(result.gameDef, null);
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_COUP_PLAN_PHASE_STEPS_INVALID' &&
          diagnostic.path === 'doc.turnOrder.config.coupPlan.phases.0.steps',
      ),
      true,
    );
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_COUP_PLAN_FINAL_ROUND_OMIT_UNKNOWN_PHASE' &&
          diagnostic.path === 'doc.turnOrder.config.coupPlan.finalRoundOmitPhases.0',
      ),
      true,
    );
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_VICTORY_CHECKPOINT_TIMING_INVALID' &&
          diagnostic.path === 'doc.terminal.checkpoints.0.timing',
      ),
      true,
    );
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_VICTORY_RANKING_ORDER_INVALID' &&
          diagnostic.path === 'doc.terminal.ranking.order',
      ),
      true,
    );
  });

  it('returns blocking diagnostics when coupPlan.phases is empty', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'coup-plan-empty-phases', players: { min: 2, max: 4 } },
      zones: [{ id: 'deck:none', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
      turnStructure: { phases: [{ id: 'main' }] },
      turnOrder: {
        type: 'cardDriven' as const,
        config: {
          turnFlow: minimalCardDrivenTurnFlow,
          coupPlan: {
            phases: [],
          },
        },
      },
      actions: [{ id: 'pass', actor: 'active', phase: 'main', params: [], pre: null, cost: [], effects: [], limits: [] }],
      triggers: [],
      terminal: { conditions: [{ when: { op: '>=', left: 1, right: 1 }, result: { type: 'draw' } }] },
    };

    const result = compileGameSpecToGameDef(doc as unknown as Parameters<typeof compileGameSpecToGameDef>[0]);
    assert.equal(result.gameDef, null);
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_COUP_PLAN_PHASES_EMPTY' &&
          diagnostic.path === 'doc.turnOrder.config.coupPlan.phases',
      ),
      true,
    );
  });
});
