// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyEvaluationContext, type PolicyEvaluationCandidate } from '../../../src/agents/policy-evaluation-core.js';
import { executeBytecode, UNSUPPORTED_FEATURE } from '../../../src/agents/policy-vm/index.js';
import {
  compilePolicyBytecode,
  collectFeatureRefsFromCompiledPolicyExpr,
  FEATURE_REF_KINDS,
  type FeatureRef,
  type FeatureRefKind,
} from '../../../src/cnl/policy-bytecode/index.js';
import {
  asActionId,
  asBoundaryId,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  buildEncodedState,
  buildEncodedStateLayout,
  initialState,
  type AgentPolicyCatalog,
  type AgentPolicyLiteral,
  type CompiledPolicyExpr,
  type EncodedStateLayout,
  type GameDef,
  type GameState,
  type Move,
} from '../../../src/kernel/index.js';
import { withCompiledPolicyCatalog } from '../../helpers/policy-catalog-fixtures.js';

const KINDS_PRODUCED_BY_EMITTER = [...FEATURE_REF_KINDS] as const;
KINDS_PRODUCED_BY_EMITTER satisfies readonly FeatureRefKind[];

interface FeatureKindFixture {
  readonly expr: CompiledPolicyExpr;
  readonly contextExpr?: CompiledPolicyExpr;
  readonly allowUnsupported?: boolean;
  readonly forceDynamicSurface?: boolean;
}

const move: Move = {
  actionId: asActionId('choose'),
  params: { amount: 4, label: 'north' },
};
const phaseId = asPhaseId('main');
const emptyDeps = {
  parameters: [] as readonly string[],
  stateFeatures: [] as readonly string[],
  candidateFeatures: [] as readonly string[],
  aggregates: [] as readonly string[],
  strategicConditions: [] as readonly string[],
};
const literal = (value: AgentPolicyLiteral) => ({ kind: 'literal', value }) as const;

const fixtures: { readonly [K in FeatureRefKind]: FeatureKindFixture } = {
  globalVar: { expr: { kind: 'ref', ref: { kind: 'currentSurface', family: 'globalVar', id: 'round' } } },
  playerInt: {
    expr: {
      kind: 'ref',
      ref: { kind: 'currentSurface', family: 'perPlayerVar', id: 'cash', selector: { kind: 'player', player: 'self' } },
    },
  },
  globalMarker: { expr: { kind: 'ref', ref: { kind: 'currentSurface', family: 'globalMarker', id: 'status' } } },
  zoneProp: {
    expr: { kind: 'zoneProp', zone: 'a:none', prop: 'control' },
    contextExpr: { kind: 'zoneProp', zone: 'a:none', prop: 'category' },
  },
  zoneTokenAgg: { expr: { kind: 'zoneTokenAgg', zone: 'a:none', owner: 'none', prop: 'power', aggOp: 'sum' } },
  globalTokenAgg: { expr: { kind: 'globalTokenAgg', zoneScope: 'all', prop: 'power', aggOp: 'sum' } },
  globalZoneAgg: { expr: { kind: 'globalZoneAgg', source: 'variable', field: 'control', aggOp: 'sum', zoneScope: 'all' } },
  candidateIntrinsic: { expr: { kind: 'ref', ref: { kind: 'candidateIntrinsic', intrinsic: 'paramCount' } } },
  candidateParam: { expr: { kind: 'ref', ref: { kind: 'candidateParam', id: 'amount', onMissing: 'unavailable' } } },
  candidateTag: { expr: { kind: 'ref', ref: { kind: 'candidateTag', tagName: 'urgent' } } },
  candidateTags: { expr: { kind: 'ref', ref: { kind: 'candidateTags' } } },
  phaseIntrinsic: { expr: { kind: 'ref', ref: { kind: 'phaseIntrinsic', name: 'current.id' } } },
  scheduleDistance: { expr: { kind: 'ref', ref: { kind: 'scheduleDistance', target: { kind: 'boundary', boundaryId: asBoundaryId('coupEntry') }, unit: 'cards' } } },
  microturnIntrinsic: {
    expr: { kind: 'ref', ref: { kind: 'microturnIntrinsic', intrinsic: 'kind' } },
    allowUnsupported: true,
  },
  microturnOptionIntrinsic: {
    expr: { kind: 'ref', ref: { kind: 'microturnOptionIntrinsic', intrinsic: 'value' } },
    allowUnsupported: true,
  },
  previewOptionRef: {
    expr: { kind: 'ref', ref: { kind: 'previewOptionRef', refKind: 'driveDepth' } },
  },
  candidateFeature: { expr: { kind: 'ref', ref: { kind: 'library', refKind: 'candidateFeature', id: 'mobility' } } },
  stateFeature: { expr: { kind: 'ref', ref: { kind: 'library', refKind: 'stateFeature', id: 'tempo' } } },
  candidateAggregate: { expr: { kind: 'ref', ref: { kind: 'library', refKind: 'aggregate', id: 'pressure' } } },
  adjacentTokenAgg: {
    expr: { kind: 'adjacentTokenAgg', anchorZone: 'a:none', tokenFilter: { type: 'unit' }, prop: 'power', aggOp: 'max' },
    allowUnsupported: true,
  },
  seatAgg: {
    expr: { kind: 'seatAgg', over: 'all', expr: { kind: 'literal', value: 1 }, aggOp: 'sum' },
    allowUnsupported: true,
  },
  dynamicRef: { expr: { kind: 'ref', ref: { kind: 'contextKind' } } },
  dynamicSurface: {
    expr: { kind: 'ref', ref: { kind: 'currentSurface', family: 'globalVar', id: 'round' } },
    forceDynamicSurface: true,
  },
  dynamicExpr: { expr: { kind: 'zoneTokenAgg', zone: { kind: 'literal', value: 'a:none' }, owner: 'none', prop: 'power', aggOp: 'sum' } },
};

function createCatalog(): AgentPolicyCatalog {
  return withCompiledPolicyCatalog({
    schemaVersion: 3,
    catalogFingerprint: 'policy-bytecode-fallback-completeness-test',
    surfaceVisibility: {
      globalVars: { round: { current: 'public', preview: { visibility: 'public', allowWhenHiddenSampling: true } } },
      globalMarkers: { status: { current: 'public', preview: { visibility: 'public', allowWhenHiddenSampling: true } } },
      perPlayerVars: { cash: { current: 'public', preview: { visibility: 'public', allowWhenHiddenSampling: true } } },
      derivedMetrics: {},
      victory: {
        currentMargin: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
        currentRank: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
      },
      activeCardIdentity: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
      activeCardTag: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
      activeCardMetadata: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
      activeCardAnnotation: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
    },
    parameterDefs: {},
    candidateParamDefs: {
      amount: { type: 'number' },
    },
    library: {
      stateFeatures: {
        tempo: { type: 'number', costClass: 'state', expr: literal(17), dependencies: emptyDeps },
      },
      candidateFeatures: {
        mobility: { type: 'number', costClass: 'candidate', expr: literal(13), dependencies: emptyDeps },
      },
      candidateAggregates: {
        pressure: { type: 'number', costClass: 'candidate', op: 'count', of: literal(1), dependencies: emptyDeps },
      },
      guardrails: {},
      considerations: {},
      tieBreakers: {},
      strategicConditions: {},
    },
    profiles: {
      baseline: {
        fingerprint: 'baseline',
        params: {},
        preview: { mode: 'disabled' },
        selection: { mode: 'argmax' },
        use: { guardrails: [], considerations: [], tieBreakers: [] },
        plan: { stateFeatures: [], candidateFeatures: [], candidateAggregates: [], considerations: [] },
      },
    },
    bindingsBySeat: { alpha: 'baseline' },
  });
}

function createDef(): GameDef {
  return {
    metadata: { id: 'policy-bytecode-fallback-completeness-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [{ name: 'round', type: 'int', init: 3, min: 0, max: 100 }],
    perPlayerVars: [{ name: 'cash', type: 'int', init: 5, min: 0, max: 100 }],
    zoneVars: [{ name: 'control', type: 'int', init: 2, min: 0, max: 100 }],
    zones: [
      {
        id: asZoneId('a:none'),
        owner: 'none',
        visibility: 'public',
        ordering: 'set',
        zoneKind: 'board',
        category: 'front',
        adjacentTo: [{ to: asZoneId('b:none'), direction: 'bidirectional' }],
      },
      {
        id: asZoneId('b:none'),
        owner: 'none',
        visibility: 'public',
        ordering: 'set',
        zoneKind: 'board',
        category: 'rear',
        adjacentTo: [{ to: asZoneId('a:none'), direction: 'bidirectional' }],
      },
      {
        id: asZoneId('draw:none'),
        owner: 'none',
        visibility: 'public',
        ordering: 'stack',
        behavior: { type: 'deck', drawFrom: 'top' },
      },
      { id: asZoneId('discard:none'), owner: 'none', visibility: 'public', ordering: 'stack' },
    ],
    derivedMetrics: [],
    seats: [{ id: 'alpha' }, { id: 'beta' }],
    tokenTypes: [{ id: 'unit', props: { power: 'int' } }],
    setup: [],
    turnStructure: { phases: [{ id: phaseId }, { id: asPhaseId('scoring') }] },
    phaseBoundaries: [{
      id: asBoundaryId('coupEntry'),
      kind: 'phaseEntry',
      phaseId: asPhaseId('scoring'),
      schedule: {
        kind: 'cardDraw',
        deckId: 'eventDeck',
        cardSelector: { tags: ['coup'] },
      },
    }],
    eventDecks: [{
      id: 'eventDeck',
      drawZone: 'draw:none',
      discardZone: 'discard:none',
      cards: [
        { id: 'op-1', title: 'Operation 1', sideMode: 'single', tags: ['operation'] },
        { id: 'coup-1', title: 'Coup 1', sideMode: 'single', tags: ['coup'] },
      ],
    }],
    agents: createCatalog(),
    actions: [
      {
        id: asActionId('choose'),
        actor: 'active',
        executor: 'actor',
        phase: [phaseId],
        params: [{ name: 'amount', domain: { query: 'intsInRange', min: 0, max: 10 } }],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
    ],
    actionTagIndex: { byAction: { choose: ['urgent'] }, byTag: { urgent: ['choose'] } },
    triggers: [],
    terminal: { conditions: [] },
    globalMarkerLattices: [{ id: 'status', states: ['off', 'on'], defaultState: 'off' }],
  } as GameDef;
}

function createState(def: GameDef): GameState {
  const { state } = initialState(def, 154002, 2);
  return {
    ...state,
    zones: {
      ...state.zones,
      'a:none': [{ id: asTokenId('token-a'), type: 'unit', props: { power: 7 } }],
      'b:none': [{ id: asTokenId('token-b'), type: 'unit', props: { power: 11 } }],
    },
    zoneVars: {
      ...state.zoneVars,
      'a:none': { control: 2 },
      'b:none': { control: 3 },
    },
    globalMarkers: { status: 'on' },
  };
}

function createCandidate(): PolicyEvaluationCandidate {
  return {
    move,
    stableMoveKey: 'choose:amount=4,label=north',
    actionId: 'choose',
    previewRefIds: new Set(),
    unknownPreviewRefs: new Map(),
    unknownLookupRefs: new Map(),
    unknownCandidateParamRefs: new Map(),
  };
}

function withoutGlobalRound(layout: EncodedStateLayout): EncodedStateLayout {
  return {
    ...layout,
    variableIds: layout.variableIds.filter((entry) => !(entry.scope === 'global' && entry.name === 'round')),
    varLayout: {
      ...layout.varLayout,
      variableCount: layout.varLayout.variableCount - 1,
      globalVariableIds: [],
      variableIndexById: Object.fromEntries(
        Object.entries(layout.varLayout.variableIndexById).filter(([key]) => key !== 'global:round'),
      ),
    },
  };
}

function fallbackValue(ref: FeatureRef): number | string | boolean | readonly string[] | typeof UNSUPPORTED_FEATURE {
  switch (ref.kind) {
    case 'candidateTags':
      return ['urgent'];
    case 'phaseIntrinsic':
      return 'main';
    case 'scheduleDistance':
      return 2;
    case 'candidateFeature':
      return 13;
    case 'stateFeature':
      return 17;
    case 'candidateAggregate':
      return 19;
    case 'previewOptionRef':
      return 21;
    case 'dynamicRef':
      return 23;
    case 'dynamicSurface':
      return 29;
    case 'dynamicExpr':
      return 31;
    case 'adjacentTokenAgg':
    case 'seatAgg':
      return UNSUPPORTED_FEATURE;
    default:
      return UNSUPPORTED_FEATURE;
  }
}

function assertTypedValue(value: unknown, kind: FeatureRefKind): void {
  assert.notEqual(value, undefined, `${kind} must not silently resolve to undefined`);
  assert.ok(
    typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean' || Array.isArray(value),
    `${kind} must resolve to a PolicyValue-compatible scalar or array`,
  );
}

describe('policy bytecode fallback completeness', () => {
  it('keeps every emitter-produced FeatureRef kind registered and non-silent', () => {
    const def = createDef();
    const state = createState(def);
    const baseLayout = buildEncodedStateLayout(def);
    const catalog = createCatalog();

    for (const kind of KINDS_PRODUCED_BY_EMITTER) {
      const fixture = fixtures[kind];
      const layout = fixture.forceDynamicSurface === true ? withoutGlobalRound(baseLayout) : baseLayout;
      const encoded = buildEncodedState(state, layout);
      const refs = collectFeatureRefsFromCompiledPolicyExpr(fixture.expr, layout);
      assert.ok(
        refs.some((ref) => ref.kind === kind),
        `${kind} fixture must emit the expected FeatureRef.kind`,
      );

      const bytecode = compilePolicyBytecode(fixture.expr, def, layout);
      const result = executeBytecode(bytecode, encoded, {
        def,
        layout,
        state,
        playerId: Number(asPlayerId(0)),
        seatId: 'alpha',
        candidateIndex: 0,
        legalMoves: [move],
        resolveFeature: (ref) => fallbackValue(ref),
        resolveDynamic: () => 37,
      });
      if (result.status === 'unsupported') {
        if (fixture.allowUnsupported === true) {
          continue;
        }
        assert.fail(`${kind} unexpectedly returned unsupported verdict: ${result.reason}`);
      }
      assertTypedValue(result.value, kind);

      const candidate = createCandidate();
      const context = new PolicyEvaluationContext(
        {
          def,
          state,
          playerId: asPlayerId(0),
          seatId: 'alpha',
          catalog,
          parameterValues: {},
          trustedMoveIndex: new Map(),
          cacheBinding: { kind: 'preEncoded', layout, encoded },
          previewOption: {
            resolvedRefs: new Map([['preview.option.driveDepth', { kind: 'ready', value: 21 }]]),
          },
        },
        [candidate],
      );
      try {
        assertTypedValue(context.evaluateCompiledExpr(fixture.contextExpr ?? fixture.expr, candidate), kind);
      } finally {
        context.dispose();
      }
    }
  });
});
