# 98PREPIPRNGTOL-004: Thread `tolerateRngDivergence` from profile to preview runtime

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — agent policy-runtime wiring
**Deps**: 98PREPIPRNGTOL-001, 98PREPIPRNGTOL-003

## Problem

The `createPolicyPreviewRuntime` input now accepts `tolerateRngDivergence`, but the call site in `policy-runtime.ts` doesn't pass it. The profile's `preview?.tolerateRngDivergence` must be threaded from the catalog/profile resolution through `createPolicyRuntimeProviders` into `createPolicyPreviewRuntime`.

## Assumption Reassessment (2026-03-31)

1. `policy-runtime.ts:97-107` — `createPolicyRuntimeProviders` calls `createPolicyPreviewRuntime` with `def`, `state`, `playerId`, `seatId`, `trustedMoveIndex`, `runtime`. The profile is available via `input.catalog.profiles`.
2. `CreatePolicyRuntimeProvidersInput` (line ~80-95) has `catalog: AgentPolicyCatalog` — the resolved profile is accessible from the catalog.
3. The caller of `createPolicyRuntimeProviders` must identify which profile to use — need to check if the active seat's profile ID is already resolved at this call site.

## Architecture Check

1. **Single wiring change**: One additional field in the `createPolicyPreviewRuntime` call. No new abstractions needed.
2. **Agnostic**: Threading a generic boolean from a profile config. No game-specific logic.
3. **No shims**: The field is optional with `?? false` — absent profiles behave identically to current.

## What to Change

### 1. Resolve the active profile in `createPolicyRuntimeProviders`

The function already has access to `input.catalog` and `input.seatId`. Resolve the active profile:

```typescript
const activeProfile = input.catalog.profiles[input.catalog.bindingsBySeat[input.seatId]];
```

(Verify exact lookup path at implementation time — may already be resolved by the caller.)

### 2. Pass `tolerateRngDivergence` to `createPolicyPreviewRuntime`

```typescript
const previewRuntime = createPolicyPreviewRuntime({
  def: input.def,
  state: input.state,
  playerId: input.playerId,
  seatId: input.seatId,
  trustedMoveIndex: input.trustedMoveIndex,
  tolerateRngDivergence: activeProfile?.preview?.tolerateRngDivergence ?? false,
  ...(input.runtime === undefined ? {} : { runtime: input.runtime }),
});
```

### 3. If profile is not resolvable at `policy-runtime.ts`

Add `tolerateRngDivergence?: boolean` to `CreatePolicyRuntimeProvidersInput` and have the caller pass it. Check the call chain (likely `policy-agent.ts` or `policy-evaluation-core.ts`) to find where the profile is resolved.

## Files to Touch

- `packages/engine/src/agents/policy-runtime.ts` (modify)
- `packages/engine/src/agents/policy-agent.ts` (modify — if profile resolution happens here)
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify — if profile resolution happens here)

## Out of Scope

- Type/schema/contract definitions (done in 98PREPIPRNGTOL-001)
- Compiler/validator changes (done in 98PREPIPRNGTOL-002)
- Preview runtime logic (done in 98PREPIPRNGTOL-003)
- FITL or Texas Hold'em profile YAML changes
- Any kernel effect execution or move enumeration changes

## Acceptance Criteria

### Tests That Must Pass

1. When a profile has `preview: { tolerateRngDivergence: true }`, the preview runtime receives `tolerateRngDivergence === true`
2. When a profile lacks `preview`, the preview runtime receives `tolerateRngDivergence === false`
3. `pnpm turbo typecheck` passes
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Profiles without `preview` config must produce identical runtime behavior — zero regression
2. The flag flows through the standard profile → runtime → preview pipeline; no side channels
3. No game-specific branching anywhere in the wiring

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-runtime.test.ts` (or equivalent) — verify that `createPolicyRuntimeProviders` threads `tolerateRngDivergence` from the catalog profile to the preview runtime. If no direct unit test is feasible, integration coverage in 98PREPIPRNGTOL-005 suffices.

### Commands

1. `pnpm turbo typecheck`
2. `pnpm -F @ludoforge/engine test`
