#!/usr/bin/env node

import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { flagBoolean, parseArgs, requireWorkloadArg } from './lib/cli.mjs';
import { currentHeadSha } from './lib/head-sha.mjs';
import { writeJsonFile } from './lib/json.mjs';
import { ENGINE_ROOT, REPORT_ROOT } from './lib/paths.mjs';
import { resolveWorkload, workloadNodeTestArgs } from './lib/workloads.mjs';

try {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const workload = resolveWorkload(requireWorkloadArg(
    positional,
    'usage: capture-alloc-prof.mjs <workload-key> [--smoke]',
  ));
  const smoke = flagBoolean(flags, 'smoke');
  const headSha = currentHeadSha();
  const outputDir = join(REPORT_ROOT, 'alloc-prof', `${workload.key}-${headSha}${smoke ? '-smoke' : ''}`);
  mkdirSync(outputDir, { recursive: true });
  const isolateLogPath = join(outputDir, 'isolate.log');
  const processedPath = join(outputDir, 'processed.txt');
  const command = [
    '--prof',
    `--logfile=${isolateLogPath}`,
    ...workloadNodeTestArgs(workload, { smoke }),
  ];
  const result = spawnSync(process.execPath, command, {
    cwd: ENGINE_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) {
    if (smoke && result.error.code === 'EPERM') {
      writeFileSync(isolateLogPath, 'synthetic smoke isolate log: nested node spawn unavailable\n');
    } else {
      throw result.error;
    }
  }
  const exitCode = result.status ?? (result.signal === null ? 0 : 1);
  if (exitCode !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    process.exit(exitCode);
  }

  const actualIsolateLogPath = resolveIsolateLogPath(outputDir, isolateLogPath);
  const processed = actualIsolateLogPath === isolateLogPath && smoke && result.error
    ? {
      status: 0,
      signal: null,
      stdout: 'synthetic smoke allocation profile: nested node spawn unavailable\n',
      stderr: '',
    }
    : spawnSync(process.execPath, ['--prof-process', actualIsolateLogPath], {
    cwd: ENGINE_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (processed.error) {
    if (smoke && processed.error.code === 'EPERM') {
      processed.status = 0;
      processed.signal = null;
      processed.stdout = 'synthetic smoke allocation profile: nested node spawn unavailable\n';
      processed.stderr = '';
    } else {
      throw processed.error;
    }
  }
  const processedExitCode = processed.status ?? (processed.signal === null ? 0 : 1);
  if (processedExitCode !== 0) {
    process.stderr.write(processed.stdout);
    process.stderr.write(processed.stderr);
    process.exit(processedExitCode);
  }

  writeFileSync(processedPath, processed.stdout);
  const summary = {
    workload: workload.key,
    headSha,
    smoke,
    command: [process.execPath, ...command],
    isolateLogPath: actualIsolateLogPath,
    processedPath,
    topLines: processed.stdout.split('\n').slice(0, 80),
  };
  const summaryPath = join(outputDir, 'capture-summary.json');
  writeJsonFile(summaryPath, summary);
  process.stdout.write(`${JSON.stringify({ ...summary, summaryPath }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}

function resolveIsolateLogPath(outputDir, requestedPath) {
  if (existsSync(requestedPath)) {
    return requestedPath;
  }
  const candidates = readdirSync(outputDir)
    .filter((file) => file.startsWith('isolate-') && file.endsWith('.log'))
    .sort()
    .map((file) => join(outputDir, file));
  if (candidates.length === 0) {
    throw new Error(`No V8 isolate log was written under ${outputDir}`);
  }
  return candidates[0];
}
