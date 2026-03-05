import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  appendDiagnosticKeySegment,
  buildDiagnosticSourceLookupCandidates,
  canonicalizeDiagnosticPath,
} from '../../../src/cnl/diagnostic-path-codec.js';

describe('diagnostic-path-codec', () => {
  it('encodes keyed diagnostic path segments through one contract', () => {
    assert.equal(appendDiagnosticKeySegment('doc.metadata.namedSets', 'namedSets'), 'doc.metadata.namedSets.namedSets');
    assert.equal(
      appendDiagnosticKeySegment('doc.metadata.namedSets', 'insurgent.group["0"]'),
      'doc.metadata.namedSets["insurgent.group[\\"0\\"]"]',
    );
  });

  it('canonicalizes paths with doc prefix and dot index segments while preserving non-dot-safe keyed segments', () => {
    assert.equal(canonicalizeDiagnosticPath('actions[0].effects[2]'), 'doc.actions.0.effects.2');
    assert.equal(
      canonicalizeDiagnosticPath('doc.metadata.namedSets["insurgent.group[0]"]'),
      'doc.metadata.namedSets["insurgent.group[0]"]',
    );
  });

  it('normalizes bracket-quoted string key segments to canonical keyed form', () => {
    assert.equal(
      canonicalizeDiagnosticPath('doc.metadata["namedSets"]["primary"]'),
      'doc.metadata.namedSets.primary',
    );
    assert.equal(
      canonicalizeDiagnosticPath('metadata["namedSets"]["insurgent.group[0]"]'),
      'doc.metadata.namedSets["insurgent.group[0]"]',
    );
    assert.equal(
      canonicalizeDiagnosticPath('doc.metadata["insurgent.group[\\\"0\\\"]"]'),
      'doc.metadata["insurgent.group[\\"0\\"]"]',
    );
  });

  it('builds deterministic lookup candidates including macro-stripped fallback', () => {
    assert.deepEqual(
      buildDiagnosticSourceLookupCandidates('setup[0][macro:outer][0].args.faction'),
      [
        'setup[0][macro:outer][0].args.faction',
        'doc.setup.0[macro:outer].0.args.faction',
        'setup.0[macro:outer].0.args.faction',
        'setup[0].args.faction',
      ],
    );
  });

  it('strips nested macro segments with escaped macro IDs using shared path contract', () => {
    const candidates = buildDiagnosticSourceLookupCandidates('setup[0][macro:outer\\]x\\\\y][0][macro:inner][1].args.faction');
    assert.ok(candidates.includes('setup[0].args.faction'));
    assert.ok(candidates.includes('setup[0][macro:outer\\]x\\\\y][0][macro:inner][1].args.faction'));
  });
});
