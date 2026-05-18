#!/usr/bin/env node
/**
 * Aggregate Spec 180 standing-role witness metrics from ARVN campaign traces.
 *
 * Usage:
 *   node diagnose-standing-witness.mjs [tracesDir]
 *
 * The input directory should contain trace-*.json files produced by:
 *   node run-tournament.mjs --trace-default all
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const tracesDir = process.argv[2] ? process.argv[2] : join(HERE, 'traces');
const TERMS = ['hurtCurrentLeader', 'reduceNearestThreat'];
const MATRIX_REF_ID = 'victoryCurrentMargin.currentMargin.$seat';
const TERM_WEIGHT = 200;

const files = readdirSync(tracesDir)
  .filter((file) => file.startsWith('trace-') && file.endsWith('.json'))
  .sort();

if (files.length === 0) {
  process.stderr.write(`No trace-*.json files in ${tracesDir}\n`);
  process.exit(1);
}

const isCoup = (actionId) => String(actionId).toLowerCase().startsWith('coup');

const summary = {
  traces: files.length,
  mainPhaseDecisions: 0,
  decisionsWithSeatMatrix: 0,
  decisionsWithOpponentStandingShift: 0,
  decisionsWithBothTermsDifferentiating: 0,
  decisionsWithAnyTermDifferentiating: 0,
  matrixCells: {
    ready: 0,
    unavailable: 0,
    byStatus: {},
  },
  termDifferentiation: Object.fromEntries(TERMS.map((term) => [term, 0])),
  perSeed: {},
};

function addStatus(status) {
  summary.matrixCells.byStatus[status] = (summary.matrixCells.byStatus[status] ?? 0) + 1;
  if (status === 'ready') {
    summary.matrixCells.ready += 1;
  } else {
    summary.matrixCells.unavailable += 1;
  }
}

function roleMatrixContribution(candidate, byCandidate, evolvedSeat) {
  const cells = byCandidate?.[candidate.stableMoveKey]?.perSeatRefs?.[MATRIX_REF_ID];
  if (cells === undefined || typeof cells !== 'object') {
    return undefined;
  }
  const targetValues = [];
  for (const [seatId, cell] of Object.entries(cells)) {
    if (seatId === evolvedSeat || cell.status !== 'ready' || typeof cell.value !== 'number') {
      continue;
    }
    targetValues.push(cell.value);
  }
  if (targetValues.length === 0) {
    return undefined;
  }
  return -targetValues.reduce((total, value) => total + value, 0) * TERM_WEIGHT;
}

function contributionValues(candidates, termId, byCandidate, evolvedSeat) {
  const values = [];
  for (const candidate of candidates) {
    const contribution = candidate.scoreContributions?.find((entry) => entry.termId === termId);
    if (contribution !== undefined && typeof contribution.contribution === 'number') {
      values.push(contribution.contribution);
      continue;
    }
    const reconstructed = roleMatrixContribution(candidate, byCandidate, evolvedSeat);
    if (reconstructed !== undefined) {
      values.push(reconstructed);
    }
  }
  return values;
}

function hasDistinctNumericValues(values) {
  return new Set(values).size > 1;
}

function decisionHasOpponentStandingShift(move, evolvedSeat) {
  const byCandidate = move.agentDecision?.previewUsage?.seatMatrix?.byCandidate;
  if (byCandidate === undefined || typeof byCandidate !== 'object') {
    return false;
  }

  const valuesBySeat = new Map();
  for (const candidate of move.agentDecision?.candidates ?? []) {
    const perSeatRefs = byCandidate[candidate.stableMoveKey]?.perSeatRefs;
    const cells = perSeatRefs?.[MATRIX_REF_ID];
    if (cells === undefined || typeof cells !== 'object') {
      continue;
    }
    for (const [seatId, cell] of Object.entries(cells)) {
      addStatus(String(cell.status ?? 'missing'));
      if (seatId === evolvedSeat || cell.status !== 'ready' || typeof cell.value !== 'number') {
        continue;
      }
      const values = valuesBySeat.get(seatId) ?? [];
      values.push(cell.value);
      valuesBySeat.set(seatId, values);
    }
  }

  for (const values of valuesBySeat.values()) {
    if (hasDistinctNumericValues(values)) {
      return true;
    }
  }
  return false;
}

for (const file of files) {
  const trace = JSON.parse(readFileSync(join(tracesDir, file), 'utf8'));
  const seed = String(trace.seed ?? file.replace(/^trace-/, '').replace(/\.json$/, ''));
  const evolvedSeat = String(trace.evolvedSeat ?? 'arvn').toLowerCase();
  const seedSummary = {
    mainPhaseDecisions: 0,
    decisionsWithOpponentStandingShift: 0,
    decisionsWithAnyTermDifferentiating: 0,
  };

  for (const move of trace.evolvedMoves ?? []) {
    if (move.decisionKind !== 'actionSelection' || isCoup(move.actionId)) {
      continue;
    }
    summary.mainPhaseDecisions += 1;
    seedSummary.mainPhaseDecisions += 1;

    if (move.agentDecision?.previewUsage?.seatMatrix !== undefined) {
      summary.decisionsWithSeatMatrix += 1;
    }

    const hasShift = decisionHasOpponentStandingShift(move, evolvedSeat);
    if (hasShift) {
      summary.decisionsWithOpponentStandingShift += 1;
      seedSummary.decisionsWithOpponentStandingShift += 1;
    }

    const candidates = move.agentDecision?.candidates ?? [];
    const byCandidate = move.agentDecision?.previewUsage?.seatMatrix?.byCandidate;
    const termHits = TERMS.map((term) => {
      const differentiates = hasDistinctNumericValues(
        contributionValues(candidates, term, byCandidate, evolvedSeat),
      );
      if (differentiates) {
        summary.termDifferentiation[term] += 1;
      }
      return differentiates;
    });

    if (termHits.some(Boolean)) {
      summary.decisionsWithAnyTermDifferentiating += 1;
      seedSummary.decisionsWithAnyTermDifferentiating += 1;
    }
    if (termHits.every(Boolean)) {
      summary.decisionsWithBothTermsDifferentiating += 1;
    }
  }

  summary.perSeed[seed] = seedSummary;
}

function pct(numerator, denominator) {
  if (denominator === 0) return '0.0%';
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

console.log(`traces: ${summary.traces}`);
console.log(`mainPhaseActionSelectionDecisions: ${summary.mainPhaseDecisions}`);
console.log(`decisionsWithSeatMatrix: ${summary.decisionsWithSeatMatrix} (${pct(summary.decisionsWithSeatMatrix, summary.mainPhaseDecisions)})`);
console.log(`decisionsWithOpponentStandingShift: ${summary.decisionsWithOpponentStandingShift}`);
console.log(`decisionsWithAnyTermDifferentiating: ${summary.decisionsWithAnyTermDifferentiating} (${pct(summary.decisionsWithAnyTermDifferentiating, summary.decisionsWithOpponentStandingShift)} of shift decisions)`);
console.log(`decisionsWithBothTermsDifferentiating: ${summary.decisionsWithBothTermsDifferentiating} (${pct(summary.decisionsWithBothTermsDifferentiating, summary.decisionsWithOpponentStandingShift)} of shift decisions)`);
console.log('');
console.log('| Term | Decisions differentiated | Share of opponent-shift decisions |');
console.log('|---|---:|---:|');
for (const term of TERMS) {
  console.log(`| \`${term}\` | ${summary.termDifferentiation[term]} | ${pct(summary.termDifferentiation[term], summary.decisionsWithOpponentStandingShift)} |`);
}
console.log('');
console.log('| Matrix status | Cells |');
console.log('|---|---:|');
for (const [status, count] of Object.entries(summary.matrixCells.byStatus).sort(([a], [b]) => a.localeCompare(b))) {
  console.log(`| \`${status}\` | ${count} |`);
}
console.log('');
console.log('| Seed | Main-phase decisions | Opponent-shift decisions | Any term differentiated |');
console.log('|---:|---:|---:|---:|');
for (const [seed, stats] of Object.entries(summary.perSeed).sort(([a], [b]) => Number(a) - Number(b))) {
  console.log(`| ${seed} | ${stats.mainPhaseDecisions} | ${stats.decisionsWithOpponentStandingShift} | ${stats.decisionsWithAnyTermDifferentiating} |`);
}
