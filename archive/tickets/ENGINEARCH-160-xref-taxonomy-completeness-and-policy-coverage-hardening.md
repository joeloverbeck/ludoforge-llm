# ENGINEARCH-160: Add XREF Taxonomy Completeness and Policy Coverage Hardening

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — diagnostic governance hardening for xref completeness plus strict classifier semantics
**Deps**: archive/tickets/ENGINEARCH-157-diagnostic-taxonomy-guardrails-and-ownership-policy.md

## Problem

Current governance tests enforce literal placement in `src/cnl`, but they do not explicitly assert end-to-end xref taxonomy coverage from source usage. Separately, `isCnlXrefDiagnosticCode` currently treats any `CNL_XREF_*` prefix as valid, which can classify forged/unregistered codes as canonical. That weakens taxonomy contract strictness.

## Assumption Reassessment (2026-02-28)

1. Current audit test scans `.ts` files under `src/cnl` for inline diagnostic literals and enforces allowlist ownership.
2. Existing xref registry test validates canonical key/value identity (`key === value`) and a basic classifier check, but it does not prove source-usage completeness against registry membership.
3. In current code, many xref emissions are already typed through `CNL_XREF_DIAGNOSTIC_CODES`, reducing missing-entry risk for direct property access.
4. Remaining architecture gap is strictness and governance explicitness: forged/dynamic `CNL_XREF_*` values can still pass prefix classification unless membership is enforced.
5. Corrected scope: add deterministic completeness assertions for CNL xref usage and tighten classifier semantics to exact registry membership.

## Architecture Check

1. Source-usage completeness checks are cleaner than convention-only taxonomy ownership and give deterministic drift detection.
2. Exact-membership classification (`isCnlXrefDiagnosticCode`) is more robust than prefix heuristics and better matches fail-fast architecture.
3. Governance checks remain generic and game-agnostic.
4. No compatibility shims: unknown/unregistered xref usage should fail tests and classifier checks.

## What to Change

### 1. Add completeness check for xref taxonomy usage

Add a unit test that scans CNL source usage of `CNL_XREF_*` tokens and asserts every used code is present in canonical xref registry exports. Failure output must include offending file paths and tokens.

### 2. Harden policy scan contract and scope clarity

Document and enforce expected scan scope (`src/cnl` as canonical ownership surface for this ticket) and keep policy assertions explicit/deterministic.

### 3. Tighten classifier semantics

Update `isCnlXrefDiagnosticCode` to validate exact membership in `CNL_XREF_DIAGNOSTIC_CODES` (not prefix-only).

## Files to Touch

- `packages/engine/src/cnl/cross-validate-diagnostic-codes.ts` (modify classifier strictness)
- `packages/engine/test/unit/cross-validate-diagnostic-codes.test.ts` (modify with completeness + strictness assertions)
- `packages/engine/test/unit/compiler-diagnostic-registry-audit.test.ts` (modify for explicit scan-scope contract and diagnostics)

## Out of Scope

- Game data updates in `GameSpecDoc`.
- Visual presentation updates in `visual-config.yaml`.

## Acceptance Criteria

### Tests That Must Pass

1. Tests fail if any `CNL_XREF_*` token is used in CNL source but missing from canonical xref registry.
2. `isCnlXrefDiagnosticCode` returns `true` only for registered xref codes and `false` for forged prefix-matching strings.
3. Tests fail with clear actionable output when policy/coverage violations are introduced.
4. Existing suite: `pnpm -F @ludoforge/engine test`
5. Existing suite: `pnpm -F @ludoforge/engine lint`

### Invariants

1. Xref taxonomy remains explicit, centralized, fully declared, and strictly classified by membership.
2. Engine compile/runtime contracts remain game-agnostic and free of game-specific branching.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cross-validate-diagnostic-codes.test.ts` — assert xref usage completeness against registry and strict classifier semantics.
2. `packages/engine/test/unit/compiler-diagnostic-registry-audit.test.ts` — keep ownership policy checks and clarify deterministic scan-scope contract.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/cross-validate-diagnostic-codes.test.js packages/engine/dist/test/unit/compiler-diagnostic-registry-audit.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion date**: 2026-02-28
- **What actually changed**:
  - Reassessed and corrected ticket assumptions/scope before implementation to reflect existing typed-usage protections and the remaining strictness gap.
  - Hardened xref classifier semantics in `cross-validate-diagnostic-codes.ts` from prefix matching to exact registry-membership matching.
  - Expanded `cross-validate-diagnostic-codes.test.ts` with:
    - forged-code rejection assertion for `isCnlXrefDiagnosticCode`
    - CNL source usage coverage audit that validates xref literals and `CNL_XREF_DIAGNOSTIC_CODES.<CODE>` members against canonical registry membership.
  - Extended `compiler-diagnostic-registry-audit.test.ts` with explicit scan-scope contract checks and normalized path diagnostics.
- **Deviations from original plan**:
  - Added a targeted source hardening change (`isCnlXrefDiagnosticCode` membership check) because architecture review showed prefix classification was permissive and not robust enough.
  - Kept test work in existing files rather than introducing a separate new test file.
- **Verification results**:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/cross-validate-diagnostic-codes.test.js packages/engine/dist/test/unit/compiler-diagnostic-registry-audit.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed (`332/332`).
  - `pnpm -F @ludoforge/engine lint` passed.
