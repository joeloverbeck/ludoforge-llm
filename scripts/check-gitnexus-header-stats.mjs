import { fileURLToPath } from 'node:url';
import {
  collectCiDiffText,
  collectLocalDiffText,
  detectCiChangedPaths,
  detectLocalChangedPaths,
  hasHeadCommit,
} from './git-guard-utils.mjs';

const TARGET_FILES = ['AGENTS.md', 'CLAUDE.md'];
const GITNEXUS_STATS_RE =
  /^This project is indexed by GitNexus as \*\*.+\*\* \([\d,]+ symbols, [\d,]+ relationships, [\d,]+ execution flows\)\.$/;

function changedContentLines(diffText) {
  return diffText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('+') || line.startsWith('-'))
    .filter((line) => !line.startsWith('+++') && !line.startsWith('---'))
    .map((line) => line.slice(1).trim())
    .filter((line) => line.length > 0);
}

function isCounterOnlyChange(diffText) {
  const lines = changedContentLines(diffText);
  if (lines.length === 0) {
    return false;
  }

  return lines.every((line) => GITNEXUS_STATS_RE.test(line));
}

export function evaluateGitnexusHeaderStatsGuard({ cwd = process.cwd(), env = process.env } = {}) {
  const isCi = env.CI === 'true';
  const changedPathsResult = isCi ? detectCiChangedPaths(cwd, env) : { ok: true, paths: detectLocalChangedPaths(cwd) };
  if (!changedPathsResult.ok) {
    return { ok: false, stderr: changedPathsResult.error };
  }

  const changedPaths = changedPathsResult.paths;
  if (changedPaths.length === 0) {
    return { ok: true, stdout: 'No repository changes detected.' };
  }

  const targetChanged = TARGET_FILES.filter((path) => changedPaths.includes(path));
  if (targetChanged.length === 0) {
    return { ok: true, stdout: 'No GitNexus header counter changes detected in AGENTS.md/CLAUDE.md.' };
  }

  if (!isCi && !hasHeadCommit(cwd)) {
    return {
      ok: true,
      stdout: 'Skipping GitNexus header counter guard because repository has no HEAD commit.',
    };
  }

  const counterOnlyByFile = new Map();
  for (const path of targetChanged) {
    const diffText = isCi ? collectCiDiffText(cwd, path, env) : collectLocalDiffText(cwd, path);
    counterOnlyByFile.set(path, isCounterOnlyChange(diffText));
  }

  const onlyCounterFiles = targetChanged.filter((path) => counterOnlyByFile.get(path));
  if (onlyCounterFiles.length === 0) {
    return { ok: true, stdout: 'Guidance-doc changes detected, but not counter-only stat churn.' };
  }

  const allTargetsAreCounterOnly = onlyCounterFiles.length === targetChanged.length;
  const nonTargetChanged = changedPaths.filter((path) => !TARGET_FILES.includes(path));

  if (allTargetsAreCounterOnly && nonTargetChanged.length > 0) {
    const targetDetails = onlyCounterFiles.map((path) => `- ${path}`).join('\n');
    const otherDetails = nonTargetChanged.map((path) => `- ${path}`).join('\n');
    return {
      ok: false,
      stderr: [
        'Blocked: mixed-purpose change includes GitNexus counter-only churn.',
        'Counter-only files:',
        targetDetails,
        'Unrelated changed files:',
        otherDetails,
        'Remediation: revert counter-only churn or isolate it into a dedicated maintenance commit.',
      ].join('\n'),
    };
  }

  if (allTargetsAreCounterOnly) {
    const targetDetails = onlyCounterFiles.map((path) => `- ${path}`).join('\n');
    return {
      ok: true,
      stdout: [
        'GitNexus counter-only churn detected and isolated to guidance docs (allowed).',
        'Changed files:',
        targetDetails,
      ].join('\n'),
    };
  }

  return {
    ok: true,
    stdout: 'Guidance-doc changes include non-counter edits; skipping counter-only churn block.',
  };
}

function main() {
  const result = evaluateGitnexusHeaderStatsGuard();
  if (result.stdout) {
    console.log(result.stdout);
  }
  if (result.stderr) {
    console.error(result.stderr);
  }

  if (!result.ok) {
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
