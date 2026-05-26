# 197DOCGATPLA-002: Plan-proposer eligibility filter + trace provenance

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `agents/plan-proposal.ts`, `kernel/types-plan-trace.ts`, `agents/plan-trace.ts`
**Deps**: `archive/tickets/197DOCGATPLA-001.md`

## Problem

With 001 landed, strategy modules can *declare* `enablesPlanTemplates` / `suppressesPlanTemplates` but the plan proposer doesn't yet consult them. The candidate set remains the full `planTemplates` array, gated only by `applies.actionTags` on the root candidate via `moduleAppliesToRoot`. This ticket adds the eligibility-filter pass and the contrastive trace evidence so doctrine gating actually filters the candidate set with full provenance per Foundation #20.

## Assumption Reassessment (2026-05-26)

1. Plan-template iteration site at `packages/engine/src/agents/plan-proposal.ts:94-142`. The loop iterates `templateIds = input.profile.plan.planTemplates ?? []` (line 94) → `for (const templateId of templateIds)` (line 106). No doctrine filtering present. Confirmed via direct read.
2. `activeDoctrineIds` at `plan-proposal.ts:458-465` returns sorted active module ids by re-evaluating `module.when` via `evaluateBooleanExpr`. Modules have no `.active` boolean field — activation is computed.
3. `highestDoctrineTier` (`plan-proposal.ts:485-498`) consumes active doctrine ids to compute the `priorityTier` contribution per root candidate. The eligibility filter must run BEFORE the template iteration loop, after `activeDoctrineIds` returns at line 100.
4. Trace shape `PolicyPlanTrace` in `packages/engine/src/agents/types-plan-trace.ts:69-85` currently carries `status: 'selected' | 'noTemplate' | 'noRootMatch' | 'noRoleBinding'`. Per spec §6 implementer choice + recommendation: add a new `'noEligibleTemplate'` status to distinguish "all templates filtered by doctrine gating" from "no templates declared in profile".
5. Trace builder `buildPlanProposalTrace` lives in `packages/engine/src/agents/plan-trace.ts` (per blast-radius scan); the additive `filteredOutTemplates` field must be populated alongside `activeDoctrines` / `rejectedDoctrines`.
6. `StrategyModuleDef` (post-001) carries `enablesPlanTemplates: readonly PlanTemplateId[]` and `suppressesPlanTemplates: readonly PlanTemplateId[]` — both guaranteed non-null arrays.

## Architecture Check

1. **Pure deterministic filter (F#8, F#11)**: `eligiblePlanTemplates` is pure over `(activeModules, planTemplates)`. Output ordering matches input ordering for determinism. State is never mutated; the filtered list is a new array.
2. **Preview Signal Integrity (F#20)**: The new `filteredOutTemplates: { templateId, gatedBy, reason }` trace field exposes per-template gating provenance with explicit reason (`'notEnabled' | 'suppressed'`) and the module ids that gated it. Mirrors the existing `rejectedDoctrines: { doctrineId, reason }` pattern at `types-plan-trace.ts:69-85` — gating decisions are contrastive evidence, not silent coercion.
3. **Default-permissive semantic (F#14)**: When no active module declares any `enablesPlanTemplates`, the candidate set is the full `planTemplates` array minus the union of `suppressesPlanTemplates`. This is the *defined* behavior for absent enables-sets, not a compatibility fallback.
4. **Decision-granularity uniformity (F#19)**: Microturn protocol unchanged. The filter affects *which* templates the proposer considers; the controller behavior in `plan-controller.ts` is untouched.

## What to Change

### 1. Insert `eligiblePlanTemplates` in `plan-proposal.ts`

Add a new step between `activeDoctrineIds()` collection (line 100) and the template iteration loop (line 106):

```ts
function eligiblePlanTemplates(
  input: PlanProposalInput,
  activeDoctrines: readonly ModuleId[],
): {
  readonly eligible: readonly PlanTemplateId[];
  readonly filteredOut: readonly {
    readonly templateId: PlanTemplateId;
    readonly gatedBy: readonly ModuleId[];
    readonly reason: 'notEnabled' | 'suppressed';
  }[];
} {
  const activeIdSet = new Set(activeDoctrines);
  const activeModules = input.profile.plan.strategyModules.filter((m) =>
    activeIdSet.has(m.id),
  );
  const enables = new Map<PlanTemplateId, ModuleId[]>();   // templateId → modules that enable it
  const suppresses = new Map<PlanTemplateId, ModuleId[]>(); // templateId → modules that suppress it
  let anyEnablesDeclared = false;
  for (const m of activeModules) {
    if (m.enablesPlanTemplates.length > 0) {
      anyEnablesDeclared = true;
      for (const t of m.enablesPlanTemplates) {
        const list = enables.get(t) ?? [];
        list.push(m.id);
        enables.set(t, list);
      }
    }
    for (const t of m.suppressesPlanTemplates) {
      const list = suppresses.get(t) ?? [];
      list.push(m.id);
      suppresses.set(t, list);
    }
  }
  const candidates = input.profile.plan.planTemplates ?? [];
  const eligible: PlanTemplateId[] = [];
  const filteredOut: { templateId: PlanTemplateId; gatedBy: readonly ModuleId[]; reason: 'notEnabled' | 'suppressed' }[] = [];
  for (const tpl of candidates) {
    if (suppresses.has(tpl)) {
      filteredOut.push({ templateId: tpl, gatedBy: suppresses.get(tpl)!, reason: 'suppressed' });
      continue;
    }
    if (anyEnablesDeclared && !enables.has(tpl)) {
      // Capture all active modules with enables-sets as the "gatedBy" provenance
      // — they collectively define the eligible set that excludes this template.
      const allEnablers = activeModules.filter((m) => m.enablesPlanTemplates.length > 0).map((m) => m.id);
      filteredOut.push({ templateId: tpl, gatedBy: allEnablers, reason: 'notEnabled' });
      continue;
    }
    eligible.push(tpl);
  }
  return { eligible, filteredOut };
}
```

Then in `proposeAdvisoryTurnPlan`, replace the use of `templateIds` in the iteration loop with the `eligible` list. Pass `filteredOut` through to the trace builder.

### 2. Add `'noEligibleTemplate'` status to `PolicyPlanTrace`

In `packages/engine/src/agents/types-plan-trace.ts`, extend the `status` union:

```ts
readonly status: 'selected' | 'noTemplate' | 'noEligibleTemplate' | 'noRootMatch' | 'noRoleBinding';
```

When `eligible.length === 0` AND `templateIds.length > 0` (i.e., templates exist but doctrine gating filtered them all), the proposer returns `'noEligibleTemplate'`. When `templateIds.length === 0` (no templates in profile), continue returning `'noTemplate'`. Both paths fall through to scalar root selection per Spec 190's fallback floor.

### 3. Add `filteredOutTemplates` trace field

In `types-plan-trace.ts`, add the additive field:

```ts
readonly filteredOutTemplates: readonly {
  readonly templateId: PlanTemplateId;
  readonly gatedBy: readonly ModuleId[];
  readonly reason: 'notEnabled' | 'suppressed';
}[];
```

Update `buildPlanProposalTrace` in `plan-trace.ts` to populate this from the proposer's `filteredOut` output.

### 4. Replay-identity preservation

Default-permissive behavior — when no active module declares any `enablesPlanTemplates` and no active module declares any `suppressesPlanTemplates` — must be byte-identical to pre-spec behavior on the existing FITL profile. The replay-identity proof lives in the new test (see Test Plan).

## Files to Touch

- `packages/engine/src/agents/plan-proposal.ts` (modify)
- `packages/engine/src/agents/types-plan-trace.ts` (modify — new status value + new trace field)
- `packages/engine/src/agents/plan-trace.ts` (modify — populate `filteredOutTemplates`)
- `packages/engine/test/unit/agents/plan-proposer-eligibility-filter.test.ts` (new — per-shape filter behavior tests)
- `packages/engine/test/determinism/plan-trace-replay.test.ts` (modify — extend to cover the new field for the default-permissive case; existing FITL replay-identity must remain byte-identical)

## Out of Scope

- FITL data-file migration (`buildPoliticalEngine` declares gating fields) — owned by 003. This ticket leaves the FITL profile unchanged; the existing FITL profile has zero active modules declaring any gating fields, so default-permissive behavior preserves replay identity.
- Cross-profile architectural-invariant tests with synthesized profiles (enables-only, suppress-only, union, empty-result) — owned by 004. This ticket ships per-shape unit tests against minimal synthetic fixtures; 004 covers the architectural property assertion across profile variants.
- Golden trace for `filteredOutTemplates` shape — owned by 004 (pinned via determinism corpus).
- Plan-controller execution changes — explicitly out of scope per spec §2.

## Acceptance Criteria

### Tests That Must Pass

1. **Default-permissive (no gating fields)**: A profile where no active module declares any gating fields produces the full `planTemplates` array as `eligible` and an empty `filteredOutTemplates`.
2. **Suppress-only**: An active module with `suppressesPlanTemplates: [X]` produces `eligible = planTemplates \ {X}` and `filteredOutTemplates = [{ templateId: X, gatedBy: [moduleId], reason: 'suppressed' }]`.
3. **Enables-only**: An active module with `enablesPlanTemplates: [X]` produces `eligible = {X}` (intersection) and the rest of `planTemplates` reported as `filteredOutTemplates` with `reason: 'notEnabled'`.
4. **Cyclic suppression (suppress beats enable)**: Module A suppresses X, module B enables X, both active → X is excluded with `reason: 'suppressed'` and `gatedBy: [A]`.
5. **Empty-eligibility falls through cleanly**: When the filter produces an empty `eligible` set with `templateIds.length > 0`, the proposer returns `status: 'noEligibleTemplate'`. Scalar root selection (Spec 190 fallback) takes over downstream.
6. **`noTemplate` preserved**: Empty `templateIds` (no plan templates declared) still returns `status: 'noTemplate'`, NOT `'noEligibleTemplate'`.
7. **Replay-identity (FITL)**: Existing FITL replay tests under `packages/engine/test/determinism/plan-trace-replay.test.ts` produce byte-identical traces.
8. Existing engine suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. **Filter purity (F#11)**: `eligiblePlanTemplates` does not mutate `activeDoctrines`, `activeModules`, or `candidates`. The returned `eligible` array is a new immutable list.
2. **Deterministic ordering (F#8)**: `eligible` and `filteredOutTemplates` preserve input ordering (sorted-input → sorted-output).
3. **Trace replay (F#9, F#16)**: A plan trace including `filteredOutTemplates` round-trips through serialization with byte-identical output.
4. **Provenance completeness (F#20)**: Every filtered-out template carries at least one module id in `gatedBy`; no template appears in `filteredOutTemplates` without provenance.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/plan-proposer-eligibility-filter.test.ts` (new) — covers acceptance criteria 1-6. Synthetic profiles with 2-3 templates and 1-2 strategy modules per shape. Test class: `architectural-invariant`.
2. `packages/engine/test/determinism/plan-trace-replay.test.ts` (modify) — extend existing FITL replay-identity test to assert the new `filteredOutTemplates` field is present (empty for default-permissive case) and the byte-identical replay still holds. Test class: existing.

### Commands

1. `pnpm turbo build && pnpm -F @ludoforge/engine test:unit dist/test/unit/agents/plan-proposer-eligibility-filter.test.js`
2. `pnpm -F @ludoforge/engine test:unit dist/test/determinism/plan-trace-replay.test.js`
3. `pnpm turbo lint typecheck test`

## Outcome

Completion date: 2026-05-26

What landed:
- Added the generic doctrine-gated plan-template eligibility filter in `packages/engine/src/agents/plan-template-eligibility.ts`.
- `proposeAdvisoryTurnPlan` now filters templates before scoring, preserves default-permissive behavior when no active module declares enables/suppresses fields, and returns `noEligibleTemplate` when declared plan templates are all filtered out.
- `PolicyPlanTrace` now carries additive `filteredOutTemplates` provenance with `{ templateId, gatedBy, reason }`, and the trace builder, plan-controller default trace, kernel type, and trace schema were updated.
- Added `packages/engine/test/unit/agents/plan-proposer-eligibility-filter.test.ts` for default-permissive, suppress-only, enables-only, suppress-wins, empty-eligibility, and `noTemplate` preservation cases.
- Extended `packages/engine/test/determinism/plan-trace-replay.test.ts` to assert the new default-permissive trace field remains present and empty.

Path correction:
- The ticket named `packages/engine/src/agents/types-plan-trace.ts`, but the live trace type is `packages/engine/src/kernel/types-plan-trace.ts`; implementation updated the live kernel trace type.

Generated artifact provenance:
- Artifact: `packages/engine/schemas/Trace.schema.json`.
- Generation command: `pnpm -F @ludoforge/engine run schema:artifacts`.
- Canonical source: `packages/engine/src/kernel/schemas-core.ts`.
- Refresh reason: additive `PolicyPlanTrace.status = "noEligibleTemplate"` and `PolicyPlanTrace.filteredOutTemplates`.
- Durability: retained existing generator `packages/engine/scripts/schema-artifacts.mjs`; `pnpm -F @ludoforge/engine test` reran the schema artifact check and passed.

Command substitution:
- The package commands `pnpm -F @ludoforge/engine test:unit dist/test/unit/agents/plan-proposer-eligibility-filter.test.js` and `pnpm -F @ludoforge/engine test:unit dist/test/determinism/plan-trace-replay.test.js` expanded through the package script to broad unit/architecture globs and were abandoned as unverified focused probes. User approved replacing them with direct compiled `node --test` lanes; no matching processes remained before replacement.

Verification:
- `pnpm turbo build` - passed.
- `node --test dist/test/unit/agents/plan-proposer-eligibility-filter.test.js` from `packages/engine` - passed, 5/5 tests.
- `node --test dist/test/determinism/plan-trace-replay.test.js` from `packages/engine` - passed, 1/1 test.
- `pnpm -F @ludoforge/engine test` - passed, including `schema:artifacts:check` and default lane summary `171/171 files passed`.
- `pnpm turbo lint typecheck test` - passed; 9/9 Turbo tasks successful, including engine default lane summary `171/171 files passed`.

Source-size ledger:
- `packages/engine/src/agents/plan-proposal.ts` | after 777 | crossed cap? no | active growth +24 net after extracting the filter helper | successor none.
- `packages/engine/src/agents/plan-template-eligibility.ts` | after 75 | crossed cap? no | new focused helper | successor none.
- `packages/engine/src/kernel/schemas-core.ts` | after 3314 | crossed cap? no, preexisting oversize | active growth +5 net | user-approved deferral option 2: canonical trace schema source, extraction would widen this ticket | successor none.

Deferred scope:
- FITL `buildPoliticalEngine` migration remains owned by `tickets/197DOCGATPLA-003.md`.
- Cross-profile architectural-invariant and golden trace coverage remain owned by `tickets/197DOCGATPLA-004.md`.
