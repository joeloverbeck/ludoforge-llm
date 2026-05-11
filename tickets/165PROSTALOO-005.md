# 165PROSTALOO-005: Continued-deepening integration — widen Spec 164 triggers to projected-lookup refs

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — `agents/policy-preview-inner-deepening.ts`
**Deps**: `archive/tickets/165PROSTALOO-004.md`

## Problem

Spec 164 added continued-inner-preview deepening: a frontier whose preview-derived refs all returned `unavailable(depthCap)` or all returned `ready` with uniform post-expression contributions triggers a deep pass at the configured deep cap class (`deep1024` typically). With projected lookups now in scope as a preview-derived ref family (after tickets 001-004), the Spec 164 trigger evaluators in `packages/engine/src/agents/policy-preview-inner-deepening.ts` need to *see* projected-lookup refs as part of the requested-ref set:

- **`allRequestedRefsDepthCapped`** (Spec 164 §5.4): today considers only `preview.option.*` refs. A frontier whose only projected-lookup refs all returned `unavailable(depthCap)` at the broad pass MUST also trigger the deep pass when this trigger is declared.
- **`allReadyValuesUniform`** (Spec 164 §5.4): defined over **post-expression numeric contribution** across candidate options, not over raw ref identity. Spec 165 §4.8 narrows the documentation but does not change Spec 164 semantics — a preview-derived consideration has usable signal at a frontier iff its `ready` contribution differs across at least two candidate options. Projected lookups whose resolved values are non-numeric scalars (string, boolean) participate via their downstream arithmetic; the trigger evaluation operates on the final numeric contribution per `value.expr`.

The implementation is small: widen the ref-set scan in the trigger evaluator to include projected-lookup refs alongside `preview.option.*` refs. The bulk of the work is the two Phase 4 architectural-invariant tests proving the widened triggers fire correctly.

## Assumption Reassessment (2026-05-11)

1. `packages/engine/src/agents/policy-preview-inner-deepening.ts` exists — verified by `test -f`.
2. Spec 164 §5.4 documents `allRequestedRefsDepthCapped` and `allReadyValuesUniform` as the two deep-pass triggers; their evaluators live in `policy-preview-inner-deepening.ts` per Spec 165 §6.
3. The ref-set scan in the trigger evaluator today probably keys on `previewOptionRef` ref kinds plus already-existing surface refs. Confirm at implementation time by reading the evaluator; widen the predicate to include `lookup.surface: 'previewOptionState'`.
4. `allReadyValuesUniform` is "defined over post-expression numeric contribution" per both Spec 164 and Spec 165 §4.8 — confirm this is the existing semantics by reading the evaluator. Spec 165 explicitly states "this spec widens the ref set, not the trigger semantics". If the evaluator today is keyed on raw ref values (not post-expression contribution), that is a Spec-164-vs-implementation discrepancy and should be raised separately — do not silently expand the scope of this ticket.
5. The two new tests follow the pattern of existing Spec 164 deepening tests (search `packages/engine/test/architecture/preview-deepening/` for examples); reuse fixture-construction patterns from there.
6. The "depthCap → unavailable" outcome from `DriveResult.outcome === 'depthCap'` is mapped to a `depthCap` reason in `unknownPreviewRefs[]` by ticket 004; confirm the trigger evaluator inspects that map (or equivalent per-ref state) to determine `allRequestedRefsDepthCapped`.

## Architecture Check

1. **Ref-set widening only, no trigger-semantics change**: Spec 165 §4.8 is explicit. The deepening pipeline's correctness invariants (post-expression contribution honesty, no manufactured differentiation) hold unchanged. Foundation #20 (Preview Signal Integrity) reinforced — the deep pass either produces real differentiation or honestly records `tiebreakAfterPreviewNoSignal`.
2. **No new cap class**: Spec §3 non-goals. The existing `standard256` / `deep1024` named cap classes accommodate the additional path-walk cost (O(1) per option per ref). Foundation #10 (Bounded Computation) preserved.
3. **Engine-agnostic widening**: the trigger predicate is keyed on the generic compiled-ref shape (`refKind === 'previewOptionRef' || (refKind === 'lookup' && surface === 'previewOptionState')`). No game-specific branching. Foundation #1.
4. **Determinism preserved**: the trigger evaluator's iteration order is unchanged; widening the included set does not alter the order of any ready-stats inspection. Foundation #8.

## What to Change

### 1. Widen `allRequestedRefsDepthCapped` ref-set

In `packages/engine/src/agents/policy-preview-inner-deepening.ts`, locate the predicate that defines "which refs participate in the depth-cap check". Today it covers `previewOptionRef` kinds. Widen to also cover `lookup` refs with `surface === 'previewOptionState'`.

Implementation note: the easiest predicate is "is this ref preview-derived?" — same predicate the compiler uses for `previewFallback` requirement (ticket 003). If a shared helper exists, reuse it. If not, define one and reuse across compiler and deepening evaluator to keep the two surfaces aligned.

### 2. Confirm `allReadyValuesUniform` operates on post-expression contribution

Read the evaluator's implementation. If it already operates on post-expression numeric contribution per `value.expr`, no code change is required for this trigger — Spec 165 §4.8 narrows the documentation. Add a docstring comment near the evaluator pointing at Spec 165 §4.8 for the post-expression-contribution semantics and Open Question #2 for the non-numeric edge case.

If the evaluator operates on raw ref values today, this is a Spec-164-vs-implementation discrepancy — surface it via the 1-3-1 rule rather than silently changing behavior.

### 3. Trace honesty

When deepening fires and projected values remain uniform, the trace MUST honestly record `tiebreakAfterPreviewNoSignal` (Spec §4.8) and the agent falls through to the deterministic tiebreaker. Confirm this is the existing trace behavior for `preview.option.*` and verify (via the new test #13 below) it also applies after the ref-set widening.

### 4. Tests

Author the two Phase 4 architectural-invariant tests in `packages/engine/test/architecture/lookup-refs-projected/`:

- `projected-lookup-deepening-trigger-depthcap.test.ts` (Spec §8.3 #12): a frontier whose only requested projected lookups all returned `unavailable(depthCap)` at the broad pass triggers the deep pass when `allRequestedRefsDepthCapped` is declared. The deep pass resolves them; trace records both phases via Spec 164's `broad`/`deep` coverage sub-blocks.
- `projected-lookup-deepening-trigger-uniform.test.ts` (Spec §8.3 #13): a frontier whose projected lookups return `ready` but yield uniform post-expression contributions across all candidates triggers the deep pass when `allReadyValuesUniform` is declared. Non-numeric projected lookups participate via their downstream arithmetic.

Reuse fixture-construction patterns from `packages/engine/test/architecture/preview-deepening/`'s existing Spec 164 tests.

## Files to Touch

- `packages/engine/src/agents/policy-preview-inner-deepening.ts` (modify — widen `allRequestedRefsDepthCapped` predicate; possibly add docstring near `allReadyValuesUniform`)
- `packages/engine/test/architecture/lookup-refs-projected/projected-lookup-deepening-trigger-depthcap.test.ts` (new — Spec §8.3 #12)
- `packages/engine/test/architecture/lookup-refs-projected/projected-lookup-deepening-trigger-uniform.test.ts` (new — Spec §8.3 #13)

## Out of Scope

- New cap class introduction — Spec §3 forbids.
- Spec 164 trigger-semantics change — Spec §4.8 is explicit: widen ref set only.
- Cookbook recipe + end-to-end fixture — ticket 165PROSTALOO-006.
- The optional FITL ARVN profile-quality witness — Spec §8.5 #14.
- Drive-time observer-purity hardening — explicitly deferred per Spec §11 open question 1.
- Resolution of Spec §11 open question 2 (`allReadyValuesUniform` semantics for non-numeric projected lookups whose value is consumed by a conditional `when`-clause-style expression) — deferred; this ticket accepts the documented v1 behavior.

## Acceptance Criteria

### Tests That Must Pass

1. **`projected-lookup-deepening-trigger-depthcap.test.ts`** — Deep pass triggers when projected lookups all returned `depthCap` at the broad pass; the deep pass resolves them; trace records both `broad` and `deep` coverage sub-blocks. **Spec §8.3 #12.**
2. **`projected-lookup-deepening-trigger-uniform.test.ts`** — Deep pass triggers when projected lookups return `ready` with uniform post-expression contributions; if the deep pass still yields uniform contributions, the trace records `tiebreakAfterPreviewNoSignal` and the agent falls through to the deterministic tiebreaker. **Spec §8.3 #13.**
3. **All Spec 164 deepening tests** continue to pass byte-identically.
4. **All Spec 163 + ticket-003-and-004 tests** continue to pass.
5. **Full engine suite**: `pnpm -F @ludoforge/engine test` green.
6. **Build / typecheck / lint**: `pnpm turbo build && pnpm turbo typecheck && pnpm turbo lint` green.

### Invariants

1. **Ref-set widening, not trigger-semantics change**: `allRequestedRefsDepthCapped` covers `previewOptionRef`s AND `lookup.surface: 'previewOptionState'` refs; `allReadyValuesUniform` semantics are unchanged (post-expression numeric contribution).
2. **No manufactured differentiation**: when deepening fires and contributions remain uniform, the trace records `tiebreakAfterPreviewNoSignal` honestly. Foundation #20 reinforced.
3. **Determinism**: same compiled spec + same drive cache = same trigger outcome and same trace serialization. Foundation #8.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/architecture/lookup-refs-projected/projected-lookup-deepening-trigger-depthcap.test.ts` — Spec §8.3 #12: widened depth-cap trigger.
2. `packages/engine/test/architecture/lookup-refs-projected/projected-lookup-deepening-trigger-uniform.test.ts` — Spec §8.3 #13: widened uniform-values trigger.

### Commands

1. `pnpm turbo build` — engine compile before `node --test`.
2. `node --test packages/engine/dist/test/architecture/lookup-refs-projected/projected-lookup-deepening-*.test.js` — run new deepening tests.
3. `pnpm -F @ludoforge/engine test` — full engine suite (must include all Spec 164 deepening tests).
4. `pnpm turbo build && pnpm turbo typecheck && pnpm turbo lint` — gates.
5. `pnpm run check:ticket-deps` — Deps validation.
