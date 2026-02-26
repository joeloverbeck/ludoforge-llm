# ENGINEARCH-053: Add anti-drift guardrails for effect handler resolver-normalization usage

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel test guardrail for architecture invariants
**Deps**: none

## Problem

Resolver-normalization consistency currently relies on manual discipline. Future effect edits can accidentally reintroduce direct resolver calls in handlers and silently split runtime error contracts again.

## Assumption Reassessment (2026-02-26)

1. Effect handlers that resolve player/zone selectors currently route that resolution via shared normalization helpers (`selector-resolution-normalization.ts`).
2. Some effect handler modules do not resolve player/zone selectors at all; they are outside this guardrail's enforcement surface.
3. There is currently no structural test guard dedicated to preventing direct `resolveZoneRef`/`resolvePlayerSel` usage drift inside effect handler modules.
4. Existing kernel architecture guard tests already enforce similar static invariants (for example scoped-int read guard), so this ticket should follow that proven pattern.

## Architecture Check

1. A dedicated static guard test is more robust than relying on reviewer memory and keeps resolver contracts centralized.
2. This is game-agnostic architecture enforcement and aligns with existing kernel guard-test strategy.
3. Guardrails reduce long-term drift risk with minimal maintenance cost.
4. No backwards-compatibility aliasing/shims are introduced.

## What to Change

### 1. Add static guard test for effect handlers

Add a test that scans `packages/engine/src/kernel/effects-*.ts` and fails if prohibited direct resolver imports/usages (`resolveZoneRef`/`resolvePlayerSel`) appear in effect handler modules.

### 2. Document allowed exception surface in test

Encode explicit allowlist/denylist in test to keep policy deterministic and maintainable (including modules that are out of scope because they do not resolve selectors/zones).

## Files to Touch

- `packages/engine/test/unit/kernel/effect-resolver-normalization-guard.test.ts` (new)
- `packages/engine/test/helpers/ast-search-helpers.ts` (optional; modify only if helper reuse is needed)

## Out of Scope

- Runtime behavior changes
- Selector resolver implementation changes
- Non-kernel package changes

## Acceptance Criteria

### Tests That Must Pass

1. Guard test fails if direct resolver usage is introduced in normalized effect handler modules.
2. Guard test passes on current normalized architecture.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Effect resolver-normalization architecture remains enforced over time.
2. Kernel/runtime stays game-agnostic and free of game-specific branches.
3. Selector/zone resolver error semantics remain centralized through normalization wrappers.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-resolver-normalization-guard.test.ts` — architecture guardrail against direct resolver drift.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/effect-resolver-normalization-guard.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-02-26
- What changed:
  - Added `packages/engine/test/unit/kernel/effect-resolver-normalization-guard.test.ts`.
  - Enforced denylist for direct `resolveZoneRef`/`resolvePlayerSel` usage across `effects-*.ts`.
  - Enforced explicit module policy map (selector-normalized vs selector-free effect modules) so architecture drift is caught structurally.
- Deviations from original plan:
  - `packages/engine/test/helpers/ast-search-helpers.ts` was not modified; local static source scanning was sufficient and cleaner for this guard.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/kernel/effect-resolver-normalization-guard.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed (`290` passed, `0` failed).
  - `pnpm -F @ludoforge/engine lint` passed.
