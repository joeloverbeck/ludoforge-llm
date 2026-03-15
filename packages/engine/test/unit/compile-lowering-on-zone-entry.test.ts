import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { lowerTokenTypes } from '../../src/cnl/compile-lowering.js';
import type { GameSpecTokenTypeDef } from '../../src/cnl/game-spec-doc.js';
import type { Diagnostic } from '../../src/kernel/diagnostics.js';

describe('lowerTokenTypes onZoneEntry compilation', () => {
  it('compiles onZoneEntry from GameSpecTokenTypeDef to TokenTypeDef', () => {
    const tokenTypes: readonly GameSpecTokenTypeDef[] = [
      {
        id: 'base',
        props: { tunnel: 'string' },
        onZoneEntry: [
          { match: { zoneKind: 'aux' }, set: { tunnel: 'untunneled' } },
        ],
      },
    ];
    const diagnostics: Diagnostic[] = [];
    const result = lowerTokenTypes(tokenTypes, diagnostics);

    assert.equal(diagnostics.length, 0);
    assert.equal(result.length, 1);
    const lowered = result[0]!;
    assert.ok(lowered.onZoneEntry !== undefined);
    assert.equal(lowered.onZoneEntry.length, 1);
    assert.deepEqual(lowered.onZoneEntry[0]!.match, { zoneKind: 'aux' });
    assert.deepEqual(lowered.onZoneEntry[0]!.setProps, { tunnel: 'untunneled' });
  });

  it('compiles onZoneEntry with category match', () => {
    const tokenTypes: readonly GameSpecTokenTypeDef[] = [
      {
        id: 'test',
        props: { status: 'string' },
        onZoneEntry: [
          { match: { zoneKind: 'board', category: 'city' }, set: { status: 'reset' } },
        ],
      },
    ];
    const diagnostics: Diagnostic[] = [];
    const result = lowerTokenTypes(tokenTypes, diagnostics);

    assert.equal(diagnostics.length, 0);
    const rule = result[0]!.onZoneEntry![0]!;
    assert.deepEqual(rule.match, { zoneKind: 'board', category: 'city' });
    assert.deepEqual(rule.setProps, { status: 'reset' });
  });

  it('omits onZoneEntry when not present on source', () => {
    const tokenTypes: readonly GameSpecTokenTypeDef[] = [
      { id: 'plain', props: { x: 'int' } },
    ];
    const diagnostics: Diagnostic[] = [];
    const result = lowerTokenTypes(tokenTypes, diagnostics);

    assert.equal(diagnostics.length, 0);
    assert.equal(result[0]!.onZoneEntry, undefined);
  });

  it('rejects set keys not in declared props', () => {
    const tokenTypes: readonly GameSpecTokenTypeDef[] = [
      {
        id: 'base',
        props: { tunnel: 'string' },
        onZoneEntry: [
          { match: { zoneKind: 'aux' }, set: { nonExistent: 'value' } },
        ],
      },
    ];
    const diagnostics: Diagnostic[] = [];
    const result = lowerTokenTypes(tokenTypes, diagnostics);

    assert.ok(diagnostics.length > 0);
    assert.ok(diagnostics.some((d) => d.path.includes('onZoneEntry') && d.path.includes('nonExistent')));
    // Token type still compiled but without onZoneEntry
    assert.equal(result[0]?.onZoneEntry, undefined);
  });
});
