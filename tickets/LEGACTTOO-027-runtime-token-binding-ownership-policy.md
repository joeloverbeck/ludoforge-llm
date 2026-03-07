# LEGACTTOO-027: Runtime Token-Binding Ownership Policy

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel architecture guard tests for runtime token-binding resolver ownership
**Deps**: archive/tickets/LEGACTTOO/LEGACTTOO-019-token-binding-contract-hardening-and-ref-parity.md, archive/tickets/LEGACTTOO/LEGACTTOO-022-kernel-token-shape-contract-ownership-policy.md

## Problem

Runtime token binding resolution is now centralized in `token-binding.ts`, but there is no policy guard preventing future reintroduction of ad-hoc token-binding resolution logic (`typeof value === 'string'`, `isRuntimeToken(value)`, custom resolver helpers) across kernel runtime surfaces.

Without ownership enforcement, contract drift can reappear between query/reference/effect boundaries.

## Assumption Reassessment (2026-03-07)

1. Shared resolver exists: `resolveRuntimeTokenBindingValue` in `packages/engine/src/kernel/token-binding.ts`. **Confirmed.**
2. `resolve-ref.ts` and `effects-token.ts` now consume this shared resolver. **Confirmed.**
3. No dedicated lint/policy test currently enforces token-binding resolver ownership in `token-binding.ts`. **Confirmed via `packages/engine/test/unit/lint/` inventory.**

## Architecture Check

1. Enforcing ownership of token-binding resolution is cleaner and more robust than allowing local ad-hoc resolvers because boundary semantics stay unified.
2. This is fully game-agnostic runtime governance; no GameSpecDoc or visual-config game behavior enters kernel logic.
3. No compatibility aliases/shims: duplicate resolver patterns outside owner module become disallowed.

## What to Change

### 1. Add token-binding ownership policy test

- Add lint/policy unit test that scans kernel source and fails if token-binding resolution patterns are implemented outside `token-binding.ts`.
- Flag local helper functions that duplicate resolver behavior in runtime surfaces.

### 2. Add explicit allowlist with rationale (if needed)

- If specific files require legitimate pattern use unrelated to token-binding resolution, keep a narrow allowlist with line-anchored rationale.
- Avoid broad file-level exclusions.

## Files to Touch

- `packages/engine/test/unit/lint/` (add new policy test)
- `packages/engine/src/kernel/token-binding.ts` (modify only if contract docs/exports need tightening)
- `packages/engine/test/unit/kernel/` (optional parity test updates only if required)

## Out of Scope

- Runtime behavior changes to token lookup semantics
- Query/effect feature work unrelated to ownership policy
- Game data or visual-config changes

## Acceptance Criteria

### Tests That Must Pass

1. Policy test fails when ad-hoc token-binding resolver logic is introduced outside `token-binding.ts`.
2. Existing token boundary behavior remains unchanged for resolve-ref/effects/query paths.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`

### Invariants

1. Runtime token-binding resolution has one owned implementation surface.
2. Kernel runtime remains game-agnostic and free of game-specific token semantics.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/lint/<new-token-binding-ownership-policy>.test.ts` — enforce centralized token-binding resolver ownership.
2. `packages/engine/test/unit/kernel/resolve-ref-token-bindings.test.ts` (optional) — parity guard if policy changes require additional runtime lock-in.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/lint/<new-token-binding-ownership-policy>.test.js`
3. `pnpm -F @ludoforge/engine test:unit`
4. `pnpm -F @ludoforge/engine lint`
