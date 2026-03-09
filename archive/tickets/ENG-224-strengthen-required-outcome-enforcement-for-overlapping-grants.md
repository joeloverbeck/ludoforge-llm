# ENG-224: Strengthen Required Outcome Enforcement for Overlapping Grants

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — required outcome-policy enforcement and grant-selection semantics for overlapping free-operation authorizations
**Deps**: archive/tickets/ENG-203-mandatory-grant-and-action-outcome-contracts.md, packages/engine/src/kernel/apply-move.ts, packages/engine/src/kernel/free-operation-grant-authorization.ts

## Problem

ENG-203 added `outcomePolicy: mustChangeGameplayState`, but the current post-execution grant-selection path still inspects only the first matching pending grant for a free operation. When multiple pending grants authorize the same move, a weaker grant can be selected first and allow a no-op move to bypass a stricter overlapping grant that should have rejected it.

## Assumption Reassessment (2026-03-09)

1. Current legality/discovery already treats required grants existentially: if any required ready grant for the active seat authorizes the move, the move can remain legal during the obligation window.
2. Current post-execution outcome validation in `apply-move.ts` looks up exactly one authorized pending grant via `findAuthorizedPendingFreeOperationGrant(...)` and uses that single grant as the policy source.
3. Current grant consumption in `turn-flow-eligibility.ts` reuses the same first-match helper and therefore consumes whichever authorized grant happens to be found first.
4. Current regression coverage only proves single-grant required-outcome behavior. There is no unit or integration test that exercises overlapping authorized grants with mixed policy strength or reordered pending-grant arrays.
5. Mismatch: ENG-203 acceptance semantics are obligation-based, not first-match-array-order based. If any overlapping required grant for the submitted move requires a non-no-op outcome, the move must satisfy that requirement before canonical grant consumption occurs. Correction: introduce shared overlap-aware grant selection semantics and reuse them for validation plus consumption.

## Architecture Check

1. The fix should stay on the shared grant-authorization/runtime path so event-side grants and effect-issued grants keep identical semantics.
2. The clean architecture is not “check every grant everywhere”; it is to centralize overlap-aware grant resolution in one shared helper and make `apply-move.ts` plus `turn-flow-eligibility.ts` consume that same result.
3. Deterministic overlapping-grant resolution is cleaner than adding card-specific ordering exceptions or data-level workarounds.
4. No backwards-compatibility aliases should be introduced; the runtime should make one canonical decision about which matching grants constrain and which single grant a successful move consumes.

## What to Change

### 1. Add canonical overlap-aware grant resolution

Extend the shared free-operation grant authorization module so callers can resolve the full authorized overlap set and one canonical grant-consumption target for the active seat/move pair.

### 2. Enforce outcome policy from the overlap set

Replace first-match outcome validation with deterministic handling over the full set of authorized matching grants for the active seat. If any matching grant imposes `mustChangeGameplayState`, reject a no-op result before any grant is consumed.

### 3. Consume the canonical matching grant

Implement deterministic overlapping-grant consumption for successful moves. Consumption should still remove only one grant use per successful free operation, but it must not silently prioritize a weaker grant in a way that undermines stricter completion/outcome semantics.

### 4. Expand regression coverage for overlapping grants

Add tests where two or more pending grants authorize the same move, including mixed-strength policies and reordered pending-grant arrays, to prove behavior is independent of incidental insertion order.

## Files to Touch

- `packages/engine/src/kernel/free-operation-grant-authorization.ts` (modify)
- `packages/engine/src/kernel/apply-move.ts` (modify)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/test/unit/kernel/apply-move.test.ts` (modify)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify)

## Out of Scope

- Broader redefinition of `mustChangeGameplayState` beyond ENG-203’s canonical contract.
- New declarative metrics DSL or per-game outcome hooks.

## Acceptance Criteria

### Tests That Must Pass

1. A free operation that matches any pending required-outcome grant is rejected when it resolves as an action-level no-op, even if another overlapping grant would otherwise authorize the move.
2. Successful overlapping-grant resolution consumes one canonical matching grant with deterministic policy-aware semantics that do not depend on incidental grant array order.
3. Existing suite: `node --test packages/engine/dist/test/unit/kernel/apply-move.test.js`
4. Existing suite: `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
5. Existing suite: `pnpm -F @ludoforge/engine lint`

### Invariants

1. Required outcome semantics are enforced consistently across all matching shared grant contracts, regardless of whether the grant came from an event or runtime effect.
2. Overlapping authorization resolution is deterministic across seeds and independent of pending-grant insertion order unless some explicit grant contract field distinguishes the candidates.
3. One successful free operation still consumes only one grant use; overlapping authorization must not collapse multiple grant uses into one resolution.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/apply-move.test.ts` — verify mixed-strength overlapping grants reject no-op free operations and consume the canonical grant deterministically on success.
2. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — verify end-to-end overlapping grant semantics from declarative fixtures, including reordered pending grants.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/apply-move.test.js`
3. `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-03-09
- Outcome amended: 2026-03-09
- What actually changed:
  - Added shared overlap-aware grant resolution in `free-operation-grant-authorization.ts` so the runtime resolves all authorized matching grants, selects one canonical grant for consumption, and separately identifies the strongest outcome-constraining grant.
  - Updated `apply-move.ts` to enforce `mustChangeGameplayState` against the full authorized overlap set instead of a first-match grant lookup.
  - Updated `turn-flow-eligibility.ts` to consume the canonical stronger overlapping grant on success, preventing weaker grants from masking stricter completion/outcome semantics.
  - Added unit and integration regression coverage for overlapping grants, including pending-grant reordering.
  - Refined the shared resolver to reject genuinely ambiguous top-ranked overlapping grants as runtime contract violations while still allowing contract-equivalent duplicate overlaps to resolve successfully.
  - Added declarative `GameDef` validation for ambiguous event-card free-operation grants so statically indistinguishable top-ranked overlaps are rejected before play starts, including side+branch issuance scopes.
  - Tightened the synthetic deferred-effect timing fixture so it encodes explicit grant ordering rather than relying on incidental same-seat overlap.
- Deviations from original plan:
  - The fix stayed narrowly scoped to shared runtime grant selection and did not broaden into a generic “constraint scoring” system beyond the existing completion/outcome/post-resolution contract fields.
  - Integration coverage was added with synthetic overlapping event grants rather than production FITL data changes, which kept the engine fix generic and ticket-focused.
  - The stricter runtime contract surfaced one existing synthetic integration fixture that depended on ambiguous overlap. That fixture was corrected rather than weakening the engine behavior.
  - Declarative ambiguous-overlap coverage moved one former runtime-only integration case to the `GameDef` validation boundary because the base fixture should remain valid until a specific test introduces invalid overlap data.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/kernel/apply-move.test.js` passed.
  - `node --test packages/engine/dist/test/unit/validate-gamedef.test.js` passed.
  - `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js` passed.
  - `node --test packages/engine/dist/test/integration/event-effect-timing.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
  - `pnpm run check:ticket-deps` passed.
