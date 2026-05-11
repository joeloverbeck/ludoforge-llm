# 165PROSTALOO-005: Continued-deepening integration — widen Spec 164 triggers to projected-lookup refs

**Status**: COMPLETED
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
4. `allReadyValuesUniform` is "defined over post-expression numeric contribution" per both Spec 164 and Spec 165 §4.8. Live reassessment found the evaluator still compares raw per-ref values, not post-expression contribution values. Per the 2026-05-11 user-approved Foundation #15/#20 boundary reset, this ticket now owns repairing that Spec-164-vs-implementation discrepancy before widening projected-lookup trigger coverage.
5. The two new tests follow the pattern of existing Spec 164 deepening tests (search `packages/engine/test/architecture/preview-deepening/` for examples); reuse fixture-construction patterns from there.
6. The "depthCap → unavailable" outcome from `DriveResult.outcome === 'depthCap'` is mapped to a `depthCap` reason in `unknownPreviewRefs[]` by ticket 004; confirm the trigger evaluator inspects that map (or equivalent per-ref state) to determine `allRequestedRefsDepthCapped`.

## Architecture Check

1. **Ref-set widening plus trigger-semantics repair**: Spec 165 §4.8 is explicit that uniformity is over post-expression numeric contribution. Live code compared raw ref values, so this ticket now owns restoring the documented Spec 164/165 semantics and then widening projected-lookup participation. Foundation #20 (Preview Signal Integrity) reinforced — the deep pass either produces real differentiation or honestly records `tiebreakAfterPreviewNoSignal`.
2. **No new cap class**: Spec §3 non-goals. The existing `standard256` / `deep1024` named cap classes accommodate the additional path-walk cost (O(1) per option per ref). Foundation #10 (Bounded Computation) preserved.
3. **Engine-agnostic widening**: the trigger predicate is keyed on the generic compiled-ref shape (`refKind === 'previewOptionRef' || (refKind === 'lookup' && surface === 'previewOptionState')`). No game-specific branching. Foundation #1.
4. **Determinism preserved**: the trigger evaluator's iteration order is unchanged; widening the included set does not alter the order of any ready-stats inspection. Foundation #8.

## What to Change

### 1. Widen `allRequestedRefsDepthCapped` ref-set

In `packages/engine/src/agents/policy-preview-inner-deepening.ts`, locate the predicate that defines "which refs participate in the depth-cap check". Today it covers `previewOptionRef` kinds. Widen to also cover `lookup` refs with `surface === 'previewOptionState'`.

Implementation note: the easiest predicate is "is this ref preview-derived?" — same predicate the compiler uses for `previewFallback` requirement (ticket 003). If a shared helper exists, reuse it. If not, define one and reuse across compiler and deepening evaluator to keep the two surfaces aligned.

### 2. Repair `allReadyValuesUniform` to operate on post-expression contribution

The evaluator operated on raw ref values at reassessment time. Repair it so the trigger evaluates each preview-derived microturn consideration's final numeric contribution per candidate option. Projected lookups whose resolved values are non-numeric scalars participate through the downstream arithmetic in `value.expr`; no raw string/boolean identity comparison should fire or suppress the trigger by itself.

This boundary reset was approved by the user on 2026-05-11 after reassessing the options against `docs/FOUNDATIONS.md`: Foundation #15 requires fixing the root semantic gap, and Foundation #20 requires preview no-signal decisions to be based on actual contribution signal rather than raw ref identity.

### 3. Trace honesty

When deepening fires and projected values remain uniform, the trace MUST honestly record `tiebreakAfterPreviewNoSignal` (Spec §4.8) and the agent falls through to the deterministic tiebreaker. Confirm this is the existing trace behavior for `preview.option.*` and verify (via the new test #13 below) it also applies after the ref-set widening.

### 4. Tests

Author the two Phase 4 architectural-invariant tests in `packages/engine/test/architecture/lookup-refs-projected/`:

- `projected-lookup-deepening-trigger-depthcap.test.ts` (Spec §8.3 #12): a frontier whose only requested projected lookups all returned `unavailable(depthCap)` at the broad pass triggers the deep pass when `allRequestedRefsDepthCapped` is declared. The deep pass resolves them; trace records both phases via Spec 164's `broad`/`deep` coverage sub-blocks.
- `projected-lookup-deepening-trigger-uniform.test.ts` (Spec §8.3 #13): a frontier whose projected lookups return `ready` but yield uniform post-expression contributions across all candidates triggers the deep pass when `allReadyValuesUniform` is declared. Non-numeric projected lookups participate via their downstream arithmetic.

Reuse fixture-construction patterns from `packages/engine/test/architecture/preview-deepening/`'s existing Spec 164 tests.

## Files to Touch

- `packages/engine/src/agents/policy-agent-inner-preview.ts` (modify — collect preview-derived projected lookup refs and compute contribution-based trigger signals)
- `packages/engine/src/agents/policy-preview-inner-deepening.ts` (modify — widen `allRequestedRefsDepthCapped` predicate and repair `allReadyValuesUniform` to consume contribution-based trigger signals)
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify — export canonical `lookupRefKey` so preview usage/deepening and runtime evaluation share the same projected-lookup ref id)
- `packages/engine/test/architecture/lookup-refs-projected/projected-lookup-deepening-fixture.ts` (new helper fixture for the Phase 4 trigger witnesses)
- `packages/engine/test/architecture/lookup-refs-projected/projected-lookup-deepening-trigger-depthcap.test.ts` (new — Spec §8.3 #12)
- `packages/engine/test/architecture/lookup-refs-projected/projected-lookup-deepening-trigger-uniform.test.ts` (new — Spec §8.3 #13)

## Out of Scope

- New cap class introduction — Spec §3 forbids.
- New trigger semantics beyond Spec 164/165 §4.8 — this ticket repairs live code back to the documented post-expression contribution semantics, but does not introduce a different trigger rule.
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

1. **Ref-set widening and documented trigger semantics**: `allRequestedRefsDepthCapped` covers `previewOptionRef`s AND `lookup.surface: 'previewOptionState'` refs; `allReadyValuesUniform` operates on post-expression numeric contribution.
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

## Outcome

Completed on 2026-05-11:

- Landed the user-approved Foundation #15/#20 boundary reset: `allReadyValuesUniform` now evaluates preview-derived microturn consideration contributions after expression evaluation instead of comparing raw ref values.
- Widened the preview-derived requested-ref set to include `lookup.surface: previewOptionState` refs, using the same canonical `lookupRefKey` string as runtime evaluation.
- Added the two Phase 4 architectural witnesses plus a small projected-lookup deepening fixture. The depth-cap witness proves projected lookups trigger a deep pass after broad `depthCap`; the uniform witness proves post-expression uniform projected-lookup contributions trigger deepening and keep the selected trace reason honest as `tiebreakAfterPreviewNoSignal`.
- Generated/schema fallout: none expected; this ticket changes policy-agent preview/deepening behavior and architecture tests only.
- Deferred scope remains unchanged: cookbook/e2e fixture ticket `165PROSTALOO-006`, optional FITL ARVN profile-quality witness, and observer-purity hardening remain out of scope.
- Source-size ledger: `packages/engine/src/agents/policy-agent-inner-preview.ts | 292 before | 519 after | crossed cap? no | active growth: projected-lookup signal collection and contribution summaries | extraction/defer rationale: still below 600-line near-cap threshold and cohesive with preview usage/deepening orchestration | successor: none`; `packages/engine/src/agents/policy-preview-inner-deepening.ts | 185 before | 223 after | crossed cap? no | active growth: trigger signal consumption | extraction/defer rationale: below guidance | successor: none`.
- Final command ledger:
  - `pnpm -F @ludoforge/engine build` — passed as intermediate build for compiled tests.
  - `node --test packages/engine/dist/test/architecture/lookup-refs-projected/projected-lookup-deepening-*.test.js` — passed as focused witness.
  - `node --test packages/engine/dist/test/architecture/preview-deepening/*.test.js packages/engine/dist/test/architecture/lookup-refs-projected/*.test.js` — passed as adjacent Spec 164 + Spec 165 architecture regression lane.
  - `pnpm turbo build` — passed.
  - `node --test packages/engine/dist/test/architecture/lookup-refs-projected/projected-lookup-deepening-*.test.js` — rerun after root build, passed.
  - `pnpm -F @ludoforge/engine test` — passed, default lane summary `65/65 files passed`.
  - `pnpm turbo typecheck` — passed.
  - `pnpm turbo lint` — passed.
  - `pnpm run check:ticket-deps` — passed after one archived-ticket metadata repair; final output: `Ticket dependency integrity check passed for 2 active tickets and 2300 archived tickets.`
- Archived-ticket hygiene repair: `archive/tickets/165PROSTALOO-002.md` received the required `Outcome amended: 2026-05-11` marker for a pre-existing post-completion archived-ticket edit surfaced by `check:ticket-deps`. This was clerical graph hygiene and did not change active scope, acceptance criteria, command semantics, code, tests, or proof claims.
- Late-edit proof validity: after the first final proof set, a narrow code review adjustment kept chooseOne preview-usage reporting on the pre-existing `preview.option.*` requested-ref set because chooseOne does not participate in continued deepening. The affected final proof lanes were rerun afterward: `pnpm turbo build`, the focused projected-lookup deepening compiled tests, `pnpm -F @ludoforge/engine test`, `pnpm turbo typecheck`, `pnpm turbo lint`, and `pnpm run check:ticket-deps` all passed.
