// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createPolicyRuntimeProviders } from '../../../src/agents/policy-runtime.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
  initialState,
  type AgentPolicyCatalog,
  type CompiledSurfaceVisibility,
  type CompiledCardMetadataIndex,
  type CompiledEventAnnotationIndex,
  type CompiledEventCardAnnotation,
  type CompiledEventSideAnnotation,
  type GameDef,
  type GameState,
} from '../../../src/kernel/index.js';
import type { EventDeckDef } from '../../../src/kernel/types-events.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const phaseId = asPhaseId('main');

const PUBLIC_VISIBILITY: CompiledSurfaceVisibility = {
  current: 'public',
  preview: { visibility: 'public', allowWhenHiddenSampling: false },
};

const HIDDEN_VISIBILITY: CompiledSurfaceVisibility = {
  current: 'hidden',
  preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
};

const SAMPLE_SIDE: CompiledEventSideAnnotation = {
  tokenPlacements: { us: 3, nva: 1, vc: 0 },
  tokenRemovals: { vc: 2 },
  tokenCreations: { us: 1 },
  tokenDestructions: {},
  markerModifications: 4,
  globalMarkerModifications: 1,
  globalVarModifications: 2,
  perPlayerVarModifications: 0,
  varTransfers: 0,
  drawCount: 1,
  shuffleCount: 0,
  grantsOperation: true,
  grantOperationSeats: ['us'],
  hasEligibilityOverride: false,
  hasLastingEffect: true,
  hasBranches: false,
  hasPhaseControl: false,
  hasDecisionPoints: true,
  effectNodeCount: 12,
};

const SAMPLE_SHADED_SIDE: CompiledEventSideAnnotation = {
  ...SAMPLE_SIDE,
  tokenPlacements: { nva: 5, vc: 2 },
  markerModifications: 0,
  grantsOperation: false,
  grantOperationSeats: [],
  effectNodeCount: 8,
};

const SAMPLE_ANNOTATION: CompiledEventCardAnnotation = {
  cardId: 'card-e2e',
  unshaded: SAMPLE_SIDE,
  shaded: SAMPLE_SHADED_SIDE,
};

const ANNOTATION_INDEX: CompiledEventAnnotationIndex = {
  entries: { 'card-e2e': SAMPLE_ANNOTATION },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const testEventDeck: EventDeckDef = {
  id: 'e2e-deck',
  drawZone: 'event-draw:none',
  discardZone: 'event-discard:none',
  cards: [
    {
      id: 'card-e2e',
      title: 'E2E Test Event',
      sideMode: 'dual',
      tags: [],
      metadata: {},
    },
  ],
};

const testCardMetadataIndex: CompiledCardMetadataIndex = {
  entries: {
    'card-e2e': { deckId: 'e2e-deck', cardId: 'card-e2e', tags: [], metadata: {} },
  },
};

function createCatalog(overrides?: {
  readonly activeCardAnnotation?: CompiledSurfaceVisibility;
}): AgentPolicyCatalog {
  const profile = {
    fingerprint: 'test-profile',
    params: {},
    preview: { mode: 'exactWorld' as const },
    selection: { mode: 'argmax' as const },
    use: {
      pruningRules: [],
      considerations: [],
      tieBreakers: [],
    },
    plan: {
      stateFeatures: [],
      candidateFeatures: [],
      candidateAggregates: [],
      considerations: [],
    },
  };
  return {
    schemaVersion: 2,
    catalogFingerprint: 'e2e-catalog',
    surfaceVisibility: {
      globalVars: {},
      globalMarkers: {},
      perPlayerVars: {},
      derivedMetrics: {},
      victory: {
        currentMargin: HIDDEN_VISIBILITY,
        currentRank: HIDDEN_VISIBILITY,
      },
      activeCardIdentity: HIDDEN_VISIBILITY,
      activeCardTag: HIDDEN_VISIBILITY,
      activeCardMetadata: HIDDEN_VISIBILITY,
      activeCardAnnotation: overrides?.activeCardAnnotation ?? PUBLIC_VISIBILITY,
    },
    parameterDefs: {},
    candidateParamDefs: {},
    library: {
      stateFeatures: {},
      candidateFeatures: {},
      candidateAggregates: {},
      pruningRules: {},
      considerations: {},
      tieBreakers: {},
      strategicConditions: {},
    },
    profiles: { 'test-profile': profile },
    bindingsBySeat: { us: 'test-profile', nva: 'test-profile', vc: 'test-profile' },
  };
}

function createDef(
  catalog: AgentPolicyCatalog,
  extras?: { readonly cardAnnotationIndex?: CompiledEventAnnotationIndex },
): GameDef {
  const zoneIds = ['event-draw:none', 'event-discard:none'];
  return {
    metadata: { id: 'annotation-e2e', players: { min: 3, max: 3 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: zoneIds.map((id) => ({
      id: asZoneId(id),
      owner: 'none' as const,
      visibility: 'public' as const,
      ordering: 'stack' as const,
    })),
    derivedMetrics: [],
    seats: [{ id: 'us' }, { id: 'nva' }, { id: 'vc' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: phaseId }] },
    agents: catalog,
    actions: [],
    triggers: [],
    terminal: { conditions: [] },
    eventDecks: [testEventDeck],
    cardMetadataIndex: testCardMetadataIndex,
    ...(extras?.cardAnnotationIndex !== undefined
      ? { cardAnnotationIndex: extras.cardAnnotationIndex }
      : {}),
  };
}

function makeProviders(
  state: GameState,
  def: GameDef,
  catalog: AgentPolicyCatalog,
  seatId = 'us',
) {
  const seatIndex = ['us', 'nva', 'vc'].indexOf(seatId);
  return createPolicyRuntimeProviders({
    def,
    state,
    playerId: asPlayerId(seatIndex >= 0 ? seatIndex : 0),
    seatId,
    trustedMoveIndex: new Map(),
    catalog,
    runtimeError: (code, message) => new Error(`${code}: ${message}`),
  });
}

function placeCardInDiscard(state: GameState, cardId: string): GameState {
  return {
    ...state,
    zones: {
      ...state.zones,
      'event-discard:none': [{ id: 1 as never, type: 'event-card', props: { cardId } }],
    },
  };
}

// ---------------------------------------------------------------------------
// 6. Surface ref resolution end-to-end
// ---------------------------------------------------------------------------

describe('surface ref resolution E2E', () => {
  it('resolves activeCard.annotation.unshaded.tokenPlacements.us to correct value', () => {
    const catalog = createCatalog();
    const def = createDef(catalog, { cardAnnotationIndex: ANNOTATION_INDEX });
    const state = placeCardInDiscard(initialState(def, 1, 3).state, 'card-e2e');
    const providers = makeProviders(state, def, catalog, 'us');

    const result = providers.currentSurface.resolveSurface({
      kind: 'currentSurface',
      family: 'activeCardAnnotation',
      id: 'unshaded.tokenPlacements.us',
      selector: { kind: 'role', seatToken: 'us' },
    });
    assert.equal(result, 3);
  });

  it('resolves scalar metric (markerModifications) end-to-end', () => {
    const catalog = createCatalog();
    const def = createDef(catalog, { cardAnnotationIndex: ANNOTATION_INDEX });
    const state = placeCardInDiscard(initialState(def, 1, 3).state, 'card-e2e');
    const providers = makeProviders(state, def, catalog);

    const result = providers.currentSurface.resolveSurface({
      kind: 'currentSurface',
      family: 'activeCardAnnotation',
      id: 'unshaded.markerModifications',
    });
    assert.equal(result, 4);
  });

  it('resolves boolean metric (grantsOperation) end-to-end', () => {
    const catalog = createCatalog();
    const def = createDef(catalog, { cardAnnotationIndex: ANNOTATION_INDEX });
    const state = placeCardInDiscard(initialState(def, 1, 3).state, 'card-e2e');
    const providers = makeProviders(state, def, catalog);

    const result = providers.currentSurface.resolveSurface({
      kind: 'currentSurface',
      family: 'activeCardAnnotation',
      id: 'unshaded.grantsOperation',
    });
    assert.equal(result, true);
  });

  it('resolves shaded side metric', () => {
    const catalog = createCatalog();
    const def = createDef(catalog, { cardAnnotationIndex: ANNOTATION_INDEX });
    const state = placeCardInDiscard(initialState(def, 1, 3).state, 'card-e2e');
    const providers = makeProviders(state, def, catalog);

    const result = providers.currentSurface.resolveSurface({
      kind: 'currentSurface',
      family: 'activeCardAnnotation',
      id: 'shaded.tokenPlacements.nva',
      selector: { kind: 'role', seatToken: 'nva' },
    });
    assert.equal(result, 5);
  });

  it('returns undefined when no active card exists', () => {
    const catalog = createCatalog();
    const def = createDef(catalog, { cardAnnotationIndex: ANNOTATION_INDEX });
    const state = initialState(def, 1, 3).state; // no card in discard
    const providers = makeProviders(state, def, catalog);

    const result = providers.currentSurface.resolveSurface({
      kind: 'currentSurface',
      family: 'activeCardAnnotation',
      id: 'unshaded.tokenPlacements.us',
      selector: { kind: 'role', seatToken: 'us' },
    });
    assert.equal(result, undefined);
  });
});

// ---------------------------------------------------------------------------
// 8. Self-seat resolution
// ---------------------------------------------------------------------------

describe('self-seat resolution', () => {
  it('self resolves to US seat value (3) for US evaluator', () => {
    const catalog = createCatalog();
    const def = createDef(catalog, { cardAnnotationIndex: ANNOTATION_INDEX });
    const state = placeCardInDiscard(initialState(def, 1, 3).state, 'card-e2e');
    const providers = makeProviders(state, def, catalog, 'us');

    const result = providers.currentSurface.resolveSurface({
      kind: 'currentSurface',
      family: 'activeCardAnnotation',
      id: 'unshaded.tokenPlacements.self',
      selector: { kind: 'player', player: 'self' },
    });
    assert.equal(result, 3);
  });

  it('self resolves to NVA seat value (1) for NVA evaluator', () => {
    const catalog = createCatalog();
    const def = createDef(catalog, { cardAnnotationIndex: ANNOTATION_INDEX });
    const state = placeCardInDiscard(initialState(def, 1, 3).state, 'card-e2e');
    const providers = makeProviders(state, def, catalog, 'nva');

    const result = providers.currentSurface.resolveSurface({
      kind: 'currentSurface',
      family: 'activeCardAnnotation',
      id: 'unshaded.tokenPlacements.self',
      selector: { kind: 'player', player: 'self' },
    });
    assert.equal(result, 1);
  });

  it('self resolves to VC seat value (0) for VC evaluator', () => {
    const catalog = createCatalog();
    const def = createDef(catalog, { cardAnnotationIndex: ANNOTATION_INDEX });
    const state = placeCardInDiscard(initialState(def, 1, 3).state, 'card-e2e');
    const providers = makeProviders(state, def, catalog, 'vc');

    const result = providers.currentSurface.resolveSurface({
      kind: 'currentSurface',
      family: 'activeCardAnnotation',
      id: 'unshaded.tokenPlacements.self',
      selector: { kind: 'player', player: 'self' },
    });
    assert.equal(result, 0);
  });
});

// ---------------------------------------------------------------------------
// 9. Visibility gating
// ---------------------------------------------------------------------------

describe('visibility gating', () => {
  it('returns undefined when activeCardAnnotation visibility is hidden', () => {
    const catalog = createCatalog({ activeCardAnnotation: HIDDEN_VISIBILITY });
    const def = createDef(catalog, { cardAnnotationIndex: ANNOTATION_INDEX });
    const state = placeCardInDiscard(initialState(def, 1, 3).state, 'card-e2e');
    const providers = makeProviders(state, def, catalog);

    const result = providers.currentSurface.resolveSurface({
      kind: 'currentSurface',
      family: 'activeCardAnnotation',
      id: 'unshaded.tokenPlacements.us',
      selector: { kind: 'role', seatToken: 'us' },
    });
    assert.equal(result, undefined);
  });

  it('returns undefined for scalar metric when hidden', () => {
    const catalog = createCatalog({ activeCardAnnotation: HIDDEN_VISIBILITY });
    const def = createDef(catalog, { cardAnnotationIndex: ANNOTATION_INDEX });
    const state = placeCardInDiscard(initialState(def, 1, 3).state, 'card-e2e');
    const providers = makeProviders(state, def, catalog);

    const result = providers.currentSurface.resolveSurface({
      kind: 'currentSurface',
      family: 'activeCardAnnotation',
      id: 'unshaded.markerModifications',
    });
    assert.equal(result, undefined);
  });

  it('returns undefined for boolean metric when hidden', () => {
    const catalog = createCatalog({ activeCardAnnotation: HIDDEN_VISIBILITY });
    const def = createDef(catalog, { cardAnnotationIndex: ANNOTATION_INDEX });
    const state = placeCardInDiscard(initialState(def, 1, 3).state, 'card-e2e');
    const providers = makeProviders(state, def, catalog);

    const result = providers.currentSurface.resolveSurface({
      kind: 'currentSurface',
      family: 'activeCardAnnotation',
      id: 'unshaded.grantsOperation',
    });
    assert.equal(result, undefined);
  });
});

// ---------------------------------------------------------------------------
// 10. Preview path
// ---------------------------------------------------------------------------

describe('preview path resolution', () => {
  it('preview surface handles activeCardAnnotation family', () => {
    const catalog = createCatalog();
    const def = createDef(catalog, { cardAnnotationIndex: ANNOTATION_INDEX });
    const state = initialState(def, 1, 3).state;
    const providers = makeProviders(state, def, catalog);

    // Preview resolution requires a candidate with a valid trusted move.
    // Without one, the preview outcome is 'unresolved', so annotation ref
    // returns { kind: 'unknown', reason: 'unresolved' }.
    const result = providers.previewSurface.resolveSurface(
      { move: { actionId: asActionId('pass'), params: {} }, stableMoveKey: 'pass', actionId: 'pass' },
      {
        kind: 'previewSurface',
        family: 'activeCardAnnotation',
        id: 'unshaded.tokenPlacements.us',
        selector: { kind: 'role', seatToken: 'us' },
      },
    );
    assert.equal(result.kind, 'unknown');
  });

  it('preview surface with hidden visibility returns unknown', () => {
    const catalog = createCatalog({ activeCardAnnotation: HIDDEN_VISIBILITY });
    const def = createDef(catalog, { cardAnnotationIndex: ANNOTATION_INDEX });
    const state = initialState(def, 1, 3).state;
    const providers = makeProviders(state, def, catalog);

    const result = providers.previewSurface.resolveSurface(
      { move: { actionId: asActionId('pass'), params: {} }, stableMoveKey: 'pass', actionId: 'pass' },
      {
        kind: 'previewSurface',
        family: 'activeCardAnnotation',
        id: 'unshaded.markerModifications',
      },
    );
    assert.equal(result.kind, 'unknown');
  });
});
