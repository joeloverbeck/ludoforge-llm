# ENGINEARCH-054: Enforce strict vs tolerant scoped-endpoint resolver usage boundaries

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel architecture guard test for scoped endpoint resolver usage boundaries
**Deps**: none (ENGINEARCH-053 is not present in `tickets/` and is not required by code)

## Problem

The kernel exposes both strict and tolerant scoped-endpoint resolver APIs in `scoped-var-runtime-access.ts`.
Current runtime behavior is correct, but there is no explicit anti-drift architecture test that fails when tolerant resolver usage leaks into normal effect handlers and weakens strict endpoint contracts.

## Assumption Reassessment (2026-02-26)

1. `resolveRuntimeScopedEndpoint` (strict) and `resolveRuntimeScopedEndpointWithMalformedSupport` (tolerant) both exist in `packages/engine/src/kernel/scoped-var-runtime-access.ts`.
2. `effects-var.ts` currently uses only strict resolver calls (`resolveRuntimeScopedEndpoint`) for `setVar`/`addVar`.
3. `effects-resource.ts` currently uses tolerant resolver calls (`resolveRuntimeScopedEndpointWithMalformedSupport`) for `transferVar` malformed payload handling.
4. Existing tests include architecture guards in `packages/engine/test/unit/kernel/` (for resolver normalization and scoped-int reads), but no guard yet enforces strict-vs-tolerant resolver module boundaries.
5. **Mismatch + correction**: previous dependency assumption (`ENGINEARCH-053`) is stale at ticket level; this ticket is implementable and verifiable independently.

## Architecture Reassessment

1. A dedicated architecture guard test is better than reviewer-only discipline because it turns boundary drift into deterministic CI failures.
2. The proposed change is beneficial versus current architecture because it codifies a policy that already exists implicitly in code.
3. The change is game-agnostic and keeps runtime/kernel logic generic (no game-specific branching or payload contracts).
4. No backward-compatibility aliases or shims are introduced.

## What to Change

### 1. Add static architecture guard for scoped resolver API usage

Add a dedicated kernel unit test that scans all `packages/engine/src/kernel/effects-*.ts` modules and enforces:
- strict resolver is allowed where scoped endpoint resolution is needed
- tolerant resolver is only allowed in explicit malformed-boundary modules

### 2. Encode deterministic allowlist policy

Use an explicit allowlist of tolerant-eligible modules directly in the test:
- `effects-resource.ts` (allowed)

All other `effects-*.ts` modules must not import or reference tolerant resolver APIs.

## Files to Touch

- `packages/engine/test/unit/kernel/effect-scoped-endpoint-resolver-guard.test.ts` (new)
- `archive/tickets/ENGINEARCH-054.md` (final reassessment, completion state, and outcome)

## Out of Scope

- Runtime behavior changes for `setVar`/`addVar`/`transferVar`
- `GameSpecDoc`/`GameDef` schema changes
- Runner/UI changes

## Acceptance Criteria

### Tests That Must Pass

1. Guard test fails when tolerant resolver import/usage appears outside allowlisted malformed-boundary modules.
2. Guard test passes when tolerant resolver usage is confined to `effects-resource.ts`.
3. Existing suite: `pnpm -F @ludoforge/engine test`
4. Lint suite: `pnpm -F @ludoforge/engine lint`

### Invariants

1. Strict scoped-endpoint contracts remain the default across effect handlers.
2. Malformed payload tolerance remains explicit and isolated to designated ingestion boundaries.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-scoped-endpoint-resolver-guard.test.ts` — architecture anti-drift guard for strict vs tolerant resolver boundaries.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/effect-scoped-endpoint-resolver-guard.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-02-26
- What changed:
  - Added `packages/engine/test/unit/kernel/effect-scoped-endpoint-resolver-guard.test.ts`.
  - Guard enforces that tolerant scoped endpoint resolver usage (`resolveRuntimeScopedEndpointWithMalformedSupport`) is isolated to allowlisted malformed-boundary effect modules (`effects-resource.ts`).
  - Guard enforces that non-allowlisted effect modules do not import/use tolerant resolver APIs and use strict resolver path when scoped endpoint resolution is present.
  - Reassessed and corrected ticket assumptions/scope, including stale dependency assumption.
- Deviations from original plan:
  - No helper changes were needed in `packages/engine/test/helpers/ast-search-helpers.ts`; existing guard-test style works with direct source scanning.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/kernel/effect-scoped-endpoint-resolver-guard.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed (`291` tests, `291` passed).
  - `pnpm -F @ludoforge/engine lint` passed.
