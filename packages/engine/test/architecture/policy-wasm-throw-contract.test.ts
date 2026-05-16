// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';

import ts from 'typescript';

const THROW_CONTRACT_MARKER = '@policy-wasm-throw: contract-violation';
const UNSUPPORTED_NULL_MARKER = '@policy-wasm-unsupported: null-return';
const SOURCE_FILE_PATTERN = /^policy-wasm-.*\.ts$/u;

interface ThrowViolation {
  readonly filePath: string;
  readonly line: number;
  readonly message: string;
}

interface ThrowContractAudit {
  readonly fileCount: number;
  readonly throwCount: number;
  readonly contractMarkerCount: number;
  readonly unsupportedNullMarkerCount: number;
  readonly violations: readonly ThrowViolation[];
}

const resolveRepoRoot = (): string => {
  let cursor = process.cwd();
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(join(cursor, 'pnpm-workspace.yaml'))) {
      return cursor;
    }
    cursor = join(cursor, '..');
  }
  return process.cwd();
};

const REPO_ROOT = resolveRepoRoot();
const ENGINE_ROOT = join(REPO_ROOT, 'packages/engine');
const POLICY_WASM_SOURCE_ROOT = join(ENGINE_ROOT, 'src/agents');
const NEGATIVE_FIXTURE_PATH = join(
  ENGINE_ROOT,
  'test/architecture/fixtures/policy-wasm-throw-contract-negative-fixture.ts.txt',
);

const countMarker = (source: string, marker: string): number =>
  source.split('\n').filter((line) => line.includes(marker)).length;

const collectPolicyWasmSourceFiles = (): readonly string[] => {
  const entries = readdirSync(POLICY_WASM_SOURCE_ROOT, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && SOURCE_FILE_PATTERN.test(entry.name))
    .map((entry) => join(POLICY_WASM_SOURCE_ROOT, entry.name))
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
};

const lineNumberForPosition = (sourceFile: ts.SourceFile, position: number): number =>
  sourceFile.getLineAndCharacterOfPosition(position).line + 1;

const lineAt = (source: string, lineNumber: number): string =>
  source.split('\n')[lineNumber - 1] ?? '';

const thrownExpressionLabel = (node: ts.ThrowStatement): string => {
  const expression = node.expression;
  if (expression === undefined) {
    return 'throw';
  }
  if (!ts.isNewExpression(expression)) {
    return `throw ${expression.getText()}`;
  }
  const thrownExpression = expression.expression;
  if (!ts.isIdentifier(thrownExpression)) {
    return `throw ${expression.getText()}`;
  }
  return thrownExpression.text;
};

const hasContractMarker = (
  source: string,
  sourceFile: ts.SourceFile,
  throwNode: ts.ThrowStatement,
): boolean => {
  const throwLine = lineNumberForPosition(sourceFile, throwNode.getStart(sourceFile));
  const throwLineText = lineAt(source, throwLine);
  const previousLineText = lineAt(source, throwLine - 1);

  return throwLineText.includes(THROW_CONTRACT_MARKER) || previousLineText.includes(THROW_CONTRACT_MARKER);
};

const auditSource = (filePath: string, source: string): ThrowContractAudit => {
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const violations: ThrowViolation[] = [];
  let throwCount = 0;

  const visit = (node: ts.Node): void => {
    if (ts.isThrowStatement(node)) {
      throwCount += 1;
      if (!hasContractMarker(source, sourceFile, node)) {
        violations.push({
          filePath,
          line: lineNumberForPosition(sourceFile, node.getStart(sourceFile)),
          message: `${thrownExpressionLabel(node)} must convert to null-return per spec 175 OR mark as contract-violation`,
        });
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return {
    fileCount: 1,
    throwCount,
    contractMarkerCount: countMarker(source, THROW_CONTRACT_MARKER),
    unsupportedNullMarkerCount: countMarker(source, UNSUPPORTED_NULL_MARKER),
    violations,
  };
};

const combineAudits = (audits: readonly ThrowContractAudit[]): ThrowContractAudit => ({
  fileCount: audits.reduce((sum, audit) => sum + audit.fileCount, 0),
  throwCount: audits.reduce((sum, audit) => sum + audit.throwCount, 0),
  contractMarkerCount: audits.reduce((sum, audit) => sum + audit.contractMarkerCount, 0),
  unsupportedNullMarkerCount: audits.reduce((sum, audit) => sum + audit.unsupportedNullMarkerCount, 0),
  violations: audits.flatMap((audit) => audit.violations),
});

const formatPath = (filePath: string): string => relative(REPO_ROOT, filePath).replaceAll('\\', '/');

const formatViolations = (violations: readonly ThrowViolation[]): string =>
  violations
    .map((violation) => `${formatPath(violation.filePath)}:${violation.line}: ${violation.message}`)
    .join('\n');

describe('policy WASM throw contract', () => {
  it('requires every WASM glue throw to carry the contract-violation marker', () => {
    const filePaths = collectPolicyWasmSourceFiles();
    assert.ok(filePaths.length > 0, 'expected policy-wasm-*.ts source files to audit');
    for (const filePath of filePaths) {
      assert.equal(statSync(filePath).isFile(), true);
    }

    const audit = combineAudits(
      filePaths.map((filePath) => auditSource(filePath, readFileSync(filePath, 'utf8'))),
    );

    process.stdout.write(
      `${[
        `policy-wasm throw contract: files=${audit.fileCount}`,
        `throws=${audit.throwCount}`,
        `contractMarkers=${audit.contractMarkerCount}`,
        `unsupportedNullMarkers=${audit.unsupportedNullMarkerCount}`,
      ].join(' ')}\n`,
    );

    assert.equal(
      audit.violations.length,
      0,
      `Unmarked policy WASM throws found:\n${formatViolations(audit.violations)}`,
    );
    assert.equal(
      audit.throwCount,
      audit.contractMarkerCount,
      'Every audited WASM throw should have exactly one contract-violation marker.',
    );
  });

  it('rejects the negative fixture with an unmarked unsupported throw', () => {
    const fixtureSource = readFileSync(NEGATIVE_FIXTURE_PATH, 'utf8');
    const audit = auditSource(NEGATIVE_FIXTURE_PATH, fixtureSource);

    assert.equal(audit.throwCount, 1);
    assert.deepEqual(
      audit.violations.map((violation) => `${formatPath(violation.filePath)}:${violation.line}`),
      [`${formatPath(NEGATIVE_FIXTURE_PATH)}:3`],
    );
  });
});
