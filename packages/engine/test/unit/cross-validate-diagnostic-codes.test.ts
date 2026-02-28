import * as assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  CNL_XREF_DIAGNOSTIC_CODES,
  isCnlXrefDiagnosticCode,
} from '../../src/cnl/cross-validate-diagnostic-codes.js';

const CNL_SOURCE_DIR = existsSync(join(process.cwd(), 'src/cnl'))
  ? join(process.cwd(), 'src/cnl')
  : fileURLToPath(new URL('../../../src/cnl/', import.meta.url));
const CNL_XREF_LITERAL_PATTERN = /(['"`])(?:\\.|(?!\1)[^\\\r\n])*?(CNL_XREF_[A-Z0-9_]+)(?:\\.|(?!\1)[^\\\r\n])*?\1/g;
const CNL_XREF_REGISTRY_MEMBER_PATTERN = /\bCNL_XREF_DIAGNOSTIC_CODES\.(CNL_XREF_[A-Z0-9_]+)\b/g;

const collectTsFiles = (directory: string): string[] => {
  const entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTsFiles(absolutePath));
      continue;
    }

    if (entry.isFile() && absolutePath.endsWith('.ts')) {
      files.push(absolutePath);
    }
  }

  return files;
};

describe('cross-validate diagnostic codes', () => {
  it('keeps canonical xref code ownership in one typed registry', () => {
    for (const [key, value] of Object.entries(CNL_XREF_DIAGNOSTIC_CODES)) {
      assert.equal(value, key);
    }

    assert.equal(
      CNL_XREF_DIAGNOSTIC_CODES.CNL_XREF_ACTION_EXECUTOR_PIPELINE_UNSUPPORTED,
      'CNL_XREF_ACTION_EXECUTOR_PIPELINE_UNSUPPORTED',
    );
  });

  it('exposes deterministic xref code classification helper', () => {
    assert.equal(isCnlXrefDiagnosticCode('CNL_XREF_ZONEVAR_MISSING'), true);
    assert.equal(isCnlXrefDiagnosticCode('CNL_XREF_FORGED_CODE'), false);
    assert.equal(isCnlXrefDiagnosticCode('REF_ZONEVAR_MISSING'), false);
  });

  it('keeps CNL xref token usage fully covered by the canonical registry', () => {
    const root = process.cwd();
    const registryCodes = new Set<string>(Object.values(CNL_XREF_DIAGNOSTIC_CODES));
    const violations: string[] = [];

    for (const file of collectTsFiles(CNL_SOURCE_DIR)) {
      const source = readFileSync(file, 'utf8');
      const usedCodes = new Set<string>();
      for (const literalMatch of source.matchAll(CNL_XREF_LITERAL_PATTERN)) {
        const literalCode = literalMatch[2];
        if (literalCode !== undefined) {
          usedCodes.add(literalCode);
        }
      }
      for (const memberMatch of source.matchAll(CNL_XREF_REGISTRY_MEMBER_PATTERN)) {
        const memberCode = memberMatch[1];
        if (memberCode !== undefined) {
          usedCodes.add(memberCode);
        }
      }

      const missingTokens = [...usedCodes]
        .filter((token) => !registryCodes.has(token))
        .sort((left, right) => left.localeCompare(right));
      if (missingTokens.length > 0) {
        violations.push(`${relative(root, file)} (${basename(file)}): ${missingTokens.join(', ')}`);
      }
    }

    assert.deepEqual(
      violations,
      [],
      `Found CNL xref tokens missing from canonical registry:\n${violations.map((violation) => `- ${violation}`).join('\n')}`,
    );
  });
});
