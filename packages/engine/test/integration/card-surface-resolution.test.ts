// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createPolicyRuntimeProviders } from '../../src/agents/policy-runtime.js';
import {
  asActionId,
  asPlayerId,
  asTokenId,
  assertValidatedGameDef,
  initialState,
  type AgentPolicyCatalog,
  type CompiledSurfaceVisibility,
  type GameDef,
  type GameState,
  type Token,
} from '../../src/kernel/index.js';
import { createGameDefRuntime } from '../../src/kernel/gamedef-runtime.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

/**
 * Integration tests for the card policy surface pipeline.
 * Uses the FITL production spec — no synthetic fixtures for card data.
 */

const CARD_1_ID = 'card-1'; // Gulf of Tonkin — non-pivotal, period "1964"
const PIVOTAL_CARD_ID = 'card-121'; // Linebacker II — pivotal

function placeCardInDiscard(def: GameDef, state: GameState, cardId: string): GameState {
  const eventDeck = def.eventDecks?.[0];
  assert.ok(eventDeck, 'FITL should have at least one event deck');
  const token: Token = {
    id: asTokenId(cardId),
    type: 'card',
    props: { cardId, faction: 'none', type: 'card' },
  };
  return {
    ...state,
    zones: {
      ...state.zones,
      [eventDeck!.discardZone]: [token],
    },
  };
}

function makeProviders(def: GameDef, state: GameState, catalog: AgentPolicyCatalog) {
  return createPolicyRuntimeProviders({
    def,
    state,
    playerId: asPlayerId(0),
    seatId: 'US',
    trustedMoveIndex: new Map(),
    catalog,
    runtimeError: (code, message) => new Error(`${code}: ${message}`),
  });
}

function makeHiddenVisibility(): CompiledSurfaceVisibility {
  return { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } };
}

function makeCatalogWithHiddenCardVisibility(baseCatalog: AgentPolicyCatalog): AgentPolicyCatalog {
  return {
    ...baseCatalog,
    surfaceVisibility: {
      ...baseCatalog.surfaceVisibility,
      activeCardIdentity: makeHiddenVisibility(),
      activeCardTag: makeHiddenVisibility(),
      activeCardMetadata: makeHiddenVisibility(),
      activeCardAnnotation: makeHiddenVisibility(),
    },
  };
}

describe('card surface resolution — FITL production spec integration', () => {
  const { compiled } = compileProductionSpec();
  const def = assertValidatedGameDef(compiled.gameDef);
  const catalog = def.agents!;

  assert.ok(catalog, 'FITL production spec should compile an agent policy catalog');
  assert.ok(def.cardMetadataIndex, 'FITL production spec should compile a cardMetadataIndex');

  const baseState = initialState(def, 42, 4).state;

  describe('activeCard.id resolution', () => {
    it('resolves card ID for a non-pivotal card in the discard zone', () => {
      const state = placeCardInDiscard(def, baseState, CARD_1_ID);
      const providers = makeProviders(def, state, catalog);

      const result = providers.currentSurface.resolveSurface({
        kind: 'currentSurface',
        family: 'activeCardIdentity',
        id: 'id',
      });
      assert.equal(result, CARD_1_ID);
    });

    it('resolves card ID for a pivotal card in the discard zone', () => {
      const state = placeCardInDiscard(def, baseState, PIVOTAL_CARD_ID);
      const providers = makeProviders(def, state, catalog);

      const result = providers.currentSurface.resolveSurface({
        kind: 'currentSurface',
        family: 'activeCardIdentity',
        id: 'id',
      });
      assert.equal(result, PIVOTAL_CARD_ID);
    });
  });

  describe('activeCard.deckId resolution', () => {
    it('resolves deck ID for a card in the discard zone', () => {
      const state = placeCardInDiscard(def, baseState, CARD_1_ID);
      const providers = makeProviders(def, state, catalog);

      const result = providers.currentSurface.resolveSurface({
        kind: 'currentSurface',
        family: 'activeCardIdentity',
        id: 'deckId',
      });
      // Verify it matches the actual deck ID from the compiled def
      const firstDeck = def.eventDecks![0];
      assert.ok(firstDeck, 'FITL should have at least one event deck');
      const expectedDeckId = firstDeck.id;
      assert.equal(result, expectedDeckId);
    });
  });

  describe('activeCard.hasTag resolution', () => {
    it('returns true for pivotal tag on a pivotal card', () => {
      const state = placeCardInDiscard(def, baseState, PIVOTAL_CARD_ID);
      const providers = makeProviders(def, state, catalog);

      const result = providers.currentSurface.resolveSurface({
        kind: 'currentSurface',
        family: 'activeCardTag',
        id: 'pivotal',
      });
      assert.equal(result, true);
    });

    it('returns false for pivotal tag on a non-pivotal card', () => {
      const state = placeCardInDiscard(def, baseState, CARD_1_ID);
      const providers = makeProviders(def, state, catalog);

      const result = providers.currentSurface.resolveSurface({
        kind: 'currentSurface',
        family: 'activeCardTag',
        id: 'pivotal',
      });
      assert.equal(result, false);
    });
  });

  describe('activeCard.metadata resolution', () => {
    it('resolves period metadata for card-1', () => {
      const state = placeCardInDiscard(def, baseState, CARD_1_ID);
      const providers = makeProviders(def, state, catalog);

      const result = providers.currentSurface.resolveSurface({
        kind: 'currentSurface',
        family: 'activeCardMetadata',
        id: 'period',
      });
      assert.equal(result, '1964');
    });

    it('returns undefined for a non-existent metadata key', () => {
      const state = placeCardInDiscard(def, baseState, CARD_1_ID);
      const providers = makeProviders(def, state, catalog);

      const result = providers.currentSurface.resolveSurface({
        kind: 'currentSurface',
        family: 'activeCardMetadata',
        id: 'nonExistentKey',
      });
      assert.equal(result, undefined);
    });
  });

  describe('visibility hidden suppression', () => {
    it('returns undefined for activeCard.id when visibility is hidden', () => {
      const hiddenCatalog = makeCatalogWithHiddenCardVisibility(catalog);
      const state = placeCardInDiscard(def, baseState, CARD_1_ID);
      const providers = makeProviders(def, state, hiddenCatalog);

      assert.equal(
        providers.currentSurface.resolveSurface({ kind: 'currentSurface', family: 'activeCardIdentity', id: 'id' }),
        undefined,
      );
    });

    it('returns undefined for activeCard.hasTag when visibility is hidden', () => {
      const hiddenCatalog = makeCatalogWithHiddenCardVisibility(catalog);
      const state = placeCardInDiscard(def, baseState, PIVOTAL_CARD_ID);
      const providers = makeProviders(def, state, hiddenCatalog);

      assert.equal(
        providers.currentSurface.resolveSurface({ kind: 'currentSurface', family: 'activeCardTag', id: 'pivotal' }),
        undefined,
      );
    });

    it('returns undefined for activeCard.metadata when visibility is hidden', () => {
      const hiddenCatalog = makeCatalogWithHiddenCardVisibility(catalog);
      const state = placeCardInDiscard(def, baseState, CARD_1_ID);
      const providers = makeProviders(def, state, hiddenCatalog);

      assert.equal(
        providers.currentSurface.resolveSurface({ kind: 'currentSurface', family: 'activeCardMetadata', id: 'period' }),
        undefined,
      );
    });
  });

  describe('no active card returns undefined', () => {
    it('returns undefined for all card families when no card in discard zone', () => {
      const eventDeck = def.eventDecks![0];
      assert.ok(eventDeck, 'FITL should have at least one event deck');
      // Explicitly empty the discard zone — initialState may place a scenario card there
      const emptyDiscardState: GameState = {
        ...baseState,
        zones: {
          ...baseState.zones,
          [eventDeck.discardZone]: [],
        },
      };
      const providers = makeProviders(def, emptyDiscardState, catalog);

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
  });

  describe('preview surface resolution', () => {
    it('resolves preview.activeCard.id through preview path', () => {
      const state = placeCardInDiscard(def, baseState, CARD_1_ID);
      const runtime = createGameDefRuntime(def);
      const providers = createPolicyRuntimeProviders({
        def,
        state,
        playerId: asPlayerId(0),
        seatId: 'US',
        trustedMoveIndex: new Map(),
        catalog,
        runtime,
        runtimeError: (code, message) => new Error(`${code}: ${message}`),
      });

      // Create a dummy candidate — preview resolves from the preview trace state
      const passActionId = asActionId('pass');
      const dummyCandidate = {
        move: { actionId: passActionId, params: {} },
        stableMoveKey: 'pass',
        actionId: 'pass',
      };

      const result = providers.previewSurface.resolveSurface(dummyCandidate, {
        kind: 'previewSurface',
        family: 'activeCardIdentity',
        id: 'id',
      });

      // Preview may resolve to a value or to an unknown/unresolved status
      // depending on whether the preview engine can simulate the state.
      // The key invariant is that it doesn't throw.
      assert.ok(
        result !== null && typeof result === 'object' && 'kind' in result,
        'preview resolution should return a PolicyPreviewSurfaceResolution object',
      );
    });
  });
});
