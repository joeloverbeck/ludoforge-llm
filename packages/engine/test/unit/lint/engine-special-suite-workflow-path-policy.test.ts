// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { parse } from 'yaml';
import { findRepoRootFile } from '../../helpers/lint-policy-helpers.js';

const CONSOLIDATED_WORKFLOW_PATH = '.github/workflows/engine-tests.yml';

const REQUIRED_SHARED_PATH_FILTERS = [
  'packages/engine/**',
  'data/games/**',
  'scripts/**',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'turbo.json',
  'tsconfig.base.json',
  'eslint.config.js',
] as const;

type WorkflowDoc = {
  readonly on?: {
    readonly push?: {
      readonly paths?: readonly string[];
    };
    readonly pull_request?: {
      readonly paths?: readonly string[];
    };
  };
};

function readWorkflowDoc(absolutePath: string): WorkflowDoc {
  return parse(readFileSync(absolutePath, 'utf8')) as WorkflowDoc;
}

function assertUniquePaths(paths: readonly string[], workflowPath: string, triggerName: string): void {
  const unique = new Set(paths);
  assert.equal(
    unique.size,
    paths.length,
    `${workflowPath} ${triggerName}.paths must not contain duplicate entries`,
  );
}

describe('engine consolidated test workflow path policy', () => {
  it('keeps push/pull_request path filters in parity and covers required shared triggers', () => {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const repoRoot = dirname(findRepoRootFile(thisDir, 'pnpm-workspace.yaml'));

    const absolutePath = resolve(repoRoot, CONSOLIDATED_WORKFLOW_PATH);
    const doc = readWorkflowDoc(absolutePath);
    const pushPaths = doc.on?.push?.paths ?? [];
    const pullRequestPaths = doc.on?.pull_request?.paths ?? [];

    assert.ok(pushPaths.length > 0, `${CONSOLIDATED_WORKFLOW_PATH} push.paths must be declared`);
    assert.ok(
      pullRequestPaths.length > 0,
      `${CONSOLIDATED_WORKFLOW_PATH} pull_request.paths must be declared`,
    );
    assert.deepEqual(
      pushPaths,
      pullRequestPaths,
      `${CONSOLIDATED_WORKFLOW_PATH} push/pull_request path filters must match exactly`,
    );
    assertUniquePaths(pushPaths, CONSOLIDATED_WORKFLOW_PATH, 'push');

    for (const requiredPath of REQUIRED_SHARED_PATH_FILTERS) {
      assert.ok(
        pushPaths.includes(requiredPath),
        `${CONSOLIDATED_WORKFLOW_PATH} must include shared path filter "${requiredPath}"`,
      );
    }
    assert.ok(
      pushPaths.includes(CONSOLIDATED_WORKFLOW_PATH),
      `${CONSOLIDATED_WORKFLOW_PATH} must include its own workflow file path filter`,
    );
  });
});
