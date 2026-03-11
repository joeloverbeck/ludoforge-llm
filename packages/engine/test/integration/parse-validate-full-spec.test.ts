import * as assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  loadGameSpecBundleFromEntrypoint,
  parseGameSpec,
  runGameSpecStages,
  runGameSpecStagesFromBundle,
  validateGameSpec,
} from '../../src/cnl/index.js';
import { assertNoErrors, assertStageBlocked, assertStageNotBlocked } from '../helpers/diagnostic-helpers.js';
import { readFixtureText } from '../helpers/fixture-reader.js';
import {
  compileProductionSpec,
  compileTexasProductionSpec,
  getFitlProductionFixture,
  getTexasProductionFixture,
  readCompilerFixture,
} from '../helpers/production-spec-helpers.js';

const readFixture = (name: string): string => readFixtureText(`cnl/${name}`);

function resolveRepoRoot(): string {
  let cursor = dirname(fileURLToPath(import.meta.url));

  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(resolve(cursor, 'pnpm-workspace.yaml'))) {
      return cursor;
    }
    cursor = resolve(cursor, '..');
  }

  return process.cwd();
}

const repoRootPath = resolveRepoRoot();

describe('parse + validate full-spec integration', { concurrency: 1 }, () => {
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

  it('compiles FITL and Texas production specs through explicit entrypoint bundles', () => {
    const fitl = compileProductionSpec();
    const texas = compileTexasProductionSpec();
    const fitlBundle = loadGameSpecBundleFromEntrypoint(resolve(repoRootPath, 'data/games/fire-in-the-lake.game-spec.md'));
    const texasBundle = loadGameSpecBundleFromEntrypoint(resolve(repoRootPath, 'data/games/texas-holdem.game-spec.md'));
    const fitlStaged = runGameSpecStagesFromBundle(fitlBundle);
    const texasStaged = runGameSpecStagesFromBundle(texasBundle);

    assertNoErrors(fitl.parsed);
    assertNoErrors(texas.parsed);
    assert.equal(fitl.compiled.gameDef.victoryStandings !== undefined, true);
    assert.equal(texas.compiled.gameDef.metadata.id, 'texas-holdem-nlhe-tournament');
    assert.equal(fitlStaged.sourceFingerprint, fitlBundle.sourceFingerprint);
    assert.equal(texasStaged.sourceFingerprint, texasBundle.sourceFingerprint);
    assert.notEqual(fitlBundle.sourceFingerprint, texasBundle.sourceFingerprint);
  });

  it('exposes stable explicit production fixtures for runtime suites', () => {
    const fitlCompiled = compileProductionSpec();
    const texasCompiled = compileTexasProductionSpec();
    const fitlFixture = getFitlProductionFixture();
    const texasFixture = getTexasProductionFixture();

    assert.equal(getFitlProductionFixture(), fitlFixture);
    assert.equal(getTexasProductionFixture(), texasFixture);
    assert.equal(fitlFixture.compiled, fitlCompiled.compiled);
    assert.equal(texasFixture.compiled, texasCompiled.compiled);
    assert.equal(fitlFixture.gameDef, fitlCompiled.compiled.gameDef);
    assert.equal(texasFixture.gameDef, texasCompiled.compiled.gameDef);
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
