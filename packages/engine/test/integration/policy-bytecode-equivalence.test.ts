// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { evaluatePolicyMoveCore } from '../../src/agents/policy-eval.js';
import { PolicyEvaluationContext, type PolicyEvaluationCandidate } from '../../src/agents/policy-evaluation-core.js';
import { executeBytecode, PolicyBytecodeVmUnsupportedError } from '../../src/agents/policy-vm/index.js';
import { evaluateWasmMoveConsiderationScoreRows, loadPolicyWasmRuntime } from '../../src/agents/policy-wasm-runtime.js';
import {
  compilePolicyBytecode,
  type PolicyBytecode,
} from '../../src/cnl/policy-bytecode/index.js';
import {
  advanceAutoresolvable,
  applyPublishedDecision,
  buildEncodedState,
  buildEncodedStateLayout,
  createGameDefRuntime,
  createRng,
  initialState,
  publishMicroturn,
  serializeGameState,
  type CompiledPolicyExpr,
  type CompiledPolicyConsideration,
  type EncodedState,
  type EncodedStateLayout,
  type Decision,
  type GameDef,
  type GameState,
  type Move,
} from '../../src/kernel/index.js';
import { toMoveIdentityKey } from '../../src/kernel/move-identity.js';
import { getFitlProductionFixture } from '../helpers/production-spec-helpers.js';

const POLICY_PROFILE_VARIANTS = ['us-baseline', 'arvn-baseline', 'nva-baseline', 'vc-baseline'] as const;
const CORPUS_PATH = fileURLToPath(new URL('../../../test/fixtures/bytecode-equivalence-corpus.json', import.meta.url));
const POLICY_VM_MODULE_URL = new URL('../../src/agents/policy-vm/index.js', import.meta.url);
const POLICY_VM_MODULE_PATH = fileURLToPath(POLICY_VM_MODULE_URL);

interface BytecodeEquivalenceCorpus {
  readonly targetDecisionCount: number;
  readonly maxSearchDecisionCount: number;
  readonly seeds: readonly number[];
}

interface CorpusState {
  readonly seed: number;
  readonly decisionCount: number;
  readonly state: GameState;
  readonly legalMoves: readonly Move[];
  readonly stateHash: string;
}

interface ClosureScoreRow {
  readonly stableMoveKey: string;
  readonly score: number;
}

type PolicyVmModule = {
  readonly PolicyBytecodeVmUnsupportedError?: new (...args: never[]) => Error;
  readonly executeBytecode?: (
    bytecode: PolicyBytecode,
    encoded: EncodedState,
    context: {
      readonly def: GameDef;
      readonly layout: EncodedStateLayout;
      readonly state: GameState;
      readonly profileId: string;
      readonly legalMoves: readonly Move[];
    },
  ) => { readonly scores?: readonly number[] };
};

const readCorpus = (): BytecodeEquivalenceCorpus => {
  const parsed = JSON.parse(readFileSync(CORPUS_PATH, 'utf8')) as BytecodeEquivalenceCorpus;
  assert.equal(parsed.seeds.length, 20, 'Spec 149 equivalence corpus must contain exactly 20 seeds.');
  assert.ok(parsed.targetDecisionCount > 0);
  assert.ok(parsed.maxSearchDecisionCount >= parsed.targetDecisionCount);
  return parsed;
};

const collectProfileExprs = (def: GameDef): readonly CompiledPolicyExpr[] => {
  const catalog = def.agents;
  assert.ok(catalog?.compiled, 'expected compiled policy catalog');
  const exprs: CompiledPolicyExpr[] = [];

  for (const profileId of POLICY_PROFILE_VARIANTS) {
    const profile = catalog.profiles[profileId];
    assert.ok(profile, `expected profile ${profileId}`);
    for (const featureId of profile.plan.stateFeatures) {
      const feature = catalog.compiled.stateFeatures[featureId];
      assert.ok(feature, `expected state feature ${featureId}`);
      exprs.push(feature.expr);
    }
    for (const featureId of profile.plan.candidateFeatures) {
      const feature = catalog.compiled.candidateFeatures[featureId];
      assert.ok(feature, `expected candidate feature ${featureId}`);
      exprs.push(feature.expr);
    }
    for (const aggregateId of profile.plan.candidateAggregates) {
      const aggregate = catalog.compiled.candidateAggregates[aggregateId];
      assert.ok(aggregate, `expected candidate aggregate ${aggregateId}`);
      exprs.push(aggregate.of);
      if (aggregate.where !== undefined) exprs.push(aggregate.where);
    }
    for (const considerationId of profile.use.considerations) {
      const consideration = catalog.compiled.considerations[considerationId];
      assert.ok(consideration, `expected consideration ${considerationId}`);
      if (consideration.when !== undefined) exprs.push(consideration.when);
      exprs.push(consideration.weight, consideration.value);
    }
    for (const tieBreakerId of profile.use.tieBreakers ?? []) {
      const tieBreaker = catalog.compiled.tieBreakers[tieBreakerId];
      assert.ok(tieBreaker, `expected tie breaker ${tieBreakerId}`);
      if (tieBreaker.value !== undefined) exprs.push(tieBreaker.value);
    }
  }

  return exprs;
};

const byteIdentical = (left: PolicyBytecode, right: PolicyBytecode): void => {
  assert.deepEqual(Array.from(left.instructions), Array.from(right.instructions));
  assert.deepEqual(Array.from(left.constants), Array.from(right.constants));
  assert.deepEqual(left.featureTable, right.featureTable);
  assert.deepEqual(left.metadata, right.metadata);
};

const actionSelectionMoves = (microturn: ReturnType<typeof publishMicroturn>): readonly Move[] => {
  if (microturn.kind !== 'actionSelection') {
    return [];
  }
  return microturn.legalActions
    .map((decision) => decision.kind === 'actionSelection' ? decision.move : undefined)
    .filter((move): move is Move => move !== undefined);
};

const selectAdvanceDecision = (
  microturn: ReturnType<typeof publishMicroturn>,
  seed: number,
  decisionCount: number,
): Decision => {
  const confirm = microturn.legalActions.find((decision) =>
    decision.kind === 'chooseNStep' && decision.command === 'confirm',
  );
  if (confirm !== undefined) {
    return confirm;
  }

  const add = microturn.legalActions.find((decision) =>
    decision.kind === 'chooseNStep' && decision.command === 'add',
  );
  if (add !== undefined) {
    return add;
  }

  const selected = microturn.legalActions[(seed + decisionCount) % microturn.legalActions.length];
  assert.ok(selected, `seed ${seed} did not expose a deterministic decision at step ${decisionCount}`);
  return selected;
};

const deriveCorpusState = (
  def: GameDef,
  corpus: BytecodeEquivalenceCorpus,
  seed: number,
): CorpusState => {
  const runtime = createGameDefRuntime(def);
  let state = initialState(def, seed, def.metadata.players.max, undefined, runtime).state;
  let rng = createRng(BigInt(seed) ^ 0x5eed149n);

  for (let decisionCount = 0; decisionCount <= corpus.maxSearchDecisionCount; decisionCount += 1) {
    const auto = advanceAutoresolvable(def, state, rng, runtime);
    state = auto.state;
    rng = auto.rng;

    const microturn = publishMicroturn(def, state, runtime);
    const legalMoves = actionSelectionMoves(microturn);
    if (decisionCount >= corpus.targetDecisionCount && legalMoves.length > 0) {
      return {
        seed,
        decisionCount,
        state,
        legalMoves,
        stateHash: serializeGameState(state).stateHash,
      };
    }

    assert.ok(microturn.legalActions.length > 0, `seed ${seed} stalled before corpus capture`);
    const selected = selectAdvanceDecision(microturn, seed, decisionCount);
    state = applyPublishedDecision(def, state, microturn, selected, undefined, runtime).state;
  }

  throw new Error(`seed ${seed} did not reach an action-selection corpus state by ${corpus.maxSearchDecisionCount} decisions`);
};

const captureClosureScores = (
  def: GameDef,
  corpusState: CorpusState,
  profileId: string,
): readonly ClosureScoreRow[] => {
  const result = evaluatePolicyMoveCore({
    def,
    state: corpusState.state,
    playerId: corpusState.state.activePlayer,
    legalMoves: corpusState.legalMoves,
    trustedMoveIndex: new Map(),
    rng: { state: corpusState.state.rng },
    profileIdOverride: profileId,
    policyVmMode: 'disabled',
    runtime: createGameDefRuntime(def),
  });

  assert.equal(result.kind, 'success', `seed ${corpusState.seed} profile ${profileId} policy evaluation should succeed`);
  assert.ok(result.metadata.candidates.length > 0, `seed ${corpusState.seed} profile ${profileId} should expose score rows`);
  return result.metadata.candidates.map((candidate) => ({
    stableMoveKey: candidate.stableMoveKey,
    score: candidate.score,
  }));
};

const captureVmScores = (
  def: GameDef,
  corpusState: CorpusState,
  profileId: string,
): readonly ClosureScoreRow[] => {
  const result = evaluatePolicyMoveCore({
    def,
    state: corpusState.state,
    playerId: corpusState.state.activePlayer,
    legalMoves: corpusState.legalMoves,
    trustedMoveIndex: new Map(),
    rng: { state: corpusState.state.rng },
    profileIdOverride: profileId,
    policyVmMode: 'enabled',
    runtime: createGameDefRuntime(def),
  });

  assert.equal(result.kind, 'success', `seed ${corpusState.seed} profile ${profileId} VM policy evaluation should succeed`);
  assert.ok(result.metadata.candidates.length > 0, `seed ${corpusState.seed} profile ${profileId} VM should expose score rows`);
  return result.metadata.candidates.map((candidate) => ({
    stableMoveKey: candidate.stableMoveKey,
    score: candidate.score,
  }));
};

const batchCandidates = (def: GameDef, legalMoves: readonly Move[]) => legalMoves.map((move) => ({
  actionId: String(move.actionId),
  stableMoveKey: toMoveIdentityKey(def, move),
  params: move.params,
  tags: def.actionTagIndex?.byAction[String(move.actionId)] ?? [],
}));

const evaluationCandidates = (def: GameDef, legalMoves: readonly Move[]): PolicyEvaluationCandidate[] => legalMoves.map((move) => ({
  move,
  actionId: String(move.actionId),
  stableMoveKey: toMoveIdentityKey(def, move),
  previewRefIds: new Set(),
  unknownPreviewRefs: new Map(),
}));

const isWasmScoreExprSupported = (expr: CompiledPolicyExpr | undefined): boolean => {
  if (expr === undefined) return true;
  switch (expr.kind) {
    case 'literal':
    case 'param':
    case 'globalTokenAgg':
    case 'globalZoneAgg':
    case 'zoneTokenAgg':
    case 'zoneProp':
      return true;
    case 'op':
      return expr.args.every(isWasmScoreExprSupported);
    case 'ref':
      return expr.ref.kind === 'currentSurface'
        || expr.ref.kind === 'candidateIntrinsic'
        || expr.ref.kind === 'candidateParam'
        || expr.ref.kind === 'candidateTag'
        || (expr.ref.kind === 'library' && (
          expr.ref.refKind === 'stateFeature'
          || expr.ref.refKind === 'candidateFeature'
          || expr.ref.refKind === 'aggregate'
        ));
    case 'adjacentTokenAgg':
    case 'seatAgg':
      return false;
  }
};

const encodeWasmPrecomputedPolicyValue = (value: unknown): number | boolean | undefined => {
  if (value === undefined || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  throw new Error(`WASM precomputed policy value is not encodable: ${String(value)}`);
};

const isWasmScoreConsiderationSupported = (consideration: CompiledPolicyConsideration): boolean =>
  consideration.costClass !== 'preview'
    && isWasmScoreExprSupported(consideration.when)
    && isWasmScoreExprSupported(consideration.weight)
    && isWasmScoreExprSupported(consideration.value);

const compiledConsiderationEntries = (
  def: GameDef,
  considerationIds: readonly string[],
): readonly { readonly id: string; readonly consideration: CompiledPolicyConsideration }[] =>
  considerationIds
    .map((id) => {
      const consideration = def.agents?.compiled.considerations[id];
      return consideration === undefined ? undefined : { id, consideration };
    })
    .filter((entry): entry is { readonly id: string; readonly consideration: CompiledPolicyConsideration } => entry !== undefined);

const captureSupportedConsiderationScores = (
  def: GameDef,
  corpusState: CorpusState,
  profileId: string,
  considerations: readonly { readonly id: string; readonly consideration: CompiledPolicyConsideration }[],
): readonly ClosureScoreRow[] => {
  const profile = def.agents?.profiles[profileId];
  assert.ok(profile, `expected profile ${profileId}`);
  const candidates = evaluationCandidates(def, corpusState.legalMoves);
  const layout = buildEncodedStateLayout(def);
  const evaluation = new PolicyEvaluationContext({
    def,
    state: corpusState.state,
    playerId: corpusState.state.activePlayer,
    seatId: def.seats?.[corpusState.state.activePlayer]?.id ?? String(corpusState.state.activePlayer),
    catalog: def.agents!,
    parameterValues: profile.params,
    trustedMoveIndex: new Map(),
    runtime: createGameDefRuntime(def),
    encodedStateLayout: layout,
    encodedState: buildEncodedState(corpusState.state, layout),
    policyVmMode: 'disabled',
  }, candidates);
  try {
    return candidates.map((candidate) => ({
      stableMoveKey: candidate.stableMoveKey,
      score: considerations.reduce((total, entry) => (
        total + evaluation.evaluateConsideration({ [entry.id]: entry.consideration }, entry.id, candidate)
      ), 0),
    }));
  } finally {
    evaluation.dispose();
  }
};

const captureWasmPrecomputedRows = (
  def: GameDef,
  corpusState: CorpusState,
  profileId: string,
): {
  readonly candidateFeatures: readonly { readonly id: string; readonly values: readonly (number | boolean | undefined)[] }[];
  readonly stateFeatures: readonly { readonly id: string; readonly value: number | boolean | undefined }[];
  readonly aggregates: readonly { readonly id: string; readonly value: number | boolean | undefined }[];
} => {
  const profile = def.agents?.profiles[profileId];
  assert.ok(profile, `expected profile ${profileId}`);
  const candidates = evaluationCandidates(def, corpusState.legalMoves);
  const layout = buildEncodedStateLayout(def);
  const evaluation = new PolicyEvaluationContext({
    def,
    state: corpusState.state,
    playerId: corpusState.state.activePlayer,
    seatId: def.seats?.[corpusState.state.activePlayer]?.id ?? String(corpusState.state.activePlayer),
    catalog: def.agents!,
    parameterValues: profile.params,
    trustedMoveIndex: new Map(),
    runtime: createGameDefRuntime(def),
    encodedStateLayout: layout,
    encodedState: buildEncodedState(corpusState.state, layout),
    policyVmMode: 'disabled',
  }, candidates);
  try {
    return {
      stateFeatures: profile.plan.stateFeatures.map((id) => ({
        id,
        value: encodeWasmPrecomputedPolicyValue(evaluation.evaluateStateFeature(id)),
      })),
      candidateFeatures: profile.plan.candidateFeatures.map((id) => ({
        id,
        values: candidates.map((candidate) => encodeWasmPrecomputedPolicyValue(
          evaluation.evaluateCandidateFeature(candidate, id),
        )),
      })),
      aggregates: profile.plan.candidateAggregates.map((id) => ({
        id,
        value: encodeWasmPrecomputedPolicyValue(evaluation.evaluateAggregate(id)),
      })),
    };
  } finally {
    evaluation.dispose();
  }
};

const loadVmModule = async (): Promise<PolicyVmModule | null> => {
  if (!existsSync(POLICY_VM_MODULE_PATH)) {
    return null;
  }
  return await import(POLICY_VM_MODULE_URL.href) as PolicyVmModule;
};

describe('policy bytecode equivalence harness', () => {
  const corpus = readCorpus();
  const def = getFitlProductionFixture().gameDef;
  const layout = buildEncodedStateLayout(def);

  it('captures closure-tree score rows for every baseline profile across the 20-state corpus', { timeout: 120_000 }, () => {
    for (const seed of corpus.seeds) {
      const corpusState = deriveCorpusState(def, corpus, seed);
      assert.match(corpusState.stateHash, /^0x[0-9a-f]+$/u);
      for (const profileId of POLICY_PROFILE_VARIANTS) {
        const scores = captureClosureScores(def, corpusState, profileId);
        assert.ok(scores.every((row) => Number.isInteger(row.score)), `seed ${seed} profile ${profileId} should produce integer scores`);
      }
    }
  });

  it('compiles every baseline profile expression deterministically', () => {
    for (const expr of collectProfileExprs(def)) {
      const first = compilePolicyBytecode(expr, def, layout);
      const second = compilePolicyBytecode(expr, def, layout);
      byteIdentical(first, second);
    }
  });

  it('compares VM score rows against the closure-tree evaluator when the Phase 4 policy VM is enabled', async (t) => {
    if (process.env.LUDOFORGE_POLICY_VM !== 'on') {
      t.skip('pending Phase 4 VM: set LUDOFORGE_POLICY_VM=on after ticket 015 lands');
      return;
    }

    const vm = await loadVmModule();
    if (vm?.executeBytecode === undefined) {
      t.skip('pending Phase 4 VM: executeBytecode is not available yet');
      return;
    }

    for (const seed of corpus.seeds) {
      const corpusState = deriveCorpusState(def, corpus, seed);
      const encoded = buildEncodedState(corpusState.state, layout);
      for (const profileId of POLICY_PROFILE_VARIANTS) {
        const closureScores = captureClosureScores(def, corpusState, profileId);
        const vmScores = captureVmScores(def, corpusState, profileId);
        assert.deepEqual(vmScores, closureScores, `seed ${seed} profile ${profileId} VM scores should match closure-tree scores`);
        assert.ok(closureScores.length > 0);
        for (const expr of collectProfileExprs(def)) {
          const bytecode = compilePolicyBytecode(expr, def, layout);
          try {
            const result = vm.executeBytecode(bytecode, encoded, {
              def,
              layout,
              state: corpusState.state,
              profileId,
              legalMoves: corpusState.legalMoves,
            });
            assert.ok(result.scores !== undefined, `VM should return scores for seed ${seed} profile ${profileId}`);
          } catch (error) {
            const unsupported = vm.PolicyBytecodeVmUnsupportedError;
            if (unsupported === undefined || !(error instanceof unsupported)) {
              throw error;
            }
          }
        }
      }
    }
  });

  it('compares WASM VM values against the TypeScript VM on supported corpus bytecode', { timeout: 120_000 }, async () => {
    const wasm = await loadPolicyWasmRuntime();
    let compared = 0;
    let unsupported = 0;

    for (const seed of corpus.seeds) {
      const corpusState = deriveCorpusState(def, corpus, seed);
      const encoded = buildEncodedState(corpusState.state, layout);
      for (const profileId of POLICY_PROFILE_VARIANTS) {
        for (const expr of collectProfileExprs(def)) {
          const bytecode = compilePolicyBytecode(expr, def, layout);
          let tsValue: unknown;
          try {
            const result = executeBytecode(bytecode, encoded, {
              def,
              layout,
              state: corpusState.state,
              profileId,
              legalMoves: corpusState.legalMoves,
              playerId: Number(corpusState.state.activePlayer),
            });
            if (result.usedDynamicFallback) {
              unsupported += 1;
              continue;
            }
            tsValue = result.value;
          } catch (error) {
            if (error instanceof PolicyBytecodeVmUnsupportedError) {
              unsupported += 1;
              continue;
            }
            throw error;
          }
          if (typeof tsValue !== 'number' && typeof tsValue !== 'boolean' && tsValue !== undefined) {
            unsupported += 1;
            continue;
          }

          let wasmValue: unknown;
          try {
            wasmValue = wasm.evaluatePolicyBytecode(bytecode, encoded, {
              def,
              layout,
              state: corpusState.state,
              playerId: Number(corpusState.state.activePlayer),
            });
          } catch (error) {
            if (error instanceof Error && /status -14/u.test(error.message)) {
              unsupported += 1;
              continue;
            }
            throw error;
          }
          assert.equal(wasmValue, tsValue, `seed ${seed} profile ${profileId} WASM VM value should match TypeScript VM`);
          compared += 1;
        }
      }
    }

    assert.ok(compared > 0, 'WASM VM parity must compare at least one supported corpus bytecode expression.');
    assert.ok(unsupported > 0, 'corpus should still include unsupported dynamic bytecode for fail-closed handoff coverage.');
  });

  it('compares WASM batch values against the TypeScript VM over corpus action batches', { timeout: 120_000 }, async () => {
    const wasm = await loadPolicyWasmRuntime();
    let comparedRows = 0;
    let unsupportedRows = 0;

    for (const seed of corpus.seeds) {
      const corpusState = deriveCorpusState(def, corpus, seed);
      const encoded = buildEncodedState(corpusState.state, layout);
      const candidates = batchCandidates(def, corpusState.legalMoves);
      assert.ok(candidates.length > 0, `seed ${seed} should expose action candidates`);
      for (const profileId of POLICY_PROFILE_VARIANTS) {
        for (const expr of collectProfileExprs(def)) {
          const bytecode = compilePolicyBytecode(expr, def, layout);
          let tsValue: unknown;
          try {
            const result = executeBytecode(bytecode, encoded, {
              def,
              layout,
              state: corpusState.state,
              profileId,
              legalMoves: corpusState.legalMoves,
              playerId: Number(corpusState.state.activePlayer),
            });
            if (result.usedDynamicFallback) {
              unsupportedRows += candidates.length;
              continue;
            }
            tsValue = result.value;
          } catch (error) {
            if (error instanceof PolicyBytecodeVmUnsupportedError) {
              unsupportedRows += candidates.length;
              continue;
            }
            throw error;
          }
          if (typeof tsValue !== 'number' && typeof tsValue !== 'boolean' && tsValue !== undefined) {
            unsupportedRows += candidates.length;
            continue;
          }

          let wasmValues: readonly unknown[];
          try {
            wasmValues = wasm.evaluatePolicyBytecodeBatch(bytecode, encoded, {
              def,
              layout,
              state: corpusState.state,
              playerId: Number(corpusState.state.activePlayer),
            }, candidates);
          } catch (error) {
            if (error instanceof Error && /status -14/u.test(error.message)) {
              unsupportedRows += candidates.length;
              continue;
            }
            throw error;
          }
          assert.deepEqual(
            wasmValues,
            candidates.map(() => tsValue),
            `seed ${seed} profile ${profileId} WASM batch values should match TypeScript VM`,
          );
          comparedRows += wasmValues.length;
        }
      }
    }

    assert.ok(comparedRows > 0, 'WASM VM batch parity must compare at least one supported corpus row.');
    assert.ok(unsupportedRows > 0, 'corpus should still include unsupported batch rows for fail-closed handoff coverage.');
  });

  it('compares candidate-dependent WASM score rows against the TypeScript reference for supported move considerations', { timeout: 120_000 }, async () => {
    const wasm = await loadPolicyWasmRuntime();
    let supportedProfiles = 0;
    let unsupportedFullProfiles = 0;

    for (const seed of corpus.seeds) {
      const corpusState = deriveCorpusState(def, corpus, seed);
      const encoded = buildEncodedState(corpusState.state, layout);
      const candidates = batchCandidates(def, corpusState.legalMoves);
      for (const profileId of POLICY_PROFILE_VARIANTS) {
        const profile = def.agents?.profiles[profileId];
        assert.ok(profile, `expected profile ${profileId}`);
        const precomputed = captureWasmPrecomputedRows(def, corpusState, profileId);
        const allMoveConsiderations = compiledConsiderationEntries(def, profile.use.considerations);
        const allRows = evaluateWasmMoveConsiderationScoreRows(wasm, {
          def,
          encoded,
          context: {
            def,
            layout,
            state: corpusState.state,
            playerId: Number(corpusState.state.activePlayer),
          },
          parameterValues: profile.params,
          considerations: allMoveConsiderations,
          candidates,
          precomputedStateFeatures: precomputed.stateFeatures,
          precomputedCandidateFeatures: precomputed.candidateFeatures,
          precomputedAggregates: precomputed.aggregates,
        });
        if (allRows.kind === 'unsupported') {
          assert.match(allRows.reason, /preview-backed consideration/u);
          unsupportedFullProfiles += 1;
        }
        const considerations = compiledConsiderationEntries(def, profile.use.considerations)
          .filter((entry) => entry.consideration.costClass !== 'preview')
          .filter((entry) => isWasmScoreConsiderationSupported(entry.consideration));
        assert.ok(considerations.length > 0, `profile ${profileId} should have supported move considerations`);
        const wasmRows = evaluateWasmMoveConsiderationScoreRows(wasm, {
          def,
          encoded,
          context: {
            def,
            layout,
            state: corpusState.state,
            playerId: Number(corpusState.state.activePlayer),
          },
          parameterValues: profile.params,
          considerations,
          candidates,
          precomputedStateFeatures: precomputed.stateFeatures,
          precomputedCandidateFeatures: precomputed.candidateFeatures,
          precomputedAggregates: precomputed.aggregates,
        });
        if (wasmRows.kind !== 'supported') {
          throw new Error(`supported consideration subset unexpectedly failed closed: ${wasmRows.reason}`);
        }
        const referenceRows = captureSupportedConsiderationScores(def, corpusState, profileId, considerations);
        assert.deepEqual(
          wasmRows.rows,
          referenceRows,
          `seed ${seed} profile ${profileId} WASM candidate-dependent scores should match TypeScript reference`,
        );
        supportedProfiles += 1;
      }
    }

    assert.ok(supportedProfiles > 0, 'WASM score parity must support at least one candidate-dependent profile batch.');
    assert.ok(unsupportedFullProfiles > 0, 'full corpus score batches should still expose unsupported preview-backed rows for fail-closed handoff coverage.');
  });
});
