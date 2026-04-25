#!/usr/bin/env node
/**
 * Derives the current action-selection candidate-count distribution from
 * checked-in ARVN campaign trace summaries. The summaries are diagnostic
 * evidence only: they include candidate counts, but not replayable GameState.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

const DEFAULT_TRACE_PATH = 'campaigns/fitl-arvn-agent-evolution/traces/trace-1000.json';
const inputPath = process.argv[2] ?? DEFAULT_TRACE_PATH;

if (!existsSync(inputPath)) {
  process.stderr.write(`ERROR: trace path does not exist: ${inputPath}\n`);
  process.exit(1);
}

const traceFiles = statSync(inputPath).isDirectory()
  ? readdirSync(inputPath)
      .filter((name) => name.endsWith('.json'))
      .sort((left, right) => left.localeCompare(right))
      .map((name) => join(inputPath, name))
  : [inputPath];

const counts = [];

for (const traceFile of traceFiles) {
  const trace = JSON.parse(readFileSync(traceFile, 'utf8'));
  const evolvedMoves = Array.isArray(trace.evolvedMoves) ? trace.evolvedMoves : [];
  for (const move of evolvedMoves) {
    if (move?.decisionKind !== 'actionSelection') {
      continue;
    }
    const count = readCandidateCount(move);
    if (count !== null) {
      counts.push(count);
    }
  }
}

if (counts.length === 0) {
  process.stderr.write(`ERROR: no action-selection candidate counts found in ${inputPath}\n`);
  process.exit(1);
}

counts.sort((left, right) => left - right);

const summary = {
  min: counts[0],
  p25: percentile(counts, 0.25),
  median: percentile(counts, 0.5),
  p75: percentile(counts, 0.75),
  max: counts[counts.length - 1],
  total: counts.length,
};

console.log(
  `K_PREVIEW_TOPK justification: min=${summary.min}, p25=${summary.p25}, median=${summary.median}, ` +
  `p75=${summary.p75}, max=${summary.max} (over ${summary.total} microturns from ${describeSource(inputPath, traceFiles)}). ` +
  'Spec 145 cites 8-12 typical; current default K=4.',
);

if (summary.median < 4) {
  process.stderr.write(
    `ERROR: median candidate count ${summary.median} is below current default K=4; preview.topK may be over-tight for this corpus.\n`,
  );
  process.exit(1);
}

function readCandidateCount(move) {
  const initialCandidateCount = move?.agentDecision?.initialCandidateCount;
  if (Number.isSafeInteger(initialCandidateCount) && initialCandidateCount > 0) {
    return initialCandidateCount;
  }
  const legalMoveCount = move?.legalMoveCount;
  if (Number.isSafeInteger(legalMoveCount) && legalMoveCount > 0) {
    return legalMoveCount;
  }
  return null;
}

function percentile(sortedValues, quantile) {
  const index = Math.floor((sortedValues.length - 1) * quantile);
  return sortedValues[index];
}

function describeSource(sourcePath, files) {
  if (files.length === 1) {
    return sourcePath;
  }
  return `${sourcePath} (${files.length} files, ${basename(files[0])}..${basename(files[files.length - 1])})`;
}
