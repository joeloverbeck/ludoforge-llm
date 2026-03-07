# LEGACTTOO-027: Runtime Token-Binding Ownership Policy

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel architecture guard tests for runtime token-binding resolver ownership
**Deps**: archive/tickets/LEGACTTOO/LEGACTTOO-019-token-binding-contract-hardening-and-ref-parity.md, archive/tickets/LEGACTTOO/LEGACTTOO-022-kernel-token-shape-contract-ownership-policy.md

## Problem

Runtime token binding resolution is now centralized in `token-binding.ts`, but there is no policy guard preventing future reintroduction of ad-hoc token-binding resolution logic (`typeof value === 'string'`, `isRuntimeToken(value)`, custom resolver helpers) across kernel runtime surfaces.

Without ownership enforcement, contract drift can reappear between query/reference/effect boundaries.

## Assumption Reassessment (2026-03-07)

1. Shared resolver exists: `resolveRuntimeTokenBindingValue` in `packages/engine/src/kernel/token-binding.ts`. **Confirmed.**
2. Runtime callsites currently consuming this shared resolver are `resolve-ref.ts`, `effects-token.ts`, and `effects-control.ts`. **Confirmed in source imports/usages.**
3. `isRuntimeToken` usage is currently centralized in `token-binding.ts`; no other kernel module imports it. **Confirmed.**
4. No dedicated lint/policy test currently enforces token-binding resolver ownership in `token-binding.ts`. **Confirmed via `packages/engine/test/unit/lint/` inventory.**

## Architecture Check

1. Enforcing ownership of token-binding resolution is cleaner and more robust than allowing local ad-hoc resolvers because boundary semantics stay unified.
2. This is fully game-agnostic runtime governance; no GameSpecDoc or visual-config game behavior enters kernel logic.
3. No compatibility aliases/shims: duplicate resolver patterns outside owner module become disallowed.

## What to Change

### 1. Add token-binding ownership policy test

- Add lint/policy unit test that enforces `resolveRuntimeTokenBindingValue` ownership in `token-binding.ts` and disallows non-canonical declarations/re-exports/aliased imports of that symbol.
- Add policy checks that disallow `isRuntimeToken` imports/usages outside `token-binding.ts` so token-shape recognition remains routed through the shared token-binding resolver.

### 2. Add explicit allowlist with rationale (if needed)

- If specific files require legitimate exceptions, keep a narrow allowlist with explicit rationale.
- Avoid broad file-level exclusions and avoid heuristic string-pattern blocking that would create false positives for unrelated scalar checks.

## Files to Touch

- `packages/engine/test/unit/lint/` (add new policy test)
- `packages/engine/src/kernel/token-binding.ts` (modify only if contract docs/exports need tightening)
- `packages/engine/test/unit/kernel/` (optional parity test updates only if required)

## Out of Scope

- Runtime behavior changes to token lookup semantics
- Query/effect feature work unrelated to ownership policy
- Game data or visual-config changes
- Broad regex policing of all `typeof ... === 'string'` checks across kernel modules

## Acceptance Criteria

### Tests That Must Pass

1. Policy test fails when ad-hoc token-binding resolver logic is introduced outside `token-binding.ts`.
2. Policy test fails when `isRuntimeToken` is imported/used outside `token-binding.ts`.
3. Existing token boundary behavior remains unchanged for resolve-ref/effects/query paths.
4. Existing suite: `pnpm -F @ludoforge/engine test:unit`

### Invariants

1. Runtime token-binding resolution has one owned implementation surface.
2. Runtime token-shape recognition for token-binding resolution remains centralized in `token-binding.ts`.
3. Kernel runtime remains game-agnostic and free of game-specific token semantics.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/lint/runtime-token-binding-ownership-policy.test.ts` — enforce canonical ownership for `resolveRuntimeTokenBindingValue` and forbid non-owner `isRuntimeToken` imports/calls.
2. `packages/engine/test/unit/kernel/resolve-ref-token-bindings.test.ts` (optional) — parity guard if policy changes require additional runtime lock-in.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/lint/runtime-token-binding-ownership-policy.test.js`
3. `pnpm -F @ludoforge/engine test:unit`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-03-07
- What changed:
  - Added `packages/engine/test/unit/lint/runtime-token-binding-ownership-policy.test.ts`.
  - Enforced canonical ownership of `resolveRuntimeTokenBindingValue` in `src/kernel/token-binding.ts` (no non-canonical local definitions, exports/re-exports, or aliased imports).
  - Added policy enforcement that `isRuntimeToken` import/call boundaries stay out of non-owner kernel modules and route through token-binding ownership.
  - Reassessed and corrected ticket assumptions/scope to include the actual current runtime callsites (`resolve-ref.ts`, `effects-token.ts`, `effects-control.ts`).
- Deviations from original plan:
  - Narrowed policy enforcement to ownership/invocation boundaries rather than broad `typeof ... === 'string'` heuristics to avoid false-positive architecture lint drift.
  - No runtime kernel code changes were needed; policy/test hardening only.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/lint/runtime-token-binding-ownership-policy.test.js` passed.
  - `pnpm -F @ludoforge/engine test:unit` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
