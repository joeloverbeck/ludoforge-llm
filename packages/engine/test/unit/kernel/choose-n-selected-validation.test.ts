// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  validateChooseNSelectedSequence,
  type ValidateChooseNSelectedSequenceInput,
} from '../../../src/kernel/choose-n-selected-validation.js';
import type { PrioritizedTierEntry } from '../../../src/kernel/prioritized-tier-legality.js';

// ── Helpers ──────────────────────────────────────────────────────────

/** Build a minimal input with only required fields. */
const input = (
  overrides: Partial<ValidateChooseNSelectedSequenceInput> & {
    readonly normalizedDomain: ValidateChooseNSelectedSequenceInput['normalizedDomain'];
    readonly selectedSequence: ValidateChooseNSelectedSequenceInput['selectedSequence'];
  },
): ValidateChooseNSelectedSequenceInput => ({
  tiers: null,
  qualifierMode: 'none',
  ...overrides,
});

// ── Tests ────────────────────────────────────────────────────────────

describe('validateChooseNSelectedSequence', () => {
  // ── Acceptance criterion 3: valid sequence ─────────────────────────

  describe('valid sequences', () => {
    it('returns empty array for a valid selection without tiers', () => {
      const result = validateChooseNSelectedSequence(
        input({
          normalizedDomain: ['a', 'b', 'c'],
          selectedSequence: ['a', 'c'],
        }),
      );
      assert.deepStrictEqual(result, []);
    });

    it('returns empty array for a valid selection with tier ordering', () => {
      const tiers: (readonly PrioritizedTierEntry[])[] = [
        [{ value: 'a' }, { value: 'b' }],
        [{ value: 'c' }, { value: 'd' }],
      ];
      const result = validateChooseNSelectedSequence(
        input({
          normalizedDomain: ['a', 'b', 'c', 'd'],
          selectedSequence: ['a', 'b', 'c'],
          tiers,
        }),
      );
      assert.deepStrictEqual(result, []);
    });

    it('returns empty array for an empty selection', () => {
      const result = validateChooseNSelectedSequence(
        input({
          normalizedDomain: ['a', 'b'],
          selectedSequence: [],
        }),
      );
      assert.deepStrictEqual(result, []);
    });
  });

  // ── Acceptance criterion 5: out-of-domain item ─────────────────────

  describe('out-of-domain detection', () => {
    it('reports an item not in the normalized domain', () => {
      const result = validateChooseNSelectedSequence(
        input({
          normalizedDomain: ['a', 'b', 'c'],
          selectedSequence: ['a', 'z'],
        }),
      );
      assert.equal(result.length, 1);
      assert.equal(result[0]!.index, 1);
      assert.equal(result[0]!.value, 'z');
      assert.equal(result[0]!.reason, 'out-of-domain');
    });

    it('reports multiple out-of-domain items', () => {
      const result = validateChooseNSelectedSequence(
        input({
          normalizedDomain: ['a'],
          selectedSequence: ['x', 'y'],
        }),
      );
      assert.equal(result.length, 2);
      assert.equal(result[0]!.reason, 'out-of-domain');
      assert.equal(result[1]!.reason, 'out-of-domain');
    });
  });

  // ── Acceptance criterion 4: duplicate detection ────────────────────

  describe('duplicate detection', () => {
    it('reports selecting the same item twice', () => {
      const result = validateChooseNSelectedSequence(
        input({
          normalizedDomain: ['a', 'b', 'c'],
          selectedSequence: ['a', 'b', 'a'],
        }),
      );
      assert.equal(result.length, 1);
      assert.equal(result[0]!.index, 2);
      assert.equal(result[0]!.value, 'a');
      assert.equal(result[0]!.reason, 'duplicate');
    });

    it('reports consecutive duplicates', () => {
      const result = validateChooseNSelectedSequence(
        input({
          normalizedDomain: ['a', 'b'],
          selectedSequence: ['a', 'a'],
        }),
      );
      assert.equal(result.length, 1);
      assert.equal(result[0]!.index, 1);
      assert.equal(result[0]!.reason, 'duplicate');
    });
  });

  // ── Acceptance criterion 1: removal invalidation ───────────────────

  describe('removal invalidation', () => {
    it('reports tier1 item as invalid when tier0 is no longer exhausted', () => {
      // Tier 0 has [A, B, C], Tier 1 has [D].
      // Original selection: [A, B, C, D] — valid (tier0 exhausted, tier1 opens).
      // After removing A: sequence is [B, C, D].
      // B and C are valid (tier0 still admissible).
      // But tier0 is NOT exhausted (A remains unselected), so tier1 is locked.
      // D should be reported as tier-blocked.
      const tiers: (readonly PrioritizedTierEntry[])[] = [
        [{ value: 'A' }, { value: 'B' }, { value: 'C' }],
        [{ value: 'D' }],
      ];
      const result = validateChooseNSelectedSequence(
        input({
          normalizedDomain: ['A', 'B', 'C', 'D'],
          selectedSequence: ['B', 'C', 'D'],
          tiers,
        }),
      );
      assert.equal(result.length, 1);
      assert.equal(result[0]!.index, 2);
      assert.equal(result[0]!.value, 'D');
      assert.equal(result[0]!.reason, 'tier-blocked');
    });

    it('valid when tier0 is exhausted after removal still leaves enough', () => {
      // Tier 0 has [A, B], Tier 1 has [C].
      // Selection: [A, B, C] — valid, tier0 fully exhausted.
      const tiers: (readonly PrioritizedTierEntry[])[] = [
        [{ value: 'A' }, { value: 'B' }],
        [{ value: 'C' }],
      ];
      const result = validateChooseNSelectedSequence(
        input({
          normalizedDomain: ['A', 'B', 'C'],
          selectedSequence: ['A', 'B', 'C'],
          tiers,
        }),
      );
      assert.deepStrictEqual(result, []);
    });
  });

  // ── Acceptance criterion 2: byQualifier tier relocking ─────────────

  describe('byQualifier tier relocking', () => {
    it('reports items from next tier qualifier group as invalid after removal', () => {
      // Tier 0: [{value: 'A', qualifier: 'red'}, {value: 'B', qualifier: 'blue'}]
      // Tier 1: [{value: 'C', qualifier: 'red'}, {value: 'D', qualifier: 'blue'}]
      //
      // With byQualifier mode:
      // - Selecting A exhausts tier0's 'red' group → tier1's 'red' (C) becomes admissible
      // - Selecting B exhausts tier0's 'blue' group → tier1's 'blue' (D) becomes admissible
      //
      // Full valid selection: [A, B, C, D]
      // After removing A: [B, C, D]
      //   - B is valid (tier0 'blue' admissible)
      //   - C is tier-blocked: tier0 'red' not exhausted (A was removed)
      //   - D depends on tier0 'blue' being exhausted by B — valid
      //
      // Expecting: C is invalid (tier-blocked).
      const tiers: (readonly PrioritizedTierEntry[])[] = [
        [{ value: 'A', qualifier: 'red' }, { value: 'B', qualifier: 'blue' }],
        [{ value: 'C', qualifier: 'red' }, { value: 'D', qualifier: 'blue' }],
      ];
      const result = validateChooseNSelectedSequence(
        input({
          normalizedDomain: ['A', 'B', 'C', 'D'],
          selectedSequence: ['B', 'C', 'D'],
          tiers,
          qualifierMode: 'byQualifier',
        }),
      );

      // C should be reported as tier-blocked (tier0 'red' not exhausted).
      const cFailure = result.find((f) => f.value === 'C');
      assert.ok(cFailure, 'expected C to be reported as invalid');
      assert.equal(cFailure.reason, 'tier-blocked');

      // D should be valid (tier0 'blue' is exhausted by B).
      const dFailure = result.find((f) => f.value === 'D');
      assert.equal(dFailure, undefined, 'D should be valid');
    });

    it('valid byQualifier sequence when all qualifier groups exhausted', () => {
      const tiers: (readonly PrioritizedTierEntry[])[] = [
        [{ value: 'A', qualifier: 'red' }, { value: 'B', qualifier: 'blue' }],
        [{ value: 'C', qualifier: 'red' }, { value: 'D', qualifier: 'blue' }],
      ];
      const result = validateChooseNSelectedSequence(
        input({
          normalizedDomain: ['A', 'B', 'C', 'D'],
          selectedSequence: ['A', 'B', 'C', 'D'],
          tiers,
          qualifierMode: 'byQualifier',
        }),
      );
      assert.deepStrictEqual(result, []);
    });
  });

  // ── Spec 11.3: interaction-effect tests ────────────────────────────

  describe('interaction-effect edge cases', () => {
    it('handles mixed failure reasons in one sequence', () => {
      const tiers: (readonly PrioritizedTierEntry[])[] = [
        [{ value: 'A' }, { value: 'B' }],
        [{ value: 'C' }],
      ];
      // Sequence: ['A', 'Z', 'A', 'C']
      // Z → out-of-domain, second A → duplicate, C → tier-blocked (tier0 not exhausted)
      const result = validateChooseNSelectedSequence(
        input({
          normalizedDomain: ['A', 'B', 'C'],
          selectedSequence: ['A', 'Z', 'A', 'C'],
          tiers,
        }),
      );
      assert.equal(result.length, 3);
      assert.equal(result[0]!.reason, 'out-of-domain');
      assert.equal(result[0]!.value, 'Z');
      assert.equal(result[1]!.reason, 'duplicate');
      assert.equal(result[1]!.value, 'A');
      assert.equal(result[2]!.reason, 'tier-blocked');
      assert.equal(result[2]!.value, 'C');
    });

    it('invalid items do not affect tier admissibility for subsequent items', () => {
      // Tier 0: [A, B], Tier 1: [C]
      // Sequence: [A, C, B]
      //   - A valid (tier0)
      //   - C tier-blocked (tier0 has B remaining)
      //   - B valid (tier0 still admissible, C was not counted as valid)
      const tiers: (readonly PrioritizedTierEntry[])[] = [
        [{ value: 'A' }, { value: 'B' }],
        [{ value: 'C' }],
      ];
      const result = validateChooseNSelectedSequence(
        input({
          normalizedDomain: ['A', 'B', 'C'],
          selectedSequence: ['A', 'C', 'B'],
          tiers,
        }),
      );
      assert.equal(result.length, 1);
      assert.equal(result[0]!.value, 'C');
      assert.equal(result[0]!.reason, 'tier-blocked');
    });

    it('three-tier cascade: removing tier0 item invalidates tier1 and tier2', () => {
      const tiers: (readonly PrioritizedTierEntry[])[] = [
        [{ value: 'A' }],
        [{ value: 'B' }],
        [{ value: 'C' }],
      ];
      // Full valid: [A, B, C]. After removing A: [B, C].
      // B is tier-blocked (tier0 not exhausted), C is also tier-blocked.
      const result = validateChooseNSelectedSequence(
        input({
          normalizedDomain: ['A', 'B', 'C'],
          selectedSequence: ['B', 'C'],
          tiers,
        }),
      );
      assert.equal(result.length, 2);
      assert.equal(result[0]!.value, 'B');
      assert.equal(result[0]!.reason, 'tier-blocked');
      assert.equal(result[1]!.value, 'C');
      assert.equal(result[1]!.reason, 'tier-blocked');
    });
  });

  // ── Numeric and boolean domains ────────────────────────────────────

  describe('type-safe domain handling', () => {
    it('distinguishes numeric from string values', () => {
      const result = validateChooseNSelectedSequence(
        input({
          normalizedDomain: [1, 2, 3],
          selectedSequence: [1, '2' as unknown as number],
        }),
      );
      // '2' (string) is not the same as 2 (number) — should be out-of-domain.
      assert.equal(result.length, 1);
      assert.equal(result[0]!.reason, 'out-of-domain');
    });

    it('handles boolean domain values', () => {
      const result = validateChooseNSelectedSequence(
        input({
          normalizedDomain: [true, false],
          selectedSequence: [true, false],
        }),
      );
      assert.deepStrictEqual(result, []);
    });
  });
});
