import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef, createEmptyGameSpecDoc, validateGameSpec } from '../../src/cnl/index.js';
import type { GameSpecDoc, GameSpecObservabilitySection } from '../../src/cnl/game-spec-doc.js';
import type { AgentPolicyExpr, AgentPolicyLiteral, CompiledAgentPolicyRef } from '../../src/kernel/types.js';

const literal = (value: AgentPolicyLiteral): AgentPolicyExpr => ({ kind: 'literal', value });
const refExpr = (ref: CompiledAgentPolicyRef): AgentPolicyExpr => ({ kind: 'ref', ref });
const opExpr = (op: Extract<AgentPolicyExpr, { readonly kind: 'op' }>['op'], ...args: AgentPolicyExpr[]): AgentPolicyExpr => ({
  kind: 'op',
  op,
  args,
});
const paramExpr = (id: string): AgentPolicyExpr => ({ kind: 'param', id });

/** Observer that makes victory.currentMargin public (equivalent to old agents.visibility). */
function createTestObservability(overrides?: GameSpecObservabilitySection['observers']): GameSpecObservabilitySection {
  const base = {
    testObserver: {
      surfaces: {
        victory: {
          currentMargin: 'public' as const,
        },
      },
    },
  };
  if (overrides === undefined) {
    return { observers: base };
  }
  // Merge: override observers take precedence, but we always keep testObserver
  const merged: Record<string, unknown> = { ...base };
  for (const [name, def] of Object.entries(overrides)) {
    merged[name] = def;
  }
  return { observers: merged } as GameSpecObservabilitySection;
}

function createCompileReadyDoc(seatIds: readonly string[] = ['us', 'arvn']) {
  return {
    ...createEmptyGameSpecDoc(),
    metadata: { id: 'agents-demo', players: { min: seatIds.length, max: seatIds.length } },
    observability: createTestObservability(),
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
      margins: seatIds.map((seatId) => ({ seat: seatId, value: 0 })),
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

/** Injects `observer: 'testObserver'` into every profile in an agents section. */
function withObserver(agents: Record<string, unknown>): any {
  if (agents.profiles === undefined) { return agents; }
  const patched: Record<string, unknown> = {};
  for (const [id, profile] of Object.entries(agents.profiles as Record<string, unknown>)) {
    patched[id] = { observer: 'testObserver', ...(profile as Record<string, unknown>) };
  }
  return { ...agents, profiles: patched };
}

describe('agents authoring surface', () => {
  it('lowers valid authored policy library items into a typed GameDef.agents catalog', () => {
    const result = compileGameSpecToGameDef({
      ...createCompileReadyDoc(),
      dataAssets: [createSeatCatalogAsset(['us', 'arvn'])],
      agents: withObserver({
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
              expr: { ref: 'candidate.tag.pass' },
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
          considerations: {
            preferEvents: {
              scopes: ['move'],
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
              considerations: ['preferEvents'],
              tieBreakers: ['stableMoveKey'],
            },
          },
        },
        bindings: {
          us: 'baseline',
        },
      }),
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
      globalMarkers: {},
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
      activeCardIdentity: {
        current: 'hidden',
        preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
      },
      activeCardTag: {
        current: 'hidden',
        preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
      },
      activeCardMetadata: {
        current: 'hidden',
        preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
      },
      activeCardAnnotation: {
        current: 'hidden',
        preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
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
            strategicConditions: [],
          },
        },
      },
      candidateFeatures: {
        isPass: {
          type: 'boolean',
          costClass: 'candidate',
          expr: refExpr({ kind: 'candidateTag', tagName: 'pass' }),
          dependencies: {
            parameters: [],
            stateFeatures: [],
            candidateFeatures: [],
            aggregates: [],
            strategicConditions: [],
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
            strategicConditions: [],
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
            strategicConditions: [],
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
            strategicConditions: [],
          },
          onEmpty: 'skipRule',
        },
      },
      considerations: {
        preferEvents: {
          scopes: ['move'],
          costClass: 'candidate',
          weight: literal(1),
          value: opExpr('boolToNumber', refExpr({ kind: 'library', refKind: 'candidateFeature', id: 'isPass' })),
          dependencies: {
            parameters: [],
            stateFeatures: [],
            candidateFeatures: ['isPass'],
            aggregates: [],
            strategicConditions: [],
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
            strategicConditions: [],
          },
        },
      },
      strategicConditions: {},
    });
    assert.deepEqual(baselineProfile.params, {
      passFloor: 0.5,
      mode: 'bold',
      tieOrder: ['stable', 'projected'],
    });
    assert.deepEqual(baselineProfile.use, {
      pruningRules: ['dropPassWhenStrongerMoveExists'],
      considerations: ['preferEvents'],
      tieBreakers: ['stableMoveKey'],
    });
    assert.deepEqual(baselineProfile.plan, {
      stateFeatures: ['currentMargin'],
      candidateFeatures: ['isPass', 'projectedMargin'],
      candidateAggregates: ['bestProjectedMargin'],
      considerations: ['preferEvents'],
    });
    assert.deepEqual(agents.bindingsBySeat, {
      us: 'baseline',
    });
  });

  it('compiles seatAgg authored expressions into seatAgg IR nodes', () => {
    const seatIds = ['us', 'arvn', 'nva', 'vc'] as const;
    const result = compileGameSpecToGameDef({
      ...createCompileReadyDoc(seatIds),
      dataAssets: [createSeatCatalogAsset(seatIds)],
      agents: withObserver({
        library: {
          stateFeatures: {
            maxOpponentMargin: {
              type: 'number',
              expr: {
                seatAgg: {
                  over: 'opponents',
                  expr: { ref: 'victory.currentMargin.$seat' },
                  aggOp: 'max',
                },
              },
            },
            allSeatCount: {
              type: 'number',
              expr: {
                seatAgg: {
                  over: 'all',
                  expr: 1,
                  aggOp: 'count',
                },
              },
            },
            namedSeatMarginSum: {
              type: 'number',
              expr: {
                seatAgg: {
                  over: ['us', 'nva', 'vc'],
                  expr: { ref: 'victory.currentMargin.$seat' },
                  aggOp: 'sum',
                },
              },
            },
            nestedSeatAgg: {
              type: 'number',
              expr: {
                seatAgg: {
                  over: 'all',
                  expr: {
                    add: [
                      { ref: 'victory.currentMargin.$seat' },
                      1,
                    ],
                  },
                  aggOp: 'sum',
                },
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
              considerations: [],
              tieBreakers: ['stableMoveKey'],
            },
          },
        },
        bindings: {
          us: 'baseline',
        },
      }),
    });

    assert.equal(result.gameDef === null, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);

    const stateFeatures = result.gameDef?.agents?.library.stateFeatures;
    assert.ok(stateFeatures !== undefined);
    assert.deepEqual(stateFeatures.maxOpponentMargin, {
      type: 'number',
      costClass: 'state',
      expr: {
        kind: 'seatAgg',
        over: 'opponents',
        expr: refExpr({
          kind: 'currentSurface',
          family: 'victoryCurrentMargin',
          id: 'currentMargin',
          selector: { kind: 'role', seatToken: '$seat' },
        }),
        aggOp: 'max',
      },
      dependencies: {
        parameters: [],
        stateFeatures: [],
        candidateFeatures: [],
        aggregates: [],
        strategicConditions: [],
      },
    });
    assert.deepEqual(stateFeatures.allSeatCount?.expr, {
      kind: 'seatAgg',
      over: 'all',
      expr: literal(1),
      aggOp: 'count',
    });
    assert.deepEqual(stateFeatures.namedSeatMarginSum?.expr, {
      kind: 'seatAgg',
      over: ['us', 'nva', 'vc'],
      expr: refExpr({
        kind: 'currentSurface',
        family: 'victoryCurrentMargin',
        id: 'currentMargin',
        selector: { kind: 'role', seatToken: '$seat' },
      }),
      aggOp: 'sum',
    });
    assert.deepEqual(stateFeatures.nestedSeatAgg?.expr, {
      kind: 'seatAgg',
      over: 'all',
      expr: opExpr(
        'add',
        refExpr({
          kind: 'currentSurface',
          family: 'victoryCurrentMargin',
          id: 'currentMargin',
          selector: { kind: 'role', seatToken: '$seat' },
        }),
        literal(1),
      ),
      aggOp: 'sum',
    });
  });

  it('rejects seatAgg with an invalid aggOp', () => {
    const compiled = compileGameSpecToGameDef({
      ...createCompileReadyDoc(['us', 'arvn']),
      dataAssets: [createSeatCatalogAsset(['us', 'arvn'])],
      agents: {
        library: {
          stateFeatures: {
            badSeatAgg: {
              type: 'number',
              expr: {
                seatAgg: {
                  over: 'opponents',
                  expr: { ref: 'victory.currentMargin.$seat' },
                  aggOp: 'avg',
                },
              },
            },
          },
        },
      },
    });

    assert.equal(compiled.gameDef, null);
    assert.ok(
      compiled.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_AGENT_POLICY_EXPR_INVALID'
          && diagnostic.path === 'doc.agents.library.stateFeatures.badSeatAgg.expr.seatAgg.aggOp',
      ),
    );
  });

  it('rejects seatAgg explicit seat lists that reference unknown canonical seat ids', () => {
    const compiled = compileGameSpecToGameDef({
      ...createCompileReadyDoc(['us', 'arvn', 'nva']),
      dataAssets: [createSeatCatalogAsset(['us', 'arvn', 'nva'])],
      agents: {
        library: {
          stateFeatures: {
            badSeatAgg: {
              type: 'number',
              expr: {
                seatAgg: {
                  over: ['us', 'vc'],
                  expr: { ref: 'victory.currentMargin.$seat' },
                  aggOp: 'max',
                },
              },
            },
          },
        },
      },
    });

    assert.equal(compiled.gameDef, null);
    assert.ok(
      compiled.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_AGENT_POLICY_EXPR_INVALID'
          && diagnostic.path === 'doc.agents.library.stateFeatures.badSeatAgg.expr.seatAgg.over.1',
      ),
    );
  });

  it('rejects seatAgg when canonical seats are not defined', () => {
    const compiled = compileGameSpecToGameDef({
      ...createCompileReadyDoc(['us', 'arvn']),
      agents: {
        library: {
          stateFeatures: {
            badSeatAgg: {
              type: 'number',
              expr: {
                seatAgg: {
                  over: 'opponents',
                  expr: { ref: 'victory.currentMargin.$seat' },
                  aggOp: 'max',
                },
              },
            },
          },
        },
      },
    });

    assert.equal(compiled.gameDef, null);
    assert.ok(
      compiled.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_AGENT_POLICY_EXPR_INVALID'
          && diagnostic.path === 'doc.agents.library.stateFeatures.badSeatAgg.expr.seatAgg.over'
          && diagnostic.message.includes('GameDef.seats to be defined'),
      ),
    );
  });

  it('keeps catalog and profile fingerprints stable across equivalent authored insertion order', () => {
    const baseDoc = {
      ...createCompileReadyDoc(),
      dataAssets: [createSeatCatalogAsset(['us'])],
      agents: withObserver({
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
              expr: { ref: 'candidate.tag.pass' },
            },
          },
          stateFeatures: {
            currentMargin: {
              type: 'number' as const,
              expr: { ref: 'victory.currentMargin.us' },
            },
          },
          considerations: {
            preferEvents: {
              scopes: ['move'],
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
              considerations: ['preferEvents'],
              tieBreakers: ['stableMoveKey'],
            },
          },
        },
        bindings: {
          us: 'baseline',
        },
      }),
    };
    const reorderedDoc = {
      ...createCompileReadyDoc(),
      dataAssets: [createSeatCatalogAsset(['us'])],
      agents: withObserver({
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
              considerations: ['preferEvents'],
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
          considerations: {
            preferEvents: {
              scopes: ['move'],
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
              expr: { ref: 'candidate.tag.pass' },
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
      }),
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

  it('lowers completion-scoped considerations into compiled completion score terms and profile use', () => {
    const result = compileGameSpecToGameDef({
      ...createCompileReadyDoc(),
      dataAssets: [createSeatCatalogAsset(['us'])],
      agents: withObserver({
        parameters: {},
        library: {
          considerations: {
            preferNamedOption: {
              scopes: ['completion'],
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
              considerations: ['preferNamedOption'],
              tieBreakers: ['stableMoveKey'],
            },
          },
        },
        bindings: {
          us: 'baseline',
        },
      }),
    });

    assert.equal(result.gameDef === null, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
    assert.deepEqual(result.gameDef?.agents?.library.considerations?.preferNamedOption, {
      scopes: ['completion'],
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
        strategicConditions: [],
      },
    });
    assert.deepEqual(result.gameDef?.agents?.profiles.baseline?.use.considerations, ['preferNamedOption']);
  });

  it('lowers dynamic zoneProp completion considerations through the shared expression pipeline', () => {
    const result = compileGameSpecToGameDef({
      ...createCompileReadyDoc(),
      zones: [
        { id: 'target-a:none', owner: 'none', visibility: 'public', ordering: 'set', category: 'province', attributes: { population: 4 } },
        { id: 'target-b:none', owner: 'none', visibility: 'public', ordering: 'set', category: 'province', attributes: { population: 1 } },
      ],
      dataAssets: [createSeatCatalogAsset(['us'])],
      agents: withObserver({
        parameters: {},
        library: {
          considerations: {
            preferHigherPopulation: {
              scopes: ['completion'],
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
              considerations: ['preferHigherPopulation'],
              tieBreakers: ['stableMoveKey'],
            },
          },
        },
        bindings: {
          us: 'baseline',
        },
      }),
    });

    assert.equal(result.gameDef === null, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
    assert.deepEqual(result.gameDef?.agents?.library.considerations?.preferHigherPopulation, {
      scopes: ['completion'],
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
        strategicConditions: [],
      },
    });
  });

  it('lowers candidate.paramCount refs through the shared candidate intrinsic contract', () => {
    const result = compileGameSpecToGameDef({
      ...createCompileReadyDoc(),
      dataAssets: [createSeatCatalogAsset(['us'])],
      agents: withObserver({
        parameters: {},
        library: {
          candidateFeatures: {
            paramLoad: {
              type: 'number',
              expr: { ref: 'candidate.paramCount' },
            },
          },
          considerations: {
            rewardLoadedMoves: {
              scopes: ['move'],
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
              considerations: ['rewardLoadedMoves'],
              tieBreakers: ['stableMoveKey'],
            },
          },
        },
        bindings: {
          us: 'baseline',
        },
      }),
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

  it('rejects invalid consideration scopes', () => {
    const result = compileGameSpecToGameDef({
      ...createCompileReadyDoc(),
      dataAssets: [createSeatCatalogAsset(['us'])],
      agents: withObserver({
        parameters: {},
        library: {
          considerations: {
            badScope: {
              scopes: ['last' as 'move'],
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
              pruningRules: [],
              considerations: ['badScope'],
              tieBreakers: ['stableMoveKey'],
            },
          },
        },
        bindings: {
          us: 'baseline',
        },
      }),
    });

    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.path === 'doc.agents.library.considerations.badScope.scopes.0'), true);
    assert.equal(result.gameDef?.agents?.profiles.baseline, undefined);
  });

  it('compiles preview.mode from profile YAML into CompiledAgentProfile.preview', () => {
    const result = compileGameSpecToGameDef({
      ...createCompileReadyDoc(),
      dataAssets: [createSeatCatalogAsset(['us'])],
      agents: withObserver({
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
              considerations: [],
              tieBreakers: ['stableMoveKey'],
            },
            preview: {
              mode: 'tolerateStochastic',
            },
          },
        },
        bindings: {
          us: 'baseline',
        },
      }),
    });

    assert.equal(result.diagnostics.some((d) => d.severity === 'error'), false);
    assert.deepEqual(result.gameDef?.agents?.profiles.baseline?.preview, {
      mode: 'tolerateStochastic',
      phase1: false,
      phase1CompletionsPerAction: 1,
    });
    assert.deepEqual(result.gameDef?.agents?.profiles.baseline?.selection, {
      mode: 'argmax',
    });
  });

  it('defaults preview.mode to exactWorld when profile YAML has no preview section', () => {
    const result = compileGameSpecToGameDef({
      ...createCompileReadyDoc(),
      dataAssets: [createSeatCatalogAsset(['us'])],
      agents: withObserver({
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
              considerations: [],
              tieBreakers: ['stableMoveKey'],
            },
          },
        },
        bindings: {
          us: 'baseline',
        },
      }),
    });

    assert.equal(result.diagnostics.some((d) => d.severity === 'error'), false);
    assert.deepEqual(result.gameDef?.agents?.profiles.baseline?.preview, {
      mode: 'exactWorld',
    });
    assert.deepEqual(result.gameDef?.agents?.profiles.baseline?.selection, {
      mode: 'argmax',
    });
  });

  it('compiles preview.phase1 with the default phase1CompletionsPerAction', () => {
    const result = compileGameSpecToGameDef({
      ...createCompileReadyDoc(),
      dataAssets: [createSeatCatalogAsset(['us'])],
      agents: withObserver({
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
              considerations: [],
              tieBreakers: ['stableMoveKey'],
            },
            preview: {
              mode: 'tolerateStochastic',
              phase1: true,
            },
          },
        },
        bindings: {
          us: 'baseline',
        },
      }),
    });

    assert.equal(result.diagnostics.some((d) => d.severity === 'error'), false);
    assert.deepEqual(result.gameDef?.agents?.profiles.baseline?.preview, {
      mode: 'tolerateStochastic',
      phase1: true,
      phase1CompletionsPerAction: 1,
    });
  });

  it('compiles preview.phase1CompletionsPerAction when preview.phase1 is enabled', () => {
    const result = compileGameSpecToGameDef({
      ...createCompileReadyDoc(),
      dataAssets: [createSeatCatalogAsset(['us'])],
      agents: withObserver({
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
              considerations: [],
              tieBreakers: ['stableMoveKey'],
            },
            preview: {
              mode: 'tolerateStochastic',
              phase1: true,
              phase1CompletionsPerAction: 3,
            },
          },
        },
        bindings: {
          us: 'baseline',
        },
      }),
    });

    assert.equal(result.diagnostics.some((d) => d.severity === 'error'), false);
    assert.deepEqual(result.gameDef?.agents?.profiles.baseline?.preview, {
      mode: 'tolerateStochastic',
      phase1: true,
      phase1CompletionsPerAction: 3,
    });
  });

  it('compiles selection.mode from profile YAML into CompiledAgentProfile.selection', () => {
    const result = compileGameSpecToGameDef({
      ...createCompileReadyDoc(),
      dataAssets: [createSeatCatalogAsset(['us'])],
      agents: withObserver({
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
              considerations: [],
              tieBreakers: ['stableMoveKey'],
            },
            selection: {
              mode: 'softmaxSample',
              temperature: 0.5,
            },
          },
        },
        bindings: {
          us: 'baseline',
        },
      }),
    });

    assert.equal(result.diagnostics.some((d) => d.severity === 'error'), false);
    assert.deepEqual(result.gameDef?.agents?.profiles.baseline?.selection, {
      mode: 'softmaxSample',
      temperature: 0.5,
    });
  });

  it('compiles weightedSample selection.mode from profile YAML', () => {
    const result = compileGameSpecToGameDef({
      ...createCompileReadyDoc(),
      dataAssets: [createSeatCatalogAsset(['us'])],
      agents: withObserver({
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
              considerations: [],
              tieBreakers: ['stableMoveKey'],
            },
            selection: {
              mode: 'weightedSample',
            },
          },
        },
        bindings: {
          us: 'baseline',
        },
      }),
    });

    assert.equal(result.diagnostics.some((d) => d.severity === 'error'), false);
    assert.deepEqual(result.gameDef?.agents?.profiles.baseline?.selection, {
      mode: 'weightedSample',
    });
  });

  it('defaults selection.mode to argmax when profile YAML has no selection section', () => {
    const result = compileGameSpecToGameDef({
      ...createCompileReadyDoc(),
      dataAssets: [createSeatCatalogAsset(['us'])],
      agents: withObserver({
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
              considerations: [],
              tieBreakers: ['stableMoveKey'],
            },
          },
        },
        bindings: {
          us: 'baseline',
        },
      }),
    });

    assert.equal(result.diagnostics.some((d) => d.severity === 'error'), false);
    assert.deepEqual(result.gameDef?.agents?.profiles.baseline?.selection, {
      mode: 'argmax',
    });
  });

  it('emits diagnostic when selection.mode is missing', () => {
    const result = compileGameSpecToGameDef({
      ...createCompileReadyDoc(),
      dataAssets: [createSeatCatalogAsset(['us'])],
      agents: withObserver({
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
              considerations: [],
              tieBreakers: ['stableMoveKey'],
            },
            selection: {},
          },
        },
        bindings: {
          us: 'baseline',
        },
      }),
    });

    assert.equal(
      result.diagnostics.some((d) => d.code === 'CNL_COMPILER_AGENT_SELECTION_MODE_MISSING' && d.path === 'doc.agents.profiles.baseline.selection.mode'),
      true,
    );
  });

  it('emits diagnostic when selection.mode is invalid', () => {
    const result = compileGameSpecToGameDef({
      ...createCompileReadyDoc(),
      dataAssets: [createSeatCatalogAsset(['us'])],
      agents: withObserver({
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
              considerations: [],
              tieBreakers: ['stableMoveKey'],
            },
            selection: {
              mode: 'sometimes' as unknown as string,
            },
          },
        },
        bindings: {
          us: 'baseline',
        },
      }),
    });

    assert.equal(
      result.diagnostics.some((d) => d.code === 'CNL_COMPILER_AGENT_SELECTION_MODE_INVALID' && d.path === 'doc.agents.profiles.baseline.selection.mode'),
      true,
    );
  });

  it('emits diagnostic when selection.mode is reserved', () => {
    const result = compileGameSpecToGameDef({
      ...createCompileReadyDoc(),
      dataAssets: [createSeatCatalogAsset(['us'])],
      agents: withObserver({
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
              considerations: [],
              tieBreakers: ['stableMoveKey'],
            },
            selection: {
              mode: 'topKSample',
            },
          },
        },
        bindings: {
          us: 'baseline',
        },
      }),
    });

    assert.equal(
      result.diagnostics.some((d) => d.code === 'CNL_COMPILER_AGENT_SELECTION_MODE_RESERVED' && d.path === 'doc.agents.profiles.baseline.selection.mode'),
      true,
    );
  });

  it('emits diagnostic when softmaxSample selection.temperature is missing', () => {
    const result = compileGameSpecToGameDef({
      ...createCompileReadyDoc(),
      dataAssets: [createSeatCatalogAsset(['us'])],
      agents: withObserver({
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
              considerations: [],
              tieBreakers: ['stableMoveKey'],
            },
            selection: {
              mode: 'softmaxSample',
            },
          },
        },
        bindings: {
          us: 'baseline',
        },
      }),
    });

    assert.equal(
      result.diagnostics.some((d) => d.code === 'CNL_COMPILER_AGENT_SELECTION_TEMPERATURE_REQUIRED' && d.path === 'doc.agents.profiles.baseline.selection.temperature'),
      true,
    );
  });

  it('emits diagnostic when softmaxSample selection.temperature is non-positive', () => {
    const result = compileGameSpecToGameDef({
      ...createCompileReadyDoc(),
      dataAssets: [createSeatCatalogAsset(['us'])],
      agents: withObserver({
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
              considerations: [],
              tieBreakers: ['stableMoveKey'],
            },
            selection: {
              mode: 'softmaxSample',
              temperature: 0,
            },
          },
        },
        bindings: {
          us: 'baseline',
        },
      }),
    });

    assert.equal(
      result.diagnostics.some((d) => d.code === 'CNL_COMPILER_AGENT_SELECTION_TEMPERATURE_INVALID' && d.path === 'doc.agents.profiles.baseline.selection.temperature'),
      true,
    );
  });

  it('emits diagnostic when preview.mode is missing', () => {
    const result = compileGameSpecToGameDef({
      ...createCompileReadyDoc(),
      dataAssets: [createSeatCatalogAsset(['us'])],
      agents: withObserver({
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
              considerations: [],
              tieBreakers: ['stableMoveKey'],
            },
            preview: {
            },
          },
        },
        bindings: {
          us: 'baseline',
        },
      }),
    });

    assert.equal(
      result.diagnostics.some((d) => d.code === 'CNL_COMPILER_AGENT_PREVIEW_MODE_MISSING' && d.path === 'doc.agents.profiles.baseline.preview.mode'),
      true,
    );
  });

  it('emits diagnostic when preview.mode is invalid', () => {
    const result = compileGameSpecToGameDef({
      ...createCompileReadyDoc(),
      dataAssets: [createSeatCatalogAsset(['us'])],
      agents: withObserver({
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
              considerations: [],
              tieBreakers: ['stableMoveKey'],
            },
            preview: {
              mode: 'sometimes' as unknown as string,
            },
          },
        },
        bindings: {
          us: 'baseline',
        },
      }),
    });

    assert.equal(
      result.diagnostics.some((d) => d.code === 'CNL_COMPILER_AGENT_PREVIEW_MODE_INVALID' && d.path === 'doc.agents.profiles.baseline.preview.mode'),
      true,
    );
  });

  it('emits diagnostic when preview.mode is reserved', () => {
    const result = compileGameSpecToGameDef({
      ...createCompileReadyDoc(),
      dataAssets: [createSeatCatalogAsset(['us'])],
      agents: withObserver({
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
              considerations: [],
              tieBreakers: ['stableMoveKey'],
            },
            preview: {
              mode: 'infoSetSample',
            },
          },
        },
        bindings: {
          us: 'baseline',
        },
      }),
    });

    assert.equal(
      result.diagnostics.some((d) => d.code === 'CNL_COMPILER_AGENT_PREVIEW_MODE_RESERVED' && d.path === 'doc.agents.profiles.baseline.preview.mode'),
      true,
    );
  });

  it('emits diagnostic when preview.phase1 is invalid', () => {
    const result = compileGameSpecToGameDef({
      ...createCompileReadyDoc(),
      dataAssets: [createSeatCatalogAsset(['us'])],
      agents: withObserver({
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
              considerations: [],
              tieBreakers: ['stableMoveKey'],
            },
            preview: {
              mode: 'exactWorld',
              phase1: 'yes' as unknown as boolean,
            },
          },
        },
        bindings: {
          us: 'baseline',
        },
      }),
    });

    assert.equal(
      result.diagnostics.some((d) => d.code === 'CNL_COMPILER_AGENT_PREVIEW_PHASE1_INVALID' && d.path === 'doc.agents.profiles.baseline.preview.phase1'),
      true,
    );
  });

  it('emits diagnostic when preview.phase1CompletionsPerAction is invalid', () => {
    const result = compileGameSpecToGameDef({
      ...createCompileReadyDoc(),
      dataAssets: [createSeatCatalogAsset(['us'])],
      agents: withObserver({
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
              considerations: [],
              tieBreakers: ['stableMoveKey'],
            },
            preview: {
              mode: 'exactWorld',
              phase1: true,
              phase1CompletionsPerAction: 0,
            },
          },
        },
        bindings: {
          us: 'baseline',
        },
      }),
    });

    assert.equal(
      result.diagnostics.some(
        (d) => d.code === 'CNL_COMPILER_AGENT_PREVIEW_PHASE1_COMPLETIONS_INVALID'
          && d.path === 'doc.agents.profiles.baseline.preview.phase1CompletionsPerAction',
      ),
      true,
    );
  });

  it('emits warning when preview.phase1CompletionsPerAction is set while preview.phase1 is disabled', () => {
    const result = compileGameSpecToGameDef({
      ...createCompileReadyDoc(),
      dataAssets: [createSeatCatalogAsset(['us'])],
      agents: withObserver({
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
              considerations: [],
              tieBreakers: ['stableMoveKey'],
            },
            preview: {
              mode: 'exactWorld',
              phase1: false,
              phase1CompletionsPerAction: 2,
            },
          },
        },
        bindings: {
          us: 'baseline',
        },
      }),
    });

    assert.equal(result.diagnostics.some((d) => d.severity === 'error'), false);
    assert.equal(
      result.diagnostics.some(
        (d) => d.code === 'CNL_COMPILER_AGENT_PREVIEW_PHASE1_COMPLETIONS_UNUSED'
          && d.path === 'doc.agents.profiles.baseline.preview.phase1CompletionsPerAction'
          && d.severity === 'warning',
      ),
      true,
    );
    assert.deepEqual(result.gameDef?.agents?.profiles.baseline?.preview, {
      mode: 'exactWorld',
      phase1: false,
      phase1CompletionsPerAction: 2,
    });
  });

  it('validates profile.use consideration references during authoring validation', () => {
    const diagnostics = validateGameSpec({
      ...createCompileReadyDoc(),
      dataAssets: [createSeatCatalogAsset(['us'])],
      agents: withObserver({
        library: {
          pruningRules: {
            knownPrune: {
              when: true,
              onEmpty: 'skipRule',
            },
          },
          considerations: {
            knownConsideration: {
              scopes: ['move'],
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
              considerations: ['missingConsideration'],
              tieBreakers: ['missingTieBreaker'],
            },
          },
        },
        bindings: {
          us: 'baseline',
        },
      }),
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
          && diagnostic.path === 'doc.agents.profiles.baseline.use.considerations.0',
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

  it('validates authored consideration scopes during validation', () => {
    const diagnostics = validateGameSpec({
      ...createCompileReadyDoc(),
      dataAssets: [createSeatCatalogAsset(['us'])],
      agents: withObserver({
        library: {
          considerations: {
            invalid: {
              scopes: [],
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
              pruningRules: [],
              considerations: ['invalid'],
              tieBreakers: ['stableMoveKey'],
            },
          },
        },
        bindings: {
          us: 'baseline',
        },
      }),
    });

    assert.ok(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.path === 'doc.agents.library.considerations.invalid.scopes'
          && diagnostic.severity === 'error',
      ),
    );
  });

  it('accepts valid completion-scoped considerations without validator diagnostics', () => {
    const diagnostics = validateGameSpec({
      ...createCompileReadyDoc(),
      dataAssets: [createSeatCatalogAsset(['us'])],
      agents: withObserver({
        library: {
          considerations: {
            preferNamedOption: {
              scopes: ['completion'],
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
              considerations: ['preferNamedOption'],
              tieBreakers: ['stableMoveKey'],
            },
          },
        },
        bindings: {
          us: 'baseline',
        },
      }),
    });

    assert.equal(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_VALIDATOR_AGENTS_PROFILE_USE_UNKNOWN_ID',
      ),
      false,
    );
  });

  it('compiles explicit activeCard visibility from authored YAML', () => {
    const result = compileGameSpecToGameDef({
      ...createCompileReadyDoc(),
      observability: createTestObservability({
        testObserver: {
          surfaces: {
            victory: { currentMargin: 'public' },
            activeCardIdentity: { current: 'public' },
            activeCardTag: { current: 'seatVisible' },
            activeCardMetadata: { current: 'hidden', preview: { visibility: 'public', allowWhenHiddenSampling: true } },
            activeCardAnnotation: { current: 'hidden', preview: { visibility: 'public', allowWhenHiddenSampling: true } },
          },
        },
      }),
      dataAssets: [createSeatCatalogAsset(['us', 'arvn'])],
      agents: withObserver({
        library: {
          stateFeatures: {},
          completionScoreTerms: {},
          tieBreakers: { stableMoveKey: { kind: 'stableMoveKey' } },
        },
        profiles: {
          baseline: {
            params: {},
            use: { pruningRules: [], considerations: [], tieBreakers: ['stableMoveKey'] },
          },
        },
        bindings: { us: 'baseline', arvn: 'baseline' },
      }),
    });
    assert.notEqual(result.gameDef, null);
    const agents = result.gameDef!.agents!;
    assert.deepEqual(agents.surfaceVisibility.activeCardIdentity, {
      current: 'public',
      preview: { visibility: 'public', allowWhenHiddenSampling: false },
    });
    assert.deepEqual(agents.surfaceVisibility.activeCardTag, {
      current: 'seatVisible',
      preview: { visibility: 'seatVisible', allowWhenHiddenSampling: false },
    });
    assert.deepEqual(agents.surfaceVisibility.activeCardMetadata, {
      current: 'hidden',
      preview: { visibility: 'public', allowWhenHiddenSampling: true },
    });
  });

  it('defaults omitted activeCard visibility entries to hidden', () => {
    const result = compileGameSpecToGameDef({
      ...createCompileReadyDoc(),
      dataAssets: [createSeatCatalogAsset(['us'])],
      agents: withObserver({
        library: {
          stateFeatures: {},
          completionScoreTerms: {},
          tieBreakers: { stableMoveKey: { kind: 'stableMoveKey' } },
        },
        profiles: {
          baseline: {
            params: {},
            use: { pruningRules: [], considerations: [], tieBreakers: ['stableMoveKey'] },
          },
        },
        bindings: { us: 'baseline' },
      }),
    });
    assert.notEqual(result.gameDef, null);
    const vis = result.gameDef!.agents!.surfaceVisibility;
    const hiddenDefault = { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } };
    assert.deepEqual(vis.activeCardIdentity, hiddenDefault);
    assert.deepEqual(vis.activeCardTag, hiddenDefault);
    assert.deepEqual(vis.activeCardMetadata, hiddenDefault);
  });

  it('sets activeCard categories independently', () => {
    const result = compileGameSpecToGameDef({
      ...createCompileReadyDoc(),
      observability: createTestObservability({
        testObserver: {
          surfaces: {
            victory: { currentMargin: 'public' },
            activeCardIdentity: { current: 'public' },
          },
        },
      }),
      dataAssets: [createSeatCatalogAsset(['us'])],
      agents: withObserver({
        library: {
          stateFeatures: {},
          completionScoreTerms: {},
          tieBreakers: { stableMoveKey: { kind: 'stableMoveKey' } },
        },
        profiles: {
          baseline: {
            params: {},
            use: { pruningRules: [], considerations: [], tieBreakers: ['stableMoveKey'] },
          },
        },
        bindings: { us: 'baseline' },
      }),
    });
    assert.notEqual(result.gameDef, null);
    const vis = result.gameDef!.agents!.surfaceVisibility;
    assert.equal(vis.activeCardIdentity.current, 'public');
    assert.equal(vis.activeCardTag.current, 'hidden');
    assert.equal(vis.activeCardMetadata.current, 'hidden');
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
      agents: withObserver({
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
              considerations: [],
              tieBreakers: ['stableMoveKey'],
            },
          },
        },
        bindings: {
          us: 'baseline',
        },
      }),
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

  it('includes globalMarkers in the fallback surface visibility catalog when no observer catalog exists', () => {
    const result = compileGameSpecToGameDef({
      ...createCompileReadyDoc(),
      observability: null,
      globalMarkerLattices: [
        { id: 'cap_boobyTraps', states: ['inactive', 'unshaded', 'shaded'], defaultState: 'inactive' },
        { id: 'cap_cadres', states: ['inactive', 'unshaded', 'shaded'], defaultState: 'inactive' },
      ],
      dataAssets: [createSeatCatalogAsset(['us'])],
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
              considerations: [],
              tieBreakers: ['stableMoveKey'],
            },
          },
        },
        bindings: {
          us: 'baseline',
        },
      },
    });

    assert.notEqual(result.gameDef, null);
    assert.deepEqual(result.gameDef!.agents!.surfaceVisibility.globalMarkers, {
      cap_boobyTraps: {
        current: 'public',
        preview: {
          visibility: 'public',
          allowWhenHiddenSampling: false,
        },
      },
      cap_cadres: {
        current: 'public',
        preview: {
          visibility: 'public',
          allowWhenHiddenSampling: false,
        },
      },
    });
  });

  it('rejects unknown globalMarker refs during agent compilation', () => {
    const compiled = compileGameSpecToGameDef({
      ...createCompileReadyDoc(),
      globalMarkerLattices: [
        { id: 'cap_boobyTraps', states: ['inactive', 'unshaded', 'shaded'], defaultState: 'inactive' },
      ],
      dataAssets: [createSeatCatalogAsset(['us'])],
      agents: withObserver({
        library: {
          stateFeatures: {
            unknownMarker: {
              type: 'number',
              expr: {
                boolToNumber: {
                  eq: [
                    { ref: 'globalMarker.cap_unknown' },
                    'shaded',
                  ],
                },
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
              considerations: [],
              tieBreakers: ['stableMoveKey'],
            },
          },
        },
        bindings: {
          us: 'baseline',
        },
      }),
    });

    assert.equal(compiled.gameDef, null);
    assert.ok(
      compiled.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_AGENT_POLICY_REF_UNKNOWN'
          && diagnostic.path === 'doc.agents.library.stateFeatures.unknownMarker.expr.boolToNumber.eq.0.ref',
      ),
    );
  });

  it('rejects malformed collection shapes, inline profile logic, and non-map bindings in validation and compile flows', () => {
    const doc = {
      ...createCompileReadyDoc(),
      agents: withObserver({
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
      }),
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
      agents: withObserver({
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
              considerations: [],
              tieBreakers: ['stableMoveKey'],
            },
          },
        },
        bindings: {
          us: 'baseline',
        },
      }),
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
      agents: withObserver({
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
              considerations: [],
              tieBreakers: ['stableMoveKey'],
            },
          },
        },
        bindings: {
          us: 'baseline',
        },
      }),
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
      agents: withObserver({
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
              considerations: [],
              tieBreakers: ['stableMoveKey'],
            },
          },
        },
        bindings: {
          vc: 'baseline',
        },
      }),
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
      agents: withObserver({
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
              considerations: [],
              tieBreakers: ['stableMoveKey'],
            },
          },
        },
        bindings: {
          us: 'baseline',
        },
      }),
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
      agents: withObserver({
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
              expr: { ref: 'candidate.tag.pass' },
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
          considerations: {
            divideByZero: {
              scopes: ['move'],
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
              considerations: ['divideByZero'],
              tieBreakers: ['stableMoveKey'],
            },
          },
        },
        bindings: {
          us: 'baseline',
        },
      }),
    });

    assert.equal(compiled.gameDef, null);
    assert.ok(compiled.diagnostics.some((diagnostic) => diagnostic.code === 'CNL_COMPILER_AGENT_DEPENDENCY_CYCLE' && diagnostic.path === 'doc.agents.library.stateFeatures.loopA'));
    assert.ok(compiled.diagnostics.some((diagnostic) => diagnostic.code === 'CNL_COMPILER_AGENT_POLICY_PREVIEW_NESTED' && diagnostic.path === 'doc.agents.library.candidateFeatures.badPreview.expr.ref'));
    assert.ok(compiled.diagnostics.some((diagnostic) => diagnostic.code === 'CNL_COMPILER_AGENT_CANDIDATE_PARAM_REF_INVALID' && diagnostic.path === 'doc.agents.library.candidateFeatures.badCandidateParam.expr.ref'));
    assert.ok(compiled.diagnostics.some((diagnostic) => diagnostic.code === 'CNL_COMPILER_AGENT_AGGREGATE_INPUT_INVALID' && diagnostic.path === 'doc.agents.library.candidateAggregates.badAggregate.of'));
    assert.ok(compiled.diagnostics.some((diagnostic) => diagnostic.code === 'CNL_COMPILER_AGENT_POLICY_DIVIDE_BY_ZERO' && diagnostic.path === 'doc.agents.library.considerations.divideByZero.value'));
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
      agents: withObserver({
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
              considerations: [],
              tieBreakers: ['stableMoveKey'],
            },
          },
        },
        bindings: {
          us: 'baseline',
        },
      }),
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
      agents: withObserver({
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
              considerations: [],
              tieBreakers: ['stableMoveKey'],
            },
          },
        },
        bindings: {
          us: 'baseline',
        },
      }),
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
      agents: withObserver({
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
              considerations: [],
              tieBreakers: ['stableMoveKey'],
            },
          },
        },
        bindings: {
          us: 'baseline',
        },
      }),
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
      agents: withObserver({
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
              considerations: [],
              tieBreakers: ['stableMoveKey'],
            },
          },
        },
        bindings: {
          us: 'baseline',
        },
      }),
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
      agents: withObserver({
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
              considerations: [],
              tieBreakers: ['stableMoveKey'],
            },
          },
        },
        bindings: {
          us: 'baseline',
        },
      }),
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
      observability: createTestObservability({
        testObserver: {
          surfaces: {
            victory: { currentMargin: 'public' },
            derivedMetrics: {
              knownMetric: {
                current: 'public',
              },
            },
          },
        },
      }),
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
      agents: withObserver({
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
              considerations: [],
              tieBreakers: ['stableMoveKey'],
            },
          },
        },
        bindings: {
          us: 'baseline',
        },
      }),
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
      observability: createTestObservability({
        testObserver: {
          surfaces: {
            victory: { currentMargin: 'public' },
            perPlayerVars: {
              resources: {
                current: 'public',
              },
            },
            globalMarkers: {
              cap_boobyTraps: {
                current: 'public',
              },
            },
          },
        },
      }),
      perPlayerVars: [{ name: 'resources', type: 'int', init: 0, min: 0, max: 10 }],
      globalMarkerLattices: [
        { id: 'cap_boobyTraps', states: ['inactive', 'unshaded', 'shaded'], defaultState: 'inactive' },
      ],
      dataAssets: [createSeatCatalogAsset(['us'])],
      agents: withObserver({
        parameters: {},
        library: {
          stateFeatures: {
            currentMargin: {
              type: 'number',
              expr: { ref: 'victory.currentMargin.us' },
            },
          },
          candidateFeatures: {
            projectedMargin: {
              type: 'number',
              expr: { ref: 'preview.victory.currentMargin.us' },
            },
            projectedCurrentMarginFeature: {
              type: 'number',
              expr: { ref: 'preview.feature.currentMargin' },
            },
            projectedResources: {
              type: 'number',
              expr: { ref: 'preview.var.player.self.resources' },
            },
            projectedBoobyTraps: {
              type: 'id',
              expr: { ref: 'preview.globalMarker.cap_boobyTraps' },
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
              considerations: [],
              tieBreakers: ['stableMoveKey'],
            },
          },
        },
        bindings: {
          us: 'baseline',
        },
      }),
    });

    assert.equal(result.gameDef === null, false);
    assert.deepEqual(result.gameDef?.agents?.library.candidateFeatures.projectedMargin?.expr, refExpr({
      kind: 'previewSurface',
      family: 'victoryCurrentMargin',
      id: 'currentMargin',
      selector: { kind: 'role', seatToken: 'us' },
    }));
    assert.deepEqual(result.gameDef?.agents?.library.candidateFeatures.projectedCurrentMarginFeature?.expr, refExpr({
      kind: 'library',
      refKind: 'previewStateFeature',
      id: 'currentMargin',
    }));
    assert.deepEqual(result.gameDef?.agents?.library.candidateFeatures.projectedResources?.expr, refExpr({
      kind: 'previewSurface',
      family: 'perPlayerVar',
      id: 'resources',
      selector: { kind: 'player', player: 'self' },
    }));
    assert.deepEqual(result.gameDef?.agents?.library.candidateFeatures.projectedBoobyTraps?.expr, refExpr({
      kind: 'previewSurface',
      family: 'globalMarker',
      id: 'cap_boobyTraps',
    }));
  });

  it('rejects unknown preview feature refs during agent compilation', () => {
    const result = compileGameSpecToGameDef({
      ...createCompileReadyDoc(),
      dataAssets: [createSeatCatalogAsset(['us'])],
      agents: withObserver({
        parameters: {},
        library: {
          candidateFeatures: {
            projectedMissingFeature: {
              type: 'number',
              expr: { ref: 'preview.feature.missingFeature' },
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
              considerations: [],
              tieBreakers: ['stableMoveKey'],
            },
          },
        },
        bindings: {
          us: 'baseline',
        },
      }),
    });

    assert.equal(result.gameDef, null);
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_AGENT_POLICY_REF_UNKNOWN'
          && diagnostic.path === 'doc.agents.library.candidateFeatures.projectedMissingFeature.expr.ref',
      ),
      true,
    );
  });

  it('lowers explicit player-scoped per-player refs into player selectors', () => {
    const result = compileGameSpecToGameDef({
      ...createCompileReadyDoc(),
      observability: createTestObservability({
        testObserver: {
          surfaces: {
            victory: { currentMargin: 'public' },
            perPlayerVars: {
              resources: {
                current: 'public',
              },
            },
          },
        },
      }),
      perPlayerVars: [{ name: 'resources', type: 'int', init: 0, min: 0, max: 10 }],
      dataAssets: [createSeatCatalogAsset(['us', 'arvn'])],
      agents: withObserver({
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
              considerations: [],
              tieBreakers: ['stableMoveKey'],
            },
          },
        },
        bindings: {
          us: 'baseline',
        },
      }),
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
      observability: createTestObservability({
        testObserver: {
          surfaces: {
            victory: { currentMargin: 'public' },
            perPlayerVars: {
              tempo: {
                current: 'public',
              },
            },
          },
        },
      }),
      metadata: { id: 'agents-demo-symmetric', players: { min: 2, max: 4 } },
      perPlayerVars: [{ name: 'tempo', type: 'int', init: 0, min: 0, max: 10 }],
      dataAssets: [createSeatCatalogAsset(['neutral'])],
      agents: withObserver({
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
              considerations: [],
              tieBreakers: ['stableMoveKey'],
            },
          },
        },
        bindings: {
          neutral: 'baseline',
        },
      }),
    });

    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), true);
    assert.equal(
      result.diagnostics.some((diagnostic) => diagnostic.message.includes('ambiguous because this spec can instantiate duplicate runtime players')),
      true,
    );
  });
});
