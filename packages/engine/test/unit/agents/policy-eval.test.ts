import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  matchesTokenFilter,
  matchesZoneFilter,
  matchesZoneScope,
  resolveTokenFilter,
} from '../../../src/agents/policy-evaluation-core.js';
import { evaluatePolicyMove, evaluatePolicyMoveCore } from '../../../src/agents/policy-eval.js';
import { createPolicyCompletionProvider, createPolicyRuntimeProviders } from '../../../src/agents/policy-runtime.js';
import { toMoveIdentityKey } from '../../../src/kernel/move-identity.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  createTrustedExecutableMove,
  createRng,
  initialState,
  toOwnedZoneId,
  type AgentPolicyCatalog,
  type AgentPolicyExpr,
  type AgentPolicyLiteral,
  type ChoicePendingRequest,
  type CompiledAgentPolicyCurrentSurfaceRef,
  type CompiledAgentPolicyPreviewSurfaceRef,
  type CompiledAgentPolicyRef,
  type GameState,
  type GameDef,
  type Move,
  type MoveParamValue,
  type ActionDef,
  type AgentPolicyZoneFilter,
  type Token,
  type ZoneDef,
} from '../../../src/kernel/index.js';
import { eff } from '../../helpers/effect-tag-helper.js';

const phaseId = asPhaseId('main');
const literal = (value: AgentPolicyLiteral): AgentPolicyExpr => ({
  kind: 'literal',
  value,
});
const refExpr = (ref: CompiledAgentPolicyRef): AgentPolicyExpr => ({ kind: 'ref', ref });
const opExpr = (op: Extract<AgentPolicyExpr, { readonly kind: 'op' }>['op'], ...args: AgentPolicyExpr[]): AgentPolicyExpr => ({
  kind: 'op',
  op,
  args,
});
const paramExpr = (id: string): AgentPolicyExpr => ({ kind: 'param', id });

function createAction(id: string, params: ActionDef['params'] = []): ActionDef {
  return {
    id: asActionId(id),
    actor: 'active',
    executor: 'actor',
    phase: [phaseId],
    params,
    pre: null,
    cost: [],
    effects: id === 'advance'
      ? [eff({ addVar: { scope: 'global', var: 'usMargin', delta: 3 } })]
      : [],
    limits: [],
  };
}

function createBaseDef(agents: AgentPolicyCatalog): GameDef {
  return {
    metadata: { id: 'policy-eval', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [{ name: 'usMargin', type: 'int', init: 1, min: -10, max: 10 }],
    perPlayerVars: [{ name: 'tempo', type: 'int', init: 0, min: 0, max: 10 }],
    zones: [
      { id: asZoneId('frontier:0'), owner: 'player', visibility: 'owner', ordering: 'set', attributes: { population: 0 } },
      { id: asZoneId('frontier:1'), owner: 'player', visibility: 'owner', ordering: 'set', attributes: { population: 0 } },
      { id: asZoneId('rear:0'), owner: 'player', visibility: 'owner', ordering: 'set', attributes: { population: 0 } },
      { id: asZoneId('rear:1'), owner: 'player', visibility: 'owner', ordering: 'set', attributes: { population: 0 } },
      { id: asZoneId('frontier:none'), owner: 'none', visibility: 'public', ordering: 'set', attributes: { population: 0 } },
      { id: asZoneId('rear:none'), owner: 'none', visibility: 'public', ordering: 'set', attributes: { population: 0 } },
      { id: asZoneId('target-a:none'), owner: 'none', visibility: 'public', ordering: 'set', category: 'province', attributes: { population: 0 } },
      { id: asZoneId('target-b:none'), owner: 'none', visibility: 'public', ordering: 'set', category: 'province', attributes: { population: 0 } },
    ],
    derivedMetrics: [
      {
        id: 'boardPressure',
        computation: 'markerTotal',
        requirements: [{ key: 'population', expectedType: 'number' }],
        runtime: {
          kind: 'markerTotal',
          markerId: 'pressure',
          markerConfig: { activeState: 'high', passiveState: 'medium' },
          defaultMarkerState: 'low',
        },
      },
    ],
    seats: [{ id: 'us' }, { id: 'arvn' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: phaseId }] },
    agents,
    actions: [
      createAction('pass'),
      createAction('event'),
      createAction('operation'),
      createAction('alpha'),
      createAction('beta'),
      createAction('advance'),
    ],
    triggers: [],
    terminal: {
      conditions: [],
      margins: [
        { seat: 'us', value: { _t: 2 as const, ref: 'gvar', var: 'usMargin' } },
        { seat: 'arvn', value: 0 },
      ],
      ranking: {
        order: 'desc',
        tieBreakOrder: ['us', 'arvn'],
      },
    },
  };
}

function createCatalog(
  overrides: Partial<AgentPolicyCatalog['library']> = {},
  profileOverrides?: Partial<AgentPolicyCatalog['profiles']['baseline']>,
  candidateParamDefs: AgentPolicyCatalog['candidateParamDefs'] = {},
): AgentPolicyCatalog {
  return {
    schemaVersion: 2,
    catalogFingerprint: 'catalog',
    surfaceVisibility: {
      globalVars: {
        usMargin: {
          current: 'public',
          preview: { visibility: 'public', allowWhenHiddenSampling: true },
        },
      },
      perPlayerVars: {
        tempo: {
          current: 'seatVisible',
          preview: { visibility: 'seatVisible', allowWhenHiddenSampling: true },
        },
      },
      derivedMetrics: {
        boardPressure: {
          current: 'public',
          preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
        },
      },
      victory: {
        currentMargin: {
          current: 'public',
          preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
        },
        currentRank: {
          current: 'public',
          preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
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
    },
    parameterDefs: {
      passFloor: {
        type: 'number',
        required: false,
        tunable: true,
        default: 0.5,
        min: -5,
        max: 5,
      },
    },
    candidateParamDefs,
    library: {
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
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
        },
        ...(overrides.stateFeatures ?? {}),
      },
      candidateFeatures: {
        isPass: {
          type: 'boolean',
          costClass: 'candidate',
          expr: refExpr({ kind: 'candidateIntrinsic', intrinsic: 'isPass' }),
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
        },
        isEvent: {
          type: 'boolean',
          costClass: 'candidate',
          expr: opExpr('eq', refExpr({ kind: 'candidateIntrinsic', intrinsic: 'actionId' }), literal('event')),
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
        },
        ...(overrides.candidateFeatures ?? {}),
      },
      candidateAggregates: {
        bestNonPassMargin: {
          type: 'number',
          costClass: 'candidate',
          op: 'max',
          of: refExpr({ kind: 'library', refKind: 'stateFeature', id: 'currentMargin' }),
          where: opExpr('not', refExpr({ kind: 'library', refKind: 'candidateFeature', id: 'isPass' })),
          dependencies: {
            parameters: [],
            stateFeatures: ['currentMargin'],
            candidateFeatures: ['isPass'],
            aggregates: [],
          },
        },
        ...(overrides.candidateAggregates ?? {}),
      },
      pruningRules: {
        dropPassWhenMarginExists: {
          costClass: 'candidate',
          when: {
            kind: 'op',
            op: 'and',
            args: [
              refExpr({ kind: 'library', refKind: 'candidateFeature', id: 'isPass' }),
              opExpr(
                'gt',
                refExpr({ kind: 'library', refKind: 'aggregate', id: 'bestNonPassMargin' }),
                paramExpr('passFloor'),
              ),
            ],
          },
          dependencies: {
            parameters: ['passFloor'],
            stateFeatures: [],
            candidateFeatures: ['isPass'],
            aggregates: ['bestNonPassMargin'],
          },
          onEmpty: 'skipRule',
        },
        ...(overrides.pruningRules ?? {}),
      },
      scoreTerms: {
        preferEvents: {
          costClass: 'candidate',
          weight: literal(10),
          value: opExpr('boolToNumber', refExpr({ kind: 'library', refKind: 'candidateFeature', id: 'isEvent' })),
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: ['isEvent'], aggregates: [] },
        },
        ...(overrides.scoreTerms ?? {}),
      },
      completionScoreTerms: {},
      tieBreakers: {
        stableMoveKey: {
          kind: 'stableMoveKey',
          costClass: 'state',
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
        },
        rng: {
          kind: 'rng',
          costClass: 'state',
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
        },
        ...(overrides.tieBreakers ?? {}),
      },
    },
    profiles: {
      baseline: {
        fingerprint: 'baseline',
        params: { passFloor: 0.5 },
        use: {
          pruningRules: ['dropPassWhenMarginExists'],
          scoreTerms: ['preferEvents'],
          completionScoreTerms: [],
          tieBreakers: ['stableMoveKey'],
        },
        plan: {
          stateFeatures: ['currentMargin'],
          candidateFeatures: ['isPass', 'isEvent'],
          candidateAggregates: ['bestNonPassMargin'],
        },
        ...profileOverrides,
      },
    },
    bindingsBySeat: {
      us: 'baseline',
    },
  };
}

function createMoves(...actionIds: string[]): readonly Move[] {
  return actionIds.map((actionId) => ({ actionId: asActionId(actionId), params: {} }));
}

function createInput(agents: AgentPolicyCatalog, legalMoves: readonly Move[], seed = 7n) {
  const def = createBaseDef(agents);
  const state = initialState(def, Number(seed), 2).state;
  return {
    def,
    state: {
      ...state,
      globalVars: {
        ...state.globalVars,
        usMargin: 1,
      },
    },
    playerId: asPlayerId(0),
    legalMoves,
    trustedMoveIndex: new Map(),
    rng: createRng(seed),
  } as const;
}

function createChoiceRequest(overrides: Partial<ChoicePendingRequest> = {}): ChoicePendingRequest {
  return {
    kind: 'pending',
    complete: false,
    decisionKey: '$target',
    type: 'chooseOne',
    name: '$target',
    options: [
      { value: 'zone-a', legality: 'legal', illegalReason: null },
      { value: 'zone-b', legality: 'legal', illegalReason: null },
    ],
    targetKinds: ['zone'],
    ...overrides,
  } as ChoicePendingRequest;
}

function createHelperTestState(): { def: GameDef; state: GameState } {
  const def = createBaseDef(createCatalog());
  const base = initialState(def, 11, 2).state;
  return {
    def,
    state: {
      ...base,
      zones: {
        ...base.zones,
        'target-a:none': [
          { id: asTokenId('token-a'), type: 'base', props: { seat: '0', strength: 3, hidden: false } },
          { id: asTokenId('token-b'), type: 'troop', props: { seat: '1', strength: 5, hidden: true } },
        ],
        'target-b:none': [
          { id: asTokenId('token-c'), type: 'base', props: { seat: '1', strength: 2, hidden: false } },
        ],
      },
      zoneVars: {
        ...base.zoneVars,
        'target-a:none': { pressure: 3, control: 0 },
        'target-b:none': { pressure: 0, control: 2 },
      },
      activePlayer: asPlayerId(1),
    },
  };
}

function withAdjacency(def: GameDef): GameDef {
  return {
    ...def,
    zones: def.zones.map((zone) => {
      switch (String(zone.id)) {
        case 'frontier:0':
          return { ...zone, adjacentTo: [{ to: asZoneId('target-a:none'), direction: 'bidirectional' }] };
        case 'frontier:1':
          return { ...zone, adjacentTo: [{ to: asZoneId('target-b:none'), direction: 'bidirectional' }] };
        case 'frontier:none':
          return {
            ...zone,
            adjacentTo: [
              { to: asZoneId('target-a:none'), direction: 'bidirectional' },
              { to: asZoneId('target-b:none'), direction: 'bidirectional' },
            ],
          };
        case 'target-a:none':
          return {
            ...zone,
            adjacentTo: [
              { to: asZoneId('frontier:0'), direction: 'bidirectional' },
              { to: asZoneId('frontier:none'), direction: 'bidirectional' },
            ],
          };
        case 'target-b:none':
          return {
            ...zone,
            adjacentTo: [
              { to: asZoneId('frontier:1'), direction: 'bidirectional' },
              { to: asZoneId('frontier:none'), direction: 'bidirectional' },
            ],
          };
        default:
          return zone;
      }
    }),
  };
}

function createStateFeatureScoreCatalog(
  stateFeatures: Readonly<Record<string, AgentPolicyExpr>>,
  scoreExpr: AgentPolicyExpr,
  unknownAs?: number,
): AgentPolicyCatalog {
  const stateFeatureIds = Object.keys(stateFeatures);
  return createCatalog(
    {
      stateFeatures: Object.fromEntries(
        Object.entries(stateFeatures).map(([id, expr]) => [id, {
          type: 'number',
          costClass: 'state',
          expr,
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
        }]),
      ),
      scoreTerms: {
        scoreStateFeatures: {
          costClass: 'candidate',
          weight: literal(1),
          value: scoreExpr,
          ...(unknownAs === undefined ? {} : { unknownAs }),
          dependencies: { parameters: [], stateFeatures: stateFeatureIds, candidateFeatures: [], aggregates: [] },
        },
      },
    },
    {
      use: {
        pruningRules: [],
        scoreTerms: ['scoreStateFeatures'],
        completionScoreTerms: [],
        tieBreakers: ['stableMoveKey'],
      },
      plan: {
        stateFeatures: stateFeatureIds,
        candidateFeatures: [],
        candidateAggregates: [],
      },
    },
  );
}

describe('policy-eval', () => {
  describe('filter and scope matching helpers', () => {
    it('matches token filters by type, props, and combined predicates', () => {
      const token: Token = {
        id: asTokenId('token-1'),
        type: 'base',
        props: { seat: '0', strength: 4, hidden: false },
      };

      assert.equal(matchesTokenFilter(token, undefined), true);
      assert.equal(matchesTokenFilter(token, { type: 'base' }), true);
      assert.equal(matchesTokenFilter(token, { type: 'troop' }), false);
      assert.equal(matchesTokenFilter(token, { props: { seat: { eq: '0' } } }), true);
      assert.equal(matchesTokenFilter(token, { props: { seat: { eq: '1' } } }), false);
      assert.equal(
        matchesTokenFilter(token, {
          type: 'base',
          props: { seat: { eq: '0' }, hidden: { eq: false } },
        }),
        true,
      );
      assert.equal(
        matchesTokenFilter(token, {
          type: 'base',
          props: { missing: { eq: 'value' } },
        }),
        false,
      );
    });

    it('resolves self and active token-filter values to concrete player ids', () => {
      const { state } = createHelperTestState();

      assert.deepEqual(
        resolveTokenFilter(
          {
            type: 'base',
            props: {
              seat: { eq: 'self' },
              target: { eq: 'active' },
              hidden: { eq: false },
            },
          },
          asPlayerId(0),
          state,
        ),
        {
          type: 'base',
          props: {
            seat: { eq: asPlayerId(0) },
            target: { eq: asPlayerId(1) },
            hidden: { eq: false },
          },
        },
      );
      assert.equal(resolveTokenFilter(undefined, asPlayerId(0), state), undefined);
    });

    it('matches zone scope using board-by-default semantics for omitted zoneKind', () => {
      const boardZone: ZoneDef = {
        id: asZoneId('board:none'),
        owner: 'none',
        visibility: 'public',
        ordering: 'set',
      };
      const auxZone: ZoneDef = {
        id: asZoneId('aux:none'),
        owner: 'none',
        visibility: 'public',
        ordering: 'set',
        zoneKind: 'aux',
      };

      assert.equal(matchesZoneScope(boardZone, 'board'), true);
      assert.equal(matchesZoneScope(boardZone, 'aux'), false);
      assert.equal(matchesZoneScope(auxZone, 'board'), false);
      assert.equal(matchesZoneScope(auxZone, 'aux'), true);
      assert.equal(matchesZoneScope(boardZone, 'all'), true);
      assert.equal(matchesZoneScope(auxZone, 'all'), true);
    });

    it('matches zone filters across category, attributes, variables, and compound conditions', () => {
      const { def, state } = createHelperTestState();
      const province = def.zones.find((zone) => zone.id === asZoneId('target-a:none'))!;
      const otherProvince = def.zones.find((zone) => zone.id === asZoneId('target-b:none'))!;

      const attributeCases: readonly AgentPolicyZoneFilter[] = [
        { attribute: { prop: 'population', op: 'eq', value: 0 } },
        { attribute: { prop: 'population', op: 'gt', value: -1 } },
        { attribute: { prop: 'population', op: 'gte', value: 0 } },
        { attribute: { prop: 'population', op: 'lt', value: 1 } },
        { attribute: { prop: 'population', op: 'lte', value: 0 } },
      ];
      for (const filter of attributeCases) {
        assert.equal(matchesZoneFilter(province, filter, state), true);
      }

      const variableCases: readonly AgentPolicyZoneFilter[] = [
        { variable: { prop: 'pressure', op: 'eq', value: 3 } },
        { variable: { prop: 'pressure', op: 'gt', value: 2 } },
        { variable: { prop: 'pressure', op: 'gte', value: 3 } },
        { variable: { prop: 'pressure', op: 'lt', value: 4 } },
        { variable: { prop: 'pressure', op: 'lte', value: 3 } },
      ];
      for (const filter of variableCases) {
        assert.equal(matchesZoneFilter(province, filter, state), true);
      }

      assert.equal(matchesZoneFilter(province, { category: 'province' }, state), true);
      assert.equal(
        matchesZoneFilter(
          province,
          {
            category: 'province',
            attribute: { prop: 'population', op: 'eq', value: 0 },
          },
          state,
        ),
        true,
      );
      assert.equal(matchesZoneFilter(otherProvince, { variable: { prop: 'pressure', op: 'eq', value: 3 } }, state), false);
      assert.equal(matchesZoneFilter(province, undefined, state), true);
    });

    it('fails closed for missing values and mismatched comparison types', () => {
      const { def, state } = createHelperTestState();
      const province = def.zones.find((zone) => zone.id === asZoneId('target-a:none'))!;
      const missingVarsZone: ZoneDef = {
        id: asZoneId('fresh:none'),
        owner: 'none',
        visibility: 'public',
        ordering: 'set',
        category: 'province',
        attributes: { population: 0, climate: 'wet', hidden: false },
      };

      assert.equal(
        matchesZoneFilter(province, { attribute: { prop: 'missing', op: 'eq', value: 0 } }, state),
        false,
      );
      assert.equal(
        matchesZoneFilter(missingVarsZone, { variable: { prop: 'pressure', op: 'eq', value: 0 } }, state),
        false,
      );
      assert.equal(
        matchesZoneFilter(province, { attribute: { prop: 'population', op: 'gt', value: '0' } }, state),
        false,
      );
      assert.equal(
        matchesZoneFilter(missingVarsZone, { attribute: { prop: 'hidden', op: 'gt', value: false } }, state),
        false,
      );
      assert.equal(
        matchesZoneFilter(missingVarsZone, { attribute: { prop: 'climate', op: 'gte', value: 'arid' } }, state),
        true,
      );
    });
  });

  describe('globalTokenAgg evaluation', () => {
    it('counts filtered board tokens across multiple zones and resolves self in token filters', () => {
      const agents = createStateFeatureScoreCatalog(
        {
          selfBaseCount: {
            kind: 'globalTokenAgg',
            tokenFilter: {
              type: 'base',
              props: { seat: { eq: 'self' } },
            },
            aggOp: 'count',
            zoneScope: 'board',
          },
        },
        refExpr({ kind: 'library', refKind: 'stateFeature', id: 'selfBaseCount' }),
      );
      const baseInput = createInput(agents, createMoves('alpha'));
      const input = {
        ...baseInput,
        state: {
          ...baseInput.state,
          zones: {
            ...baseInput.state.zones,
            'frontier:none': [
              { id: asTokenId('frontier-base'), type: 'base', props: { seat: asPlayerId(0), strength: 2 } },
            ],
            'target-a:none': [
              { id: asTokenId('province-base-a'), type: 'base', props: { seat: asPlayerId(0), strength: 3 } },
              { id: asTokenId('province-troop'), type: 'troop', props: { seat: asPlayerId(1), strength: 5 } },
            ],
            'target-b:none': [
              { id: asTokenId('province-base-b'), type: 'base', props: { seat: asPlayerId(0), strength: 4 } },
              { id: asTokenId('province-base-c'), type: 'base', props: { seat: asPlayerId(1), strength: 1 } },
            ],
          },
        },
      } as const;

      const result = evaluatePolicyMove(input);

      assert.equal(result.metadata.candidates[0]?.score, 3);
    });

    it('sums numeric token props across filtered zones only', () => {
      const agents = createStateFeatureScoreCatalog(
        {
          provinceTroopStrength: {
            kind: 'globalTokenAgg',
            tokenFilter: { type: 'troop' },
            aggOp: 'sum',
            prop: 'strength',
            zoneFilter: { category: 'province' },
            zoneScope: 'board',
          },
        },
        refExpr({ kind: 'library', refKind: 'stateFeature', id: 'provinceTroopStrength' }),
      );
      const baseInput = createInput(agents, createMoves('alpha'));
      const input = {
        ...baseInput,
        state: {
          ...baseInput.state,
          zones: {
            ...baseInput.state.zones,
            'frontier:none': [
              { id: asTokenId('frontier-troop'), type: 'troop', props: { strength: 9 } },
            ],
            'target-a:none': [
              { id: asTokenId('province-troop-a'), type: 'troop', props: { strength: 4 } },
              { id: asTokenId('province-base'), type: 'base', props: { strength: 7 } },
            ],
            'target-b:none': [
              { id: asTokenId('province-troop-b'), type: 'troop', props: { strength: 2 } },
              { id: asTokenId('province-troop-c'), type: 'troop', props: { hidden: true } },
            ],
          },
        },
      } as const;

      const result = evaluatePolicyMove(input);

      assert.equal(result.metadata.candidates[0]?.score, 6);
    });

    it('computes extrema and preserves empty-input semantics by aggregate family', () => {
      const agents = createStateFeatureScoreCatalog(
        {
          maxBaseStrength: {
            kind: 'globalTokenAgg',
            tokenFilter: { type: 'base' },
            aggOp: 'max',
            prop: 'strength',
            zoneScope: 'board',
          },
          minBaseStrength: {
            kind: 'globalTokenAgg',
            tokenFilter: { type: 'base' },
            aggOp: 'min',
            prop: 'strength',
            zoneScope: 'board',
          },
          missingBaseStrengthSum: {
            kind: 'globalTokenAgg',
            tokenFilter: { type: 'base', props: { seat: { eq: 'missing' } } },
            aggOp: 'sum',
            prop: 'strength',
            zoneScope: 'board',
          },
          missingBaseStrengthMax: {
            kind: 'globalTokenAgg',
            tokenFilter: { type: 'base', props: { seat: { eq: 'missing' } } },
            aggOp: 'max',
            prop: 'strength',
            zoneScope: 'board',
          },
        },
        opExpr(
          'add',
          refExpr({ kind: 'library', refKind: 'stateFeature', id: 'maxBaseStrength' }),
          refExpr({ kind: 'library', refKind: 'stateFeature', id: 'minBaseStrength' }),
          refExpr({ kind: 'library', refKind: 'stateFeature', id: 'missingBaseStrengthSum' }),
          opExpr(
            'coalesce',
            refExpr({ kind: 'library', refKind: 'stateFeature', id: 'missingBaseStrengthMax' }),
            literal(-1),
          ),
        ),
      );
      const baseInput = createInput(agents, createMoves('alpha'));
      const input = {
        ...baseInput,
        state: {
          ...baseInput.state,
          zones: {
            ...baseInput.state.zones,
            'frontier:none': [
              { id: asTokenId('base-1'), type: 'base', props: { seat: 'alpha', strength: 6 } },
            ],
            'target-a:none': [
              { id: asTokenId('base-2'), type: 'base', props: { seat: 'beta', strength: 2 } },
            ],
            'target-b:none': [
              { id: asTokenId('base-3'), type: 'base', props: { seat: 'gamma', strength: 4 } },
            ],
          },
        },
      } as const;

      const result = evaluatePolicyMove(input);

      assert.equal(result.metadata.candidates[0]?.score, 7);
    });

    it('distinguishes board and all zone scopes', () => {
      const agents = createStateFeatureScoreCatalog(
        {
          boardBaseCount: {
            kind: 'globalTokenAgg',
            tokenFilter: { type: 'base' },
            aggOp: 'count',
            zoneScope: 'board',
          },
          allBaseCount: {
            kind: 'globalTokenAgg',
            tokenFilter: { type: 'base' },
            aggOp: 'count',
            zoneScope: 'all',
          },
        },
        opExpr(
          'add',
          refExpr({ kind: 'library', refKind: 'stateFeature', id: 'boardBaseCount' }),
          refExpr({ kind: 'library', refKind: 'stateFeature', id: 'allBaseCount' }),
        ),
      );
      const baseInput = createInput(agents, createMoves('alpha'));
      const auxZoneId = asZoneId('reserve:none');
      const input = {
        ...baseInput,
        def: {
          ...baseInput.def,
          zones: [
            ...baseInput.def.zones,
            {
              id: auxZoneId,
              owner: 'none',
              visibility: 'public',
              ordering: 'set',
              zoneKind: 'aux',
            },
          ],
        },
        state: {
          ...baseInput.state,
          zones: {
            ...baseInput.state.zones,
            'frontier:none': [
              { id: asTokenId('board-base'), type: 'base', props: { strength: 1 } },
            ],
            [auxZoneId]: [
              { id: asTokenId('aux-base'), type: 'base', props: { strength: 1 } },
            ],
          },
        },
      } as const;

      const result = evaluatePolicyMove(input);

      assert.equal(result.metadata.candidates[0]?.score, 3);
    });
  });

  describe('globalZoneAgg evaluation', () => {
    it('sums filtered zone variables across board zones', () => {
      const agents = createStateFeatureScoreCatalog(
        {
          totalProvinceOpposition: {
            kind: 'globalZoneAgg',
            source: 'variable',
            field: 'opposition',
            aggOp: 'sum',
            zoneFilter: {
              category: 'province',
              variable: { prop: 'support', op: 'gte', value: 1 },
            },
            zoneScope: 'board',
          },
        },
        refExpr({ kind: 'library', refKind: 'stateFeature', id: 'totalProvinceOpposition' }),
      );
      const baseInput = createInput(agents, createMoves('alpha'));
      const input = {
        ...baseInput,
        state: {
          ...baseInput.state,
          zoneVars: {
            ...baseInput.state.zoneVars,
            'target-a:none': { opposition: 5, support: 1 },
            'target-b:none': { opposition: 7, support: 0 },
            'frontier:none': { opposition: 11, support: 1 },
          },
        },
      } as const;

      const result = evaluatePolicyMove(input);

      assert.equal(result.metadata.candidates[0]?.score, 5);
    });

    it('counts matching zones while ignoring field values', () => {
      const agents = createStateFeatureScoreCatalog(
        {
          contestedProvinceCount: {
            kind: 'globalZoneAgg',
            source: 'variable',
            field: 'unusedForCount',
            aggOp: 'count',
            zoneFilter: {
              category: 'province',
              variable: { prop: 'opposition', op: 'gt', value: 0 },
            },
            zoneScope: 'board',
          },
        },
        refExpr({ kind: 'library', refKind: 'stateFeature', id: 'contestedProvinceCount' }),
      );
      const baseInput = createInput(agents, createMoves('alpha'));
      const input = {
        ...baseInput,
        state: {
          ...baseInput.state,
          zoneVars: {
            ...baseInput.state.zoneVars,
            'target-a:none': { opposition: 2 },
            'target-b:none': { opposition: 1 },
            'rear:none': { opposition: 4 },
          },
        },
      } as const;

      const result = evaluatePolicyMove(input);

      assert.equal(result.metadata.candidates[0]?.score, 2);
    });

    it('reads attributes from zone definitions, ignores non-numeric values, and preserves empty extrema semantics', () => {
      const agents = createStateFeatureScoreCatalog(
        {
          maxProvincePopulation: {
            kind: 'globalZoneAgg',
            source: 'attribute',
            field: 'population',
            aggOp: 'max',
            zoneFilter: { category: 'province' },
            zoneScope: 'board',
          },
          minProvincePopulation: {
            kind: 'globalZoneAgg',
            source: 'attribute',
            field: 'population',
            aggOp: 'min',
            zoneFilter: { category: 'province' },
            zoneScope: 'board',
          },
          populationTagSum: {
            kind: 'globalZoneAgg',
            source: 'attribute',
            field: 'tags',
            aggOp: 'sum',
            zoneFilter: { category: 'province' },
            zoneScope: 'board',
          },
          missingPopulationMax: {
            kind: 'globalZoneAgg',
            source: 'attribute',
            field: 'missingPopulation',
            aggOp: 'max',
            zoneFilter: { category: 'province' },
            zoneScope: 'board',
          },
        },
        opExpr(
          'add',
          refExpr({ kind: 'library', refKind: 'stateFeature', id: 'maxProvincePopulation' }),
          refExpr({ kind: 'library', refKind: 'stateFeature', id: 'minProvincePopulation' }),
          refExpr({ kind: 'library', refKind: 'stateFeature', id: 'populationTagSum' }),
          opExpr(
            'coalesce',
            refExpr({ kind: 'library', refKind: 'stateFeature', id: 'missingPopulationMax' }),
            literal(-1),
          ),
        ),
      );
      const baseInput = createInput(agents, createMoves('alpha'));
      const input = {
        ...baseInput,
        def: {
          ...baseInput.def,
          zones: baseInput.def.zones.map((zone) => {
            if (zone.id === asZoneId('target-a:none')) {
              return {
                ...zone,
                attributes: { population: 5, tags: ['remote', 'hot'] },
              };
            }
            if (zone.id === asZoneId('target-b:none')) {
              return {
                ...zone,
                attributes: { population: 2, tags: ['coastal'] },
              };
            }
            if (zone.id === asZoneId('frontier:none')) {
              return {
                ...zone,
                attributes: { population: 99 },
              };
            }
            return zone;
          }),
        },
      } as const;

      const result = evaluatePolicyMove(input);

      assert.equal(result.metadata.candidates[0]?.score, 6);
    });

    it('keeps variable and attribute sources isolated', () => {
      const agents = createStateFeatureScoreCatalog(
        {
          variablePopulation: {
            kind: 'globalZoneAgg',
            source: 'variable',
            field: 'population',
            aggOp: 'sum',
            zoneFilter: { category: 'province' },
            zoneScope: 'board',
          },
          attributeOpposition: {
            kind: 'globalZoneAgg',
            source: 'attribute',
            field: 'opposition',
            aggOp: 'sum',
            zoneFilter: { category: 'province' },
            zoneScope: 'board',
          },
        },
        opExpr(
          'add',
          refExpr({ kind: 'library', refKind: 'stateFeature', id: 'variablePopulation' }),
          refExpr({ kind: 'library', refKind: 'stateFeature', id: 'attributeOpposition' }),
        ),
      );
      const baseInput = createInput(agents, createMoves('alpha'));
      const input = {
        ...baseInput,
        def: {
          ...baseInput.def,
          zones: baseInput.def.zones.map((zone) => {
            if (zone.id === asZoneId('target-a:none')) {
              return {
                ...zone,
                attributes: { population: 99, opposition: 4 },
              };
            }
            if (zone.id === asZoneId('target-b:none')) {
              return {
                ...zone,
                attributes: { population: 42, opposition: 6 },
              };
            }
            return zone;
          }),
        },
        state: {
          ...baseInput.state,
          zoneVars: {
            ...baseInput.state.zoneVars,
            'target-a:none': { population: 3, opposition: 100 },
            'target-b:none': { population: 2, opposition: 200 },
          },
        },
      } as const;

      const result = evaluatePolicyMove(input);

      assert.equal(result.metadata.candidates[0]?.score, 15);
    });
  });

  describe('adjacentTokenAgg evaluation', () => {
    it('counts matching tokens across zones adjacent to the resolved anchor', () => {
      const agents = createStateFeatureScoreCatalog(
        {
          selfAdjacentBases: {
            kind: 'adjacentTokenAgg',
            anchorZone: 'frontier:none',
            tokenFilter: {
              type: 'base',
              props: { seat: { eq: 'self' } },
            },
            aggOp: 'count',
          },
        },
        refExpr({ kind: 'library', refKind: 'stateFeature', id: 'selfAdjacentBases' }),
      );
      const baseInput = createInput(agents, createMoves('alpha'));
      const input = {
        ...baseInput,
        def: withAdjacency(baseInput.def),
        state: {
          ...baseInput.state,
          zones: {
            ...baseInput.state.zones,
            'target-a:none': [
              { id: asTokenId('adj-base-a'), type: 'base', props: { seat: asPlayerId(0), strength: 3 } },
              { id: asTokenId('adj-troop-a'), type: 'troop', props: { seat: asPlayerId(0), strength: 1 } },
            ],
            'target-b:none': [
              { id: asTokenId('adj-base-b'), type: 'base', props: { seat: asPlayerId(0), strength: 2 } },
              { id: asTokenId('adj-base-c'), type: 'base', props: { seat: asPlayerId(1), strength: 5 } },
            ],
            'rear:none': [
              { id: asTokenId('non-adj-base'), type: 'base', props: { seat: asPlayerId(0), strength: 9 } },
            ],
          },
        },
      } as const;

      const result = evaluatePolicyMove(input);

      assert.equal(result.metadata.candidates[0]?.score, 2);
    });

    it('sums numeric token props in adjacent zones only', () => {
      const agents = createStateFeatureScoreCatalog(
        {
          adjacentTroopStrength: {
            kind: 'adjacentTokenAgg',
            anchorZone: 'frontier:none',
            tokenFilter: { type: 'troop' },
            aggOp: 'sum',
            prop: 'strength',
          },
        },
        refExpr({ kind: 'library', refKind: 'stateFeature', id: 'adjacentTroopStrength' }),
      );
      const baseInput = createInput(agents, createMoves('alpha'));
      const input = {
        ...baseInput,
        def: withAdjacency(baseInput.def),
        state: {
          ...baseInput.state,
          zones: {
            ...baseInput.state.zones,
            'target-a:none': [
              { id: asTokenId('adj-troop-a'), type: 'troop', props: { strength: 4 } },
            ],
            'target-b:none': [
              { id: asTokenId('adj-troop-b'), type: 'troop', props: { strength: 2 } },
              { id: asTokenId('adj-troop-c'), type: 'troop', props: { hidden: true } },
            ],
            'rear:none': [
              { id: asTokenId('non-adj-troop'), type: 'troop', props: { strength: 9 } },
            ],
          },
        },
      } as const;

      const result = evaluatePolicyMove(input);

      assert.equal(result.metadata.candidates[0]?.score, 6);
    });

    it('returns zero for anchors with no neighbors or no matching adjacent tokens', () => {
      const agents = createStateFeatureScoreCatalog(
        {
          isolatedNeighborCount: {
            kind: 'adjacentTokenAgg',
            anchorZone: 'rear:none',
            tokenFilter: { type: 'base' },
            aggOp: 'count',
          },
          missingAdjacentStrength: {
            kind: 'adjacentTokenAgg',
            anchorZone: 'frontier:none',
            tokenFilter: { type: 'base', props: { seat: { eq: 'missing' } } },
            aggOp: 'sum',
            prop: 'strength',
          },
        },
        opExpr(
          'add',
          refExpr({ kind: 'library', refKind: 'stateFeature', id: 'isolatedNeighborCount' }),
          refExpr({ kind: 'library', refKind: 'stateFeature', id: 'missingAdjacentStrength' }),
        ),
      );
      const baseInput = createInput(agents, createMoves('alpha'));
      const input = {
        ...baseInput,
        def: withAdjacency(baseInput.def),
        state: {
          ...baseInput.state,
          zones: {
            ...baseInput.state.zones,
            'target-a:none': [
              { id: asTokenId('adj-base-a'), type: 'base', props: { seat: asPlayerId(0), strength: 3 } },
            ],
          },
        },
      } as const;

      const result = evaluatePolicyMove(input);

      assert.equal(result.metadata.candidates[0]?.score, 0);
    });

    it('resolves actor and active owner segments in anchorZone strings', () => {
      const agents = createStateFeatureScoreCatalog(
        {
          selfAnchorLoad: {
            kind: 'adjacentTokenAgg',
            anchorZone: 'frontier:actor',
            tokenFilter: { type: 'troop' },
            aggOp: 'sum',
            prop: 'strength',
          },
          activeAnchorLoad: {
            kind: 'adjacentTokenAgg',
            anchorZone: 'frontier:active',
            tokenFilter: { type: 'troop' },
            aggOp: 'sum',
            prop: 'strength',
          },
        },
        opExpr(
          'add',
          refExpr({ kind: 'library', refKind: 'stateFeature', id: 'selfAnchorLoad' }),
          refExpr({ kind: 'library', refKind: 'stateFeature', id: 'activeAnchorLoad' }),
        ),
      );
      const baseInput = createInput(agents, createMoves('alpha'));
      const input = {
        ...baseInput,
        def: withAdjacency(baseInput.def),
        state: {
          ...baseInput.state,
          activePlayer: asPlayerId(1),
          zones: {
            ...baseInput.state.zones,
            'target-a:none': [
              { id: asTokenId('self-adj-troop'), type: 'troop', props: { strength: 4 } },
            ],
            'target-b:none': [
              { id: asTokenId('active-adj-troop'), type: 'troop', props: { strength: 2 } },
            ],
          },
        },
      } as const;

      const result = evaluatePolicyMove(input);

      assert.equal(result.metadata.candidates[0]?.score, 6);
    });

    it('preserves empty extrema semantics for adjacent aggregates', () => {
      const agents = createStateFeatureScoreCatalog(
        {
          missingAdjacentMax: {
            kind: 'adjacentTokenAgg',
            anchorZone: 'frontier:none',
            tokenFilter: { type: 'base', props: { seat: { eq: 'missing' } } },
            aggOp: 'max',
            prop: 'strength',
          },
          missingAdjacentMin: {
            kind: 'adjacentTokenAgg',
            anchorZone: 'frontier:none',
            tokenFilter: { type: 'base', props: { seat: { eq: 'missing' } } },
            aggOp: 'min',
            prop: 'strength',
          },
        },
        opExpr(
          'add',
          opExpr(
            'coalesce',
            refExpr({ kind: 'library', refKind: 'stateFeature', id: 'missingAdjacentMax' }),
            literal(-1),
          ),
          opExpr(
            'coalesce',
            refExpr({ kind: 'library', refKind: 'stateFeature', id: 'missingAdjacentMin' }),
            literal(-2),
          ),
        ),
      );
      const baseInput = createInput(agents, createMoves('alpha'));
      const input = {
        ...baseInput,
        def: withAdjacency(baseInput.def),
        state: {
          ...baseInput.state,
          zones: {
            ...baseInput.state.zones,
            'target-a:none': [
              { id: asTokenId('adj-base-a'), type: 'base', props: { seat: asPlayerId(0), strength: 3 } },
            ],
          },
        },
      } as const;

      const result = evaluatePolicyMove(input);

      assert.equal(result.metadata.candidates[0]?.score, -3);
    });
  });

  it('routes intrinsic, candidate, current, preview, and completion reads through explicit runtime providers', () => {
    const input = createInput(
      createCatalog(
        {},
        undefined,
        {
          eventCardId: { type: 'id' },
        },
      ),
      [{ actionId: asActionId('advance'), params: { eventCardId: 'card-2' } }],
    );

    const providers = createPolicyRuntimeProviders({
      def: input.def,
      state: input.state,
      playerId: input.playerId,
      seatId: 'us',
      trustedMoveIndex: new Map(),
      catalog: input.def.agents!,
      completion: {
        request: createChoiceRequest(),
        optionValue: 'zone-b',
      },
      runtimeError: (code, message) => new Error(`${code}: ${message}`),
    });
    const candidate = {
      move: input.legalMoves[0]!,
      stableMoveKey: 'advance|{"eventCardId":"card-2"}|false|unclassified',
      actionId: 'advance',
    };

    assert.equal(providers.intrinsics.resolveSeatIntrinsic('self'), 'us');
    assert.equal(providers.intrinsics.resolveTurnIntrinsic('phaseId'), 'main');
    assert.equal(providers.intrinsics.resolveTurnIntrinsic('round'), input.state.turnCount);
    assert.equal(providers.candidates.resolveCandidateIntrinsic(candidate, 'actionId'), 'advance');
    assert.equal(providers.candidates.resolveCandidateParam(candidate, 'eventCardId'), 'card-2');
    assert.equal(
      providers.currentSurface.resolveSurface({
        kind: 'currentSurface',
        family: 'globalVar',
        id: 'usMargin',
      } satisfies CompiledAgentPolicyCurrentSurfaceRef),
      1,
    );
    assert.deepEqual(
      providers.previewSurface.resolveSurface(candidate, {
        kind: 'previewSurface',
        family: 'globalVar',
        id: 'usMargin',
      } satisfies CompiledAgentPolicyPreviewSurfaceRef),
      { kind: 'value', value: 4 },
    );
    assert.equal(providers.completion?.resolveDecisionIntrinsic('type'), 'chooseOne');
    assert.equal(providers.completion?.resolveDecisionIntrinsic('targetKind'), 'zone');
    assert.equal(providers.completion?.resolveDecisionIntrinsic('optionCount'), 2);
    assert.equal(providers.completion?.resolveOptionIntrinsic('value'), 'zone-b');
  });

  it('maps completion intrinsics from request metadata and falls back targetKind to unknown', () => {
    const provider = createPolicyCompletionProvider(
      createChoiceRequest({
        type: 'chooseN',
        name: '$pickZones',
        options: [
          { value: 'zone-a', legality: 'legal', illegalReason: null },
          { value: 'zone-c', legality: 'legal', illegalReason: null },
          { value: 'zone-d', legality: 'illegal', illegalReason: 'pipelineAtomicCostValidationFailed' },
        ],
        targetKinds: [],
        selected: [],
        canConfirm: true,
      }),
      ['zone-a', 'zone-c'] satisfies MoveParamValue,
    );

    assert.equal(provider.resolveDecisionIntrinsic('type'), 'chooseN');
    assert.equal(provider.resolveDecisionIntrinsic('name'), '$pickZones');
    assert.equal(provider.resolveDecisionIntrinsic('targetKind'), 'unknown');
    assert.equal(provider.resolveDecisionIntrinsic('optionCount'), 3);
    assert.deepEqual(provider.resolveOptionIntrinsic('value'), ['zone-a', 'zone-c']);
  });

  it('omits completion providers when no completion context is supplied', () => {
    const input = createInput(createCatalog(), createMoves('event'));
    const providers = createPolicyRuntimeProviders({
      def: input.def,
      state: input.state,
      playerId: input.playerId,
      seatId: 'us',
      trustedMoveIndex: new Map(),
      catalog: input.def.agents!,
      runtimeError: (code, message) => new Error(`${code}: ${message}`),
    });

    assert.equal(providers.completion, undefined);
  });

  it('resolves player-scoped per-player refs by runtime player identity in symmetric seats', () => {
    const def = createBaseDef(createCatalog());
    const baseState = initialState(def, 7, 2).state;
    const state = {
      ...baseState,
      perPlayerVars: [
        { tempo: 1 },
        { tempo: 6 },
      ],
    };
    const providers = createPolicyRuntimeProviders({
      def: {
        ...def,
        seats: [{ id: 'neutral' }, { id: 'neutral' }],
      },
      state,
      playerId: asPlayerId(1),
      seatId: 'neutral',
      trustedMoveIndex: new Map(),
      catalog: def.agents!,
      runtimeError: (code, message) => new Error(`${code}: ${message}`),
    });

    assert.equal(
      providers.currentSurface.resolveSurface({
        kind: 'currentSurface',
        family: 'perPlayerVar',
        id: 'tempo',
        selector: { kind: 'player', player: 'self' },
      } satisfies CompiledAgentPolicyCurrentSurfaceRef),
      6,
    );
  });

  it('prunes pass, scores surviving candidates, and resolves deterministic ties by stable move key', () => {
    const input = createInput(createCatalog(), createMoves('operation', 'pass', 'event'));

    const result = evaluatePolicyMove(input);

    assert.equal(result.move.actionId, asActionId('event'));
    assert.equal(result.metadata.usedFallback, false);
    assert.equal(result.metadata.failure, null);
    assert.deepEqual(result.metadata.canonicalOrder, [
      'event|{}|false|unclassified',
      'operation|{}|false|unclassified',
      'pass|{}|false|unclassified',
    ]);
    assert.deepEqual(
      result.metadata.candidates.find((candidate) => candidate.actionId === 'pass')?.prunedBy,
      ['dropPassWhenMarginExists'],
    );
    assert.equal(
      result.metadata.candidates.find((candidate) => candidate.actionId === 'event')?.score,
      10,
    );
  });

  it('treats skipRule pruning as non-destructive when it would empty the candidate set', () => {
    const agents = createCatalog(
      {
        pruningRules: {
          pruneEverything: {
            costClass: 'candidate',
            when: literal(true),
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
            onEmpty: 'skipRule',
          },
        },
      },
      {
        use: {
          pruningRules: ['pruneEverything'],
          scoreTerms: [],
          completionScoreTerms: [],
          tieBreakers: ['stableMoveKey'],
        },
        plan: {
          stateFeatures: [],
          candidateFeatures: [],
          candidateAggregates: [],
        },
      },
    );
    const input = createInput(agents, createMoves('beta', 'alpha'));

    const result = evaluatePolicyMove(input);

    assert.equal(result.move.actionId, asActionId('alpha'));
    assert.deepEqual(
      result.metadata.candidates.map((candidate) => candidate.prunedBy),
      [[], []],
    );
  });

  it('returns failure metadata from the core and canonical fallback from the public helper when pruning onEmpty is error', () => {
    const agents = createCatalog(
      {
        pruningRules: {
          pruneEverything: {
            costClass: 'candidate',
            when: literal(true),
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
            onEmpty: 'error',
          },
        },
      },
      {
        use: {
          pruningRules: ['pruneEverything'],
          scoreTerms: [],
          completionScoreTerms: [],
          tieBreakers: ['stableMoveKey'],
        },
        plan: {
          stateFeatures: [],
          candidateFeatures: [],
          candidateAggregates: [],
        },
      },
    );
    const input = createInput(agents, createMoves('beta', 'alpha'));

    const core = evaluatePolicyMoveCore(input);
    assert.equal(core.kind, 'failure');
    if (core.kind === 'failure') {
      assert.equal(core.failure.code, 'PRUNING_RULE_EMPTIED_CANDIDATES');
    }

    const fallback = evaluatePolicyMove(input);
    assert.equal(fallback.move.actionId, asActionId('alpha'));
    assert.equal(fallback.metadata.usedFallback, true);
    assert.equal(fallback.metadata.failure?.code, 'PRUNING_RULE_EMPTIED_CANDIDATES');
  });

  it('evaluates preview-backed score terms against one-ply applied state', () => {
    const agents = createCatalog(
      {
        candidateFeatures: {
          projectedMargin: {
            type: 'number',
            costClass: 'preview',
            expr: refExpr({ kind: 'previewSurface', family: 'globalVar', id: 'usMargin' }),
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
          },
          maskedProjectedStanding: {
            type: 'number',
            costClass: 'preview',
            expr: refExpr({
              kind: 'previewSurface',
              family: 'victoryCurrentMargin',
              id: 'currentMargin',
              selector: { kind: 'role', seatToken: 'us' },
            }),
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
          },
        },
        scoreTerms: {
          preferProjectedMargin: {
            costClass: 'preview',
            weight: literal(1),
            value: refExpr({ kind: 'library', refKind: 'candidateFeature', id: 'projectedMargin' }),
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: ['projectedMargin'], aggregates: [] },
          },
          reinforceProjectedMargin: {
            costClass: 'preview',
            weight: literal(1),
            value: refExpr({ kind: 'library', refKind: 'candidateFeature', id: 'projectedMargin' }),
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: ['projectedMargin'], aggregates: [] },
          },
          ignoreMaskedStanding: {
            costClass: 'preview',
            weight: literal(1),
            value: refExpr({ kind: 'library', refKind: 'candidateFeature', id: 'maskedProjectedStanding' }),
            unknownAs: 0,
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: ['maskedProjectedStanding'], aggregates: [] },
          },
        },
      },
      {
        use: {
          pruningRules: [],
          scoreTerms: ['preferProjectedMargin', 'reinforceProjectedMargin', 'ignoreMaskedStanding'],
          completionScoreTerms: [],
          tieBreakers: ['stableMoveKey'],
        },
        plan: {
          stateFeatures: [],
          candidateFeatures: ['projectedMargin', 'maskedProjectedStanding'],
          candidateAggregates: [],
        },
      },
    );
    const input = createInput(agents, createMoves('alpha', 'advance'));

    const result = evaluatePolicyMove(input);

    assert.equal(result.move.actionId, asActionId('advance'));
    assert.equal(
      result.metadata.candidates.find((candidate) => candidate.actionId === 'advance')?.score,
      8,
    );
    assert.equal(
      result.metadata.candidates.find((candidate) => candidate.actionId === 'alpha')?.score,
      2,
    );
  });

  it('evaluates preview-backed score terms for trusted completed moves that are already indexed', () => {
    const chooseTargetAction = {
      id: asActionId('chooseTarget'),
      actor: 'active' as const,
      executor: 'actor' as const,
      phase: [phaseId],
      params: [],
      pre: null,
      cost: [],
      effects: [
        eff({
          chooseOne: {
            internalDecisionId: 'decision:$targetMargin',
            bind: '$targetMargin',
            options: { query: 'enums', values: ['low', 'high'] },
          },
        }),
        eff({
          if: {
            when: { op: '==', left: { _t: 2 as const, ref: 'binding', name: '$targetMargin' }, right: 'high' },
            then: [eff({ setVar: { scope: 'global', var: 'usMargin', value: 8 } })],
            else: [eff({ setVar: { scope: 'global', var: 'usMargin', value: 2 } })],
          },
        }),
      ],
      limits: [],
    };
    const agents = createCatalog(
      {
        candidateFeatures: {
          projectedMargin: {
            type: 'number',
            costClass: 'preview',
            expr: refExpr({ kind: 'previewSurface', family: 'globalVar', id: 'usMargin' }),
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
          },
        },
        scoreTerms: {
          preferProjectedMargin: {
            costClass: 'preview',
            weight: literal(1),
            value: refExpr({ kind: 'library', refKind: 'candidateFeature', id: 'projectedMargin' }),
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: ['projectedMargin'], aggregates: [] },
          },
        },
      },
      {
        use: {
          pruningRules: [],
          scoreTerms: ['preferProjectedMargin'],
          completionScoreTerms: [],
          tieBreakers: ['stableMoveKey'],
        },
        plan: {
          stateFeatures: [],
          candidateFeatures: ['projectedMargin'],
          candidateAggregates: [],
        },
      },
    );
    const def = {
      ...createBaseDef(agents),
      actions: [chooseTargetAction],
    };
    const state = initialState(def, 7, 2).state;
    const lowMarginMove: Move = { actionId: asActionId('chooseTarget'), params: { '$targetMargin': 'low' } };
    const highMarginMove: Move = { actionId: asActionId('chooseTarget'), params: { '$targetMargin': 'high' } };

    const result = evaluatePolicyMove({
      def,
      state: {
        ...state,
        globalVars: {
          ...state.globalVars,
          usMargin: 1,
        },
      },
      playerId: asPlayerId(0),
      legalMoves: [lowMarginMove, highMarginMove],
      trustedMoveIndex: new Map([
        [toMoveIdentityKey(def, lowMarginMove), createTrustedExecutableMove(lowMarginMove, state.stateHash, 'templateCompletion')],
        [toMoveIdentityKey(def, highMarginMove), createTrustedExecutableMove(highMarginMove, state.stateHash, 'templateCompletion')],
      ]),
      rng: createRng(7n),
    });

    assert.deepEqual(result.move, highMarginMove);
    assert.equal(
      result.metadata.candidates.find((candidate) => candidate.stableMoveKey === toMoveIdentityKey(def, highMarginMove))?.score,
      8,
    );
    assert.equal(
      result.metadata.candidates.find((candidate) => candidate.stableMoveKey === toMoveIdentityKey(def, lowMarginMove))?.score,
      2,
    );
  });

  it('resolves metric refs through the shared runtime metric contract', () => {
    const agents = createCatalog(
      {
        stateFeatures: {
          unsupportedMetric: {
            type: 'number',
            costClass: 'state',
            expr: refExpr({ kind: 'currentSurface', family: 'derivedMetric', id: 'boardPressure' }),
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
          },
        },
        scoreTerms: {
          preferMetric: {
            costClass: 'state',
            weight: literal(1),
            value: refExpr({ kind: 'library', refKind: 'stateFeature', id: 'unsupportedMetric' }),
            dependencies: { parameters: [], stateFeatures: ['unsupportedMetric'], candidateFeatures: [], aggregates: [] },
          },
        },
      },
      {
        use: {
          pruningRules: [],
          scoreTerms: ['preferMetric'],
          completionScoreTerms: [],
          tieBreakers: ['stableMoveKey'],
        },
        plan: {
          stateFeatures: ['unsupportedMetric'],
          candidateFeatures: [],
          candidateAggregates: [],
        },
      },
    );
    const input = createInput(agents, createMoves('beta', 'alpha'));

    const result = evaluatePolicyMove(input);

    assert.equal(result.move.actionId, asActionId('alpha'));
    assert.equal(result.metadata.usedFallback, false);
    assert.equal(result.metadata.failure, null);
  });

  it('reports unsupported current-surface refs as provider-owned runtime failures', () => {
    const agents = createCatalog(
      {
        stateFeatures: {
          unknownSurface: {
            type: 'number',
            costClass: 'state',
            expr: refExpr({ kind: 'currentSurface', family: 'globalVar', id: 'notExposed' }),
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
          },
        },
        scoreTerms: {
          preferUnknownSurface: {
            costClass: 'state',
            weight: literal(1),
            value: refExpr({ kind: 'library', refKind: 'stateFeature', id: 'unknownSurface' }),
            dependencies: { parameters: [], stateFeatures: ['unknownSurface'], candidateFeatures: [], aggregates: [] },
          },
        },
      },
      {
        use: {
          pruningRules: [],
          scoreTerms: ['preferUnknownSurface'],
          completionScoreTerms: [],
          tieBreakers: ['stableMoveKey'],
        },
        plan: {
          stateFeatures: ['unknownSurface'],
          candidateFeatures: [],
          candidateAggregates: [],
        },
      },
    );

    const core = evaluatePolicyMoveCore(createInput(agents, createMoves('alpha', 'beta')));

    assert.equal(core.kind, 'failure');
    if (core.kind === 'failure') {
      assert.equal(core.failure.code, 'UNSUPPORTED_RUNTIME_REF');
      assert.match(core.failure.message, /unsupported by the non-preview evaluator runtime/);
    }
  });

  it('reads candidate params through compiled candidate-param defs and treats shape mismatches as unknown', () => {
    const agents = createCatalog(
      {
        candidateFeatures: {
          cardMatch: {
            type: 'boolean',
            costClass: 'candidate',
            expr: opExpr('eq', refExpr({ kind: 'candidateParam', id: 'eventCardId' }), literal('card-2')),
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
          },
          targetCount: {
            type: 'number',
            costClass: 'candidate',
            expr: opExpr('coalesce', refExpr({ kind: 'candidateParam', id: 'targetCount' }), literal(0)),
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
          },
        },
        scoreTerms: {
          preferMatchingCard: {
            costClass: 'candidate',
            weight: literal(5),
            value: opExpr('boolToNumber', refExpr({ kind: 'library', refKind: 'candidateFeature', id: 'cardMatch' })),
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: ['cardMatch'], aggregates: [] },
          },
          preferHigherTargetCount: {
            costClass: 'candidate',
            weight: literal(1),
            value: refExpr({ kind: 'library', refKind: 'candidateFeature', id: 'targetCount' }),
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: ['targetCount'], aggregates: [] },
          },
        },
      },
      {
        use: {
          pruningRules: [],
          scoreTerms: ['preferMatchingCard', 'preferHigherTargetCount'],
          completionScoreTerms: [],
          tieBreakers: ['stableMoveKey'],
        },
        plan: {
          stateFeatures: [],
          candidateFeatures: ['cardMatch', 'targetCount'],
          candidateAggregates: [],
        },
      },
      {
        eventCardId: { type: 'id' },
        targetCount: { type: 'number' },
      },
    );
    const input = createInput(agents, [
      { actionId: asActionId('alpha'), params: { eventCardId: 'card-2', targetCount: 2 } },
      { actionId: asActionId('beta'), params: { eventCardId: ['card-2'], targetCount: '2' } },
    ]);

    const result = evaluatePolicyMove(input);

    assert.equal(result.move.actionId, asActionId('alpha'));
    assert.equal(
      result.metadata.candidates.find((candidate) => candidate.actionId === 'alpha')?.score,
      7,
    );
    assert.equal(
      result.metadata.candidates.find((candidate) => candidate.actionId === 'beta')?.score,
      0,
    );
  });

  it('preserves static zoneTokenAgg behavior for string zones', () => {
    const agents = createCatalog(
      {
        candidateFeatures: {
          staticZoneLoad: {
            type: 'number',
            costClass: 'candidate',
            expr: {
              kind: 'zoneTokenAgg',
              zone: 'frontier',
              owner: 'self',
              prop: 'strength',
              aggOp: 'sum',
            },
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
          },
        },
        scoreTerms: {
          preferStaticZone: {
            costClass: 'candidate',
            weight: literal(1),
            value: refExpr({ kind: 'library', refKind: 'candidateFeature', id: 'staticZoneLoad' }),
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: ['staticZoneLoad'], aggregates: [] },
          },
        },
      },
      {
        use: {
          pruningRules: [],
          scoreTerms: ['preferStaticZone'],
          completionScoreTerms: [],
          tieBreakers: ['stableMoveKey'],
        },
        plan: {
          stateFeatures: [],
          candidateFeatures: ['staticZoneLoad'],
          candidateAggregates: [],
        },
      },
    );
    const baseInput = createInput(agents, createMoves('alpha'));
    const input = {
      ...baseInput,
      state: {
        ...baseInput.state,
        zones: {
          ...baseInput.state.zones,
          'frontier:0': [
            { id: asTokenId('t0'), type: 'unit', props: { strength: 2 } },
            { id: asTokenId('t1'), type: 'unit', props: { strength: 3 } },
          ],
        },
      },
    } as const;

    const result = evaluatePolicyMove(input);

    assert.equal(result.move.actionId, asActionId('alpha'));
    assert.equal(
      result.metadata.candidates.find((candidate) => candidate.actionId === 'alpha')?.score,
      5,
    );
  });

  it('reads static scalar zone props and synthetic category values', () => {
    const agents = createCatalog(
      {
        candidateFeatures: {
          frontierPopulation: {
            type: 'number',
            costClass: 'candidate',
            expr: {
              kind: 'zoneProp',
              zone: 'frontier:none',
              prop: 'population',
            },
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
          },
          targetCategoryMatches: {
            type: 'boolean',
            costClass: 'candidate',
            expr: opExpr(
              'eq',
              {
                kind: 'zoneProp',
                zone: 'target-a:none',
                prop: 'category',
              },
              literal('province'),
            ),
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
          },
        },
        scoreTerms: {
          preferHigherPopulation: {
            costClass: 'candidate',
            weight: literal(1),
            value: opExpr(
              'add',
              refExpr({ kind: 'library', refKind: 'candidateFeature', id: 'frontierPopulation' }),
              opExpr('boolToNumber', refExpr({ kind: 'library', refKind: 'candidateFeature', id: 'targetCategoryMatches' })),
            ),
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: ['frontierPopulation', 'targetCategoryMatches'], aggregates: [] },
          },
        },
      },
      {
        use: {
          pruningRules: [],
          scoreTerms: ['preferHigherPopulation'],
          completionScoreTerms: [],
          tieBreakers: ['stableMoveKey'],
        },
        plan: {
          stateFeatures: [],
          candidateFeatures: ['frontierPopulation', 'targetCategoryMatches'],
          candidateAggregates: [],
        },
      },
    );
    const input = createInput(agents, createMoves('alpha'));

    const result = evaluatePolicyMove(input);

    assert.equal(result.move.actionId, asActionId('alpha'));
    assert.equal(
      result.metadata.candidates.find((candidate) => candidate.actionId === 'alpha')?.score,
      1,
    );
  });

  it('evaluates dynamic zoneProp zones and fails closed for unresolved or non-scalar properties', () => {
    const agents = createCatalog(
      {
        candidateFeatures: {
          targetPopulation: {
            type: 'number',
            costClass: 'candidate',
            expr: {
              kind: 'zoneProp',
              zone: refExpr({ kind: 'candidateParam', id: 'eventCardId' }),
              prop: 'population',
            },
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
          },
          nonScalarZoneProp: {
            type: 'number',
            costClass: 'candidate',
            expr: {
              kind: 'zoneProp',
              zone: refExpr({ kind: 'candidateParam', id: 'eventCardId' }),
              prop: 'terrainTags',
            },
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
          },
        },
        scoreTerms: {
          preferKnownPopulation: {
            costClass: 'candidate',
            weight: literal(1),
            value: refExpr({ kind: 'library', refKind: 'candidateFeature', id: 'targetPopulation' }),
            unknownAs: -5,
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: ['targetPopulation'], aggregates: [] },
          },
          rejectNonScalarZoneProp: {
            costClass: 'candidate',
            weight: literal(1),
            value: refExpr({ kind: 'library', refKind: 'candidateFeature', id: 'nonScalarZoneProp' }),
            unknownAs: 0,
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: ['nonScalarZoneProp'], aggregates: [] },
          },
        },
      },
      {
        use: {
          pruningRules: [],
          scoreTerms: ['preferKnownPopulation', 'rejectNonScalarZoneProp'],
          completionScoreTerms: [],
          tieBreakers: ['stableMoveKey'],
        },
        plan: {
          stateFeatures: [],
          candidateFeatures: ['targetPopulation', 'nonScalarZoneProp'],
          candidateAggregates: [],
        },
      },
      {
        eventCardId: { type: 'id' },
      },
    );
    const baseInput = createInput(agents, [
      { actionId: asActionId('alpha'), params: { eventCardId: 'target-a:none' } },
      { actionId: asActionId('beta'), params: { eventCardId: 'missing-space' } },
    ]);
    const input = {
      ...baseInput,
      def: {
        ...baseInput.def,
        zones: baseInput.def.zones.map((zone) =>
          zone.id === asZoneId('target-a:none')
            ? { ...zone, attributes: { ...(zone.attributes ?? {}), population: 4, terrainTags: ['highland'] } }
            : zone),
      },
    } as const;

    const result = evaluatePolicyMove(input);

    assert.equal(result.move.actionId, asActionId('alpha'));
    assert.equal(
      result.metadata.candidates.find((candidate) => candidate.actionId === 'alpha')?.score,
      4,
    );
    assert.equal(
      result.metadata.candidates.find((candidate) => candidate.actionId === 'beta')?.score,
      -5,
    );
  });

  it('evaluates dynamic zoneTokenAgg zones through existing runtime refs', () => {
    const agents = createCatalog(
      {
        candidateFeatures: {
          zoneLoad: {
            type: 'number',
            costClass: 'candidate',
            expr: {
              kind: 'zoneTokenAgg',
              zone: refExpr({ kind: 'candidateParam', id: 'eventCardId' }),
              owner: 'self',
              prop: 'strength',
              aggOp: 'sum',
            },
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
          },
        },
        scoreTerms: {
          preferLoadedZone: {
            costClass: 'candidate',
            weight: literal(1),
            value: refExpr({ kind: 'library', refKind: 'candidateFeature', id: 'zoneLoad' }),
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: ['zoneLoad'], aggregates: [] },
          },
        },
      },
      {
        use: {
          pruningRules: [],
          scoreTerms: ['preferLoadedZone'],
          completionScoreTerms: [],
          tieBreakers: ['stableMoveKey'],
        },
        plan: {
          stateFeatures: [],
          candidateFeatures: ['zoneLoad'],
          candidateAggregates: [],
        },
      },
      {
        eventCardId: { type: 'id' },
      },
    );
    const baseInput = createInput(agents, [
      { actionId: asActionId('alpha'), params: { eventCardId: 'frontier' } },
      { actionId: asActionId('beta'), params: { eventCardId: 'rear' } },
    ]);
    const input = {
      ...baseInput,
      state: {
        ...baseInput.state,
        zones: {
          ...baseInput.state.zones,
          'frontier:0': [
            { id: asTokenId('t0'), type: 'unit', props: { strength: 2 } },
            { id: asTokenId('t1'), type: 'unit', props: { strength: 3 } },
          ],
          'rear:0': [
            { id: asTokenId('t2'), type: 'unit', props: { strength: 1 } },
          ],
        },
      },
    } as const;

    const result = evaluatePolicyMove(input);

    assert.equal(result.move.actionId, asActionId('alpha'));
    assert.equal(
      result.metadata.candidates.find((candidate) => candidate.actionId === 'alpha')?.score,
      5,
    );
    assert.equal(
      result.metadata.candidates.find((candidate) => candidate.actionId === 'beta')?.score,
      1,
    );
  });

  it('resolves exact runtime zone ids for dynamic zoneTokenAgg values', () => {
    const agents = createCatalog(
      {
        candidateFeatures: {
          zoneLoad: {
            type: 'number',
            costClass: 'candidate',
            expr: {
              kind: 'zoneTokenAgg',
              zone: refExpr({ kind: 'candidateParam', id: 'eventCardId' }),
              owner: 'self',
              prop: 'strength',
              aggOp: 'sum',
            },
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
          },
        },
        scoreTerms: {
          preferLoadedZone: {
            costClass: 'candidate',
            weight: literal(1),
            value: refExpr({ kind: 'library', refKind: 'candidateFeature', id: 'zoneLoad' }),
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: ['zoneLoad'], aggregates: [] },
          },
        },
      },
      {
        use: {
          pruningRules: [],
          scoreTerms: ['preferLoadedZone'],
          completionScoreTerms: [],
          tieBreakers: ['stableMoveKey'],
        },
        plan: {
          stateFeatures: [],
          candidateFeatures: ['zoneLoad'],
          candidateAggregates: [],
        },
      },
      {
        eventCardId: { type: 'id' },
      },
    );
    const baseInput = createInput(agents, [
      { actionId: asActionId('alpha'), params: { eventCardId: 'target-a:none' } },
      { actionId: asActionId('beta'), params: { eventCardId: 'target-b:none' } },
    ]);
    const input = {
      ...baseInput,
      state: {
        ...baseInput.state,
        zones: {
          ...baseInput.state.zones,
          'target-a:none': [
            { id: asTokenId('t0'), type: 'unit', props: { strength: 4 } },
            { id: asTokenId('t1'), type: 'unit', props: { strength: 1 } },
          ],
          'target-b:none': [
            { id: asTokenId('t2'), type: 'unit', props: { strength: 2 } },
          ],
        },
      },
    } as const;

    const result = evaluatePolicyMove(input);

    assert.equal(result.move.actionId, asActionId('alpha'));
    assert.equal(
      result.metadata.candidates.find((candidate) => candidate.actionId === 'alpha')?.score,
      5,
    );
    assert.equal(
      result.metadata.candidates.find((candidate) => candidate.actionId === 'beta')?.score,
      2,
    );
  });

  it('resolves zoneTokenAgg active-owner zones through the shared runtime zone-address helper', () => {
    const agents = createCatalog(
      {
        candidateFeatures: {
          activeZoneLoad: {
            type: 'number',
            costClass: 'candidate',
            expr: {
              kind: 'zoneTokenAgg',
              zone: 'frontier',
              owner: 'active',
              prop: 'strength',
              aggOp: 'sum',
            },
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
          },
        },
        scoreTerms: {
          preferActiveZone: {
            costClass: 'candidate',
            weight: literal(1),
            value: refExpr({ kind: 'library', refKind: 'candidateFeature', id: 'activeZoneLoad' }),
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: ['activeZoneLoad'], aggregates: [] },
          },
        },
      },
      {
        use: {
          pruningRules: [],
          scoreTerms: ['preferActiveZone'],
          completionScoreTerms: [],
          tieBreakers: ['stableMoveKey'],
        },
        plan: {
          stateFeatures: [],
          candidateFeatures: ['activeZoneLoad'],
          candidateAggregates: [],
        },
      },
    );
    const baseInput = createInput(agents, createMoves('alpha'));
    const activeZoneId = toOwnedZoneId('frontier', baseInput.state.activePlayer);
    const input = {
      ...baseInput,
      state: {
        ...baseInput.state,
        zones: {
          ...baseInput.state.zones,
          [activeZoneId]: [
            { id: asTokenId('t0'), type: 'unit', props: { strength: 4 } },
            { id: asTokenId('t1'), type: 'unit', props: { strength: 1 } },
          ],
        },
      },
    } as const;

    const result = evaluatePolicyMove(input);

    assert.equal(result.move.actionId, asActionId('alpha'));
    assert.equal(
      result.metadata.candidates.find((candidate) => candidate.actionId === 'alpha')?.score,
      5,
    );
  });

  it('returns unknown for dynamic zoneTokenAgg zones that do not evaluate to strings', () => {
    const agents = createCatalog(
      {
        candidateFeatures: {
          badZoneLoad: {
            type: 'number',
            costClass: 'candidate',
            expr: {
              kind: 'zoneTokenAgg',
              zone: paramExpr('passFloor'),
              owner: 'self',
              prop: 'strength',
              aggOp: 'sum',
            },
            dependencies: { parameters: ['passFloor'], stateFeatures: [], candidateFeatures: [], aggregates: [] },
          },
        },
        scoreTerms: {
          preferKnownZone: {
            costClass: 'candidate',
            weight: literal(1),
            value: refExpr({ kind: 'library', refKind: 'candidateFeature', id: 'badZoneLoad' }),
            unknownAs: 0,
            dependencies: { parameters: ['passFloor'], stateFeatures: [], candidateFeatures: ['badZoneLoad'], aggregates: [] },
          },
        },
      },
      {
        use: {
          pruningRules: [],
          scoreTerms: ['preferKnownZone'],
          completionScoreTerms: [],
          tieBreakers: ['stableMoveKey'],
        },
        plan: {
          stateFeatures: [],
          candidateFeatures: ['badZoneLoad'],
          candidateAggregates: [],
        },
      },
    );
    const input = createInput(agents, createMoves('beta', 'alpha'));

    const result = evaluatePolicyMove(input);

    assert.equal(result.move.actionId, asActionId('alpha'));
    assert.equal(
      result.metadata.candidates.find((candidate) => candidate.actionId === 'alpha')?.score,
      0,
    );
    assert.equal(
      result.metadata.candidates.find((candidate) => candidate.actionId === 'beta')?.score,
      0,
    );
  });

  it('fails closed for unresolved dynamic zoneTokenAgg strings', () => {
    const agents = createCatalog(
      {
        candidateFeatures: {
          badZoneLoad: {
            type: 'number',
            costClass: 'candidate',
            expr: {
              kind: 'zoneTokenAgg',
              zone: refExpr({ kind: 'candidateParam', id: 'eventCardId' }),
              owner: 'self',
              prop: 'strength',
              aggOp: 'sum',
            },
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
          },
        },
        scoreTerms: {
          preferKnownZone: {
            costClass: 'candidate',
            weight: literal(1),
            value: refExpr({ kind: 'library', refKind: 'candidateFeature', id: 'badZoneLoad' }),
            unknownAs: -3,
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: ['badZoneLoad'], aggregates: [] },
          },
        },
      },
      {
        use: {
          pruningRules: [],
          scoreTerms: ['preferKnownZone'],
          completionScoreTerms: [],
          tieBreakers: ['stableMoveKey'],
        },
        plan: {
          stateFeatures: [],
          candidateFeatures: ['badZoneLoad'],
          candidateAggregates: [],
        },
      },
      {
        eventCardId: { type: 'id' },
      },
    );
    const input = createInput(agents, [
      { actionId: asActionId('alpha'), params: { eventCardId: 'missing-space' } },
      { actionId: asActionId('beta'), params: { eventCardId: 'target-b:none' } },
    ]);

    const result = evaluatePolicyMove(input);

    assert.equal(result.move.actionId, asActionId('beta'));
    assert.equal(
      result.metadata.candidates.find((candidate) => candidate.actionId === 'alpha')?.score,
      -3,
    );
  });

  it('resolves numeric runtime player ids for zoneTokenAgg owners', () => {
    const agents = createCatalog(
      {
        candidateFeatures: {
          explicitOwnerZoneLoad: {
            type: 'number',
            costClass: 'candidate',
            expr: {
              kind: 'zoneTokenAgg',
              zone: 'frontier',
              owner: '0',
              prop: 'strength',
              aggOp: 'sum',
            },
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
          },
        },
        scoreTerms: {
          preferExplicitOwnerZone: {
            costClass: 'candidate',
            weight: literal(1),
            value: refExpr({ kind: 'library', refKind: 'candidateFeature', id: 'explicitOwnerZoneLoad' }),
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: ['explicitOwnerZoneLoad'], aggregates: [] },
          },
        },
      },
      {
        use: {
          pruningRules: [],
          scoreTerms: ['preferExplicitOwnerZone'],
          completionScoreTerms: [],
          tieBreakers: ['stableMoveKey'],
        },
        plan: {
          stateFeatures: [],
          candidateFeatures: ['explicitOwnerZoneLoad'],
          candidateAggregates: [],
        },
      },
    );
    const baseInput = createInput(agents, createMoves('alpha'));
    const input = {
      ...baseInput,
      state: {
        ...baseInput.state,
        zones: {
          ...baseInput.state.zones,
          [toOwnedZoneId('frontier', asPlayerId(0))]: [
            { id: asTokenId('t0'), type: 'unit', props: { strength: 2 } },
            { id: asTokenId('t1'), type: 'unit', props: { strength: 3 } },
          ],
        },
      },
    } as const;

    const result = evaluatePolicyMove(input);

    assert.equal(result.move.actionId, asActionId('alpha'));
    assert.equal(
      result.metadata.candidates.find((candidate) => candidate.actionId === 'alpha')?.score,
      5,
    );
  });

  it('reads exact id-list candidate params through compiled candidate-param defs', () => {
    const agents = createCatalog(
      {
        candidateFeatures: {
          targetsZoneA: {
            type: 'boolean',
            costClass: 'candidate',
            expr: opExpr('in', literal('zone-a'), refExpr({ kind: 'candidateParam', id: '$targets' })),
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
          },
        },
        scoreTerms: {
          preferZoneA: {
            costClass: 'candidate',
            weight: literal(1),
            value: opExpr('boolToNumber', refExpr({ kind: 'library', refKind: 'candidateFeature', id: 'targetsZoneA' })),
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: ['targetsZoneA'], aggregates: [] },
          },
        },
      },
      {
        use: {
          pruningRules: [],
          scoreTerms: ['preferZoneA'],
          completionScoreTerms: [],
          tieBreakers: ['stableMoveKey'],
        },
        plan: {
          stateFeatures: [],
          candidateFeatures: ['targetsZoneA'],
          candidateAggregates: [],
        },
      },
      {
        '$targets': {
          type: 'idList',
          cardinality: {
            kind: 'exact',
            n: 2,
          },
        },
      },
    );
    const input = createInput(agents, [
      { actionId: asActionId('alpha'), params: { '$targets': ['zone-a', 'zone-b'] } },
      { actionId: asActionId('beta'), params: { '$targets': 'zone-a' } },
    ]);

    const result = evaluatePolicyMove(input);

    assert.equal(result.move.actionId, asActionId('alpha'));
    assert.equal(
      result.metadata.candidates.find((candidate) => candidate.actionId === 'alpha')?.score,
      1,
    );
    assert.equal(
      result.metadata.candidates.find((candidate) => candidate.actionId === 'beta')?.score,
      0,
    );
  });
});
