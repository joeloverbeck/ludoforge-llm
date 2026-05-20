# 185GRANTFLOWPI-005: Phase 3 — WASM preview-drive parity or forced TS fallback for grant-flow

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/agents/policy-wasm-preview-drive.ts` (+ ABI/status set or fallback path)
**Deps**: `archive/tickets/185GRANTFLOWPI-004.md`

## Problem

The WASM preview drive emits outcomes `completed | stochastic | depthCap | failed` and statuses `ready | stochastic | hidden | unresolved | failed | depthCap | gated` (`policy-wasm-preview-drive.ts:26`) — it has **no** `postGrantCap`, `freeOperationCap`, or `grantFlowPartial`. If a candidate batch requires grant-flow continuation and is scored via WASM, the WASM path could report `ready` where the TS oracle reports a non-`ready` grant-flow status — re-introducing the exact Foundation #20 lie the TS work removed. This ticket brings the WASM path to parity, or forces TS fallback for candidates needing grant-flow continuation, with parity tests.

## Assumption Reassessment (2026-05-20)

1. WASM drive outcomes/statuses are narrower than the TS preview outcome space (verified `policy-wasm-preview-drive.ts:26`); `postGrantCap`/`freeOperationCap`/`grantFlowPartial` are absent.
2. Spec 184 (`archive/specs/184-wasm-preview-drive-aggregate-coverage.md`) established TS as the oracle for preview parity — this ticket follows that stance.
3. Tickets 003/004 define the grant-flow statuses, exit reasons, and trace the WASM path must either mirror or defer on.

## Architecture Check

1. TS-as-oracle with forced fallback (rather than partial WASM emulation) is the safest Foundation #20-preserving option when the ABI cannot represent the new statuses; correctness is not traded for WASM speed.
2. No game-specific logic in the WASM bridge (Foundation #1).
3. Parity tests prove the invariant rather than asserting it (Foundation #16).

## What to Change

### 1. Add statuses or force fallback (§6.3)

Either extend the WASM drive ABI/status set to represent `postGrantCap`, `freeOperationCap`, and `grantFlowPartial`, OR force unsupported-fallback to TS when grant-flow continuation is required for a candidate batch. Choose based on ABI feasibility; document the choice in the ticket Outcome.

### 2. Parity guarantee

No WASM row may report `ready` where TS reports a non-`ready` grant-flow status. Where WASM supports the path, TS and WASM agree on status.

## Files to Touch

- `packages/engine/src/agents/policy-wasm-preview-drive.ts` (modify — statuses or fallback)
- `packages/engine/test/unit/agents/policy-wasm-preview-grant-flow-parity.test.ts` (new)

## Out of Scope

- TS-side continuation, taxonomy, and trace (tickets 003/004).
- The FITL witnesses (ticket 006).
- Performance optimization / WASM acceleration of the new continuation path (Spec 185 §8 defers this).

## Acceptance Criteria

### Tests That Must Pass

1. WASM forces unsupported fallback when grant-flow continuation requires unsupported statuses; where WASM supports the path, TS and WASM agree on status.
2. No WASM row reports `ready` when TS reports a non-`ready` grant-flow status.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. WASM never reports `ready` where TS reports partial/capped (Foundation #20).
2. TS remains the oracle; WASM matches or defers (Spec 184 stance).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-wasm-preview-grant-flow-parity.test.ts` — unsupported fallback when required; TS/WASM agreement where supported; no `ready`-where-partial divergence. `// @test-class: architectural-invariant`.

### Commands

1. `pnpm turbo build && node --test packages/engine/dist/test/unit/agents/policy-wasm-preview-grant-flow-parity.test.js`
2. `pnpm turbo lint && pnpm turbo typecheck && pnpm -F @ludoforge/engine test:all`
