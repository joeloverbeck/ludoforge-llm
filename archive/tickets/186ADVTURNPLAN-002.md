# 186ADVTURNPLAN-002: Compiler validation diagnostics for plan templates & role selectors

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `cnl` validation (`validate-agents.ts`)
**Deps**: `archive/tickets/186ADVTURNPLAN-001.md`, `archive/tickets/186ADVTURNPLAN-002A.md`

## Problem

The plan-template IR (`186ADVTURNPLAN-001`) needs static validation so authoring errors fail at compile time, not runtime (Foundation #12). Spec 186 §4.7 enumerates the diagnostics: id uniqueness, role-reference resolution, forward-declaration ordering, cap/bound presence, fallback-target existence and cycle-bounding, stable tie-breakers, named cap classes, and role/template-named error messages.

## Assumption Reassessment (2026-05-20)

1. `validate-agents.ts` (658 lines) is the agent static-validation home; it currently validates the v2 buckets. Plan-template/role diagnostics are additive.
2. The compiler is responsible for everything statically knowable (Foundation #12, verified); these checks do not require kernel state.
3. Error-message quality is a spec requirement (§4.7 / source proposal §5.8): messages name the offending role/template (e.g. "`roles.governSpace` references role `trainSpace`, but `trainSpace` is not bound before this constraint").
4. Boundary reset approved 2026-05-20: live `186ADVTURNPLAN-001` does not yet expose plan cap/max-step IR fields, so this ticket depends on `archive/tickets/186ADVTURNPLAN-002A.md` before implementing the cap-class and max-step diagnostics required by Foundations #10/#12.

## Architecture Check

1. Validation is pure and spec-derivable — no runtime dependence (Foundation #12).
2. Diagnostics operate on generic IR (template/role/selector ids, constraint refs); no game-specific branching (Foundation #1).
3. No shim — diagnostics are net-new for the v3 IR.

## What to Change

### 1. Plan-template & role diagnostics (`validate-agents.ts`)

Add checks: unique doctrine/template ids; every role references an existing selector; every role constraint references a previously bound or explicitly forward-declared role; every template has a max step count; every fallback target exists; no fallback cycle unless bounded by an explicit max-attempts cap; every deterministic order has a stable tie-breaker; all cap classes are named and within allowed values; all trace labels are deterministic strings; no game-specific engine schema (Foundation #6).

### 2. Role/template-named error messages

Emit messages that name the offending role/template per §4.7.

## Files to Touch

- `packages/engine/src/cnl/validate-agents.ts` (modify)

## Out of Scope

- `routePairs`/`subset` source-specific bound checks (`186ADVTURNPLAN-003` adds those sources and their diagnostics).
- Runtime behavior (`004`–`006`).

## Acceptance Criteria

### Tests That Must Pass

1. An authoring-error corpus: each crafted invalid spec (role→missing selector; constraint→unbound role; missing template step cap; missing fallback target; fallback cycle; missing stable tie-breaker; unnamed/out-of-range cap class) fails compilation with a role/template-named message.
2. A valid plan-template spec passes validation unchanged.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Every statically-knowable plan-template defect fails compilation (Foundation #12); none are deferred to runtime.
2. Validation is deterministic — same spec yields same diagnostics.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cnl/agent-plan-template-validate.test.ts` (new) — `architectural-invariant`: the §4.7 authoring-error corpus + valid-spec pass-through.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test dist/test/unit/cnl/agent-plan-template-validate.test.js`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`

## Outcome

Completed: 2026-05-20

What changed:
- Added plan-template validation diagnostics for selector references, role binding/order constraints, role step references, required cap metadata, named cap classes, max-step bounds, fallback targets, unbounded fallback cycles, and stable role-selector ordering.
- Registered `planTemplates` as a recognized agent policy library bucket so valid plan-template specs no longer trip the unknown-library-key validator.
- Added `packages/engine/src/cnl/validate-agent-plan-templates.ts` as the focused validator module and wired it through `validate-agents.ts`.
- Added the focused architectural-invariant corpus in `packages/engine/test/unit/cnl/agent-plan-template-validate.test.ts`, including valid pass-through and deterministic-diagnostic replay coverage.

Acceptance-to-command map:
- Authoring-error corpus with role/template-named messages: `node --test dist/test/unit/cnl/agent-plan-template-validate.test.js` passed.
- Valid plan-template spec passes validation unchanged and avoids unknown-library-key diagnostics: `node --test dist/test/unit/cnl/agent-plan-template-validate.test.js` passed.
- Existing engine suite: `pnpm -F @ludoforge/engine test` passed with `164/164 files passed`.
- Root canonical lanes: `pnpm turbo build`, `pnpm turbo test`, `pnpm turbo lint`, and `pnpm turbo typecheck` all passed.

Invariants:
- Statically knowable plan-template defects now fail during compilation through deterministic compiler diagnostics.
- The focused deterministic replay test compiles the same invalid spec twice and compares diagnostic code/message/path snapshots.

Source-size ledger:
- `packages/engine/src/cnl/validate-agents.ts`: 658 -> 661 lines.
- `packages/engine/src/cnl/validate-agent-plan-templates.ts`: new, 272 lines.
- `packages/engine/test/unit/cnl/agent-plan-template-validate.test.ts`: new, 199 lines.

Deviation from plan:
- Validation was split into a new focused module instead of putting the full corpus in `validate-agents.ts`; this preserves the repo file-size guidance while keeping `validate-agents.ts` as the orchestrating static-validation home.
- The implementation also touched `packages/engine/src/contracts/policy-contract.ts` to recognize `planTemplates` as a valid library bucket; without this, a valid plan-template spec still emitted an unknown-library-key diagnostic.
- Fallback cycles are rejected as unbounded because the current IR does not yet expose explicit fallback max-attempt metadata; a future bounded fallback-attempt field can relax this safely.

Verification:
- `pnpm -F @ludoforge/engine build`
- `node --test dist/test/unit/cnl/agent-plan-template-validate.test.js`
- `pnpm -F @ludoforge/engine test`
- `pnpm turbo build`
- `pnpm turbo test`
- `pnpm turbo lint`
- `pnpm turbo typecheck`
