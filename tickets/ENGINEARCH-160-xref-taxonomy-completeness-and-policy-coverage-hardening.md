# ENGINEARCH-160: Add XREF Taxonomy Completeness and Policy Coverage Hardening

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — diagnostic governance tests for taxonomy completeness and scan scope
**Deps**: archive/tickets/ENGINEARCH-157-diagnostic-taxonomy-guardrails-and-ownership-policy.md

## Problem

Current governance tests enforce literal placement but do not guarantee that all emitted `CNL_XREF_*` codes are declared in the canonical registry. This allows silent taxonomy drift (usage without registration) and weakens long-term contract clarity.

## Assumption Reassessment (2026-02-28)

1. Current audit test scans for inline literals in `src/cnl` and checks allowlist policy.
2. Existing xref registry test checks key/value canonicality (`key === value`) but not usage completeness against emitted/consumed codes.
3. Mismatch: architecture intent is explicit, fail-fast taxonomy ownership. Corrected scope is to add completeness assertions and make policy coverage explicit.

## Architecture Check

1. Taxonomy completeness checks are cleaner than relying on manual discipline to keep registry and call sites synchronized.
2. Governance checks stay generic and do not encode game-specific data or visual presentation behavior.
3. No compatibility shims: unknown/unregistered xref usage should fail tests instead of being tolerated.

## What to Change

### 1. Add completeness check for xref taxonomy

Add a unit test that scans CNL source usage of `CNL_XREF_*` and asserts every used code is present in canonical xref registry exports.

### 2. Harden policy scan contract

Document and enforce expected scan scope (at minimum `src/cnl`; optionally broaden if architecture expects engine-wide ownership enforcement for xref literals).

### 3. Improve failure diagnostics

Ensure test output clearly reports missing registry entries and offending file paths to keep remediation deterministic.

## Files to Touch

- `packages/engine/test/unit/cross-validate-diagnostic-codes.test.ts` (modify or split)
- `packages/engine/test/unit/compiler-diagnostic-registry-audit.test.ts` (modify)
- `packages/engine/test/unit/` (new test file if split improves maintainability)

## Out of Scope

- Runtime logic changes.
- Game data updates in `GameSpecDoc`.
- Visual presentation updates in `visual-config.yaml`.

## Acceptance Criteria

### Tests That Must Pass

1. Tests fail if any `CNL_XREF_*` code is used in CNL source but missing from canonical xref registry.
2. Tests fail with clear actionable output when policy/coverage violations are introduced.
3. Existing suite: `pnpm -F @ludoforge/engine test`
4. Existing suite: `pnpm -F @ludoforge/engine lint`

### Invariants

1. Xref taxonomy remains explicit, centralized, and fully declared.
2. Engine compile/runtime contracts remain game-agnostic and free of game-specific branching.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cross-validate-diagnostic-codes.test.ts` (or new dedicated test) — assert xref usage completeness against registry.
2. `packages/engine/test/unit/compiler-diagnostic-registry-audit.test.ts` — keep ownership policy checks and clarify scan-scope intent.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/cross-validate-diagnostic-codes.test.js packages/engine/dist/test/unit/compiler-diagnostic-registry-audit.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
