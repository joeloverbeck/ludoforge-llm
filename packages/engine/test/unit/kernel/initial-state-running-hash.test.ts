import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef, parseGameSpec } from '../../../src/cnl/index.js';
import { initialState } from '../../../src/kernel/index.js';
import { readFixtureText } from '../../helpers/fixture-reader.js';

describe('initialState _runningHash seeding', () => {
  it('sets _runningHash equal to stateHash for a minimal game', () => {
    const markdown = readFixtureText('cnl/compiler/compile-valid.md');
    const parsed = parseGameSpec(markdown);
    const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });
    assert.notEqual(compiled.gameDef, null);

    const result = initialState(compiled.gameDef!, 42);

    assert.equal(typeof result.state._runningHash, 'bigint');
    assert.equal(result.state._runningHash, result.state.stateHash);
    assert.notEqual(result.state._runningHash, 0n);
  });

  it('sets _runningHash equal to stateHash for FITL', () => {
    const markdown = readFixtureText('cnl/compiler/fitl-foundation-inline-assets.md');
    const parsed = parseGameSpec(markdown);
    const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });
    assert.notEqual(compiled.gameDef, null);

    const result = initialState(compiled.gameDef!, 7);

    assert.equal(result.state._runningHash, result.state.stateHash);
  });
});
