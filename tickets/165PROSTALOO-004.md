# 165PROSTALOO-004: Runtime routing for `lookup.surface: previewOptionState` in `resolveLookupRef`

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `agents/policy-evaluation-core.ts`, `agents/policy-agent.ts` (consumes existing maps)
**Deps**: `archive/tickets/165PROSTALOO-002.md`, `tickets/165PROSTALOO-003.md`

## Problem

With ticket 002's resolver refactor exporting `resolveLookupAgainstState` and ticket 003's compiler emitting compiled refs with `surface: 'previewOptionState'`, the runtime now needs to route those refs correctly at evaluation time. Today `resolveLookupRef` in `packages/engine/src/agents/policy-evaluation-core.ts` (added in Spec 163 Phase 2, around line 1313) delegates uniformly to `resolveLookupViaSeatResolution` regardless of surface — projected lookups would silently fall back to current-state resolution, defeating the purpose of the new family.

Spec §4.3 specifies the routing rule:

1. `ref.surface === 'policyState'` → delegate to `resolveLookupViaSeatResolution(currentStateContext, ...)`. Unchanged from Spec 163.
2. `ref.surface === 'previewOptionState'`:
   - Require a candidate-bound `DriveResult` in scope. Action-selection candidates and chooseNStep ADD/CONFIRM frontiers without per-option drive context return `unavailable` with reason `unknownGated` and register in `unknownPreviewRefs[]`.
   - If `drive.outcome !== 'ready'`, map the drive outcome to a preview-unavailability reason (`depthCap`, `hidden`, `stochastic`, `failed`, `unresolved`) and register in `unknownPreviewRefs[]`. **Depth-capped `DriveResult.state` is NEVER read as a valid endpoint** (Spec §4.3 + §8.1 #1 + Foundation #20).
   - Otherwise construct `source = { state: drive.state, provenance: { kind: 'previewOptionState', depth, capClass, completionPolicy } }` and call `resolveLookupAgainstState`. Path-missing / hidden / type-mismatch outcomes at this stage register in `unknownLookupRefs[]` (proximate cause is the lookup, given a successful drive).

This ticket carries the six Spec §8.1 runtime invariant tests (#1 ready-endpoint-only, #4 observer-visibility, #6 gated-at-action-selection, #7 costclass-promotion sanity, #8 collection-coverage at the projected surface, #9 determinism). Test #7 is technically a compile-time observation but its runtime confirmation (the trace records `costClass: preview`) belongs here.

## Assumption Reassessment (2026-05-11)

1. `resolveLookupRef` exists at `packages/engine/src/agents/policy-evaluation-core.ts:1313` — verified by `grep`.
2. The neighbouring `resolveSurfaceRef` at line 1576 follows a similar dispatch pattern — useful reference for the new routing logic shape.
3. `DriveResult` is defined at `packages/engine/src/agents/policy-preview-inner.ts:198-205` with fields `state`, `depth`, `outcome`, `capClass`, `completionPolicy` — confirm exact field names by inspection before extracting provenance fields. (If `capClass` or `completionPolicy` are named differently in source, adjust `LookupStateProvenance` consumers accordingly. The spec uses these names; ticket 001 imported `PolicyPreviewDriveTrace['completionPolicy']` for the provenance type.)
4. `unknownPreviewRefs[]` and `unknownLookupRefs[]` maps are populated in `policy-evaluation-core.ts` today (Spec 162 and 163, respectively). The structural-frontier dispatch in `policy-agent.ts`'s `traceCandidatesForFrontier` already consumes both maps — verified by Spec §6.
5. `policy-preview-inner.ts:447` calls `resolveVisibleSurface(input, drive.state, ...)` for scalar `preview.option.*` readouts — confirmed by Spec §2.2. **This call site is NOT touched** by this ticket; projected lookups route through `policy-lookup-surface.ts`'s separate visibility plumbing (Spec §4.7 §6).
6. Per-candidate `DriveResult` is already cached per option at `policy-preview-inner.ts:495` (`runChooseOneInnerPreview`); the new family reads from the same cache. No additional drive invocations.
7. The action-selection frontier path: confirm by reading `traceCandidatesForFrontier` whether action-selection candidates have access to a per-option `DriveResult`. Per Spec §4.3 and Spec 162 the answer is "no — gated by `unknownGated`", but spot-check the structural-frontier dispatch to confirm the per-candidate context lacks `DriveResult` at action-selection.
8. The Spec §4.4 key-evaluation rule says the lookup `key` expression is evaluated **in the root candidate context**, not in the projected state. Confirm that the existing `resolveLookupRef` evaluates `ref.key` against the candidate context (not the resolved state) — this should be the existing behavior since Spec 163, but worth verifying that the routing change does not accidentally swap key evaluation into projected state.

## Architecture Check

1. **One routing dispatch, two surfaces**: the routing rule is a `switch (ref.surface)` with two arms — `policyState` is the existing call, `previewOptionState` is the new branch. No game-specific dispatch, no per-game branching. Foundation #1.
2. **Drive-induced unavailability flows through `unknownPreviewRefs`**: aligns with Foundation #20 (Preview Signal Integrity) — preview-derived unavailability is reported through the preview channel; path-induced unavailability at a ready drive flows through `unknownLookupRefs` (lookup is proximate cause). Auditability (Foundation #9) is preserved: the trace consumer can attribute the failure mode by which map carries the ref id.
3. **Ready-endpoint-only contract is the integrity invariant**: depth-capped `DriveResult.state` MUST NOT be read as if it were a valid endpoint. Spec 164 §5.3 documents that depth-capped state is a continuation checkpoint, not a complete projection; reading it as a final state would silently corrupt scoring (Foundation #15 Architectural Completeness, Foundation #20 Preview Signal Integrity). The test #1 in §8.1 enforces this directly.
4. **Observer projection routes through `projectLookupObject` against `drive.state`**: the visibility check inherits from Spec 163's plumbing without modification (Spec §4.7). Foundation #4 upheld; no new visibility table introduced.
5. **Provenance is recorded in trace**: by passing `provenance: { kind: 'previewOptionState'; depth; capClass; completionPolicy }` into `resolveLookupAgainstState`, the eventual trace consumer can distinguish current-state vs projected-state lookups at the resolution level — distinct from the surface-qualified ref id (Spec §4.9). Foundation #9 reinforced.
6. **No backwards-compat shim**: the new branch in the dispatch is inline; no opt-in flag, no legacy code path. Foundation #14.

## What to Change

### 1. Extend `resolveLookupRef` with surface-based dispatch

In `packages/engine/src/agents/policy-evaluation-core.ts` near line 1313, change the body of `resolveLookupRef` (or its equivalent dispatch site) from a uniform delegation to:

```pseudo
if (ref.surface === 'policyState') {
  return resolveLookupViaSeatResolution(currentStateContext, ref, keyValue, seatContext);
}
// ref.surface === 'previewOptionState'
const drive = candidate.drive; // or whatever the candidate's bound DriveResult accessor is
if (!drive) {
  registerUnknownPreviewRef(ref.id, 'unknownGated');
  return unavailable('unknownGated');
}
if (drive.outcome !== 'ready') {
  const reason = mapDriveOutcomeToReason(drive.outcome); // depthCap, hidden, stochastic, failed, unresolved
  registerUnknownPreviewRef(ref.id, reason);
  return unavailable(reason);
}
const source: LookupStateSource = {
  state: drive.state,
  provenance: {
    kind: 'previewOptionState',
    depth: drive.depth,
    capClass: drive.capClass,
    completionPolicy: drive.completionPolicy,
  },
};
const result = resolveLookupAgainstState(projectedContext(drive.state, currentStateContext), source, ref, keyValue, seatContext);
if (result.status !== 'ready') {
  registerUnknownLookupRef(ref.id, result.reason); // path missing / hidden / type-mismatch
}
return result;
```

Verify the exact accessor for the per-candidate `DriveResult` by reading the current `policy-evaluation-core.ts` candidate context surface — Spec §2.2 references `runChooseOneInnerPreview` at `policy-preview-inner.ts:495` driving once per option and caching the result; the candidate context must already carry it for `preview.option.*` resolution.

The `projectedContext(drive.state, currentStateContext)` helper constructs a `PolicyLookupResolutionContext` whose `.state` field is replaced by `drive.state` while preserving the seat catalogs, visibility tables, and other context fields. Approach (a) from ticket 002's resolver refactor (threading `state` explicitly through helpers) makes this construction unnecessary; if approach (b) was chosen, build the synthetic context here.

### 2. Map drive outcomes to preview-unavailability reasons

Define a helper (or inline switch) that maps `drive.outcome` values to the corresponding unavailability reason string:

- `depthCap` → `'depthCap'`
- `hidden` → `'hidden'`
- `stochastic` → `'stochastic'`
- `failed` → `'failed'`
- `unresolved` → `'unresolved'`

Verify the actual `PolicyPreviewTraceOutcome` union by reading `packages/engine/src/agents/policy-preview-inner.ts` around line 198-205; ensure every non-`ready` variant has a corresponding mapping. If a variant exists that the spec does not enumerate, raise the discrepancy in the ticket reassessment and either extend the spec or default to `unresolved`.

### 3. `policy-agent.ts` integration

`policy-agent.ts`'s `traceCandidatesForFrontier` and the structural-frontier dispatch consume the same `unknownPreviewRefs` and `unknownLookupRefs` maps populated by ticket-2-and-this-ticket's plumbing — no shape change. Verify in the implementation pass that the maps are surfaced into the trace shape via the existing channels (Spec §4.9): `readyRefStats[refId]` (same shape, distinguished by ref id segment), `unknownLookupRefs[]` (gains entries when proximate cause is the lookup), `previewFallbackFired` (fires for projected lookups when `previewFallback.onUnavailable` resolves the contribution to a constant).

No new trace shape is required.

### 4. Tests

Author the six runtime invariant tests in `packages/engine/test/architecture/lookup-refs-projected/`:

1. `projected-lookup-ready-endpoint-only.test.ts` (Spec §8.1 #1): two parallel fixtures, one with `outcome: 'ready'`, one with `outcome: 'depthCap'`; same projected lookup ref; assert (a) returns the path value walked against `DriveResult.state`, (b) returns `unavailable(depthCap)` and never reads `DriveResult.state`.
2. `projected-lookup-observer-visibility.test.ts` (Spec §8.1 #4): two-seat fixture; same projected lookup ref evaluated under each seat context; seat A resolves `ready`, seat B resolves `unavailable(hidden)`.
3. `projected-lookup-gated-at-action-selection.test.ts` (Spec §8.1 #6): projected lookup at an action-selection frontier (no per-option `DriveResult`); every candidate returns `unavailable(unknownGated)`; `previewFallback.onUnavailable: noContribution` produces no contribution; `unknownPreviewRefs` records the ref.
4. `projected-lookup-costclass-runtime.test.ts` (Spec §8.1 #7 — runtime confirmation): the trace records `costClass: preview` for the consideration evaluated at runtime, regardless of author-written `costClass`. (Compile-time portion of #7 already lives in ticket 003's `projected-lookup-costclass-promotion.test.ts`; this test is the runtime confirmation that the join propagates into trace surface.) Implementer may merge this test with the compile-time one in ticket 003 if the trace surface is easier to assert in the same fixture — coordinate with that ticket's author.
5. `projected-lookup-collection-coverage.test.ts` (Spec §8.1 #8): for each of `zones`, `tokens`, `players`, `globals`, a path-walk depth ≥ 2 against `DriveResult.state` from a synthetic completion resolves correctly.
6. `projected-lookup-determinism.test.ts` (Spec §8.1 #9): replay a microturn twice; assert byte-identical resolution outcomes and ref-id-sorted unknown ref maps and contribution values.

If test #4 (`projected-lookup-costclass-runtime.test.ts`) is folded into ticket 003 by mutual agreement, remove this file from the Files-to-Touch list during the implementation pass and document the relocation.

## Files to Touch

- `packages/engine/src/agents/policy-evaluation-core.ts` (modify — extend `resolveLookupRef` with §4.3 routing)
- `packages/engine/src/agents/policy-agent.ts` (likely no shape change; verify `traceCandidatesForFrontier` consumes the existing maps correctly with the new ref ids)
- `packages/engine/test/architecture/lookup-refs-projected/projected-lookup-ready-endpoint-only.test.ts` (new)
- `packages/engine/test/architecture/lookup-refs-projected/projected-lookup-observer-visibility.test.ts` (new)
- `packages/engine/test/architecture/lookup-refs-projected/projected-lookup-gated-at-action-selection.test.ts` (new)
- `packages/engine/test/architecture/lookup-refs-projected/projected-lookup-costclass-runtime.test.ts` (new — possibly merged into ticket 003's compile-time costclass test)
- `packages/engine/test/architecture/lookup-refs-projected/projected-lookup-collection-coverage.test.ts` (new)
- `packages/engine/test/architecture/lookup-refs-projected/projected-lookup-determinism.test.ts` (new)

## Out of Scope

- Continued-deepening trigger widening — ticket 165PROSTALOO-005.
- The end-to-end fixture profile (`projected-lookup-fixture.ts`) and cookbook recipe — ticket 165PROSTALOO-006. (Per-test inline fixtures are sufficient for the invariant tests in this ticket; the shared end-to-end fixture is a Phase 5 deliverable.)
- Touching `policy-preview-inner.ts:447` — Spec §6 explicitly says scalar `preview.option.*` visibility-at-readout is UNCHANGED.
- Touching `AGENT_POLICY_PREVIEW_OPTION_REF_KINDS` — UNCHANGED per Spec §10.
- The optional FITL ARVN profile-quality witness (Spec §8.5 #14).
- Drive-time observer-purity hardening — explicitly deferred per Spec §11 open question 1.

## Acceptance Criteria

### Tests That Must Pass

1. **`projected-lookup-ready-endpoint-only.test.ts`** — `ready` drive produces a ready path-walk against `drive.state`; `depthCap` drive produces `unavailable(depthCap)` and the test asserts `drive.state` was never read (via spy / wrapped state-access). **Foundation #20 integrity.**
2. **`projected-lookup-observer-visibility.test.ts`** — Two-seat fixture, same projected ref under each seat. Seat A `ready`, seat B `unavailable(hidden)`. **Foundation #4.**
3. **`projected-lookup-gated-at-action-selection.test.ts`** — At an action-selection frontier without per-option drive context, every candidate returns `unavailable(unknownGated)`; ref registered in `unknownPreviewRefs[]`. **Spec §4.3 gating.**
4. **`projected-lookup-costclass-runtime.test.ts`** — Runtime trace records `costClass: preview` (or equivalent, depending on where the trace surfaces the consideration's effective costClass).
5. **`projected-lookup-collection-coverage.test.ts`** — Each of `zones`, `tokens`, `players`, `globals` is exercised at path-depth ≥ 2 against a synthetic completion's `DriveResult.state`.
6. **`projected-lookup-determinism.test.ts`** — Byte-identical resolution outcomes across two replays; `unknownPreviewRefs[]` and `unknownLookupRefs[]` entries sorted by ref id. **Foundation #8.**
7. **All Spec 163 lookup-refs tests** continue to pass byte-identically (the routing change must not regress `surface: 'policyState'` behavior).
8. **Full engine suite**: `pnpm -F @ludoforge/engine test` green.
9. **Build / typecheck / lint**: `pnpm turbo build && pnpm turbo typecheck && pnpm turbo lint` green.

### Invariants

1. **Ready-endpoint-only contract**: `DriveResult.state` is read only when `drive.outcome === 'ready'`. Every non-`ready` outcome returns `unavailable` with the corresponding reason; the state is never inspected.
2. **Surface-keyed unavailable-channel partition**: drive-induced unavailability flows through `unknownPreviewRefs[]`; path-induced unavailability at a ready drive flows through `unknownLookupRefs[]`.
3. **Observer projection inherited from Spec 163**: visibility filtering on the projected state uses the same `projectLookupObject` pipeline as current-state lookups.
4. **Determinism**: same compiled ref + same drive + same observer context = byte-identical resolution outcome.
5. **Key evaluation in root candidate context**: the projected lookup's `key` expression is NOT evaluated against `drive.state`; it is evaluated against the root candidate context (Spec §4.4). The compiler enforces preview-freedom of the key (ticket 003); the runtime enforces evaluation in root context (this ticket).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/architecture/lookup-refs-projected/projected-lookup-ready-endpoint-only.test.ts` — Spec §8.1 #1.
2. `packages/engine/test/architecture/lookup-refs-projected/projected-lookup-observer-visibility.test.ts` — Spec §8.1 #4.
3. `packages/engine/test/architecture/lookup-refs-projected/projected-lookup-gated-at-action-selection.test.ts` — Spec §8.1 #6.
4. `packages/engine/test/architecture/lookup-refs-projected/projected-lookup-costclass-runtime.test.ts` — Spec §8.1 #7 (runtime portion; possibly merged with ticket 003's compile-time portion).
5. `packages/engine/test/architecture/lookup-refs-projected/projected-lookup-collection-coverage.test.ts` — Spec §8.1 #8.
6. `packages/engine/test/architecture/lookup-refs-projected/projected-lookup-determinism.test.ts` — Spec §8.1 #9.

### Commands

1. `pnpm turbo build` — engine package must compile before `node --test` consumes `dist/`.
2. `node --test packages/engine/dist/test/architecture/lookup-refs-projected/*.test.js` — run new runtime invariant tests.
3. `pnpm -F @ludoforge/engine test` — full engine suite.
4. `pnpm turbo build && pnpm turbo typecheck && pnpm turbo lint` — gates.
5. `pnpm run check:ticket-deps` — Deps validation.
