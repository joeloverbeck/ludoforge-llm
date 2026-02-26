# ENGINEARCH-053: Add anti-drift guardrails for effect handler resolver-normalization usage

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel test guardrail for architecture invariants
**Deps**: none

## Problem

Resolver-normalization consistency currently relies on manual discipline. Future effect edits can accidentally reintroduce direct resolver calls in handlers and silently split runtime error contracts again.

## Assumption Reassessment (2026-02-26)

1. Effect handlers currently route selector/zone resolution via shared normalization helpers.
2. There is no structural test guard that fails when direct resolver calls are reintroduced in effect handlers.
3. **Mismatch + correction**: architecture invariants should be enforced by tests, not only by conventions.

## Architecture Check

1. A dedicated guard test is cleaner and more durable than relying on code review memory.
2. This is game-agnostic static architecture enforcement in kernel tests.
3. No backwards-compatibility aliasing/shims are introduced.

## What to Change

### 1. Add static guard test for effect handlers

Add a test that scans `packages/engine/src/kernel/effects-*.ts` and fails if prohibited direct resolver imports/usages (`resolveZoneRef`/`resolvePlayerSel`) appear in handler modules that should use normalization wrappers.

### 2. Document allowed exception surface in test

Encode explicit allowlist/denylist in test to keep policy deterministic and maintainable.

## Files to Touch

- `packages/engine/test/unit/kernel/effect-resolver-normalization-guard.test.ts` (new)
- `packages/engine/test/helpers/ast-search-helpers.ts` (modify only if helper reuse is needed)

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

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-resolver-normalization-guard.test.ts` — architecture guardrail against direct resolver drift.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/effect-resolver-normalization-guard.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
