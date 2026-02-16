import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { bindingShadowWarningsForScope, createBindingShadowWarning } from '../../src/cnl/binding-diagnostics.js';

describe('binding-diagnostics', () => {
  it('builds deterministic binding shadow warning diagnostics', () => {
    assert.deepEqual(createBindingShadowWarning('$x', 'doc.actions.0.effects.0.let.bind'), {
      code: 'CNL_COMPILER_BINDING_SHADOWED',
      path: 'doc.actions.0.effects.0.let.bind',
      severity: 'warning',
      message: 'Binding "$x" shadows an outer binding.',
      suggestion: 'Rename the inner binding to avoid accidental capture.',
    });
  });

  it('emits warning only when binder is present in current scope', () => {
    assert.deepEqual(bindingShadowWarningsForScope('$x', 'doc.path.bind', ['$x']), [createBindingShadowWarning('$x', 'doc.path.bind')]);
    assert.deepEqual(bindingShadowWarningsForScope('$x', 'doc.path.bind', ['$y']), []);
    assert.deepEqual(bindingShadowWarningsForScope('$x', 'doc.path.bind', undefined), []);
  });
});
