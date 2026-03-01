import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertValidatedGameDefInput,
  isGameDefInputValidationError,
  type GameDefInputValidationError,
} from '../../src/kernel/index.js';
import { readGameDefFixture } from '../helpers/gamedef-fixtures.js';

describe('assertValidatedGameDefInput', () => {
  it('returns a validated GameDef for valid object input', () => {
    const gameDef = readGameDefFixture('minimal-valid.json');

    const validated = assertValidatedGameDefInput(gameDef, 'unit fixture');

    assert.equal(validated, gameDef);
  });

  it('throws GAMEDEF_INPUT_INVALID for non-object input', () => {
    assert.throws(() => assertValidatedGameDefInput('invalid', 'string fixture'), (error: unknown) => {
      assert.equal(isGameDefInputValidationError(error), true);
      if (!isGameDefInputValidationError(error)) {
        return false;
      }

      assert.equal(error.code, 'GAMEDEF_INPUT_INVALID');
      assert.equal(error.message, 'Invalid GameDef input from string fixture: expected object payload.');
      assert.equal(error.details.source, 'string fixture');
      assert.equal(error.details.receivedType, 'string');
      return true;
    });
  });

  it('throws GAMEDEF_INPUT_INVALID with diagnostics for malformed object input', () => {
    assert.throws(() => assertValidatedGameDefInput({ invalid: true }, 'malformed fixture'), (error: unknown) => {
      assert.equal(isGameDefInputValidationError(error), true);
      if (!isGameDefInputValidationError(error)) {
        return false;
      }

      const typedError = error as GameDefInputValidationError;
      assert.equal(typedError.code, 'GAMEDEF_INPUT_INVALID');
      assert.match(typedError.message, /^Invalid GameDef input from malformed fixture:/);
      assert.equal(typedError.details.source, 'malformed fixture');
      assert.equal(typedError.details.receivedType, 'object');
      if (Array.isArray(typedError.details.diagnostics)) {
        assert.ok(typedError.details.diagnostics.length > 0);
      } else {
        assert.ok(typedError.details.cause !== undefined);
      }
      return true;
    });
  });
});
