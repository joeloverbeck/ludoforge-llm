import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  canonicalizeNamedSetsWithCollisions,
  normalizeNamedSetId,
  toNamedSetCanonicalIdCollisionDiagnostics,
} from '../../src/cnl/named-set-utils.js';

describe('named-set collision boundary invariants', () => {
  it('keeps first canonical named set values while recording deterministic collision metadata', () => {
    const result = canonicalizeNamedSetsWithCollisions({
      ' cafe\u0301 ': ['US'],
      caf\u00e9: ['ARVN'],
      cafe\u0301: ['NVA'],
      other: ['COIN'],
      ' other ': ['Insurgent'],
    });

    assert.deepEqual([...result.namedSets.entries()], [
      [normalizeNamedSetId('caf\u00e9'), ['US']],
      [normalizeNamedSetId('other'), ['COIN']],
    ]);
    assert.deepEqual(
      result.collisions.map((collision) => ({
        canonicalId: collision.canonicalId as string,
        rawIds: collision.rawIds,
      })),
      [
        {
          canonicalId: 'caf\u00e9',
          rawIds: [' cafe\u0301 ', 'caf\u00e9', 'cafe\u0301'],
        },
        {
          canonicalId: 'other',
          rawIds: ['other', ' other '],
        },
      ],
    );
  });

  it('emits ordered N-1 diagnostics for each collision group', () => {
    const diagnostics = toNamedSetCanonicalIdCollisionDiagnostics({
      code: 'CNL_VALIDATOR_METADATA_NAMED_SET_DUPLICATE_ID',
      collisions: [
        {
          canonicalId: normalizeNamedSetId('caf\u00e9'),
          rawIds: [' cafe\u0301 ', 'caf\u00e9', 'cafe\u0301'],
        },
        {
          canonicalId: normalizeNamedSetId('other'),
          rawIds: ['other', ' other '],
        },
      ],
    });

    assert.equal(diagnostics.length, 3);
    assert.deepEqual(
      diagnostics.map((diagnostic) => diagnostic.path),
      [
        'doc.metadata.namedSets["caf\u00e9"]',
        'doc.metadata.namedSets["cafe\u0301"]',
        'doc.metadata.namedSets[" other "]',
      ],
    );
    assert.equal(diagnostics.every((diagnostic) => diagnostic.code === 'CNL_VALIDATOR_METADATA_NAMED_SET_DUPLICATE_ID'), true);
  });
});
