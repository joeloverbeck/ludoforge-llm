# PIPEVAL-009: Complete canonical identifier single-source adoption

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — CNL normalization call-site consolidation
**Deps**: `archive/tickets/PIPEVAL/PIPEVAL-008-add-linkedwindow-contract-anti-drift-guards.md`

## Problem

`canonicalizeIdentifier` is now the shared contract for identifier normalization, but some CNL call sites still use inline `trim().normalize('NFC')`. This creates avoidable drift risk if canonical semantics change.

## Assumption Reassessment (2026-03-05)

1. `packages/engine/src/contracts/canonical-identifier-contract.ts` is the canonical shared implementation for identifier normalization.
2. `packages/engine/src/cnl/identifier-utils.ts` already delegates to `canonicalizeIdentifier`.
3. Inline normalization call sites still exist in CNL modules (specifically `compile-conditions.ts`, `validate-metadata.ts`).
4. `packages/engine/test/unit/lint/cnl-identifier-normalization-single-source-policy.test.ts` already exists, but currently enforces symbol ownership/import boundary only and does not fail on raw inline `trim().normalize('NFC')` literals.

## Architecture Check

1. Routing all identifier normalization through one contract function is cleaner and prevents semantic skew across compile/validate surfaces.
2. This is engine-agnostic infrastructure work; no GameSpecDoc or visual-config game-specific behavior is introduced in GameDef/runtime/simulation.
3. No backwards-compatibility shims are needed; direct migration to the canonical helper only.

## What to Change

### 1. Replace inline normalization with canonical helper

Migrate remaining identifier-like normalization call sites from inline `trim().normalize('NFC')` to `canonicalizeIdentifier(...)` (directly or via `normalizeIdentifier` when appropriate).

### 2. Add anti-drift lint policy test

Extend the existing policy test so it also fails if any non-canonical CNL module reintroduces inline `trim().normalize('NFC')` instead of routing through `normalizeIdentifier`.

### 3. Strengthen behavior coverage for canonicalized named-set normalization

Add/adjust unit coverage to lock in canonical helper behavior where these call sites matter:

- `compile-conditions` named-set reference lookup should resolve through canonical normalization (trim + NFC).
- `validate-metadata` named-set duplicate detection should treat canonically equivalent strings as duplicates.

## Files to Touch

- `packages/engine/src/cnl/compile-conditions.ts` (modify)
- `packages/engine/src/cnl/validate-metadata.ts` (modify)
- `packages/engine/test/unit/lint/cnl-identifier-normalization-single-source-policy.test.ts` (modify)
- `packages/engine/test/unit/compile-conditions.test.ts` (modify)
- `packages/engine/test/unit/validate-spec.test.ts` (modify)
- `packages/engine/test/unit/contracts/canonical-identifier-contract.test.ts` (verify/no-op)

## Out of Scope

- Changing normalization semantics beyond current `trim + NFC`
- Game-specific rules, GameSpecDoc schema changes, or visual-config behavior
- Runtime/simulator behavior changes unrelated to identifier canonicalization

## Acceptance Criteria

### Tests That Must Pass

1. CNL identifier normalization call sites covered by this ticket use canonical helper ownership instead of inline normalization.
2. Policy test fails if new non-canonical inline normalization is reintroduced in guarded CNL surfaces.
3. Existing suite: `pnpm turbo test --force`
4. Named-set lookup/duplicate behavior stays stable under canonical-equivalent inputs (whitespace and NFC/NFD variants).

### Invariants

1. Identifier canonicalization semantics remain centralized in shared contracts.
2. GameDef and simulation remain game-agnostic with no game-specific branching.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/lint/cnl-identifier-normalization-single-source-policy.test.ts` — enforce canonical helper ownership at guarded CNL normalization surfaces.
2. `packages/engine/test/unit/compile-conditions.test.ts` — assert named-set references resolve after canonical normalization.
3. `packages/engine/test/unit/validate-spec.test.ts` — assert duplicate named-set values are detected for canonical-equivalent strings.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/lint/cnl-identifier-normalization-single-source-policy.test.js`
3. `pnpm turbo test --force`
4. `pnpm turbo lint`

## Outcome

- **Completion date**: 2026-03-05
- **What changed**:
  - Replaced remaining inline identifier normalization call sites in:
    - `packages/engine/src/cnl/compile-conditions.ts`
    - `packages/engine/src/cnl/validate-metadata.ts`
  - Extended `packages/engine/test/unit/lint/cnl-identifier-normalization-single-source-policy.test.ts` to also fail on non-canonical inline `trim().normalize('NFC')` literals in non-canonical CNL modules.
  - Added behavior-locking regression tests:
    - canonicalized named-set lookup in `packages/engine/test/unit/compile-conditions.test.ts`
    - canonical-equivalent duplicate detection in `packages/engine/test/unit/validate-spec.test.ts`
- **Deviations from original plan**:
  - Ticket scope was corrected before implementation to reflect that the policy test already existed but did not enforce literal anti-drift.
  - Added explicit behavioral regression tests beyond lint-policy enforcement to guard canonical semantics where these call sites are consumed.
- **Verification results**:
  - `pnpm turbo build` ✅
  - `node --test packages/engine/dist/test/unit/lint/cnl-identifier-normalization-single-source-policy.test.js` ✅
  - `node --test packages/engine/dist/test/unit/compile-conditions.test.js` ✅
  - `node --test packages/engine/dist/test/unit/validate-spec.test.js` ✅
  - `pnpm turbo test --force` ✅
  - `pnpm turbo lint` ✅
