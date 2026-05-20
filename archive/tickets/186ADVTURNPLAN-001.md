# 186ADVTURNPLAN-001: Plan-template & role-binding selector IR + compilation (schemaVersion 3)

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — `cnl` compiler (`game-spec-doc.ts`, `compile-agents.ts`), kernel types (`types-core.ts`), two new compile modules
**Deps**: `specs/186-advisory-turn-plan-architecture-core.md`

## Problem

The agent policy has no composed-turn IR. Today a profile expresses scalar `considerations`, `selectors` that rank items, and `strategyModules` that emit summed score groups — there is no first-class object describing a whole-turn intention (`operation + optional special + timing + roles`). Spec 186 §4.1–§4.2 introduces the `AdvisoryTurnPlan` paradigm; this ticket lands its declarative IR and compilation: a new `planTemplates` library bucket and role-binding semantics on selectors, under a bumped `schemaVersion: 3`.

## Assumption Reassessment (2026-05-20)

1. Agent catalog `schemaVersion` is currently `2` (`AgentPolicyCatalog`, `kernel/types-core.ts:1317`; set in `compile-agents.ts`). Bumping to `3` is a migration, not a sidecar (Foundation #14) — verified by reassessment.
2. `CompiledAgentSelector` (`types-core.ts:1124`) has **no** `role` field today; selectors rank items only. Role binding is net-new here.
3. Selector source kinds today are `collection` (`zones|tokens|cards|players|authoredFinite`), `product`, `microturnOptions`, `candidateParams` (`types-core.ts:1077–1088`). This ticket adds role binding over these existing kinds; `routePairs`/`subset` are deferred to `186ADVTURNPLAN-003`.
4. Agent library buckets are declared in `game-spec-doc.ts` (selector def, module def regions ~712–823) and compiled in `compile-agents.ts` (5826 lines).

## Architecture Check

1. The plan template is a generic composed-turn shape (root action match + optional companion action + timing + ordered/partial role steps + frontier-match patterns). The engine never learns "Train"/"Govern" — FITL meaning comes from authored action tags, selector filters, and labels (Foundation #1).
2. GameSpecDoc carries the game-specific plan/role authoring; GameDef/kernel stay agnostic — `planTemplates` lowers to generic `CompiledPlanTemplate`/`CompiledRoleSelector` with no per-game schema (Foundation #6).
3. No backwards-compatibility shim: `schemaVersion: 3` replaces `2`; the v2 capability set survives as components (the runtime retirement of the v2 *primary flow* is `186ADVTURNPLAN-006`, not here).

## What to Change

### 1. Source schema (`game-spec-doc.ts`)

Add a `planTemplates` entry to the agent library bucket. Each template: `root: { actionTags?, actionIds?, compound?: { specialTags, timing: before|during|after|interruptAfterStage } }`, `roles: { <name>: { selector, required, constraints[] } }` (constraints reference bound/forward-declared roles, e.g. `notEqual: role.<name>`, `locatedIn: role.<name>`), `steps: [{ label, role, match: { decisionKind, targetKind, decisionPath, actionTag?, stageIndex? } }]`, optional `postureHook` (ref only; defined in Spec 187), `fallback: { ifSpecialUnavailable?, ifRoleTargetUnavailable?, ifPreviewUnavailable? }`. Extend the selector source def so a selector may be referenced as a role binder.

### 2. Compiled types (`types-core.ts`)

Add `CompiledPlanTemplate`, `CompiledPlanRole`, `CompiledRoleSelector` (role-binding extension of `CompiledAgentSelector` — additive `role` surface, not a new union). Add `planTemplates` to `AgentPolicyCatalog`; bump its `schemaVersion` 2 → 3.

### 3. Plan-template compilation (`compile-agent-plan-templates.ts`, new)

Lower plan templates: resolve role→selector references, lower `root`/`compound`/`steps`/`fallback`, preserve deterministic ordering and stable keys.

### 4. Role-selector compilation (`compile-agent-role-selectors.ts`, new)

Lower role selectors over the existing source kinds, exposing `role.<name>` refs (id, quality, components) for constraints and downstream roles.

### 5. Wire into `compile-agents.ts`

Invoke the new lowering passes; emit `schemaVersion: 3` and the `planTemplates` catalog section.

## Files to Touch

- `packages/engine/src/cnl/game-spec-doc.ts` (modify)
- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/cnl/compile-agents.ts` (modify)
- `packages/engine/src/cnl/compile-agent-plan-templates.ts` (new)
- `packages/engine/src/cnl/compile-agent-role-selectors.ts` (new)

## Out of Scope

- Static validation diagnostics (`186ADVTURNPLAN-002`).
- `routePairs`/`subset` selector sources (`186ADVTURNPLAN-003`).
- Any runtime: `PlanExecutionState`, proposer, controller, consideration demotion (`004`–`006`).
- FITL authoring (`007` / Spec 188).

## Acceptance Criteria

### Tests That Must Pass

1. A fixture GameSpecDoc declaring a `planTemplates` entry with two role-binding selectors and a `notEqual` cross-role constraint compiles to a `CompiledPlanTemplate` with resolved role references.
2. Emitted `AgentPolicyCatalog.schemaVersion === 3`.
3. Compiling the same doc twice yields byte-identical GameDef.
4. Existing suite: `pnpm -F @ludoforge/engine test` (no regression in current agent compilation).

### Invariants

1. No game-specific identifier appears in `packages/engine/src/` as a result of this ticket (Foundation #1).
2. `CompiledPlanTemplate`/`CompiledRoleSelector` are generic; role names are authored strings, not engine constants.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cnl/agent-plan-template-compile.test.ts` (new) — `architectural-invariant`: plan-template lowering + role resolution + compile-twice determinism.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test dist/test/unit/cnl/agent-plan-template-compile.test.js`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`

## Outcome

Completed: 2026-05-20

What changed:
- Added authored `planTemplates` to `GameSpecAgentLibrary`, compiled `CompiledPlanTemplate`/`CompiledRoleSelector` IR, and `planTemplates` dependency/profile/library surfaces under `AgentPolicyCatalog.schemaVersion: 3`.
- Added `compile-agent-plan-templates.ts` and `compile-agent-role-selectors.ts` for deterministic template lowering, role-selector ref exposure, cross-role constraint lowering, fallback/root/step preservation, and basic compiler diagnostics.
- Wired plan-template compilation into `compile-agents.ts`, including schemaVersion 3 emission and profile plan dependency inclusion.
- Regenerated `packages/engine/schemas/GameDef.schema.json` from `packages/engine/src/kernel/schemas-core.ts` via `pnpm -F @ludoforge/engine schema:artifacts`; only `GameDef.schema.json` changed because Trace/EvalReport inputs did not change.
- Migrated engine test fixtures and policy-catalog golden headers from schemaVersion 2 to 3. A package-test failure exposed a stale compiled GameDef cache key, fixed by adding `dist/src/cnl/compile-agents.js` to `packages/engine/test/helpers/gamedef-cache.ts` compiler stamps.

Acceptance-to-command map:
- Plan-template fixture with two role-binding selectors, a `notEqual` constraint, resolved role refs, schemaVersion 3, and compile-twice byte identity: `node --test dist/test/unit/cnl/agent-plan-template-compile.test.js` from `packages/engine` via the targeted test and full package/root test lanes.
- Existing agent/compiler regression surface: `pnpm -F @ludoforge/engine test` passed after the cache-stamp fix; `pnpm turbo test` passed with engine `164/164 files passed`.
- Schema artifacts and schemaVersion 3 contract: `pnpm -F @ludoforge/engine run schema:artifacts:check` passed, and `pnpm turbo schema:artifacts` regenerated the artifact.
- Root canonical lanes: `pnpm turbo build`, `pnpm turbo test`, `pnpm turbo lint`, and `pnpm turbo typecheck` all passed.

Source-size ledger:
- `packages/engine/src/cnl/compile-agents.ts` is pre-existing large (5913 lines after change). Net-new plan lowering logic was extracted to the new 155-line `compile-agent-plan-templates.ts` and 27-line `compile-agent-role-selectors.ts`; the compiler file kept only orchestration/dependency wiring.
- `packages/engine/src/kernel/schemas-core.ts` and `packages/engine/src/kernel/types-core.ts` are pre-existing large contract files. This ticket changed their shared agent schema/type contracts in place to keep type and Zod surfaces synchronized; no helper extraction was useful for these declarations.

Deviation from plan:
- The ticket requested schemaVersion 3 migration; applying it truthfully required updating existing test fixtures and tracked policy-catalog golden JSON that still carried schemaVersion 2. No compatibility shim was added.
- The initial package test exposed stale GameDef cache reuse. The test was kept intact and the cache stamp was corrected, then the failing Texas schema validation test and the full lanes were rerun.

Verification:
- `pnpm -F @ludoforge/engine build`
- `node --test dist/test/unit/cnl/agent-plan-template-compile.test.js` (from `packages/engine`)
- `pnpm -F @ludoforge/engine schema:artifacts`
- `pnpm -F @ludoforge/engine run schema:artifacts:check`
- `pnpm -F @ludoforge/engine test`
- `pnpm turbo build`
- `pnpm turbo test`
- `pnpm turbo lint`
- `pnpm turbo typecheck`
- `pnpm turbo schema:artifacts`
