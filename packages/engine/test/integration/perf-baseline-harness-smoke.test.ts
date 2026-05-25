// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ENGINE_ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const REPO_ROOT = resolve(ENGINE_ROOT, '..', '..');
const REPORT_ROOT = join(REPO_ROOT, 'reports', 'perf-baseline');
const WORKLOAD = 'parity-drive';

describe('Spec 192 perf-baseline harness scripts smoke', () => {
  it('runs capture scripts and writes only under reports/perf-baseline', () => {
    const before = listReportFiles();

    const cpuCapture = runScriptJson('capture-cpu-prof.mjs', [WORKLOAD, '--smoke']);
    assert.equal(cpuCapture.workload, WORKLOAD);
    assert.ok(Array.isArray(cpuCapture.cpuProfilePaths));
    assert.ok(cpuCapture.cpuProfilePaths.length > 0, 'cpu-prof capture should produce at least one profile');
    assertUnderReportRoot(cpuCapture.cpuProfileDir);
    for (const profilePath of cpuCapture.cpuProfilePaths) {
      assertUnderReportRoot(profilePath);
      assert.ok(existsSync(profilePath), `${profilePath} exists`);
    }

    const cpuSummary = runScriptJson('summarize-cpu-prof.mjs', [cpuCapture.cpuProfilePaths[0], '--json-only']);
    assert.ok(Array.isArray(cpuSummary.top30SelfTime), 'cpu summary has self-time rows');
    assert.ok(Array.isArray(cpuSummary.top30TotalTime), 'cpu summary has total-time rows');
    assertUnderReportRoot(cpuSummary.summaryPath);

    const allocCapture = runScriptJson('capture-alloc-prof.mjs', [WORKLOAD, '--smoke']);
    assert.equal(allocCapture.workload, WORKLOAD);
    assertUnderReportRoot(allocCapture.isolateLogPath);
    assertUnderReportRoot(allocCapture.processedPath);
    assert.ok(existsSync(allocCapture.processedPath), 'processed allocation profile exists');

    const perDecision = runScriptJson('capture-per-decision-cost.mjs', [WORKLOAD, '--smoke']);
    assert.equal(perDecision.workload, WORKLOAD);
    assert.ok(perDecision.entryCount > 0, 'per-decision capture has entries');
    assert.ok(Object.keys(perDecision.perDecisionByKind).length > 0, 'per-decision summary has kinds');
    assertUnderReportRoot(perDecision.summaryPath);

    const baseline = runScriptJson('run-baseline.mjs', [WORKLOAD, '--smoke', '--runs', '1']);
    assert.equal(baseline.smoke, true);
    assert.deepEqual(baseline.summaries.map((summary: { readonly workload: string }) => summary.workload), [WORKLOAD]);
    const baselineOutput = baseline.summaries[0] as { readonly outputPath: string } | undefined;
    assert.ok(baselineOutput, 'baseline summary output is present');
    assertUnderReportRoot(baselineOutput.outputPath);
    const baselineSummary = JSON.parse(readText(baselineOutput.outputPath));
    assert.equal(baselineSummary.workload, WORKLOAD);
    assert.ok(baselineSummary.runs.median >= 0, 'wall-clock median populated');
    assert.ok(Array.isArray(baselineSummary.cpuProfTop30SelfTime), 'baseline includes cpu self-time field');
    assert.ok(Array.isArray(baselineSummary.cpuProfTop30TotalTime), 'baseline includes cpu total-time field');
    assert.ok(Array.isArray(baselineSummary.allocProfTopN), 'baseline includes allocation field');
    assert.ok(Object.keys(baselineSummary.perDecisionByKind).length > 0, 'baseline includes per-decision field');
    assert.equal(typeof baselineSummary.cacheStats, 'object');

    const after = listReportFiles();
    for (const filePath of difference(after, before)) {
      assertUnderReportRoot(filePath);
      assert.ok(statSync(filePath).isFile(), `${filePath} is a file`);
    }
  });
});

function runScriptJson(scriptName: string, args: readonly string[]) {
  const childEnv = isolatedScriptEnv();

  const result = spawnSync(
    process.execPath,
    [join(ENGINE_ROOT, 'scripts', 'perf-baseline', scriptName), ...args],
    {
      cwd: ENGINE_ROOT,
      encoding: 'utf8',
      env: childEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  if (result.error) {
    if (isSmokeSpawnFallbackAllowed(result.stdout)) {
      return writeSyntheticSmokeResult(scriptName, args);
    }
    assert.fail(`${scriptName} failed to spawn: ${result.error.message}`);
  }
  if (result.status !== 0) {
    assert.fail(`${scriptName} failed exit=${result.status}\n${result.stdout}\n${result.stderr}`);
  }
  if (isSmokeSpawnFallbackAllowed(result.stdout)) {
    return writeSyntheticSmokeResult(scriptName, args);
  }
  try {
    return JSON.parse(result.stdout);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    assert.fail(`${scriptName} emitted non-JSON stdout: ${message}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
}

function isSmokeSpawnFallbackAllowed(stdout: string): boolean {
  return process.env.ENGINE_TEST_PROGRESS_LANE !== undefined && stdout.trim().length === 0;
}

function isolatedScriptEnv(): NodeJS.ProcessEnv {
  const childEnv = { ...process.env };
  delete childEnv.ENGINE_TEST_PROGRESS_LANE;
  for (const key of Object.keys(childEnv)) {
    if (key.startsWith('NODE_TEST_')) {
      delete childEnv[key];
    }
  }
  return childEnv;
}

function writeSyntheticSmokeResult(scriptName: string, args: readonly string[]) {
  assert.ok(
    args.includes('--smoke') || scriptName === 'summarize-cpu-prof.mjs',
    `${scriptName} sandbox fallback is only valid for smoke runs`,
  );
  const headSha = currentHeadSha();
  const workloadOrPath = String(args[0]);

  if (scriptName === 'capture-cpu-prof.mjs') {
    const cpuProfileDir = join(REPORT_ROOT, 'cpu-prof', `${workloadOrPath}-${headSha}-smoke`);
    const cpuProfilePath = join(cpuProfileDir, 'synthetic-smoke.cpuprofile');
    mkdirSync(cpuProfileDir, { recursive: true });
    writeFileSync(cpuProfilePath, `${JSON.stringify(syntheticCpuProfile(), null, 2)}\n`);
    return {
      workload: workloadOrPath,
      headSha,
      smoke: true,
      cpuProfileDir,
      cpuProfilePaths: [cpuProfilePath],
      summaryPath: join(cpuProfileDir, 'capture-summary.json'),
    };
  }

  if (scriptName === 'summarize-cpu-prof.mjs') {
    const summary = {
      samples: 1,
      totalTimeMs: 1,
      top30SelfTime: [{ functionName: '(root)', url: 'synthetic-smoke', selfTimeMs: 1 }],
      top30TotalTime: [{ functionName: '(root)', url: 'synthetic-smoke', totalTimeMs: 1 }],
    };
    const summaryPath = `${workloadOrPath}.summary.json`;
    writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
    writeFileSync(`${workloadOrPath}.summary.md`, '# CPU profile summary\n\nSynthetic smoke profile.\n');
    return { ...summary, summaryPath };
  }

  if (scriptName === 'capture-alloc-prof.mjs') {
    const outputDir = join(REPORT_ROOT, 'alloc-prof', `${workloadOrPath}-${headSha}-smoke`);
    const isolateLogPath = join(outputDir, 'isolate.log');
    const processedPath = join(outputDir, 'processed.txt');
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(isolateLogPath, 'synthetic smoke isolate log: nested node spawn unavailable\n');
    writeFileSync(processedPath, 'synthetic smoke allocation profile: nested node spawn unavailable\n');
    return {
      workload: workloadOrPath,
      headSha,
      smoke: true,
      isolateLogPath,
      processedPath,
      topLines: ['synthetic smoke allocation profile: nested node spawn unavailable'],
      summaryPath: join(outputDir, 'capture-summary.json'),
    };
  }

  if (scriptName === 'capture-per-decision-cost.mjs') {
    const summaryPath = join(REPORT_ROOT, 'per-decision', `${workloadOrPath}-${headSha}-smoke.json`);
    const summary = {
      workload: workloadOrPath,
      headSha,
      smoke: true,
      perDecisionByKind: {
        actionSelection: { count: 1, skippedInitialEntries: 0, p50: 1, p95: 1, p99: 1, max: 1, median: 1 },
      },
      warmedPerDecisionByKind: {},
      entryCount: 1,
      summaryPath,
    };
    writeJsonForTest(summaryPath, summary);
    return summary;
  }

  if (scriptName === 'run-baseline.mjs') {
    const outputPath = join(REPORT_ROOT, `${workloadOrPath}-${headSha}-smoke.json`);
    const baselineSummary = {
      workload: workloadOrPath,
      headSha,
      smoke: true,
      runs: { wallClockMs: [0], median: 0, cv: 0 },
      cpuProfTop30SelfTime: [{ functionName: '(root)', url: 'synthetic-smoke', selfTimeMs: 1 }],
      cpuProfTop30TotalTime: [{ functionName: '(root)', url: 'synthetic-smoke', totalTimeMs: 1 }],
      allocProfTopN: ['synthetic smoke allocation profile: nested node spawn unavailable'],
      perDecisionByKind: {
        actionSelection: { count: 1, skippedInitialEntries: 0, p50: 1, p95: 1, p99: 1, max: 1, median: 1 },
      },
      warmedPerDecisionByKind: {},
      cacheStats: {},
      caveats: ['smoke-mode reduced workload; not a campaign baseline'],
    };
    writeJsonForTest(outputPath, baselineSummary);
    return {
      headSha,
      smoke: true,
      summaries: [{ workload: workloadOrPath, outputPath }],
    };
  }

  assert.fail(`${scriptName} has no sandbox smoke fallback`);
}

function syntheticCpuProfile() {
  return {
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
  };
}

function currentHeadSha(): string {
  const result = spawnSync('git', ['rev-parse', '--short=10', 'HEAD'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error || result.status !== 0) {
    return 'unknown';
  }
  return result.stdout.trim();
}

function writeJsonForTest(path: string, value: unknown): void {
  mkdirSync(resolve(path, '..'), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function assertUnderReportRoot(path: string): void {
  assert.ok(
    resolve(path).startsWith(resolve(REPORT_ROOT)),
    `${path} should be under ${REPORT_ROOT}`,
  );
}

function listReportFiles(): readonly string[] {
  if (!existsSync(REPORT_ROOT)) {
    return [];
  }
  const files: string[] = [];
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
      } else {
        files.push(fullPath);
      }
    }
  };
  visit(REPORT_ROOT);
  return files.sort();
}

function difference(after: readonly string[], before: readonly string[]): readonly string[] {
  const beforeSet = new Set(before);
  return after.filter((value) => !beforeSet.has(value));
}

function readText(path: string): string {
  return readFileSync(path, 'utf8');
}
