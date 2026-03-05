# PIPEVAL-016: Harden named-set collision diagnostic path encoding

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — CNL diagnostics path construction boundary hardening
**Deps**: `archive/tickets/PIPEVAL/PIPEVAL-011-enforce-canonical-named-set-id-collision-diagnostics-in-compile-path.md`

## Problem

Named-set collision diagnostics currently build paths by interpolating raw authored ids directly (for example `doc.metadata.namedSets.${rawId}`). Authored ids are only validated as non-empty strings, so path-significant characters can produce ambiguous diagnostic paths and unstable source-map alignment.

## Assumption Reassessment (2026-03-05)

1. `toNamedSetCanonicalIdCollisionDiagnostics(...)` in `packages/engine/src/cnl/named-set-utils.ts` currently interpolates raw ids into dot-form diagnostic paths.
2. `validateMetadata(...)` enforces non-empty string named-set ids but does not constrain path metacharacters (`.`, `[`, `]`, etc.).
3. Mismatch correction: diagnostic path rendering must be canonicalized/escaped in one shared helper at the collision boundary rather than relying on raw authored key interpolation.

## Architecture Check

1. Centralized path-safe encoding is cleaner and more robust than ad-hoc string interpolation in compiler/validator call sites.
2. This is diagnostic infrastructure only and preserves GameSpecDoc game-specific data ownership while keeping GameDef/runtime/simulator game-agnostic.
3. No backwards-compatibility aliasing or shim behavior is introduced.

## What to Change

### 1. Add canonical path-segment encoding helper for named-set keys

Add a shared helper used by collision diagnostics to convert authored named-set keys into deterministic path-safe segments.

### 2. Route collision diagnostics through the encoded path helper

Update `toNamedSetCanonicalIdCollisionDiagnostics(...)` to use path-safe key encoding for all emitted diagnostic paths.

### 3. Lock behavior with targeted edge-case tests

Add tests covering named-set ids that include path-significant characters and confirm deterministic, exact-path diagnostics.

## Files to Touch

- `packages/engine/src/cnl/named-set-utils.ts` (modify)
- `packages/engine/test/unit/compiler-api.test.ts` (modify)
- `packages/engine/test/unit/validate-spec.test.ts` (modify)

## Out of Scope

- Changing named-set canonicalization semantics (`trim + NFC`)
- Changing runtime/simulator behavior
- Broad diagnostic path system refactor outside named-set collision ownership

## Acceptance Criteria

### Tests That Must Pass

1. Compiler collision diagnostics remain deterministic and reference the correct authored named-set key when ids contain path metacharacters.
2. Validator collision diagnostics match the same encoded path contract for the same inputs.
3. Existing suite: `pnpm turbo test --force`

### Invariants

1. Named-set collision diagnostics are generated from one canonical boundary with deterministic path encoding.
2. GameDef/runtime/simulation layers remain game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compiler-api.test.ts` — add compile-only collision diagnostics case with path-significant named-set ids.
2. `packages/engine/test/unit/validate-spec.test.ts` — add validator parity coverage for path-significant named-set ids.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/compiler-api.test.js packages/engine/dist/test/unit/validate-spec.test.js`
3. `pnpm turbo test --force`
4. `pnpm turbo lint`
