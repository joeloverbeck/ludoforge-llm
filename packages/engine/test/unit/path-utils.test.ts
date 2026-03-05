import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  appendMacroPathSegment,
  renderMacroPathSegment,
  stripMacroPathSegments,
  joinPathSegments,
  normalizeArrayIndexSegmentsToBrackets,
  normalizeArrayIndexSegmentsToDots,
  splitPathSegments,
  toObjectPathSuffix,
  trimLastPathSegment,
} from '../../src/cnl/path-utils.js';

describe('path-utils', () => {
  it('encodes object-key path suffixes deterministically', () => {
    assert.equal(toObjectPathSuffix('namedSets'), '.namedSets');
    assert.equal(toObjectPathSuffix('insurgent.group[0]'), '["insurgent.group[0]"]');
  });

  it('normalizes numeric bracket segments to dot segments and preserves quoted keyed segments', () => {
    assert.equal(normalizeArrayIndexSegmentsToDots('doc.actions[0].effects[2]'), 'doc.actions.0.effects.2');
    assert.equal(
      normalizeArrayIndexSegmentsToDots('doc.metadata.namedSets["insurgent.group[0]"]'),
      'doc.metadata.namedSets["insurgent.group[0]"]',
    );
  });

  it('normalizes dot index segments to bracket segments without changing keyed segments', () => {
    assert.equal(normalizeArrayIndexSegmentsToBrackets('actions.0.effects.2'), 'actions[0].effects[2]');
    assert.equal(
      normalizeArrayIndexSegmentsToBrackets('metadata.namedSets["insurgent.group[0]"]'),
      'metadata.namedSets["insurgent.group[0]"]',
    );
  });

  it('splits segments with quote-aware bracket parsing and trims parent path correctly', () => {
    const path = 'metadata.namedSets["insurgent.group[0]"].values[1]';
    assert.deepEqual(splitPathSegments(path), ['metadata', 'namedSets', '["insurgent.group[0]"]', 'values', '[1]']);
    assert.equal(trimLastPathSegment(path), 'metadata.namedSets["insurgent.group[0]"].values');
    assert.equal(trimLastPathSegment('metadata.namedSets["insurgent.group[0]"]'), 'metadata.namedSets');
  });

  it('renders and appends macro segments with escaped bracket-significant payloads', () => {
    assert.equal(renderMacroPathSegment('outer'), '[macro:outer]');
    assert.equal(renderMacroPathSegment('outer]x\\y'), '[macro:outer\\]x\\\\y]');
    assert.equal(appendMacroPathSegment('setup[0]', 'outer'), 'setup[0][macro:outer]');
    assert.equal(appendMacroPathSegment('setup[0]', 'outer]x\\y', 2), 'setup[0][macro:outer\\]x\\\\y][2]');
  });

  it('strips macro segments (and their immediate expansion index) across nested macro paths', () => {
    const nestedPath = 'setup[0][macro:outer\\]x\\\\y][0][macro:inner][1].args.faction';
    assert.deepEqual(splitPathSegments(nestedPath), ['setup', '[0]', '[macro:outer\\]x\\\\y]', '[0]', '[macro:inner]', '[1]', 'args', 'faction']);
    assert.equal(stripMacroPathSegments(nestedPath), 'setup[0].args.faction');
    assert.equal(joinPathSegments(['setup', '[0]', 'args', 'faction']), 'setup[0].args.faction');
  });
});
