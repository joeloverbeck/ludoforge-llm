#!/usr/bin/env node
/**
 * Aggregate previewUsage.readyRefStats across ARVN evolved action-selection
 * decisions from traces produced by run-tournament.mjs --trace-default all.
 *
 * Usage:
 *   node diagnose-ready-ref-stats.mjs [tracesDir]
 *
 * tracesDir defaults to ./traces relative to this script. The aggregation
 * intentionally matches the Phase 0/2 Spec 179 witness boundary: main-phase
 * actionSelection decisions for the evolved seat, excluding coup forced
 * decisions and microturn choices.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const tracesDir = process.argv[2] ? process.argv[2] : join(HERE, 'traces');

const files = readdirSync(tracesDir)
  .filter((f) => f.startsWith('trace-') && f.endsWith('.json'))
  .sort();

if (files.length === 0) {
  process.stderr.write(`No trace-*.json files in ${tracesDir}\n`);
  process.exit(1);
}

const isCoup = (actionId) => String(actionId).toLowerCase().startsWith('coup');

const statsByRef = new Map();
let mainPhaseDecisionCount = 0;
let decisionsWithReadyRefStats = 0;

function initStats() {
  return {
    reportingDecisions: 0,
    totalReadyCount: 0,
    totalCandidateCount: 0,
    uniformDecisions: 0,
    differentiatingDecisions: 0,
    totalRange: 0,
  };
}

for (const file of files) {
  const trace = JSON.parse(readFileSync(join(tracesDir, file), 'utf8'));
  for (const move of trace.evolvedMoves ?? []) {
    if (move.decisionKind !== 'actionSelection' || isCoup(move.actionId)) {
      continue;
    }

    mainPhaseDecisionCount += 1;
    const previewUsage = move.agentDecision?.previewUsage;
    const readyRefStats = previewUsage?.readyRefStats;
    if (!readyRefStats || typeof readyRefStats !== 'object') {
      continue;
    }

    decisionsWithReadyRefStats += 1;
    const candidateCount = Number(previewUsage.evaluatedCandidateCount ?? 0);
    for (const [refId, refStats] of Object.entries(readyRefStats)) {
      const aggregate = statsByRef.get(refId) ?? initStats();
      aggregate.reportingDecisions += 1;
      aggregate.totalReadyCount += Number(refStats.readyCount ?? 0);
      aggregate.totalCandidateCount += candidateCount;
      aggregate.totalRange += Number(refStats.range ?? 0);
      if (Number(refStats.distinctValueCount ?? 0) > 1) {
        aggregate.differentiatingDecisions += 1;
      } else {
        aggregate.uniformDecisions += 1;
      }
      statsByRef.set(refId, aggregate);
    }
  }
}

function pct(numerator, denominator) {
  if (denominator === 0) {
    return '0.0%';
  }
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function ratioPct(numerator, denominator) {
  if (denominator === 0) {
    return '0.0%';
  }
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

console.log(`traces: ${files.length}`);
console.log(`mainPhaseActionSelectionDecisions: ${mainPhaseDecisionCount}`);
console.log(`decisionsWithReadyRefStats: ${decisionsWithReadyRefStats}`);
console.log('');
console.log('| Preview ref | Decisions reporting stats | Ready / candidate ratio | Decisions with distinct=1 (uniform) | Decisions with distinct>1 (differentiating) | Avg range |');
console.log('|---|---:|---:|---:|---:|---:|');

for (const [refId, stats] of [...statsByRef.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const reporting = `${stats.reportingDecisions} / ${mainPhaseDecisionCount} (${pct(stats.reportingDecisions, mainPhaseDecisionCount)})`;
  const readyRatio = ratioPct(stats.totalReadyCount, stats.totalCandidateCount);
  const uniform = `${stats.uniformDecisions} (${pct(stats.uniformDecisions, stats.reportingDecisions)})`;
  const differentiating = `${stats.differentiatingDecisions} (${pct(stats.differentiatingDecisions, stats.reportingDecisions)})`;
  const avgRange = stats.reportingDecisions === 0
    ? '0.00'
    : (stats.totalRange / stats.reportingDecisions).toFixed(2);
  console.log(`| \`${refId}\` | ${reporting} | ${readyRatio} | ${uniform} | ${differentiating} | ${avgRange} |`);
}
