import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef, parseGameSpec } from '../../src/cnl/index.js';
import type { GameDef } from '../../src/kernel/index.js';

interface ValidCompileGolden {
  readonly expectedGameDef: GameDef;
  readonly expectedDiagnostics: readonly [];
}

interface MalformedCompileGolden {
  readonly expectedDiagnostics: readonly {
    readonly code: string;
    readonly path: string;
    readonly suggestion?: string;
    readonly entityId?: string;
  }[];
}

const readCompilerFixture = (name: string): string =>
  readFileSync(join(process.cwd(), 'test', 'fixtures', 'cnl', 'compiler', name), 'utf8');

const readCompilerGolden = <T>(name: string): T => JSON.parse(readCompilerFixture(name)) as T;

describe('compiler golden fixtures', () => {
  it('matches full valid GameSpecDoc -> GameDef golden snapshot', () => {
    const markdown = readCompilerFixture('compile-valid.md');
    const golden = readCompilerGolden<ValidCompileGolden>('compile-valid.golden.json');

    const run = () => {
      const parsed = parseGameSpec(markdown);
      return compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });
    };

    const first = run();
    const second = run();

    assert.deepEqual(second, first);
    assert.deepEqual(first.diagnostics, golden.expectedDiagnostics);
    assert.deepEqual(first.gameDef, golden.expectedGameDef);
  });

  it('matches malformed compiler diagnostics golden snapshot (code/path/suggestion)', () => {
    const markdown = readCompilerFixture('compile-malformed.md');
    const golden = readCompilerGolden<MalformedCompileGolden>('compile-malformed.golden.json');

    const parsed = parseGameSpec(markdown);
    const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });
    const normalized = compiled.diagnostics.map((diagnostic) => ({
      code: diagnostic.code,
      path: diagnostic.path,
      ...(diagnostic.suggestion !== undefined ? { suggestion: diagnostic.suggestion } : {}),
      ...(diagnostic.entityId !== undefined ? { entityId: diagnostic.entityId } : {}),
    }));

    assert.equal(compiled.gameDef, null);
    assert.deepEqual(normalized, golden.expectedDiagnostics);
  });

  it('matches malformed embedded-asset diagnostics golden snapshot (code/path/entityId)', () => {
    const markdown = readCompilerFixture('compile-fitl-assets-malformed.md');
    const golden = readCompilerGolden<MalformedCompileGolden>('compile-fitl-assets-malformed.golden.json');

    const parsed = parseGameSpec(markdown);
    const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });
    const normalized = compiled.diagnostics.map((diagnostic) => ({
      code: diagnostic.code,
      path: diagnostic.path,
      ...(diagnostic.suggestion !== undefined ? { suggestion: diagnostic.suggestion } : {}),
      ...(diagnostic.entityId !== undefined ? { entityId: diagnostic.entityId } : {}),
    }));

    assert.equal(compiled.gameDef, null);
    assert.deepEqual(normalized, golden.expectedDiagnostics);
  });
});
