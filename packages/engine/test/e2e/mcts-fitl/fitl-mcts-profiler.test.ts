/**
 * FITL MCTS extended profiling — captures all diagnostic fields including
 * the 7 new extended metrics (per-kernel-call timing, state size, trigger
 * firings, materialization breakdown, heap pressure, branching factor,
 * iteration timing variance).
 *
 * Gated by RUN_MCTS_FITL_E2E=1 environment variable.
 *
 * Scenarios match the report in reports/mcts-fitl-performance-analysis.md:
 * - S1: T1 VC — Burning Bonze (10 iterations)
 * - S3: T2 NVA — Trucks (10 iterations)
 */
/* eslint-disable no-console */
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  resolvePreset,
  runSearch,
  createRootNode,
  createNodePool,
  selectRootDecision,
} from '../../../src/agents/index.js';
import type { MctsSearchDiagnostics } from '../../../src/agents/index.js';
import {
  createGameDefRuntime,
  createRng,
  derivePlayerObservation,
  fork,
  legalMoves,
  type GameState,
  type Move,
  type PlayerId,
  type ValidatedGameDef,
} from '../../../src/kernel/index.js';

import { createConsoleVisitor } from '../../helpers/mcts-console-visitor.js';

import {
  RUN_MCTS_FITL_E2E,
  compileFitlDef,
  createPlaybookBaseState,
  replayToDecisionPoint,
  CATEGORY_SCENARIOS,
} from './fitl-mcts-test-helpers.js';

// ---------------------------------------------------------------------------
// Profiling harness (iteration-count override)
// ---------------------------------------------------------------------------

interface ProfileResult {
  readonly move: Move;
  readonly iterations: number;
  readonly diagnostics: MctsSearchDiagnostics;
  readonly elapsedMs: number;
  readonly legalMoveCount: number;
}

function runProfileSearch(
  def: ValidatedGameDef,
  state: GameState,
  playerId: PlayerId,
  iterations: number,
): ProfileResult {
  const baseConfig = resolvePreset('fast');
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { timeLimitMs: _, ...configWithoutTime } = baseConfig;
  const visitor = createConsoleVisitor('[PROFILE]');
  const config = {
    ...configWithoutTime,
    iterations,
    minIterations: 0,
    diagnostics: true as const,
    visitor,
  };

  const runtime = createGameDefRuntime(def);
  const rng = createRng(BigInt(42 + 9999));
  const moves = legalMoves(def, state, undefined, runtime);
  const observation = derivePlayerObservation(def, state, playerId);
  const root = createRootNode(state.playerCount);
  const poolCapacity = Math.max(config.iterations + 1, moves.length * 4);
  const pool = createNodePool(poolCapacity, state.playerCount);
  const [searchRng] = fork(rng);

  const start = Date.now();
  const result = runSearch(
    root, def, state, observation, playerId,
    config, searchRng, moves, runtime, pool,
  );
  const elapsedMs = Date.now() - start;

  const bestChild = selectRootDecision(root, playerId);

  if (result.diagnostics === undefined) {
    throw new Error('Expected diagnostics to be present');
  }

  return {
    move: bestChild.move as Move,
    iterations: result.iterations,
    diagnostics: result.diagnostics,
    elapsedMs,
    legalMoveCount: moves.length,
  };
}

// ---------------------------------------------------------------------------
// Pretty-print all diagnostics
// ---------------------------------------------------------------------------

function printDiagnostics(label: string, r: ProfileResult): void {
  const d = r.diagnostics;

  console.log('\n' + '='.repeat(72));
  console.log(`SCENARIO: ${label}`);
  console.log(`ITERATIONS: ${r.iterations}`);
  console.log(`LEGAL MOVES: ${r.legalMoveCount}`);
  console.log(`ELAPSED: ${r.elapsedMs}ms (${(r.elapsedMs / r.iterations).toFixed(1)}ms/iteration)`);
  console.log(`BEST ACTION: ${r.move.actionId} (${d.rootChildVisits[r.move.actionId] ?? '?'} visits)`);

  console.log(`\nNODES ALLOCATED: ${d.nodesAllocated}`);
  console.log(`MAX TREE DEPTH: ${d.maxTreeDepth}`);

  // Phase timing
  const phaseTotal =
    (d.selectionTimeMs ?? 0) + (d.expansionTimeMs ?? 0) + (d.simulationTimeMs ?? 0) +
    (d.evaluationTimeMs ?? 0) + (d.backpropTimeMs ?? 0) + (d.beliefSamplingTimeMs ?? 0);

  const pct = (v: number) => phaseTotal > 0 ? ((v / phaseTotal) * 100).toFixed(1) + '%' : 'n/a';

  console.log('\nPHASE TIMING (ms):');
  console.log(`  selection:       ${(d.selectionTimeMs ?? 0).toFixed(1).padStart(10)}    (${pct(d.selectionTimeMs ?? 0)})`);
  console.log(`  expansion:       ${(d.expansionTimeMs ?? 0).toFixed(1).padStart(10)}    (${pct(d.expansionTimeMs ?? 0)})`);
  console.log(`  simulation:      ${(d.simulationTimeMs ?? 0).toFixed(1).padStart(10)}    (${pct(d.simulationTimeMs ?? 0)})`);
  console.log(`  evaluation:      ${(d.evaluationTimeMs ?? 0).toFixed(1).padStart(10)}    (${pct(d.evaluationTimeMs ?? 0)})`);
  console.log(`  backprop:        ${(d.backpropTimeMs ?? 0).toFixed(1).padStart(10)}    (${pct(d.backpropTimeMs ?? 0)})`);
  console.log(`  beliefSampling:  ${(d.beliefSamplingTimeMs ?? 0).toFixed(1).padStart(10)}    (${pct(d.beliefSamplingTimeMs ?? 0)})`);
  console.log(`  TOTAL:           ${phaseTotal.toFixed(1).padStart(10)}`);

  // Kernel call volumes
  console.log('\nKERNEL CALLS:');
  console.log(`  legalMoves:      ${String(d.legalMovesCalls ?? 0).padStart(5)}  (${((d.legalMovesCalls ?? 0) / r.iterations).toFixed(1)}/iter)`);
  console.log(`  materialize:     ${String(d.materializeCalls ?? 0).padStart(5)}  (${((d.materializeCalls ?? 0) / r.iterations).toFixed(1)}/iter)`);
  console.log(`  applyMove:       ${String(d.applyMoveCalls ?? 0).padStart(5)}  (${((d.applyMoveCalls ?? 0) / r.iterations).toFixed(1)}/iter)`);
  console.log(`  terminal:        ${String(d.terminalCalls ?? 0).padStart(5)}  (${((d.terminalCalls ?? 0) / r.iterations).toFixed(1)}/iter)`);
  console.log(`  evaluateState:   ${String(d.evaluateStateCalls ?? 0).padStart(5)}  (${((d.evaluateStateCalls ?? 0) / r.iterations).toFixed(1)}/iter)`);

  // === GAP 1: Per-kernel-call timing ===
  console.log('\nPER-KERNEL-CALL TIMING (ms):');
  const kFields: [string, number | undefined, number | undefined][] = [
    ['legalMoves', d.legalMovesTimeMs, d.legalMovesCalls],
    ['applyMove', d.applyMoveTimeMs, d.applyMoveCalls],
    ['terminal', d.terminalTimeMs, d.terminalCalls],
    ['materialize', d.materializeTimeMs, d.materializeCalls],
    ['evaluate', d.evaluateTimeMs, d.evaluateStateCalls],
  ];
  for (const [name, totalMs, calls] of kFields) {
    const t = totalMs ?? 0;
    const c = calls ?? 0;
    const avg = c > 0 ? (t / c).toFixed(2) : 'n/a';
    console.log(`  ${name.padEnd(16)} total=${t.toFixed(1).padStart(10)}ms  calls=${String(c).padStart(5)}  avg=${String(avg).padStart(8)}ms/call`);
  }

  // Cache
  const lookups = d.stateCacheLookups ?? 0;
  const hits = d.stateCacheHits ?? 0;
  const hitRate = lookups > 0 ? ((hits / lookups) * 100).toFixed(1) + '%' : 'n/a';
  console.log(`\nCACHE: lookups=${lookups}, hits=${hits}, rate=${hitRate}`);
  console.log(`  terminal: ${d.terminalCacheHits ?? 0}, legalMoves: ${d.legalMovesCacheHits ?? 0}, rewards: ${d.rewardCacheHits ?? 0}`);

  // Compression
  console.log(`\nCOMPRESSION: forcedPlies=${d.forcedMovePlies ?? 0}, hybridRolloutPlies=${d.hybridRolloutPlies ?? 0}`);

  // Decision nodes
  console.log(`DECISION NODES: created=${d.decisionNodesCreated ?? 0}, completionsTree=${d.decisionCompletionsInTree ?? 0}, completionsRollout=${d.decisionCompletionsInRollout ?? 0}`);

  // === GAP 2: State size metrics ===
  console.log('\nSTATE SIZE METRICS:');
  if (d.stateSizeSampleCount !== undefined && d.stateSizeSampleCount > 0) {
    console.log(`  samples: ${d.stateSizeSampleCount}`);
    console.log(`  avgStateSizeBytes: ${(d.avgStateSizeBytes ?? 0).toFixed(0)}`);
    console.log(`  maxStateSizeBytes: ${d.maxStateSizeBytes ?? 0}`);
  } else {
    console.log('  (no samples — <10 iterations)');
  }

  // === GAP 3: Effect chain profiling ===
  console.log('\nEFFECT CHAIN PROFILING:');
  console.log(`  totalTriggerFirings: ${d.totalTriggerFirings ?? 0}`);
  console.log(`  maxTriggerFiringsPerMove: ${d.maxTriggerFiringsPerMove ?? 0}`);
  console.log(`  avgTriggerFiringsPerMove: ${(d.avgTriggerFiringsPerMove ?? 0).toFixed(2)}`);

  // === GAP 4: Materialization breakdown ===
  console.log('\nMATERIALIZATION BREAKDOWN:');
  console.log(`  templateCompletionAttempts: ${d.templateCompletionAttempts ?? 0}`);
  console.log(`  templateCompletionSuccesses: ${d.templateCompletionSuccesses ?? 0}`);
  console.log(`  templateCompletionFailures: ${d.templateCompletionFailures ?? 0}`);

  // === GAP 5: Memory pressure ===
  console.log('\nMEMORY PRESSURE:');
  const startMB = ((d.heapUsedAtStartBytes ?? 0) / 1024 / 1024).toFixed(1);
  const endMB = ((d.heapUsedAtEndBytes ?? 0) / 1024 / 1024).toFixed(1);
  const growthMB = ((d.heapGrowthBytes ?? 0) / 1024 / 1024).toFixed(1);
  console.log(`  heapAtStart: ${startMB} MB`);
  console.log(`  heapAtEnd: ${endMB} MB`);
  console.log(`  heapGrowth: ${growthMB} MB`);

  // === GAP 6: Branching factor per depth ===
  console.log('\nBRANCHING FACTOR:');
  if (d.avgBranchingFactor !== undefined) {
    console.log(`  avg: ${d.avgBranchingFactor.toFixed(1)}`);
    console.log(`  max: ${d.maxBranchingFactor ?? 'n/a'}`);
    if (d.branchingFactorByDepth !== undefined) {
      console.log('  byDepth:');
      const depths = Object.keys(d.branchingFactorByDepth).map(Number).sort((a, b) => a - b);
      for (const depth of depths) {
        const entry = d.branchingFactorByDepth[depth]!;
        console.log(`    depth ${depth}: avg=${entry.avg.toFixed(1)}, max=${entry.max}, samples=${entry.count}`);
      }
    }
  } else {
    console.log('  (no branching samples)');
  }

  // === GAP 7: Per-iteration timing ===
  console.log('\nPER-ITERATION TIMING (ms):');
  if (d.iterationTimeP50Ms !== undefined) {
    console.log(`  p50: ${d.iterationTimeP50Ms.toFixed(1)}`);
    console.log(`  p95: ${d.iterationTimeP95Ms?.toFixed(1) ?? 'n/a'}`);
    console.log(`  max: ${d.iterationTimeMaxMs?.toFixed(1) ?? 'n/a'}`);
    console.log(`  stddev: ${d.iterationTimeStddevMs?.toFixed(1) ?? 'n/a'}`);
  } else {
    console.log('  (no iteration samples)');
  }

  // Root child visits
  const visits = d.rootChildVisits;
  const sortedChildren = Object.entries(visits).sort((a, b) => b[1] - a[1]);
  if (sortedChildren.length > 0) {
    console.log(`\nROOT CHILD VISITS (${sortedChildren.length} children):`);
    for (const [key, v] of sortedChildren) {
      console.log(`  ${key.padEnd(30)} ${v}`);
    }
  }

  console.log('='.repeat(72));
}

// ---------------------------------------------------------------------------
// Profiling tests
// ---------------------------------------------------------------------------

describe('FITL MCTS extended profiling', { skip: !RUN_MCTS_FITL_E2E }, () => {
  const def = compileFitlDef();
  const baseState = createPlaybookBaseState(def);

  const S1 = CATEGORY_SCENARIOS[0]!;
  const S3 = CATEGORY_SCENARIOS[2]!;

  it('S1×10 — T1 VC Burning Bonze (10 iterations)', () => {
    const state = replayToDecisionPoint(def, baseState, S1.turnIndex, S1.moveIndex);
    const result = runProfileSearch(def, state, S1.playerId, 10);
    printDiagnostics(S1.label, result);

    // Basic sanity checks — the real value is the console output.
    assert.ok(result.iterations === 10, `expected 10 iterations, got ${result.iterations}`);
    assert.ok(result.diagnostics.applyMoveTimeMs !== undefined, 'applyMoveTimeMs should be present');
    assert.ok(result.diagnostics.iterationTimeP50Ms !== undefined, 'iterationTimeP50Ms should be present');
  });

  it('S3×10 — T2 NVA Trucks (10 iterations)', () => {
    const state = replayToDecisionPoint(def, baseState, S3.turnIndex, S3.moveIndex);
    const result = runProfileSearch(def, state, S3.playerId, 10);
    printDiagnostics(S3.label, result);

    assert.ok(result.iterations === 10, `expected 10 iterations, got ${result.iterations}`);
    assert.ok(result.diagnostics.applyMoveTimeMs !== undefined, 'applyMoveTimeMs should be present');
  });
});
