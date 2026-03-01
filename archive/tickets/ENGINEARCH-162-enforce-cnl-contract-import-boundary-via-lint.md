# ENGINEARCH-162: Enforce CNL contract import boundary via lint

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — lint policy (`eslint.config.js`) + boundary guard tests
**Deps**: tickets/ENGINEARCH-161-complete-cross-layer-contract-extraction-from-kernel-namespace.md

## Problem

Even after boundary cleanup, there is no guardrail preventing new `src/cnl -> src/kernel/*contract*` imports. Without a policy check, architectural regressions can be reintroduced silently.

## Assumption Reassessment (2026-03-01)

1. The repository uses a single root ESLint config (`eslint.config.js`).
2. No current lint rule explicitly blocks compiler imports of kernel-owned contract modules.
3. A related active ticket (`ENGINEARCH-164`) tracks contracts public surface/import-policy ergonomics and depends on this lint boundary guard, but this ticket is the one that must introduce the explicit CNL->kernel-contract lint enforcement.
4. Existing boundary tests are source-level policy guards (for example `contracts -> kernel boundary`) and do not currently assert ESLint contains this specific import restriction.

## Architecture Check

1. Architecture boundaries should be enforced by tooling, not only convention.
2. Lint enforcement is game-agnostic and does not alter `GameDef`/simulation semantics.
3. No backwards-compatible alias path is introduced; invalid imports fail lint and must be fixed at source.

## What to Change

### 1. Add boundary lint policy

Add `no-restricted-imports` rules for `src/cnl/**` to block imports from `kernel/*contract*` modules (including nested relative paths, not only `../kernel/...`) and direct contributors to `../contracts/*`.

### 2. Add regression guard coverage for lint policy

Add a focused policy test that asserts boundary restrictions are present in ESLint config to prevent accidental deletion/loosening.

## Files to Touch

- `eslint.config.js` (modify)
- `packages/engine/test/unit/*` boundary-policy test (new/modify)

## Out of Scope

- Moving additional modules (handled in dependency ticket)
- Defining the broader contracts public-surface/barrel policy (handled in `ENGINEARCH-164`)
- Runtime/kernel behavior changes
- Runner and `visual-config.yaml`

## Acceptance Criteria

### Tests That Must Pass

1. Any new `src/cnl` import of `src/kernel/*contract*` fails lint.
2. Current compiler codebase passes lint with approved neutral-boundary imports.
3. Lint boundary also protects nested CNL paths that would otherwise use `../../kernel/*contract*` style imports.
4. Existing suite: `pnpm turbo lint`

### Invariants

1. Contract ownership boundaries are enforceable and testable.
2. Engine/runtime remain game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/*boundary-policy*.test.ts` — assert lint config enforces compiler contract import restrictions.

### Commands

1. `pnpm turbo build`
2. `pnpm turbo lint`
3. `pnpm turbo test && pnpm turbo typecheck`

## Outcome

Implemented vs planned:

1. Added a CNL-scoped `no-restricted-imports` lint rule in root `eslint.config.js` that blocks `**/kernel/*contract*.js|ts` imports and directs usage toward shared contracts modules.
2. Added a focused unit policy guard test at `packages/engine/test/unit/lint/cnl-contract-import-boundary-lint-policy.test.ts` that asserts the lint boundary exists in config.
3. Validated full workspace quality gates (`build`, `lint`, `test`, `typecheck`) all passing.

Scope clarifications applied before implementation:

1. Updated assumptions to reflect active dependency with `ENGINEARCH-164`.
2. Tightened boundary scope to include nested relative CNL import paths (not only `../kernel/...`).
