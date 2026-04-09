# ARCHINVEST-002: Investigate decision resolution test helper drift

**Status**: COMPLETED
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — investigation only
**Deps**: None

## Problem

The test helper `decision-param-helpers.ts` reimplements a decision resolution loop using `completeMoveDecisionSequence`. This could indicate the kernel's public API is insufficient for common test patterns, or it could be acceptable test ergonomics (a thin wrapper with no behavioral drift).

**Source**: `reports/architectural-abstractions-2026-04-09-fitl-events-1968-nva.md` — Needs Investigation item B.

## Assumption Reassessment (2026-04-09)

1. The live helper in [packages/engine/test/helpers/decision-param-helpers.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/helpers/decision-param-helpers.ts) does not replace kernel choice discovery or legality. It delegates probing to `completeMoveDecisionSequence`, uses `resolveMoveDecisionSequence` only for targeted viability checks, and calls `applyMove` for final validation.
2. The live kernel surface in [packages/engine/src/kernel/move-decision-sequence.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/move-decision-sequence.ts) remains the authoritative protocol for pending-decision discovery, illegal/complete classification, and compound-special-activity parameter routing. The helper builds test inputs around that protocol rather than reimplementing it.
3. The original ticket premise overstated the risk of “drift.” The helper does add substantial convenience behavior, but the added behavior is test-facing normalization: matching by bind name, applying override rules, stripping stochastic-only bindings when safe, preserving unresolved compound-SA legality for `applyMove`, and surfacing unsupported input keys early. Those are ergonomic adapters around the kernel protocol, not a second decision-resolution algorithm.

## Architecture Check

1. Closing this as acceptable test ergonomics is cleaner than exposing a broader kernel public API without evidence that production callers need it. The helper’s behavior is FITL-test-oriented and would widen the runtime API for a test concern.
2. The boundary stays Foundation-compliant: the kernel still owns legality and decision sequencing, while tests own convenience layers for authored scenario assertions.
3. No compatibility shims, alias paths, or partial migrations are needed because no engine or test-helper contract changes are required.

## Investigation Steps

### 1. Read the test helper implementation

- `normalizeDecisionParamsForMoveInternal(...)` drives `completeMoveDecisionSequence(...)` with a `choose` callback derived from explicit move params, name-based lookup, override rules, and deterministic fallback.
- `applyMoveWithResolvedDecisionIds(...)` then applies the normalized move, with special handling for compound special activities so `applyMove` still owns compound legality diagnostics.
- This is more than a one-line wrapper, but it is not a competing protocol: the helper never discovers legal choices itself and never bypasses kernel legality.

### 2. Check usage breadth

```bash
grep -r "applyMoveWithResolvedDecisionIds" packages/engine/test/ --include="*.ts" -l
```

Usage breadth today is high: 102 test files under `packages/engine/test/` reference `applyMoveWithResolvedDecisionIds`. That shows the helper is valuable, but because every use site is test-only, the evidence supports a shared test harness need rather than a missing production API.

### 3. Check for behavioral divergence

- The kernel remains authoritative for:
  - decision discovery and sequencing (`resolveMoveDecisionSequence`)
  - stochastic pending classification (`completeMoveDecisionSequence`)
  - compound special-activity decision-path routing
  - final move legality (`applyMove`)
- The helper adds test-owned behavior on top:
  - resolve by `request.name` as well as `decisionKey`
  - inject override rules for authored assertions
  - early error on unsupported user-supplied input keys
  - strip stochastic-only `$...` bindings when the kernel confirms the stripped move remains viable
  - preserve incomplete compound SA params so `applyMove` emits the canonical structural error
- Git history shows these helper behaviors changed alongside kernel protocol evolution, but not as independent bug fixes to choice discovery. The helper tracks kernel changes rather than drifting away from them.

### 4. Determine outcome

- Verdict: acceptable test ergonomics; no action needed.
- Follow-up ticket: not needed. The evidence does not justify widening the kernel public API for a test-only convenience layer.

## Files to Touch

- `packages/engine/test/helpers/decision-param-helpers.ts` (read only)
- `packages/engine/src/kernel/move-decision-sequence.ts` (read only)

## Out of Scope

- Modifying the kernel's decision resolution API (follow-up if gap confirmed)
- Changing existing test patterns

## Acceptance Criteria

### Tests That Must Pass

1. No runtime or test command changes required; this is a read-only investigation.

### Invariants

1. No code changes made during investigation.
2. The ticket and source report record a concrete verdict backed by live helper/kernel inspection and usage/history review.

## Test Plan

### Commands

1. `grep -r "applyMoveWithResolvedDecisionIds" packages/engine/test/ --include="*.ts" -l`
2. `git log --since="6 months ago" --oneline -- packages/engine/test/helpers/decision-param-helpers.ts packages/engine/src/kernel/move-decision-sequence.ts`
3. `pnpm run check:ticket-deps`

## Outcome

Completed: 2026-04-09

Investigation confirmed that `decision-param-helpers.ts` is a shared test adapter over the kernel decision protocol, not a divergent second implementation. The helper is widely used and carries meaningful convenience logic, but that logic remains test-owned and delegates authoritative sequencing and legality to the kernel, so no follow-up API ticket was created.
