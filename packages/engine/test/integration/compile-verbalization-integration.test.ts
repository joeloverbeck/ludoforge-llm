import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileProductionSpec, compileTexasProductionSpec } from '../helpers/production-spec-helpers.js';
import { compileGameSpecToGameDef, parseGameSpec } from '../../src/cnl/index.js';

describe('verbalization compilation integration', () => {
  it('FITL production spec compiles with verbalization defined', () => {
    const { compiled } = compileProductionSpec();
    assert.ok(compiled.gameDef !== null, 'FITL GameDef must compile successfully');
    assert.ok(compiled.gameDef.verbalization !== undefined, 'FITL GameDef.verbalization must be defined');
    assert.ok(
      Object.keys(compiled.gameDef.verbalization.labels).length > 0,
      'FITL verbalization must have at least one label',
    );
    assert.ok(
      compiled.gameDef.verbalization.suppressPatterns.length > 0,
      'FITL verbalization must have at least one suppress pattern',
    );
    assert.equal(
      compiled.gameDef.verbalization.actionSummaries?.train,
      'Place forces and build support',
      'FITL verbalization must compile action summaries',
    );
  });

  it('Texas Hold\'em production spec compiles with verbalization defined', () => {
    const { compiled } = compileTexasProductionSpec();
    assert.ok(compiled.gameDef !== null, 'Texas GameDef must compile successfully');
    assert.ok(compiled.gameDef.verbalization !== undefined, 'Texas GameDef.verbalization must be defined');
    assert.ok(
      Object.keys(compiled.gameDef.verbalization.labels).length > 0,
      'Texas verbalization must have at least one label',
    );
    assert.equal(
      compiled.gameDef.verbalization.actionSummaries?.fold,
      'Surrender hand and forfeit current bets',
      'Texas verbalization must compile action summaries',
    );
  });

  it('GameSpecDoc without verbalization produces GameDef without verbalization', () => {
    const minimalSpec = '# Empty\n\n```yaml\nmetadata:\n  id: test\n  players:\n    min: 2\n    max: 2\n```\n';
    const parsed = parseGameSpec(minimalSpec);
    assert.equal(parsed.doc.verbalization, null, 'parsed doc.verbalization must be null when absent');

    const compiled = compileGameSpecToGameDef(parsed.doc);
    if (compiled.gameDef !== null) {
      assert.equal(compiled.gameDef.verbalization, undefined, 'verbalization must be undefined when not in spec');
    } else {
      // Even if GameDef is null (due to other missing sections),
      // verify verbalization was null in the compiled sections.
      assert.equal(compiled.sections.verbalization, null, 'sections.verbalization must be null when absent');
    }
  });

  it('FITL production spec compiles without error diagnostics', () => {
    const { compiled } = compileProductionSpec();
    const errors = compiled.diagnostics.filter((d) => d.severity === 'error');
    assert.equal(errors.length, 0, `Expected no errors but got: ${errors.map((e) => e.message).join(', ')}`);
  });

  it('Texas Hold\'em production spec compiles without error diagnostics', () => {
    const { compiled } = compileTexasProductionSpec();
    const errors = compiled.diagnostics.filter((d) => d.severity === 'error');
    assert.equal(errors.length, 0, `Expected no errors but got: ${errors.map((e) => e.message).join(', ')}`);
  });
});
