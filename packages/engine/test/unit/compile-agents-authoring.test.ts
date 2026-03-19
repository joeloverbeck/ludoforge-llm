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

function createSeatCatalogAsset(seatIds: readonly string[]) {
  return {
    id: 'seats',
    kind: 'seatCatalog' as const,
    payload: {
      seats: seatIds.map((seatId) => ({ id: seatId })),
    },
  };
}

describe('agents authoring surface', () => {
  it('lowers valid authored policy library items into a typed GameDef.agents catalog', () => {
    const result = compileGameSpecToGameDef({
      ...createCompileReadyDoc(),
      dataAssets: [createSeatCatalogAsset(['us', 'arvn'])],
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
    const agents = result.gameDef?.agents;
    assert.ok(agents !== undefined);
    const baselineProfile = agents.profiles.baseline;
    assert.ok(baselineProfile !== undefined);
    assert.match(agents.catalogFingerprint, /^[0-9a-f]{64}$/u);
    assert.match(baselineProfile.fingerprint, /^[0-9a-f]{64}$/u);
    assert.deepEqual(agents.parameterDefs, {
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
    });
    assert.deepEqual(agents.candidateParamDefs, {});
    assert.deepEqual(agents.library, {
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
    });
    assert.deepEqual(baselineProfile.params, {
      passFloor: 0.5,
      mode: 'bold',
      tieOrder: ['stable', 'projected'],
    });
    assert.deepEqual(baselineProfile.use, {
      pruningRules: ['dropPassWhenStrongerMoveExists'],
      scoreTerms: ['preferEvents'],
      tieBreakers: ['stableMoveKey'],
    });
    assert.deepEqual(baselineProfile.plan, {
      stateFeatures: ['currentMargin'],
      candidateFeatures: ['isPass', 'projectedMargin'],
      candidateAggregates: ['bestProjectedMargin'],
    });
    assert.deepEqual(agents.bindingsBySeat, {
      us: 'baseline',
    });
  });

  it('keeps catalog and profile fingerprints stable across equivalent authored insertion order', () => {
    const baseDoc = {
      ...createCompileReadyDoc(),
      dataAssets: [createSeatCatalogAsset(['us'])],
      agents: {
        parameters: {
          mode: {
            type: 'enum' as const,
            default: 'safe',
            values: ['safe', 'bold'],
          },
          passFloor: {
            type: 'number' as const,
            default: 0.25,
            min: -5,
            max: 5,
            tunable: true,
          },
        },
        library: {
          candidateFeatures: {
            projectedMargin: {
              type: 'number' as const,
              expr: {
                add: [
                  { ref: 'feature.currentMargin' },
                  { boolToNumber: { ref: 'feature.isPass' } },
                ],
              },
            },
            isPass: {
              type: 'boolean' as const,
              expr: { ref: 'candidate.isPass' },
            },
          },
          stateFeatures: {
            currentMargin: {
              type: 'number' as const,
              expr: { ref: 'victory.currentMargin.us' },
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
              kind: 'stableMoveKey' as const,
            },
          },
          pruningRules: {},
          candidateAggregates: {},
        },
        profiles: {
          baseline: {
            params: {
              passFloor: 0.5,
              mode: 'bold',
            },
            use: {
              pruningRules: [],
              scoreTerms: ['preferEvents'],
              tieBreakers: ['stableMoveKey'],
            },
          },
        },
        bindings: {
          us: 'baseline',
        },
      },
    };
    const reorderedDoc = {
      ...createCompileReadyDoc(),
      dataAssets: [createSeatCatalogAsset(['us'])],
      agents: {
        bindings: {
          us: 'baseline',
        },
        profiles: {
          baseline: {
            params: {
              mode: 'bold',
              passFloor: 0.5,
            },
            use: {
              tieBreakers: ['stableMoveKey'],
              scoreTerms: ['preferEvents'],
              pruningRules: [],
            },
          },
        },
        library: {
          candidateAggregates: {},
          pruningRules: {},
          tieBreakers: {
            stableMoveKey: {
              kind: 'stableMoveKey' as const,
            },
          },
          scoreTerms: {
            preferEvents: {
              value: { boolToNumber: { ref: 'feature.isPass' } },
              weight: 1,
            },
          },
          stateFeatures: {
            currentMargin: {
              expr: { ref: 'victory.currentMargin.us' },
              type: 'number' as const,
            },
          },
          candidateFeatures: {
            isPass: {
              expr: { ref: 'candidate.isPass' },
              type: 'boolean' as const,
            },
            projectedMargin: {
              expr: {
                add: [
                  { ref: 'feature.currentMargin' },
                  { boolToNumber: { ref: 'feature.isPass' } },
                ],
              },
              type: 'number' as const,
            },
          },
        },
        parameters: {
          passFloor: {
            max: 5,
            tunable: true,
            min: -5,
            default: 0.25,
            type: 'number' as const,
          },
          mode: {
            values: ['safe', 'bold'],
            default: 'safe',
            type: 'enum' as const,
          },
        },
      },
    };

    const first = compileGameSpecToGameDef(baseDoc);
    const second = compileGameSpecToGameDef(reorderedDoc);

    assert.equal(first.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
    assert.equal(second.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
    const firstAgents = first.gameDef?.agents;
    const secondAgents = second.gameDef?.agents;
    assert.ok(firstAgents !== undefined);
    assert.ok(secondAgents !== undefined);
    const firstBaselineProfile = firstAgents.profiles.baseline;
    const secondBaselineProfile = secondAgents.profiles.baseline;
    assert.ok(firstBaselineProfile !== undefined);
    assert.ok(secondBaselineProfile !== undefined);
    assert.equal(firstAgents.catalogFingerprint, secondAgents.catalogFingerprint);
    assert.equal(
      firstBaselineProfile.fingerprint,
      secondBaselineProfile.fingerprint,
    );
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

  it('rejects bindings when canonical seat ids cannot be resolved from data assets', () => {
    const compiled = compileGameSpecToGameDef({
      ...createCompileReadyDoc(),
      agents: {
        library: {
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
    assert.ok(
      compiled.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_AGENT_BINDING_SEAT_CATALOG_UNRESOLVED'
          && diagnostic.path === 'doc.agents.bindings',
      ),
    );
  });

  it('rejects bindings that target seats absent from the resolved canonical seat catalog', () => {
    const compiled = compileGameSpecToGameDef({
      ...createCompileReadyDoc(),
      dataAssets: [createSeatCatalogAsset(['us', 'arvn'])],
      agents: {
        library: {
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
              scoreTerms: [],
              tieBreakers: ['stableMoveKey'],
            },
          },
        },
        bindings: {
          vc: 'baseline',
        },
      },
    });

    assert.equal(compiled.gameDef, null);
    assert.ok(
      compiled.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_AGENT_BINDING_UNKNOWN_SEAT'
          && diagnostic.path === 'doc.agents.bindings.vc',
      ),
    );
  });

  it('rejects unsupported refs that try to reach presentation or raw-state paths', () => {
    const compiled = compileGameSpecToGameDef({
      ...createCompileReadyDoc(),
      dataAssets: [createSeatCatalogAsset(['us'])],
      agents: {
        library: {
          candidateFeatures: {
            presentationLeak: {
              type: 'id',
              expr: { ref: 'visualConfig.table.theme' },
            },
            rawStateLeak: {
              type: 'id',
              expr: { ref: 'state.zones.deck.cards' },
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
    assert.ok(
      compiled.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_AGENT_POLICY_REF_UNKNOWN'
          && diagnostic.path === 'doc.agents.library.candidateFeatures.presentationLeak.expr.ref',
      ),
    );
    assert.ok(
      compiled.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_AGENT_POLICY_REF_UNKNOWN'
          && diagnostic.path === 'doc.agents.library.candidateFeatures.rawStateLeak.expr.ref',
      ),
    );
  });

  it('rejects policy dependency cycles and semantic expression violations', () => {
    const compiled = compileGameSpecToGameDef({
      ...createCompileReadyDoc(),
      dataAssets: [createSeatCatalogAsset(['us'])],
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

  it('derives candidate.param refs from concrete action params instead of agents parameters', () => {
    const compiled = compileGameSpecToGameDef({
      ...createCompileReadyDoc(),
      dataAssets: [createSeatCatalogAsset(['us'])],
      actions: [
        {
          id: 'event',
          actor: 'active',
          executor: 'actor',
          phase: ['main'],
          params: [
            { name: 'eventCardId', domain: { query: 'enums', values: ['card-1', 'card-2'] } },
            { name: 'spaces', domain: { query: 'intsInRange', min: 1, max: 3 } },
          ],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
      ],
      agents: {
        parameters: {
          tuningMode: {
            type: 'enum',
            default: 'safe',
            values: ['safe', 'bold'],
          },
        },
        library: {
          candidateFeatures: {
            chosenCard: {
              type: 'id',
              expr: { ref: 'candidate.param.eventCardId' },
            },
            selectedSpaces: {
              type: 'number',
              expr: { ref: 'candidate.param.spaces' },
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

    assert.equal(compiled.gameDef === null, false);
    assert.equal(compiled.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
    assert.deepEqual(compiled.gameDef?.agents?.candidateParamDefs, {
      eventCardId: { type: 'id' },
      spaces: { type: 'number' },
    });
  });

  it('rejects candidate.param refs that alias agents parameters instead of concrete action params', () => {
    const compiled = compileGameSpecToGameDef({
      ...createCompileReadyDoc(),
      dataAssets: [createSeatCatalogAsset(['us'])],
      actions: [
        {
          id: 'event',
          actor: 'active',
          executor: 'actor',
          phase: ['main'],
          params: [{ name: 'eventCardId', domain: { query: 'enums', values: ['card-1'] } }],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
      ],
      agents: {
        parameters: {
          tuningMode: {
            type: 'enum',
            default: 'safe',
            values: ['safe', 'bold'],
          },
        },
        library: {
          candidateFeatures: {
            invalidAlias: {
              type: 'id',
              expr: { ref: 'candidate.param.tuningMode' },
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
    assert.ok(
      compiled.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_AGENT_CANDIDATE_PARAM_REF_INVALID'
          && diagnostic.path === 'doc.agents.library.candidateFeatures.invalidAlias.expr.ref',
      ),
    );
  });

  it('rejects candidate.param refs when concrete actions define the same param name with conflicting policy types', () => {
    const compiled = compileGameSpecToGameDef({
      ...createCompileReadyDoc(),
      dataAssets: [createSeatCatalogAsset(['us'])],
      actions: [
        {
          id: 'alpha',
          actor: 'active',
          executor: 'actor',
          phase: ['main'],
          params: [{ name: 'target', domain: { query: 'enums', values: ['zone-a', 'zone-b'] } }],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
        {
          id: 'beta',
          actor: 'active',
          executor: 'actor',
          phase: ['main'],
          params: [{ name: 'target', domain: { query: 'intsInRange', min: 1, max: 2 } }],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
      ],
      agents: {
        parameters: {},
        library: {
          candidateFeatures: {
            conflictingTarget: {
              type: 'id',
              expr: { ref: 'candidate.param.target' },
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
    assert.ok(
      compiled.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_AGENT_CANDIDATE_PARAM_REF_INVALID'
          && diagnostic.path === 'doc.agents.library.candidateFeatures.conflictingTarget.expr.ref',
      ),
    );
  });

  it('rejects metric refs whose ids are not declared in authored derivedMetrics', () => {
    const compiled = compileGameSpecToGameDef({
      ...createCompileReadyDoc(),
      dataAssets: [createSeatCatalogAsset(['us'])],
      derivedMetrics: [
        {
          id: 'knownMetric',
          computation: 'markerTotal',
          requirements: [{ key: 'population', expectedType: 'number' }],
          runtime: {
            kind: 'markerTotal',
            markerId: 'support',
            markerConfig: {
              activeState: 'activeSupport',
              passiveState: 'passiveSupport',
            },
            defaultMarkerState: 'neutral',
          },
        },
      ],
      agents: {
        parameters: {},
        library: {
          stateFeatures: {
            supportedMetric: {
              type: 'number',
              expr: { ref: 'metric.knownMetric' },
            },
            missingMetric: {
              type: 'number',
              expr: { ref: 'metric.missingMetric' },
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
    assert.equal(
      compiled.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_AGENT_POLICY_REF_UNKNOWN'
          && diagnostic.path === 'doc.agents.library.stateFeatures.missingMetric.expr.ref',
      ),
      true,
    );
    assert.equal(
      compiled.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_AGENT_POLICY_REF_UNKNOWN'
          && diagnostic.path === 'doc.agents.library.stateFeatures.supportedMetric.expr.ref',
      ),
      false,
    );
  });
});
