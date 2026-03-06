import * as assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { parseGameSpec } from '../../../src/cnl/parser.js';
import { findLegacyTokenFilterArrayPaths } from '../../helpers/legacy-token-filter-array-guard.js';
import { findRepoRootFile } from '../../helpers/lint-policy-helpers.js';

function listMarkdownFiles(rootDir: string): string[] {
  const files: string[] = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    const entries = readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = resolve(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolutePath);
        continue;
      }
      if (entry.isFile() && extname(entry.name).toLowerCase() === '.md') {
        files.push(absolutePath);
      }
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

function collectMaintainedGameSpecMarkdownFiles(repoRoot: string): readonly string[] {
  const gameDataFiles = listMarkdownFiles(resolve(repoRoot, 'data', 'games'));
  const cnlFixtureFiles = listMarkdownFiles(resolve(repoRoot, 'packages', 'engine', 'test', 'fixtures', 'cnl'))
    .filter((filePath) => !/malformed|\.golden\./iu.test(filePath));

  return [...gameDataFiles, ...cnlFixtureFiles];
}

describe('gamespec legacy token-filter array policy', () => {
  it('detects legacy array syntax only at token-filter surfaces', () => {
    const doc = {
      actions: [
        { params: [{ domain: { query: 'tokensInZone', zone: 'board:none', filter: [{ prop: 'type', eq: 'troops' }] } }] },
        { effects: [{ reveal: { zone: 'hand:$actor', filter: [{ prop: 'faction', eq: 'US' }] } }] },
        { effects: [{ conceal: { zone: 'hand:$actor', filter: [{ prop: 'faction', eq: 'US' }] } }] },
        { params: [{ domain: { query: 'tokensInMapSpaces', filter: [{ prop: 'type', eq: 'troops' }] } }] },
        { params: [{ domain: { query: 'tokensInAdjacentZones', zone: 'board:none', filter: [{ prop: 'type', eq: 'troops' }] } }] },
      ],
    };

    assert.deepEqual(findLegacyTokenFilterArrayPaths(doc), [
      'doc.actions.0.params.0.domain.filter',
      'doc.actions.1.effects.0.reveal.filter',
      'doc.actions.2.effects.0.conceal.filter',
      'doc.actions.3.params.0.domain.filter',
      'doc.actions.4.params.0.domain.filter',
    ]);
  });

  it('accepts canonical token-filter expression shapes', () => {
    const doc = {
      actions: [
        {
          params: [{
            domain: {
              query: 'tokensInZone',
              zone: 'board:none',
              filter: { op: 'and', args: [{ prop: 'type', op: 'eq', value: 'troops' }] },
            },
          }],
        },
        {
          effects: [{
            reveal: {
              zone: 'hand:$actor',
              filter: { prop: 'faction', op: 'eq', value: 'US' },
            },
          }],
        },
      ],
    };

    assert.deepEqual(findLegacyTokenFilterArrayPaths(doc), []);
  });

  it('forbids legacy token-filter arrays in maintained GameSpecDoc markdown sources', () => {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const repoRoot = dirname(findRepoRootFile(thisDir, 'pnpm-workspace.yaml'));
    const markdownFiles = collectMaintainedGameSpecMarkdownFiles(repoRoot);
    const failures: string[] = [];

    for (const filePath of markdownFiles) {
      const markdown = readFileSync(filePath, 'utf8');
      const relativePath = filePath.slice(repoRoot.length + 1);
      const parsed = parseGameSpec(markdown, { sourceId: relativePath });
      const parseErrors = parsed.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
      if (parseErrors.length > 0) {
        failures.push(
          `${relativePath}: parse error(s) blocked static token-filter guard scan (${parseErrors.length})`,
        );
        continue;
      }
      for (const violationPath of findLegacyTokenFilterArrayPaths(parsed.doc)) {
        failures.push(`${relativePath}:${violationPath}`);
      }
    }

    assert.ok(markdownFiles.length > 0, 'expected at least one maintained GameSpecDoc markdown source');
    assert.deepEqual(failures, [], 'maintained GameSpecDoc markdown sources must not use legacy array token-filter syntax');
  });
});
