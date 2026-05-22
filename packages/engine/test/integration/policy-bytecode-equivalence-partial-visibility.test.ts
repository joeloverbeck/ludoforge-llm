// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyEvaluationContext, type PolicyEvaluationCandidate } from '../../src/agents/policy-evaluation-core.js';
import { evaluateWasmMoveConsiderationScoreRows } from '../../src/agents/policy-wasm-runtime.js';
import { loadPolicyWasmRuntime } from '../../src/agents/policy-wasm-runtime-node-loader.js';
import {
  asActionId,
  buildEncodedState,
  buildEncodedStateLayout,
  createGameDefRuntime,
  type GameDef,
  type Move,
} from '../../src/kernel/index.js';
import { toMoveIdentityKey } from '../../src/kernel/move-identity.js';
import {
  makePartialVisibilityDef,
  stateWithVisiblePrefix,
} from './fixtures/partial-visibility-fixtures.js';
import { topNVisibleScheduleFallbackConsideration } from './policy-bytecode-equivalence-phase-schedule-fixtures.js';

const legalMoves = (): readonly Move[] => [
  { actionId: asActionId('govern'), params: {} },
  { actionId: asActionId('pass'), params: {} },
];

const batchCandidates = (def: GameDef, moves: readonly Move[]) => moves.map((move) => ({
  actionId: String(move.actionId),
  stableMoveKey: toMoveIdentityKey(def, move),
  params: move.params,
  tags: def.actionTagIndex?.byAction[String(move.actionId)] ?? [],
}));

const evaluationCandidates = (def: GameDef, moves: readonly Move[]): PolicyEvaluationCandidate[] => moves.map((move) => ({
  move,
  actionId: String(move.actionId),
  stableMoveKey: toMoveIdentityKey(def, move),
  previewRefIds: new Set(),
  unknownPreviewRefs: new Map(),
  unknownLookupRefs: new Map(),
  unknownCandidateParamRefs: new Map(),
}));

describe('policy bytecode equivalence for partial-visibility schedule refs', () => {
  it('routes topNVisible ready and partial.lowerBound score rows through WASM with TypeScript parity', async () => {
    const wasm = await loadPolicyWasmRuntime();
    const def = makePartialVisibilityDef();
    const consideration = topNVisibleScheduleFallbackConsideration();
    const cases = [
      {
        label: 'ready in second visible slot',
        state: stateWithVisiblePrefix(def, ['op-1'], ['coup-1']),
        expectedFallback: undefined,
      },
      {
        label: 'partial lower bound after visible-prefix exhaustion',
        state: stateWithVisiblePrefix(def, ['op-1'], ['op-2']),
        expectedFallback: {
          termId: 'topNVisibleSchedule',
          kind: 'useLowerBound',
          value: 2,
          reason: 'partial.lowerBound.visiblePrefixExhausted',
        },
      },
    ] as const;

    for (const testCase of cases) {
      const runtime = createGameDefRuntime(def);
      const layout = buildEncodedStateLayout(def);
      const encoded = buildEncodedState(testCase.state, layout);
      const moves = legalMoves();
      const candidates = batchCandidates(def, moves);
      const evaluationRows = evaluationCandidates(def, moves);
      const evaluation = new PolicyEvaluationContext({
        def,
        state: testCase.state,
        playerId: testCase.state.activePlayer,
        seatId: 'solo',
        catalog: def.agents!,
        parameterValues: {},
        trustedMoveIndex: new Map(),
        cacheBinding: { kind: 'runtime', runtime, preEncoded: { layout, encoded } },
      }, evaluationRows);
      try {
        const tsScores = evaluationRows.map((candidate) =>
          evaluation.evaluateConsideration({ topNVisibleSchedule: consideration }, 'topNVisibleSchedule', candidate),
        );
        const wasmRows = evaluateWasmMoveConsiderationScoreRows(wasm, {
          def,
          encoded,
          context: {
            def,
            layout,
            state: testCase.state,
            playerId: Number(testCase.state.activePlayer),
            gameDefRuntime: runtime,
          },
          considerations: [{ id: 'topNVisibleSchedule', consideration }],
          candidates,
        });

        assert.equal(wasmRows.kind, 'supported', `${testCase.label}: WASM route should be activated`);
        assert.deepEqual(
          wasmRows.rows.map((row) => row.score),
          tsScores,
          `${testCase.label}: WASM score rows should match TypeScript scores`,
        );
        assert.ok(wasmRows.rows.length > 0, `${testCase.label}: WASM score-row route should produce rows`);
        assert.deepEqual(wasmRows.rows[0]!.scheduleFallbackFired, testCase.expectedFallback);
      } finally {
        evaluation.dispose();
      }
    }
  });

  it('matches TypeScript score rows for every partial.lowerBound fallback kind supported by the evaluator', async () => {
    const wasm = await loadPolicyWasmRuntime();
    const def = makePartialVisibilityDef();
    const state = stateWithVisiblePrefix(def, ['op-1'], ['op-2']);
    const runtime = createGameDefRuntime(def);
    const layout = buildEncodedStateLayout(def);
    const encoded = buildEncodedState(state, layout);
    const moves = legalMoves();
    const candidates = batchCandidates(def, moves);
    const evaluationRows = evaluationCandidates(def, moves);
    const cases = [
      {
        id: 'useLowerBound',
        fallback: 'useLowerBound' as const,
        clamp: undefined,
        expectedFallback: {
          termId: 'useLowerBound',
          kind: 'useLowerBound',
          value: 2,
          reason: 'partial.lowerBound.visiblePrefixExhausted',
        },
      },
      {
        id: 'noContribution',
        fallback: 'noContribution' as const,
        clamp: undefined,
        expectedFallback: {
          termId: 'noContribution',
          kind: 'noContribution',
          reason: 'partial.lowerBound.visiblePrefixExhausted',
        },
      },
      {
        id: 'dropConsideration',
        fallback: 'dropConsideration' as const,
        clamp: undefined,
        expectedFallback: {
          termId: 'dropConsideration',
          kind: 'dropConsideration',
          reason: 'partial.lowerBound.visiblePrefixExhausted',
        },
      },
      {
        id: 'constant',
        fallback: { kind: 'constant' as const, value: 7 },
        clamp: undefined,
        expectedFallback: {
          termId: 'constant',
          kind: 'constant',
          value: 7,
          reason: 'partial.lowerBound.visiblePrefixExhausted',
        },
      },
      {
        id: 'constantIgnoresClampLikeTypeScriptPartialBranch',
        fallback: { kind: 'constant' as const, value: 7 },
        clamp: { min: 100 },
        expectedFallback: {
          termId: 'constantIgnoresClampLikeTypeScriptPartialBranch',
          kind: 'constant',
          value: 7,
          reason: 'partial.lowerBound.visiblePrefixExhausted',
        },
      },
    ] as const;
    const evaluation = new PolicyEvaluationContext({
      def,
      state,
      playerId: state.activePlayer,
      seatId: 'solo',
      catalog: def.agents!,
      parameterValues: {},
      trustedMoveIndex: new Map(),
      cacheBinding: { kind: 'runtime', runtime, preEncoded: { layout, encoded } },
    }, evaluationRows);
    try {
      for (const testCase of cases) {
        const consideration = topNVisibleScheduleFallbackConsideration(testCase.fallback, testCase.clamp);
        const tsScores = evaluationRows.map((candidate) =>
          evaluation.evaluateConsideration({ [testCase.id]: consideration }, testCase.id, candidate),
        );
        const wasmRows = evaluateWasmMoveConsiderationScoreRows(wasm, {
          def,
          encoded,
          context: {
            def,
            layout,
            state,
            playerId: Number(state.activePlayer),
            gameDefRuntime: runtime,
          },
          considerations: [{ id: testCase.id, consideration }],
          candidates,
        });

        assert.equal(wasmRows.kind, 'supported', `${testCase.id}: WASM route should be activated`);
        assert.deepEqual(
          wasmRows.rows.map((row) => row.score),
          tsScores,
          `${testCase.id}: WASM score rows should match TypeScript scores`,
        );
        assert.deepEqual(wasmRows.rows[0]!.scheduleFallbackFired, testCase.expectedFallback);
      }
    } finally {
      evaluation.dispose();
    }
  });
});
