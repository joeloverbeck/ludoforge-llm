import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef, createEmptyGameSpecDoc, validateGameSpec } from '../../src/cnl/index.js';
import type { GameSpecDoc } from '../../src/cnl/game-spec-doc.js';
import type { AgentPolicyExpr, AgentPolicyLiteral, CompiledAgentPolicyRef } from '../../src/kernel/types.js';

const literal = (value: AgentPolicyLiteral): AgentPolicyExpr => ({ kind: 'literal', value });
const refExpr = (ref: CompiledAgentPolicyRef): AgentPolicyExpr => ({ kind: 'ref', ref });
const opExpr = (op: Extract<AgentPolicyExpr, { readonly kind: 'op' }>['op'], ...args: AgentPolicyExpr[]): AgentPolicyExpr => ({
  kind: 'op',
  op,
  args,
});
const paramExpr = (id: string): AgentPolicyExpr => ({ kind: 'param', id });

function createCompileReadyDoc() {
  return {
    ...createEmptyGameSpecDoc(),
    metadata: { id: 'agents-demo', players: { min: 2, max: 2 } },
    zones: [{ id: 'deck', owner: 'none', visibility: 'hidden', ordering: 'stack', attributes: { population: 0 } }],
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
    terminal: {
      conditions: [{ when: { op: '==', left: 1, right: 0 }, result: { type: 'draw' } }],
      margins: [
        { seat: 'us', value: 0 },
        { seat: 'arvn', value: 0 },
      ],
      ranking: {
        order: 'desc' as const,
      },
    },
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

function createVisibility(overrides: NonNullable<NonNullable<GameSpecDoc['agents']>['visibility']> = {}) {
  return {
    globalVars: overrides.globalVars ?? {},
    perPlayerVars: overrides.perPlayerVars ?? {},
    derivedMetrics: overrides.derivedMetrics ?? {},
    victory: {
      currentMargin: {
        current: 'public' as const,
        ...(overrides.victory?.currentMargin ?? {}),
      },
      ...(overrides.victory?.currentRank === undefined ? {} : { currentRank: overrides.victory.currentRank }),
    },
  };
}

describe('agents authoring surface', () => {
  it('lowers valid authored policy library items into a typed GameDef.agents catalog', () => {
    const result = compileGameSpecToGameDef({
      ...createCompileReadyDoc(),
      dataAssets: [createSeatCatalogAsset(['us', 'arvn'])],
      agents: {
        visibility: createVisibility(),
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
          completionScoreTerms: {},
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
              completionScoreTerms: [],
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
    assert.deepEqual(agents.surfaceVisibility, {
      globalVars: {},
      perPlayerVars: {},
      derivedMetrics: {},
      victory: {
        currentMargin: {
          current: 'public',
          preview: {
            visibility: 'public',
            allowWhenHiddenSampling: false,
          },
        },
        currentRank: {
          current: 'hidden',
          preview: {
            visibility: 'hidden',
            allowWhenHiddenSampling: false,
          },
        },
      },
    });
    assert.deepEqual(agents.library, {
      stateFeatures: {
        currentMargin: {
          type: 'number',
          costClass: 'state',
          expr: refExpr({
            kind: 'currentSurface',
            family: 'victoryCurrentMargin',
            id: 'currentMargin',
            selector: { kind: 'role', seatToken: 'us' },
          }),
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
          expr: refExpr({ kind: 'candidateIntrinsic', intrinsic: 'isPass' }),
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
          expr: opExpr(
            'add',
            refExpr({ kind: 'library', refKind: 'stateFeature', id: 'currentMargin' }),
            opExpr('boolToNumber', refExpr({ kind: 'library', refKind: 'candidateFeature', id: 'isPass' })),
          ),
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
          of: refExpr({ kind: 'library', refKind: 'candidateFeature', id: 'projectedMargin' }),
          where: opExpr('not', refExpr({ kind: 'library', refKind: 'candidateFeature', id: 'isPass' })),
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
          when: opExpr(
            'and',
            refExpr({ kind: 'library', refKind: 'candidateFeature', id: 'isPass' }),
            opExpr(
              'gt',
              refExpr({ kind: 'library', refKind: 'aggregate', id: 'bestProjectedMargin' }),
              paramExpr('passFloor'),
            ),
          ),
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
          weight: literal(1),
          value: opExpr('boolToNumber', refExpr({ kind: 'library', refKind: 'candidateFeature', id: 'isPass' })),
          dependencies: {
            parameters: [],
            stateFeatures: [],
            candidateFeatures: ['isPass'],
            aggregates: [],
          },
        },
      },
      completionScoreTerms: {},
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
      completionScoreTerms: [],
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
        visibility: createVisibility(),
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
          completionScoreTerms: {},
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
              completionScoreTerms: [],
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
        visibility: createVisibility(),
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
              completionScoreTerms: [],
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

  it('lowers completion guidance authoring into compiled completion score terms and profile config', () => {
    const result = compileGameSpecToGameDef({
      ...createCompileReadyDoc(),
      dataAssets: [createSeatCatalogAsset(['us'])],
      agents: {
        visibility: createVisibility(),
        parameters: {},
        library: {
          completionScoreTerms: {
            preferNamedOption: {
              when: { eq: [{ ref: 'decision.type' }, 'chooseOne'] },
              weight: 2,
              value: {
                if: [
                  { eq: [{ ref: 'option.value' }, 'zone-a'] },
                  1,
                  0,
                ],
              },
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
              completionScoreTerms: ['preferNamedOption'],
              tieBreakers: ['stableMoveKey'],
            },
            completionGuidance: {
              enabled: true,
              fallback: 'first',
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
    assert.deepEqual(result.gameDef?.agents?.library.completionScoreTerms.preferNamedOption, {
      costClass: 'state',
      when: opExpr('eq', refExpr({ kind: 'decisionIntrinsic', intrinsic: 'type' }), literal('chooseOne')),
      weight: literal(2),
      value: opExpr(
        'if',
        opExpr('eq', refExpr({ kind: 'optionIntrinsic', intrinsic: 'value' }), literal('zone-a')),
        literal(1),
        literal(0),
      ),
      dependencies: {
        parameters: [],
        stateFeatures: [],
        candidateFeatures: [],
        aggregates: [],
      },
    });
    assert.deepEqual(result.gameDef?.agents?.profiles.baseline?.use.completionScoreTerms, ['preferNamedOption']);
    assert.deepEqual(result.gameDef?.agents?.profiles.baseline?.completionGuidance, {
      enabled: true,
      fallback: 'first',
    });
  });

  it('lowers dynamic zoneProp completion guidance terms through the shared expression pipeline', () => {
    const result = compileGameSpecToGameDef({
      ...createCompileReadyDoc(),
      zones: [
        { id: 'target-a:none', owner: 'none', visibility: 'public', ordering: 'set', category: 'province', attributes: { population: 4 } },
        { id: 'target-b:none', owner: 'none', visibility: 'public', ordering: 'set', category: 'province', attributes: { population: 1 } },
      ],
      dataAssets: [createSeatCatalogAsset(['us'])],
      agents: {
        visibility: createVisibility(),
        parameters: {},
        library: {
          completionScoreTerms: {
            preferHigherPopulation: {
              when: { eq: [{ ref: 'decision.type' }, 'chooseOne'] },
              weight: 1,
              value: {
                coalesce: [
                  {
                    zoneProp: {
                      zone: { ref: 'option.value' },
                      prop: 'population',
                    },
                  },
                  0,
                ],
              },
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
              completionScoreTerms: ['preferHigherPopulation'],
              tieBreakers: ['stableMoveKey'],
            },
            completionGuidance: {
              enabled: true,
              fallback: 'first',
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
    assert.deepEqual(result.gameDef?.agents?.library.completionScoreTerms.preferHigherPopulation, {
      costClass: 'state',
      when: opExpr('eq', refExpr({ kind: 'decisionIntrinsic', intrinsic: 'type' }), literal('chooseOne')),
      weight: literal(1),
      value: opExpr(
        'coalesce',
        {
          kind: 'zoneProp',
          zone: refExpr({ kind: 'optionIntrinsic', intrinsic: 'value' }),
          prop: 'population',
        },
        literal(0),
      ),
      dependencies: {
        parameters: [],
        stateFeatures: [],
        candidateFeatures: [],
        aggregates: [],
      },
    });
  });

  it('lowers candidate.paramCount refs through the shared candidate intrinsic contract', () => {
    const result = compileGameSpecToGameDef({
      ...createCompileReadyDoc(),
      dataAssets: [createSeatCatalogAsset(['us'])],
      agents: {
        visibility: createVisibility(),
        parameters: {},
        library: {
          candidateFeatures: {
            paramLoad: {
              type: 'number',
              expr: { ref: 'candidate.paramCount' },
            },
          },
          scoreTerms: {
            rewardLoadedMoves: {
              weight: 1,
              value: { ref: 'feature.paramLoad' },
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
              scoreTerms: ['rewardLoadedMoves'],
              completionScoreTerms: [],
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
    const paramLoad = result.gameDef?.agents?.library.candidateFeatures.paramLoad;
    assert.ok(paramLoad !== undefined);
    assert.deepEqual(paramLoad.expr, {
      kind: 'ref',
      ref: { kind: 'candidateIntrinsic', intrinsic: 'paramCount' },
    });
  });

  it('rejects invalid completion guidance fallback values', () => {
    const result = compileGameSpecToGameDef({
      ...createCompileReadyDoc(),
      dataAssets: [createSeatCatalogAsset(['us'])],
      agents: {
        visibility: createVisibility(),
        parameters: {},
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
              completionScoreTerms: [],
              tieBreakers: ['stableMoveKey'],
            },
            completionGuidance: {
              enabled: true,
              fallback: 'last' as 'random',
            },
          },
        },
        bindings: {
          us: 'baseline',
        },
      },
    });

    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.path === 'doc.agents.profiles.baseline.completionGuidance.fallback'), true);
    assert.equal(result.gameDef?.agents?.profiles.baseline, undefined);
  });

  it('compiles preview.tolerateRngDivergence from profile YAML into CompiledAgentProfile.preview', () => {
    const result = compileGameSpecToGameDef({
      ...createCompileReadyDoc(),
      dataAssets: [createSeatCatalogAsset(['us'])],
      agents: {
        visibility: createVisibility(),
        parameters: {},
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
              completionScoreTerms: [],
              tieBreakers: ['stableMoveKey'],
            },
            preview: {
              tolerateRngDivergence: true,
            },
          },
        },
        bindings: {
          us: 'baseline',
        },
      },
    });

    assert.equal(result.diagnostics.some((d) => d.severity === 'error'), false);
    assert.deepEqual(result.gameDef?.agents?.profiles.baseline?.preview, {
      tolerateRngDivergence: true,
    });
  });

  it('omits preview field when profile YAML has no preview section', () => {
    const result = compileGameSpecToGameDef({
      ...createCompileReadyDoc(),
      dataAssets: [createSeatCatalogAsset(['us'])],
      agents: {
        visibility: createVisibility(),
        parameters: {},
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
              completionScoreTerms: [],
              tieBreakers: ['stableMoveKey'],
            },
          },
        },
        bindings: {
          us: 'baseline',
        },
      },
    });

    assert.equal(result.diagnostics.some((d) => d.severity === 'error'), false);
    assert.equal(result.gameDef?.agents?.profiles.baseline?.preview, undefined);
  });

  it('emits diagnostic when preview.tolerateRngDivergence is not a boolean', () => {
    const result = compileGameSpecToGameDef({
      ...createCompileReadyDoc(),
      dataAssets: [createSeatCatalogAsset(['us'])],
      agents: {
        visibility: createVisibility(),
        parameters: {},
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
              completionScoreTerms: [],
              tieBreakers: ['stableMoveKey'],
            },
            preview: {
              tolerateRngDivergence: 'yes' as unknown as boolean,
            },
          },
        },
        bindings: {
          us: 'baseline',
        },
      },
    });

    assert.equal(
      result.diagnostics.some((d) => d.path === 'doc.agents.profiles.baseline.preview.tolerateRngDivergence'),
      true,
    );
  });

  it('validates profile.use library references during authoring validation', () => {
    const diagnostics = validateGameSpec({
      ...createCompileReadyDoc(),
      dataAssets: [createSeatCatalogAsset(['us'])],
      agents: {
        visibility: createVisibility(),
        library: {
          pruningRules: {
            knownPrune: {
              when: true,
              onEmpty: 'skipRule',
            },
          },
          scoreTerms: {
            knownScore: {
              weight: 1,
              value: 1,
            },
          },
          completionScoreTerms: {
            knownCompletion: {
              weight: 1,
              value: 1,
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
              pruningRules: ['missingPrune'],
              scoreTerms: ['missingScore'],
              completionScoreTerms: ['missingCompletion'],
              tieBreakers: ['missingTieBreaker'],
            },
          },
        },
        bindings: {
          us: 'baseline',
        },
      },
    });

    assert.ok(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_VALIDATOR_AGENTS_PROFILE_USE_UNKNOWN_ID'
          && diagnostic.path === 'doc.agents.profiles.baseline.use.pruningRules.0',
      ),
    );
    assert.ok(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_VALIDATOR_AGENTS_PROFILE_USE_UNKNOWN_ID'
          && diagnostic.path === 'doc.agents.profiles.baseline.use.scoreTerms.0',
      ),
    );
    assert.ok(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_VALIDATOR_AGENTS_PROFILE_USE_UNKNOWN_ID'
          && diagnostic.path === 'doc.agents.profiles.baseline.use.completionScoreTerms.0',
      ),
    );
    assert.ok(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_VALIDATOR_AGENTS_PROFILE_USE_UNKNOWN_ID'
          && diagnostic.path === 'doc.agents.profiles.baseline.use.tieBreakers.0',
      ),
    );
  });

  it('warns when completion guidance is enabled without valid completion score terms', () => {
    const diagnostics = validateGameSpec({
      ...createCompileReadyDoc(),
      dataAssets: [createSeatCatalogAsset(['us'])],
      agents: {
        visibility: createVisibility(),
        library: {
          completionScoreTerms: {},
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
              completionScoreTerms: [],
              tieBreakers: ['stableMoveKey'],
            },
            completionGuidance: {
              enabled: true,
              fallback: 'first',
            },
          },
        },
        bindings: {
          us: 'baseline',
        },
      },
    });

    assert.ok(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_VALIDATOR_AGENTS_COMPLETION_GUIDANCE_MISSING_TERMS'
          && diagnostic.path === 'doc.agents.profiles.baseline.completionGuidance'
          && diagnostic.severity === 'warning',
      ),
    );
  });

  it('accepts valid completion guidance references without validator diagnostics', () => {
    const diagnostics = validateGameSpec({
      ...createCompileReadyDoc(),
      dataAssets: [createSeatCatalogAsset(['us'])],
      agents: {
        visibility: createVisibility(),
        library: {
          completionScoreTerms: {
            preferNamedOption: {
              when: { eq: [{ ref: 'decision.type' }, 'chooseOne'] },
              weight: 2,
              value: {
                if: [
                  { eq: [{ ref: 'option.value' }, 'zone-a'] },
                  1,
                  0,
                ],
              },
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
              completionScoreTerms: ['preferNamedOption'],
              tieBreakers: ['stableMoveKey'],
            },
            completionGuidance: {
              enabled: true,
              fallback: 'first',
            },
          },
        },
        bindings: {
          us: 'baseline',
        },
      },
    });

    assert.equal(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_VALIDATOR_AGENTS_PROFILE_USE_UNKNOWN_ID'
          || diagnostic.code === 'CNL_VALIDATOR_AGENTS_COMPLETION_GUIDANCE_MISSING_TERMS'
          || diagnostic.path === 'doc.agents.profiles.baseline.completionGuidance.fallback',
      ),
      false,
    );
  });

  it('rejects refs whose shared visibility contract marks them hidden', () => {
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
        visibility: createVisibility({
          derivedMetrics: {
            knownMetric: {
              current: 'hidden',
            },
          },
        }),
        library: {
          stateFeatures: {
            hiddenMetric: {
              type: 'number',
              expr: { ref: 'metric.knownMetric' },
            },
          },
          completionScoreTerms: {},
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
              completionScoreTerms: [],
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
          && diagnostic.path === 'doc.agents.library.stateFeatures.hiddenMetric.expr.ref',
      ),
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
              completionScoreTerms: [],
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
              completionScoreTerms: [],
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
              completionScoreTerms: [],
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
              completionScoreTerms: [],
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
          completionScoreTerms: {},
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
              completionScoreTerms: [],
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
              completionScoreTerms: [],
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
              completionScoreTerms: [],
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
              completionScoreTerms: [],
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

  it('derives exact chooseN id-list candidate params from static action choice binds', () => {
    const compiled = compileGameSpecToGameDef({
      ...createCompileReadyDoc(),
      dataAssets: [createSeatCatalogAsset(['us'])],
      actions: [
        {
          id: 'event',
          actor: 'active',
          executor: 'actor',
          phase: ['main'],
          params: [],
          pre: null,
          cost: [],
          effects: [
            { chooseN: { bind: '$targets', options: { query: 'zones' }, n: 2 } },
          ],
          limits: [],
        },
      ],
      agents: {
        parameters: {},
        library: {
          candidateFeatures: {
            targetsZoneA: {
              type: 'boolean',
              expr: { in: ['zone-a', { ref: 'candidate.param.$targets' }] },
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
              completionScoreTerms: [],
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
      '$targets': {
        type: 'idList',
        cardinality: {
          kind: 'exact',
          n: 2,
        },
      },
    });
  });

  it('rejects candidate.param refs for chooseN binds without static exact id-list contracts', () => {
    const compiled = compileGameSpecToGameDef({
      ...createCompileReadyDoc(),
      dataAssets: [createSeatCatalogAsset(['us'])],
      actions: [
        {
          id: 'event',
          actor: 'active',
          executor: 'actor',
          phase: ['main'],
          params: [],
          pre: null,
          cost: [],
          effects: [
            { chooseN: { bind: '$targets', options: { query: 'zones' }, max: 2 } },
          ],
          limits: [],
        },
      ],
      agents: {
        visibility: createVisibility({
          derivedMetrics: {
            knownMetric: {
              current: 'public',
            },
          },
        }),
        parameters: {},
        library: {
          candidateFeatures: {
            targetsZoneA: {
              type: 'boolean',
              expr: { in: ['zone-a', { ref: 'candidate.param.$targets' }] },
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
              completionScoreTerms: [],
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
          && diagnostic.path === 'doc.agents.library.candidateFeatures.targetsZoneA.expr.in.1.ref',
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
        visibility: createVisibility({
          derivedMetrics: {
            knownMetric: {
              current: 'public',
            },
          },
        }),
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
              completionScoreTerms: [],
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

  it('lowers preview authored refs into preview surface variants', () => {
    const result = compileGameSpecToGameDef({
      ...createCompileReadyDoc(),
      dataAssets: [createSeatCatalogAsset(['us'])],
      agents: {
        visibility: createVisibility(),
        parameters: {},
        library: {
          candidateFeatures: {
            projectedMargin: {
              type: 'number',
              expr: { ref: 'preview.victory.currentMargin.us' },
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
              completionScoreTerms: [],
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
    assert.deepEqual(result.gameDef?.agents?.library.candidateFeatures.projectedMargin?.expr, refExpr({
      kind: 'previewSurface',
      family: 'victoryCurrentMargin',
      id: 'currentMargin',
      selector: { kind: 'role', seatToken: 'us' },
    }));
  });

  it('lowers explicit player-scoped per-player refs into player selectors', () => {
    const result = compileGameSpecToGameDef({
      ...createCompileReadyDoc(),
      perPlayerVars: [{ name: 'resources', type: 'int', init: 0, min: 0, max: 10 }],
      dataAssets: [createSeatCatalogAsset(['us', 'arvn'])],
      agents: {
        visibility: createVisibility({
          perPlayerVars: {
            resources: {
              current: 'public',
            },
          },
        }),
        parameters: {},
        library: {
          stateFeatures: {
            selfResources: {
              type: 'number',
              expr: { ref: 'var.player.self.resources' },
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
              completionScoreTerms: [],
              tieBreakers: ['stableMoveKey'],
            },
          },
        },
        bindings: {
          us: 'baseline',
        },
      },
    });

    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
    assert.deepEqual(result.gameDef?.agents?.library.stateFeatures.selfResources?.expr, refExpr({
      kind: 'currentSurface',
      family: 'perPlayerVar',
      id: 'resources',
      selector: { kind: 'player', player: 'self' },
    }));
  });

  it('rejects role-scoped per-player refs when the spec can instantiate duplicate runtime roles', () => {
    const result = compileGameSpecToGameDef({
      ...createCompileReadyDoc(),
      metadata: { id: 'agents-demo-symmetric', players: { min: 2, max: 4 } },
      perPlayerVars: [{ name: 'tempo', type: 'int', init: 0, min: 0, max: 10 }],
      dataAssets: [createSeatCatalogAsset(['neutral'])],
      agents: {
        visibility: createVisibility({
          perPlayerVars: {
            tempo: {
              current: 'public',
            },
          },
        }),
        parameters: {},
        library: {
          stateFeatures: {
            ambiguousTempo: {
              type: 'number',
              expr: { ref: 'var.seat.neutral.tempo' },
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
              completionScoreTerms: [],
              tieBreakers: ['stableMoveKey'],
            },
          },
        },
        bindings: {
          neutral: 'baseline',
        },
      },
    });

    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), true);
    assert.equal(
      result.diagnostics.some((diagnostic) => diagnostic.message.includes('ambiguous because this spec can instantiate duplicate runtime players')),
      true,
    );
  });
});
