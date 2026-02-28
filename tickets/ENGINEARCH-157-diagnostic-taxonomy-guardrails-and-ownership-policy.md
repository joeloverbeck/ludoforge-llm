# ENGINEARCH-157: Add Diagnostic Taxonomy Guardrails and Ownership Policy Enforcement

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — diagnostic governance tests/guards across cnl/kernel
**Deps**: archive/tickets/ENGINEARCH-154-domain-scoped-diagnostic-code-registries-and-typed-factories.md

## Problem

Typed diagnostic registries now exist, but there is no structural guard preventing future reintroduction of ad-hoc `CNL_COMPILER_*`/`CNL_XREF_*` literals outside registry modules. Current tests check registry key/value canonicality but not call-site policy compliance.

## Assumption Reassessment (2026-02-28)

1. `cross-validate-diagnostic-codes.test.ts` currently validates `key === value` only.
2. No guard currently fails CI when new raw `CNL_COMPILER_*`/`CNL_XREF_*` literals are introduced in non-registry modules.
3. Mismatch: architecture intends centralized ownership and drift resistance; corrected scope is to enforce this via explicit guard test/policy.

## Architecture Check

1. Guardrails (policy tests) are cleaner and more robust than relying on convention-only ownership.
2. This is governance hardening only and does not alter game-specific data boundaries or runtime semantics.
3. No backwards compatibility paths; violations should fail fast in CI and require migration to canonical registries.

## What to Change

### 1. Define explicit ownership policy for diagnostic literal namespaces

Document allowed source-of-truth modules for `CNL_COMPILER_*` and `CNL_XREF_*` literals.

### 2. Add enforceable guard test/script

Add a test (or lightweight script invoked from tests) that scans `packages/engine/src/**` and fails when forbidden raw literals appear outside approved registry modules.

### 3. Align existing tests with policy

Keep canonical registry tests and extend them with policy compliance assertions.

## Files to Touch

- `packages/engine/test/unit/` (new policy guard test)
- `packages/engine/src/cnl/compiler-diagnostic-codes.ts` (reference allowlist source as needed)
- `packages/engine/src/cnl/cross-validate-diagnostic-codes.ts` (reference allowlist source as needed)
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

1. `packages/engine/test/unit/*diagnostic-policy*.test.ts` (new) — enforce literal ownership policy by scanning source files.
2. `packages/engine/test/unit/cross-validate-diagnostic-codes.test.ts` (modify if needed) — keep canonical registry assertions aligned with policy.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test -- --test-name-pattern="diagnostic.*policy|diagnostic codes"`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
5. `pnpm run check:ticket-deps`
