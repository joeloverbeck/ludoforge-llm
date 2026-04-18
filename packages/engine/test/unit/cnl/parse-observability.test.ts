// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseGameSpec } from '../../../src/cnl/parser.js';
import type { Diagnostic } from '../../../src/kernel/diagnostics.js';

function errors(diagnostics: readonly Diagnostic[]): readonly Diagnostic[] {
  return diagnostics.filter((d) => d.severity === 'error');
}

describe('parseGameSpec — observability section', () => {
  it('returns observability: null when the section is absent', () => {
    const result = parseGameSpec('');
    assert.equal(result.doc.observability, null);
  });

  it('parses a minimal observer profile', () => {
    const result = parseGameSpec([
      '```yaml',
      'observability:',
      '  observers:',
      '    currentPlayer:',
      '      description: "Standard player perspective"',
      '      surfaces:',
      '        globalVars: public',
      '        perPlayerVars: seatVisible',
      '```',
    ].join('\n'));

    const errs = errors(result.diagnostics);
    assert.equal(errs.length, 0, `unexpected errors: ${JSON.stringify(errs)}`);
    assert.ok(result.doc.observability !== null, 'observability should not be null');
    assert.ok(result.doc.observability.observers !== undefined, 'observers should be defined');

    const profile = result.doc.observability.observers!['currentPlayer'];
    assert.ok(profile !== undefined, 'currentPlayer profile should exist');
    assert.equal(profile.description, 'Standard player perspective');
    assert.ok(profile.surfaces !== undefined, 'surfaces should be defined');
    assert.equal(profile.surfaces!.globalVars, 'public');
    assert.equal(profile.surfaces!.perPlayerVars, 'seatVisible');
  });

  it('parses an observer profile with extends', () => {
    const result = parseGameSpec([
      '```yaml',
      'observability:',
      '  observers:',
      '    base:',
      '      surfaces:',
      '        globalVars: public',
      '    spectator:',
      '      extends: base',
      '      description: "Spectator view"',
      '      surfaces:',
      '        perPlayerVars: hidden',
      '```',
    ].join('\n'));

    const errs = errors(result.diagnostics);
    assert.equal(errs.length, 0, `unexpected errors: ${JSON.stringify(errs)}`);
    const spectator = result.doc.observability!.observers!['spectator'];
    assert.ok(spectator !== undefined);
    assert.equal(spectator.extends, 'base');
    assert.equal(spectator.description, 'Spectator view');
    assert.equal(spectator.surfaces!.perPlayerVars, 'hidden');
  });

  it('parses full-form surface entry with preview', () => {
    const result = parseGameSpec([
      '```yaml',
      'observability:',
      '  observers:',
      '    detailed:',
      '      surfaces:',
      '        activeCardIdentity:',
      '          current: hidden',
      '          preview:',
      '            visibility: hidden',
      '            allowWhenHiddenSampling: false',
      '```',
    ].join('\n'));

    const errs = errors(result.diagnostics);
    assert.equal(errs.length, 0, `unexpected errors: ${JSON.stringify(errs)}`);
    const profile = result.doc.observability!.observers!['detailed'];
    assert.ok(profile !== undefined);
    const entry = profile.surfaces!.activeCardIdentity as { current: string; preview: { visibility: string; allowWhenHiddenSampling: boolean } };
    assert.equal(entry.current, 'hidden');
    assert.equal(entry.preview.visibility, 'hidden');
    assert.equal(entry.preview.allowWhenHiddenSampling, false);
  });

  it('parses per-variable overrides with _default', () => {
    const result = parseGameSpec([
      '```yaml',
      'observability:',
      '  observers:',
      '    custom:',
      '      surfaces:',
      '        globalVars:',
      '          _default: public',
      '          secretCounter: hidden',
      '```',
    ].join('\n'));

    const errs = errors(result.diagnostics);
    assert.equal(errs.length, 0, `unexpected errors: ${JSON.stringify(errs)}`);
    const profile = result.doc.observability!.observers!['custom']!;
    const globalVars = profile.surfaces!.globalVars as Record<string, unknown>;
    assert.equal(globalVars['_default'], 'public');
    assert.equal(globalVars['secretCounter'], 'hidden');
  });

  it('emits duplicate diagnostic when observability appears twice', () => {
    const result = parseGameSpec([
      '```yaml',
      'observability:',
      '  observers:',
      '    a:',
      '      surfaces:',
      '        globalVars: public',
      '```',
      '```yaml',
      'observability:',
      '  observers:',
      '    b:',
      '      surfaces:',
      '        globalVars: hidden',
      '```',
    ].join('\n'));

    const dupes = result.diagnostics.filter((d) => d.code === 'CNL_PARSER_DUPLICATE_SINGLETON_SECTION');
    assert.ok(dupes.length > 0, 'expected duplicate singleton diagnostic');
  });

  it('populates sourceMap for observability section', () => {
    const result = parseGameSpec([
      '```yaml',
      'observability:',
      '  observers:',
      '    player:',
      '      surfaces:',
      '        globalVars: public',
      '```',
    ].join('\n'));

    assert.ok('observability' in result.sourceMap.byPath, 'sourceMap should contain observability entry');
  });
});
