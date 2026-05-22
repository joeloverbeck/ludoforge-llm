# 191PLAROLSEM-002: Step-match field validation + use (`decisionPath`/`targetKind`/`stageIndex`) + FITL profile corrections

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `agents` (plan-controller step matching), `cnl` (plan-template validator); `data/games/fire-in-the-lake` (corrective profile fixes)
**Deps**: `specs/191-plan-role-semantic-integrity.md`

## Problem

`CompiledPlanStepMatch` (`packages/engine/src/kernel/types-core.ts:1227–1233`) carries `decisionKind`, `targetKind` (required), `decisionPath` (required), `actionTag?`, `stageIndex?`. But `decisionMatchesStep` (`packages/engine/src/agents/plan-controller.ts:75–107`) reads only `decisionKind`, `actionTag`, and the selected value — it never reads `decisionPath`, `targetKind`, or `stageIndex`. These fields are compiled and authored at scale but unenforced: a step matches any frontier with the right kind/tag rather than the *intended* frontier position. Spec 191 §4.2.

Because `decisionPath`/`targetKind` are required and the FITL profile authors them heavily (48 + 48 occurrences, plus 4 `stageIndex`), enforcing them is behaviour-affecting and may surface authored values that don't validate — those corrections land here (Foundation #14, same change), not deferred.

## Assumption Reassessment (2026-05-22)

1. `decisionMatchesStep` ignores `step.match.decisionPath`/`targetKind`/`stageIndex` (`plan-controller.ts:75–107`) — verified this session.
2. `decisionPath` and `targetKind` are **required** fields on `CompiledPlanStepMatch`; `actionTag` and `stageIndex` are optional (`kernel/types-core.ts:1227–1233`) — verified this session. So the "absent field = wildcard" back-compat applies only to `actionTag`/`stageIndex`; the required fields are always enforced once consumed.
3. `data/games/fire-in-the-lake/92-agents.md` authors `decisionPath`×48, `targetKind`×48, `stageIndex`×4 (verified 2026-05-22), all currently dead metadata. Enforcement makes them load-bearing.

## Architecture Check

1. Validating `decisionPath`/`targetKind`/`stageIndex` against the compiled decision-surface metadata at compile time (Foundation #12) plus consuming them at runtime closes the gap on both sides — authored intent becomes enforced contract, not narration.
2. Generic: validation keys on decision-surface paths and target kinds the engine already defines; no FITL identifiers enter the engine (Foundation #1). The 48/48/4 corrections live in `data/games/`, not engine code (Foundation #2).
3. No shim: previously-dead fields are enforced (and failing authored values corrected in the same change), not left ignored (Foundation #14).

## What to Change

### 1. Compile-time validation of step-match fields

In `validate-agent-plan-templates.ts`, for each step: validate `decisionPath` resolves to a declared decision-surface path, `targetKind` is a known kind compatible with the step's role-selector result type, and `stageIndex` (when present) is within the template's declared stage range. Emit role/step-named diagnostics on mismatch.

### 2. Runtime consumption in `decisionMatchesStep`

Extend `decisionMatchesStep` (`plan-controller.ts`) to additionally require `decisionPath`/`targetKind`/`stageIndex` to correspond to the current decision. `decisionPath`/`targetKind` are always present → always checked; an omitted optional `stageIndex`/`actionTag` remains a wildcard.

### 3. Corrective FITL profile fixes

Run the new validation against `data/games/fire-in-the-lake/92-agents.md`; fix any authored `decisionPath`/`targetKind`/`stageIndex` value that fails (or whose runtime correspondence breaks plan matching) so the profile compiles and its plan tails still execute. **Effort note**: rises to Large if a substantial fraction of the 100 authored values need correction; most are expected to be correct since authors intended them.

## Files to Touch

- `packages/engine/src/agents/plan-controller.ts` (modify — `decisionMatchesStep`)
- `packages/engine/src/cnl/validate-agent-plan-templates.ts` (modify — step-field validation)
- `data/games/fire-in-the-lake/92-agents.md` (modify — corrections to any of the 48 `decisionPath` / 48 `targetKind` / 4 `stageIndex` authored values that fail the new validation; exact set determined when validation is implemented)
- `packages/engine/test/unit/cnl/agent-plan-template-validate.test.ts` (modify — bad path/kind/stage diagnostics)
- `packages/engine/test/architecture/plan-controller-legality-frontier.test.ts` (modify — or sibling — step-match correspondence invariant)

## Out of Scope

- Role-constraint registry (191PLAROLSEM-001) and compound validation (191PLAROLSEM-003) — separate phases. Note: this ticket shares `validate-agent-plan-templates.ts` with both; serialize implementation to avoid merge friction.
- Adding new selector sources or target kinds — spec §2 Non-Goals.

## Acceptance Criteria

### Tests That Must Pass

1. A step with a non-resolving `decisionPath`, an incompatible `targetKind`, or an out-of-range `stageIndex` fails compilation with a role/step-named diagnostic.
2. `decisionMatchesStep` matches only the intended frontier position when the fields are present; steps omitting `actionTag`/`stageIndex` match as before.
3. The FITL profile compiles and its existing plan witnesses (e.g., ARVN Train→Govern) still pass after corrections.
4. Existing suite: `pnpm -F @ludoforge/engine test:all`.

### Invariants

1. Every required step-match field (`decisionPath`, `targetKind`) is validated at compile time and enforced at runtime — none compiled-but-ignored.
2. No FITL profile authored step-match value is left failing the new validation (Foundation #14).
3. Determinism: compile-twice byte-identity preserved; plan traces replay-identical.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cnl/agent-plan-template-validate.test.ts` — bad `decisionPath`/`targetKind`/`stageIndex` rejection.
2. `packages/engine/test/architecture/plan-controller-legality-frontier.test.ts` (or new `plan-controller-step-match-correspondence.test.ts`) — step matches intended frontier position; field-absent wildcard preserved.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test dist/test/unit/cnl/agent-plan-template-validate.test.js dist/test/architecture/plan-controller-legality-frontier.test.js`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`

## Outcome

Completed on 2026-05-23.

What changed:
- Added compile-time step-match validation in `packages/engine/src/cnl/validate-agent-plan-templates.ts` for selector-compatible `targetKind` and declared decision surfaces keyed by `decisionKind`, `decisionPath`, `targetKind`, optional `actionTag`, and optional `stageIndex`.
- Threaded decision-surface metadata through runtime choice contexts: choose-one/choose-N contexts now publish `targetKinds`, and pipeline choices publish their originating `stageIndex`.
- Updated `packages/engine/src/agents/plan-controller.ts` so exact and reselected plan steps require the current decision context to match `decisionPath`, `targetKind`, and optional `stageIndex` before selecting a role value.
- Corrected FITL plan-template metadata in `data/games/fire-in-the-lake/92-agents.md` where validation exposed stale or impossible authored matches (`air-lift`, `air-strike`, and removed unreachable second-assault steps).
- Refreshed schema artifacts and FITL preview golden fixtures whose trajectory changed because plan metadata is now active during policy-guided preview completion.

Deviations:
- `decisionPath` was validated and consumed as the microturn decision key / bind name, not as the kernel `CompoundDecisionPath` placement field. That is the live contract used by existing authored plan-template matches.
- `stageIndex` validation is implemented by matching declared decision surfaces rather than separately computing a template-local stage range. This catches out-of-range authored stages because no declared choice surface exists at that stage.
- Full root `pnpm turbo build/test/lint/typecheck` was not rerun; the package-local engine build and full engine `test:all` lane were run instead, which is the directly affected proof surface for this ticket.

Verification:
- `pnpm -F @ludoforge/engine build` — passed.
- `node --test dist/test/unit/cnl/agent-plan-template-validate.test.js dist/test/architecture/plan-controller-legality-frontier.test.js dist/test/integration/parse-validate-full-spec.test.js dist/test/unit/cnl/agent-plan-template-compile.test.js dist/test/unit/cnl/agent-posture-evaluator-compile.test.js dist/test/unit/schema-artifacts-sync.test.js` — passed (24 tests, 0 failures).
- `node --test dist/test/integration/policy-preview-inner-choosenstep-fitl-canary-golden.test.js` — passed after updating the canary decision index from 315 to 314 for the new trajectory.
- `node --test dist/test/architecture/policy-preview-inner-outcome-parity.test.js` — passed after reblessing the Spec 178 parity fixtures for newly plan-guided preview completions.
- `pnpm -F @ludoforge/engine test:all` — passed (959 tests, 0 failures).
- `pnpm -F @ludoforge/engine run schema:artifacts:check` — passed.
- `git diff --check` — passed.
- `pnpm run check:ticket-deps` — passed.

Source-size ledger:
- `packages/engine/src/cnl/validate-agent-plan-templates.ts`: 520 lines after; remains under 800.
- `packages/engine/src/agents/plan-controller.ts`: 222 lines after; remains under 800.
- `packages/engine/src/kernel/microturn/types.ts`: 405 lines after; remains under 800.
- `packages/engine/src/kernel/microturn/publish.ts`, `packages/engine/src/kernel/legal-choices.ts`, `packages/engine/src/kernel/types-core.ts`, `packages/engine/src/kernel/schemas-core.ts`, and `packages/engine/src/agents/policy-agent.ts` were already large shared files; this change added only narrow metadata threading at existing seams.
