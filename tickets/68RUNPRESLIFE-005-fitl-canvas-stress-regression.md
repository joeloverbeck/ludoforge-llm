# 68RUNPRESLIFE-005: Add FITL Canvas Stress Regression That Fails on Any Runner Console Error

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner verification only
**Deps**: archive/tickets/RUNPRESLIFE/68RUNPRESLIFE-002-retained-text-runtime.md, archive/tickets/RUNPRESLIFE/68RUNPRESLIFE-003-frame-commit-and-disposal-lifecycle.md, tickets/68RUNPRESLIFE-004-strict-visual-config-gating.md, archive/tickets/RUNPRESLIFE/68RUNPRESLIFE-006-complete-scene-migration-for-tokens-and-announcements.md

## Problem

The current repo has strong unit coverage around config parsing and some renderer lifecycle paths, but the error in [`logs/fitl-logs.log`](/home/joeloverbeck/projects/ludoforge-llm/logs/fitl-logs.log) still escaped into a real FITL browser session. That means the quality gate is missing a production-scale runner stress check that treats any console error or unexpected warning as a failure.

## Assumption Reassessment (2026-03-18)

1. Existing focused tests cover visual-config files, provider resolution, disposal queue behavior, and specific renderer behaviors, but they do not currently enforce a zero-console-error policy for a production FITL browser mount — confirmed in current runner tests.
2. The observed crash happens during actual browser rendering, not just pure data validation, so at least one browser-level regression harness is required.
3. FITL is the right primary stress target because it exercises the densest currently-supported board, labels, token stacks, overlays, and action metadata.
4. The most meaningful post-scene stress sequence must include token lane/layout churn and AI action-announcement churn once those surfaces move onto canonical scene nodes; otherwise the harness leaves the riskiest remaining presentation paths under-exercised.

## Architecture Check

1. A browser-level stress regression is cleaner than repeatedly fixing crashes after manual reports. It turns runner stability into an enforceable contract.
2. The test remains generic in architecture even if FITL is the first heavy-weight fixture. The harness should be reusable for other games later.
3. No backwards-compatibility behavior belongs here; the harness should fail on any reintroduction of permissive warning-based behavior.

## What to Change

### 1. Add a production browser stress harness

Create a runner-level integration harness that mounts the production runner with FITL and drives a deterministic sequence such as:

- initial load at `localhost:5173`
- repeated viewport/layout updates
- repeated store-driven rerenders
- repeated token lane/grouping changes and stack-badge churn
- repeated AI action-announcement churn
- animation enabled and disabled
- mount/unmount or hot-reload-like lifecycle churn if feasible in the harness

The harness must capture browser console output and fail on:

- `console.error`
- uncaught exceptions
- rejected promises
- known destroy fallback warnings after the lifecycle redesign lands

### 2. Make FITL logs actionable

If a run fails, persist a concise artifact with:

- exact browser error text
- failing URL and timestamp
- enough surrounding context to reproduce locally

### 3. Keep the harness reusable

Structure the harness so Texas Hold'em or later large games can be added without rewriting the framework.

## Files to Touch

- `packages/runner/test/e2e/*` or equivalent browser integration area (new/modify)
- `scripts/` or runner-local browser test utilities only if required (new/modify)
- optional `logs/` artifact helper or CI upload wiring if required (new/modify)

## Out of Scope

- changing runner implementation behavior directly
- FITL-only rendering hacks
- visual polish decisions

## Acceptance Criteria

### Tests That Must Pass

1. The FITL browser stress harness fails on any console error, uncaught exception, or unexpected lifecycle warning.
2. A passing run proves FITL can load and churn through the chosen stress sequence without reproducing the `TexturePoolClass.returnTexture` crash class.
3. Existing suite: `pnpm -F @ludoforge/runner test`
4. Existing suite: `pnpm -F @ludoforge/runner typecheck`

### Invariants

1. Browser-level runner regressions become machine-detected, not manual-only.
2. FITL remains test data; no FITL-specific runtime branches are introduced.
3. Failure artifacts are concise and reproducible.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/e2e/fitl-canvas-stress.test.*` — browser-level FITL stress run with zero-console-error policy
2. shared browser harness utilities for console capture and artifact emission

### Commands

1. `pnpm -F @ludoforge/runner test -- fitl-canvas-stress`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner typecheck`
