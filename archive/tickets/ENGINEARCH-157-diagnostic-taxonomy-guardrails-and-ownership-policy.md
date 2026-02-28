# ENGINEARCH-157: Add Diagnostic Taxonomy Guardrails and Ownership Policy Enforcement

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — diagnostic governance tests/guards across cnl/kernel
**Deps**: archive/tickets/ENGINEARCH-154-domain-scoped-diagnostic-code-registries-and-typed-factories.md

## Problem

Typed diagnostic registries now exist, but there is no structural guard preventing future reintroduction of ad-hoc `CNL_COMPILER_*`/`CNL_XREF_*` literals outside registry modules. Current tests check registry key/value canonicality but not call-site policy compliance.

## Assumption Reassessment (2026-02-28)

1. `cross-validate-diagnostic-codes.test.ts` currently validates `key === value` only.
2. `compiler-diagnostic-registry-audit.test.ts` already enforces `CNL_COMPILER_*` literal ownership for `src/cnl` and fails CI on violations.
3. No equivalent guard currently exists for `CNL_XREF_*` literals; inline xref literals still exist in non-registry usage paths.
4. Mismatch: architecture intends centralized ownership and drift resistance; corrected scope is to extend existing guardrails to xref namespace and remove remaining non-registry inline literals where feasible.

## Architecture Check

1. Guardrails (policy tests) are cleaner and more robust than relying on convention-only ownership.
2. Extending the existing compiler-literal audit to include xref namespace is strictly better than adding parallel ad-hoc checks because it keeps one policy mechanism and one failure surface.
3. This is governance hardening only and does not alter game-specific data boundaries or runtime semantics.
4. No backwards compatibility paths; violations should fail fast in CI and require migration to canonical registries.

## What to Change

### 1. Define explicit ownership policy for diagnostic literal namespaces

Document allowed source-of-truth modules for `CNL_COMPILER_*` and `CNL_XREF_*` literals.

### 2. Add enforceable guard test/script

Extend the existing audit test so it scans `packages/engine/src/cnl/**` and fails when forbidden raw literals appear outside approved registry modules for each namespace:
- `CNL_COMPILER_*` -> compiler registry module(s)
- `CNL_XREF_*` -> xref registry module(s)

### 3. Align existing tests with policy

Keep canonical registry tests and extend them with policy compliance assertions.

### 4. Normalize remaining non-registry xref literals

Where current source code still uses inline `CNL_XREF_*` literals outside approved registry modules, migrate those call sites to registry exports so the guard can remain strict.

## Files to Touch

- `packages/engine/test/unit/compiler-diagnostic-registry-audit.test.ts` (extend existing policy guard test)
- `packages/engine/src/cnl/compiler-diagnostic-codes.ts` (reference allowlist source as needed)
- `packages/engine/src/cnl/cross-validate-diagnostic-codes.ts` (reference allowlist source as needed)
- `packages/engine/src/cnl/compiler-core.ts` (replace inline xref literal usage with registry-owned constant if needed)
- `packages/engine/src/cnl/action-selector-diagnostic-codes.ts` (explicitly treated as xref registry ownership for selector-contract surface)
- `docs/` or ticket-local policy section (if a short policy note is needed)

## Out of Scope

- Functional runtime behavior changes.
- Game data changes (`GameSpecDoc`) and visual config changes (`visual-config.yaml`).
- Full diagnostic migration work itself (covered by other tickets).

## Acceptance Criteria

### Tests That Must Pass

1. CI fails if forbidden raw `CNL_COMPILER_*`/`CNL_XREF_*` literals are added outside approved registry modules.
2. Existing diagnostic behavior remains unchanged.
3. Existing suite: `pnpm -F @ludoforge/engine test`
4. Existing suite: `pnpm -F @ludoforge/engine lint`

### Invariants

1. Diagnostic taxonomy ownership remains explicit, centralized, and enforceable.
2. GameDef/simulator/kernel remain game-agnostic with no game-specific branching.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compiler-diagnostic-registry-audit.test.ts` (modified) — enforce literal ownership policy for both compiler and xref namespaces by scanning source files.
2. `packages/engine/test/unit/cross-validate-diagnostic-codes.test.ts` (modify if needed) — keep canonical registry assertions aligned with policy.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/compiler-diagnostic-registry-audit.test.js packages/engine/dist/test/unit/cross-validate-diagnostic-codes.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
5. `pnpm run check:ticket-deps`

## Outcome

- **Completion date**: 2026-02-28
- **What actually changed**:
  - Updated ticket assumptions/scope to reflect that `CNL_COMPILER_*` guardrails already existed and the remaining governance gap was `CNL_XREF_*`.
  - Extended `packages/engine/test/unit/compiler-diagnostic-registry-audit.test.ts` to enforce literal ownership for both `CNL_COMPILER_*` and `CNL_XREF_*` namespaces with explicit per-namespace allowlists.
  - Added xref normalization helpers and `CNL_XREF_ZONEVAR_MISSING` to `packages/engine/src/cnl/cross-validate-diagnostic-codes.ts`.
  - Removed inline non-registry xref literal usage in `packages/engine/src/cnl/compiler-core.ts` by consuming registry helpers/constants.
  - Strengthened `packages/engine/test/unit/cross-validate-diagnostic-codes.test.ts` to assert helper behavior and canonicalization invariants.
- **Deviations from original plan**:
  - Did not add a brand-new policy test file; extended the existing compiler registry audit test to keep one governance mechanism.
  - Did not modify `compiler-diagnostic-codes.ts`; no additional compiler-namespace ownership changes were required.
- **Verification results**:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/compiler-diagnostic-registry-audit.test.js packages/engine/dist/test/unit/cross-validate-diagnostic-codes.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed (`331/331`).
  - `pnpm -F @ludoforge/engine lint` passed.
  - `pnpm run check:ticket-deps` passed.
