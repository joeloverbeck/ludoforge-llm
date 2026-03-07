# LEGACTTOO-022: Kernel Token-Shape Contract Ownership Policy

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel architecture guard tests for token-shape contract ownership
**Deps**: archive/tickets/LEGACTTOO/LEGACTTOO-019-token-binding-contract-hardening-and-ref-parity.md, archive/tickets/LEGACTTOO/LEGACTTOO-021-tokenzones-strict-runtime-token-shape-boundary-parity.md

## Problem

Token runtime-shape logic is now centralized in `token-shape.ts`, but there is no policy guard preventing future reintroduction of ad-hoc token-shape checks (`'id' in value`, `'props' in value`) across kernel files. Without ownership enforcement, architectural drift can silently re-fragment token contract behavior.

## Assumption Reassessment (2026-03-07)

1. Shared token-shape helpers exist in `packages/engine/src/kernel/token-shape.ts` and are already consumed at token-boundary callsites (`token-binding.ts`, `eval-query.ts`). **Confirmed in source imports.**
2. There is currently no dedicated lint/policy unit test enforcing token-shape guard ownership in `token-shape.ts`. **Confirmed via `packages/engine/test/unit/lint/` inventory.**
3. Existing policy tests already enforce similar ownership patterns (cache keys, import boundaries), so adding a token-shape ownership policy matches established architecture-hardening practice. **Confirmed in `packages/engine/test/unit/lint/` files.**
4. There are intentional generic `'id' in value` checks in non-token domains (`binding-template.ts`, `move-param-normalization.ts`) that should not be treated as token-runtime-shape violations. **Confirmed in current kernel source.**

## Architecture Check

1. Explicit ownership guards reduce contract drift and keep token runtime semantics coherent as codebase size grows.
2. This is purely engine-agnostic policy enforcement and does not encode any game-specific behavior.
3. No compatibility aliasing: direct ad-hoc token-runtime shape guards (`id` + `type` + `props`) outside ownership module become disallowed.
4. Scope is intentionally narrow: forbid token-runtime-shape duplication while allowing unrelated generic ID checks where token semantics are not implied.

## What to Change

### 1. Add source-level ownership policy test for token-shape guards

- Add a lint/policy unit test that scans kernel source and fails if ad-hoc token-runtime-shape guard patterns (`'id' in`, `'type' in`, `'props' in` in the same guard path) appear outside `token-shape.ts`.
- Allow known, intentional non-token ID checks in unrelated modules only when they are explicitly documented in an allowlist with rationale.

### 2. Document and lock intended helper split

- Validate strict token boundary checks use `isRuntimeToken` or `hasTokenRuntimeShapeKeys` from `token-shape.ts`.
- Validate permissive shape-key checks remain limited to explicit query/runtime classification pathways that do not reimplement ownership guards.

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
2. Existing token runtime behavior remains unchanged (no regressions in `eval-query`, token binding, and effects lifecycle suites).
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`

### Invariants

1. Token runtime-shape contracts have a single owned implementation surface.
2. Kernel runtime remains game-agnostic and free of game-specific token semantics.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/lint/token-shape-contract-ownership-policy.test.ts` — enforces centralized token-shape guard ownership with explicit non-token allowlist.
2. `packages/engine/test/unit/kernel/resolve-ref-token-bindings.test.ts` (optional) — guard against accidental boundary relaxations if needed.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/lint/token-shape-contract-ownership-policy.test.js`
3. `pnpm -F @ludoforge/engine test:unit`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-03-07
- Outcome amended: 2026-03-07
- What changed:
  - Added `packages/engine/test/unit/lint/token-shape-contract-ownership-policy.test.ts`.
  - Enforced ownership for token runtime tuple guards (`id` + `type` + `props`) so they remain centralized in `src/kernel/token-shape.ts`.
  - Added explicit non-token `id`-guard allowlist with rationale for generic kernel callsites.
  - Replaced `effects-control.ts` ad-hoc `isTokenLike` (`'id' in value`) validation with canonical `resolveRuntimeTokenBindingValue` ownership to remove duplicated token-shape semantics.
  - Added `removeByPriority` runtime test coverage rejecting id-only object items from `binding` query inputs.
- Deviations from original plan:
  - Added a runtime hardening refinement after archival to remove an ad-hoc control-flow token-like boundary check and route it through canonical token-binding ownership.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/lint/token-shape-contract-ownership-policy.test.js` passed.
  - `node --test packages/engine/dist/test/unit/effects-control-flow.test.js` passed.
  - `pnpm -F @ludoforge/engine test:unit` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
