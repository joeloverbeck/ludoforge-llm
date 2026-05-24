// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
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
  const result = spawnSync(
    process.execPath,
    [join(ENGINE_ROOT, 'scripts', 'perf-baseline', scriptName), ...args],
    {
      cwd: ENGINE_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  if (result.status !== 0) {
    assert.fail(`${scriptName} failed exit=${result.status}\n${result.stdout}\n${result.stderr}`);
  }
  return JSON.parse(result.stdout);
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
