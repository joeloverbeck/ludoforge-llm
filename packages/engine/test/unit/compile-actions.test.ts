import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '../../src/cnl/index.js';
import { CNL_XREF_DIAGNOSTIC_CODES } from '../../src/cnl/cross-validate-diagnostic-codes.js';
import { assertNoDiagnostics } from '../helpers/diagnostic-helpers.js';

const minimalCardDrivenTurnFlow = {
  cardLifecycle: { played: 'deck:none', lookahead: 'deck:none', leader: 'deck:none' },
  eligibility: { seats: ['us', 'arvn', 'nva', 'vc'], overrideWindows: [] },
  actionClassByActionId: { pass: 'pass' } as const,
  optionMatrix: [],
  passRewards: [],
  durationWindows: ['turn', 'nextTurn', 'round', 'cycle'] as const,
};

describe('compile actions', () => {
  it('lowers action actor/params/pre/cost/effects/limits into GameDef', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'action-compile', players: { min: 2, max: 2 } },
      globalVars: [{ name: 'energy', type: 'int', init: 2, min: -10, max: 10 }],
      zones: [
        { id: 'deck', owner: 'none', visibility: 'hidden', ordering: 'stack' },
        { id: 'hand', owner: 'player', visibility: 'hidden', ordering: 'stack' },
      ],
      turnStructure: { phases: [{ id: 'main' }] },
      actions: [
        {
          id: 'play',
          actor: 'active',
          executor: 'actor',
          phase: ['main'],
          params: [{ name: 'count', domain: { query: 'intsInRange', min: 1, max: 2 } }],
          pre: {
            op: '>=',
            left: { ref: 'zoneCount', zone: 'hand:0' },
            right: 1,
          },
          cost: [{ addVar: { scope: 'global', var: 'energy', delta: -1 } }],
          effects: [{ draw: { from: 'deck', to: 'hand:0', count: 1 } }],
          limits: [{ scope: 'turn', max: 1 }],
        },
      ],
      triggers: [],
      terminal: { conditions: [{ when: { op: '>=', left: 1, right: 999 }, result: { type: 'draw' } }] },
    };

    const result = compileGameSpecToGameDef(doc);

    assert.equal(result.gameDef !== null, true);
    assertNoDiagnostics(result);

    const action = result.gameDef?.actions[0];
    assert.equal(action?.id, 'play');
    assert.equal(action?.actor, 'active');
    assert.equal(action?.params[0]?.name, 'count');
    assert.deepEqual(action?.params[0]?.domain, { query: 'intsInRange', min: 1, max: 2 });
    assert.deepEqual(action?.limits, [{ scope: 'turn', max: 1 }]);
    assert.deepEqual(action?.effects, [{ draw: { from: 'deck:none', to: 'hand:0', count: 1 } }]);
    assert.deepEqual(action?.phase, ['main']);
  });

  it('rejects duplicate action phase ids during lowering', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'action-phase-duplicates', players: { min: 2, max: 2 } },
      zones: [{ id: 'deck', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
      turnStructure: { phases: [{ id: 'main' }] },
      actions: [{ id: 'play', actor: 'active', executor: 'actor', phase: ['main', 'main'], params: [], pre: null, cost: [], effects: [], limits: [] }],
      triggers: [],
      terminal: { conditions: [{ when: { op: '>=', left: 1, right: 999 }, result: { type: 'draw' } }] },
    };

    const result = compileGameSpecToGameDef(doc);
    assert.equal(result.gameDef, null);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === 'CNL_COMPILER_ACTION_PHASE_DUPLICATE'), true);
  });

  it('threads freeOperationActionIds through action-effect lowering sequence checks', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'action-free-op-sequence-context', players: { min: 2, max: 4 } },
      zones: [{ id: 'deck:none', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
      turnStructure: { phases: [{ id: 'main' }] },
      turnOrder: {
        type: 'cardDriven' as const,
        config: {
          turnFlow: {
            ...minimalCardDrivenTurnFlow,
            actionClassByActionId: {
              pass: 'pass' as const,
              operation: 'operation' as const,
              limitedOp: 'limitedOperation' as const,
              grantOps: 'operation' as const,
            },
            freeOperationActionIds: ['operation'],
          },
        },
      },
      actions: [
        { id: 'pass', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] },
        { id: 'operation', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] },
        { id: 'limitedOp', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] },
        {
          id: 'grantOps',
          actor: 'active',
          executor: 'actor',
          phase: ['main'],
          params: [],
          pre: null,
          cost: [],
          effects: [
            {
              grantFreeOperation: {
                seat: 'arvn',
                operationClass: 'operation',
                actionIds: ['limitedOp'],
                sequence: { chain: 'action-sequence', step: 0 },
              },
            },
            {
              grantFreeOperation: {
                seat: 'arvn',
                operationClass: 'operation',
                sequence: { chain: 'action-sequence', step: 1 },
              },
            },
          ],
          limits: [],
        },
      ],
      triggers: [],
      terminal: { conditions: [{ when: { op: '>=', left: 1, right: 1 }, result: { type: 'draw' } }] },
    };

    const result = compileGameSpecToGameDef(doc);
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_FREE_OPERATION_SEQUENCE_VIABILITY_RISK'
          && diagnostic.path === 'doc.actions.3.effects.1.grantFreeOperation.sequence',
      ),
      true,
    );
  });

  it('fails compile when actor uses non-canonical alias selector token', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'action-compile-alias-actor', players: { min: 2, max: 2 } },
      zones: [{ id: 'deck', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
      turnStructure: { phases: [{ id: 'main' }] },
      actions: [{ id: 'play', actor: 'activePlayer', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] }],
      triggers: [],
      terminal: { conditions: [{ when: { op: '>=', left: 1, right: 999 }, result: { type: 'draw' } }] },
    };

    const result = compileGameSpecToGameDef(doc);
    assert.equal(result.gameDef, null);
    assert.deepEqual(
      result.diagnostics.find((diagnostic) => diagnostic.path === 'doc.actions.0.actor'),
      {
        code: 'CNL_COMPILER_PLAYER_SELECTOR_INVALID',
        path: 'doc.actions.0.actor',
        severity: 'error',
        message: 'Non-canonical player selector: "activePlayer".',
        suggestion: 'Use "active".',
      },
    );
  });

  it('resolves seat names for action actor/executor and terminal win player when seats are derived from data assets', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'action-seat-name-resolution', players: { min: 4, max: 4 } },
      dataAssets: [
        {
          id: 'pieces',
          kind: 'pieceCatalog' as const,
          payload: {
            seats: [{ id: 'US' }, { id: 'ARVN' }, { id: 'NVA' }, { id: 'VC' }],
            pieceTypes: [
              { id: 'us-troops', seat: 'US', statusDimensions: [], transitions: [] },
              { id: 'arvn-troops', seat: 'ARVN', statusDimensions: [], transitions: [] },
              { id: 'nva-troops', seat: 'NVA', statusDimensions: [], transitions: [] },
              { id: 'vc-troops', seat: 'VC', statusDimensions: [], transitions: [] },
            ],
            inventory: [
              { pieceTypeId: 'us-troops', seat: 'US', total: 1 },
              { pieceTypeId: 'arvn-troops', seat: 'ARVN', total: 1 },
              { pieceTypeId: 'nva-troops', seat: 'NVA', total: 1 },
              { pieceTypeId: 'vc-troops', seat: 'VC', total: 1 },
            ],
          },
        },
      ],
      zones: [{ id: 'deck', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
      tokenTypes: null,
      turnStructure: { phases: [{ id: 'main' }] },
      actions: [{ id: 'play', actor: 'NVA', executor: 'us', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] }],
      triggers: [],
      terminal: { conditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'win', player: 'nva' } }] },
    };

    const result = compileGameSpecToGameDef(doc);
    assertNoDiagnostics(result);
    assert.deepEqual(result.gameDef?.actions[0]?.actor, { id: 2 });
    assert.deepEqual(result.gameDef?.actions[0]?.executor, { id: 0 });
    assert.deepEqual(result.gameDef?.terminal.conditions[0]?.result, { type: 'win', player: { id: 2 } });
  });

  it('resolves seat names for action actor/executor and terminal win player from turn-flow seats without piece-catalog seats', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'action-seat-name-resolution-turn-flow', players: { min: 4, max: 4 } },
      zones: [{ id: 'deck', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
      turnStructure: { phases: [{ id: 'main' }] },
      turnOrder: {
        type: 'cardDriven' as const,
        config: {
          turnFlow: {
            ...minimalCardDrivenTurnFlow,
            eligibility: {
              seats: ['US', 'ARVN', 'NVA', 'VC'],
              overrideWindows: [],
            },
          },
        },
      },
      actions: [{ id: 'pass', actor: 'NVA', executor: 'us', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] }],
      triggers: [],
      terminal: { conditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'win', player: 'vc' } }] },
    };

    const result = compileGameSpecToGameDef(doc);
    assertNoDiagnostics(result);
    assert.deepEqual(result.gameDef?.actions[0]?.actor, { id: 2 });
    assert.deepEqual(result.gameDef?.actions[0]?.executor, { id: 0 });
    assert.deepEqual(result.gameDef?.terminal.conditions[0]?.result, { type: 'win', player: { id: 3 } });
  });

  it('fails deterministically when seat-name selectors are used without canonical seat ids', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'action-seat-name-resolution-missing-seats', players: { min: 4, max: 4 } },
      zones: [{ id: 'deck', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
      turnStructure: { phases: [{ id: 'main' }] },
      actions: [{ id: 'play', actor: 'NVA', executor: 'us', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] }],
      triggers: [],
      terminal: { conditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'win', player: 'vc' } }] },
    };

    const result = compileGameSpecToGameDef(doc);
    assert.equal(result.gameDef, null);
    assert.deepEqual(
      result.diagnostics
        .filter((diagnostic) => diagnostic.code === 'CNL_COMPILER_PLAYER_SELECTOR_INVALID')
        .map((diagnostic) => diagnostic.path)
        .sort(),
      ['doc.actions.0.actor', 'doc.actions.0.executor', 'doc.terminal.conditions.0.result.player'],
    );
  });

  it('accepts binding-derived executor when binding is declared action param', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'action-executor-binding-compile', players: { min: 2, max: 2 } },
      zones: [{ id: 'pool', owner: 'none', visibility: 'public', ordering: 'set' }],
      turnStructure: { phases: [{ id: 'main' }] },
      actions: [
        {
          id: 'assign',
          actor: 'active',
          executor: '$owner',
          phase: ['main'],
          params: [{ name: '$owner', domain: { query: 'players' } }],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
      ],
      terminal: { conditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'draw' } }] },
    };

    const result = compileGameSpecToGameDef(doc);
    assertNoDiagnostics(result);
    assert.deepEqual(result.gameDef?.actions[0]?.executor, { chosen: '$owner' });
  });

  it('accepts binding-derived actor when binding is declared action param', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'action-actor-binding-compile', players: { min: 2, max: 2 } },
      zones: [{ id: 'pool', owner: 'none', visibility: 'public', ordering: 'set' }],
      turnStructure: { phases: [{ id: 'main' }] },
      actions: [
        {
          id: 'assign',
          actor: '$owner',
          executor: 'actor',
          phase: ['main'],
          params: [{ name: '$owner', domain: { query: 'players' } }],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
      ],
      terminal: { conditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'draw' } }] },
    };

    const result = compileGameSpecToGameDef(doc);
    assertNoDiagnostics(result);
    assert.deepEqual(result.gameDef?.actions[0]?.actor, { chosen: '$owner' });
  });

  it('rejects binding-derived executor when binding is not declared in action params', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'action-executor-binding-missing', players: { min: 2, max: 2 } },
      zones: [{ id: 'pool', owner: 'none', visibility: 'public', ordering: 'set' }],
      turnStructure: { phases: [{ id: 'main' }] },
      actions: [
        {
          id: 'assign',
          actor: 'active',
          executor: '$owner',
          phase: ['main'],
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
      ],
      terminal: { conditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'draw' } }] },
    };

    const result = compileGameSpecToGameDef(doc);
    assert.equal(result.gameDef, null);
    assert.equal(result.diagnostics.some((d) => d.code === 'CNL_COMPILER_ACTION_EXECUTOR_BINDING_MISSING'), true);
  });

  it('rejects binding-derived actor when binding is not declared in action params', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'action-actor-binding-missing', players: { min: 2, max: 2 } },
      zones: [{ id: 'pool', owner: 'none', visibility: 'public', ordering: 'set' }],
      turnStructure: { phases: [{ id: 'main' }] },
      actions: [
        {
          id: 'assign',
          actor: '$owner',
          executor: 'actor',
          phase: ['main'],
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
      ],
      terminal: { conditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'draw' } }] },
    };

    const result = compileGameSpecToGameDef(doc);
    assert.equal(result.gameDef, null);
    assert.equal(result.diagnostics.some((d) => d.code === 'CNL_COMPILER_ACTION_ACTOR_BINDING_MISSING'), true);
  });

  it('emits deterministic actor/executor binding diagnostics when both are missing', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'action-actor-executor-binding-missing', players: { min: 2, max: 2 } },
      zones: [{ id: 'pool', owner: 'none', visibility: 'public', ordering: 'set' }],
      turnStructure: { phases: [{ id: 'main' }] },
      actions: [
        {
          id: 'assign',
          actor: '$actorOwner',
          executor: '$execOwner',
          phase: ['main'],
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
      ],
      terminal: { conditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'draw' } }] },
    };

    const result = compileGameSpecToGameDef(doc);
    assert.equal(result.gameDef, null);
    const codesByPath = result.diagnostics
      .filter(
        (d) => d.code === 'CNL_COMPILER_ACTION_ACTOR_BINDING_MISSING' || d.code === 'CNL_COMPILER_ACTION_EXECUTOR_BINDING_MISSING',
      )
      .map((d) => `${d.path}:${d.code}`);
    assert.deepEqual(codesByPath, [
      'doc.actions.0.actor:CNL_COMPILER_ACTION_ACTOR_BINDING_MISSING',
      'doc.actions.0.executor:CNL_COMPILER_ACTION_EXECUTOR_BINDING_MISSING',
    ]);
  });

  it('covers compiler selector-contract matrix with deterministic diagnostic ordering', () => {
    for (const actorUsesBinding of [false, true] as const) {
      for (const executorUsesBinding of [false, true] as const) {
        for (const actorDeclared of [false, true] as const) {
          for (const executorDeclared of [false, true] as const) {
            for (const hasPipeline of [false, true] as const) {
              const params = [
                ...(actorUsesBinding && actorDeclared ? [{ name: '$actorOwner', domain: { query: 'players' as const } }] : []),
                ...(executorUsesBinding && executorDeclared ? [{ name: '$execOwner', domain: { query: 'players' as const } }] : []),
              ];
              const doc = {
                ...createEmptyGameSpecDoc(),
                metadata: { id: 'action-selector-contract-matrix', players: { min: 2, max: 2 } },
                zones: [{ id: 'pool', owner: 'none', visibility: 'public', ordering: 'set' }],
                turnStructure: { phases: [{ id: 'main' }] },
                actions: [
                  {
                    id: 'assign',
                    actor: actorUsesBinding ? '$actorOwner' : 'active',
                    executor: executorUsesBinding ? '$execOwner' : 'actor',
                    phase: ['main'],
                    params,
                    pre: null,
                    cost: [],
                    effects: [],
                    limits: [],
                  },
                ],
                ...(hasPipeline
                  ? {
                      actionPipelines: [
                        {
                          id: 'p',
                          actionId: 'assign',
                          legality: null,
                          costValidation: null,
                          costEffects: [],
                          targeting: {},
                          stages: [{ effects: [] }],
                          atomicity: 'atomic' as const,
                        },
                      ],
                    }
                  : {}),
                terminal: { conditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'draw' } }] },
              };

              const result = compileGameSpecToGameDef(doc);
              const codesByPath = result.diagnostics
                .filter((d) =>
                  [
                    'CNL_COMPILER_ACTION_ACTOR_BINDING_MISSING',
                    'CNL_COMPILER_ACTION_EXECUTOR_BINDING_MISSING',
                    CNL_XREF_DIAGNOSTIC_CODES.CNL_XREF_ACTION_EXECUTOR_PIPELINE_UNSUPPORTED,
                  ].includes(d.code),
                )
                .map((d) => `${d.path}:${d.code}`);

              const expected: string[] = [];
              if (actorUsesBinding && !actorDeclared) {
                expected.push('doc.actions.0.actor:CNL_COMPILER_ACTION_ACTOR_BINDING_MISSING');
              }
              if (executorUsesBinding && !executorDeclared) {
                expected.push('doc.actions.0.executor:CNL_COMPILER_ACTION_EXECUTOR_BINDING_MISSING');
              }
              if (
                executorUsesBinding &&
                hasPipeline &&
                (!actorUsesBinding || actorDeclared) &&
                executorDeclared
              ) {
                expected.push(
                  `doc.actions.0.executor:${CNL_XREF_DIAGNOSTIC_CODES.CNL_XREF_ACTION_EXECUTOR_PIPELINE_UNSUPPORTED}`,
                );
              }

              assert.deepEqual(
                codesByPath,
                expected,
                `actorUsesBinding=${actorUsesBinding} executorUsesBinding=${executorUsesBinding} actorDeclared=${actorDeclared} executorDeclared=${executorDeclared} hasPipeline=${hasPipeline}`,
              );
            }
          }
        }
      }
    }
  });

  it('rejects binding-derived executor for pipelined actions', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'action-executor-binding-pipeline', players: { min: 2, max: 2 } },
      zones: [{ id: 'pool', owner: 'none', visibility: 'public', ordering: 'set' }],
      turnStructure: { phases: [{ id: 'main' }] },
      actionPipelines: [
        {
          id: 'p',
          actionId: 'assign',
          legality: null,
          costValidation: null,
          costEffects: [],
          targeting: {},
          stages: [{ effects: [] }],
          atomicity: 'atomic' as const,
        },
      ],
      actions: [
        {
          id: 'assign',
          actor: 'active',
          executor: '$owner',
          phase: ['main'],
          params: [{ name: '$owner', domain: { query: 'players' } }],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
      ],
      terminal: { conditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'draw' } }] },
    };

    const result = compileGameSpecToGameDef(doc);
    assert.equal(result.gameDef, null);
    assert.equal(
      result.diagnostics.some((d) => d.code === CNL_XREF_DIAGNOSTIC_CODES.CNL_XREF_ACTION_EXECUTOR_PIPELINE_UNSUPPORTED),
      true,
    );
  });

  it('accepts non-prefixed action param bindings in pre/effects without implicit $ aliasing', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'action-param-binding-non-prefixed', players: { min: 2, max: 2 } },
      globalVars: [
        { name: 'bankA', type: 'int', init: 5, min: 0, max: 75 },
        { name: 'bankB', type: 'int', init: 0, min: 0, max: 75 },
      ],
      zones: [{ id: 'pool', owner: 'none', visibility: 'public', ordering: 'set' }],
      turnStructure: { phases: [{ id: 'main' }] },
      actions: [
        {
          id: 'transfer',
          actor: 'active',
          executor: 'actor',
          phase: ['main'],
          params: [{ name: 'amount', domain: { query: 'intsInRange', min: 1, max: 75 } }],
          pre: { op: '>=', left: { ref: 'gvar', var: 'bankA' }, right: { ref: 'binding', name: 'amount' } },
          cost: [],
          effects: [
            {
              addVar: {
                scope: 'global',
                var: 'bankA',
                delta: { op: '*', left: { ref: 'binding', name: 'amount' }, right: -1 },
              },
            },
            { addVar: { scope: 'global', var: 'bankB', delta: { ref: 'binding', name: 'amount' } } },
          ],
          limits: [],
        },
      ],
      terminal: { conditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'draw' } }] },
    };

    const result = compileGameSpecToGameDef(doc);
    assertNoDiagnostics(result);
    assert.notEqual(result.gameDef, null);
    const action = result.gameDef!.actions[0];
    assert.equal(action?.id, 'transfer');
    assert.equal(action?.params[0]?.name, 'amount');
  });

  it('rejects $-prefixed/non-prefixed binding name mismatches without aliasing', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'action-param-binding-mismatch', players: { min: 2, max: 2 } },
      globalVars: [{ name: 'bankA', type: 'int', init: 5, min: 0, max: 75 }],
      zones: [{ id: 'pool', owner: 'none', visibility: 'public', ordering: 'set' }],
      turnStructure: { phases: [{ id: 'main' }] },
      actions: [
        {
          id: 'transfer',
          actor: 'active',
          executor: 'actor',
          phase: ['main'],
          params: [{ name: '$amount', domain: { query: 'intsInRange', min: 1, max: 75 } }],
          pre: { op: '>=', left: { ref: 'gvar', var: 'bankA' }, right: { ref: 'binding', name: 'amount' } },
          cost: [],
          effects: [],
          limits: [],
        },
      ],
      terminal: { conditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'draw' } }] },
    };

    const result = compileGameSpecToGameDef(doc);
    assert.equal(result.gameDef, null);
    assert.equal(result.diagnostics.some((d) => d.code === 'CNL_COMPILER_BINDING_UNBOUND'), true);
  });
});
