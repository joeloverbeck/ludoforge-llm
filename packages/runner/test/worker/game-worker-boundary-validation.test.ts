import { describe, expect, it } from 'vitest';

import { assertValidatedGameDefInput } from '@ludoforge/engine/runtime';
import { TEST_DEF } from './test-fixtures.js';

describe('assertValidatedGameDefInput', () => {
  it('accepts a valid GameDef payload and returns it as GameDef', () => {
    const validated = assertValidatedGameDefInput(TEST_DEF, 'test fixture');

    expect(validated).toEqual(TEST_DEF);
    expect(validated.metadata.id).toBe('runner-worker-test');
  });

  it('rejects non-object payloads with deterministic boundary details', () => {
    expect(() => assertValidatedGameDefInput('not-an-object', 'string source')).toThrowError(
      'Invalid GameDef input from string source: expected object payload.',
    );

    try {
      assertValidatedGameDefInput('not-an-object', 'string source');
      throw new Error('Expected boundary validation to throw.');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'GAMEDEF_INPUT_INVALID',
        message: 'Invalid GameDef input from string source: expected object payload.',
        details: {
          source: 'string source',
          receivedType: 'string',
        },
      });
    }
  });

  it('rejects malformed object payloads with validation diagnostics', () => {
    try {
      assertValidatedGameDefInput({ invalid: true }, 'malformed fixture');
      throw new Error('Expected boundary validation to throw.');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'GAMEDEF_INPUT_INVALID',
        message: expect.stringContaining('Invalid GameDef input from malformed fixture: '),
        details: {
          source: 'malformed fixture',
          receivedType: 'object',
        },
      });

      const details = (error as { readonly details?: { readonly diagnostics?: unknown[]; readonly cause?: unknown } }).details;
      const diagnostics = details?.diagnostics;
      if (Array.isArray(diagnostics)) {
        expect(diagnostics.length).toBeGreaterThan(0);
      } else {
        expect(details?.cause).toBeDefined();
      }
    }
  });
});
