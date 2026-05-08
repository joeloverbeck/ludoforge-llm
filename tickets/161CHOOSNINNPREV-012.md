# 161CHOOSNINNPREV-012: Cookbook `chooseNStep` per-option preview worked example

**Status**: PENDING
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — docs only
**Deps**: `archive/tickets/161CHOOSNINNPREV-004.md`

## Problem

`docs/agent-dsl-cookbook.md` documents `preview.inner.chooseOne: true` with a worked example for the `preferOptionProjectedMargin` consideration but presents `chooseNStep` as if it works the same way — a documentation accuracy issue while Spec 161 was unimplemented. After Ticket 004 wires up the chooseNStep dispatch, the cookbook should add a parallel worked example so authors see explicit usage at chooseNStep microturns and learn that the same microturn-scope consideration differentiates options at both decision kinds.

## Assumption Reassessment (2026-05-07)

1. `docs/agent-dsl-cookbook.md` exists.
2. The cookbook's existing chooseOne worked example uses `preferOptionProjectedMargin` referencing `preview.option.delta.victory.currentMargin.self`. The chooseNStep worked example reuses the same consideration name — emphasizing uniformity (F#19).
3. CONFIRM is not a per-option-scored option in the chooseN microturn evaluator (the `min`/`max` cardinality of the chooseN drives the set-completion logic). The cookbook must state this explicitly so authors don't write CONFIRM-targeted considerations expecting per-option scoring.

## Architecture Check

1. Documentation faithfully reflects runtime behavior — no false promises. F#15 honored (architectural completeness extends to authored documentation).
2. F#19 — the cookbook reinforces the per-published-decision uniformity by showing the same consideration applied uniformly across decision kinds.
3. F#1 — cookbook examples use engine-generic ref names; no game-specific identifiers in the example.

## What to Change

### 1. Add a chooseNStep worked example — `docs/agent-dsl-cookbook.md`

Insert a new subsection (or extend the existing `preview.inner` section) with:

- A profile snippet showing `preview.inner.chooseNStep: true` (alongside or as an alternative to `chooseOne: true`).
- The same `preferOptionProjectedMargin` consideration with microturn scope referencing `preview.option.delta.victory.currentMargin.self`.
- A short narrative noting that the same microturn-scope consideration now differentiates options at both `chooseOne` and `chooseNStep` microturns.
- An explicit note: "CONFIRM is not a per-option-scored option in chooseN microturns; the `min`/`max` cardinality of the chooseN drives the set-completion logic. Considerations should target ADD options, not CONFIRM."
- A reference to the cost-formula difference: `chooseNStep: true` uses the squared-cost validation `maxOptions × (1 + chooseNBeamWidth × maxOptions × max(0, depthCap − 1))` rather than the triple product.

### 2. Verify cross-references

If the cookbook references a specific spec or ticket for `preview.inner.chooseOne`, add an analogous reference to Spec 161 for `chooseNStep`.

## Files to Touch

- `docs/agent-dsl-cookbook.md` (modify — add chooseNStep worked example)

## Out of Scope

- Source-code changes — none.
- Updates to other docs (e.g., `docs/architecture.md`, `docs/FOUNDATIONS.md`) — out of scope unless they currently misrepresent the chooseNStep behavior.
- Manual ARVN harness validation — Ticket 013.

## Acceptance Criteria

### Tests That Must Pass

1. Existing engine suite: `pnpm -F @ludoforge/engine test` (smoke check; no doc tests but ensures no incidental breakage).
2. Manual review: an author following the cookbook example can author a chooseNStep profile that produces non-`disabled` `previewUsage` and option differentiation.

### Invariants

1. The cookbook's chooseNStep example matches the runtime behavior delivered by Tickets 002–004 (no false promises).

## Test Plan

### New/Modified Tests

None — documentation-only.

### Commands

1. Manual review of `docs/agent-dsl-cookbook.md` — confirm worked example is complete, accurate, and reuses the existing `preferOptionProjectedMargin` consideration.
2. `pnpm turbo lint` (verify no markdown-lint or doc-lint regressions).
3. `pnpm -F @ludoforge/engine test`.
