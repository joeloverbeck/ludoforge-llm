import type { Diagnostic, DiagnosticSeverity } from '../kernel/diagnostics.js';
import { parseDocument } from 'yaml';

export interface LintYamlHardeningOptions {
  readonly pathPrefix?: string;
}

interface LintFinding {
  readonly line: number;
  readonly col: number;
  readonly code: string;
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  readonly suggestion?: string;
  readonly contextSnippet?: string;
  readonly pathSuffix: string;
}

const CANONICAL_SECTION_KEYS = new Set<string>([
  'metadata',
  'constants',
  'globalVars',
  'perPlayerVars',
  'zones',
  'tokenTypes',
  'setup',
  'turnStructure',
  'actions',
  'triggers',
  'endConditions',
]);

const BOOLEAN_LIKE = new Set(['yes', 'no', 'true', 'false', 'on', 'off']);
const SPECIAL_CHARS_PATTERN = /[#{}\[\]&*]/;

export function lintYamlHardening(
  rawYaml: string,
  options: LintYamlHardeningOptions = {},
): readonly Diagnostic[] {
  const findings: LintFinding[] = [];
  const lines = rawYaml.split(/\r?\n/);

  detectLineBasedMistakes(lines, findings);
  detectBareMultilineStrings(lines, findings);
  detectYamlParseMistakes(rawYaml, findings);
  detectUnknownSectionKeys(rawYaml, findings);

  findings.sort(compareFindings);

  const pathPrefix = options.pathPrefix ?? 'yaml';

  return findings.map((finding) => {
    return {
      code: finding.code,
      path: `${pathPrefix}.${finding.pathSuffix}`,
      severity: finding.severity,
      message: finding.message,
      ...(finding.suggestion !== undefined ? { suggestion: finding.suggestion } : {}),
      ...(finding.contextSnippet !== undefined ? { contextSnippet: finding.contextSnippet } : {}),
    } satisfies Diagnostic;
  });
}

function detectLineBasedMistakes(lines: readonly string[], findings: LintFinding[]): void {
  const seenIndentCounts = new Set<number>();

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const lineNumber = index + 1;

    if (/\s+$/.test(line)) {
      findings.push({
        line: lineNumber,
        col: Math.max(1, line.length),
        code: 'CNL_YAML_005',
        severity: 'warning',
        message: 'Trailing whitespace detected.',
        suggestion: 'Remove trailing spaces.',
        contextSnippet: line,
        pathSuffix: `line.${lineNumber}`,
      });
    }

    const indentMatch = line.match(/^[ \t]*/);
    const indentation = indentMatch?.[0] ?? '';
    if (indentation.includes('\t') && indentation.includes(' ')) {
      findings.push({
        line: lineNumber,
        col: 1,
        code: 'CNL_YAML_003',
        severity: 'error',
        message: 'Mixed tabs and spaces in indentation.',
        suggestion: 'Use spaces only for indentation.',
        contextSnippet: line,
        pathSuffix: `line.${lineNumber}`,
      });
    }

    if (indentation.includes('\t') && /\t+\S/.test(line)) {
      findings.push({
        line: lineNumber,
        col: 1,
        code: 'CNL_YAML_003',
        severity: 'error',
        message: 'Tab indentation detected.',
        suggestion: 'Replace tabs with spaces.',
        contextSnippet: line,
        pathSuffix: `line.${lineNumber}`,
      });
    }

    const spacesOnlyIndent = indentation.replace(/\t/g, '');
    if (spacesOnlyIndent.length > 0 && indentation.indexOf('\t') === -1) {
      seenIndentCounts.add(spacesOnlyIndent.length);
    }

    const kvMatch = line.match(/^\s*[^#\s][^:]*:\s*(.+)$/);
    if (kvMatch === null) {
      continue;
    }

    const rawValue = (kvMatch[1] ?? '').trim();
    if (rawValue.length === 0) {
      continue;
    }

    if (!isQuotedOrBlockScalar(rawValue) && rawValue.includes(':')) {
      findings.push({
        line: lineNumber,
        col: line.indexOf(':') + 2,
        code: 'CNL_YAML_001',
        severity: 'warning',
        message: 'Unquoted colon found in scalar value.',
        suggestion: 'Wrap the value in quotes.',
        contextSnippet: line,
        pathSuffix: `line.${lineNumber}`,
      });
    }

    if (!isQuotedOrBlockScalar(rawValue) && BOOLEAN_LIKE.has(rawValue.toLowerCase())) {
      findings.push({
        line: lineNumber,
        col: line.indexOf(':') + 2,
        code: 'CNL_YAML_004',
        severity: 'warning',
        message: 'Boolean-like string is unquoted.',
        suggestion: 'Wrap the value in quotes when it should be a string.',
        contextSnippet: line,
        pathSuffix: `line.${lineNumber}`,
      });
    }

    if (!isQuotedOrBlockScalar(rawValue) && SPECIAL_CHARS_PATTERN.test(rawValue)) {
      findings.push({
        line: lineNumber,
        col: line.indexOf(':') + 2,
        code: 'CNL_YAML_009',
        severity: 'warning',
        message: 'Unescaped special characters in unquoted scalar value.',
        suggestion: 'Wrap the value in quotes or escape special characters.',
        contextSnippet: line,
        pathSuffix: `line.${lineNumber}`,
      });
    }
  }

  if (hasMixedTwoAndFourSpaceIndent(seenIndentCounts)) {
    findings.push({
      line: 1,
      col: 1,
      code: 'CNL_YAML_002',
      severity: 'warning',
      message: 'Inconsistent indentation detected (mixed 2-space and 4-space levels).',
      suggestion: 'Use a consistent indentation style.',
      pathSuffix: 'indentation',
    });
  }
}

function detectBareMultilineStrings(lines: readonly string[], findings: LintFinding[]): void {
  for (let index = 0; index < lines.length - 1; index += 1) {
    const current = lines[index] ?? '';
    const next = lines[index + 1] ?? '';

    const currentMatch = current.match(/^(\s*)[^#\s][^:]*:\s*(.*)$/);
    if (currentMatch === null) {
      continue;
    }

    const currentIndent = (currentMatch[1] ?? '').length;
    const value = (currentMatch[2] ?? '').trim();
    if (value.length === 0 || value === '|' || value === '>') {
      continue;
    }

    const nextTrimmed = next.trim();
    if (nextTrimmed.length === 0) {
      continue;
    }

    const nextIndent = (next.match(/^(\s*)/)?.[1] ?? '').length;
    if (nextIndent > currentIndent && !nextTrimmed.startsWith('-') && !isQuotedOrBlockScalar(value)) {
      findings.push({
        line: index + 1,
        col: current.indexOf(':') + 2,
        code: 'CNL_YAML_010',
        severity: 'warning',
        message: 'Potential bare multi-line scalar detected without | or >.',
        suggestion: 'Use | or > for multi-line scalar values.',
        contextSnippet: current,
        pathSuffix: `line.${index + 1}`,
      });
    }
  }
}

function detectYamlParseMistakes(rawYaml: string, findings: LintFinding[]): void {
  const parsed = parseDocument(rawYaml, {
    schema: 'core',
    strict: true,
    uniqueKeys: true,
  });

  for (const error of parsed.errors) {
    const line = error.linePos?.[0]?.line ?? 1;
    const col = error.linePos?.[0]?.col ?? 1;

    if (error.code === 'DUPLICATE_KEY') {
      findings.push({
        line,
        col,
        code: 'CNL_YAML_006',
        severity: 'error',
        message: 'Duplicate mapping key detected.',
        suggestion: 'Remove or rename duplicated keys.',
        contextSnippet: error.message,
        pathSuffix: `line.${line}`,
      });
      continue;
    }

    findings.push({
      line,
      col,
      code: 'CNL_YAML_008',
      severity: 'error',
      message: 'Invalid YAML syntax.',
      suggestion: 'Fix YAML syntax near the reported line.',
      contextSnippet: error.message,
      pathSuffix: `line.${line}`,
    });
  }
}

function detectUnknownSectionKeys(rawYaml: string, findings: LintFinding[]): void {
  const parsed = parseDocument(rawYaml, {
    schema: 'core',
    strict: true,
    uniqueKeys: true,
  });

  if (parsed.errors.length > 0) {
    return;
  }

  const asObject = parsed.toJS();
  if (!isPlainObject(asObject)) {
    return;
  }

  const keys = Object.keys(asObject);
  for (const key of keys) {
    if (CANONICAL_SECTION_KEYS.has(key)) {
      continue;
    }

    findings.push({
      line: 1,
      col: 1,
      code: 'CNL_YAML_007',
      severity: 'warning',
      message: `Unknown top-level section key: ${key}.`,
      suggestion: 'Use a canonical Game Spec section key.',
      contextSnippet: key,
      pathSuffix: `section.${key}`,
    });
  }
}

function hasMixedTwoAndFourSpaceIndent(indentCounts: ReadonlySet<number>): boolean {
  let sawTwo = false;
  let sawFour = false;

  for (const count of indentCounts) {
    if (count === 2) {
      sawTwo = true;
    }
    if (count === 4) {
      sawFour = true;
    }
  }

  return sawTwo && sawFour;
}

function isQuotedOrBlockScalar(value: string): boolean {
  if (value === '|' || value === '>') {
    return true;
  }

  if (value.length < 2) {
    return false;
  }

  const first = value[0];
  const last = value[value.length - 1];
  return (first === '"' && last === '"') || (first === '\'' && last === '\'');
}

function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function compareFindings(a: LintFinding, b: LintFinding): number {
  if (a.line !== b.line) {
    return a.line - b.line;
  }
  if (a.col !== b.col) {
    return a.col - b.col;
  }
  if (a.pathSuffix !== b.pathSuffix) {
    return a.pathSuffix.localeCompare(b.pathSuffix);
  }
  return a.code.localeCompare(b.code);
}
