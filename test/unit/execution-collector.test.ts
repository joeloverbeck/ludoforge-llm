import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createCollector, emitWarning, emitTrace } from '../../src/kernel/execution-collector.js';
import type { RuntimeWarning, EffectTraceEntry } from '../../src/kernel/types.js';

describe('ExecutionCollector', () => {
  describe('createCollector', () => {
    it('creates collector with empty warnings and null trace when no options', () => {
      const c = createCollector();
      assert.deepEqual(c.warnings, []);
      assert.equal(c.trace, null);
    });

    it('creates collector with empty trace array when trace:true', () => {
      const c = createCollector({ trace: true });
      assert.deepEqual(c.warnings, []);
      assert.ok(Array.isArray(c.trace));
      assert.equal(c.trace!.length, 0);
    });

    it('creates collector with null trace when trace:false', () => {
      const c = createCollector({ trace: false });
      assert.equal(c.trace, null);
    });
  });

  describe('emitWarning', () => {
    it('pushes warning to collector', () => {
      const c = createCollector();
      const w: RuntimeWarning = {
        code: 'ZERO_EFFECT_ITERATIONS',
        message: 'test',
        context: {},
      };
      emitWarning(c, w);
      assert.equal(c.warnings.length, 1);
      assert.equal(c.warnings[0], w);
    });

    it('is a no-op when collector is undefined', () => {
      emitWarning(undefined, {
        code: 'ZERO_EFFECT_ITERATIONS',
        message: 'test',
        context: {},
      });
    });
  });

  describe('emitTrace', () => {
    it('pushes trace entry when trace is enabled', () => {
      const c = createCollector({ trace: true });
      const entry: EffectTraceEntry = {
        kind: 'moveToken',
        tokenId: 't1',
        from: 'zoneA',
        to: 'zoneB',
      };
      emitTrace(c, entry);
      assert.equal(c.trace!.length, 1);
      assert.equal(c.trace![0], entry);
    });

    it('is a no-op when trace is disabled', () => {
      const c = createCollector();
      emitTrace(c, {
        kind: 'moveToken',
        tokenId: 't1',
        from: 'zoneA',
        to: 'zoneB',
      });
      assert.equal(c.trace, null);
    });

    it('is a no-op when collector is undefined', () => {
      emitTrace(undefined, {
        kind: 'moveToken',
        tokenId: 't1',
        from: 'zoneA',
        to: 'zoneB',
      });
    });
  });
});
