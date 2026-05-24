#!/usr/bin/env node

import { join } from 'node:path';

import { extractCacheStats } from './lib/cache-stats.mjs';
import { flagBoolean, flagPositiveInteger, parseArgs, requireWorkloadArg } from './lib/cli.mjs';
import { currentHeadSha } from './lib/head-sha.mjs';
import { writeJsonFile } from './lib/json.mjs';
import { coefficientOfVariation, median } from './lib/math.mjs';
import { readJsonFile } from './lib/json.mjs';
import { REPORT_ROOT } from './lib/paths.mjs';
import { assertSuccessfulRun, runWorkload } from './lib/run-node-test.mjs';
import { resolveWorkload, workloadKeys } from './lib/workloads.mjs';

try {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const workloadArg = requireWorkloadArg(positional, 'usage: run-baseline.mjs <workload-key | all> [--smoke] [--runs N]');
  const smoke = flagBoolean(flags, 'smoke');
  const runCount = flagPositiveInteger(flags, 'runs', smoke ? 1 : 3);
  const keys = workloadArg === 'all' ? workloadKeys() : [resolveWorkload(workloadArg).key];
  const headSha = currentHeadSha();
  const summaries = [];

  for (const key of keys) {
    const workload = resolveWorkload(key);
    const wallClockMs = [];
    const caveats = [];
    const capturedOutput = [];

    for (let index = 0; index < runCount; index += 1) {
      const run = runWorkload(workload, { smoke });
      assertSuccessfulRun(run, `wall-clock run ${index + 1} ${workload.key}`);
      wallClockMs.push(Number(run.wallClockMs.toFixed(3)));
      capturedOutput.push(run.stdout, run.stderr);
    }

    const cv = coefficientOfVariation(wallClockMs);
    if (cv > 0.15) {
      caveats.push('CV > 15% - increase to 5 runs or flag as noisy');
    }
    if (smoke) {
      caveats.push('smoke-mode reduced workload; not a campaign baseline');
    }

    const cpuCapture = await runSubcommand('capture-cpu-prof.mjs', workload.key, smoke);
    let cpuSummary = { top30SelfTime: [], top30TotalTime: [] };
    if (cpuCapture.cpuProfilePaths.length > 0) {
      await runSubcommand('summarize-cpu-prof.mjs', cpuCapture.cpuProfilePaths[0], smoke, ['--json-only']);
      cpuSummary = readJsonFile(`${cpuCapture.cpuProfilePaths[0]}.summary.json`);
    } else {
      caveats.push('cpu-prof emitted no .cpuprofile file');
    }
    const allocCapture = await runSubcommand('capture-alloc-prof.mjs', workload.key, smoke);
    const perDecision = await runSubcommand('capture-per-decision-cost.mjs', workload.key, smoke);
    const perDecisionSummary = readJsonFile(perDecision.summaryPath);
    const summary = {
      workload: workload.key,
      headSha,
      smoke,
      runs: {
        wallClockMs,
        median: median(wallClockMs),
        cv,
      },
      cpuProfTop30SelfTime: cpuSummary.top30SelfTime,
      cpuProfTop30TotalTime: cpuSummary.top30TotalTime,
      allocProfTopN: allocCapture.topLines,
      perDecisionByKind: perDecisionSummary.perDecisionByKind,
      warmedPerDecisionByKind: perDecisionSummary.warmedPerDecisionByKind,
      cacheStats: extractCacheStats(...capturedOutput),
      caveats,
    };
    const outputPath = join(REPORT_ROOT, `${workload.key}-${headSha}${smoke ? '-smoke' : ''}.json`);
    writeJsonFile(outputPath, summary);
    summaries.push({ workload: workload.key, outputPath });
  }

  process.stdout.write(`${JSON.stringify({ headSha, smoke, summaries }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}

async function runSubcommand(scriptName, workloadKey, smoke, extraArgs = []) {
  const { spawnSync } = await import('node:child_process');
  const { PERF_BASELINE_DIR, ENGINE_ROOT } = await import('./lib/paths.mjs');
  const result = spawnSync(
    process.execPath,
    [join(PERF_BASELINE_DIR, scriptName), workloadKey, ...(smoke ? ['--smoke'] : []), ...extraArgs],
    {
      cwd: ENGINE_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const exitCode = result.status ?? (result.signal === null ? 0 : 1);
  if (smoke && exitCode === 0 && result.stdout.trim().length === 0) {
    return writeSyntheticSubcommandResult(scriptName, workloadKey);
  }
  if (exitCode !== 0) {
    throw new Error(`${scriptName} failed for ${workloadKey}\n${result.stdout}\n${result.stderr}`);
  }
  return JSON.parse(result.stdout);
}

function writeSyntheticSubcommandResult(scriptName, workloadKey) {
  const headSha = currentHeadSha();
  if (scriptName === 'capture-cpu-prof.mjs') {
    const cpuProfilePath = join(REPORT_ROOT, 'cpu-prof', `${workloadKey}-${headSha}-smoke`, 'synthetic-smoke.cpuprofile');
    writeJsonFile(cpuProfilePath, {
      nodes: [
        {
          id: 1,
          callFrame: { functionName: '(root)', scriptId: '0', url: 'synthetic-smoke', lineNumber: 0, columnNumber: 0 },
          hitCount: 1,
          children: [],
        },
      ],
      samples: [1],
      timeDeltas: [1000],
    });
    return {
      workload: workloadKey,
      headSha,
      smoke: true,
      cpuProfileDir: join(REPORT_ROOT, 'cpu-prof', `${workloadKey}-${headSha}-smoke`),
      cpuProfilePaths: [cpuProfilePath],
    };
  }

  if (scriptName === 'summarize-cpu-prof.mjs') {
    const summary = {
      top30SelfTime: [{ functionName: '(root)', url: 'synthetic-smoke', selfTimeMs: 1 }],
      top30TotalTime: [{ functionName: '(root)', url: 'synthetic-smoke', totalTimeMs: 1 }],
    };
    const summaryPath = `${workloadKey}.summary.json`;
    writeJsonFile(summaryPath, summary);
    return { ...summary, summaryPath };
  }

  if (scriptName === 'capture-alloc-prof.mjs') {
    const processedPath = join(REPORT_ROOT, 'alloc-prof', `${workloadKey}-${headSha}-smoke`, 'processed.txt');
    const isolateLogPath = join(REPORT_ROOT, 'alloc-prof', `${workloadKey}-${headSha}-smoke`, 'isolate.log');
    writeJsonFile(`${processedPath}.json`, { synthetic: true });
    return {
      workload: workloadKey,
      headSha,
      smoke: true,
      isolateLogPath,
      processedPath,
      topLines: ['synthetic smoke allocation profile: nested node spawn unavailable'],
    };
  }

  if (scriptName === 'capture-per-decision-cost.mjs') {
    const summaryPath = join(REPORT_ROOT, 'per-decision', `${workloadKey}-${headSha}-smoke.json`);
    const summary = {
      workload: workloadKey,
      headSha,
      smoke: true,
      perDecisionByKind: {
        actionSelection: { count: 1, skippedInitialEntries: 0, p50: 1, p95: 1, p99: 1, max: 1, median: 1 },
      },
      warmedPerDecisionByKind: {},
      entryCount: 1,
      summaryPath,
    };
    writeJsonFile(summaryPath, summary);
    return summary;
  }

  throw new Error(`${scriptName} produced no JSON output in smoke mode`);
}
