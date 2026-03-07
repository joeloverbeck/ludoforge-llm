# LEGACTTOO-022: Kernel Token-Shape Contract Ownership Policy

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel architecture guard tests for token-shape contract ownership
**Deps**: archive/tickets/LEGACTTOO/LEGACTTOO-019-token-binding-contract-hardening-and-ref-parity.md, tickets/LEGACTTOO-021-tokenzones-strict-runtime-token-shape-boundary-parity.md

## Problem

Token runtime-shape logic is now centralized in `token-shape.ts`, but there is no policy guard preventing future reintroduction of ad-hoc token-shape checks (`'id' in value`, `'props' in value`) across kernel files. Without ownership enforcement, architectural drift can silently re-fragment token contract behavior.

## Assumption Reassessment (2026-03-07)

1. Shared token-shape helpers now exist and are used by key runtime surfaces (`resolve-ref`, `effects-token`, `eval-query`). **Confirmed in `packages/engine/src/kernel/token-shape.ts` and current kernel imports.**
2. There is currently no dedicated lint/policy unit test enforcing token-shape guard ownership in `token-shape.ts`. **Confirmed via `packages/engine/test/unit/lint/` inventory.**
3. Existing policy tests already enforce similar ownership patterns (cache keys, import boundaries), so adding a token-shape ownership policy matches established architecture-hardening practice. **Confirmed in `packages/engine/test/unit/lint/` files.**

## Architecture Check

1. Explicit ownership guards reduce contract drift and keep token runtime semantics coherent as codebase size grows.
2. This is purely engine-agnostic policy enforcement and does not encode any game-specific behavior.
3. No compatibility aliasing: direct ad-hoc token-shape guards outside ownership module become disallowed.

## What to Change

### 1. Add source-level ownership policy test for token-shape guards

- Add a lint/policy unit test that scans kernel source and fails if ad-hoc token-shape guard patterns appear outside `token-shape.ts`.
- Allow known, intentional non-token id checks in unrelated modules only if they are explicitly non-token and documented in the test allowlist with rationale.

### 2. Document and lock intended helper split

- Validate that strict boundary checks use `isRuntimeToken`.
- Validate that permissive shape-key checks (if needed) remain limited to explicit query-shape classification pathways.

## Files to Touch

- `packages/engine/test/unit/lint/` (add new policy test)
- `packages/engine/src/kernel/token-shape.ts` (modify only if contract comments or exports need tightening)
- `packages/engine/test/unit/kernel/` (optional targeted tests if policy requires runtime assertions)

## Out of Scope

- Refactoring unrelated existing object-shape guards in non-token domains
- Query/effect semantic changes beyond token-shape ownership enforcement
- Game content changes

## Acceptance Criteria

### Tests That Must Pass

1. New policy test fails when ad-hoc token-shape guard patterns are introduced outside token-shape ownership module.
2. Existing token runtime behavior remains unchanged (no regressions in `resolve-ref`, `eval-query`, effects lifecycle suites).
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`

### Invariants

1. Token runtime-shape contracts have a single owned implementation surface.
2. Kernel runtime remains game-agnostic and free of game-specific token semantics.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/lint/<new-token-shape-ownership-policy>.test.ts` — enforces centralized token-shape guard ownership.
2. `packages/engine/test/unit/kernel/resolve-ref-token-bindings.test.ts` (optional) — guard against accidental boundary relaxations if needed.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/lint/<new-token-shape-ownership-policy>.test.js`
3. `pnpm -F @ludoforge/engine test:unit`
4. `pnpm -F @ludoforge/engine lint`
