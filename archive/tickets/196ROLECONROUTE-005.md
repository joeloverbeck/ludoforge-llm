# 196ROLECONROUTE-005: P4B — Generic control-preservation constraint semantics for FITL ARVN Transport

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — concrete generic control-preservation constraint semantics on top of the post-state role-constraint substrate, plus FITL profile migration and witnesses
**Deps**: `archive/tickets/196ROLECONROUTE-005A.md`, `archive/tickets/196ROLECONROUTE-005B.md`

## Problem

`196ROLECONROUTE-004` was narrowed after a Foundations reassessment on 2026-05-26. The original P4 draft tried to express "ARVN Transport origin must preserve population control" with `locatedIn: { role: role.transportOrigin, container: zone.arvnControlledPopulationCenter }`, but the live `locatedIn` contract only compares a role binding's current zone to a literal zone id or another role binding's zone. `zone.arvnControlledPopulationCenter` would be a fake zone id, and a guardrail demote cannot truthfully stand in for admissibility.

This ticket adds the missing generic constraint semantics needed to express origin-control preservation without game-specific engine logic, then migrates the FITL ARVN Transport template so origin-control-losing bindings are rejected by role-constraint admissibility rather than merely demoted by `arvn.doNotLoseOriginControlByTransport`.

## Assumption Reassessment (2026-05-26)

1. `packages/engine/src/agents/plan-role-constraint-eval.ts` currently supports `locatedIn`, `distinctOriginDestination`, `reachable`, and `adjacent`; `locatedIn` only supports literal zone ids and role-bound zones.
2. `data/games/fire-in-the-lake/92-agents.md` has `arvn.transportOrigin`, `arvn.transportDestination`, and the `arvn.doNotLoseOriginControlByTransport` guardrail. The guardrail is policy scoring, not role-binding admissibility.
3. FITL control preservation is state-dependent and may be post-move rather than a static membership test. The compiler must validate everything knowable from authored data, while the runtime evaluates the concrete state-dependent predicate (Foundation #12).
4. No game-specific engine kind such as `arvnControlledPopulationCenter` may be added. FITL-specific labels can appear only as authored data/profile strings interpreted by generic engine semantics (Foundation #1).
5. A 2026-05-26 Foundations reassessment found that current role constraints cannot observe post-Transport state: `constraintsSatisfied` receives only current state plus role bindings. The user approved splitting the generic bounded post-state role-constraint evaluation contract into prerequisite `archive/tickets/196ROLECONROUTE-005A.md`; this ticket now depends on that substrate before adding the concrete control-preservation shape and FITL migration.
6. A later 2026-05-26 Foundations reassessment found a second prerequisite gap: the generic `postState` substrate can evaluate simple role-bound moves, but it cannot yet materialize operation `chooseNStep` params plus compound special-activity params for FITL Train+Transport. The user approved option 2: create `archive/tickets/196ROLECONROUTE-005B.md` for that generic probe-materialization substrate, keep the generic condition-predicate work as the retained partial slice here, and leave FITL migration blocked until `005B` lands.

## Architecture Check

1. **Generic semantic surface**: The new constraint must be phrased in generic terms such as generic control owner comparison or a bounded post-state predicate reference using the substrate from `archive/tickets/196ROLECONROUTE-005A.md`. It must not introduce ARVN/FITL-specific branches into compiler or runtime code.
2. **Compiler/kernel boundary**: The compiler validates referenced roles, zone sets, route classes, predicate ids, payload shape, and boundedness. Runtime evaluates only concrete state-dependent truth that cannot be known statically.
3. **No compatibility shim**: Do not keep the invalid `zone.arvnControlledPopulationCenter` shape as an alias. Either reject it fail-closed or replace it everywhere in the same change.
4. **Single rules protocol**: The constraint must filter role bindings before scoring so rejected bindings never reach plan scoring as legal-but-demoted candidates.

## What to Change

### 1. Design the generic constraint shape

Choose and implement one generic shape, on top of `archive/tickets/196ROLECONROUTE-005A.md`, that can truthfully express FITL origin-control preservation. Acceptable directions include:

- a generic bounded post-state control-preservation constraint, if the invariant must be evaluated after applying the candidate Transport binding;
- another Foundation-compliant generic shape that keeps FITL labels in authored data and keeps engine behavior game-agnostic.

Record the chosen shape in this ticket before source edits continue if live reassessment changes the examples below.

### 2. Compiler and runtime support

Extend the same surfaces used by tickets 001-003 and the post-state substrate from `archive/tickets/196ROLECONROUTE-005A.md`:

- `packages/engine/src/kernel/plan-role-constraints.ts`
- `packages/engine/src/kernel/types-core.ts`
- `packages/engine/src/kernel/schemas-core.ts`
- `packages/engine/src/cnl/game-spec-doc.ts`
- `packages/engine/src/cnl/validate-agent-plan-templates.ts`
- `packages/engine/src/cnl/compile-agent-plan-templates.ts`
- `packages/engine/src/agents/plan-role-constraint-eval.ts`

Add focused unit tests for valid lowering, invalid shape/reference diagnostics, and runtime admit/reject behavior.

### 3. FITL ARVN Transport migration

With `archive/tickets/196ROLECONROUTE-005B.md` landed, update `data/games/fire-in-the-lake/92-agents.md` so ARVN Transport origin-control preservation is expressed through the new generic constraint. Keep `arvn.doNotLoseOriginControlByTransport` only as projected-margin posture scoring after admissibility owns the legality predicate.

### 4. Witness tests

Add or extend FITL integration/policy witnesses to prove:

- an origin-control-losing Transport binding is rejected by role-constraint admissibility;
- the same binding is not merely legal-but-demoted by guardrail scoring;
- legal Transport bindings that preserve origin control still admit and execute;
- deterministic replay remains byte-identical.

## Files to Touch

- `packages/engine/src/kernel/plan-role-constraints.ts` (modify)
- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/src/cnl/game-spec-doc.ts` (modify)
- `packages/engine/src/cnl/validate-agent-plan-templates.ts` (modify)
- `packages/engine/src/cnl/compile-agent-plan-templates.ts` (modify)
- `packages/engine/src/agents/plan-role-constraint-eval.ts` (modify)
- `data/games/fire-in-the-lake/92-agents.md` (modify)
- `packages/engine/test/unit/cnl/<focused-constraint-validation-test>.test.ts` (new or modify)
- `packages/engine/test/unit/agents/<focused-constraint-runtime-test>.test.ts` (new or modify)
- `packages/engine/test/integration/fitl-arvn-transport-constraint-migration.test.ts` (modify or extend)

## Out of Scope

- NVA route logistics and VC underground positioning migrations.
- Weighted route costs or shortest-path scoring.
- Game-specific engine branches or per-game schema files.
- Reworking `routePairs` selector identity beyond what `196ROLECONROUTE-004` already owns.

## Acceptance Criteria

### Tests That Must Pass

1. Compiler rejects invalid or unresolved authored control/predicate constraint references with template/role-named diagnostics.
2. Runtime rejects a role binding that violates the generic control/predicate constraint and admits one that satisfies it.
3. FITL ARVN Transport origin-control-losing bindings are rejected by constraint admissibility, not merely demoted by `arvn.doNotLoseOriginControlByTransport`.
4. Legal FITL ARVN Transport bindings that preserve origin control remain admitted and executable.
5. Existing engine suite: `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`.

### Invariants

1. No FITL-specific identifier or branch enters engine/compiler code.
2. The invalid fake-zone shape `zone.arvnControlledPopulationCenter` is not accepted as a compatibility alias.
3. State-dependent control semantics are evaluated deterministically and boundedly.
4. Guardrail scoring remains advisory; admissibility owns the legal role-binding predicate.

## Test Plan

### New/Modified Tests

1. Focused CNL validation/lowering tests for the chosen generic constraint shape.
2. Focused runtime tests for admit/reject behavior.
3. FITL integration/policy witness for ARVN Transport origin-control preservation.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test <focused dist test paths>`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`

## Outcome

**Completed: 2026-05-26**

- **Chosen generic shape**: FITL ARVN Train+Transport now uses the existing generic `postState.predicate.condition` role constraint. The authored predicate binds `origin` to `role.transportOrigin`, materializes the bounded `transport-destination` post-state, and requires post-state `US|ARVN` token count in the origin to remain greater than `NVA|VC` token count. No FITL-specific compiler/runtime branch or fake zone alias was added.
- **Compiler/runtime support**: `compile-agent-plan-templates.ts` now tags authored post-state condition value expressions before they enter the compiled GameDef. `tag-value-exprs.ts` now recurses through aggregate queries and `zoneExpr` surfaces so generic aggregate predicates over role-bound zones evaluate through the existing tagged ValueExpr runtime.
- **FITL migration**: `data/games/fire-in-the-lake/92-agents.md` adds the Train+Transport origin-control `postState` constraint on `transportDestination`. `arvn.doNotLoseOriginControlByTransport` remains as advisory posture scoring and its comment now points to the admissibility owner.
- **Witnesses**: `fitl-arvn-transport-constraint-migration.test.ts` now asserts the compiled Train+Transport constraints include the post-state predicate, rejects the Hue -> Binh Dinh origin-control-losing binding at `constraintsSatisfied`, and admits the Da Nang -> Binh Dinh binding where US pieces preserve origin control. `gamedef-cache.ts` includes `compile-agent-plan-templates.js` in compiler stamps so cached focused tests invalidate when this lowering surface changes.
- **Acceptance-to-command map**: Invalid-shape/reference diagnostics and generic runtime behavior remain covered by the prerequisite generic condition-predicate tests from the earlier slice. FITL admissibility versus guardrail scoring, legal-preserving binding admission, and deterministic compiled constraint shape are covered by `dist/test/integration/fitl-arvn-transport-constraint-migration.test.js`. Package regression and schema artifact sync are covered by `pnpm -F @ludoforge/engine test`; root regression is covered by the full Turbo build/test/lint/typecheck lanes below.
- **Verification**: `pnpm -F @ludoforge/engine build` passed. `LUDOFORGE_GAMEDEF_CACHE=off node --test packages/engine/dist/test/unit/cnl/plan-role-constraint-lowering.test.js packages/engine/dist/test/integration/fitl-arvn-transport-constraint-migration.test.js` passed after the condition/tagging fixes. `node --test packages/engine/dist/test/integration/fitl-arvn-transport-constraint-migration.test.js packages/engine/dist/test/unit/cnl/plan-role-constraint-lowering.test.js packages/engine/dist/test/unit/helpers/gamedef-cache.test.js packages/engine/dist/test/integration/gamedef-cache-invalidation.test.js` passed. `pnpm -F @ludoforge/engine test` passed, including schema artifact check and 171/171 default-lane files. `pnpm run check:ticket-deps` passed for 1 active ticket and 2522 archived tickets. `git diff --check -- data/games/fire-in-the-lake/92-agents.md packages/engine/src/cnl/compile-agent-plan-templates.ts packages/engine/src/kernel/tag-value-exprs.ts packages/engine/test/helpers/gamedef-cache.ts packages/engine/test/integration/fitl-arvn-transport-constraint-migration.test.ts` passed. `pnpm turbo build`, `pnpm turbo test`, `pnpm turbo lint`, and `pnpm turbo typecheck` passed.
- **Schema/generated fallout**: No schema source or generated schema artifacts changed in this final migration slice. The `perf-baseline` outputs produced by the regression tests were removed from the worktree after proof.
- **Source-size ledger**: Touched source/test file line counts are `compile-agent-plan-templates.ts` 316 lines, `tag-value-exprs.ts` 234 lines, `gamedef-cache.ts` 147 lines, and `fitl-arvn-transport-constraint-migration.test.ts` 273 lines. Durable diff size is `92-agents.md` +31/-1, `compile-agent-plan-templates.ts` +2/-1, `tag-value-exprs.ts` +39/-2, `gamedef-cache.ts` +1/-0, and `fitl-arvn-transport-constraint-migration.test.ts` +92/-2.
- **Abandoned-probe cleanup**: No abandoned exploratory source/test/schema/proof probe remains. Red focused proof runs exposed missing tagging and cache invalidation; those were fixed and superseded by green cache-off and normal-cache reruns.
- **Post-ticket review**: Completed on 2026-05-26. The implementation matches the ticket's final boundary: generic post-state condition semantics own admissibility, FITL data carries only authored faction/role labels, the guardrail remains advisory, and the proof lanes cover focused red/green, package, dependency, whitespace, and root Turbo regression.
- **Archive status**: Archive-ready.
