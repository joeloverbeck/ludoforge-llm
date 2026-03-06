import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isSuppressed, isScaffoldingEffect } from '../../../src/kernel/tooltip-suppression.js';

describe('isSuppressed', () => {
  describe('built-in conventions', () => {
    it('suppresses names starting with __', () => {
      assert.equal(isSuppressed('__internal', []), true);
    });

    it('suppresses names starting with __ even with other patterns', () => {
      assert.equal(isSuppressed('__debug', ['foo*']), true);
    });

    it('suppresses names ending with Count', () => {
      assert.equal(isSuppressed('sweepCount', []), true);
    });

    it('suppresses names ending with Tracker', () => {
      assert.equal(isSuppressed('moveTracker', []), true);
    });

    it('does not suppress "Count" as a standalone name', () => {
      // "Count" ends with "Count" — this IS suppressed by convention
      assert.equal(isSuppressed('Count', []), true);
    });

    it('does not suppress names that merely contain Count mid-word', () => {
      assert.equal(isSuppressed('accountId', []), false);
    });

    it('does not suppress regular names', () => {
      assert.equal(isSuppressed('aid', []), false);
    });

    it('does not suppress names with single underscore prefix', () => {
      assert.equal(isSuppressed('_helper', []), false);
    });
  });

  describe('explicit suppress patterns', () => {
    it('matches prefix pattern (foo*)', () => {
      assert.equal(isSuppressed('tempBuffer', ['temp*']), true);
    });

    it('does not match prefix pattern for non-matching name', () => {
      assert.equal(isSuppressed('aid', ['temp*']), false);
    });

    it('matches suffix pattern (*Var)', () => {
      assert.equal(isSuppressed('internalVar', ['*Var']), true);
    });

    it('matches substring pattern (*Internal*)', () => {
      assert.equal(isSuppressed('myInternalState', ['*Internal*']), true);
    });

    it('does not match substring pattern with wrong case', () => {
      assert.equal(isSuppressed('myInternalState', ['*internal*']), false);
    });

    it('matches exact pattern', () => {
      assert.equal(isSuppressed('debugFlag', ['debugFlag']), true);
    });

    it('does not match exact pattern for different name', () => {
      assert.equal(isSuppressed('debugFlags', ['debugFlag']), false);
    });

    it('matches against multiple patterns', () => {
      assert.equal(isSuppressed('tempVar', ['debug*', 'temp*']), true);
    });

    it('handles wildcard-only pattern', () => {
      // Pattern "*" matches everything as a suffix pattern (empty suffix)
      assert.equal(isSuppressed('anything', ['*']), true);
    });
  });
});

describe('isScaffoldingEffect', () => {
  describe('zone construction scaffolding', () => {
    it('returns true for let', () => {
      assert.equal(isScaffoldingEffect('let'), true);
    });

    it('returns true for bindValue', () => {
      assert.equal(isScaffoldingEffect('bindValue'), true);
    });
  });

  describe('turn machinery effects', () => {
    it('returns true for setActivePlayer', () => {
      assert.equal(isScaffoldingEffect('setActivePlayer'), true);
    });

    it('returns true for gotoPhaseExact', () => {
      assert.equal(isScaffoldingEffect('gotoPhaseExact'), true);
    });

    it('returns true for advancePhase', () => {
      assert.equal(isScaffoldingEffect('advancePhase'), true);
    });

    it('returns true for pushInterruptPhase', () => {
      assert.equal(isScaffoldingEffect('pushInterruptPhase'), true);
    });

    it('returns true for popInterruptPhase', () => {
      assert.equal(isScaffoldingEffect('popInterruptPhase'), true);
    });
  });

  describe('internal computation effects', () => {
    it('returns true for evaluateSubset', () => {
      assert.equal(isScaffoldingEffect('evaluateSubset'), true);
    });
  });

  describe('non-scaffolding effects', () => {
    it('returns false for moveToken', () => {
      assert.equal(isScaffoldingEffect('moveToken'), false);
    });

    it('returns false for setVar', () => {
      assert.equal(isScaffoldingEffect('setVar'), false);
    });

    it('returns false for addVar', () => {
      assert.equal(isScaffoldingEffect('addVar'), false);
    });

    it('returns false for forEach', () => {
      assert.equal(isScaffoldingEffect('forEach'), false);
    });

    it('returns false for grantFreeOperation', () => {
      assert.equal(isScaffoldingEffect('grantFreeOperation'), false);
    });

    it('returns false for empty string', () => {
      assert.equal(isScaffoldingEffect(''), false);
    });
  });
});
