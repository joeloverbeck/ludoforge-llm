import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseGameSpec, runGameSpecStages, validateGameSpec } from '../../src/cnl/index.js';
import { assertNoErrors, assertStageBlocked, assertStageNotBlocked } from '../helpers/diagnostic-helpers.js';
import { readFixtureText } from '../helpers/fixture-reader.js';
import { readCompilerFixture } from '../helpers/production-spec-helpers.js';

const readFixture = (name: string): string => readFixtureText(`cnl/${name}`);

describe('parse + validate full-spec integration', () => {
  it('accepts a realistic valid full markdown spec end-to-end', () => {
    const markdown = readFixture('full-valid-spec.md');
    const parsed = parseGameSpec(markdown);
    const diagnostics = validateGameSpec(parsed.doc, { sourceMap: parsed.sourceMap });

    assertNoErrors(parsed);
    assert.deepEqual(diagnostics, []);

    assert.equal(parsed.doc.metadata?.id, 'fixture-valid');
    const firstZone = parsed.doc.zones?.[0];
    assert.equal(firstZone !== undefined && 'id' in firstZone ? firstZone.id : undefined, 'deck');
    assert.equal(parsed.doc.actions?.[0]?.id, 'draw');
    const firstPhase = parsed.doc.turnStructure?.phases[0];
    assert.equal(firstPhase !== undefined && 'id' in firstPhase ? firstPhase.id : undefined, 'main');
  });

  it('blocks validation and compilation in the staged helper after parser-fatal YAML errors', () => {
    const markdown = [
      '# Malformed Event Deck',
      '',
      '```yaml',
      'metadata:',
      '  id: malformed-eventdeck',
      '  players:',
      '    min: 2',
      '    max: 4',
      'eventDecks:',
      '  - id: propaganda',
      '    cards:',
      '      - id: card-001',
      '        text: Systems analysis ignorant of local conditions: Flip 1 unshaded US Capability to shaded.',
      '```',
    ].join('\n');

    const staged = runGameSpecStages(markdown);

    assert.equal(
      staged.parsed.diagnostics.some((diagnostic) => diagnostic.code === 'CNL_PARSER_YAML_PARSE_ERROR'),
      true,
    );
    assertStageBlocked('validation', staged.validation.blocked);
    assertStageBlocked('compilation', staged.compilation.blocked);
    assert.deepEqual(staged.validation.diagnostics, []);
    assert.equal(staged.compilation.result, null);
  });

  it('runs validation and compilation in the staged helper for valid compilable specs', () => {
    const markdown = readCompilerFixture('compile-valid.md');
    const staged = runGameSpecStages(markdown);

    assertNoErrors(staged.parsed);
    assertStageNotBlocked('validation', staged.validation.blocked);
    assertStageNotBlocked('compilation', staged.compilation.blocked);
    assert.deepEqual(staged.validation.diagnostics, []);
    assert.notEqual(staged.compilation.result, null);
    assert.deepEqual(staged.compilation.result?.diagnostics, []);
    assert.notEqual(staged.compilation.result?.gameDef, null);
    assert.equal((staged.compilation.result?.gameDef?.actions.length ?? 0) > 0, true);
  });

  it('reports stable deterministic diagnostics for a multi-issue spec end-to-end', () => {
    const markdown = readFixture('full-invalid-spec.md');

    const runOnce = () => {
      const parsed = parseGameSpec(markdown);
      return [...parsed.diagnostics, ...validateGameSpec(parsed.doc, { sourceMap: parsed.sourceMap })];
    };

    const first = runOnce();
    const second = runOnce();

    assert.deepEqual(second, first);
    assert.equal(first.length > 0, true);
    assert.equal(first.some((diagnostic) => diagnostic.code === 'CNL_VALIDATOR_METADATA_PLAYERS_MIN_TOO_LOW'), true);
    assert.equal(first.some((diagnostic) => diagnostic.code === 'CNL_VALIDATOR_TURN_STRUCTURE_PHASES_INVALID'), true);
    assert.equal(first.some((diagnostic) => diagnostic.code === 'CNL_VALIDATOR_REQUIRED_SECTION_MISSING'), true);
    assert.equal(first.some((diagnostic) => diagnostic.code === 'CNL_VALIDATOR_UNKNOWN_KEY'), true);
  });

  it('reports deterministic FITL embedded-asset reference diagnostics for missing required scenario assets', () => {
    const markdown = readCompilerFixture('compile-fitl-assets-malformed.md');

    const runOnce = () => {
      const parsed = parseGameSpec(markdown);
      return [...parsed.diagnostics, ...validateGameSpec(parsed.doc, { sourceMap: parsed.sourceMap })];
    };

    const first = runOnce();
    const second = runOnce();

    assert.deepEqual(second, first);
    assert.equal(
      first.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_VALIDATOR_REFERENCE_MISSING' &&
          diagnostic.path === 'doc.dataAssets.2.payload.mapAssetId',
      ),
      true,
    );
    assert.equal(
      first.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_VALIDATOR_REFERENCE_MISSING' &&
          diagnostic.path === 'doc.dataAssets.2.payload.pieceCatalogAssetId',
      ),
      true,
    );
  });

  it('keeps malformed nested eventDeck YAML diagnostics parser-primary and deterministic', () => {
    const markdown = [
      '# Malformed Event Deck',
      '',
      '```yaml',
      'metadata:',
      '  id: malformed-eventdeck',
      '  players:',
      '    min: 2',
      '    max: 4',
      'eventDecks:',
      '  - id: propaganda',
      '    cards:',
      '      - id: card-001',
      '        text: Systems analysis ignorant of local conditions: Flip 1 unshaded US Capability to shaded.',
      '```',
    ].join('\n');

    const runOnce = () => {
      const parsed = parseGameSpec(markdown);
      return {
        parsed,
        diagnostics: [...parsed.diagnostics, ...validateGameSpec(parsed.doc, { sourceMap: parsed.sourceMap })],
      };
    };

    const first = runOnce();
    const second = runOnce();
    const parseDiagnostic = first.diagnostics.find((diagnostic) => diagnostic.code === 'CNL_PARSER_YAML_PARSE_ERROR');

    assert.deepEqual(second.diagnostics, first.diagnostics);
    assert.ok(parseDiagnostic);
    assert.equal(parseDiagnostic?.path, 'yaml.block.0.parse');
    assert.equal(
      parseDiagnostic?.contextSnippet,
      '        text: Systems analysis ignorant of local conditions: Flip 1 unshaded US Capability to shaded.',
    );
    assert.match(parseDiagnostic?.suggestion ?? '', /quote plain-text values containing ": "/i);
    assert.equal(first.parsed.doc.eventDecks, null);
  });
});
