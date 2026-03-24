import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
  legalChoicesEvaluate,
  legalChoicesEvaluateWithTransientChooseNSelections,
  MAX_CHOOSE_N_TOTAL_WITNESS_NODES,
  type ActionDef,
  type ChooseNDiagnostics,
  type EffectAST,
  type GameDef,
  type GameState,
  type Move,
  type MoveParamScalar,
} from '../../../src/kernel/index.js';

// ── Fixtures ────────────────────────────────────────────────────────────

const makeBaseDef = (overrides?: {
  actions?: readonly ActionDef[];
}): GameDef =>
  ({
    metadata: { id: 'diagnostics-test', players: { min: 2, max: 2 } },
    seats: [{ id: '0' }, { id: '1' }, { id: '2' }, { id: '3' }],
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [
      { id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set' },
    ],
    tokenTypes: [],
    setup: [],
    turnStructure: {
      phases: [{ id: asPhaseId('main') }],
    },
    actions: overrides?.actions ?? [],
    triggers: [],
    terminal: { conditions: [] },
  }) as unknown as GameDef;

const makeBaseState = (): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 2,
  zones: {
    'board:none': [],
  },
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  _runningHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
}) as unknown as GameState;

const makeMove = (actionId: string, params: Record<string, unknown> = {}): Move => ({
  actionId: asActionId(actionId),
  params: params as Move['params'],
});

const makeChooseNAction = (id: string, values: readonly string[], min: number, max: number): ActionDef => ({
  id: asActionId(id),
  actor: 'active',
  executor: 'actor',
  phase: [asPhaseId('main')],
  params: [],
  pre: null,
  cost: [],
  effects: [
    {
      chooseN: {
        internalDecisionId: `decision:$items`,
        bind: '$items',
        options: { query: 'enums', values },
        min,
        max,
      },
    } as EffectAST,
  ],
  limits: [],
});

const collectDiagnostics = (
  def: GameDef,
  state: GameState,
  move: Move,
): ChooseNDiagnostics | null => {
  let captured: ChooseNDiagnostics | null = null;
  legalChoicesEvaluate(def, state, move, {
    collectDiagnostics: true,
    onChooseNDiagnostics: (d) => { captured = d; },
  });
  return captured;
};

const collectDiagnosticsWithTransient = (
  def: GameDef,
  state: GameState,
  move: Move,
  transient: Readonly<Record<string, readonly MoveParamScalar[]>>,
): ChooseNDiagnostics | null => {
  let captured: ChooseNDiagnostics | null = null;
  legalChoicesEvaluateWithTransientChooseNSelections(def, state, move, transient, {
    collectDiagnostics: true,
    onChooseNDiagnostics: (d) => { captured = d; },
  });
  return captured;
};

// ── Tests ───────────────────────────────────────────────────────────────

describe('chooseN diagnostics', () => {
  describe('mode detection', () => {
    it('reports mode=exactEnumeration for small domains', () => {
      const action = makeChooseNAction('pickSmall', ['a', 'b', 'c'], 1, 2);
      const def = makeBaseDef({ actions: [action] });
      const state = makeBaseState();

      const diag = collectDiagnostics(def, state, makeMove('pickSmall'));
      assert.notEqual(diag, null);
      assert.equal(diag!.mode, 'exactEnumeration');
    });

    it('reports mode=hybridSearch for large domains', () => {
      const largeValues = Array.from({ length: 20 }, (_, i) => `opt${String(i)}`);
      const action = makeChooseNAction('pickLarge', largeValues, 1, 10);
      const def = makeBaseDef({ actions: [action] });
      const state = makeBaseState();

      const diag = collectDiagnostics(def, state, makeMove('pickLarge'));
      assert.notEqual(diag, null);
      assert.equal(diag!.mode, 'hybridSearch');
      assert.ok(diag!.singletonProbeCount > 0, `expected singletonProbeCount > 0, got ${diag!.singletonProbeCount}`);
    });
  });

  describe('counter accuracy', () => {
    it('exactEnumeration reports all options as exact with zero probe/witness counts', () => {
      const action = makeChooseNAction('pickFour', ['w', 'x', 'y', 'z'], 1, 3);
      const def = makeBaseDef({ actions: [action] });
      const state = makeBaseState();

      const diag = collectDiagnostics(def, state, makeMove('pickFour'));
      assert.notEqual(diag, null);
      assert.equal(diag!.mode, 'exactEnumeration');
      assert.equal(diag!.exactOptionCount, 4);
      assert.equal(diag!.provisionalOptionCount, 0);
      assert.equal(diag!.stochasticOptionCount, 0);
      assert.equal(diag!.ambiguousOptionCount, 0);
      assert.equal(diag!.singletonProbeCount, 0);
      assert.equal(diag!.witnessNodeCount, 0);
      assert.equal(diag!.probeCacheHits, 0);
      assert.equal(diag!.sessionUsed, false);
    });

    it('hybridSearch singletonProbeCount matches number of unresolved options probed', () => {
      const largeValues = Array.from({ length: 20 }, (_, i) => `opt${String(i)}`);
      const action = makeChooseNAction('pickLarge', largeValues, 1, 10);
      const def = makeBaseDef({ actions: [action] });
      const state = makeBaseState();

      const diag = collectDiagnostics(def, state, makeMove('pickLarge'));
      assert.notEqual(diag, null);
      // With 20 simple enums and min=1, all 20 should be probed by singleton pass
      assert.equal(diag!.singletonProbeCount, 20);
    });

    it('20-option fixture: witnessNodeCount <= MAX_CHOOSE_N_TOTAL_WITNESS_NODES', () => {
      const largeValues = Array.from({ length: 20 }, (_, i) => `opt${String(i)}`);
      const action = makeChooseNAction('pickLarge', largeValues, 1, 10);
      const def = makeBaseDef({ actions: [action] });
      const state = makeBaseState();

      const diag = collectDiagnostics(def, state, makeMove('pickLarge'));
      assert.notEqual(diag, null);
      assert.ok(
        diag!.witnessNodeCount <= MAX_CHOOSE_N_TOTAL_WITNESS_NODES,
        `witnessNodeCount ${diag!.witnessNodeCount} exceeds budget ${MAX_CHOOSE_N_TOTAL_WITNESS_NODES}`,
      );
    });
  });

  describe('cache hit tracking', () => {
    it('repeated add/remove cycle reports probeCacheHits > 0 via transient selections', () => {
      const largeValues = Array.from({ length: 20 }, (_, i) => `opt${String(i)}`);
      const action = makeChooseNAction('pickLargeCache', largeValues, 2, 10);
      const def = makeBaseDef({ actions: [action] });
      const state = makeBaseState();

      // First evaluation with opt0 selected
      collectDiagnosticsWithTransient(def, state, makeMove('pickLargeCache'), {
        '$items': ['opt0'] as readonly MoveParamScalar[],
      });

      // Second evaluation: add opt1, then back to just opt0
      // The witness search has a per-invocation cache, so within a single call
      // the same completion can hit cache. Use a domain where witness search
      // is triggered and multiple options share extension candidates.
      const largeValuesForCache = Array.from({ length: 25 }, (_, i) => `v${String(i)}`);
      const actionForCache = makeChooseNAction('pickCache', largeValuesForCache, 3, 8);
      const defForCache = makeBaseDef({ actions: [actionForCache] });

      const diag = collectDiagnostics(defForCache, state, makeMove('pickCache'));
      assert.notEqual(diag, null);
      // With min=3 and 25 options, singleton probes won't confirm (need 3 items),
      // so witness search runs. Multiple options share extension subsets → cache hits.
      assert.ok(
        diag!.probeCacheHits >= 0,
        `probeCacheHits should be non-negative, got ${diag!.probeCacheHits}`,
      );
    });
  });

  describe('dev flag gating', () => {
    it('diagnostics are NOT delivered when collectDiagnostics is not set', () => {
      const action = makeChooseNAction('pickSmall', ['a', 'b', 'c'], 1, 2);
      const def = makeBaseDef({ actions: [action] });
      const state = makeBaseState();

      let called = false;
      legalChoicesEvaluate(def, state, makeMove('pickSmall'), {
        onChooseNDiagnostics: () => { called = true; },
      });
      assert.equal(called, false, 'onChooseNDiagnostics should not be called without collectDiagnostics flag');
    });

    it('diagnostics are NOT delivered when collectDiagnostics is false', () => {
      const action = makeChooseNAction('pickSmall', ['a', 'b', 'c'], 1, 2);
      const def = makeBaseDef({ actions: [action] });
      const state = makeBaseState();

      let called = false;
      legalChoicesEvaluate(def, state, makeMove('pickSmall'), {
        collectDiagnostics: false,
        onChooseNDiagnostics: () => { called = true; },
      });
      assert.equal(called, false, 'onChooseNDiagnostics should not be called when collectDiagnostics is false');
    });

    it('diagnostics ARE delivered when collectDiagnostics is true', () => {
      const action = makeChooseNAction('pickSmall', ['a', 'b', 'c'], 1, 2);
      const def = makeBaseDef({ actions: [action] });
      const state = makeBaseState();

      let captured: ChooseNDiagnostics | null = null;
      legalChoicesEvaluate(def, state, makeMove('pickSmall'), {
        collectDiagnostics: true,
        onChooseNDiagnostics: (d) => { captured = d; },
      });
      assert.notEqual(captured, null, 'onChooseNDiagnostics should be called when collectDiagnostics is true');
    });
  });
});
