import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createPolicyRuntimeProviders } from '../../../src/agents/policy-runtime.js';
import {
  asPhaseId,
  asPlayerId,
  initialState,
  type AgentPolicyCatalog,
  type CompiledAgentProfile,
  type CompiledSurfaceVisibility,
  type CompiledCardMetadataIndex,
  type GameDef,
  type GameState,
} from '../../../src/kernel/index.js';
import { asZoneId } from '../../../src/kernel/branded.js';
import type { EventDeckDef } from '../../../src/kernel/types-events.js';

const phaseId = asPhaseId('main');

const PUBLIC_VISIBILITY: CompiledSurfaceVisibility = {
  current: 'public',
  preview: { visibility: 'public', allowWhenHiddenSampling: false },
};

const HIDDEN_VISIBILITY: CompiledSurfaceVisibility = {
  current: 'hidden',
  preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
};

function createMinimalCatalog(overrides?: {
  readonly previewMode?: 'exactWorld' | 'tolerateStochastic' | 'disabled';
  readonly activeCardIdentity?: CompiledSurfaceVisibility;
  readonly activeCardTag?: CompiledSurfaceVisibility;
  readonly activeCardMetadata?: CompiledSurfaceVisibility;
  readonly activeCardAnnotation?: CompiledSurfaceVisibility;
  readonly globalMarkers?: Readonly<Record<string, CompiledSurfaceVisibility>>;
}): AgentPolicyCatalog {
  const profile: CompiledAgentProfile = {
    fingerprint: 'test-profile',
    params: {},
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
    preview: { mode: overrides?.previewMode ?? 'exactWorld' },
    selection: { mode: 'argmax' as const },
  };
  return {
    schemaVersion: 2,
    catalogFingerprint: 'test-catalog',
    surfaceVisibility: {
      globalVars: {},
      globalMarkers: overrides?.globalMarkers ?? {},
      perPlayerVars: {},
      derivedMetrics: {},
      victory: {
        currentMargin: HIDDEN_VISIBILITY,
        currentRank: HIDDEN_VISIBILITY,
      },
      activeCardIdentity: overrides?.activeCardIdentity ?? HIDDEN_VISIBILITY,
      activeCardTag: overrides?.activeCardTag ?? HIDDEN_VISIBILITY,
      activeCardMetadata: overrides?.activeCardMetadata ?? HIDDEN_VISIBILITY,
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
    bindingsBySeat: { us: 'test-profile' },
  };
}

function createDef(catalog: AgentPolicyCatalog, extras?: {
  readonly eventDecks?: readonly EventDeckDef[];
  readonly cardMetadataIndex?: CompiledCardMetadataIndex;
  readonly extraZones?: readonly string[];
  readonly globalMarkerLattices?: GameDef['globalMarkerLattices'];
}): GameDef {
  const zoneIds = ['event-draw:none', 'event-discard:none', ...(extras?.extraZones ?? [])];
  return {
    metadata: { id: 'policy-runtime-test', players: { min: 2, max: 2 } },
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
    ...(extras?.eventDecks !== undefined ? { eventDecks: extras.eventDecks } : {}),
    ...(extras?.cardMetadataIndex !== undefined ? { cardMetadataIndex: extras.cardMetadataIndex } : {}),
    ...(extras?.globalMarkerLattices !== undefined ? { globalMarkerLattices: extras.globalMarkerLattices } : {}),
  };
}

describe('createPolicyRuntimeProviders', () => {
  it('constructs providers when profile uses tolerateStochastic preview mode', () => {
    const catalog = createMinimalCatalog({ previewMode: 'tolerateStochastic' });
    const def = createDef(catalog);
    const state = initialState(def, 1, 2).state;

    const providers = createPolicyRuntimeProviders({
      def,
      state,
      playerId: asPlayerId(0),
      seatId: 'us',
      trustedMoveIndex: new Map(),
      catalog,
      runtimeError: (code, message) => new Error(`${code}: ${message}`),
    });

    assert.ok(providers.previewSurface, 'previewSurface provider must be present');
    assert.ok(providers.intrinsics, 'intrinsics provider must be present');
    assert.ok(providers.candidates, 'candidates provider must be present');
    assert.ok(providers.currentSurface, 'currentSurface provider must be present');
  });

  it('constructs providers when profile uses the default exactWorld preview mode', () => {
    const catalog = createMinimalCatalog();
    const def = createDef(catalog);
    const state = initialState(def, 1, 2).state;

    const providers = createPolicyRuntimeProviders({
      def,
      state,
      playerId: asPlayerId(0),
      seatId: 'us',
      trustedMoveIndex: new Map(),
      catalog,
      runtimeError: (code, message) => new Error(`${code}: ${message}`),
    });

    assert.ok(providers.previewSurface, 'previewSurface provider must be present');
  });

  it('constructs providers when seatId has no profile binding', () => {
    const catalog = createMinimalCatalog({ previewMode: 'tolerateStochastic' });
    const def = createDef(catalog);
    const state = initialState(def, 1, 2).state;

    // 'them' has no binding in the catalog
    const providers = createPolicyRuntimeProviders({
      def,
      state,
      playerId: asPlayerId(1),
      seatId: 'them',
      trustedMoveIndex: new Map(),
      catalog,
      runtimeError: (code, message) => new Error(`${code}: ${message}`),
    });

    assert.ok(providers.previewSurface, 'previewSurface provider must be present even without profile binding');
  });
});

describe('activeCard surface resolution', () => {
  const testEventDeck: EventDeckDef = {
    id: 'main-deck',
    drawZone: 'event-draw:none',
    discardZone: 'event-discard:none',
    cards: [
      {
        id: 'card-1',
        title: 'Gulf of Tonkin',
        sideMode: 'dual',
        tags: ['pivotal', 'us-favorable'],
        metadata: { period: 'early', vcFavorability: 3 },
      },
      {
        id: 'card-2',
        title: 'Burning Bonze',
        sideMode: 'dual',
        tags: ['momentum'],
        metadata: { period: 'mid' },
      },
    ],
  };

  const testCardMetadataIndex: CompiledCardMetadataIndex = {
    entries: {
      'card-1': {
        deckId: 'main-deck',
        cardId: 'card-1',
        tags: ['pivotal', 'us-favorable'],
        metadata: { period: 'early', vcFavorability: 3 },
      },
      'card-2': {
        deckId: 'main-deck',
        cardId: 'card-2',
        tags: ['momentum'],
        metadata: { period: 'mid' },
      },
    },
  };

  function makeProviders(
    state: GameState,
    def: GameDef,
    catalog: AgentPolicyCatalog,
  ) {
    return createPolicyRuntimeProviders({
      def,
      state,
      playerId: asPlayerId(0),
      seatId: 'us',
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

  it('activeCardIdentity id returns card ID when card is in discard zone', () => {
    const catalog = createMinimalCatalog({ activeCardIdentity: PUBLIC_VISIBILITY });
    const def = createDef(catalog, { eventDecks: [testEventDeck], cardMetadataIndex: testCardMetadataIndex });
    const state = placeCardInDiscard(initialState(def, 1, 2).state, 'card-1');
    const providers = makeProviders(state, def, catalog);

    const result = providers.currentSurface.resolveSurface({
      kind: 'currentSurface',
      family: 'activeCardIdentity',
      id: 'id',
    });
    assert.equal(result, 'card-1');
  });

  it('activeCardIdentity deckId returns the correct deck ID', () => {
    const catalog = createMinimalCatalog({ activeCardIdentity: PUBLIC_VISIBILITY });
    const def = createDef(catalog, { eventDecks: [testEventDeck], cardMetadataIndex: testCardMetadataIndex });
    const state = placeCardInDiscard(initialState(def, 1, 2).state, 'card-1');
    const providers = makeProviders(state, def, catalog);

    const result = providers.currentSurface.resolveSurface({
      kind: 'currentSurface',
      family: 'activeCardIdentity',
      id: 'deckId',
    });
    assert.equal(result, 'main-deck');
  });

  it('activeCardTag returns true for a tag present on the card', () => {
    const catalog = createMinimalCatalog({ activeCardTag: PUBLIC_VISIBILITY });
    const def = createDef(catalog, { eventDecks: [testEventDeck], cardMetadataIndex: testCardMetadataIndex });
    const state = placeCardInDiscard(initialState(def, 1, 2).state, 'card-1');
    const providers = makeProviders(state, def, catalog);

    const result = providers.currentSurface.resolveSurface({
      kind: 'currentSurface',
      family: 'activeCardTag',
      id: 'pivotal',
    });
    assert.equal(result, true);
  });

  it('activeCardTag returns false for a tag NOT present on the card', () => {
    const catalog = createMinimalCatalog({ activeCardTag: PUBLIC_VISIBILITY });
    const def = createDef(catalog, { eventDecks: [testEventDeck], cardMetadataIndex: testCardMetadataIndex });
    const state = placeCardInDiscard(initialState(def, 1, 2).state, 'card-1');
    const providers = makeProviders(state, def, catalog);

    const result = providers.currentSurface.resolveSurface({
      kind: 'currentSurface',
      family: 'activeCardTag',
      id: 'momentum',
    });
    assert.equal(result, false);
  });

  it('activeCardMetadata returns scalar value for an existing key', () => {
    const catalog = createMinimalCatalog({ activeCardMetadata: PUBLIC_VISIBILITY });
    const def = createDef(catalog, { eventDecks: [testEventDeck], cardMetadataIndex: testCardMetadataIndex });
    const state = placeCardInDiscard(initialState(def, 1, 2).state, 'card-1');
    const providers = makeProviders(state, def, catalog);

    const result = providers.currentSurface.resolveSurface({
      kind: 'currentSurface',
      family: 'activeCardMetadata',
      id: 'vcFavorability',
    });
    assert.equal(result, 3);
  });

  it('activeCardMetadata returns undefined for a missing key', () => {
    const catalog = createMinimalCatalog({ activeCardMetadata: PUBLIC_VISIBILITY });
    const def = createDef(catalog, { eventDecks: [testEventDeck], cardMetadataIndex: testCardMetadataIndex });
    const state = placeCardInDiscard(initialState(def, 1, 2).state, 'card-1');
    const providers = makeProviders(state, def, catalog);

    const result = providers.currentSurface.resolveSurface({
      kind: 'currentSurface',
      family: 'activeCardMetadata',
      id: 'nonexistent',
    });
    assert.equal(result, undefined);
  });

  it('all three families return undefined when no active card exists', () => {
    const catalog = createMinimalCatalog({
      activeCardIdentity: PUBLIC_VISIBILITY,
      activeCardTag: PUBLIC_VISIBILITY,
      activeCardMetadata: PUBLIC_VISIBILITY,
    });
    const def = createDef(catalog, { eventDecks: [testEventDeck], cardMetadataIndex: testCardMetadataIndex });
    // No card in discard zone — default initialState has empty zones
    const state = initialState(def, 1, 2).state;
    const providers = makeProviders(state, def, catalog);

    assert.equal(
      providers.currentSurface.resolveSurface({ kind: 'currentSurface', family: 'activeCardIdentity', id: 'id' }),
      undefined,
    );
    assert.equal(
      providers.currentSurface.resolveSurface({ kind: 'currentSurface', family: 'activeCardTag', id: 'pivotal' }),
      undefined,
    );
    assert.equal(
      providers.currentSurface.resolveSurface({ kind: 'currentSurface', family: 'activeCardMetadata', id: 'period' }),
      undefined,
    );
  });

  it('all three families return undefined when visibility is hidden', () => {
    const catalog = createMinimalCatalog(); // defaults to hidden visibility
    const def = createDef(catalog, { eventDecks: [testEventDeck], cardMetadataIndex: testCardMetadataIndex });
    const state = placeCardInDiscard(initialState(def, 1, 2).state, 'card-1');
    const providers = makeProviders(state, def, catalog);

    assert.equal(
      providers.currentSurface.resolveSurface({ kind: 'currentSurface', family: 'activeCardIdentity', id: 'id' }),
      undefined,
    );
    assert.equal(
      providers.currentSurface.resolveSurface({ kind: 'currentSurface', family: 'activeCardTag', id: 'pivotal' }),
      undefined,
    );
    assert.equal(
      providers.currentSurface.resolveSurface({ kind: 'currentSurface', family: 'activeCardMetadata', id: 'period' }),
      undefined,
    );
  });

  it('missing cardMetadataIndex returns undefined for all card families', () => {
    const catalog = createMinimalCatalog({
      activeCardIdentity: PUBLIC_VISIBILITY,
      activeCardTag: PUBLIC_VISIBILITY,
      activeCardMetadata: PUBLIC_VISIBILITY,
    });
    // eventDecks present but no cardMetadataIndex
    const def = createDef(catalog, { eventDecks: [testEventDeck] });
    const state = placeCardInDiscard(initialState(def, 1, 2).state, 'card-1');
    const providers = makeProviders(state, def, catalog);

    assert.equal(
      providers.currentSurface.resolveSurface({ kind: 'currentSurface', family: 'activeCardIdentity', id: 'id' }),
      undefined,
    );
  });
});

describe('globalMarker surface resolution', () => {
  const globalMarkerLattices: NonNullable<GameDef['globalMarkerLattices']> = [
    {
      id: 'cap_boobyTraps',
      states: ['inactive', 'shaded', 'unshaded'],
      defaultState: 'inactive',
    },
  ];

  function makeProviders(
    state: GameState,
    def: GameDef,
    catalog: AgentPolicyCatalog,
  ) {
    return createPolicyRuntimeProviders({
      def,
      state,
      playerId: asPlayerId(0),
      seatId: 'us',
      trustedMoveIndex: new Map(),
      catalog,
      runtimeError: (code, message) => new Error(`${code}: ${message}`),
    });
  }

  it('returns the current global marker state when present in state', () => {
    const catalog = createMinimalCatalog({
      globalMarkers: { cap_boobyTraps: PUBLIC_VISIBILITY },
    });
    const def = createDef(catalog, { globalMarkerLattices });
    const baseState = initialState(def, 1, 2).state;
    const state: GameState = {
      ...baseState,
      globalMarkers: { cap_boobyTraps: 'shaded' },
    };
    const providers = makeProviders(state, def, catalog);

    const result = providers.currentSurface.resolveSurface({
      kind: 'currentSurface',
      family: 'globalMarker',
      id: 'cap_boobyTraps',
    });

    assert.equal(result, 'shaded');
  });

  it('falls back to the lattice defaultState when the marker is unset in state', () => {
    const catalog = createMinimalCatalog({
      globalMarkers: { cap_boobyTraps: PUBLIC_VISIBILITY },
    });
    const def = createDef(catalog, { globalMarkerLattices });
    const state = initialState(def, 1, 2).state;
    const providers = makeProviders(state, def, catalog);

    const result = providers.currentSurface.resolveSurface({
      kind: 'currentSurface',
      family: 'globalMarker',
      id: 'cap_boobyTraps',
    });

    assert.equal(result, 'inactive');
  });

  it('returns undefined when the marker id is unknown to the lattices', () => {
    const catalog = createMinimalCatalog({
      globalMarkers: { cap_unknown: PUBLIC_VISIBILITY },
    });
    const def = createDef(catalog, { globalMarkerLattices });
    const state = initialState(def, 1, 2).state;
    const providers = makeProviders(state, def, catalog);

    const result = providers.currentSurface.resolveSurface({
      kind: 'currentSurface',
      family: 'globalMarker',
      id: 'cap_unknown',
    });

    assert.equal(result, undefined);
  });
});
