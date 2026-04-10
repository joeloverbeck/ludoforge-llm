# 123BATREDENU-001: Verify whether the forEach-embedded redeploy probing gap still exists

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None
**Deps**: None

## Problem

Spec 123 originally assumed `enumerateLegalMoves` still dropped parameterless actions whose effects contain `forEach` loops with embedded `chooseOne`/`chooseN` decisions. Before landing any engine or FITL migration work, this ticket verifies whether that gap still exists on the current codebase.

## Assumption Reassessment (2026-04-10)

1. The active ticket and sibling series are untracked drafts; they still define the session boundary, but their bug claim required live verification before implementation.
2. The parameterless-action non-pipeline path still routes through `enumerateParams` and `resolveMoveDecisionSequence` into `legalChoicesDiscover` — confirmed by code inspection in `packages/engine/src/kernel/legal-moves.ts` and `packages/engine/src/kernel/move-decision-sequence.ts`.
3. `probeMoveViability` still exposes pending decisions through `nextDecision`/`nextDecisionSet`; it does not expose raw discovery internals directly — confirmed in `packages/engine/src/kernel/apply-move.ts`.
4. The broader bug claim is **not reproducible** on current `main`.

## Evidence Classification

- **Incidence verified**: No
- **Mechanism verified**: No

The original draft claimed both a generic parameterless `forEach` probing failure and a FITL-specific redeploy enumeration failure. Neither held under current live verification.

## Verification Performed

1. Built the engine successfully:
   - `pnpm -F @ludoforge/engine build`
2. Authored and ran a synthetic built test for a parameterless action with `forEach` + embedded `chooseOne`:
   - `node packages/engine/dist/test/unit/kernel/probe-foreach-decision.test.js`
   - Result: the live engine returned a pending `chooseOne` decision instead of false-completing; the draft ticket's synthetic failure premise was stale.
3. Authored and ran a FITL-shaped built test using a parameterless batch redeploy action added to the compiled production GameDef:
   - `node packages/engine/dist/test/integration/fitl-probe-foreach-redeploy.test.js`
   - Result: the parameterless redeploy action appeared in `enumerateLegalMoves`; the FITL-specific omission claim was stale.
4. Removed the exploratory test files after verification so the repository diff returned to the pre-existing draft/spec state.

## Outcome

Completed: 2026-04-10

The claimed probing/enumeration gap is not currently live. No production code or durable tests were added because doing so would have embedded a false regression into the repository.

This ticket is therefore complete as an investigation/proof ticket:
- it corrected the series boundary from "known live bug" to "non-repro on current main"
- it recorded the decisive commands and outcomes
- it established that downstream fix/migration tickets in this draft series are blocked on a new, verified live problem statement

## Files Touched

- `tickets/123BATREDENU-001.md`

No engine, FITL YAML, or test-suite files were changed in the final repo state.

## Out of Scope

- Reintroducing exploratory proof tests into the repository after the live non-repro
- Engine fixes for a non-verified bug
- FITL redeploy YAML migration based on the stale premise that parameterless redeploy still fails enumeration

## Acceptance Criteria

1. The draft series records whether the bug still exists on current `main`
2. Verification evidence is captured directly in the active ticket
3. No misleading RED tests or stale fix work remain in the repo

## Test Plan

### Commands Run

1. `pnpm -F @ludoforge/engine build`
2. `node packages/engine/dist/test/unit/kernel/probe-foreach-decision.test.js`
3. `node packages/engine/dist/test/integration/fitl-probe-foreach-redeploy.test.js`

## Follow-Up

If Spec 123 still needs work, the next ticket should start from a newly verified live failure surface rather than from the stale probing-gap premise captured in the original draft.
