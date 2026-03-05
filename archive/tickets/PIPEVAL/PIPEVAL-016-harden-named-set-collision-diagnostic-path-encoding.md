# PIPEVAL-016: Harden named-set collision diagnostic path encoding

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — CNL diagnostics path construction boundary hardening
**Deps**: `archive/tickets/PIPEVAL/PIPEVAL-011-enforce-canonical-named-set-id-collision-diagnostics-in-compile-path.md`

## Problem

Named-set collision diagnostics currently build paths by interpolating raw authored ids directly (for example `doc.metadata.namedSets.${rawId}`). Authored ids are only validated as non-empty strings, so path-significant characters can produce ambiguous diagnostic paths and unstable source-map alignment.

## Assumption Reassessment (2026-03-05)

1. `toNamedSetCanonicalIdCollisionDiagnostics(...)` in `packages/engine/src/cnl/named-set-utils.ts` currently interpolates raw ids into dot-form diagnostic paths.
2. `validateMetadata(...)` in `packages/engine/src/cnl/validate-metadata.ts` also interpolates raw named-set keys into diagnostic paths for keyed validator errors, so collision-only hardening would leave contract drift across named-set diagnostics.
3. Existing tests only cover canonical-equivalent id collisions with path-safe ids (for example `café`), and do not cover path-significant key characters.
4. Mismatch correction: named-set diagnostic path rendering should be centralized in one helper and reused by both collision diagnostics and keyed validator diagnostics.

## Architecture Check

1. Centralized path-safe encoding is cleaner and more robust than ad-hoc string interpolation in compiler/validator call sites.
2. This is diagnostic infrastructure only and preserves GameSpecDoc game-specific data ownership while keeping GameDef/runtime/simulator game-agnostic.
3. No backwards-compatibility aliasing or shim behavior is introduced.

## What to Change

### 1. Add canonical path-segment encoding helper for named-set keys

Add a shared helper that converts authored named-set keys into deterministic path-safe diagnostic suffixes.

### 2. Route named-set diagnostics through the encoded path helper

Update `toNamedSetCanonicalIdCollisionDiagnostics(...)` and keyed diagnostics in `validateMetadata(...)` to use the same encoded-path contract.

### 3. Lock behavior with targeted edge-case tests

Add tests covering named-set ids that include path-significant characters and confirm deterministic, exact-path diagnostics.

## Files to Touch

- `packages/engine/src/cnl/named-set-utils.ts` (modify)
- `packages/engine/src/cnl/validate-metadata.ts` (modify)
- `packages/engine/test/unit/compiler-api.test.ts` (modify)
- `packages/engine/test/unit/validate-spec.test.ts` (modify)

## Out of Scope

- Changing named-set canonicalization semantics (`trim + NFC`)
- Changing runtime/simulator behavior
- Broad diagnostic path system refactor outside named-set collision ownership

## Acceptance Criteria

### Tests That Must Pass

1. Compiler collision diagnostics remain deterministic and reference the correct authored named-set key when ids contain path metacharacters.
2. Validator collision diagnostics and keyed metadata.namedSets diagnostics use the same encoded path contract.
3. Existing suite: `pnpm turbo test --force`

### Invariants

1. Named-set collision diagnostics are generated from one canonical boundary with deterministic path encoding.
2. GameDef/runtime/simulation layers remain game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compiler-api.test.ts` — add compile-only collision diagnostics case with path-significant named-set ids.
2. `packages/engine/test/unit/validate-spec.test.ts` — add validator parity coverage for path-significant named-set ids and keyed named-set diagnostics.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/compiler-api.test.js packages/engine/dist/test/unit/validate-spec.test.js`
3. `pnpm turbo test --force`
4. `pnpm turbo lint`

## Outcome

- Outcome amended: 2026-03-05

- Completion date: 2026-03-05
- What changed:
  - Added a shared named-set diagnostic path helper in `packages/engine/src/cnl/named-set-utils.ts` that emits bracket-encoded key segments (`base["raw.key"]`).
  - Updated named-set collision diagnostics to use the shared helper.
  - Updated keyed `metadata.namedSets` validator diagnostics in `packages/engine/src/cnl/validate-metadata.ts` to use the same helper, ensuring one path contract across named-set diagnostics.
  - Updated existing compiler/validator duplicate-id tests to assert the encoded path contract.
  - Added targeted compiler/validator tests for path-significant named-set ids (dot-containing ids) and keyed validator path encoding.
- Deviations from original plan:
  - Scope was expanded from collision-only path hardening to all keyed `metadata.namedSets` validator diagnostics to avoid contract drift between collision and non-collision named-set diagnostics.
  - Bracket-heavy key samples (for example `[...]`) were replaced by dot-heavy metacharacter fixtures in tests because current compile-path preprocessing normalizes bracket substrings in keyed ids before collision emission.
- Verification results:
  - `pnpm turbo build` passed.
  - `node --test packages/engine/dist/test/unit/compiler-api.test.js packages/engine/dist/test/unit/validate-spec.test.js` passed.
  - `pnpm turbo test --force` passed.
  - `pnpm turbo lint` passed.
  - Refinement verification:
    - `pnpm turbo build` passed.
    - `node --test packages/engine/dist/test/unit/compiler-api.test.js packages/engine/dist/test/unit/validate-spec.test.js` passed.
    - `pnpm turbo test --force` passed.
    - `pnpm turbo lint` passed.

- Post-completion refinement:
  - Root-cause fix in `packages/engine/src/cnl/compiler-core.ts`: `normalizeDiagnosticPath(...)` no longer rewrites numeric bracket substrings inside bracket-quoted keyed segments (for example it now preserves `doc.metadata.namedSets["insurgent.group[0]"]`).
  - Updated regression tests to assert bracketed key preservation for collision and keyed metadata.namedSets validator diagnostics.
