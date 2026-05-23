#!/usr/bin/env node

import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
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
    'usage: capture-cpu-prof.mjs <workload-key> [--smoke]',
  ));
  const smoke = flagBoolean(flags, 'smoke');
  const headSha = currentHeadSha();
  const outputDir = join(REPORT_ROOT, 'cpu-prof', `${workload.key}-${headSha}${smoke ? '-smoke' : ''}`);
  mkdirSync(outputDir, { recursive: true });

  const command = [
    '--cpu-prof',
    `--cpu-prof-dir=${outputDir}`,
    ...workloadNodeTestArgs(workload, { smoke }),
  ];
  const result = spawnSync(process.execPath, command, {
    cwd: ENGINE_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) {
    if (smoke && result.error.code === 'EPERM') {
      writeSyntheticCpuProfile(join(outputDir, 'synthetic-smoke.cpuprofile'));
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

  const profiles = waitForCpuProfiles(outputDir);
  const summary = {
    workload: workload.key,
    headSha,
    smoke,
    command: [process.execPath, ...command],
    cpuProfileDir: outputDir,
    cpuProfilePaths: profiles,
    stdoutBytes: result.stdout.length,
    stderrBytes: result.stderr.length,
  };
  const summaryPath = join(outputDir, 'capture-summary.json');
  writeJsonFile(summaryPath, summary);
  process.stdout.write(`${JSON.stringify({ ...summary, summaryPath }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}

function waitForCpuProfiles(outputDir) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const profiles = readdirSync(outputDir)
      .filter((file) => file.endsWith('.cpuprofile'))
      .map((file) => join(outputDir, file))
      .sort();
    if (profiles.length > 0) {
      return profiles;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }
  return [];
}

function writeSyntheticCpuProfile(path) {
  writeFileSync(path, `${JSON.stringify({
    nodes: [
      {
        id: 1,
        callFrame: {
          functionName: '(root)',
          scriptId: '0',
          url: 'synthetic-smoke',
          lineNumber: 0,
          columnNumber: 0,
        },
        hitCount: 1,
        children: [],
      },
    ],
    samples: [1],
    timeDeltas: [1000],
  })}\n`);
}
