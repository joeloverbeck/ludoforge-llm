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
  it('lowers valid authored policy library items into a typed GameDef.agents catalog', () => {
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
          stateFeatures: {
            currentMargin: {
              type: 'number',
              expr: { ref: 'victory.currentMargin.us' },
            },
          },
          candidateFeatures: {
            isPass: {
              type: 'boolean',
              expr: { ref: 'candidate.isPass' },
            },
            projectedMargin: {
              type: 'number',
              expr: {
                add: [
                  { ref: 'feature.currentMargin' },
                  { boolToNumber: { ref: 'feature.isPass' } },
                ],
              },
            },
          },
          candidateAggregates: {
            bestProjectedMargin: {
              op: 'max',
              of: { ref: 'feature.projectedMargin' },
              where: { not: { ref: 'feature.isPass' } },
            },
          },
          pruningRules: {
            dropPassWhenStrongerMoveExists: {
              when: {
                and: [
                  { ref: 'feature.isPass' },
                  { gt: [{ ref: 'aggregate.bestProjectedMargin' }, { param: 'passFloor' }] },
                ],
              },
              onEmpty: 'skipRule',
            },
          },
          scoreTerms: {
            preferEvents: {
              weight: 1,
              value: { boolToNumber: { ref: 'feature.isPass' } },
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
              scoreTerms: ['preferEvents'],
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
      library: {
        stateFeatures: {
          currentMargin: {
            type: 'number',
            costClass: 'state',
            expr: { ref: 'victory.currentMargin.us' },
            dependencies: {
              parameters: [],
              stateFeatures: [],
              candidateFeatures: [],
              aggregates: [],
            },
          },
        },
        candidateFeatures: {
          isPass: {
            type: 'boolean',
            costClass: 'candidate',
            expr: { ref: 'candidate.isPass' },
            dependencies: {
              parameters: [],
              stateFeatures: [],
              candidateFeatures: [],
              aggregates: [],
            },
          },
          projectedMargin: {
            type: 'number',
            costClass: 'candidate',
            expr: {
              add: [
                { ref: 'feature.currentMargin' },
                { boolToNumber: { ref: 'feature.isPass' } },
              ],
            },
            dependencies: {
              parameters: [],
              stateFeatures: ['currentMargin'],
              candidateFeatures: ['isPass'],
              aggregates: [],
            },
          },
        },
        candidateAggregates: {
          bestProjectedMargin: {
            type: 'number',
            costClass: 'candidate',
            op: 'max',
            of: { ref: 'feature.projectedMargin' },
            where: { not: { ref: 'feature.isPass' } },
            dependencies: {
              parameters: [],
              stateFeatures: [],
              candidateFeatures: ['isPass', 'projectedMargin'],
              aggregates: [],
            },
          },
        },
        pruningRules: {
          dropPassWhenStrongerMoveExists: {
            costClass: 'candidate',
            when: {
              and: [
                { ref: 'feature.isPass' },
                { gt: [{ ref: 'aggregate.bestProjectedMargin' }, { param: 'passFloor' }] },
              ],
            },
            dependencies: {
              parameters: ['passFloor'],
              stateFeatures: [],
              candidateFeatures: ['isPass'],
              aggregates: ['bestProjectedMargin'],
            },
            onEmpty: 'skipRule',
          },
        },
        scoreTerms: {
          preferEvents: {
            costClass: 'candidate',
            weight: 1,
            value: { boolToNumber: { ref: 'feature.isPass' } },
            dependencies: {
              parameters: [],
              stateFeatures: [],
              candidateFeatures: ['isPass'],
              aggregates: [],
            },
          },
        },
        tieBreakers: {
          stableMoveKey: {
            kind: 'stableMoveKey',
            costClass: 'state',
            dependencies: {
              parameters: [],
              stateFeatures: [],
              candidateFeatures: [],
              aggregates: [],
            },
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
            scoreTerms: ['preferEvents'],
            tieBreakers: ['stableMoveKey'],
          },
          plan: {
            stateFeatures: ['currentMargin'],
            candidateFeatures: ['isPass', 'projectedMargin'],
            candidateAggregates: ['bestProjectedMargin'],
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
              pruningRules: [],
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

  it('rejects policy dependency cycles and semantic expression violations', () => {
    const compiled = compileGameSpecToGameDef({
      ...createCompileReadyDoc(),
      agents: {
        parameters: {
          mode: {
            type: 'enum',
            default: 'safe',
            values: ['safe', 'bold'],
          },
        },
        library: {
          stateFeatures: {
            loopA: {
              type: 'number',
              expr: { add: [{ ref: 'feature.loopB' }, 1] },
            },
            loopB: {
              type: 'number',
              expr: { add: [{ ref: 'feature.loopA' }, 1] },
            },
          },
          candidateFeatures: {
            isPass: {
              type: 'boolean',
              expr: { ref: 'candidate.isPass' },
            },
            badPreview: {
              type: 'number',
              expr: { ref: 'preview.preview.metric.fake' },
            },
            badCandidateParam: {
              type: 'id',
              expr: { ref: 'candidate.param.mode.extra' },
            },
          },
          candidateAggregates: {
            badAggregate: {
              op: 'max',
              of: { ref: 'feature.isPass' },
            },
          },
          scoreTerms: {
            divideByZero: {
              weight: 1,
              value: { div: [1, 0] },
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
              pruningRules: [],
              scoreTerms: ['divideByZero'],
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
    assert.ok(compiled.diagnostics.some((diagnostic) => diagnostic.code === 'CNL_COMPILER_AGENT_DEPENDENCY_CYCLE' && diagnostic.path === 'doc.agents.library.stateFeatures.loopA'));
    assert.ok(compiled.diagnostics.some((diagnostic) => diagnostic.code === 'CNL_COMPILER_AGENT_POLICY_PREVIEW_NESTED' && diagnostic.path === 'doc.agents.library.candidateFeatures.badPreview.expr.ref'));
    assert.ok(compiled.diagnostics.some((diagnostic) => diagnostic.code === 'CNL_COMPILER_AGENT_CANDIDATE_PARAM_REF_INVALID' && diagnostic.path === 'doc.agents.library.candidateFeatures.badCandidateParam.expr.ref'));
    assert.ok(compiled.diagnostics.some((diagnostic) => diagnostic.code === 'CNL_COMPILER_AGENT_AGGREGATE_INPUT_INVALID' && diagnostic.path === 'doc.agents.library.candidateAggregates.badAggregate.of'));
    assert.ok(compiled.diagnostics.some((diagnostic) => diagnostic.code === 'CNL_COMPILER_AGENT_POLICY_DIVIDE_BY_ZERO' && diagnostic.path === 'doc.agents.library.scoreTerms.divideByZero.value'));
  });
});
