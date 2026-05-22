#!/usr/bin/env node
/**
 * Diagnose whether Spec 180 ARVN standing terms affect selected actions and
 * whether selected actions reduce the targeted enemy margins after execution.
 *
 * Usage:
 *   node diagnose-standing-causal-action.mjs [tracesDir]
 *
 * The input directory should contain trace-*.json files produced by:
 *   node run-tournament.mjs --trace-default all
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadOrCompileGameDef } from './gamedef-cache.mjs';
import { computeAllSeatMargins, stringifyForJson } from './run-seed.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const tracesDir = process.argv[2] ? process.argv[2] : join(HERE, 'traces');
const TERMS = ['hurtCurrentLeader', 'reduceNearestThreat'];
const MATRIX_REF_ID = 'victoryCurrentMargin.currentMargin.$seat';
const TERM_WEIGHT = 600;
const EPSILON = 1e-9;
const MAX_TURNS = 500;
const PLAYER_COUNT = 4;
const EVOLVED_SEAT = 'arvn';
const EVOLVED_PROFILE = 'arvn-baseline';

function resolveRepoRoot() {
  let cursor = HERE;
  for (let depth = 0; depth < 8; depth++) {
    if (existsSync(join(cursor, 'pnpm-workspace.yaml'))) {
      return cursor;
    }
    cursor = join(cursor, '..');
  }
  return process.cwd();
}

const REPO_ROOT = resolveRepoRoot();

const {
  loadGameSpecBundleFromEntrypoint,
  loadGameSpecBundleSourcesFromEntrypoint,
  runGameSpecStagesFromBundle,
} = await import(join(REPO_ROOT, 'packages/engine/dist/src/cnl/index.js'));
const {
  assertValidatedGameDef,
  createGameDefRuntime,
} = await import(join(REPO_ROOT, 'packages/engine/dist/src/kernel/index.js'));
const { PolicyAgent } = await import(join(REPO_ROOT, 'packages/engine/dist/src/agents/index.js'));
const { runGameSteps } = await import(join(REPO_ROOT, 'packages/engine/dist/src/sim/index.js'));
const { defaultPolicyWasmPath, initializePolicyWasmRuntimeSync } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/agents/policy-wasm-runtime-node-loader.js'));

const files = readdirSync(tracesDir)
  .filter((file) => file.startsWith('trace-') && file.endsWith('.json'))
  .sort();

if (files.length === 0) {
  process.stderr.write(`No trace-*.json files in ${tracesDir}\n`);
  process.exit(1);
}

function compileFitlGameDef() {
  const entrypoint = join(REPO_ROOT, 'data', 'games', 'fire-in-the-lake.game-spec.md');
  return loadOrCompileGameDef({
    entrypoint,
    repoRoot: REPO_ROOT,
    cacheDir: join(HERE, '.gamedef-cache'),
    loadSources: loadGameSpecBundleSourcesFromEntrypoint,
    compileFn: () => {
      const bundle = loadGameSpecBundleFromEntrypoint(entrypoint);
      const staged = runGameSpecStagesFromBundle(bundle);
      if (staged.validation.blocked || staged.compilation.blocked) {
        throw new Error('FITL GameSpec failed validation or compilation');
      }
      const compiled = staged.compilation.result;
      if (!compiled?.gameDef) {
        throw new Error('FITL compilation produced no GameDef');
      }
      return compiled.gameDef;
    },
  }).def;
}

function findSeatPlayerIndex(def, seatId) {
  return (def.seats ?? []).findIndex((seat) => seat.id.toLowerCase() === seatId.toLowerCase());
}

function buildSeatProfiles(def, evolvedPlayerIndex) {
  return (def.seats ?? []).map((seat, index) => {
    if (index === evolvedPlayerIndex) {
      return EVOLVED_PROFILE;
    }
    const seatId = seat.id.toLowerCase();
    return `${seatId}-baseline`;
  });
}

function initializeWasm() {
  const wasmPath = defaultPolicyWasmPath();
  initializePolicyWasmRuntimeSync({ wasmPath });
  return true;
}

function isCoup(actionId) {
  return String(actionId).toLowerCase().startsWith('coup');
}

function isMainPhaseAction(move) {
  return move.decisionKind === 'actionSelection' && !isCoup(move.actionId);
}

function candidateCells(candidate, byCandidate) {
  return byCandidate?.[candidate.stableMoveKey]?.perSeatRefs?.[MATRIX_REF_ID];
}

function readyEnemyEntries(candidate, byCandidate) {
  const cells = candidateCells(candidate, byCandidate);
  if (cells === undefined || typeof cells !== 'object') {
    return [];
  }
  return Object.entries(cells)
    .filter(([seatId, cell]) =>
      seatId !== EVOLVED_SEAT
      && cell?.status === 'ready'
      && typeof cell.value === 'number',
    )
    .map(([seatId, cell]) => [seatId, cell.value]);
}

function standingContribution(candidate, termId, byCandidate) {
  const direct = candidate.scoreContributions?.find((entry) => entry.termId === termId);
  if (direct !== undefined && typeof direct.contribution === 'number') {
    return direct.contribution;
  }
  const enemyValues = readyEnemyEntries(candidate, byCandidate).map(([, value]) => value);
  if (enemyValues.length === 0) {
    return 0;
  }
  return -enemyValues.reduce((total, value) => total + value, 0) * TERM_WEIGHT;
}

function totalStandingContribution(candidate, byCandidate) {
  return TERMS.reduce(
    (total, termId) => total + standingContribution(candidate, termId, byCandidate),
    0,
  );
}

function unprunedCandidates(agentDecision) {
  return (agentDecision?.candidates ?? []).filter((candidate) =>
    candidate.pruned !== true && (candidate.prunedBy?.length ?? 0) === 0,
  );
}

function maxScore(candidates, scoreFn) {
  let max = -Infinity;
  for (const candidate of candidates) {
    max = Math.max(max, scoreFn(candidate));
  }
  return max;
}

function candidatesAtScore(candidates, scoreFn, score) {
  return candidates.filter((candidate) => Math.abs(scoreFn(candidate) - score) <= EPSILON);
}

function selectedCandidate(agentDecision) {
  const selectedKey = agentDecision?.selectedStableMoveKey;
  return (agentDecision?.candidates ?? []).find((candidate) => candidate.stableMoveKey === selectedKey);
}

function enemyMarginScore(candidate, byCandidate) {
  const entries = readyEnemyEntries(candidate, byCandidate);
  if (entries.length === 0) {
    return null;
  }
  return entries.reduce((total, [, value]) => total + value, 0);
}

function selectedStandingOptimality(candidates, selected, byCandidate) {
  const scored = candidates
    .map((candidate) => ({ candidate, enemyScore: enemyMarginScore(candidate, byCandidate) }))
    .filter((row) => row.enemyScore !== null);
  if (selected === undefined || scored.length === 0) {
    return { status: 'unknown', bestKeys: [], selectedEnemyScore: null, bestEnemyScore: null };
  }
  const bestEnemyScore = Math.min(...scored.map((row) => row.enemyScore));
  const bestRows = scored.filter((row) => Math.abs(row.enemyScore - bestEnemyScore) <= EPSILON);
  const selectedScore = scored.find((row) => row.candidate.stableMoveKey === selected.stableMoveKey)?.enemyScore ?? null;
  if (selectedScore === null) {
    return { status: 'unknown', bestKeys: bestRows.map((row) => row.candidate.stableMoveKey), selectedEnemyScore: null, bestEnemyScore };
  }
  return {
    status: Math.abs(selectedScore - bestEnemyScore) <= EPSILON ? 'bestOrTiedBest' : 'notBest',
    bestKeys: bestRows.map((row) => row.candidate.stableMoveKey),
    selectedEnemyScore: selectedScore,
    bestEnemyScore,
  };
}

function hasOpponentStandingShift(candidates, byCandidate) {
  const valuesBySeat = new Map();
  for (const candidate of candidates) {
    for (const [seatId, value] of readyEnemyEntries(candidate, byCandidate)) {
      const values = valuesBySeat.get(seatId) ?? [];
      values.push(value);
      valuesBySeat.set(seatId, values);
    }
  }
  return [...valuesBySeat.values()].some((values) => new Set(values).size > 1);
}

function dominantNonStandingRows(candidates, selected, optimality, byCandidate) {
  if (selected === undefined || optimality.status !== 'notBest') {
    return [];
  }
  const selectedNonStanding = selected.score - totalStandingContribution(selected, byCandidate);
  return candidates
    .filter((candidate) => optimality.bestKeys.includes(candidate.stableMoveKey))
    .map((candidate) => {
      const candidateNonStanding = candidate.score - totalStandingContribution(candidate, byCandidate);
      return {
        actionId: candidate.actionId,
        stableMoveKey: candidate.stableMoveKey,
        selectedScore: selected.score,
        candidateScore: candidate.score,
        selectedStandingContribution: totalStandingContribution(selected, byCandidate),
        candidateStandingContribution: totalStandingContribution(candidate, byCandidate),
        selectedNonStandingScore: selectedNonStanding,
        candidateNonStandingScore: candidateNonStanding,
        selectedNonStandingAdvantage: selectedNonStanding - candidateNonStanding,
      };
    })
    .sort((a, b) => b.selectedNonStandingAdvantage - a.selectedNonStandingAdvantage);
}

function analyzeTraceDecisions() {
  const rows = [];
  const summary = {
    traces: files.length,
    mainPhaseDecisions: 0,
    opponentStandingShiftDecisions: 0,
    selectedActionDistribution: {},
    counterfactualFlips: 0,
    counterfactualTiedWithSelected: 0,
    selectedBestOrTiedBest: 0,
    selectedNotBest: 0,
  };

  for (const file of files) {
    const trace = JSON.parse(readFileSync(join(tracesDir, file), 'utf8'));
    const seed = Number(trace.seed ?? file.replace(/^trace-/, '').replace(/\.json$/, ''));
    let mainPhaseIndex = 0;

    for (const move of trace.evolvedMoves ?? []) {
      if (!isMainPhaseAction(move)) {
        continue;
      }
      const currentMainPhaseIndex = mainPhaseIndex++;
      summary.mainPhaseDecisions += 1;

      const candidates = unprunedCandidates(move.agentDecision);
      const byCandidate = move.agentDecision?.previewUsage?.seatMatrix?.byCandidate;
      if (!hasOpponentStandingShift(candidates, byCandidate)) {
        continue;
      }
      summary.opponentStandingShiftDecisions += 1;
      summary.selectedActionDistribution[move.actionId] =
        (summary.selectedActionDistribution[move.actionId] ?? 0) + 1;

      const selected = selectedCandidate(move.agentDecision);
      const adjusted = (candidate) => candidate.score - totalStandingContribution(candidate, byCandidate);
      const adjustedMax = maxScore(candidates, adjusted);
      const adjustedWinners = candidatesAtScore(candidates, adjusted, adjustedMax);
      const selectedStillWins = selected !== undefined
        && adjustedWinners.some((candidate) => candidate.stableMoveKey === selected.stableMoveKey);
      const selectedTiedAfterRemoval = selectedStillWins && adjustedWinners.length > 1;
      const counterfactualFlip = !selectedStillWins;
      if (counterfactualFlip) {
        summary.counterfactualFlips += 1;
      }
      if (selectedTiedAfterRemoval) {
        summary.counterfactualTiedWithSelected += 1;
      }

      const optimality = selectedStandingOptimality(candidates, selected, byCandidate);
      if (optimality.status === 'bestOrTiedBest') {
        summary.selectedBestOrTiedBest += 1;
      } else if (optimality.status === 'notBest') {
        summary.selectedNotBest += 1;
      }

      rows.push({
        seed,
        mainPhaseIndex: currentMainPhaseIndex,
        actionId: move.actionId,
        selectedStableMoveKey: move.agentDecision?.selectedStableMoveKey ?? null,
        selectedProjectedEnemyCells: Object.fromEntries(readyEnemyEntries(selected ?? {}, byCandidate)),
        selectedEnemyMarginScore: optimality.selectedEnemyScore,
        bestEnemyMarginScore: optimality.bestEnemyScore,
        standingOptimality: optimality.status,
        counterfactualFlip,
        counterfactualWinners: adjustedWinners.map((candidate) => ({
          actionId: candidate.actionId,
          stableMoveKey: candidate.stableMoveKey,
          adjustedScore: adjusted(candidate),
        })),
        dominantNonStanding: dominantNonStandingRows(candidates, selected, optimality, byCandidate).slice(0, 3),
      });
    }
  }
  return { summary, rows };
}

function getDecisionActionId(entry) {
  if (entry.decision?.kind === 'actionSelection') {
    return entry.decision.actionId ?? entry.decision.move?.actionId ?? 'unknown';
  }
  return entry.decision?.kind ?? 'unknown';
}

function getOutcomeRows(def, runtime, seeds) {
  const evolvedPlayerIndex = findSeatPlayerIndex(def, EVOLVED_SEAT);
  if (evolvedPlayerIndex < 0) {
    throw new Error(`Seat "${EVOLVED_SEAT}" not found in GameDef`);
  }
  const seatProfiles = buildSeatProfiles(def, evolvedPlayerIndex);
  const agents = seatProfiles.map((profileId) => new PolicyAgent({ profileId, traceLevel: 'verbose' }));
  const byKey = new Map();

  for (const seed of seeds) {
    let previousState = null;
    let mainPhaseIndex = 0;
    let pendingAction = null;
    const iterator = runGameSteps({
      def,
      seed,
      agents,
      maxTurns: MAX_TURNS,
      playerCount: PLAYER_COUNT,
      runtime,
    });
    for (let step = iterator.next(); !step.done; step = iterator.next()) {
      if (step.value.kind === 'auto' || step.value.kind === 'recovery') {
        previousState = step.value.state;
        continue;
      }
      if (step.value.kind !== 'player') {
        if (pendingAction !== null) {
          byKey.set(`${seed}:${pendingAction.mainPhaseIndex}`, {
            ...pendingAction,
            after: computeAllSeatMargins(def, runtime, step.value.state),
          });
          pendingAction = null;
        }
        previousState = step.value.state;
        continue;
      }
      const decisionLog = step.value.decisionLog;
      const actionId = getDecisionActionId(decisionLog);
      if (decisionLog.decision?.kind === 'actionSelection') {
        if (pendingAction !== null) {
          byKey.set(`${seed}:${pendingAction.mainPhaseIndex}`, {
            ...pendingAction,
            after: previousState === null ? null : computeAllSeatMargins(def, runtime, previousState),
          });
          pendingAction = null;
        }
        if (Number(decisionLog.playerId) === evolvedPlayerIndex && !isCoup(actionId)) {
          pendingAction = {
            seed,
            mainPhaseIndex,
            actionId,
            before: previousState === null ? null : computeAllSeatMargins(def, runtime, previousState),
          };
          mainPhaseIndex += 1;
        }
      }
      previousState = step.value.state;
    }
  }
  return byKey;
}

function attachOutcomeDeltas(rows, outcomeRows) {
  return rows.map((row) => {
    const outcome = outcomeRows.get(`${row.seed}:${row.mainPhaseIndex}`);
    const deltas = {};
    for (const seatId of Object.keys(row.selectedProjectedEnemyCells)) {
      const before = outcome?.before?.[seatId];
      const after = outcome?.after?.[seatId];
      deltas[seatId] = typeof before === 'number' && typeof after === 'number'
        ? { before, after, delta: after - before }
        : { before: before ?? null, after: after ?? null, delta: null };
    }
    return { ...row, outcomeDeltas: deltas };
  });
}

function summarizeDeltas(rows) {
  const summary = {
    targetedSeatRows: 0,
    improved: 0,
    worsened: 0,
    unchanged: 0,
    unknown: 0,
    bySeat: {},
  };
  for (const row of rows) {
    for (const [seatId, delta] of Object.entries(row.outcomeDeltas)) {
      summary.targetedSeatRows += 1;
      summary.bySeat[seatId] ??= { improved: 0, worsened: 0, unchanged: 0, unknown: 0 };
      let bucket = 'unknown';
      if (typeof delta.delta === 'number') {
        bucket = delta.delta < 0 ? 'improved' : delta.delta > 0 ? 'worsened' : 'unchanged';
      }
      summary[bucket] += 1;
      summary.bySeat[seatId][bucket] += 1;
    }
  }
  return summary;
}

function pct(numerator, denominator) {
  if (denominator === 0) return '0.0%';
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function formatDistribution(distribution) {
  return Object.entries(distribution)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([actionId, count]) => `| \`${actionId}\` | ${count} |`)
    .join('\n');
}

const wasmEnabled = initializeWasm();
const def = assertValidatedGameDef(compileFitlGameDef());
const runtime = createGameDefRuntime(def);
const { summary, rows } = analyzeTraceDecisions();
const seeds = [...new Set(rows.map((row) => row.seed))].sort((a, b) => a - b);
const outcomeRows = getOutcomeRows(def, runtime, seeds);
const rowsWithDeltas = attachOutcomeDeltas(rows, outcomeRows);
const deltaSummary = summarizeDeltas(rowsWithDeltas);

console.log(`traces: ${summary.traces}`);
console.log(`wasmEnabled: ${wasmEnabled}`);
console.log(`mainPhaseActionSelectionDecisions: ${summary.mainPhaseDecisions}`);
console.log(`opponentStandingShiftDecisions: ${summary.opponentStandingShiftDecisions}`);
console.log(`counterfactualSelectionFlips: ${summary.counterfactualFlips} (${pct(summary.counterfactualFlips, summary.opponentStandingShiftDecisions)})`);
console.log(`counterfactualSelectedTiedForBestAfterRemoval: ${summary.counterfactualTiedWithSelected} (${pct(summary.counterfactualTiedWithSelected, summary.opponentStandingShiftDecisions)})`);
console.log(`selectedStandingBestOrTiedBest: ${summary.selectedBestOrTiedBest} (${pct(summary.selectedBestOrTiedBest, summary.opponentStandingShiftDecisions)})`);
console.log(`selectedStandingNotBest: ${summary.selectedNotBest} (${pct(summary.selectedNotBest, summary.opponentStandingShiftDecisions)})`);
console.log('');
console.log('| Selected action | Opponent-shift decisions |');
console.log('|---|---:|');
console.log(formatDistribution(summary.selectedActionDistribution));
console.log('');
console.log('| Outcome delta class | Targeted opponent-seat rows |');
console.log('|---|---:|');
console.log(`| improved (enemy margin decreased) | ${deltaSummary.improved} |`);
console.log(`| unchanged | ${deltaSummary.unchanged} |`);
console.log(`| worsened (enemy margin increased) | ${deltaSummary.worsened} |`);
console.log(`| unknown | ${deltaSummary.unknown} |`);
console.log('');
console.log('| Opponent seat | Improved | Unchanged | Worsened | Unknown |');
console.log('|---|---:|---:|---:|---:|');
for (const [seatId, seatSummary] of Object.entries(deltaSummary.bySeat).sort(([a], [b]) => a.localeCompare(b))) {
  console.log(`| \`${seatId}\` | ${seatSummary.improved} | ${seatSummary.unchanged} | ${seatSummary.worsened} | ${seatSummary.unknown} |`);
}
console.log('');
console.log('```json');
console.log(stringifyForJson({ summary, deltaSummary, rows: rowsWithDeltas }));
console.log('```');
