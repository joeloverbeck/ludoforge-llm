# PIPEVAL-011: Enforce canonical named-set id collision diagnostics in compile path

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — CNL compiler/validator named-set canonicalization boundary hardening
**Deps**: `archive/tickets/PIPEVAL/PIPEVAL-009-complete-canonical-identifier-single-source-adoption.md`

## Problem

`metadata.namedSets` ids are now canonicalized for lowering usage, but compile-only flows can still silently collapse canonical-equivalent ids due to `Map.set` overwrite behavior. This makes compiler behavior less explicit and less robust than required for strict, deterministic GameSpecDoc-to-GameDef compilation.

## Assumption Reassessment (2026-03-05)

1. `compileGameSpecToGameDef(...)` does not run `validateGameSpec(...)` before constructing compile sections.
2. `canonicalizeNamedSets(...)` currently canonicalizes by building a `Map` and does not emit/return collision diagnostics.
3. `validateMetadata(...)` now flags duplicate canonical named-set ids, but that guarantee is not automatically enforced by compile-only entry points.
4. Existing test coverage already verifies validator-side duplicate canonical named-set ids (`validate-spec.test.ts`), but compile-only API coverage for this invariant is currently missing.
5. Mismatch correction: duplicate canonical-id handling must be owned by a shared canonicalization boundary that both validator and compiler paths can use directly.

## Architecture Check

1. A single canonicalization+collision-detection boundary is cleaner than split validator/compiler logic and eliminates silent overwrite behavior.
2. This remains game-agnostic infrastructure; no game-specific branches leak into GameDef/runtime/simulator/kernel.
3. No compatibility shims or alias paths are needed; strict canonical collision errors should be first-class behavior.

## What to Change

### 1. Introduce shared canonicalization-with-diagnostics boundary

Refactor named-set canonicalization so one shared CNL utility can:
- canonicalize named-set ids to canonical ids
- detect canonical-equivalent id collisions without `Map.set` overwrite ambiguity
- preserve deterministic collision ownership metadata (canonical id + raw authored ids/paths)
- surface deterministic diagnostics payload that compiler/validator callers can consume

### 2. Use shared boundary in compiler path

Update compile path (`compileGameSpecToGameDef` flow) to consume collision diagnostics from the shared boundary and ensure no silent overwrite semantics remain.

### 3. Use shared boundary in validator path

Remove duplicate canonical-id collision logic from `validateMetadata` and consume the same shared boundary/diagnostic ownership to avoid drift.

### 4. Add anti-regression coverage

Add targeted tests proving compile-only invocation surfaces canonical-id collision diagnostics, and that named-set lookup behavior remains deterministic when ids are unique.

## Scope Correction

1. `compile-conditions.ts` behavior does not require semantic change for this ticket; only deterministic lookup/no-regression verification is required there.
2. `validateMetadata(...)` should stop owning duplicate canonical named-set detection inline and instead consume shared collision metadata from the canonicalization utility.

## Files to Touch

- `packages/engine/src/cnl/named-set-utils.ts` (modify)
- `packages/engine/src/cnl/compiler-core.ts` (modify)
- `packages/engine/src/cnl/validate-metadata.ts` (modify)
- `packages/engine/src/cnl/compile-conditions.ts` (verify/minimal adjust only if needed)
- `packages/engine/test/unit/validate-spec.test.ts` (modify)
- `packages/engine/test/unit/compile-conditions.test.ts` (verify/minimal adjust only if needed)
- `packages/engine/test/unit/compiler-api.test.ts` (modify/add)
- `packages/engine/test/unit/lint/cnl-identifier-normalization-single-source-policy.test.ts` (verify/no-op)

## Out of Scope

- Changing named-set value semantics beyond current canonical identifier rules (`trim + NFC`)
- Any visual-config.yaml behavior or rendering/UI concerns
- Any game-specific rule logic in GameDef/simulator/kernel

## Acceptance Criteria

### Tests That Must Pass

1. Compile-only flow emits explicit diagnostic for canonical-equivalent duplicate `metadata.namedSets` ids (no silent overwrite).
2. Validator and compiler consume the same canonical-id collision ownership path.
3. Named-set lookup in condition lowering remains deterministic and canonicalized.
4. Existing suite: `pnpm turbo test --force`

### Invariants

1. Canonical named-set id ownership is centralized and deterministic across compile + validate surfaces.
2. GameDef and simulation remain game-agnostic with no game-specific branching.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compiler-api.test.ts` — verify compile-only path reports canonical named-set id collisions.
2. `packages/engine/test/unit/validate-spec.test.ts` — verify validator behavior remains aligned with shared collision ownership.
3. `packages/engine/test/unit/compile-conditions.test.ts` — ensure canonical named-set lookup behavior remains unchanged for valid specs.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/compiler-api.test.js packages/engine/dist/test/unit/validate-spec.test.js packages/engine/dist/test/unit/compile-conditions.test.js`
3. `pnpm turbo test --force`
4. `pnpm turbo lint`

## Outcome

- **Completion date**: 2026-03-05
- **What actually changed**:
  - Added shared named-set canonicalization boundary returning deterministic collision metadata in `packages/engine/src/cnl/named-set-utils.ts`.
  - Added shared named-set canonical-id collision diagnostic factory in `packages/engine/src/cnl/named-set-utils.ts` so compiler and validator consume one canonical diagnostic-construction path.
  - Compiler now consumes shared collision metadata and emits explicit compile diagnostics for canonical-equivalent duplicate `metadata.namedSets` ids in `packages/engine/src/cnl/compiler-core.ts`.
  - Validator now consumes the same shared collision metadata instead of owning duplicate canonical-id detection inline in `packages/engine/src/cnl/validate-metadata.ts`.
  - Added compiler diagnostic code `CNL_COMPILER_METADATA_NAMED_SET_DUPLICATE_ID` in `packages/engine/src/cnl/compiler-diagnostic-codes.ts`.
  - Added/strengthened coverage in `packages/engine/test/unit/compiler-api.test.ts` and `packages/engine/test/unit/validate-spec.test.ts`.
- **Deviations from original plan**:
  - `compile-conditions.ts` and `compile-conditions.test.ts` required no semantic/code changes; existing behavior remained valid and deterministic for unique ids.
  - `packages/engine/test/unit/lint/cnl-identifier-normalization-single-source-policy.test.ts` remained unchanged (verification-only no-op).
- **Verification results**:
  - `pnpm turbo build` passed.
  - `node --test packages/engine/dist/test/unit/compiler-api.test.js packages/engine/dist/test/unit/validate-spec.test.js packages/engine/dist/test/unit/compile-conditions.test.js` passed.
  - `pnpm turbo test --force` passed.
  - `pnpm turbo lint` passed.
