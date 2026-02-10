import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { lintYamlHardening } from '../../src/cnl/yaml-linter.js';

describe('lintYamlHardening', () => {
  it('detects mistake 1: unquoted colons in scalar values', () => {
    const diagnostics = lintYamlHardening('metadata:\n  id: game:name\n');
    assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 'CNL_YAML_001'));
  });

  it('detects mistake 2: inconsistent indentation', () => {
    const diagnostics = lintYamlHardening('metadata:\n  id: game\n    players: 2\n');
    assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 'CNL_YAML_002'));
  });

  it('detects mistake 3: mixed tabs and spaces in indentation', () => {
    const diagnostics = lintYamlHardening('metadata:\n \tid: game\n');
    assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 'CNL_YAML_003'));
  });

  it('detects mistake 4: unquoted boolean-like strings', () => {
    const diagnostics = lintYamlHardening('metadata:\n  id: on\n');
    assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 'CNL_YAML_004'));
  });

  it('detects mistake 5: trailing whitespace', () => {
    const diagnostics = lintYamlHardening('metadata:  \n  id: game\n');
    assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 'CNL_YAML_005'));
  });

  it('detects mistake 6: duplicate keys', () => {
    const diagnostics = lintYamlHardening('metadata:\n  id: one\n  id: two\n');
    assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 'CNL_YAML_006'));
  });

  it('detects mistake 7: unknown section key', () => {
    const diagnostics = lintYamlHardening('bogusSection:\n  id: game\n');
    assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 'CNL_YAML_007'));
  });

  it('detects mistake 8: invalid YAML syntax', () => {
    const diagnostics = lintYamlHardening('metadata:\n  - id: game\n    bad\n');
    assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 'CNL_YAML_008'));
  });

  it('detects mistake 9: unescaped special characters in unquoted values', () => {
    const diagnostics = lintYamlHardening('metadata:\n  id: game #name\n');
    assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 'CNL_YAML_009'));
  });

  it('detects mistake 10: bare multi-line strings', () => {
    const diagnostics = lintYamlHardening('metadata:\n  id: game\n    line two\n');
    assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 'CNL_YAML_010'));
  });

  it('detects mistake 11: incorrect list syntax', () => {
    const diagnostics = lintYamlHardening('actions:\n  -id: pass\n');
    assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 'CNL_YAML_011'));
  });

  it('detects mistake 12: type confusion (number vs string)', () => {
    const diagnostics = lintYamlHardening('metadata:\n  id: 123\n');
    assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 'CNL_YAML_012'));
  });

  it('detects mistake 13: anchor/alias misuse', () => {
    const diagnostics = lintYamlHardening('metadata:\n  id: *missingAnchor\n');
    assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 'CNL_YAML_013'));
  });

  it('detects mistake 14: empty values', () => {
    const diagnostics = lintYamlHardening('metadata:\n  id:\n');
    assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 'CNL_YAML_014'));
  });

  it('detects mistake 15: comment-in-string errors', () => {
    const diagnostics = lintYamlHardening('metadata:\n  id: game #version\n');
    assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 'CNL_YAML_015'));
  });

  it('detects mistake 16: encoding issues', () => {
    const diagnostics = lintYamlHardening('\uFEFFmetadata:\n  id: game\n');
    assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 'CNL_YAML_016'));
  });

  it('detects mistake 17: missing document markers', () => {
    const diagnostics = lintYamlHardening('metadata:\n  id: first\n...\nmetadata:\n  id: second\n');
    assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 'CNL_YAML_017'));
  });

  it('detects mistake 18: flow vs block style confusion', () => {
    const diagnostics = lintYamlHardening('metadata: { id: game }\nactions:\n  - id: pass\n');
    assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 'CNL_YAML_018'));
  });

  it('detects mistake 19: nested quoting errors', () => {
    const diagnostics = lintYamlHardening('metadata:\n  id: \"say \"hi\"\"\n');
    assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 'CNL_YAML_019'));
  });

  it('detects mistake 20: multiline folding errors', () => {
    const diagnostics = lintYamlHardening('metadata:\n  id: >\nnext: value\n');
    assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 'CNL_YAML_020'));
  });

  it('returns deterministic ordering for identical input', () => {
    const input = 'metadata:  \n  id: on\n';
    const first = lintYamlHardening(input);
    const second = lintYamlHardening(input);
    assert.deepEqual(first, second);
  });
});
