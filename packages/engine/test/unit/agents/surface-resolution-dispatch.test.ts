import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildPolicyVictorySurface,
  resolveSurfaceRefValue,
  type SurfaceResolutionContext,
} from '../../../src/agents/policy-surface.js';
import { asPhaseId, asPlayerId, asZoneId, initialState, type GameDef, type GameState } from '../../../src/kernel/index.js';
import { buildSeatResolutionIndex } from '../../../src/kernel/identity.js';
import type { EventDeckDef } from '../../../src/kernel/types-events.js';

const phaseId = asPhaseId('main');

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
  ],
};

function createDef(): GameDef {
  return {
    metadata: { id: 'surface-resolution-dispatch-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [{ name: 'score', type: 'int', init: 5, min: -10, max: 10 }],
    perPlayerVars: [{ name: 'tempo', type: 'int', init: 0, min: 0, max: 10 }],
    zones: [
      { id: asZoneId('event-draw:none'), owner: 'none', visibility: 'public', ordering: 'stack' },
      { id: asZoneId('event-discard:none'), owner: 'none', visibility: 'public', ordering: 'stack' },
    ],
    derivedMetrics: [],
    seats: [{ id: 'us' }, { id: 'arvn' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: phaseId }] },
    agents: {
      schemaVersion: 2,
      catalogFingerprint: 'surface-resolution-dispatch-test',
      surfaceVisibility: {
        globalVars: {},
        globalMarkers: {},
        perPlayerVars: {},
        derivedMetrics: {},
        victory: {
          currentMargin: {
            current: 'public',
            preview: { visibility: 'public', allowWhenHiddenSampling: true },
          },
          currentRank: {
            current: 'public',
            preview: { visibility: 'public', allowWhenHiddenSampling: true },
          },
        },
        activeCardIdentity: {
          current: 'public',
          preview: { visibility: 'public', allowWhenHiddenSampling: true },
        },
        activeCardTag: {
          current: 'public',
          preview: { visibility: 'public', allowWhenHiddenSampling: true },
        },
        activeCardMetadata: {
          current: 'public',
          preview: { visibility: 'public', allowWhenHiddenSampling: true },
        },
        activeCardAnnotation: {
          current: 'public',
          preview: { visibility: 'public', allowWhenHiddenSampling: true },
        },
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
      profiles: {},
      bindingsBySeat: {},
    },
    actions: [],
    triggers: [],
    terminal: {
      conditions: [],
      margins: [
        { seat: 'us', value: { _t: 2 as const, ref: 'gvar', var: 'score' } },
        { seat: 'arvn', value: 0 },
      ],
    },
    eventDecks: [testEventDeck],
    cardMetadataIndex: {
      entries: {
        'card-1': {
          deckId: 'main-deck',
          cardId: 'card-1',
          tags: ['pivotal', 'us-favorable'],
          metadata: { period: 'early', vcFavorability: 3 },
        },
      },
    },
    cardAnnotationIndex: {
      entries: {
        'card-1': {
          cardId: 'card-1',
          shaded: {
            tokenPlacements: { us: 4, arvn: 1 },
            tokenRemovals: {},
            tokenCreations: {},
            tokenDestructions: {},
            markerModifications: 2,
            globalMarkerModifications: 1,
            globalVarModifications: 0,
            perPlayerVarModifications: 0,
            varTransfers: 0,
            drawCount: 0,
            shuffleCount: 0,
            grantsOperation: true,
            grantOperationSeats: ['us'],
            hasEligibilityOverride: false,
            hasLastingEffect: false,
            hasBranches: false,
            hasPhaseControl: false,
            hasDecisionPoints: false,
            effectNodeCount: 3,
          },
        },
      },
    },
    globalMarkerLattices: [
      {
        id: 'cap_boobyTraps',
        states: ['inactive', 'shaded', 'unshaded'],
        defaultState: 'inactive',
      },
    ],
  };
}

function createState(def: GameDef): GameState {
  const baseState = initialState(def, 1, 2).state;
  return {
    ...baseState,
    activePlayer: asPlayerId(1),
    globalVars: { ...baseState.globalVars, score: 5 },
    perPlayerVars: [
      { tempo: 2 },
      { tempo: 7 },
    ],
    globalMarkers: { cap_boobyTraps: 'shaded' },
    zones: {
      ...baseState.zones,
      'event-discard:none': [{ id: 1 as never, type: 'event-card', props: { cardId: 'card-1' } }],
    },
  };
}

function createContext(def: GameDef, state: GameState): SurfaceResolutionContext {
  return {
    def,
    seatResolutionIndex: buildSeatResolutionIndex(def, state.playerCount),
    resolveDerivedMetric: (_state, metricId) => {
      if (metricId !== 'aggro') {
        throw new Error(`Unexpected derived metric "${metricId}"`);
      }
      return 17;
    },
    resolveVictorySurface: (valueState) => buildPolicyVictorySurface(def, valueState),
  };
}

describe('resolveSurfaceRefValue', () => {
  const def = createDef();
  const state = createState(def);
  const playerId = asPlayerId(0);
  const context = createContext(def, state);

  it('resolves derivedMetric, globalVar, and perPlayerVar families', () => {
    assert.equal(
      resolveSurfaceRefValue(state, { family: 'derivedMetric', id: 'aggro' }, 'us', playerId, context),
      17,
    );
    assert.equal(
      resolveSurfaceRefValue(state, { family: 'globalVar', id: 'score' }, 'us', playerId, context),
      5,
    );
    assert.equal(
      resolveSurfaceRefValue(
        state,
        { family: 'perPlayerVar', id: 'tempo', selector: { kind: 'player', player: 'active' } },
        'us',
        playerId,
        context,
      ),
      7,
    );
  });

  it('resolves victory surfaces and active-card annotation values', () => {
    assert.equal(
      resolveSurfaceRefValue(
        state,
        { family: 'victoryCurrentMargin', id: 'currentMargin', selector: { kind: 'role', seatToken: 'us' } },
        'us',
        playerId,
        context,
      ),
      5,
    );
    assert.equal(
      resolveSurfaceRefValue(
        state,
        { family: 'victoryCurrentRank', id: 'currentRank', selector: { kind: 'role', seatToken: 'us' } },
        'us',
        playerId,
        context,
      ),
      1,
    );
    assert.equal(
      resolveSurfaceRefValue(
        state,
        { family: 'activeCardAnnotation', id: 'shaded.tokenPlacements.us', selector: { kind: 'role', seatToken: 'us' } },
        'us',
        playerId,
        context,
      ),
      4,
    );
  });

  it('resolves activeCard identity, tag, and metadata families with raw values', () => {
    assert.equal(
      resolveSurfaceRefValue(state, { family: 'activeCardIdentity', id: 'id' }, 'us', playerId, context),
      'card-1',
    );
    assert.equal(
      resolveSurfaceRefValue(state, { family: 'activeCardTag', id: 'pivotal' }, 'us', playerId, context),
      true,
    );
    assert.equal(
      resolveSurfaceRefValue(state, { family: 'activeCardMetadata', id: 'period' }, 'us', playerId, context),
      'early',
    );
  });

  it('resolves globalMarker from state and falls back to lattice default', () => {
    assert.equal(
      resolveSurfaceRefValue(state, { family: 'globalMarker', id: 'cap_boobyTraps' }, 'us', playerId, context),
      'shaded',
    );

    const unsetMarkerState: GameState = {
      ...state,
      globalMarkers: {},
    };
    assert.equal(
      resolveSurfaceRefValue(
        unsetMarkerState,
        { family: 'globalMarker', id: 'cap_boobyTraps' },
        'us',
        playerId,
        context,
      ),
      'inactive',
    );
  });
});
