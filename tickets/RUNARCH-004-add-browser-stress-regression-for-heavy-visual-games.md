# RUNARCH-004: Add Browser Stress Regression for Heavy Visual Games

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner verification only
**Deps**: tickets/RUNARCH-001-split-runner-semantic-frame-from-presentation-scene.md, tickets/RUNARCH-002-introduce-scene-reconciler-and-canonical-text-runtime.md, tickets/RUNARCH-003-complete-renderer-migration-to-presentation-specs.md, archive/tickets/RUNPRESLIFE/68RUNPRESLIFE-005-fitl-canvas-stress-regression.md

## Problem

The runner shipped architecture work intended to prevent the FITL crash class, but the browser-level failure still escaped because the repo still lacks a production-scale visual stress regression that enforces a zero-console-error contract for heavy games.

That is a missing architecture quality gate. A clean architecture is not complete if the repo cannot automatically prove that its heaviest production visual fixtures survive real browser lifecycle churn.

## Assumption Reassessment (2026-03-19)

1. The archived FITL browser stress ticket was left not implemented, so the crash class still depends on manual discovery rather than a machine-enforced browser regression harness.
2. FITL remains the right first heavy-weight fixture because it exercises dense text, overlays, regions, token layouts, card faces, and lifecycle churn simultaneously.
3. The regression harness should target the new architecture after the reconciler/spec migration lands, not the pre-migration implementation details.
4. Corrected scope: this ticket is not a substitute for architectural cleanup; it is the verification gate that ensures the new architecture actually holds under real browser rendering.

## Architecture Check

1. A browser-level zero-console-error stress gate is cleaner than repeated manual debugging because it converts runner stability into an enforceable contract.
2. Keeping the harness generic preserves the intended architecture: FITL is just a fixture, not a reason to add FITL-specific runtime behavior.
3. No backwards-compatibility path should preserve permissive warnings for known lifecycle issues. The harness should fail on unexpected console errors, uncaught exceptions, rejected promises, and destroy-fallback warnings in steady-state flows.

## What to Change

### 1. Add a reusable browser stress harness for production visual fixtures

Create a runner browser integration harness that can:

- load a production game/visual-config pair
- capture console output, uncaught exceptions, and rejected promises
- drive deterministic interaction/lifecycle churn
- emit concise reproduction artifacts on failure

### 2. Add a FITL-heavy visual regression sequence

Use FITL as the first production fixture and cover at minimum:

- initial load
- viewport movement / layout updates
- repeated store-driven rerenders
- token grouping/lane churn
- overlay/region updates
- action-announcement churn
- animation on/off transitions
- mount/unmount or hot-reload-like lifecycle churn where feasible

### 3. Make the zero-console-error contract part of the runner quality gate

Treat the following as failures:

- `console.error`
- uncaught exceptions
- rejected promises
- unexpected destroy-fallback warnings
- any recurrence of the `TexturePoolClass.returnTexture` crash class

Structure the harness so additional large games can be added later without rewriting the framework.

## Files to Touch

- `packages/runner/test/e2e/*` or equivalent browser integration area (new/modify)
- `packages/runner/test/*` shared browser harness utilities (new/modify as needed)
- `scripts/*` or runner-local test helpers only if required (new/modify)
- `logs/*` artifact helper path only if required (new/modify)

## Out of Scope

- altering runner implementation behavior directly except where observability hooks are required
- FITL-specific rendering hacks
- visual polish changes unrelated to stability

## Acceptance Criteria

### Tests That Must Pass

1. A browser-level heavy-game stress harness fails on any console error, uncaught exception, rejected promise, or unexpected lifecycle warning.
2. A passing FITL run proves the new runner architecture survives deterministic heavy visual churn without reproducing the `TexturePoolClass.returnTexture` crash class.
3. Existing suite: `pnpm -F @ludoforge/runner test`
4. Existing suite: `pnpm -F @ludoforge/runner typecheck`

### Invariants

1. Browser-level runner regressions are machine-detected rather than manual-only.
2. FITL remains test data, not a source of runner branches.
3. Failure artifacts are concise, reproducible, and sufficient to rerun the failing scenario locally.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/e2e/fitl-heavy-visual-stress.test.*` — browser-level FITL stress run with zero-console-error policy.
2. Shared browser harness utilities — console capture, exception capture, lifecycle churn helpers, and failure artifact emission.
3. Add at least one harness extensibility test or second-fixture stub proving the harness is reusable for future heavy games.

### Commands

1. `pnpm -F @ludoforge/runner test -- fitl-heavy-visual-stress`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner typecheck`
4. `pnpm run check:ticket-deps`
