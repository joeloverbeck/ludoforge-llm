# ENG-213: Codify Free-Op Probe Semantics Boundary

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel architecture boundary and probe contract hardening
**Deps**: archive/tickets/ENG/ENG-210-extract-free-op-viability-probe-boundary.md, archive/tickets/ENG/ENG-212-fix-sequence-probe-usability-false-negatives.md, packages/engine/src/kernel/free-operation-viability.ts, packages/engine/src/kernel/free-operation-discovery-analysis.ts, packages/engine/src/kernel/free-operation-grant-authorization.ts, packages/engine/test/unit/kernel/free-operation-discovery-export-surface-guard.test.ts, packages/engine/test/unit/kernel/free-operation-viability-export-surface-guard.test.ts

## Problem

Free-operation viability probing has been extracted into a dedicated module, but it still directly imports execution authorization helpers. The boundary between "probe-time usability estimation" and "execution-time grant authorization/sequence lock" is therefore only partially explicit, which preserves avoidable refactor risk.

## Assumption Reassessment (2026-03-09)

1. ENG-210 and ENG-212 are already complete: viability ownership is extracted into `free-operation-viability.ts` and sequence probe semantics were corrected.
2. Existing guard tests already cover discovery and viability export surfaces and some import boundaries, so this ticket's placeholder test names are stale.
3. Remaining mismatch: `free-operation-viability.ts` still imports `doesGrantAuthorizeMove` / `isPendingFreeOperationGrantSequenceReady` from `free-operation-grant-authorization.ts` instead of relying on a dedicated probe contract.
4. Correction: use the probe/discovery contract (`free-operation-discovery-analysis.ts`) as the canonical probe semantic boundary and enforce it with a direct-source guard.

## Architecture Check

1. Routing probe viability through the discovery/probe contract is cleaner and more extensible than direct coupling to execution authorization helpers.
2. This remains game-agnostic kernel design; no game-specific data/visual config leakage into runtime architecture.
3. No backward-compatibility aliases/shims: one canonical probe contract for viability checks.

## What to Change

### 1. Rewire viability probing to canonical probe contract

Update `free-operation-viability.ts` to evaluate probe viability through `free-operation-discovery-analysis.ts` APIs (`isFreeOperationApplicableForMove` + `isFreeOperationGrantedForMove`) instead of importing execution-only authorization helpers.

### 2. Enforce semantic boundary with architecture guard

Add source-level guard coverage that fails if `free-operation-viability.ts` directly imports from `free-operation-grant-authorization.ts`.

## Files to Touch

- `packages/engine/src/kernel/free-operation-viability.ts` (modify)
- `packages/engine/test/unit/kernel/free-operation-probe-boundary-guard.test.ts` (new)

## Out of Scope

- FITL card data rewrites.
- Visual presentation changes in any `visual-config.yaml`.

## Acceptance Criteria

### Tests That Must Pass

1. Probe viability evaluation runs through probe/discovery contract APIs rather than direct execution helper imports.
2. Boundary guard tests fail if `free-operation-viability.ts` imports `free-operation-grant-authorization.ts`.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Free-operation probe and execution contracts remain deterministic and game-agnostic.
2. Kernel boundary ownership is explicit, acyclic, and test-enforced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/free-operation-probe-boundary-guard.test.ts` — enforce probe-vs-execution import layering (`free-operation-viability.ts` must not import `free-operation-grant-authorization.ts`).
2. `packages/engine/test/unit/kernel/free-operation-viability-contract-parity.test.ts` — retain contract parity coverage for policy vocabulary and defaults.
3. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — ensure behavioral parity under the rewired probe contract.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- Rewired `free-operation-viability.ts` to remove direct imports from `free-operation-grant-authorization.ts` and use the probe/discovery contract (`isFreeOperationApplicableForMove`, `isFreeOperationGrantedForMove`) for probe-time viability decisions.
- Added `free-operation-probe-boundary-guard.test.ts` to enforce that viability probing remains decoupled from execution-only authorization helpers.
- Kept scope intentionally narrow versus original draft: no new probe module was introduced because the existing discovery-analysis contract already provides the canonical game-agnostic probe surface with stronger DRY alignment.
