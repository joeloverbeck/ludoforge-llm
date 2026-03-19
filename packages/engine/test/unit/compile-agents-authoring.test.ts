import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef, createEmptyGameSpecDoc, validateGameSpec } from '../../src/cnl/index.js';
import type { GameSpecDoc } from '../../src/cnl/game-spec-doc.js';

function createCompileReadyDoc() {
  return {
    ...createEmptyGameSpecDoc(),
    metadata: { id: 'agents-demo', players: { min: 2, max: 2 } },
    zones: [{ id: 'deck', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
    turnStructure: { phases: [{ id: 'main' }] },
    actions: [
      {
        id: 'draw',
        actor: 'active',
        executor: 'actor',
        phase: ['main'],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
    ],
    terminal: { conditions: [{ when: { op: '==', left: 1, right: 0 }, result: { type: 'draw' } }] },
  };
}

describe('agents authoring surface', () => {
  it('lowers valid authored agent parameters, profiles, and bindings into GameDef.agents', () => {
    const result = compileGameSpecToGameDef({
      ...createCompileReadyDoc(),
      agents: {
        parameters: {
          passFloor: {
            type: 'number',
            default: 0.25,
            min: -5,
            max: 5,
            tunable: true,
          },
          mode: {
            type: 'enum',
            default: 'safe',
            values: ['safe', 'bold'],
          },
          tieOrder: {
            type: 'idOrder',
            default: ['projected', 'stable'],
            allowedIds: ['projected', 'stable'],
          },
        },
        library: {
          pruningRules: {
            dropPassWhenStrongerMoveExists: {
              when: {
                and: [{ ref: 'candidate.isPass' }, { gt: [{ ref: 'aggregate.bestNonPassProjectedMargin' }, { param: 'passFloor' }] }],
              },
              onEmpty: 'skipRule',
            },
          },
          tieBreakers: {
            stableMoveKey: {
              kind: 'stableMoveKey',
            },
          },
        },
        profiles: {
          baseline: {
            params: {
              passFloor: 0.5,
              mode: 'bold',
              tieOrder: ['stable', 'projected'],
            },
            use: {
              pruningRules: ['dropPassWhenStrongerMoveExists'],
              scoreTerms: [],
              tieBreakers: ['stableMoveKey'],
            },
          },
        },
        bindings: {
          us: 'baseline',
        },
      },
    });

    assert.equal(result.gameDef === null, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
    assert.deepEqual(result.gameDef?.agents, {
      schemaVersion: 1,
      parameterDefs: {
        passFloor: {
          type: 'number',
          required: false,
          tunable: true,
          default: 0.25,
          min: -5,
          max: 5,
        },
        mode: {
          type: 'enum',
          required: false,
          tunable: false,
          default: 'safe',
          values: ['safe', 'bold'],
        },
        tieOrder: {
          type: 'idOrder',
          required: false,
          tunable: false,
          default: ['projected', 'stable'],
          allowedIds: ['projected', 'stable'],
        },
      },
      profiles: {
        baseline: {
          params: {
            passFloor: 0.5,
            mode: 'bold',
            tieOrder: ['stable', 'projected'],
          },
          use: {
            pruningRules: ['dropPassWhenStrongerMoveExists'],
            scoreTerms: [],
            tieBreakers: ['stableMoveKey'],
          },
        },
      },
      bindingsBySeat: {
        us: 'baseline',
      },
    });
  });

  it('rejects malformed collection shapes, inline profile logic, and non-map bindings in validation and compile flows', () => {
    const doc = {
      ...createCompileReadyDoc(),
      agents: {
        parameters: [],
        profiles: {
          baseline: {
            params: {},
            pruningRules: [
              {
                when: { ref: 'candidate.isPass' },
              },
            ],
            use: {
              pruningRules: [{ inline: true }],
              tieBreakers: ['stableMoveKey'],
            },
          },
        },
        bindings: ['baseline'],
      },
    } as unknown as GameSpecDoc;

    const validationDiagnostics = validateGameSpec(doc);
    const compileDiagnostics = compileGameSpecToGameDef(doc).diagnostics;

    for (const diagnostics of [validationDiagnostics, compileDiagnostics]) {
      assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 'CNL_VALIDATOR_AGENTS_MAP_REQUIRED' && diagnostic.path === 'doc.agents.parameters'));
      assert.ok(
        diagnostics.some(
          (diagnostic) =>
            diagnostic.code === 'CNL_VALIDATOR_AGENTS_PROFILE_INLINE_LOGIC_FORBIDDEN' &&
            diagnostic.path === 'doc.agents.profiles.baseline.pruningRules',
        ),
      );
      assert.ok(
        diagnostics.some(
          (diagnostic) =>
            diagnostic.code === 'CNL_VALIDATOR_AGENTS_PROFILE_USE_ENTRY_INVALID' &&
            diagnostic.path === 'doc.agents.profiles.baseline.use.pruningRules.0',
        ),
      );
      assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 'CNL_VALIDATOR_AGENTS_MAP_REQUIRED' && diagnostic.path === 'doc.agents.bindings'));
    }

    const compiled = compileGameSpecToGameDef(doc);
    assert.equal(compiled.gameDef, null);
  });

  it('rejects invalid parameter defaults and profile overrides during lowering', () => {
    const compiled = compileGameSpecToGameDef({
      ...createCompileReadyDoc(),
      agents: {
        parameters: {
          requiredBias: {
            type: 'integer',
            min: 0,
            max: 3,
          },
          mode: {
            type: 'enum',
            default: 'safe',
            values: ['safe', 'bold'],
          },
          tieOrder: {
            type: 'idOrder',
            allowedIds: ['projected', 'stable'],
          },
          brokenDefault: {
            type: 'enum',
            default: 'unknown',
            values: ['safe', 'bold'],
          },
        },
        library: {
          pruningRules: {
            keepAll: {
              when: false,
            },
          },
          tieBreakers: {
            stableMoveKey: {
              kind: 'stableMoveKey',
            },
          },
        },
        profiles: {
          baseline: {
            params: {
              requiredBias: 4,
              mode: 'reckless',
              tieOrder: ['stable', 'stable'],
            },
            use: {
              pruningRules: ['keepAll'],
              scoreTerms: [],
              tieBreakers: ['stableMoveKey'],
            },
          },
        },
        bindings: {
          us: 'baseline',
        },
      },
    });

    assert.equal(compiled.gameDef, null);
    assert.ok(compiled.diagnostics.some((diagnostic) => diagnostic.code === 'CNL_COMPILER_AGENT_PARAMETER_DEFAULT_INVALID' && diagnostic.path === 'doc.agents.parameters.brokenDefault.default'));
    assert.ok(compiled.diagnostics.some((diagnostic) => diagnostic.code === 'CNL_COMPILER_AGENT_PROFILE_PARAM_VALUE_INVALID' && diagnostic.path === 'doc.agents.profiles.baseline.params.requiredBias'));
    assert.ok(compiled.diagnostics.some((diagnostic) => diagnostic.code === 'CNL_COMPILER_AGENT_PROFILE_PARAM_VALUE_INVALID' && diagnostic.path === 'doc.agents.profiles.baseline.params.mode'));
    assert.ok(compiled.diagnostics.some((diagnostic) => diagnostic.code === 'CNL_COMPILER_AGENT_PROFILE_PARAM_VALUE_INVALID' && diagnostic.path === 'doc.agents.profiles.baseline.params.tieOrder'));
  });

  it('rejects missing required parameters, duplicate profile list entries, unknown library ids, and unknown binding profiles', () => {
    const compiled = compileGameSpecToGameDef({
      ...createCompileReadyDoc(),
      agents: {
        parameters: {
          requiredBias: {
            type: 'integer',
            min: 0,
            max: 3,
          },
        },
        library: {
          pruningRules: {
            keepAll: {
              when: false,
            },
          },
          tieBreakers: {
            stableMoveKey: {
              kind: 'stableMoveKey',
            },
          },
        },
        profiles: {
          baseline: {
            params: {},
            use: {
              pruningRules: ['keepAll', 'keepAll'],
              scoreTerms: [],
              tieBreakers: ['stableMoveKey', 'unknownTieBreaker'],
            },
          },
        },
        bindings: {
          us: 'missing-profile',
        },
      },
    });

    assert.equal(compiled.gameDef, null);
    assert.ok(compiled.diagnostics.some((diagnostic) => diagnostic.code === 'CNL_COMPILER_AGENT_PROFILE_PARAM_MISSING' && diagnostic.path === 'doc.agents.profiles.baseline.params'));
    assert.ok(compiled.diagnostics.some((diagnostic) => diagnostic.code === 'CNL_COMPILER_AGENT_PROFILE_USE_DUPLICATE_ID' && diagnostic.path === 'doc.agents.profiles.baseline.use.pruningRules.1'));
    assert.ok(compiled.diagnostics.some((diagnostic) => diagnostic.code === 'CNL_COMPILER_AGENT_PROFILE_USE_UNKNOWN_ID' && diagnostic.path === 'doc.agents.profiles.baseline.use.tieBreakers.1'));
    assert.ok(compiled.diagnostics.some((diagnostic) => diagnostic.code === 'CNL_COMPILER_AGENT_BINDING_UNKNOWN_PROFILE' && diagnostic.path === 'doc.agents.bindings.us'));
  });
});
