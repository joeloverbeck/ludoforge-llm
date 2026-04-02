import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Diagnostic } from '../../../src/kernel/diagnostics.js';
import type { ActionDef } from '../../../src/kernel/types.js';
import type { ActionId } from '../../../src/kernel/branded.js';
import { compileActionTagIndex } from '../../../src/cnl/compile-action-tags.js';

function mkAction(id: string, tags?: string[]): ActionDef {
  return {
    id: id as ActionId,
    actor: 'active' as never,
    executor: 'actor' as never,
    phase: ['main'] as never,
    params: [],
    pre: null,
    cost: [],
    effects: [],
    limits: [],
    ...(tags !== undefined && tags.length > 0 ? { tags } : {}),
  } as ActionDef;
}

function errors(diagnostics: readonly Diagnostic[]): readonly Diagnostic[] {
  return diagnostics.filter((d) => d.severity === 'error');
}

describe('compileActionTagIndex', () => {
  // --- AC 1: Actions with tags produce correct maps ---
  it('builds correct byAction and byTag maps from tagged actions', () => {
    const diagnostics: Diagnostic[] = [];
    const result = compileActionTagIndex(
      [
        mkAction('rally', ['insurgent-operation', 'placement']),
        mkAction('march', ['insurgent-operation', 'movement']),
        mkAction('train', ['coin-operation', 'placement']),
      ],
      diagnostics,
    );
    assert.equal(errors(diagnostics).length, 0);
    assert.ok(result !== undefined);

    // byAction
    assert.deepEqual(result.byAction['rally'], ['insurgent-operation', 'placement']);
    assert.deepEqual(result.byAction['march'], ['insurgent-operation', 'movement']);
    assert.deepEqual(result.byAction['train'], ['coin-operation', 'placement']);

    // byTag
    assert.deepEqual(result.byTag['insurgent-operation'], ['march', 'rally']);
    assert.deepEqual(result.byTag['placement'], ['rally', 'train']);
    assert.deepEqual(result.byTag['movement'], ['march']);
    assert.deepEqual(result.byTag['coin-operation'], ['train']);
  });

  // --- AC 1b: Both maps are sorted ---
  it('byAction tags are sorted and byTag actionIds are sorted', () => {
    const diagnostics: Diagnostic[] = [];
    const result = compileActionTagIndex(
      [
        mkAction('zebra', ['beta', 'alpha']),
        mkAction('alpha', ['beta']),
      ],
      diagnostics,
    );
    assert.ok(result !== undefined);
    assert.deepEqual(result.byAction['zebra'], ['alpha', 'beta']);
    assert.deepEqual(result.byTag['beta'], ['alpha', 'zebra']);
  });

  // --- AC 2: No tags returns undefined ---
  it('returns undefined when no actions have tags', () => {
    const diagnostics: Diagnostic[] = [];
    const result = compileActionTagIndex(
      [mkAction('pass'), mkAction('event')],
      diagnostics,
    );
    assert.equal(result, undefined);
    assert.equal(errors(diagnostics).length, 0);
  });

  // --- AC 3: Empty tag string emits error ---
  it('emits error for empty tag string', () => {
    const diagnostics: Diagnostic[] = [];
    compileActionTagIndex(
      [mkAction('rally', ['', 'valid-tag'])],
      diagnostics,
    );
    const errs = errors(diagnostics);
    assert.equal(errs.length, 1);
    assert.equal(errs[0]!.code, 'CNL_COMPILER_ACTION_TAG_EMPTY');
  });

  // --- AC 4: Duplicate tag emits error ---
  it('emits error for duplicate tag on same action', () => {
    const diagnostics: Diagnostic[] = [];
    compileActionTagIndex(
      [mkAction('rally', ['combat', 'combat'])],
      diagnostics,
    );
    const errs = errors(diagnostics);
    assert.equal(errs.length, 1);
    assert.equal(errs[0]!.code, 'CNL_COMPILER_ACTION_TAG_DUPLICATE');
  });

  // --- AC 5: Invalid tag format emits error ---
  it('emits error for non-kebab-case tag', () => {
    const diagnostics: Diagnostic[] = [];
    compileActionTagIndex(
      [mkAction('rally', ['InvalidTag'])],
      diagnostics,
    );
    const errs = errors(diagnostics);
    assert.equal(errs.length, 1);
    assert.equal(errs[0]!.code, 'CNL_COMPILER_ACTION_TAG_INVALID_FORMAT');
  });

  it('emits error for tag starting with number', () => {
    const diagnostics: Diagnostic[] = [];
    compileActionTagIndex(
      [mkAction('rally', ['1bad'])],
      diagnostics,
    );
    assert.equal(errors(diagnostics).length, 1);
  });

  // --- Edge case: mixed valid and invalid tags ---
  it('keeps valid tags even when some are invalid', () => {
    const diagnostics: Diagnostic[] = [];
    const result = compileActionTagIndex(
      [mkAction('rally', ['valid-tag', '', 'InvalidTag', 'valid-tag', 'another-valid'])],
      diagnostics,
    );
    // 3 errors: empty, invalid format, duplicate
    assert.equal(errors(diagnostics).length, 3);
    assert.ok(result !== undefined);
    assert.deepEqual(result.byAction['rally'], ['another-valid', 'valid-tag']);
  });

  // --- Edge case: same tag on multiple actions ---
  it('same tag on multiple actions appears in byTag with all action IDs', () => {
    const diagnostics: Diagnostic[] = [];
    const result = compileActionTagIndex(
      [
        mkAction('rally', ['combat']),
        mkAction('attack', ['combat']),
        mkAction('sweep', ['combat']),
      ],
      diagnostics,
    );
    assert.ok(result !== undefined);
    assert.deepEqual(result.byTag['combat'], ['attack', 'rally', 'sweep']);
  });

  // --- Edge case: single action with single tag ---
  it('single action with single tag works correctly', () => {
    const diagnostics: Diagnostic[] = [];
    const result = compileActionTagIndex(
      [mkAction('pass', ['pass'])],
      diagnostics,
    );
    assert.ok(result !== undefined);
    assert.deepEqual(result.byAction['pass'], ['pass']);
    assert.deepEqual(result.byTag['pass'], ['pass']);
  });

  it('indexes FITL coup-phase pass actions under the pass tag', () => {
    const diagnostics: Diagnostic[] = [];
    const result = compileActionTagIndex(
      [
        mkAction('coupPacifyPass', ['pass']),
        mkAction('coupAgitatePass', ['pass']),
        mkAction('coupRedeployPass', ['pass']),
        mkAction('coupCommitmentPass', ['pass']),
      ],
      diagnostics,
    );

    assert.equal(errors(diagnostics).length, 0);
    assert.ok(result !== undefined);
    assert.deepEqual(result.byTag['pass'], [
      'coupAgitatePass',
      'coupCommitmentPass',
      'coupPacifyPass',
      'coupRedeployPass',
    ]);
  });
});
