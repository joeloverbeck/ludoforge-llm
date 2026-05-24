#!/usr/bin/env node

import { join } from 'node:path';

import { flagBoolean, parseArgs, requireWorkloadArg } from './lib/cli.mjs';
import { currentHeadSha } from './lib/head-sha.mjs';
import { writeJsonFile } from './lib/json.mjs';
import { median, percentile } from './lib/math.mjs';
import { REPORT_ROOT } from './lib/paths.mjs';
import { assertSuccessfulRun, runWorkload } from './lib/run-node-test.mjs';
import { resolveWorkload } from './lib/workloads.mjs';

const PREFIX = '[per-decision-profile] ';
const TAP_DIAGNOSTIC_PREFIX = `# ${PREFIX}`;
const PLAYER_COUNT = 4;

try {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const workload = resolveWorkload(requireWorkloadArg(
    positional,
    'usage: capture-per-decision-cost.mjs <workload-key> [--smoke]',
  ));
  const smoke = flagBoolean(flags, 'smoke');
  const headSha = currentHeadSha();
  const run = runWorkload(workload, {
    smoke,
    env: { ENGINE_PER_DECISION_PROFILE: '1' },
  });
  assertSuccessfulRun(run, `per-decision capture ${workload.key}`);
  const entries = extractProfileEntries(`${run.stdout}\n${run.stderr}`);
  const summary = {
    workload: workload.key,
    headSha,
    smoke,
    command: run.command,
    perDecisionByKind: summarizeEntries(entries, 0),
    warmedPerDecisionByKind: summarizeEntries(entries.slice(PLAYER_COUNT * 2), PLAYER_COUNT * 2),
    entryCount: entries.length,
  };
  const summaryPath = join(REPORT_ROOT, 'per-decision', `${workload.key}-${headSha}${smoke ? '-smoke' : ''}.json`);
  writeJsonFile(summaryPath, summary);
  process.stdout.write(`${JSON.stringify({ ...summary, summaryPath }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}

export function extractProfileEntries(stderr) {
  const entries = [];
  for (const line of stderr.split('\n')) {
    const payload = profilePayload(line);
    if (payload === null) {
      continue;
    }
    const parsed = JSON.parse(payload);
    if (parsed.kind !== 'per-decision-profile' || !Array.isArray(parsed.entries)) {
      throw new Error(`Unexpected per-decision profile payload: ${line}`);
    }
    entries.push(...parsed.entries);
  }
  if (entries.length === 0) {
    throw new Error('No [per-decision-profile] entries were emitted');
  }
  return entries;
}

function profilePayload(line) {
  if (line.startsWith(PREFIX)) {
    return line.slice(PREFIX.length);
  }
  if (line.startsWith(TAP_DIAGNOSTIC_PREFIX)) {
    return line.slice(TAP_DIAGNOSTIC_PREFIX.length);
  }
  return null;
}

function summarizeEntries(entries, skippedInitialEntries) {
  const byKind = new Map();
  for (const entry of entries) {
    const kind = String(entry.decisionKind ?? 'unknown');
    const values = byKind.get(kind) ?? [];
    values.push(Number(entry.wallClockMs));
    byKind.set(kind, values);
  }
  const summary = {};
  for (const [kind, values] of byKind.entries()) {
    summary[kind] = {
      count: values.length,
      skippedInitialEntries,
      p50: median(values),
      p95: percentile(values, 95),
      p99: percentile(values, 99),
      max: values.length === 0 ? null : Math.max(...values),
      median: median(values),
    };
  }
  return summary;
}
