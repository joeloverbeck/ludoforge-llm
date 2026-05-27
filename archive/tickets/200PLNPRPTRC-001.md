# 200PLNPRPTRC-001: Phase 1 — Add `roleBindingStatuses` and `decisionSurfaceMatch` trace fields; remove `roleBindings`

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/kernel/types-plan-trace.ts` (trace type shapes); `packages/engine/src/kernel/schemas-core.ts` / `packages/engine/src/kernel/schemas-plan-trace.ts` (trace schema mirror); `packages/engine/src/agents/plan-trace.ts` (trace construction); `packages/engine/src/agents/plan-proposal.ts` / `packages/engine/src/agents/plan-proposal-candidates.ts` (decision-surface match emission and candidate helpers)
**Deps**: `specs/200-plan-proposal-trace-completeness.md`

## Problem

`PolicyPlanTrace.roleBindings` (the trace surface's array of successful role bindings) currently omits any record for roles that *failed* to bind — trace consumers cannot distinguish "role not declared on template" from "role declared but no candidate matched the selector or constraint stack". Similarly, when a plan-template root's declared `decisionKind` mismatches the published frontier's decision kind at proposal time, the candidate is silently scored to zero or omitted; the proposal trace records no contrastive evidence.

This ticket closes the role-target availability gap by introducing `PolicyPlanTrace.roleBindingStatuses` (a complete per-role record with explicit `ready`/`unavailable` status) and the decision-surface match gap by adding `PolicyPlanTraceAlternative.decisionSurfaceMatch?`. Per Foundation #14, the redundant successful-only `PolicyPlanTrace.roleBindings` array is **removed in the same change** rather than retained as a compatibility shim — the 2 internal callers migrate in this ticket.

## Assumption Reassessment (2026-05-27)

1. `PolicyPlanTrace` is defined at `packages/engine/src/kernel/types-plan-trace.ts:72–93` with `roleBindings: readonly PolicyPlanTraceRoleBinding[]` (line 89). Verified against HEAD.
2. `PolicyPlanTraceRoleBinding` is at `types-plan-trace.ts:3–9` (fields: `role`, `selectedId`, `quality`, `rank`, `components`). Verified.
3. `PolicyPlanTraceAlternative` is at `types-plan-trace.ts:11–18` with optional `compoundAvailability` from Spec 199. Verified.
4. The 2 callers of `PolicyPlanTrace.roleBindings` are:
   - `packages/engine/src/agents/plan-trace.ts:18–29` (constructs the array from `result.selected.roleBindings` dict via `Object.values(...).sort(...).map(...)`). Verified.
   - `packages/engine/test/architecture/observer-safety-invariants.test.ts:349` (asserts `trace.roleBindings.map((binding) => binding.selectedId)` for hidden-token absence). Verified via grep.
5. The 17+ `policy-profile-quality/*.test.ts` files reading `selected.roleBindings.<role>` access `PlanProposalAlternative.roleBindings` (a `Record<string, PlanRoleBinding>` on the alternative, not `PolicyPlanTrace.roleBindings` on the trace). They are unaffected by this ticket. Verified via grep.
6. The candidate-iteration loop in `plan-proposal.ts` opens at line 125 (`for (const templateId of eligibleTemplateIds)`), inner root loop at 135, candidates pushed through line 162 (post-commit `3936e434a`). The §1.2 `decisionSurfaceMatch` emission lands inside this loop where `rootMatchesTemplate` and step expectations are computed.
7. Boundary correction (2026-05-27): `packages/engine/src/kernel/schemas-core.ts` also mirrors the serialized `PolicyPlanTrace` shape and still declares `roleBindings`. Because AGENTS.md requires schema/type changes to stay synchronized across kernel schemas and tests, this ticket owns the schema mirror update and `schema:artifacts:check` verification in the same change.

## Architecture Check

1. **Foundation #14 (No Backwards Compatibility)**: This ticket removes `PolicyPlanTrace.roleBindings` and adds `roleBindingStatuses` in the same change, with the 2 internal callers migrated. No deferred trace-consumer migration, no compatibility shim. The "every repository-owned... fixture, replay, and test is updated in the same change" mandate is satisfied at the 2-caller scope.
2. **Foundation #20 (Preview Signal Integrity)**: The new `PolicyPlanTraceRoleBindingStatus` discriminated union (`ready` with binding | `unavailable` with reason) and `DecisionSurfaceMatch` discriminated union (`matched` | `mismatched` with expected/observed) follow the Foundation #20 status-with-provenance vocabulary established by `CompoundAvailability` in Spec 199.
3. **Foundation #4 (Authoritative State and Observer Views)**: The `hiddenScope` reason on `roleBindingStatuses` makes observer-driven unavailability explicit without leaking hidden ids — the reason is a categorical label, not the hidden zone/token/card id itself.
4. **Foundation #1 (Engine Agnosticism)**: All new vocabulary is generic (`hiddenScope`, `noSelectorMatch`, `allConstraintsFailed`, `matched`, `mismatched`). No FITL-specific labels.

## What to Change

### 1. Extend `types-plan-trace.ts` with the new types and trace fields

Add to `packages/engine/src/kernel/types-plan-trace.ts`:

```ts
export type PolicyPlanTraceRoleBindingStatus =
  | { readonly kind: 'ready'; readonly binding: PolicyPlanTraceRoleBinding }
  | { readonly kind: 'unavailable'; readonly reason: 'noSelectorMatch' | 'allConstraintsFailed' | 'hiddenScope' };

export interface PolicyPlanTraceRoleBindingStatusEntry {
  readonly role: string;
  readonly status: PolicyPlanTraceRoleBindingStatus;
}

export type DecisionSurfaceMatch =
  | { readonly kind: 'matched' }
  | { readonly kind: 'mismatched'; readonly expected: string; readonly observed: string };
```

Update `PolicyPlanTrace` (lines 72–93): **remove** `readonly roleBindings: readonly PolicyPlanTraceRoleBinding[]` (line 89); **add** `readonly roleBindingStatuses: readonly PolicyPlanTraceRoleBindingStatusEntry[]`.

Update `PolicyPlanTraceAlternative` (lines 11–18): **add** `readonly decisionSurfaceMatch?: DecisionSurfaceMatch`.

### 2. Migrate `plan-trace.ts` construction site

In `packages/engine/src/agents/plan-trace.ts:18–29`, replace the `roleBindings` array construction:

```ts
roleBindings: result.selected === undefined
  ? []
  : Object.values(result.selected.roleBindings)
    .sort((left, right) => compareStable(left.role, right.role))
    .map((binding) => ({ role: ..., selectedId: ..., ... })),
```

with `roleBindingStatuses` population. Iterate over the *template-declared* role set (not just the bound subset) — when the selected proposal has a binding for a role, emit `{ kind: 'ready', binding: { ... } }`; otherwise emit `{ kind: 'unavailable', reason: ... }` with the reason classified per §4.1 of Spec 200. When `result.selected === undefined`, emit `roleBindingStatuses: []` (empty, mirroring the prior `roleBindings: []` behavior).

The reason classification depends on which short-circuit fired during `bindPlanRoles` in `plan-proposal.ts`. Plumb the reason through `bindPlanRoles` (or its equivalent) so the construction site can read it; this may require a small refactor to surface the rejection reason. If `bindPlanRoles` currently returns `null` on any failure, add a `RoleBindingResult` discriminated union (`{ kind: 'ready', bindings } | { kind: 'unavailable', role, reason }`).

### 3. Emit `decisionSurfaceMatch` in `plan-proposal.ts`

Inside the candidate-iteration loop (`plan-proposal.ts:125–162`), for each `(template, root)` pair, compute whether the root's published-frontier `decisionKind` matches the template's root step `decisionKind`. When they differ, set `decisionSurfaceMatch: { kind: 'mismatched', expected: <template>, observed: <frontier> }`; when they match, set `{ kind: 'matched' }`. When the template has no explicit `decisionKind` declaration, omit the field (optional).

The `expected` value comes from the compiled plan template's `root.step.decisionKind` (verify exact path in `CompiledPlanTemplate['steps'][0]`); the `observed` value comes from the published `actionSelection` decision the candidate matched against.

### 4. Migrate `observer-safety-invariants.test.ts:349`

In `packages/engine/test/architecture/observer-safety-invariants.test.ts:349`, replace:

```ts
assertHiddenTokenAbsent('plan trace role bindings', trace.roleBindings.map((binding) => binding.selectedId));
```

with:

```ts
const readyBindingIds = trace.roleBindingStatuses
  .filter((entry): entry is PolicyPlanTraceRoleBindingStatusEntry & { status: { kind: 'ready' } } => entry.status.kind === 'ready')
  .map((entry) => entry.status.binding.selectedId);
assertHiddenTokenAbsent('plan trace role bindings', readyBindingIds);
```

The semantic guarantee (no hidden token id leaks through bound role identities) is preserved; the path through `roleBindingStatuses` filters to ready entries since `unavailable` entries carry no `selectedId`.

### 5. Add architectural-invariant test

New file: `packages/engine/test/architecture/plan-trace-role-binding-status-coverage.test.ts` (per Spec 200 §8).

The test asserts that for every plan template declared in a representative FITL profile, when proposal status is `noRoleBinding`, the resulting trace's `roleBindingStatuses` contains exactly one entry per template-declared role (with the appropriate `unavailable` reason). Use the existing FITL fixtures; bound the test to a deterministic seed.

Mark with `// @test-class: architectural-invariant`.

## Files to Touch

- `packages/engine/src/kernel/types-plan-trace.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify — keep serialized trace schema synchronized with the type removal/addition)
- `packages/engine/src/kernel/schemas-plan-trace.ts` (new — extracted trace schema mirror to avoid growing the oversized central schema file)
- `packages/engine/src/agents/plan-trace.ts` (modify)
- `packages/engine/src/agents/plan-proposal.ts` (modify — `bindPlanRoles` refactor if needed + `decisionSurfaceMatch` emission)
- `packages/engine/src/agents/plan-proposal-candidates.ts` (new — extracted candidate helper logic to avoid growing the oversized proposal module)
- `packages/engine/test/architecture/observer-safety-invariants.test.ts` (modify — line 349 migration)
- `packages/engine/test/architecture/plan-trace-role-binding-status-coverage.test.ts` (new — architectural-invariant)

## Out of Scope

- `rejectedByConstraint` and the role-constraint-eval rejection vocabulary (Phase 2, ticket 200PLNPRPTRC-002).
- `fallbackReason` discriminated union promotion (Phase 3, ticket 200PLNPRPTRC-003).
- Cross-game conformance corpus extension (Phase 4, ticket 200PLNPRPTRC-004).
- Structured composite target identity replacing pipe-strings — deferred per `archive/specs/IMPLEMENTATION-ORDER-2026-05-27.md` disposition #2.
- Migration of FITL profile YAML — Spec 200 explicitly excludes profile changes.

## Acceptance Criteria

### Tests That Must Pass

1. `plan-trace-role-binding-status-coverage.test.ts` (new) — every template-declared role has a `roleBindingStatuses` entry when `status === 'noRoleBinding'`.
2. `observer-safety-invariants.test.ts` (migrated assertion at line 349) — hidden tokens still do not leak through plan-trace role binding identities.
3. Existing replay-identity tests pass byte-identically (no `fallbackReason` re-bless required in this phase; the new fields are additive on the trace).
4. Existing suite: `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test` — full engine test suite green.

### Invariants

1. `PolicyPlanTrace` no longer carries `roleBindings` (the successful-only array). Reading `trace.roleBindings` is a TS compile error after this ticket — TypeScript's structural typing enforces the removal.
2. `roleBindingStatuses` length equals the count of template-declared roles when the selected template is present; empty when `result.selected === undefined`.
3. Every `roleBindingStatuses[i].status` is exactly one of `{ kind: 'ready', binding }` or `{ kind: 'unavailable', reason }`.
4. `decisionSurfaceMatch` is populated for every alternative whose template declares a root-step `decisionKind`; absent (undefined) when the template omits the declaration.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/architecture/plan-trace-role-binding-status-coverage.test.ts` (new) — architectural-invariant; uses FITL fixture seed to exercise both `noRoleBinding` and successful-binding paths.
2. `packages/engine/test/architecture/observer-safety-invariants.test.ts` (modify line 349) — migrate hidden-token assertion to read from `roleBindingStatuses`.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/architecture/plan-trace-role-binding-status-coverage.test.js`
2. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/architecture/observer-safety-invariants.test.js`
3. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`

## Outcome (2026-05-27)

- Completion date: 2026-05-27
- Implemented `PolicyPlanTrace.roleBindingStatuses` and removed the successful-only `PolicyPlanTrace.roleBindings` surface. Runtime trace construction now records ready and unavailable role-binding statuses, including `noSelectorMatch` and `allConstraintsFailed` classification from proposal-time binding.
- Added `PolicyPlanTraceAlternative.decisionSurfaceMatch` and proposal-time annotation of matched or mismatched decision surfaces without changing selection authority.
- Migrated observer-safety assertions to inspect only ready binding statuses, updated trace fixtures/golden data, and synchronized `Trace.schema.json`.
- Boundary corrections: `schemas-core.ts` was an owned serialized-trace mirror and needed synchronization; `plan-proposal-candidates.ts` and `schemas-plan-trace.ts` were extracted so this implementation did not actively grow preexisting oversized source files.
- Generated artifact provenance: `packages/engine/schemas/Trace.schema.json` was regenerated with the retained package generator via `pnpm -F @ludoforge/engine run schema:artifacts`; the canonical source is the Zod schema mirror under `packages/engine/src/kernel/`; `pnpm -F @ludoforge/engine run schema:artifacts:check` passed after generation.
- Verification results:
  - `pnpm -F @ludoforge/engine build` — passed.
  - `node --test packages/engine/dist/test/architecture/plan-trace-role-binding-status-coverage.test.js` — passed.
  - `node --test packages/engine/dist/test/unit/agents/plan-proposal.test.js` — passed.
  - `node --test packages/engine/dist/test/architecture/observer-safety-invariants.test.js` — passed.
  - `node --test packages/engine/dist/test/determinism/plan-trace-doctrine-gating-golden.test.js` — passed.
  - `pnpm -F @ludoforge/engine run schema:artifacts:check` — passed.
  - `pnpm -F @ludoforge/engine test` — passed, 179/179 files.
  - `pnpm turbo build` — passed.
  - `pnpm turbo lint` — passed.
  - `pnpm turbo typecheck` — passed.
  - `pnpm turbo test` — passed, 5/5 Turbo tasks; engine 179/179 files.
  - `git diff --check` — passed.
  - `pnpm run check:ticket-deps` — passed.
