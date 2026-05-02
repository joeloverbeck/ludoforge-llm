// @test-class: architectural-invariant
// @witness: POLPREVDRIVE-004
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { applyPreviewDriveGreedyChooseOne } from '../../src/kernel/microturn/drive.js';
import { applyPublishedDecisionFromCanonicalState } from '../../src/kernel/microturn/apply.js';
import { publishMicroturnGreedyChooseOne } from '../../src/kernel/microturn/publish.js';
import { createDraftTokenStateIndex } from '../../src/kernel/token-state-index.js';
import { createResolveRefCache, resolveRef, resolveRefMemoised } from '../../src/kernel/resolve-ref.js';
import { createEvalContext, createEvalRuntimeResources } from '../../src/kernel/eval-context.js';
import { buildAdjacencyGraph } from '../../src/kernel/spatial.js';
import type { GameDef, GameState } from '../../src/kernel/index.js';
import { asPlayerId } from '../../src/kernel/branded.js';
import type { Reference } from '../../src/kernel/types-ast.js';
import {
  PREVIEW_DEPTH_CAP,
  collectChooseOneDriveFixtures,
} from '../helpers/drive-parity-helpers.js';
import {
  createFitlRuntime,
  FITL_PLAYER_COUNT,
} from '../helpers/zobrist-incremental-property-helpers.js';

/**
 * F8 oracle: `resolveRefMemoised(ref, ctx, freshCache)` must produce results
 * deep-equal to direct `resolveRef(ref, ctx)` for any well-formed input.
 *
 * The drive-scoped cache (POLPREVDRIVE-004) is keyed on every input that
 * affects output: ref shape, bindings reference identity, free-operation
 * overlay identity, `state.stateHash`, and `activePlayer`/`actorPlayer`.
 * Mutation hook in `evalAggregate` invalidates entries on
 * `itemBindings`-content changes. These tests prove the contract under
 * the same drive shapes the bot actually exercises in production.
 */
describe('POLPREVDRIVE-004 resolveRefMemoised — F8 oracle', () => {
  it('returns deep-equal output to direct resolveRef across a synthetic ref corpus', () => {
    const { def, runtime } = createFitlRuntime();
    const fixtures = collectChooseOneDriveFixtures(def, runtime, {
      seed: 1,
      playerCount: FITL_PLAYER_COUNT,
      count: 3,
      expectedMinDepth: 2,
      maxSteps: 24,
    });

    for (const fixture of fixtures) {
      const ctx = createEvalContext({
        def,
        adjacencyGraph: buildAdjacencyGraph(def.zones),
        state: fixture.state,
        activePlayer: asPlayerId(0),
        actorPlayer: asPlayerId(0),
        bindings: {},
        resources: createEvalRuntimeResources(),
        runtimeTableIndex: runtime.runtimeTableIndex,
      });

      const cache = createResolveRefCache();
      const samples: readonly Reference[] = [
        { ref: 'activePlayer' },
        { ref: 'activeSeat' },
      ];

      for (const ref of samples) {
        // First call: cache miss → fall through to resolveRef.
        const direct = resolveRef(ref, ctx);
        const cached = resolveRefMemoised(ref, ctx, cache);
        assert.deepEqual(cached, direct, `${fixture.label}: first lookup of ${JSON.stringify(ref)} differs`);
        // Second call: cache hit → must still match.
        const hit = resolveRefMemoised(ref, ctx, cache);
        assert.deepEqual(hit, direct, `${fixture.label}: cached hit for ${JSON.stringify(ref)} differs`);
      }
    }
  });

  it('produces byte-identical drive results with and without the cache', () => {
    const { def, runtime } = createFitlRuntime();
    const fixtures = collectChooseOneDriveFixtures(def, runtime, {
      seed: 1,
      playerCount: FITL_PLAYER_COUNT,
      count: 4,
      expectedMinDepth: 2,
      maxSteps: 24,
    });

    for (const fixture of fixtures) {
      const cache = createResolveRefCache();
      const cachedResult = applyPreviewDriveGreedyChooseOne(
        def,
        fixture.state,
        fixture.origin,
        PREVIEW_DEPTH_CAP,
        runtime,
        undefined,
        cache,
      );
      const directResult = applyPreviewDriveGreedyChooseOne(
        def,
        fixture.state,
        fixture.origin,
        PREVIEW_DEPTH_CAP,
        runtime,
      );

      assert.equal(cachedResult.kind, directResult.kind, `${fixture.label}: kind drift`);
      assert.equal(cachedResult.depth, directResult.depth, `${fixture.label}: depth drift`);
      assert.equal(
        cachedResult.state.stateHash,
        directResult.state.stateHash,
        `${fixture.label}: stateHash drift`,
      );
    }
  });

  it('produces byte-identical replay results across cached/uncached publishedDecision calls', () => {
    const { def, runtime } = createFitlRuntime();
    const fixtures = collectChooseOneDriveFixtures(def, runtime, {
      seed: 1,
      playerCount: FITL_PLAYER_COUNT,
      count: 3,
      expectedMinDepth: 2,
      maxSteps: 24,
    });

    for (const fixture of fixtures) {
      const cachedFinal = replayWithCache(def, fixture.state, fixture.origin, runtime, true);
      const directFinal = replayWithCache(def, fixture.state, fixture.origin, runtime, false);
      assert.equal(
        cachedFinal.stateHash,
        directFinal.stateHash,
        `${fixture.label}: replay stateHash drift across cache toggle`,
      );
    }
  });
});

function replayWithCache(
  def: GameDef,
  initial: GameState,
  origin: { readonly seatId: string; readonly turnId: number },
  runtime: ReturnType<typeof createFitlRuntime>['runtime'],
  withCache: boolean,
): GameState {
  const cache = withCache ? createResolveRefCache() : undefined;
  const draftIndex = createDraftTokenStateIndex(initial);
  let state = initial;
  let depth = 0;

  while (depth < PREVIEW_DEPTH_CAP) {
    cache?.clear();
    const top = state.decisionStack?.at(-1);
    if (
      top === undefined
      || top.context.kind !== 'chooseOne'
      || top.context.seatId !== origin.seatId
      || top.turnId !== origin.turnId
    ) {
      break;
    }

    const greedy = publishMicroturnGreedyChooseOne(def, state, runtime);
    if (greedy === null) {
      break;
    }
    const prev = state;
    state = applyPublishedDecisionFromCanonicalState(
      def,
      prev,
      greedy.microturn,
      greedy.decision,
      { advanceToDecisionPoint: true },
      runtime,
      cache,
    ).state;
    draftIndex.applyZoneDelta(prev.zones, state.zones);
    draftIndex.attachAsCanonical(state);
    depth += 1;
  }
  return state;
}
