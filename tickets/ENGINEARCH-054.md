# ENGINEARCH-054: Enforce strict vs tolerant scoped-endpoint resolver usage boundaries

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel architecture guard tests for scoped endpoint resolver usage
**Deps**: ENGINEARCH-053

## Problem

The kernel now exposes both strict and tolerant scoped-endpoint resolver APIs. Current behavior is correct, but there is no anti-drift guardrail that prevents tolerant malformed-support resolver usage from leaking into normal effect handlers. That would silently weaken compile-time guarantees.

## Assumption Reassessment (2026-02-26)

1. `resolveRuntimeScopedEndpoint` (strict) and `resolveRuntimeScopedEndpointWithMalformedSupport` (tolerant) both exist in `packages/engine/src/kernel/scoped-var-runtime-access.ts`.
2. `transferVar` in `effects-resource.ts` intentionally uses tolerant resolver support for malformed runtime payload diagnostics.
3. Existing tests validate behavior and type assertions, but no structural policy test enforces where tolerant resolver usage is allowed.
4. **Mismatch + correction**: current architecture relies on discipline rather than an explicit guard test for strict/tolerant resolver boundaries.

## Architecture Check

1. A policy-level guard test is cleaner and more robust than relying on reviewer memory because it makes resolver-boundary violations fail fast in CI.
2. This change is purely kernel architecture enforcement and preserves game-agnostic runtime boundaries; no GameSpecDoc or game-specific branching is introduced.
3. No backwards-compatibility aliases/shims are introduced.

## What to Change

### 1. Add static architecture guard for scoped resolver API usage

Add a dedicated kernel test that scans `packages/engine/src/kernel/effects-*.ts` and enforces:
- strict resolver is the default endpoint resolver for normal effect handlers
- tolerant resolver is only allowed in explicit malformed payload boundaries (initial allowlist: `effects-resource.ts`)

### 2. Encode deterministic allowlist/denylist policy

Document allowed modules and prohibited usage patterns directly in the test so future refactors are explicit and auditable.

## Files to Touch

- `packages/engine/test/unit/kernel/effect-scoped-endpoint-resolver-guard.test.ts` (new)
- `packages/engine/test/helpers/ast-search-helpers.ts` (modify only if helper reuse is needed)

## Out of Scope

- Runtime behavior changes for `setVar`/`addVar`/`transferVar`
- GameSpecDoc/GameDef schema changes
- Runner/UI/visual-config changes

## Acceptance Criteria

### Tests That Must Pass

1. Guard test fails when tolerant resolver import/usage appears outside allowlisted malformed-boundary modules.
2. Guard test passes on current architecture where tolerant resolver usage is confined to `effects-resource.ts`.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Strict compile-time scoped-endpoint contracts remain the default across effect handlers.
2. Malformed payload tolerance remains explicit and isolated to designated runtime-ingestion boundaries.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-scoped-endpoint-resolver-guard.test.ts` — architecture anti-drift guard for strict vs tolerant resolver boundaries.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/effect-scoped-endpoint-resolver-guard.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
