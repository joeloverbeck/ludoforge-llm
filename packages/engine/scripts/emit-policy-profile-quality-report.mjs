import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const DEFAULT_INPUT_PATH = './policy-profile-quality-report.ndjson';
const STICKY_COMMENT_MARKER = '<!-- policy-profile-quality-report -->';

function parseArgs(argv) {
  let inputPath = DEFAULT_INPUT_PATH;
  let baselineInputPath = null;
  let prComment = process.env.GITHUB_EVENT_NAME === 'pull_request';

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--input') {
      inputPath = argv[index + 1] ?? inputPath;
      index += 1;
      continue;
    }
    if (arg.startsWith('--input=')) {
      inputPath = arg.slice('--input='.length);
      continue;
    }
    if (arg === '--baseline-input') {
      baselineInputPath = argv[index + 1] ?? baselineInputPath;
      index += 1;
      continue;
    }
    if (arg.startsWith('--baseline-input=')) {
      baselineInputPath = arg.slice('--baseline-input='.length);
      continue;
    }
    if (arg === '--pr-comment') {
      prComment = true;
      continue;
    }
    if (arg === '--no-pr-comment') {
      prComment = false;
      continue;
    }
  }

  return { inputPath, baselineInputPath, prComment };
}

export function parsePolicyProfileQualityReport(reportText) {
  return reportText
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));
}

export function buildPolicyProfileQualityAnnotations(records) {
  return records
    .filter((record) => record.passed === false)
    .map(
      (record) =>
        `::warning file=${record.file}::POLICY_PROFILE_QUALITY_REGRESSION variant=${record.variantId} seed=${record.seed} stopReason=${record.stopReason} decisions=${record.decisions}`,
    );
}

export function summarizeByVariant(records) {
  const summary = new Map();
  for (const record of records) {
    const bucket = summary.get(record.variantId) ?? { converged: 0, total: 0, failures: [] };
    bucket.total += 1;
    if (record.passed) {
      bucket.converged += 1;
    } else {
      bucket.failures.push(record);
    }
    summary.set(record.variantId, bucket);
  }
  return summary;
}

function formatFailureNotes(failures) {
  if (failures.length === 0) {
    return '';
  }
  return failures
    .map(
      (failure) =>
        `seed ${failure.seed} did not converge (stopReason=${failure.stopReason}, decisions=${failure.decisions})`,
    )
    .join('; ');
}

function formatConvergenceCell(currentBucket, baselineBucket) {
  const currentRate = `${currentBucket.converged}/${currentBucket.total}`;
  if (baselineBucket === undefined) {
    return currentRate;
  }

  return `${baselineBucket.converged}/${baselineBucket.total} -> ${currentRate}`;
}

export function buildPolicyProfileQualityComment(records, baselineRecords = []) {
  const summary = summarizeByVariant(records);
  const baselineSummary = summarizeByVariant(baselineRecords);
  const variantIds = new Set([...summary.keys(), ...baselineSummary.keys()]);
  const lines = [
    STICKY_COMMENT_MARKER,
    '## Policy-Profile Quality Report',
    '',
    '| Variant | Convergence | Notes |',
    '|---|---|---|',
  ];

  for (const variantId of [...variantIds].sort((left, right) => left.localeCompare(right))) {
    const bucket = summary.get(variantId);
    const baselineBucket = baselineSummary.get(variantId);
    if (bucket === undefined) {
      continue;
    }
    lines.push(
      `| ${variantId} | ${formatConvergenceCell(bucket, baselineBucket)} | ${formatFailureNotes(bucket.failures)} |`,
    );
  }

  lines.push('');
  lines.push('_Non-blocking signal per Spec 136. Determinism corpus is the blocking gate._');
  return `${lines.join('\n')}\n`;
}

function postStickyPullRequestComment(commentBody) {
  try {
    execFileSync('gh', ['pr', 'comment', '--edit-last', '--create-if-none', '--body', commentBody], {
      stdio: ['ignore', 'inherit', 'inherit'],
      env: { ...process.env, GH_TOKEN: process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN ?? '' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[policy-profile-quality-report] skipped PR comment: ${message}`);
  }
}

export function main(argv = process.argv.slice(2), options = {}) {
  const { inputPath, baselineInputPath, prComment } = parseArgs(argv);
  const readFileSyncImpl = options.readFileSyncImpl ?? readFileSync;
  const stdout = options.stdout ?? process.stdout;
  const commentPoster = options.commentPoster ?? postStickyPullRequestComment;

  const reportText = readFileSyncImpl(inputPath, 'utf8');
  const records = parsePolicyProfileQualityReport(reportText);
  const baselineRecords =
    baselineInputPath === null ? [] : parsePolicyProfileQualityReport(readFileSyncImpl(baselineInputPath, 'utf8'));
  const annotations = buildPolicyProfileQualityAnnotations(records);
  const commentBody = buildPolicyProfileQualityComment(records, baselineRecords);

  for (const annotation of annotations) {
    stdout.write(`${annotation}\n`);
  }
  stdout.write(`${commentBody}\n`);

  if (prComment) {
    commentPoster(commentBody);
  }

  return 0;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
