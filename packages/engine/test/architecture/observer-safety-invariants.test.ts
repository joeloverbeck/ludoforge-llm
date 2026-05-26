// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { evaluatePostureEvaluator } from '../../src/agents/policy-posture-eval.js';
import { evaluateSelector, type SelectorEvalContext } from '../../src/agents/policy-selector-eval.js';
import { buildPlanProposalTrace } from '../../src/agents/plan-trace.js';
import type {
  AgentPolicyExpr,
  CompiledObserverProfile,
  CompiledPolicySelector,
  GameDef,
  GameState,
  Move,
  PolicyPlanTrace,
  PolicyPlanTraceRoleBinding,
} from '../../src/kernel/index.js';
import { asActionId, asPhaseId, asPlayerId, asTokenId, asZoneId, initialState } from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileTexasProductionSpec } from '../helpers/production-spec-helpers.js';
import {
  createPreviewIntegrityFixture,
  runPreviewIntegrityPolicyTraceForFixture,
} from './preview-integrity/preview-integrity-fixture.js';

const observer = asPlayerId(1);
const hiddenTokenId = 'hidden-token';
const visibleTokenId = 'visible-token';
const hiddenZoneId = 'hidden-zone';
const visibleZoneId = 'visible-zone';

const literal = (value: boolean | number | string): AgentPolicyExpr => ({ kind: 'literal', value });

const observerProfile: CompiledObserverProfile = {
  fingerprint: 'observer-safety-hidden-zone',
  surfaces: {
    globalVars: {},
    globalMarkers: {},
    perPlayerVars: {},
    derivedMetrics: {},
    victory: {
      currentMargin: { current: 'public', preview: { visibility: 'public', allowWhenHiddenSampling: true } },
      currentRank: { current: 'public', preview: { visibility: 'public', allowWhenHiddenSampling: true } },
    },
    activeCardIdentity: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
    activeCardTag: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
    activeCardMetadata: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
    activeCardAnnotation: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
  },
  zones: {
    entries: {
      [hiddenZoneId]: { tokens: 'hidden', order: 'hidden' },
      [visibleZoneId]: { tokens: 'public', order: 'public' },
    },
  },
};

const def = {
  metadata: { id: 'observer-safety-synthetic', players: { min: 2, max: 2 } },
  seats: [{ id: 'alpha' }, { id: 'beta' }],
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [
    {
      id: asZoneId(visibleZoneId),
      owner: 'none',
      visibility: 'public',
      ordering: 'set',
    },
    {
      id: asZoneId(hiddenZoneId),
      owner: 'none',
      visibility: 'hidden',
      ordering: 'set',
    },
  ],
  tokenTypes: [
    { id: 'piece', props: {} },
    { id: 'card', props: {} },
  ],
  setup: [],
  turnStructure: { phases: [{ id: asPhaseId('main') }] },
  actions: [],
  actionPipelines: [],
  triggers: [],
  terminal: { conditions: [] },
} as unknown as GameDef;

const state = {
  globalVars: {},
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 2,
  zones: {
    [visibleZoneId]: [{ id: asTokenId(visibleTokenId), type: 'piece', props: {} }],
    [hiddenZoneId]: [{ id: asTokenId(hiddenTokenId), type: 'piece', props: {} }],
  },
  nextTokenOrdinal: 3,
  currentPhase: asPhaseId('main'),
  activePlayer: observer,
  turnCount: 0,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [1n, 2n] },
  stateHash: 0n,
  _runningHash: 0n,
  actionUsage: {},
  turnOrderState: {},
  markers: {},
  reveals: undefined,
  globalMarkers: undefined,
  activeLastingEffects: undefined,
  interruptPhaseStack: undefined,
} as unknown as GameState;

const candidateMove = {
  actionId: asActionId('inspect'),
  params: {
    target: hiddenTokenId,
    visibleTarget: visibleTokenId,
  },
} as Move;

const baseSelector = (
  id: string,
  source: CompiledPolicySelector['source'],
): CompiledPolicySelector => ({
  id: id as CompiledPolicySelector['id'],
  scopes: ['move', 'microturn'],
  source,
  result: { maxItems: 16, order: ['stableKeyAsc'], onEmpty: 'traceAndNoContribution' },
  costClass: 'state',
  dependencies: {
    parameters: [],
    stateFeatures: [],
    candidateFeatures: [],
    aggregates: [],
    strategicConditions: [],
  },
});

const hiddenAwareContext = (
  selectors: Readonly<Record<string, CompiledPolicySelector>> = {},
): SelectorEvalContext => ({
  def,
  state,
  candidates: [{ stableMoveKey: 'inspect:hidden', move: candidateMove, actionId: 'inspect' }],
  candidate: { stableMoveKey: 'inspect:hidden', move: candidateMove, actionId: 'inspect' },
  microturnOptions: [
    { key: hiddenTokenId, value: hiddenTokenId, index: 0 },
    { key: visibleTokenId, value: visibleTokenId, index: 1 },
  ],
  observerPlayerId: observer,
  observerProfile,
  selectors,
  evaluateExpr: () => true,
});

const assertHiddenTokenAbsent = (surface: string, keys: readonly string[]): void => {
  assert.equal(
    keys.some((key) => key.split('|').includes(hiddenTokenId)),
    false,
    `${surface} must not expose hidden token ids`,
  );
};

const assertInvariantFailsClosed = (surface: string, keys: readonly string[]): void => {
  assert.throws(
    () => assertHiddenTokenAbsent(surface, keys),
    /must not expose hidden token ids/,
    `${surface} negative witness should fail the invariant assertion`,
  );
};

describe('observer-safety selector source invariants', () => {
  it('filters hidden tokens across collection, product, routePairs, subset, candidateParams, and microturnOptions', () => {
    const tokenSelector = baseSelector('tokens', { kind: 'collection', collection: { kind: 'tokens' } });
    const visibleSelector = baseSelector('visibleTokens', { kind: 'collection', collection: { kind: 'tokens' } });
    const selectors = { visibleTokens: visibleSelector };
    const cases: readonly [string, CompiledPolicySelector][] = [
      ['collection', tokenSelector],
      ['product', baseSelector('product', {
        kind: 'product',
        left: { kind: 'tokens' },
        right: { kind: 'players' },
        maxPairs: 8,
      })],
      ['routePairs', baseSelector('routePairs', {
        kind: 'routePairs',
        originSelectorId: 'visibleTokens' as CompiledPolicySelector['id'],
        destinationSelectorId: 'visibleTokens' as CompiledPolicySelector['id'],
        maxPairs: 8,
      })],
      ['subset', baseSelector('subset', {
        kind: 'subset',
        of: { kind: 'collection', collection: { kind: 'tokens' } },
        min: 1,
        max: 2,
        beamWidth: 8,
      })],
      ['candidateParams', baseSelector('candidateParams', {
        kind: 'candidateParams',
        param: 'target' as Extract<CompiledPolicySelector['source'], { readonly kind: 'candidateParams' }>['param'],
      })],
      ['microturnOptions', baseSelector('microturnOptions', { kind: 'microturnOptions' })],
    ];

    for (const [surface, selector] of cases) {
      const view = evaluateSelector(selector, hiddenAwareContext(selectors));
      assertHiddenTokenAbsent(surface, view.selected.map((item) => item.key));
    }
  });

  it('keeps the selector invariant discriminating against unsafe authoritative enumeration', () => {
    assertInvariantFailsClosed('synthetic unsafe selector', [visibleTokenId, hiddenTokenId]);
  });

  it('exercises Texas Holdem hidden deck cards through the production observer profile', () => {
    const { parsed, compiled } = compileTexasProductionSpec();
    assertNoErrors(parsed);
    assertNoErrors(compiled);
    const texasDef = compiled.gameDef;
    const currentPlayer = texasDef.observers?.observers.currentPlayer;
    assert.ok(currentPlayer, 'Texas Holdem must compile the currentPlayer observer profile');
    const texasState = initialState(texasDef, 198003, texasDef.metadata.players.max).state;
    const deckTokenIds = (texasState.zones['deck:none'] ?? []).map((token) => String(token.id));
    assert.ok(deckTokenIds.length > 0, 'Texas Holdem fixture must have hidden deck cards');

    const deckCards = evaluateSelector(
      baseSelector('texasDeckCards', {
        kind: 'collection',
        collection: { kind: 'cards', deck: 'deck' },
      }),
      {
        def: texasDef,
        state: texasState,
        candidates: [],
        observerPlayerId: asPlayerId(1),
        observerProfile: currentPlayer,
        evaluateExpr: () => true,
      },
    );

    assert.deepEqual(deckCards.selected, []);
  });
});

describe('observer-safety preview provenance invariants', () => {
  it('records typed unavailable preview status and explicit fallback rather than silently coercing to zero', () => {
    const fixture = createPreviewIntegrityFixture(false, 'noContribution');
    const trace = runPreviewIntegrityPolicyTraceForFixture(fixture);

    assert.equal(trace.previewUsage.coverage.allRootsUnavailable, true);
    for (const candidate of trace.candidates ?? []) {
      assert.ok(
        candidate.unknownPreviewRefs.every((entry) => typeof entry.reason === 'string' && entry.reason.length > 0),
        'each unavailable preview ref must carry a typed status reason',
      );
      assert.deepEqual(candidate.previewFallbackFired, {
        termId: 'preferProjectedMargin',
        kind: 'noContribution',
      });
      assert.equal(
        candidate.scoreContributions.some((entry) => entry.termId === 'preferProjectedMargin'),
        false,
        'unavailable preview refs must not be silently coerced into scalar contributions',
      );
    }
  });

  it('keeps preview provenance checks discriminating against missing fallback evidence', () => {
    assert.throws(() => {
      const fallback = undefined as { readonly kind: string } | undefined;
      assert.ok(fallback, 'unavailable preview ref must carry fallback evidence');
    }, /fallback evidence/);
  });
});

describe('observer-safety posture and trace invariants', () => {
  it('records posture fallback status when hidden preview evidence is unavailable', () => {
    const unknownPreviewRefs = new Map<string, string>();
    const result = evaluatePostureEvaluator(
      {
        evaluateCompiledExpr(expr: AgentPolicyExpr) {
          if (expr.kind === 'literal') return expr.value;
          unknownPreviewRefs.set('preview.hidden.margin', 'hidden');
          return undefined;
        },
        activeRelationshipRoles: () => [],
      } as never,
      {
        id: 'hidden-preview-posture',
        traceLabel: 'hidden-preview-posture',
        costClass: 'preview',
        must: [],
        prefer: [{
          id: 'preferVisibleOnly',
          value: { kind: 'ref', ref: { kind: 'previewOptionRef', refKind: 'deltaVictoryCurrentMarginSelf' } },
          weight: literal(2),
          fallback: { contribution: literal(0) },
        }],
        dependencies: {
          parameters: [],
          stateFeatures: [],
          candidateFeatures: [],
          aggregates: [],
          strategicConditions: [],
        },
      },
      { unknownPreviewRefs } as never,
    );

    assert.equal(result.status, 'hidden');
    assert.deepEqual(result.preferContributions, [{
      id: 'preferVisibleOnly',
      status: 'hidden',
      contribution: 0,
      fallbackReason: 'hidden',
    }]);
  });

  it('keeps plan trace evidence scoped to visible role bindings', () => {
    const visibleBinding: PolicyPlanTraceRoleBinding = {
      role: 'visiblePiece',
      selectedId: visibleTokenId,
      quality: 1,
      rank: 1,
      components: {},
    };
    const trace = buildPlanProposalTrace({
      status: 'selected',
      selected: {
        templateId: 'visible-template',
        intent: 'visible-template',
        rootStableMoveKey: 'claim',
        roleBindings: { visiblePiece: visibleBinding },
      },
      activeDoctrines: [],
      rejectedDoctrines: [],
      filteredOutTemplates: [],
      alternatives: [],
    } as never);

    assertTraceHasNoHiddenTokenEvidence(trace);
    assertInvariantFailsClosed('synthetic unsafe trace role binding', [hiddenTokenId]);
  });
});

function assertTraceHasNoHiddenTokenEvidence(trace: PolicyPlanTrace): void {
  assertHiddenTokenAbsent('plan trace role bindings', trace.roleBindings.map((binding) => binding.selectedId));
  assertHiddenTokenAbsent('plan trace alternatives', trace.alternatives.map((alternative) => alternative.stableKey));
}
