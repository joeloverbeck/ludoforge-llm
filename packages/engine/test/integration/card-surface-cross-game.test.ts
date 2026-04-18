// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createPolicyRuntimeProviders } from '../../src/agents/policy-runtime.js';
import {
  asPlayerId,
  assertValidatedGameDef,
  initialState,
} from '../../src/kernel/index.js';
import { compileTexasProductionSpec } from '../helpers/production-spec-helpers.js';

/**
 * Cross-game graceful degradation test: Texas Hold'em has no event decks,
 * so all activeCard.* refs must return undefined without errors.
 */
describe('card surface cross-game — Texas Hold\'em no-deck graceful degradation', () => {
  const { compiled } = compileTexasProductionSpec();
  const def = assertValidatedGameDef(compiled.gameDef);

  it('cardMetadataIndex is undefined for a game without event decks', () => {
    assert.equal(def.cardMetadataIndex, undefined);
  });

  it('all activeCard.* refs return undefined without errors', () => {
    const catalog = def.agents;
    assert.ok(catalog, 'Texas Hold\'em should compile an agent policy catalog');

    const state = initialState(def, 1, 2).state;
    const providers = createPolicyRuntimeProviders({
      def,
      state,
      playerId: asPlayerId(0),
      seatId: catalog.surfaceVisibility ? Object.keys(catalog.bindingsBySeat)[0] ?? 'player-0' : 'player-0',
      trustedMoveIndex: new Map(),
      catalog,
      runtimeError: (code, message) => new Error(`${code}: ${message}`),
    });

    // All three card families should return undefined — no event decks means no active card
    assert.equal(
      providers.currentSurface.resolveSurface({ kind: 'currentSurface', family: 'activeCardIdentity', id: 'id' }),
      undefined,
    );
    assert.equal(
      providers.currentSurface.resolveSurface({ kind: 'currentSurface', family: 'activeCardIdentity', id: 'deckId' }),
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
