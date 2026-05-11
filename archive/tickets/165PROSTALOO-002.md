# 165PROSTALOO-002: Extract `resolveLookupAgainstState` from `resolveLookupViaSeatResolution`

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — `agents/policy-lookup-surface.ts`
**Deps**: `archive/tickets/165PROSTALOO-001.md`

## Problem

Spec 165 §4.2 calls for refactoring `packages/engine/src/agents/policy-lookup-surface.ts` to factor out an explicit `LookupStateSource` parameter so that the path-walk-plus-observer-projection logic can be aimed at any `GameState` — `context.state` (current observer-projected state, the Spec 163 case) or `drive.state` (the bounded synthetic-completion endpoint emitted by `policy-preview-inner.ts`'s `DriveResult`).

Today, `resolveLookupViaSeatResolution(context, ref, keyValue, seatContext?)` reads `context.state` implicitly throughout its body (verified at `packages/engine/src/agents/policy-lookup-surface.ts:51-70` and the internal helpers `projectLookupObject`, `walkLookupPath`, etc.). The runtime routing in ticket 165PROSTALOO-004 needs to point the same logic at `drive.state` for projected lookups; threading a second context shape through every internal helper would be invasive. The clean refactor is: introduce `LookupStateSource = { state; provenance }`, export `resolveLookupAgainstState(context, source, ref, keyValue, seatContext?)` as the new core, and make `resolveLookupViaSeatResolution` a thin wrapper that constructs `source = { state: context.state, provenance: { kind: 'currentState' } }` and delegates.

This ticket lands the refactor alone — no new caller, no new behavior — so that downstream tickets can rely on the new signature and so Spec 163's existing tests prove the extraction is behavior-preserving.

## Assumption Reassessment (2026-05-11)

1. `packages/engine/src/agents/policy-lookup-surface.ts:21-29` defines `PolicyLookupResolutionContext { readonly state: GameState; ... }` — verified.
2. `packages/engine/src/agents/policy-lookup-surface.ts:51-70` defines `resolveLookupViaSeatResolution(context, ref, keyValue, seatContext?)` — verified.
3. The internal helpers (`projectLookupObject` at line 132, plus path-walk helpers around lines 152, 177, 204, 247) all take `PolicyLookupResolutionContext` and read `context.state` — verified by `grep` for `PolicyLookupResolutionContext` in the file.
4. `LookupStateProvenance` is exported by ticket 165PROSTALOO-001 — depend on that landing first.
5. The resolver consumers across the codebase: confirm via `grep -rn "resolveLookupViaSeatResolution" packages/engine/src/` that all current callers are in `policy-evaluation-core.ts` (`resolveLookupRef` is the singular caller, added in Spec 163 Phase 2). The wrapper's signature stays identical, so no caller-site change is required.
6. The resolver refactor is described in Spec §4.2 as "a thin wrapper" — confirm scope: the wrapper's body collapses to a one-line `return resolveLookupAgainstState(context, { state: context.state, provenance: { kind: 'currentState' } }, ref, keyValue, seatContext);`. No additional logic.

## Architecture Check

1. **Reuse over reimplementation**: the new core `resolveLookupAgainstState` is the *same* path-walk and observer-projection logic — just generalized over the `state` source. No duplicated logic, no game-specific branching. Foundation #1 preserved.
2. **Observer projection still routes through the same `projectLookupObject`**: the visibility check consults `CompiledZoneVisibilityCatalog` and `CompiledSurfaceCatalog` against whatever state is passed. Spec §4.7's "Observer-projection inheritance" relies on this property. Foundation #4 upheld.
3. **No backwards-compatibility shim**: `resolveLookupViaSeatResolution` is rewritten as a wrapper, not preserved as a legacy code path. Foundation #14.
4. **Determinism preserved**: the refactor is mechanical; no change in iteration order, no change in serialization. Foundation #8.
5. **Provenance is a first-class observability surface**: `LookupStateSource.provenance` will surface in trace output via downstream tickets (ticket 004 attaches it at the routing call site). Foundation #9 (Auditability) reinforced.

## What to Change

### 1. Define `LookupStateSource` interface

In `packages/engine/src/agents/policy-lookup-surface.ts`, near the existing `PolicyLookupResolutionContext` declaration:

```ts
export interface LookupStateSource {
  readonly state: GameState;
  readonly provenance: LookupStateProvenance;
}
```

`LookupStateProvenance` is exported from this same file by ticket 165PROSTALOO-001; reference it directly.

### 2. Extract `resolveLookupAgainstState`

Convert the body of `resolveLookupViaSeatResolution` into a new exported function:

```ts
export function resolveLookupAgainstState(
  context: PolicyLookupResolutionContext,
  source: LookupStateSource,
  ref: LookupRef,
  keyValue: PolicyValue,
  seatContext?: string,
): LookupRefStatus {
  // existing body of resolveLookupViaSeatResolution, but every read of `context.state`
  // is replaced with `source.state`. The visibility plumbing (`projectLookupObject`,
  // `isSurfaceVisibilityAccessible`) continues to receive `context` (for the seat catalogs)
  // alongside the `state` argument from `source.state`.
}
```

Internal helpers (`projectLookupObject` and any path-walk helpers that today read `context.state`) must be updated so the state is threaded explicitly. Two equivalent approaches:

- **(a) Pass `state` as a second positional argument to each helper.** Lowest-overhead refactor; helpers stay `pure(context, state, ...)`.
- **(b) Construct a synthetic `PolicyLookupResolutionContext` per call site that overrides `.state` with `source.state`.** Cheaper textual diff at the call site but constructs throwaway objects each resolution.

**Recommendation**: approach (a). The helpers are private to the file; passing a second arg is cleaner than allocating throwaway contexts and avoids the implicit invariant "did the caller remember to swap `state` before calling?". Implementer may choose (b) if profiling shows allocation pressure is negligible and the textual diff is preferred — document the choice in the PR description either way.

### 3. Rewrite `resolveLookupViaSeatResolution` as a wrapper

```ts
export function resolveLookupViaSeatResolution(
  context: PolicyLookupResolutionContext,
  ref: LookupRef,
  keyValue: PolicyValue,
  seatContext?: string,
): LookupRefStatus {
  return resolveLookupAgainstState(
    context,
    { state: context.state, provenance: { kind: 'currentState' } },
    ref,
    keyValue,
    seatContext,
  );
}
```

Existing callers (`policy-evaluation-core.ts`'s `resolveLookupRef` for `surface: 'policyState'`) are untouched. Their delegation continues unchanged.

### 4. Export both symbols

Both `resolveLookupAgainstState` and `LookupStateSource` are `export`ed. `resolveLookupViaSeatResolution` remains exported (still in use; the runtime routing in ticket 004 will keep using it for `surface: 'policyState'`).

## Files to Touch

- `packages/engine/src/agents/policy-lookup-surface.ts` (modify — extract resolver, add wrapper, export new types)

## Out of Scope

- Any caller-site change in `policy-evaluation-core.ts`. The wrapper preserves the existing call signature.
- Any new behavior tied to `surface: 'previewOptionState'` — ticket 004 wires that in.
- Trace emission of `LookupStateProvenance` — ticket 004 attaches it at the routing call site and ticket 005 widens deepening triggers to see it.
- Performance optimization beyond choosing approach (a) vs (b) in §2 above. Premature optimization is out of scope for this ticket.

## Acceptance Criteria

### Tests That Must Pass

1. The full Spec 163 lookup-refs test suite passes byte-identically. Specifically, tests under `packages/engine/test/architecture/lookup-refs/**` (including `lookup-refs-fixture.ts` consumers) produce the same outcomes as on the pre-refactor commit.
2. `pnpm turbo build`, `pnpm turbo typecheck`, `pnpm turbo lint` all green.
3. `pnpm -F @ludoforge/engine test` — full engine suite passes.
4. Spot-check: `resolveLookupAgainstState` is importable from sibling modules and has the signature `(context, source, ref, keyValue, seatContext?) => LookupRefStatus`.

### Invariants

1. **Behavior parity**: every input `(context, ref, keyValue, seatContext?)` that produced result `R` via `resolveLookupViaSeatResolution` before the refactor produces the same result `R` after. The wrapper is a pure renaming + indirection.
2. **Observer projection still routes through `projectLookupObject`**: the visibility check for `surface: 'policyState'` resolutions consults the same `CompiledZoneVisibilityCatalog` / `CompiledSurfaceCatalog` paths.
3. **No new code paths gated on `provenance.kind`** in this ticket — the wrapper hardcodes `currentState`; alternate provenance is introduced by ticket 004 only.

## Test Plan

### New/Modified Tests

No new tests authored in this ticket — the refactor's correctness is proven by Spec 163's existing test suite continuing to pass byte-identically.

### Commands

1. `pnpm -F @ludoforge/engine test` — full engine suite (includes Spec 163's `lookup-refs/**` tests).
2. `pnpm turbo build` — verify no upstream compilation breakage.
3. `pnpm turbo typecheck` — strict typecheck.
4. `pnpm turbo lint` — lint.
5. `pnpm run check:ticket-deps` — verify Deps path resolves.

## Outcome

**Completion date**: 2026-05-11

**Status target**: COMPLETED after final verification.

**What landed**:
- Added exported `LookupStateSource` beside the resolver context in `packages/engine/src/agents/policy-lookup-surface.ts`.
- Extracted exported `resolveLookupAgainstState(context, source, ref, keyValue, seatContext?)` as the core lookup resolver.
- Rewrote `resolveLookupViaSeatResolution` as the current-state wrapper, using `{ state: context.state, provenance: { kind: 'currentState' } }`.
- Threaded the explicit source `GameState` through key validation and lookup projection helpers, while keeping visibility catalogs and observer-seat resolution on the existing resolver context.

**Owned generated/artifact fallout**:
- None. This ticket changes an internal policy/agent resolver surface only; no schema source, generated schema artifact, golden, or compiled game JSON changed.

**Deferred sibling/spec scope**:
- `tickets/165PROSTALOO-003.md` owns compiler lowering and diagnostics.
- `tickets/165PROSTALOO-004.md` owns runtime routing for `surface: 'previewOptionState'`.
- `tickets/165PROSTALOO-005.md` owns continued-deepening trigger widening.
- `tickets/165PROSTALOO-006.md` owns cookbook and end-to-end projected-lookup fixture coverage.

**Touched-file scope**:
- Ticket-named source file modified: `packages/engine/src/agents/policy-lookup-surface.ts`.
- No caller-site changes were required; `packages/engine/src/agents/policy-runtime.ts` remains on the wrapper and is intentionally unchanged.

**File-size ledger**:
- `packages/engine/src/agents/policy-lookup-surface.ts`: 357 -> 384 lines; below repo guidance; active growth is the ticket-owned extraction and explicit state threading. Extraction into another file would widen this small resolver refactor. Residual owner: none.

**Verification plan**:
- `pnpm turbo build` — passed.
- focused Spec 163 lookup-refs compiled lane: `node --test packages/engine/dist/test/architecture/lookup-refs/*.js` — passed, 16 tests / 8 suites.
- `pnpm turbo typecheck` — passed.
- `pnpm turbo lint` — passed.
- `pnpm -F @ludoforge/engine test` — passed, including `schema:artifacts:check` and default engine lane summary `65/65 files passed`.
- `pnpm run check:ticket-deps` — passed; dependency integrity check passed for 5 active tickets and 2297 archived tickets.

**Late-edit proof validity**:
- No-invalidation: terminal status/proof transcription only; no scope, acceptance, command, touched-file, follow-up, or dependency change.
- No-invalidation: dependency-check result transcription only; no dependency paths, status semantics, acceptance scope, proof command, or touched-file ownership changed.
