# 182STRSTRPOL-004: Phase 2 — FITL strategic module conformance test

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — `data/games/fire-in-the-lake/92-agents.md` (add minimal conformance module), strategy-module profile-use contract/schema support, `packages/engine/src/agents/policy-eval.ts` (trace visibility repair), `packages/engine/test/policy-profile-quality/probes/fire-in-the-lake/` (new probe)
**Deps**: `archive/tickets/182STRSTRPOL-003.md`

## Problem

Spec 182 Phase 2 acceptance (b) requires "one module bound to a Spec 181 selector for FITL" as conformance proof that the strategic-modules layer integrates with the existing selector substrate. The existing FITL profile (`data/games/fire-in-the-lake/92-agents.md`) already declares one selector — `arvnMicroturnOptionProjectedMargin` (lines 207-228). This ticket adds one minimal strategic module bound to that selector and a probe asserting the module activates and contributes score correctly. Module evaluation overhead must stay within Spec 181 §8 Phase 0 acceptance (e) per-probe budget (< 200 ms).

## Assumption Reassessment (2026-05-18)

1. `data/games/fire-in-the-lake/92-agents.md` declares `arvnMicroturnOptionProjectedMargin` selector (lines 207-228) bound to `microturnOptions` source — confirmed during reassessment.
2. The probe harness at `packages/engine/test/policy-profile-quality/probes/` accepts new probe files; pattern established by Spec 181 tickets.
3. Spec 181's ARVN action-distribution probe (`archive/tickets/181STRSTRPOL-003.md`, file `arvn-action-distribution.probe.ts`) is the conformance precedent for FITL probes.
4. The ARVN action-distribution probe's current calibration (per archived 181STRSTRPOL-003 Outcome) is `aggregateOutcome: { kind: "pass" }` — this conformance test must not regress that.
5. Boundary reset approved on 2026-05-18: live FITL profile data has no reusable `strategicConditions` / `condition.*` entry to bind without widening this ticket. To preserve the Phase 2 conformance goal and the explicit "no net-new conditions" boundary, the module uses the live-supported boolean literal `when: true`; activation is still constrained to microturn scope by `applies.scopes`.
6. Boundary reset approved on 2026-05-18: focused proof showed pruning invalidated the strategy-module evaluation cache before trace assembly, so a profile-plan module that is not also read by a downstream consideration produced no `modules.active` trace entry. This ticket owns the minimal runtime trace repair because the conformance probe's acceptance surface explicitly requires module activation/contribution to be trace-visible.
7. Boundary reset approved on 2026-05-18: the conformance probe is intentionally modeled on `arvn-action-distribution.probe.ts`, which observes root `actionSelection` decisions. A microturn-only module cannot be active in that trace surface, so the minimal conformance module applies to both `move` and `microturn` scopes while still binding only the existing selector. Because the selector's microturn-option quality is zero at the root action-selection surface, the module includes a uniform `value: 1` activation term so the trace can prove nonzero contribution without changing action ordering.

## Architecture Check

1. The conformance module lives in YAML game data, not engine code (Foundation #1, #2).
2. The probe is data — under `packages/engine/test/policy-profile-quality/probes/fire-in-the-lake/` because it's game-specific; the runner that drives it is game-agnostic.
3. Property-form assertions only (e.g., "module activates on N% of decisions matching condition X"), not exact-action witnesses, per Spec 181 §4 anti-overfit guidance.
4. Severity `profileQuality`: failure emits `POLICY_PROFILE_QUALITY_REGRESSION`, not a determinism failure.

## What to Change

### 1. Minimal conformance module in FITL profile

Add a small `strategyModules` entry to `data/games/fire-in-the-lake/92-agents.md` (locate insertion point during implementation; convention is alphabetical or alongside related considerations). Suggested shape:

```yaml
strategyModules:
  arvnPursueProjectedMargin:
    traceLabel: "ARVN pursue projected margin"
    when: true
    applies:
      scopes: [move, microturn]
    priority:
      tier: 20
    selectors:
      - role: primaryTarget
        selectorId: arvnMicroturnOptionProjectedMargin
    scoreGroups:
      - id: targetQuality
        summary: sum
        terms:
          - weight: 1
            value: 1
          - weight: 10
            value: { ref: selector.arvnMicroturnOptionProjectedMargin.current.quality }
    guardrailIds: []
    fallback:
      ifInactive: noContribution
      ifSelectorEmpty: noContribution
```

Bind the existing selector; do NOT introduce new selectors or conditions here — that's outside Phase 2 scope.

### 2. Conformance probe

Create `packages/engine/test/policy-profile-quality/probes/fire-in-the-lake/arvn-module-activation.probe.ts` modeled on `arvn-action-distribution.probe.ts`. Assert:
- Module `arvnPursueProjectedMargin` activates on a measurable fraction of ARVN microturn decisions (`module.<id>.active === true`).
- When active, contribution is non-zero.
- Trace contains the `modules.active` entry with correct `traceLabel`.

### 3. Spec 181 ARVN action-distribution probe non-regression

Re-run `archive/tickets/181STRSTRPOL-003.md`'s probe (`arvn-action-distribution.probe.ts`) and confirm `aggregateOutcome: { kind: "pass" }` is preserved or improved. Document the post-module distribution in the new probe's calibration comment.

## Files to Touch

- `data/games/fire-in-the-lake/92-agents.md` (modify — add minimal `strategyModules` entry)
- `packages/engine/src/agents/policy-eval.ts` (modify — keep planned strategy-module trace visible after pruning invalidates candidate-dependent caches)
- `packages/engine/src/cnl/compile-agents.ts` (modify — lower profile `use.strategyModules` when authored)
- `packages/engine/src/cnl/game-spec-doc.ts` (modify — authoring type for profile `use.strategyModules`)
- `packages/engine/src/contracts/policy-contract.ts` (modify — allow profile `use.strategyModules` and map it to the library bucket)
- `packages/engine/src/kernel/schemas-core.ts` / `packages/engine/src/kernel/types-core.ts` / `packages/engine/schemas/GameDef.schema.json` (modify — compiled profile schema/type artifact)
- `packages/engine/test/helpers/gamedef-cache.ts` (modify — invalidate persistent production-spec cache when validator/contract code changes)
- `packages/engine/test/unit/agents/strategy-module-dispatch-order.test.ts` (modify — regression for pruning + trace visibility)
- `packages/engine/test/policy-profile-quality/probes/assertions/module-active-contribution-rate-at-least.ts` (new — aggregate assertion helper)
- `packages/engine/test/policy-profile-quality/probes/fire-in-the-lake/arvn-module-activation.probe.ts` (new)
- `packages/engine/test/policy-profile-quality/probes/fire-in-the-lake.probes.test.ts` (modify only if probe-file registration is explicit, not automatic; check 181STRSTRPOL-003 outcome for guidance)
- `packages/engine/test/fixtures/spec-144-probe-recovery/seed-1001-nva-march-dead-end/` (modify — refresh generated profile-quality witness after intentional FITL GameDef/profile trajectory shift)

## Out of Scope

- ARVN `build-political-engine` module (ticket 005 owns net-new authoring + cookbook).
- Texas Hold'em conformance — spec §2 notes Texas Hold'em selector adoption is a Spec 181 follow-on, not a Spec 182 deliverable.
- Profile-quality lint warnings (ticket 012 owns `RARELY_SAFE` + `FIRES_UNIFORM`).

## Acceptance Criteria

### Tests That Must Pass

1. New `arvn-module-activation.probe.ts` runs to completion and produces a deterministic outcome (`pass` or `POLICY_PROFILE_QUALITY_REGRESSION` — either is acceptable as a baseline signal).
2. Existing `arvn-action-distribution.probe.ts` continues to pass or improve.
3. Per-probe overhead < 200 ms (Spec 181 §8 Phase 0 acceptance (e); validated by the existing budget gate at 181STRSTRPOL-005).
4. `pnpm turbo test`.

### Invariants

1. Property-form assertions only — no exact-action witnesses.
2. New module's `selectorId` references the existing `arvnMicroturnOptionProjectedMargin` — no net-new selectors introduced (Foundation #2 — YAML-authorable, but scope of this ticket is one module only).
3. Severity `profileQuality`; does NOT block CI on failure.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/policy-profile-quality/probes/fire-in-the-lake/arvn-module-activation.probe.ts` — single conformance probe asserting module activation + contribution + trace shape.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/policy-profile-quality/probes/fire-in-the-lake.probes.test.js`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`

## Outcome

Completed: 2026-05-18

What changed:

1. Added the FITL `arvnPursueProjectedMargin` strategic module to `arvn-evolved`, bound to the existing `arvnMicroturnOptionProjectedMargin` selector with no new selectors or strategic conditions.
2. Extended the profile `use` contract so authored `use.strategyModules` validates, lowers, compiles, and serializes through the existing strategy-module library bucket; regenerated `GameDef.schema.json`.
3. Repaired module trace visibility after pruning invalidates candidate-dependent caches by re-evaluating planned modules for the surviving candidate set before trace assembly.
4. Added `moduleActiveContributionRateAtLeast` to the policy-profile-quality assertion harness, registered the new FITL `arvn-module-activation` probe, and kept the existing ARVN action-distribution probe in the same file.
5. Fixed production GameDef cache invalidation so cached validator diagnostics are invalidated when `validate-agents.js` or `policy-contract.js` changes, not only when `staged-pipeline.js` changes.
6. Refreshed the generated Spec 144 seed-1001 NVA march quality witness after the intentional FITL GameDef/profile trajectory shift; the witness still terminates and replays deterministically.

Deviations from original plan:

1. The live FITL data did not contain a reusable `condition.*`/`strategicConditions` entry, so the approved implementation uses `when: true` instead of inventing a new condition.
2. The root `actionSelection` probe surface required the module to apply at both `move` and `microturn` scope, and the existing selector's root-surface quality was zero, so the module includes a uniform `value: 1` activation term to prove nonzero trace contribution without changing action ordering.
3. The conformance proof exposed shared runtime/contract gaps (`use.strategyModules` validation/lowering and trace survival after pruning), so this ticket owns those minimal shared fixes.
4. Source-size decision: several pre-existing source files are over 800 lines and received narrow glue/contract edits rather than extraction because the changes belong to existing public contract or compiler dispatch surfaces:
   - `packages/engine/src/agents/policy-eval.ts` | 1666 lines after | +10 active lines | pre-existing over 800 | retained planned-module trace repair at the existing evaluation/pruning boundary.
   - `packages/engine/src/cnl/compile-agents.ts` | 5398 lines after | +3 active lines | pre-existing over 800 | retained profile-use lowering with the existing profile compiler.
   - `packages/engine/src/cnl/game-spec-doc.ts` | 958 lines after | +1 active line | pre-existing over 800 | retained authoring type beside the existing profile-use contract.
   - `packages/engine/src/kernel/schemas-core.ts` | 2994 lines after | +1 active line | pre-existing over 800 | retained generated schema-source mirror beside existing compiled-profile schema.
   - `packages/engine/src/kernel/types-core.ts` | 2591 lines after | +1 active line | pre-existing over 800 | retained compiled profile type beside the existing compiled-profile contract.

Verification:

1. `pnpm -F @ludoforge/engine build` - passed.
2. `node --test packages/engine/dist/test/unit/agents/strategy-module-dispatch-order.test.js` - passed, 4 tests.
3. `node --test packages/engine/dist/test/unit/helpers/gamedef-cache.test.js` - passed, 8 tests.
4. `node --test packages/engine/dist/test/integration/fitl-production-data-compilation.test.js` - passed, 3 tests.
5. `node --test packages/engine/dist/test/policy-profile-quality/probes/fire-in-the-lake.probes.test.js` - passed, including `arvn-action-distribution-not-dominated` and `arvn-module-activation`.
6. `node --test packages/engine/dist/test/unit/compile-agents-authoring.test.js` - passed, 56 tests.
7. `pnpm -F @ludoforge/engine run schema:artifacts` - regenerated `GameDef.schema.json`.
8. `pnpm turbo test` - passed; engine default lane reported 92/92 files passed, runner reported 205 files / 2019 tests passed.
9. `pnpm turbo lint` - passed.
10. `pnpm turbo typecheck` - passed.
11. `pnpm -F @ludoforge/engine test:policy-profile-quality` - passed, 30/30 files.
