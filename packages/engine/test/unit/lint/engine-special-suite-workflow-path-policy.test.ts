import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { parse } from 'yaml';
import { findRepoRootFile } from '../../helpers/lint-policy-helpers.js';

// Workflows with the full shared path filter set (packages/engine/**, data/games/**, scripts/**, etc.).
const WORKFLOW_FILES = [
  '.github/workflows/engine-e2e-all.yml',
  '.github/workflows/engine-fitl-events.yml',
  '.github/workflows/engine-fitl-rules.yml',
  '.github/workflows/engine-memory.yml',
  '.github/workflows/engine-performance.yml',
  '.github/workflows/engine-texas-cross-game.yml',
] as const;

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

function removeSelfWorkflowPath(paths: readonly string[], selfWorkflowPath: string): readonly string[] {
  return paths.filter((pathFilter) => pathFilter !== selfWorkflowPath);
}

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

describe('engine special-suite workflow path policy', () => {
  it('keeps push/pull_request path filters in parity across special suites and covers required shared triggers', () => {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const repoRoot = dirname(findRepoRootFile(thisDir, 'pnpm-workspace.yaml'));

    let canonicalPaths: readonly string[] | undefined;

    for (const workflowPath of WORKFLOW_FILES) {
      const absolutePath = resolve(repoRoot, workflowPath);
      const doc = readWorkflowDoc(absolutePath);
      const pushPaths = doc.on?.push?.paths ?? [];
      const pullRequestPaths = doc.on?.pull_request?.paths ?? [];

      assert.ok(pushPaths.length > 0, `${workflowPath} push.paths must be declared`);
      assert.ok(pullRequestPaths.length > 0, `${workflowPath} pull_request.paths must be declared`);
      assert.deepEqual(
        pushPaths,
        pullRequestPaths,
        `${workflowPath} push/pull_request path filters must match exactly`,
      );
      assertUniquePaths(pushPaths, workflowPath, 'push');

      for (const requiredPath of REQUIRED_SHARED_PATH_FILTERS) {
        assert.ok(
          pushPaths.includes(requiredPath),
          `${workflowPath} must include shared path filter "${requiredPath}"`,
        );
      }
      assert.ok(
        pushPaths.includes(workflowPath),
        `${workflowPath} must include its own workflow file path filter`,
      );

      if (!canonicalPaths) {
        canonicalPaths = removeSelfWorkflowPath(pushPaths, workflowPath);
        continue;
      }

      assert.deepEqual(
        removeSelfWorkflowPath(pushPaths, workflowPath),
        canonicalPaths,
        `${workflowPath} shared path filters must remain in parity with other special-suite workflows`,
      );
    }
  });
});
