# 179ACTSELPRE-003: Phase 1b — Driver change in `driveSyntheticCompletion` (post-grant continuation)

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/agents/policy-preview.ts` (the bounded driver and its exit conditions).
**Deps**: `archive/tickets/179ACTSELPRE-002.md`

## Problem

Spec 179's mechanical fix is at `packages/engine/src/agents/policy-preview.ts:986-993`: the `driveSyntheticCompletion` loop currently exits unconditionally on `ctxKind === 'outcomeGrantResolve'`, before opponent-effect frames (FITL Assault piece removal, etc.) land in state. This ticket replaces that unconditional exit with a check against the profile's new `outcomeGrantContinuation` setting (added by ticket 002), tracks post-grant depth separately from the pre-grant `completionDepthCap`, and emits a new exit kind (`postGrantCap`) when the extra-depth budget is reached.

## Assumption Reassessment (2026-05-17)

1. `driveSyntheticCompletion` lives at `packages/engine/src/agents/policy-preview.ts:864-1074` — verified during brainstorm verification.
2. The exit condition at lines 986-993 is:
   ```ts
   if (
     ctxKind === 'actionSelection'
     || ctxKind === 'outcomeGrantResolve'
     || ctxKind === 'turnRetirement'
     || topSeatId !== origin.seatId
     || top.turnId !== origin.turnId
   ) {
     return finish({ kind: 'completed', state: canonicalizeForExit(), depth });
   }
   ```
   Only the `outcomeGrantResolve` branch becomes opt-in-extensible; the other exits remain hard.
3. `PolicyPreviewTraceOutcome` is at `policy-preview.ts:163-171` — adding `postGrantCap` extends the union; trace consumers must handle the new variant. Spec 162's Foundation #20 preview-status taxonomy already includes `depthCap` for the pre-grant cap — `postGrantCap` is a sibling.
4. Ticket 002 has landed `outcomeGrantContinuation` on `AgentPreviewConfig` — this ticket consumes it.
5. Boundary reset approved by user on 2026-05-17: this ticket owns the generic driver continuation/cap/taxonomy proof. The older synthetic opponent-margin differentiation witness belongs with the FITL/ARVN profile proof archived at `archive/tickets/179ACTSELPRE-005.md`.

## Architecture Check

1. **Single exit-condition site, minimal blast radius.** The change is localized to the `outcomeGrantResolve` branch of the exit predicate at lines 986-993. The other exits (`actionSelection`, `turnRetirement`, seat/turn change) remain unchanged — they bound the drive by seat/turn semantics, not by within-action resolution depth.
2. **Independent depth tracking.** The pre-grant `completionDepthCap` and the new `extraDepthCap` are independent budgets — both bounded (Foundation 10). Adding the pre-grant `depth` counter to the post-grant depth would conflate two distinct work classes (microturn-body resolution vs. outcome-grant effect resolution) and make tuning either one harder.
3. **`postGrantCap` exit kind, not reused `depthCap`.** Spec Open Question §8.1 explicitly notes the choice between adding a new exit kind vs. flagging `depthCap` with context. This ticket commits to the new kind for trace clarity — Spec 162's Foundation #20 contract treats distinct outcomes as distinct taxonomy entries. Consumers that branch on `depthCap` continue to fire only when the pre-grant cap is hit; the new kind fires only when the post-grant continuation hits `extraDepthCap`.
4. **Foundation 1 (Engine-Agnosticism) preserved.** The driver change is generic — any game's profile that opts in benefits; no FITL-specific branches.
5. **Foundation 15 (Architectural Completeness)** addressed at the root cause (exit-condition gap) rather than papered over.

## What to Change

### 1. Extend `PolicyPreviewTraceOutcome` taxonomy

In `packages/engine/src/agents/policy-preview.ts` near lines 163-171, add `'postGrantCap'` to the outcome union:

```ts
export type PolicyPreviewUnavailabilityReason =
  | 'random' | 'hidden' | 'unresolved' | 'failed'
  | 'depthCap' | 'postGrantCap'  // NEW
  | 'noPreviewDecision' | 'gated';
```

Update any downstream switch/exhaustive-handler patterns to cover the new variant.

### 2. Modify the exit condition in `driveSyntheticCompletion`

At lines 986-993, replace the unconditional `outcomeGrantResolve` exit with a conditional check. Pseudocode:

```ts
const isHardExit =
  ctxKind === 'actionSelection'
  || ctxKind === 'turnRetirement'
  || topSeatId !== origin.seatId
  || top.turnId !== origin.turnId;

if (isHardExit) {
  return finish({ kind: 'completed', state: canonicalizeForExit(), depth });
}

if (ctxKind === 'outcomeGrantResolve') {
  const cont = input.outcomeGrantContinuation;
  if (!cont?.enabled) {
    return finish({ kind: 'completed', state: canonicalizeForExit(), depth });
  }
  // Track post-grant depth separately
  postGrantDepth += 1;
  if (postGrantDepth >= cont.extraDepthCap) {
    return finish({ kind: 'postGrantCap', state: canonicalizeForExit(), depth, postGrantDepth });
  }
  // else continue the loop past this frame
}
```

`postGrantDepth` is a new local counter initialized at 0 at the start of the drive.

### 3. Surface the new finish kind

The `finish()` helper currently produces results with `kind: 'completed' | 'depthCap' | ...`. Add `postGrantCap` to its kind union and propagate.

### 4. Unit test on a small generic game

Add `packages/engine/test/architecture/preview-post-grant/post-grant-continuation-differentiates.test.ts`:

```ts
// @test-class: architectural-invariant
```

Construct a small generic 2-seat game whose trusted operation pushes `outcomeGrantResolve` frames. Assert:
- With `outcomeGrantContinuation` absent: the preview stops at the grant boundary (`ready` phase) and reports `previewDrive.kind = completed`.
- With `outcomeGrantContinuation: { enabled: true, extraDepthCap: 4, capClass: postGrant16 }`: the driver resolves the post-grant frame (`offered` phase) and reports `previewDrive.kind = completed`.
- The same state/profile pair produces byte-identical generic preview output across two runs.

Add a witness test at `packages/engine/test/architecture/preview-post-grant/post-grant-cap-exit-witness.test.ts`:

```ts
// @test-class: convergence-witness
// @witness: spec-179-post-grant-cap-exit
```

Pin a small game where the post-grant resolution depth exceeds `extraDepthCap`, asserting the trace reports `postGrantCap` (not `depthCap`).

### 5. Update consumers that switch on `PolicyPreviewTraceOutcome`

Grep for `case 'depthCap'` / `outcome === 'depthCap'` and any exhaustive `switch` on the outcome union; add `postGrantCap` cases where exhaustiveness matters. Trace serializer (covered by ticket 004), `policy-eval.ts` outcome aggregator, and any test fixture matchers are the main sites.

## Files to Touch

- `packages/engine/src/agents/policy-preview.ts` (modify — outcome union + driver exit logic + postGrantDepth tracking)
- `packages/engine/src/agents/policy-runtime.ts` (modify — thread profile outcome-grant continuation into preview runtime)
- `packages/engine/src/agents/policy-agent.ts` (modify — unavailability breakdown coverage)
- `packages/engine/src/agents/policy-eval.ts` (modify — outcome switch coverage)
- `packages/engine/src/agents/policy-preview-inner.ts` (modify — preview outcome summary coverage)
- `packages/engine/src/kernel/microturn/publish.ts` (modify — publish generic `outcomeGrantResolve` microturns for the driver)
- `packages/engine/src/kernel/types-core.ts` (modify — trace taxonomy mirror)
- `packages/engine/src/kernel/schemas-core.ts` (modify — trace taxonomy mirror)
- `packages/engine/schemas/Trace.schema.json` (modify — regenerated trace artifact)
- `packages/engine/test/architecture/preview-post-grant/post-grant-fixture.ts` (new — generic post-grant fixture)
- `packages/engine/test/architecture/preview-post-grant/post-grant-continuation-differentiates.test.ts` (new — architectural-invariant)
- `packages/engine/test/architecture/preview-post-grant/post-grant-cap-exit-witness.test.ts` (new — convergence-witness)

`Likely surface` for downstream consumers (refine during `/implement-ticket` reassessment by greping `'depthCap'` and `PolicyPreviewTraceOutcome` consumers): trace serializer, fixture matchers under `packages/engine/test/`, any FITL/Texas Hold'em policy-eval assertions on outcome strings.

## Out of Scope

- Trace surface (`previewUsage.outcomeGrantContinuation` block) — owned by ticket 004.
- Cookbook documentation of the new exit kind — owned by ticket 005.
- WASM-route mirroring — owned by ticket 006 (optional).
- Performance tuning of `extraDepthCap` defaults beyond `postGrant16: 4` — Phase 2 witness (ticket 005) measures real-world cost; future specs adjust budgets if needed.
- Tightening cookbook recipe for opt-in profiles — ticket 005's cookbook addendum scope.

## Acceptance Criteria

### Tests That Must Pass

1. `post-grant-continuation-differentiates.test.ts` — opt-out stops at the generic grant boundary, opt-in resolves the generic `outcomeGrantResolve` frame, and repeated same-profile runs match exactly.
2. `post-grant-cap-exit-witness.test.ts` — `postGrantCap` outcome surfaces when depth budget exceeded.
3. Spec 162's `arvn-seed-1000` witness still passes — `depthCap` continues to fire when the pre-grant cap is hit (no semantic collision with the new `postGrantCap`).
4. Engine test suite green: `pnpm -F @ludoforge/engine test`.
5. Replay determinism (Foundation 8): the generic post-grant preview output is byte-identical across two runs with the same state/profile.

### Invariants

1. Profiles that do NOT set `outcomeGrantContinuation.enabled = true` produce byte-identical traces to today (verified via ticket 002's `old-profiles-compile.test.ts` plus a per-trace identity check on the conformance corpus).
2. `postGrantDepth` is bounded by `extraDepthCap` — no unbounded continuation regardless of state shape (Foundation 10).
3. The non-`outcomeGrantResolve` exits (`actionSelection`, `turnRetirement`, seat/turn change) remain unchanged — bounded by seat/turn semantics.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/architecture/preview-post-grant/post-grant-continuation-differentiates.test.ts` — proves the opt-in produces signal.
2. `packages/engine/test/architecture/preview-post-grant/post-grant-cap-exit-witness.test.ts` — proves the cap is enforced and reported.

### Commands

1. Targeted: `pnpm -F @ludoforge/engine exec node --test dist/test/architecture/preview-post-grant/*.test.js`
2. Spec 162 regression: `pnpm -F @ludoforge/engine exec node --test dist/test/policy-profile-quality/spec-162-arvn-seed-1000-witness.test.js`
3. Full engine: `pnpm -F @ludoforge/engine test`
4. Full turbo: `pnpm turbo test`
5. Lint + typecheck: `pnpm turbo lint && pnpm turbo typecheck`

## Outcome (2026-05-17)

Outcome amended: 2026-05-18

Implemented the Foundation-aligned Phase 1b driver seam:

- `driveSyntheticCompletion` now consumes `preview.outcomeGrantContinuation` when enabled, auto-publishes and applies generic `outcomeGrantResolve` decisions, tracks post-grant continuation with a separate bounded counter, and exits with `postGrantCap` when the extra budget is exhausted.
- Per-candidate preview trace taxonomy now carries `previewDrive.kind = completed | depthCap | postGrantCap | stochastic`; `postGrantCap` is allowed in trace types/schemas and emitted only where the new cap actually occurs.
- Existing opt-out profiles preserve the previous trace shape: advisory `unavailabilityBreakdown.postGrantCap` is absent unless the new reason is observed.
- Generic post-grant tests prove opt-out boundary behavior, opt-in continuation, deterministic same-input preview output, and the `postGrantCap` exit path.

Boundary note: the previously drafted opponent-margin distinctness witness was intentionally not implemented here. User approved the narrower Option 1 boundary on 2026-05-17; FITL/ARVN opponent-margin differentiation was owned by `archive/tickets/179ACTSELPRE-005.md`, and decision-level `previewUsage.outcomeGrantContinuation` aggregation was completed by `archive/tickets/179ACTSELPRE-004.md`.

### Verification

- `pnpm -F @ludoforge/engine build` — PASS
- `pnpm -F @ludoforge/engine exec node --test dist/test/architecture/preview-post-grant/*.test.js` — PASS (2 tests / 2 suites)
- `pnpm -F @ludoforge/engine exec node --test dist/test/policy-profile-quality/spec-162-arvn-seed-1000-witness.test.js` — PASS
- `pnpm -F @ludoforge/engine run schema:artifacts:check` — PASS
- `pnpm -F @ludoforge/engine test` — PASS (92/92 files)
- `pnpm turbo lint` — PASS
- `pnpm turbo typecheck` — PASS
- `pnpm turbo test` — PASS (5/5 tasks; engine 92/92 files, runner 205 files / 2019 tests)

### Source-Size Ledger

Touched files over the repository's 800-line guideline were pre-existing large contract/runtime hubs. The active changes were surgical additions to the existing taxonomy/threading sites; extraction would have widened the ticket beyond the approved Phase 1b seam.

- `packages/engine/src/agents/policy-preview.ts`: 1341 lines, +59/-4
- `packages/engine/src/agents/policy-runtime.ts`: 808 lines, +3/-0
- `packages/engine/src/agents/policy-agent.ts`: 932 lines, +10/-3
- `packages/engine/src/agents/policy-eval.ts`: 1510 lines, +3/-2
- `packages/engine/src/kernel/microturn/publish.ts`: 982 lines, +23/-1
- `packages/engine/src/kernel/types-core.ts`: 2334 lines, +5/-3
- `packages/engine/src/kernel/schemas-core.ts`: 2762 lines, +3/-0

New test helper/test files are under the guideline:

- `packages/engine/test/architecture/preview-post-grant/post-grant-fixture.ts`: 196 lines
- `packages/engine/test/architecture/preview-post-grant/post-grant-continuation-differentiates.test.ts`: 55 lines
- `packages/engine/test/architecture/preview-post-grant/post-grant-cap-exit-witness.test.ts`: 31 lines
