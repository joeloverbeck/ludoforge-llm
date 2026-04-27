// @test-class: architectural-invariant
// @witness: POLPREVDRIVE-002, POLPREVDRIVE-007
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createDraftTokenStateIndex,
  getTokenStateIndex,
  type TokenStateIndexEntry,
  __internal_for_tests,
} from '../../src/kernel/token-state-index.js';
import { applyPublishedDecisionFromCanonicalState } from '../../src/kernel/microturn/apply.js';
import { publishMicroturnGreedyChooseOne } from '../../src/kernel/microturn/publish.js';
import {
  applyEffects,
  asPlayerId,
  asTokenId,
  asZoneId,
  buildAdjacencyGraph,
  createCollector,
  createRng,
  type EffectAST,
  type EffectContext,
  type GameDef,
  type GameState,
  type Token,
} from '../../src/kernel/index.js';
import { makeExecutionEffectContext } from '../helpers/effect-context-test-helpers.js';
import { eff } from '../helpers/effect-tag-helper.js';
import {
  PREVIEW_DEPTH_CAP,
  collectChooseOneDriveFixtures,
} from '../helpers/drive-parity-helpers.js';
import {
  createFitlRuntime,
  FITL_PLAYER_COUNT,
} from '../helpers/zobrist-incremental-property-helpers.js';

describe('POLPREVDRIVE-002 draft token-state index', () => {
  it('matches a fresh rebuild after each greedy drive kernel mutation', () => {
    const { def, runtime } = createFitlRuntime();
    const fixtures = collectChooseOneDriveFixtures(def, runtime, {
      seed: 1,
      playerCount: FITL_PLAYER_COUNT,
      count: 3,
      expectedMinDepth: 2,
      maxSteps: 24,
    });

    for (const fixture of fixtures) {
      const draftIndex = createDraftTokenStateIndex(fixture.state);
      assertIndexMatchesFreshRebuild(`${fixture.label}: initial`, fixture.state, draftIndex.read());

      let state = fixture.state;
      let depth = 0;
      while (depth < PREVIEW_DEPTH_CAP) {
        const top = state.decisionStack?.at(-1);
        if (
          top === undefined
          || top.context.kind !== 'chooseOne'
          || top.context.seatId !== fixture.origin.seatId
          || top.turnId !== fixture.origin.turnId
        ) {
          break;
        }

        const greedy = publishMicroturnGreedyChooseOne(def, state, runtime);
        assert.notEqual(greedy, null, `${fixture.label}: expected greedy chooseOne decision at depth ${depth}`);
        const prevState = state;
        state = applyPublishedDecisionFromCanonicalState(
          def,
          prevState,
          greedy!.microturn,
          greedy!.decision,
          { advanceToDecisionPoint: true },
          runtime,
        ).state;
        draftIndex.applyZoneDelta(prevState.zones, state.zones);
        draftIndex.attachAsCanonical(state);

        assertIndexMatchesFreshRebuild(`${fixture.label}: canonical cache at depth ${depth + 1}`, state, getTokenStateIndex(state));
        assertIndexMatchesFreshRebuild(`${fixture.label}: depth ${depth + 1}`, state, draftIndex.read());
        depth += 1;
      }

      assert.ok(depth >= fixture.expectedMinDepth, `${fixture.label}: expected depth >= ${fixture.expectedMinDepth}, got ${depth}`);
    }
  });

  it('preserves duplicate-token occurrence semantics across changed zones', () => {
    const state = makeTokenState({
      'hand:0': [{ id: 'shared-token', type: 'card', props: {} }],
      'bench:1': [{ id: 'other-token', type: 'card', props: {} }],
      discard: [{ id: 'shared-token', type: 'card', props: {} }],
    } as unknown as GameState['zones']);
    const nextState = {
      ...state,
      zones: {
        ...state.zones,
        'hand:0': [],
        'bench:1': [
          { id: 'other-token', type: 'card', props: {} },
          { id: 'shared-token', type: 'card', props: {} },
        ],
      },
    } as unknown as GameState;

    const draftIndex = createDraftTokenStateIndex(state);
    draftIndex.applyZoneDelta(state.zones, nextState.zones);

    assertIndexMatchesFreshRebuild('duplicate move', nextState, draftIndex.read());
  });
});

describe('POLPREVDRIVE-007 residual token-state index cache', () => {
  it('preserves a cached index across prop-only token mutations', () => {
    const ctx = makeEffectScopedIndexContext();
    assertIndexMatchesFreshRebuild('initial cached state', ctx.state, getTokenStateIndex(ctx.state));
    __internal_for_tests.resetBuildTokenStateIndexCount();

    const result = applyEffects([
      bindActiveCount('$before'),
      eff({ setTokenProp: { token: '$unit', prop: 'status', value: 'inactive' } }),
      eff({ setTokenProp: { token: '$unit', prop: 'status', value: 'inactive' } }),
      bindActiveCount('$after'),
    ], ctx);

    assert.equal(result.bindings.$before, 2);
    assert.equal(result.bindings.$after, 1);
    assert.equal(result.state.zones['battlefield:none']?.[0]?.props.status, 'inactive');
    assert.equal(
      __internal_for_tests.getBuildTokenStateIndexCount(),
      0,
      'outer mutable effect scopes should inherit and preserve the cached token-state index',
    );
    assertIndexMatchesFreshRebuild('effect-scoped final state', result.state, getTokenStateIndex(result.state));
  });
});

function assertIndexMatchesFreshRebuild(
  label: string,
  state: GameState,
  actual: ReadonlyMap<string, TokenStateIndexEntry>,
): void {
  const expected = __internal_for_tests.buildTokenStateIndex(state);
  assert.deepEqual(toSortedEntries(actual), toSortedEntries(expected), label);
}

function toSortedEntries(index: ReadonlyMap<string, TokenStateIndexEntry>): readonly (readonly [string, TokenStateIndexEntry])[] {
  return [...index.entries()].sort(([left], [right]) => left.localeCompare(right));
}

function makeTokenState(zones: GameState['zones']): GameState {
  return {
    globalVars: {},
    perPlayerVars: {},
    zoneVars: {},
    playerCount: 2,
    zones,
    nextTokenOrdinal: 0,
    currentPhase: 'main',
    activePlayer: 0,
    turnCount: 1,
    rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [1n, 2n] },
    stateHash: 0n,
    _runningHash: 0n,
    actionUsage: {},
    turnOrderState: { type: 'roundRobin' },
    markers: {},
    reveals: undefined,
    globalMarkers: undefined,
    activeLastingEffects: undefined,
    interruptPhaseStack: undefined,
  } as unknown as GameState;
}

function bindActiveCount(bind: string): EffectAST {
  return eff({
    bindValue: {
      bind,
      value: {
        _t: 5 as const,
        aggregate: {
          op: 'count',
          query: {
            query: 'tokensInZone',
            zone: 'battlefield:none',
            filter: { op: 'and', args: [{ prop: 'status', op: 'eq', value: 'active' }] },
          },
        },
      },
    },
  });
}

function makeEffectScopedIndexContext(): EffectContext {
  const def: GameDef = {
    metadata: { id: 'effect-scoped-token-state-index-test', players: { min: 1, max: 1 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [
      { id: asZoneId('battlefield:none'), owner: 'none', visibility: 'public', ordering: 'stack' },
    ],
    tokenTypes: [{ id: 'unit', props: { status: 'string' } }],
    setup: [],
    turnStructure: { phases: [] },
    actions: [],
    triggers: [],
    terminal: { conditions: [] },
  };
  const tokens: readonly Token[] = [
    { id: asTokenId('u1'), type: 'unit', props: { status: 'active' } },
    { id: asTokenId('u2'), type: 'unit', props: { status: 'active' } },
  ];
  const state = makeTokenState({ 'battlefield:none': tokens });

  return makeExecutionEffectContext({
    def,
    adjacencyGraph: buildAdjacencyGraph(def.zones),
    state,
    rng: createRng(7n),
    activePlayer: asPlayerId(0),
    actorPlayer: asPlayerId(0),
    bindings: { $unit: 'u1' },
    moveParams: {},
    collector: createCollector(),
  });
}
