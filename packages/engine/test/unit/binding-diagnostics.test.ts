import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { bindingShadowWarningsForScope, createBindingShadowWarning } from '../../src/cnl/binding-diagnostics.js';
import {
  CNL_COMPILER_DIAGNOSTIC_CODES,
  buildCompilerMissingCapabilityDiagnostic,
} from '../../src/cnl/compiler-diagnostic-codes.js';

describe('binding-diagnostics', () => {
  it('builds deterministic binding shadow warning diagnostics', () => {
    assert.deepEqual(createBindingShadowWarning('$x', 'doc.actions.0.effects.0.let.bind'), {
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_BINDING_SHADOWED,
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

  it('owns canonical compiler helper diagnostic codes in a single typed registry', () => {
    assert.equal(CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_BINDING_SHADOWED, 'CNL_COMPILER_BINDING_SHADOWED');
    assert.equal(CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_MISSING_CAPABILITY, 'CNL_COMPILER_MISSING_CAPABILITY');
    assert.equal(CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_ZONE_VAR_TYPE_INVALID, 'CNL_COMPILER_ZONE_VAR_TYPE_INVALID');
    assert.equal(
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_TURN_STRUCTURE_LEGACY_FIELD_UNSUPPORTED,
      'CNL_COMPILER_TURN_STRUCTURE_LEGACY_FIELD_UNSUPPORTED',
    );
    assert.equal(CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_ACTION_PHASE_DUPLICATE, 'CNL_COMPILER_ACTION_PHASE_DUPLICATE');
    assert.equal(
      CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_ACTION_CAPABILITY_DUPLICATE,
      'CNL_COMPILER_ACTION_CAPABILITY_DUPLICATE',
    );
  });

  it('builds missing-capability diagnostics through the compiler helper factory', () => {
    assert.deepEqual(
      buildCompilerMissingCapabilityDiagnostic({
        path: 'doc.actions.0',
        label: 'action definition',
        actual: null,
      }),
      {
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_MISSING_CAPABILITY,
        path: 'doc.actions.0',
        severity: 'error',
        message: 'Cannot lower action definition: null.',
        suggestion: 'Use a supported compiler shape.',
      },
    );
  });
});
