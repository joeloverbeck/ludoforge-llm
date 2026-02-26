import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '../../src/cnl/index.js';
import { TURN_FLOW_REQUIRED_KEYS } from '../../src/kernel/turn-flow-contract.js';
import { assertNoDiagnostics } from '../helpers/diagnostic-helpers.js';

const minimalCardDrivenTurnFlow = {
  cardLifecycle: { played: 'deck:none', lookahead: 'deck:none', leader: 'deck:none' },
  eligibility: { seats: ['us', 'arvn', 'nva', 'vc'], overrideWindows: [] },
  actionClassByActionId: { pass: 'pass' } as const,
  optionMatrix: [],
  passRewards: [],
  durationWindows: ['turn', 'nextTurn', 'round', 'cycle'] as const,
};

describe('compile top-level actions/triggers/end conditions', () => {
  it('supports action phase lists for multi-phase action declarations', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'action-phase-list', players: { min: 2, max: 2 } },
      zones: [{ id: 'deck:none', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
      turnStructure: { phases: [{ id: 'p1' }, { id: 'p2' }] },
      actions: [
        { id: 'fold', actor: 'active', executor: 'actor', phase: ['p1', 'p2'], params: [], pre: null, cost: [], effects: [], limits: [] },
      ],
      triggers: [],
      terminal: { conditions: [{ when: true, result: { type: 'draw' } }] },
    };

    const result = compileGameSpecToGameDef(doc);
    assert.notEqual(result.gameDef, null);
    assertNoDiagnostics(result);
    assert.deepEqual(result.gameDef?.actions[0]?.phase, ['p1', 'p2']);
  });

  it('allows actions and phase triggers to reference turnStructure.interrupts ids', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'interrupt-phase-ids', players: { min: 2, max: 2 } },
      zones: [{ id: 'deck:none', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
      turnStructure: { phases: [{ id: 'main' }], interrupts: [{ id: 'commitment' }] },
      actions: [
        { id: 'pass', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] },
        { id: 'resolveCommitment', actor: 'active', executor: 'actor', phase: ['commitment'], params: [], pre: null, cost: [], effects: [], limits: [] },
      ],
      triggers: [{ id: 'onCommitEnter', event: { type: 'phaseEnter', phase: 'commitment' }, effects: [] }],
      terminal: { conditions: [{ when: { op: '>=', left: 1, right: 2 }, result: { type: 'draw' } }] },
    };

    const result = compileGameSpecToGameDef(doc);

    assert.notEqual(result.gameDef, null);
    assertNoDiagnostics(result);
    assert.deepEqual(result.gameDef?.turnStructure.phases.map((phase) => phase.id), ['main']);
    assert.deepEqual(result.gameDef?.turnStructure.interrupts?.map((phase) => phase.id), ['commitment']);
    assert.equal(result.gameDef?.actions.some((action) => action.phase.some((phase) => String(phase) === 'commitment')), true);
  });

  it('preserves trigger/end-condition order and generates deterministic trigger ids', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'top-level', players: { min: 2, max: 2 } },
      globalVars: [{ name: 'tick', type: 'int', init: 0, min: 0, max: 10 }],
      zones: [{ id: 'deck', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
      turnStructure: { phases: [{ id: 'main' }, { id: 'victory' }] },
      actions: [
        { id: 'pass', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] },
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
          { when: { op: '>=', left: { ref: 'gvar', var: 'tick' }, right: 3 }, result: { type: 'win', player: 'active' } },
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

  it('fails compile when terminal winner selector uses non-canonical alias token', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'top-level-terminal-alias-player', players: { min: 2, max: 2 } },
      zones: [{ id: 'deck', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
      turnStructure: { phases: [{ id: 'main' }, { id: 'victory' }, { id: 'resources' }] },
      actions: [{ id: 'pass', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] }],
      triggers: [],
      terminal: { conditions: [{ when: { op: '>=', left: 1, right: 1 }, result: { type: 'win', player: 'activePlayer' } }] },
    };

    const result = compileGameSpecToGameDef(doc);
    assert.equal(result.gameDef, null);
    assert.deepEqual(
      result.diagnostics.find((diagnostic) => diagnostic.path === 'doc.terminal.conditions.0.result.player'),
      {
        code: 'CNL_COMPILER_PLAYER_SELECTOR_INVALID',
        path: 'doc.terminal.conditions.0.result.player',
        severity: 'error',
        message: 'Non-canonical player selector: "activePlayer".',
        suggestion: 'Use "active".',
      },
    );
  });

  it('returns deterministic blocking diagnostics for unknown trigger action references', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'bad-trigger-action', players: { min: 2, max: 2 } },
      zones: [{ id: 'deck', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
      turnStructure: { phases: [{ id: 'main' }, { id: 'victory' }, { id: 'resources' }] },
      actions: [{ id: 'pass', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] }],
      triggers: [{ event: { type: 'actionResolved', action: 'psas' }, effects: [] }],
      terminal: { conditions: [{ when: { op: '>=', left: 1, right: 2 }, result: { type: 'draw' } }] },
    };

    const first = compileGameSpecToGameDef(doc);
    const second = compileGameSpecToGameDef(doc);

    assert.equal(first.gameDef, null);
    assert.equal(second.gameDef, null);
    assert.deepEqual(first.diagnostics, second.diagnostics);
    assert.equal(
      first.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_XREF_TRIGGER_ACTION_MISSING' &&
          diagnostic.path === 'doc.triggers.0.event.action',
      ),
      true,
    );
    assert.equal(
      first.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'REF_ACTION_MISSING' &&
          diagnostic.path === 'triggers[0].event.action',
      ),
      false,
    );
  });

  it('keeps mixed lowerer and cross-ref diagnostics deterministic in partial-compile runs', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'mixed-lowerer-cross-ref-deterministic', players: { min: 2, max: 2 } },
      zones: [{ id: 'deck', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
      turnStructure: { phases: [{ id: 'main' }] },
      actions: [{ id: 'pass', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] }],
      triggers: [{ id: 'bad-trigger', event: { type: 'actionResolved', action: 'psas' }, effects: [] }],
      terminal: { conditions: [{ when: { op: '>=', left: 1, right: 1 }, result: { type: 'win', player: 'activePlayer' } }] },
    };

    const first = compileGameSpecToGameDef(doc);
    const second = compileGameSpecToGameDef(doc);

    assert.equal(first.gameDef, null);
    assert.equal(second.gameDef, null);
    assert.deepEqual(first.diagnostics, second.diagnostics);
    assert.equal(
      first.diagnostics.some((diagnostic) => diagnostic.code === 'CNL_XREF_TRIGGER_ACTION_MISSING'),
      true,
    );
    assert.equal(
      first.diagnostics.some((diagnostic) => diagnostic.code === 'CNL_COMPILER_PLAYER_SELECTOR_INVALID'),
      true,
    );
  });

  it('suppresses dependent trigger-action cross-ref diagnostics when actions fail lowering', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'skip-cross-ref-when-actions-fail', players: { min: 2, max: 2 } },
      zones: [{ id: 'deck', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
      turnStructure: { phases: [{ id: 'main' }] },
      actions: [{ id: 'bad', actor: 42, executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] }],
      triggers: [{ id: 'bad-trigger', event: { type: 'actionResolved', action: 'missing-action' }, effects: [] }],
      terminal: { conditions: [{ when: { op: '>=', left: 1, right: 1 }, result: { type: 'draw' } }] },
    };

    const result = compileGameSpecToGameDef(doc);

    assert.equal(result.gameDef, null);
    assert.equal(result.sections.actions, null);
    assert.equal(
      result.diagnostics.some((diagnostic) => diagnostic.code === 'CNL_XREF_TRIGGER_ACTION_MISSING'),
      false,
    );
    assert.equal(
      result.diagnostics.some((diagnostic) => diagnostic.code === 'CNL_COMPILER_PLAYER_SELECTOR_INVALID'),
      true,
    );
  });

  it('suppresses dependent zoneVar xref diagnostics when zoneVars fail int-only contract', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'skip-zonevar-xref-when-zonevars-fail', players: { min: 2, max: 2 } },
      zoneVars: [{ name: 'locked', type: 'boolean', init: false }],
      zones: [{ id: 'deck:none', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
      turnStructure: { phases: [{ id: 'main' }] },
      actions: [
        {
          id: 'tick',
          actor: 'active',
          executor: 'actor',
          phase: ['main'],
          params: [],
          pre: null,
          cost: [],
          effects: [{ addVar: { scope: 'zoneVar', zone: 'deck:none', var: 'locked', delta: 1 } }],
          limits: [],
        },
      ],
      terminal: { conditions: [{ when: { op: '>=', left: 1, right: 1 }, result: { type: 'draw' } }] },
    };

    const result = compileGameSpecToGameDef(doc);

    assert.equal(result.gameDef, null);
    assert.equal(result.sections.zoneVars, null);
    assert.equal(
      result.diagnostics.some((diagnostic) => diagnostic.code === 'CNL_COMPILER_ZONE_VAR_TYPE_INVALID'),
      true,
    );
    assert.equal(
      result.diagnostics.some((diagnostic) => diagnostic.code === 'CNL_XREF_ZONEVAR_MISSING'),
      false,
    );
  });

  it('uses original source index for zoneVar int-only diagnostics when earlier entries fail structural lowering', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'zonevar-int-only-source-index', players: { min: 2, max: 2 } },
      zoneVars: [42, { name: 'locked', type: 'boolean', init: false }],
      zones: [{ id: 'deck:none', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
      turnStructure: { phases: [{ id: 'main' }] },
      actions: [
        {
          id: 'tick',
          actor: 'active',
          executor: 'actor',
          phase: ['main'],
          params: [],
          pre: null,
          cost: [],
          effects: [{ addVar: { scope: 'zoneVar', zone: 'deck:none', var: 'locked', delta: 1 } }],
          limits: [],
        },
      ],
      terminal: { conditions: [{ when: { op: '>=', left: 1, right: 1 }, result: { type: 'draw' } }] },
    };

    const result = compileGameSpecToGameDef(doc as unknown as Parameters<typeof compileGameSpecToGameDef>[0]);

    assert.equal(result.gameDef, null);
    assert.equal(result.sections.zoneVars, null);
    assert.deepEqual(
      result.diagnostics.find((diagnostic) => diagnostic.code === 'CNL_COMPILER_ZONE_VAR_TYPE_INVALID'),
      {
        code: 'CNL_COMPILER_ZONE_VAR_TYPE_INVALID',
        path: 'doc.zoneVars.1.type',
        severity: 'error',
        message: 'Cannot lower zoneVars.1: only int zoneVars are supported.',
        suggestion: 'Use an int zone variable definition (type, init, min, max).',
      },
    );
    assert.equal(
      result.diagnostics.some((diagnostic) => diagnostic.code === 'CNL_XREF_ZONEVAR_MISSING'),
      false,
    );
  });

  it('preserves valid int zoneVars references', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'valid-zonevar-reference', players: { min: 2, max: 2 } },
      zoneVars: [{ name: 'supply', type: 'int', init: 0, min: 0, max: 10 }],
      zones: [{ id: 'deck:none', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
      turnStructure: { phases: [{ id: 'main' }] },
      actions: [
        {
          id: 'tick',
          actor: 'active',
          executor: 'actor',
          phase: ['main'],
          params: [],
          pre: null,
          cost: [],
          effects: [{ addVar: { scope: 'zoneVar', zone: 'deck:none', var: 'supply', delta: 1 } }],
          limits: [],
        },
      ],
      terminal: { conditions: [{ when: { op: '>=', left: 1, right: 1 }, result: { type: 'draw' } }] },
    };

    const result = compileGameSpecToGameDef(doc);

    assert.notEqual(result.gameDef, null);
    assertNoDiagnostics(result);
    assert.deepEqual(result.gameDef?.zoneVars, [{ name: 'supply', type: 'int', init: 0, min: 0, max: 10 }]);
  });

  it('compiles varChanged trigger events and enforces variable references', () => {
    const validDoc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'var-changed-valid', players: { min: 2, max: 2 } },
      globalVars: [{ name: 'trail', type: 'int', init: 0, min: 0, max: 4 }],
      zones: [{ id: 'deck', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
      turnStructure: { phases: [{ id: 'main' }] },
      actions: [{ id: 'pass', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] }],
      triggers: [{ id: 'onTrailChanged', event: { type: 'varChanged', scope: 'global', var: 'trail' }, effects: [] }],
      terminal: { conditions: [{ when: { op: '>=', left: 1, right: 2 }, result: { type: 'draw' } }] },
    };
    const valid = compileGameSpecToGameDef(validDoc);
    assert.notEqual(valid.gameDef, null);
    assertNoDiagnostics(valid);
    assert.equal(valid.gameDef?.triggers[0]?.event.type, 'varChanged');

    const invalidDoc = {
      ...validDoc,
      metadata: { id: 'var-changed-invalid', players: { min: 2, max: 2 } },
      triggers: [{ id: 'onTrailChanged', event: { type: 'varChanged', scope: 'global', var: 'missingTrail' }, effects: [] }],
    };
    const invalid = compileGameSpecToGameDef(invalidDoc);
    assert.equal(invalid.gameDef, null);
    assert.equal(
      invalid.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_XREF_TRIGGER_VAR_MISSING' &&
          diagnostic.path === 'doc.triggers.0.event.var',
      ),
      true,
    );
    assert.equal(
      invalid.diagnostics.some(
        (diagnostic) => diagnostic.code === 'REF_VAR_MISSING' && diagnostic.path === 'triggers[0].event.var',
      ),
      false,
    );
  });

  it('canonicalizes legacy boundary REF diagnostics to CNL_XREF diagnostics in compile output', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'canonicalize-ref-to-cnl-xref', players: { min: 2, max: 2 } },
      zones: [{ id: 'deck', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
      turnStructure: { phases: [{ id: 'main' }] },
      actions: [{ id: 'pass', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] }],
      terminal: { conditions: [{ when: { op: '>=', left: { ref: 'gvar', var: 'missingVar' }, right: 1 }, result: { type: 'draw' } }] },
    };

    const result = compileGameSpecToGameDef(doc);

    assert.equal(result.gameDef, null);
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_XREF_GVAR_MISSING' &&
          diagnostic.path === 'doc.terminal.conditions.0.when.left.var',
      ),
      true,
    );
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'REF_GVAR_MISSING' &&
          diagnostic.path === 'terminal.conditions[0].when.left.var',
      ),
      false,
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
              seats: ['us', 'arvn', 'nva', 'vc'],
              overrideWindows: [{ id: 'remain-eligible', duration: 'nextTurn' as const }],
            },
            actionClassByActionId: { pass: 'pass' as const },
            optionMatrix: [{ first: 'event' as const, second: ['operation', 'operationPlusSpecialActivity'] as const }],
            passRewards: [
              { seat: 'coin', resource: 'arvnResources', amount: 3 },
              { seat: 'insurgent', resource: 'factionResource', amount: 1 },
            ],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'] as const,
          },
        },
      },
      actions: [{ id: 'pass', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] }],
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
      actions: [{ id: 'pass', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] }],
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
      actions: [{ id: 'pass', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] }],
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

  it('preserves source indices for fixedOrder diagnostics when invalid entries precede duplicates', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'turn-order-fixed-index-fidelity', players: { min: 2, max: 4 } },
      zones: [{ id: 'deck:none', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
      turnStructure: { phases: [{ id: 'main' }] },
      turnOrder: { type: 'fixedOrder' as const, order: ['us', 7, 'us'] },
      actions: [{ id: 'pass', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] }],
      triggers: [],
      terminal: { conditions: [{ when: { op: '>=', left: 1, right: 1 }, result: { type: 'draw' } }] },
    };

    const result = compileGameSpecToGameDef(doc as unknown as Parameters<typeof compileGameSpecToGameDef>[0]);

    assert.equal(result.gameDef, null);
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_FIXED_ORDER_ENTRY_INVALID'
          && diagnostic.path === 'doc.turnOrder.order.1',
      ),
      true,
    );
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_FIXED_ORDER_DUPLICATE'
          && diagnostic.path === 'doc.turnOrder.order.2',
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
            eligibility: { seats: ['us'], overrideWindows: [] },
          },
        },
      },
      actions: [{ id: 'pass', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] }],
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
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_TURN_FLOW_REQUIRED_FIELD_MISSING' &&
          diagnostic.path === 'doc.turnOrder.config.turnFlow.actionClassByActionId',
      ),
      true,
    );
  });

  it('returns blocking diagnostics for blank freeOperationActionIds entries', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'turn-flow-free-op-action-id-invalid', players: { min: 2, max: 4 } },
      zones: [{ id: 'deck:none', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
      turnStructure: { phases: [{ id: 'main' }] },
      turnOrder: {
        type: 'cardDriven' as const,
        config: {
          turnFlow: {
            ...minimalCardDrivenTurnFlow,
            freeOperationActionIds: ['pass', '', '   '],
          },
        },
      },
      actions: [{ id: 'pass', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] }],
      triggers: [],
      terminal: { conditions: [{ when: { op: '>=', left: 1, right: 1 }, result: { type: 'draw' } }] },
    };

    const result = compileGameSpecToGameDef(doc);

    assert.equal(result.gameDef, null);
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_TURN_FLOW_REQUIRED_FIELD_MISSING'
          && diagnostic.path === 'doc.turnOrder.config.turnFlow.freeOperationActionIds.1',
      ),
      true,
    );
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_TURN_FLOW_REQUIRED_FIELD_MISSING'
          && diagnostic.path === 'doc.turnOrder.config.turnFlow.freeOperationActionIds.2',
      ),
      true,
    );
  });

  it('emits required-field diagnostics for each missing required turnFlow key', () => {
    for (const requiredKey of TURN_FLOW_REQUIRED_KEYS) {
      const turnFlow = { ...minimalCardDrivenTurnFlow } as Record<string, unknown>;
      delete turnFlow[requiredKey];

      const doc = {
        ...createEmptyGameSpecDoc(),
        metadata: { id: `turn-flow-required-${requiredKey}`, players: { min: 2, max: 4 } },
        zones: [{ id: 'deck:none', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
        turnStructure: { phases: [{ id: 'main' }] },
        turnOrder: {
          type: 'cardDriven' as const,
          config: {
            turnFlow,
          },
        },
        actions: [{ id: 'pass', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] }],
        triggers: [],
        terminal: { conditions: [{ when: { op: '>=', left: 1, right: 1 }, result: { type: 'draw' } }] },
      };

      const result = compileGameSpecToGameDef(doc as unknown as Parameters<typeof compileGameSpecToGameDef>[0]);
      assert.equal(result.gameDef, null);
      assert.equal(
        result.diagnostics.some(
          (diagnostic) =>
            diagnostic.code === 'CNL_COMPILER_TURN_FLOW_REQUIRED_FIELD_MISSING'
            && diagnostic.path === `doc.turnOrder.config.turnFlow.${requiredKey}`,
        ),
        true,
      );
    }
  });

  it('returns blocking diagnostics when turnFlow.actionClassByActionId references unknown actions', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'turn-flow-action-class-xref-invalid', players: { min: 2, max: 4 } },
      zones: [{ id: 'deck:none', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
      turnStructure: { phases: [{ id: 'main' }] },
      turnOrder: {
        type: 'cardDriven' as const,
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { seats: ['us'], overrideWindows: [] },
            actionClassByActionId: { unknownAction: 'operation' as const, pass: 'pass' as const },
            optionMatrix: [{ first: 'event' as const, second: ['operation'] as const }],
            passRewards: [],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'] as const,
          },
        },
      },
      actions: [{ id: 'pass', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] }],
      triggers: [],
      terminal: { conditions: [{ when: { op: '>=', left: 1, right: 1 }, result: { type: 'draw' } }] },
    };

    const result = compileGameSpecToGameDef(doc);

    assert.equal(result.gameDef, null);
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_XREF_TURN_FLOW_ACTION_CLASS_ACTION_MISSING' &&
          diagnostic.path === 'doc.turnOrder.config.turnFlow.actionClassByActionId.unknownAction',
      ),
      true,
    );
  });

  it('returns blocking diagnostics when declared pass action is not mapped to pass', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'turn-flow-pass-mapping-required', players: { min: 2, max: 4 } },
      zones: [{ id: 'deck:none', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
      turnStructure: { phases: [{ id: 'main' }] },
      turnOrder: {
        type: 'cardDriven' as const,
        config: {
          turnFlow: {
            ...minimalCardDrivenTurnFlow,
            actionClassByActionId: {},
          },
        },
      },
      actions: [{ id: 'pass', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] }],
      triggers: [],
      terminal: { conditions: [{ when: { op: '>=', left: 1, right: 1 }, result: { type: 'draw' } }] },
    };

    const result = compileGameSpecToGameDef(doc);

    assert.equal(result.gameDef, null);
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_XREF_TURN_FLOW_ACTION_CLASS_REQUIRED_MISSING'
          && diagnostic.path === 'doc.turnOrder.config.turnFlow.actionClassByActionId.pass',
      ),
      true,
    );
  });

  it('returns blocking diagnostics when card-event action is not mapped to event', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'turn-flow-event-mapping-required', players: { min: 2, max: 4 } },
      zones: [
        { id: 'deck:none', owner: 'none', visibility: 'hidden', ordering: 'stack' },
        { id: 'discard:none', owner: 'none', visibility: 'public', ordering: 'stack' },
      ],
      turnStructure: { phases: [{ id: 'main' }] },
      turnOrder: {
        type: 'cardDriven' as const,
        config: {
          turnFlow: {
            ...minimalCardDrivenTurnFlow,
            actionClassByActionId: { pass: 'pass' as const, playEvent: 'operation' as const },
          },
        },
      },
      actions: [
        { id: 'pass', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] },
        {
          id: 'playEvent',
          actor: 'active',
          executor: 'actor',
          phase: ['main'],
          capabilities: ['cardEvent'],
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
      ],
      eventDecks: [
        {
          id: 'core',
          drawZone: 'deck:none',
          discardZone: 'discard:none',
          cards: [{ id: 'c1', title: 'C1', sideMode: 'single' as const, unshaded: { effects: [] } }],
        },
      ],
      triggers: [],
      terminal: { conditions: [{ when: { op: '>=', left: 1, right: 1 }, result: { type: 'draw' } }] },
    };

    const result = compileGameSpecToGameDef(doc);

    assert.equal(result.gameDef, null);
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_XREF_TURN_FLOW_ACTION_CLASS_REQUIRED_MISMATCH'
          && diagnostic.path === 'doc.turnOrder.config.turnFlow.actionClassByActionId.playEvent',
      ),
      true,
    );
  });

  it('returns blocking diagnostics when pivotal action ids are not mapped to event', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'turn-flow-pivotal-mapping-required', players: { min: 2, max: 4 } },
      zones: [{ id: 'deck:none', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
      turnStructure: { phases: [{ id: 'main' }] },
      turnOrder: {
        type: 'cardDriven' as const,
        config: {
          turnFlow: {
            ...minimalCardDrivenTurnFlow,
            actionClassByActionId: { pass: 'pass' as const, pivotalA: 'operation' as const },
            pivotal: {
              actionIds: ['pivotalA'],
            },
          },
        },
      },
      actions: [
        { id: 'pass', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] },
        { id: 'pivotalA', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] },
      ],
      triggers: [],
      terminal: { conditions: [{ when: { op: '>=', left: 1, right: 1 }, result: { type: 'draw' } }] },
    };

    const result = compileGameSpecToGameDef(doc);

    assert.equal(result.gameDef, null);
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_XREF_TURN_FLOW_ACTION_CLASS_REQUIRED_MISMATCH'
          && diagnostic.path === 'doc.turnOrder.config.turnFlow.actionClassByActionId.pivotalA',
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
              seats: ['us', 'arvn', 'us'],
              overrideWindows: [],
            },
            actionClassByActionId: { pass: 'pass' as const, pivotalA: 'event' as const, pivotalB: 'event' as const },
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
        { id: 'pass', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] },
        { id: 'pivotalA', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] },
        { id: 'pivotalB', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] },
      ],
      triggers: [],
      terminal: { conditions: [{ when: { op: '>=', left: 1, right: 1 }, result: { type: 'draw' } }] },
    };

    const result = compileGameSpecToGameDef(doc);

    assert.equal(result.gameDef, null);
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_TURN_FLOW_ORDERING_DUPLICATE_SEAT' &&
          diagnostic.path === 'doc.turnOrder.config.turnFlow.eligibility.seats.2',
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
          diagnostic.code === 'CNL_COMPILER_TURN_FLOW_ORDERING_PRECEDENCE_UNKNOWN_SEAT' &&
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

  it('preserves source indices for turnFlow ordering diagnostics when invalid entries are present', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'turn-flow-ordering-index-fidelity', players: { min: 2, max: 4 } },
      zones: [{ id: 'deck:none', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
      turnStructure: { phases: [{ id: 'main' }] },
      turnOrder: {
        type: 'cardDriven' as const,
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: {
              seats: ['us', 7, 'us'],
              overrideWindows: [],
            },
            actionClassByActionId: { pass: 'pass' as const, pivotalA: 'event' as const, pivotalB: 'event' as const },
            optionMatrix: [{ first: 'event' as const, second: ['operation'] as const }],
            passRewards: [],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'] as const,
            pivotal: {
              actionIds: ['pivotalA', null, 'pivotalB'],
              interrupt: {
                precedence: ['us', null, 'us', 'vc'],
              },
            },
          },
        },
      },
      actions: [
        { id: 'pass', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] },
        { id: 'pivotalA', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] },
        { id: 'pivotalB', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] },
      ],
      triggers: [],
      terminal: { conditions: [{ when: { op: '>=', left: 1, right: 1 }, result: { type: 'draw' } }] },
    };

    const result = compileGameSpecToGameDef(doc as unknown as Parameters<typeof compileGameSpecToGameDef>[0]);

    assert.equal(result.gameDef, null);
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_TURN_FLOW_ORDERING_SEAT_INVALID'
          && diagnostic.path === 'doc.turnOrder.config.turnFlow.eligibility.seats.1',
      ),
      true,
    );
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_TURN_FLOW_ORDERING_DUPLICATE_SEAT'
          && diagnostic.path === 'doc.turnOrder.config.turnFlow.eligibility.seats.2',
      ),
      true,
    );
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_TURN_FLOW_ORDERING_PIVOTAL_ACTION_ID_INVALID'
          && diagnostic.path === 'doc.turnOrder.config.turnFlow.pivotal.actionIds.1',
      ),
      true,
    );
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_TURN_FLOW_ORDERING_PRECEDENCE_INVALID_SEAT'
          && diagnostic.path === 'doc.turnOrder.config.turnFlow.pivotal.interrupt.precedence.1',
      ),
      true,
    );
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_TURN_FLOW_ORDERING_PRECEDENCE_DUPLICATE'
          && diagnostic.path === 'doc.turnOrder.config.turnFlow.pivotal.interrupt.precedence.2',
      ),
      true,
    );
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_TURN_FLOW_ORDERING_PRECEDENCE_UNKNOWN_SEAT'
          && diagnostic.path === 'doc.turnOrder.config.turnFlow.pivotal.interrupt.precedence.3',
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
      actions: [{ id: 'patrol', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] }],
      actionPipelines: [
        {
          id: 'patrol-profile',
          actionId: 'patrol',
          accompanyingOps: ['train', 'patrol'],
          compoundParamConstraints: [
            { relation: 'disjoint' as const, operationParam: 'targetSpaces', specialActivityParam: 'targetSpaces' },
            { relation: 'subset' as const, operationParam: 'targetSpaces', specialActivityParam: 'saTargetSpaces' },
          ],
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
    assert.deepEqual(result.gameDef?.actionPipelines?.[0]?.compoundParamConstraints, [
      { relation: 'disjoint', operationParam: 'targetSpaces', specialActivityParam: 'targetSpaces' },
      { relation: 'subset', operationParam: 'targetSpaces', specialActivityParam: 'saTargetSpaces' },
    ]);
  });

  it('preserves derivedMetrics contracts when declared', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'derived-metric-pass-through', players: { min: 2, max: 4 } },
      zones: [
        {
          id: 'city:none',
          zoneKind: 'board' as const,
          owner: 'none',
          visibility: 'public',
          ordering: 'set',
          category: 'city',
          attributes: { population: 2, econ: 0, terrainTags: [], country: 'test', coastal: false },
        },
      ],
      turnStructure: { phases: [{ id: 'main' }] },
      actions: [{ id: 'patrol', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] }],
      derivedMetrics: [
        {
          id: 'support-total',
          computation: 'markerTotal' as const,
          zoneFilter: { zoneKinds: ['board' as const], category: ['city'] },
          requirements: [{ key: 'population', expectedType: 'number' as const }],
        },
      ],
      triggers: [],
      terminal: { conditions: [{ when: { op: '>=', left: 1, right: 1 }, result: { type: 'draw' } }] },
    };

    const result = compileGameSpecToGameDef(doc);

    assert.equal(result.gameDef !== null, true);
    assertNoDiagnostics(result);
    assert.equal(result.gameDef?.derivedMetrics?.[0]?.id, 'support-total');
    assert.equal(result.gameDef?.derivedMetrics?.[0]?.computation, 'markerTotal');
    assert.deepEqual(result.gameDef?.derivedMetrics?.[0]?.zoneFilter?.zoneKinds, ['board']);
    assert.deepEqual(result.gameDef?.derivedMetrics?.[0]?.requirements, [{ key: 'population', expectedType: 'number' }]);
  });

  it('carries only sequentially-visible binders across pipeline stages', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'operation-profile-stage-binding-carry-over', players: { min: 2, max: 4 } },
      globalVars: [
        { name: 'pickedTargets', type: 'int', init: 0, min: 0, max: 99 },
        { name: 'rolled', type: 'int', init: 0, min: 0, max: 99 },
      ],
      zones: [{ id: 'deck:none', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
      turnStructure: { phases: [{ id: 'main' }] },
      actions: [{ id: 'patrol', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] }],
      actionPipelines: [
        {
          id: 'patrol-profile',
          actionId: 'patrol',
          legality: null,
          costValidation: null,
          costEffects: [],
          targeting: {},
          stages: [
            {
              effects: [
                { chooseN: { bind: '$targets', options: { query: 'players' }, max: 1 } },
                { rollRandom: { bind: '$roll', min: 1, max: 6, in: [] } },
              ],
            },
            {
              effects: [
                { setVar: { scope: 'global', var: 'pickedTargets', value: { ref: 'binding', name: '$targets' } } },
                { setVar: { scope: 'global', var: 'rolled', value: { ref: 'binding', name: '$roll' } } },
              ],
            },
          ],
          atomicity: 'atomic' as const,
        },
      ],
      triggers: [],
      terminal: { conditions: [{ when: { op: '>=', left: 1, right: 1 }, result: { type: 'draw' } }] },
    };

    const result = compileGameSpecToGameDef(doc);

    assert.equal(result.gameDef !== null, true);
    assertNoDiagnostics(result);
  });

  it('does not carry then-only if binders across pipeline stages', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'operation-profile-stage-binding-if-no-leak', players: { min: 2, max: 4 } },
      globalVars: [{ name: 'pickedTargets', type: 'int', init: 0, min: 0, max: 99 }],
      zones: [{ id: 'deck:none', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
      turnStructure: { phases: [{ id: 'main' }] },
      actions: [{ id: 'patrol', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] }],
      actionPipelines: [
        {
          id: 'patrol-profile',
          actionId: 'patrol',
          legality: null,
          costValidation: null,
          costEffects: [],
          targeting: {},
          stages: [
            {
              effects: [
                {
                  if: {
                    when: true,
                    then: [{ bindValue: { bind: '$branchOnly', value: 1 } }],
                  },
                },
              ],
            },
            {
              effects: [
                { setVar: { scope: 'global', var: 'pickedTargets', value: { ref: 'binding', name: '$branchOnly' } } },
              ],
            },
          ],
          atomicity: 'atomic' as const,
        },
      ],
      triggers: [],
      terminal: { conditions: [{ when: { op: '>=', left: 1, right: 1 }, result: { type: 'draw' } }] },
    };

    const result = compileGameSpecToGameDef(doc);

    assert.equal(result.gameDef, null);
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_BINDING_UNBOUND'
          && diagnostic.path === 'doc.actionPipelines.0.stages[1].effects.0.setVar.value.name',
      ),
      true,
    );
  });

  it('carries if binders across pipeline stages only when both branches guarantee them', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'operation-profile-stage-binding-if-intersection', players: { min: 2, max: 4 } },
      globalVars: [{ name: 'pickedTargets', type: 'int', init: 0, min: 0, max: 99 }],
      zones: [{ id: 'deck:none', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
      turnStructure: { phases: [{ id: 'main' }] },
      actions: [{ id: 'patrol', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] }],
      actionPipelines: [
        {
          id: 'patrol-profile',
          actionId: 'patrol',
          legality: null,
          costValidation: null,
          costEffects: [],
          targeting: {},
          stages: [
            {
              effects: [
                {
                  if: {
                    when: true,
                    then: [{ bindValue: { bind: '$branchShared', value: 1 } }],
                    else: [{ bindValue: { bind: '$branchShared', value: 2 } }],
                  },
                },
              ],
            },
            {
              effects: [
                { setVar: { scope: 'global', var: 'pickedTargets', value: { ref: 'binding', name: '$branchShared' } } },
              ],
            },
          ],
          atomicity: 'atomic' as const,
        },
      ],
      triggers: [],
      terminal: { conditions: [{ when: { op: '>=', left: 1, right: 1 }, result: { type: 'draw' } }] },
    };

    const result = compileGameSpecToGameDef(doc);

    assert.equal(result.gameDef !== null, true);
    assertNoDiagnostics(result);
  });

  it('does not carry lexical-only binders (forEach.bind) across pipeline stages', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'operation-profile-stage-binding-no-leak', players: { min: 2, max: 4 } },
      globalVars: [{ name: 'pickedTargets', type: 'int', init: 0, min: 0, max: 99 }],
      zones: [{ id: 'deck:none', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
      turnStructure: { phases: [{ id: 'main' }] },
      actions: [{ id: 'patrol', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] }],
      actionPipelines: [
        {
          id: 'patrol-profile',
          actionId: 'patrol',
          legality: null,
          costValidation: null,
          costEffects: [],
          targeting: {},
          stages: [
            {
              effects: [
                { forEach: { bind: '$tok', over: { query: 'players' }, effects: [] } },
              ],
            },
            {
              effects: [
                { setVar: { scope: 'global', var: 'pickedTargets', value: { ref: 'binding', name: '$tok' } } },
              ],
            },
          ],
          atomicity: 'atomic' as const,
        },
      ],
      triggers: [],
      terminal: { conditions: [{ when: { op: '>=', left: 1, right: 1 }, result: { type: 'draw' } }] },
    };

    const result = compileGameSpecToGameDef(doc);

    assert.equal(result.gameDef, null);
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_BINDING_UNBOUND'
          && diagnostic.path === 'doc.actionPipelines.0.stages[1].effects.0.setVar.value.name',
      ),
      true,
    );
  });

  it('returns blocking diagnostics for ambiguous or incomplete actionPipelines metadata', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'operation-profile-invalid', players: { min: 2, max: 4 } },
      zones: [{ id: 'deck:none', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
      turnStructure: { phases: [{ id: 'main' }] },
      actions: [
        { id: 'patrol', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] },
        { id: 'sweep', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] },
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
        {
          id: 'invalid-compound-constraint-profile',
          actionId: 'sweep',
          compoundParamConstraints: [{ relation: 'overlap', operationParam: 'targetSpaces', specialActivityParam: 'targetSpaces' }],
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
    assert.equal(
      result.diagnostics.some((diagnostic) => diagnostic.path === 'doc.actionPipelines.5.compoundParamConstraints'),
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
              seats: ['us', 'arvn', 'nva', 'vc'],
              overrideWindows: [],
            },
            actionClassByActionId: { pass: 'pass' as const, pivotalA: 'event' as const, pivotalB: 'event' as const },
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
        { id: 'pass', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] },
        { id: 'pivotalA', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] },
        { id: 'pivotalB', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] },
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

  it('returns blocking diagnostics when cancellation selectors are not objects', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'turn-flow-cancellation-selector-invalid-shape', players: { min: 2, max: 4 } },
      zones: [{ id: 'deck:none', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
      turnStructure: { phases: [{ id: 'main' }] },
      turnOrder: {
        type: 'cardDriven' as const,
        config: {
          turnFlow: {
            ...minimalCardDrivenTurnFlow,
            pivotal: {
              actionIds: ['pivotalA', 'pivotalB'],
              interrupt: {
                precedence: ['us', 'arvn', 'nva', 'vc'],
                cancellation: [
                  {
                    winner: 'not-an-object',
                    canceled: { actionId: 'pivotalB' },
                  },
                ],
              },
            },
          },
        },
      },
      actions: [
        { id: 'pass', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] },
        { id: 'pivotalA', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] },
        { id: 'pivotalB', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] },
      ],
      triggers: [],
      terminal: { conditions: [{ when: { op: '>=', left: 1, right: 1 }, result: { type: 'draw' } }] },
    };

    const result = compileGameSpecToGameDef(doc as unknown as Parameters<typeof compileGameSpecToGameDef>[0]);

    assert.equal(result.gameDef, null);
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_TURN_FLOW_ORDERING_CANCELLATION_SELECTOR_INVALID' &&
          diagnostic.path === 'doc.turnOrder.config.turnFlow.pivotal.interrupt.cancellation.0.winner',
      ),
      true,
    );
  });

  it('returns blocking diagnostics when cancellation selectors are empty', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'turn-flow-cancellation-selector-empty', players: { min: 2, max: 4 } },
      zones: [{ id: 'deck:none', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
      turnStructure: { phases: [{ id: 'main' }] },
      turnOrder: {
        type: 'cardDriven' as const,
        config: {
          turnFlow: {
            ...minimalCardDrivenTurnFlow,
            pivotal: {
              actionIds: ['pivotalA', 'pivotalB'],
              interrupt: {
                precedence: ['us', 'arvn', 'nva', 'vc'],
                cancellation: [
                  {
                    winner: {},
                    canceled: { actionId: 'pivotalB' },
                  },
                ],
              },
            },
          },
        },
      },
      actions: [
        { id: 'pass', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] },
        { id: 'pivotalA', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] },
        { id: 'pivotalB', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] },
      ],
      triggers: [],
      terminal: { conditions: [{ when: { op: '>=', left: 1, right: 1 }, result: { type: 'draw' } }] },
    };

    const result = compileGameSpecToGameDef(doc as unknown as Parameters<typeof compileGameSpecToGameDef>[0]);

    assert.equal(result.gameDef, null);
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_TURN_FLOW_ORDERING_CANCELLATION_SELECTOR_EMPTY' &&
          diagnostic.path === 'doc.turnOrder.config.turnFlow.pivotal.interrupt.cancellation.0.winner',
      ),
      true,
    );
  });

  it('preserves coupPlan and victory contracts when declared', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'coup-victory-pass-through', players: { min: 2, max: 4 } },
      zones: [{ id: 'deck:none', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
      turnStructure: { phases: [{ id: 'main' }, { id: 'victory' }, { id: 'resources' }] },
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
      actions: [{ id: 'pass', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] }],
      triggers: [],
      terminal: {
        conditions: [{ when: { op: '>=', left: 1, right: 1 }, result: { type: 'draw' } }],
        checkpoints: [
          {
            id: 'us-threshold',
            seat: 'us',
            timing: 'duringCoup' as const,
            when: { op: '>' as const, left: 51, right: 50 },
          },
        ],
        margins: [{ seat: 'us', value: { op: '-' as const, left: 55, right: 50 } }],
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
      actions: [{ id: 'pass', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] }],
      triggers: [],
      terminal: {
        conditions: [{ when: { op: '>=', left: 1, right: 1 }, result: { type: 'draw' } }],
        checkpoints: [{ id: 'c1', seat: 'us', timing: 'not-valid', when: null }],
        margins: [{ seat: '', value: null }],
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
      actions: [{ id: 'pass', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] }],
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
