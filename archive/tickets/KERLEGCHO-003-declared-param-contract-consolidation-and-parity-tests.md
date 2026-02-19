# KERLEGCHO-003: Declared Param Contract Consolidation + Cross-Surface Parity Tests

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — refactor for robustness and extensibility
**Deps**: KERLEGCHO-001, KERLEGCHO-002

## Reassessment (2026-02-19)

### Verified current state

1. Canonical declared-param normalization/membership helper already exists in engine kernel code:
   - `packages/engine/src/kernel/move-param-normalization.ts`
   - `packages/engine/src/kernel/declared-action-param-domain.ts`
2. `legalChoices*` and `applyMove` already use this helper path.
3. There is already substantial parity coverage in unit tests (`legal-choices`, `apply-move`, and cross-surface parity helper tests).

### Remaining discrepancy vs intended architecture

`legalMoves` parameter enumeration still uses raw query outputs and does not consistently pass through the same declared-param canonicalization/validation path used by `legalChoices*` and `applyMove`.

That leaves drift risk and can violate the invariant that a move emitted by one surface should not be rejected by another for declared-param contract reasons (especially for non-encodable/raw-object domain outputs).

### Updated scope

This ticket is now scoped to **close the remaining `legalMoves` gap** and strengthen parity tests, rather than introducing a brand new helper architecture (already present).

## Problem

Declared action param handling still has one notable split point: `legalMoves` template/param enumeration does not fully share the canonical normalization/validation path used by `legalChoices*` and `applyMove`. This keeps drift risk alive and makes regressions likely when one surface changes behavior.

To keep architecture clean and extensible, declared-param normalization/membership rules should have one canonical implementation with parity tests across all entry points.

## What to Change

**Files (expected)**:
- `packages/engine/src/kernel/legal-moves.ts`
- `packages/engine/src/kernel/legal-choices.ts`
- `packages/engine/src/kernel/apply-move.ts`
- `packages/engine/src/kernel/declared-action-param-domain.ts` (if helper API needs narrow extension)
- `packages/engine/src/kernel/move-param-normalization.ts` (if canonicalization contract needs narrow extension)
- `packages/engine/test/unit/kernel/legal-choices.test.ts`
- `packages/engine/test/unit/kernel/legal-moves*.test.ts` (or closest existing legal-moves unit file)
- `packages/engine/test/unit/kernel/apply-move.test.ts`
- `packages/engine/test/unit/kernel/legality-surface-parity.test.ts` (or parity helper coverage equivalent)

Adopt the existing canonical declared-param contract helper uniformly:

1. Keep normalization + domain membership checks in the existing shared helper path (no duplicate implementations).
2. Use the helper in `legalChoices*`, `legalMoves` param enumeration gates (where applicable), and `applyMove` validation.
3. Document expected behavior for invalid encoding and out-of-domain values in one place.
4. Add explicit parity tests so a move accepted by one surface is not rejected by another for declared-param reasons.

## Invariants

1. Declared-param acceptance/rejection is consistent across `legalChoices*`, `legalMoves`, and `applyMove`.
2. No surface may return/emit a move template as valid if `applyMove` would reject it for declared-param contract reasons.
3. Canonical helper remains game-agnostic and query-driven (no per-game schema branches).
4. Refactor introduces no change to GameSpecDoc ownership boundaries (`GameSpecDoc` stays game-specific; `GameDef`/simulator remain agnostic).

## Tests

1. **Parity table tests**: same set of declared-param fixtures asserted across `legalChoices*`, `legalMoves`, and `applyMove`.
2. **Negative parity tests**: out-of-domain, wrong-shape, and non-encodable cases reject consistently across surfaces.
3. **Positive parity tests**: valid params accepted consistently and produce compatible move progression/execution.
4. **Regression**: existing kernel unit/integration suites for legal choices, legal moves, and apply move remain green.

## Outcome

- **Completion date**: 2026-02-19
- **What changed**:
  - Added shared declared-param domain option resolver in `packages/engine/src/kernel/declared-action-param-domain.ts` and reused it for membership checks.
  - Updated `legalChoices` declared-param option handling to consume the shared resolver (no duplicated normalization loop).
  - Updated `legalMoves` declared-param enumeration to consume canonical normalized options and fail fast on non-encodable domain values.
  - Added `LEGAL_MOVES_VALIDATION_FAILED` runtime error code/context contract in `packages/engine/src/kernel/runtime-error.ts`.
  - Added/strengthened declared-param tests in `packages/engine/test/unit/kernel/legal-moves.test.ts`.
- **Deviation from original plan**:
  - No new standalone helper file was created because canonical helper modules already existed; work focused on consolidating remaining call sites and extending the existing contract.
  - `applyMove` required no functional changes because it was already on the canonical membership path.
- **Verification**:
  - `pnpm turbo test` passed.
  - `pnpm turbo lint` passed.
