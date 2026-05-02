// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createPolicyRuntimeProviders } from '../../../src/agents/policy-runtime.js';
import { extractAnnotationValue } from '../../../src/agents/policy-annotation-resolve.js';
import {
  asPhaseId,
  asPlayerId,
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
import { asActionId, asZoneId } from '../../../src/kernel/branded.js';
import type { EventDeckDef } from '../../../src/kernel/types-events.js';
import { withCompiledPolicyCatalog } from '../../helpers/policy-catalog-fixtures.js';

const phaseId = asPhaseId('main');

const PUBLIC_VISIBILITY: CompiledSurfaceVisibility = {
  current: 'public',
  preview: { visibility: 'public', allowWhenHiddenSampling: false },
};

const HIDDEN_VISIBILITY: CompiledSurfaceVisibility = {
  current: 'hidden',
  preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
};

const SAMPLE_SIDE_ANNOTATION: CompiledEventSideAnnotation = {
  tokenPlacements: { us: 3, nva: 1 },
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

const SAMPLE_ANNOTATION: CompiledEventCardAnnotation = {
  cardId: 'card-1',
  unshaded: SAMPLE_SIDE_ANNOTATION,
  shaded: {
    ...SAMPLE_SIDE_ANNOTATION,
    tokenPlacements: { nva: 5, vc: 2 },
    markerModifications: 0,
    grantsOperation: false,
    grantOperationSeats: [],
  },
};

function createMinimalCatalog(overrides?: {
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
  return withCompiledPolicyCatalog({
    schemaVersion: 2,
    catalogFingerprint: 'test-catalog',
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
      activeCardAnnotation: overrides?.activeCardAnnotation ?? HIDDEN_VISIBILITY,
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
    bindingsBySeat: { us: 'test-profile', them: 'test-profile' },
  });
}

const testEventDeck: EventDeckDef = {
  id: 'main-deck',
  drawZone: 'event-draw:none',
  discardZone: 'event-discard:none',
  cards: [
    {
      id: 'card-1',
      title: 'Test Event',
      sideMode: 'dual',
      tags: [],
      metadata: {},
    },
    {
      id: 'card-no-annotation',
      title: 'Unannotated Event',
      sideMode: 'dual',
      tags: [],
      metadata: {},
    },
  ],
};

const testCardMetadataIndex: CompiledCardMetadataIndex = {
  entries: {
    'card-1': { deckId: 'main-deck', cardId: 'card-1', tags: [], metadata: {} },
    'card-no-annotation': { deckId: 'main-deck', cardId: 'card-no-annotation', tags: [], metadata: {} },
  },
};

const testAnnotationIndex: CompiledEventAnnotationIndex = {
  entries: {
    'card-1': SAMPLE_ANNOTATION,
  },
};

function createDef(catalog: AgentPolicyCatalog, extras?: {
  readonly cardAnnotationIndex?: CompiledEventAnnotationIndex;
}): GameDef {
  const zoneIds = ['event-draw:none', 'event-discard:none'];
  return {
    metadata: { id: 'annotation-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: zoneIds.map((id) => ({ id: asZoneId(id), owner: 'none' as const, visibility: 'public' as const, ordering: 'stack' as const })),
    derivedMetrics: [],
    seats: [{ id: 'us' }, { id: 'them' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: phaseId }] },
    agents: catalog,
    actions: [],
    triggers: [],
    terminal: { conditions: [] },
    eventDecks: [testEventDeck],
    cardMetadataIndex: testCardMetadataIndex,
    ...(extras?.cardAnnotationIndex !== undefined ? { cardAnnotationIndex: extras.cardAnnotationIndex } : {}),
  };
}

function makeProviders(state: GameState, def: GameDef, catalog: AgentPolicyCatalog, seatId = 'us') {
  return createPolicyRuntimeProviders({
    def,
    state,
    playerId: asPlayerId(seatId === 'us' ? 0 : 1),
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

describe('extractAnnotationValue (unit)', () => {
  it('returns per-seat numeric value for tokenPlacements with role selector', () => {
    const result = extractAnnotationValue(
      SAMPLE_ANNOTATION,
      { id: 'unshaded.tokenPlacements.us', selector: { kind: 'role', seatToken: 'us' } },
      'us',
    );
    assert.equal(result, 3);
  });

  it('returns 0 for per-seat metric with missing seat key', () => {
    const result = extractAnnotationValue(
      SAMPLE_ANNOTATION,
      { id: 'unshaded.tokenPlacements.arvn', selector: { kind: 'role', seatToken: 'arvn' } },
      'us',
    );
    assert.equal(result, 0);
  });

  it('resolves self selector to evaluating seat ID', () => {
    const resultUs = extractAnnotationValue(
      SAMPLE_ANNOTATION,
      { id: 'unshaded.tokenPlacements.self', selector: { kind: 'player', player: 'self' } },
      'us',
    );
    assert.equal(resultUs, 3);

    const resultNva = extractAnnotationValue(
      SAMPLE_ANNOTATION,
      { id: 'unshaded.tokenPlacements.self', selector: { kind: 'player', player: 'self' } },
      'nva',
    );
    assert.equal(resultNva, 1);
  });

  it('resolves active selector to active seat ID', () => {
    const result = extractAnnotationValue(
      SAMPLE_ANNOTATION,
      { id: 'unshaded.tokenPlacements.active', selector: { kind: 'player', player: 'active' } },
      'us',
      'nva', // activeSeatId
    );
    assert.equal(result, 1);
  });

  it('returns scalar number for markerModifications', () => {
    const result = extractAnnotationValue(
      SAMPLE_ANNOTATION,
      { id: 'unshaded.markerModifications' },
      'us',
    );
    assert.equal(result, 4);
  });

  it('returns scalar number for effectNodeCount', () => {
    const result = extractAnnotationValue(
      SAMPLE_ANNOTATION,
      { id: 'unshaded.effectNodeCount' },
      'us',
    );
    assert.equal(result, 12);
  });

  it('returns boolean for grantsOperation', () => {
    const result = extractAnnotationValue(
      SAMPLE_ANNOTATION,
      { id: 'unshaded.grantsOperation' },
      'us',
    );
    assert.equal(result, true);
  });

  it('returns false for shaded grantsOperation', () => {
    const result = extractAnnotationValue(
      SAMPLE_ANNOTATION,
      { id: 'shaded.grantsOperation' },
      'us',
    );
    assert.equal(result, false);
  });

  it('returns boolean for hasDecisionPoints', () => {
    const result = extractAnnotationValue(
      SAMPLE_ANNOTATION,
      { id: 'unshaded.hasDecisionPoints' },
      'us',
    );
    assert.equal(result, true);
  });

  it('returns undefined for missing side', () => {
    const annotationNoShaded: CompiledEventCardAnnotation = {
      cardId: 'x',
      unshaded: SAMPLE_SIDE_ANNOTATION,
    };
    const result = extractAnnotationValue(
      annotationNoShaded,
      { id: 'shaded.markerModifications' },
      'us',
    );
    assert.equal(result, undefined);
  });

  it('returns undefined for invalid ref.id without dot', () => {
    const result = extractAnnotationValue(
      SAMPLE_ANNOTATION,
      { id: 'nodot' },
      'us',
    );
    assert.equal(result, undefined);
  });

  it('returns undefined for array metric grantOperationSeats', () => {
    const result = extractAnnotationValue(
      SAMPLE_ANNOTATION,
      { id: 'unshaded.grantOperationSeats' },
      'us',
    );
    assert.equal(result, undefined);
  });

  it('returns per-seat value from shaded side', () => {
    const result = extractAnnotationValue(
      SAMPLE_ANNOTATION,
      { id: 'shaded.tokenPlacements.nva', selector: { kind: 'role', seatToken: 'nva' } },
      'us',
    );
    assert.equal(result, 5);
  });
});

describe('activeCardAnnotation runtime resolution', () => {
  it('resolves per-seat numeric metric with public visibility', () => {
    const catalog = createMinimalCatalog({ activeCardAnnotation: PUBLIC_VISIBILITY });
    const def = createDef(catalog, { cardAnnotationIndex: testAnnotationIndex });
    const state = placeCardInDiscard(initialState(def, 1, 2).state, 'card-1');
    const providers = makeProviders(state, def, catalog);

    const result = providers.currentSurface.resolveSurface({
      kind: 'currentSurface',
      family: 'activeCardAnnotation',
      id: 'unshaded.tokenPlacements.us',
      selector: { kind: 'role', seatToken: 'us' },
    });
    assert.equal(result, 3);
  });

  it('resolves self seat differently per evaluating seat', () => {
    const catalog = createMinimalCatalog({ activeCardAnnotation: PUBLIC_VISIBILITY });
    const def = createDef(catalog, { cardAnnotationIndex: testAnnotationIndex });
    const state = placeCardInDiscard(initialState(def, 1, 2).state, 'card-1');

    const providersUs = makeProviders(state, def, catalog, 'us');
    const resultUs = providersUs.currentSurface.resolveSurface({
      kind: 'currentSurface',
      family: 'activeCardAnnotation',
      id: 'unshaded.tokenPlacements.self',
      selector: { kind: 'player', player: 'self' },
    });
    assert.equal(resultUs, 3);

    const providersThem = makeProviders(state, def, catalog, 'them');
    const resultThem = providersThem.currentSurface.resolveSurface({
      kind: 'currentSurface',
      family: 'activeCardAnnotation',
      id: 'unshaded.tokenPlacements.self',
      selector: { kind: 'player', player: 'self' },
    });
    // 'them' has no entry in tokenPlacements → defaults to 0
    assert.equal(resultThem, 0);
  });

  it('resolves scalar metric (markerModifications)', () => {
    const catalog = createMinimalCatalog({ activeCardAnnotation: PUBLIC_VISIBILITY });
    const def = createDef(catalog, { cardAnnotationIndex: testAnnotationIndex });
    const state = placeCardInDiscard(initialState(def, 1, 2).state, 'card-1');
    const providers = makeProviders(state, def, catalog);

    const result = providers.currentSurface.resolveSurface({
      kind: 'currentSurface',
      family: 'activeCardAnnotation',
      id: 'unshaded.markerModifications',
    });
    assert.equal(result, 4);
  });

  it('resolves boolean metric (grantsOperation)', () => {
    const catalog = createMinimalCatalog({ activeCardAnnotation: PUBLIC_VISIBILITY });
    const def = createDef(catalog, { cardAnnotationIndex: testAnnotationIndex });
    const state = placeCardInDiscard(initialState(def, 1, 2).state, 'card-1');
    const providers = makeProviders(state, def, catalog);

    const result = providers.currentSurface.resolveSurface({
      kind: 'currentSurface',
      family: 'activeCardAnnotation',
      id: 'unshaded.grantsOperation',
    });
    assert.equal(result, true);
  });

  it('returns undefined when no active card exists', () => {
    const catalog = createMinimalCatalog({ activeCardAnnotation: PUBLIC_VISIBILITY });
    const def = createDef(catalog, { cardAnnotationIndex: testAnnotationIndex });
    const state = initialState(def, 1, 2).state; // no card in discard
    const providers = makeProviders(state, def, catalog);

    const result = providers.currentSurface.resolveSurface({
      kind: 'currentSurface',
      family: 'activeCardAnnotation',
      id: 'unshaded.tokenPlacements.us',
      selector: { kind: 'role', seatToken: 'us' },
    });
    assert.equal(result, undefined);
  });

  it('returns undefined when active card not in annotation index', () => {
    const catalog = createMinimalCatalog({ activeCardAnnotation: PUBLIC_VISIBILITY });
    const def = createDef(catalog, { cardAnnotationIndex: testAnnotationIndex });
    const state = placeCardInDiscard(initialState(def, 1, 2).state, 'card-no-annotation');
    const providers = makeProviders(state, def, catalog);

    const result = providers.currentSurface.resolveSurface({
      kind: 'currentSurface',
      family: 'activeCardAnnotation',
      id: 'unshaded.markerModifications',
    });
    assert.equal(result, undefined);
  });

  it('returns undefined when side does not exist on annotation', () => {
    const annotationUnshadedOnly: CompiledEventAnnotationIndex = {
      entries: {
        'card-1': { cardId: 'card-1', unshaded: SAMPLE_SIDE_ANNOTATION },
      },
    };
    const catalog = createMinimalCatalog({ activeCardAnnotation: PUBLIC_VISIBILITY });
    const def = createDef(catalog, { cardAnnotationIndex: annotationUnshadedOnly });
    const state = placeCardInDiscard(initialState(def, 1, 2).state, 'card-1');
    const providers = makeProviders(state, def, catalog);

    const result = providers.currentSurface.resolveSurface({
      kind: 'currentSurface',
      family: 'activeCardAnnotation',
      id: 'shaded.markerModifications',
    });
    assert.equal(result, undefined);
  });

  it('returns undefined when cardAnnotationIndex is absent from GameDef', () => {
    const catalog = createMinimalCatalog({ activeCardAnnotation: PUBLIC_VISIBILITY });
    const def = createDef(catalog); // no cardAnnotationIndex
    const state = placeCardInDiscard(initialState(def, 1, 2).state, 'card-1');
    const providers = makeProviders(state, def, catalog);

    const result = providers.currentSurface.resolveSurface({
      kind: 'currentSurface',
      family: 'activeCardAnnotation',
      id: 'unshaded.markerModifications',
    });
    assert.equal(result, undefined);
  });

  it('returns undefined when visibility is hidden', () => {
    const catalog = createMinimalCatalog(); // default hidden
    const def = createDef(catalog, { cardAnnotationIndex: testAnnotationIndex });
    const state = placeCardInDiscard(initialState(def, 1, 2).state, 'card-1');
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

describe('activeCardAnnotation preview resolution', () => {
  it('preview returns unavailable for annotation (annotations are static, but preview path handles them)', () => {
    // The preview path resolves annotations from the preview state's active card.
    // Since we can't easily drive a full preview (requires trusted moves),
    // we verify the extractAnnotationValue helper works the same way
    // (already covered by unit tests above).
    // This test confirms the preview provider exists and handles the family.
    const catalog = createMinimalCatalog({ activeCardAnnotation: PUBLIC_VISIBILITY });
    const def = createDef(catalog, { cardAnnotationIndex: testAnnotationIndex });
    const state = initialState(def, 1, 2).state;
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
});

describe('existing surface ref tests still pass', () => {
  it('activeCardIdentity still resolves correctly alongside annotation changes', () => {
    const catalog = createMinimalCatalog({ activeCardAnnotation: PUBLIC_VISIBILITY });
    // Add activeCardIdentity visibility
    (catalog.surfaceVisibility as { activeCardIdentity: CompiledSurfaceVisibility }).activeCardIdentity = PUBLIC_VISIBILITY;
    const def = createDef(catalog, { cardAnnotationIndex: testAnnotationIndex });
    const state = placeCardInDiscard(initialState(def, 1, 2).state, 'card-1');
    const providers = makeProviders(state, def, catalog);

    const result = providers.currentSurface.resolveSurface({
      kind: 'currentSurface',
      family: 'activeCardIdentity',
      id: 'id',
    });
    assert.equal(result, 'card-1');
  });
});
