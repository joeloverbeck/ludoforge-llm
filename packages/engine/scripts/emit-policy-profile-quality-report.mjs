import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const DEFAULT_INPUT_PATH = './policy-profile-quality-report.ndjson';
const STICKY_COMMENT_MARKER = '<!-- policy-profile-quality-report -->';

function parseArgs(argv) {
  let inputPath = DEFAULT_INPUT_PATH;
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
    if (arg === '--pr-comment') {
      prComment = true;
      continue;
    }
    if (arg === '--no-pr-comment') {
      prComment = false;
      continue;
    }
  }

  return { inputPath, prComment };
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
        `::warning file=${record.file}::POLICY_PROFILE_QUALITY_REGRESSION variant=${record.variantId} seed=${record.seed} stopReason=${record.stopReason} moves=${record.moves}`,
    );
}

function summarizeByVariant(records) {
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
        `seed ${failure.seed} did not converge (stopReason=${failure.stopReason}, moves=${failure.moves})`,
    )
    .join('; ');
}

export function buildPolicyProfileQualityComment(records) {
  const summary = summarizeByVariant(records);
  const lines = [
    STICKY_COMMENT_MARKER,
    '## Policy-Profile Quality Report',
    '',
    '| Variant | Convergence | Notes |',
    '|---|---|---|',
  ];

  for (const variantId of [...summary.keys()].sort((left, right) => left.localeCompare(right))) {
    const bucket = summary.get(variantId);
    lines.push(`| ${variantId} | ${bucket.converged}/${bucket.total} | ${formatFailureNotes(bucket.failures)} |`);
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
  const { inputPath, prComment } = parseArgs(argv);
  const readFileSyncImpl = options.readFileSyncImpl ?? readFileSync;
  const stdout = options.stdout ?? process.stdout;
  const commentPoster = options.commentPoster ?? postStickyPullRequestComment;

  const reportText = readFileSyncImpl(inputPath, 'utf8');
  const records = parsePolicyProfileQualityReport(reportText);
  const annotations = buildPolicyProfileQualityAnnotations(records);
  const commentBody = buildPolicyProfileQualityComment(records);

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
