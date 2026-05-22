# 191PLAROLSEM-001: Role-constraint runtime/compile parity (registry; compile-reject `locatedIn`)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `agents` (plan-proposal constraint evaluator), `cnl` (plan-template validator)
**Deps**: `specs/191-plan-role-semantic-integrity.md`

## Problem

The compiler accepts plan role-constraint kinds that the runtime silently ignores. `constraintsSatisfied` (`packages/engine/src/agents/plan-proposal.ts:425–440`) handles `notEqual` and falls through to `return true` for everything else, while `CompiledPlanRoleConstraint` (`packages/engine/src/kernel/types-core.ts:1216`) admits both `notEqual` and `locatedIn`. So `locatedIn` is a no-op the compiler accepts — authored intent diverges from enforced behavior, violating the compiler/kernel validation boundary (Foundation #12). Spec 191 §4.1.

## Assumption Reassessment (2026-05-22)

1. `constraintsSatisfied` enforces only `notEqual` (`plan-proposal.ts:435`) and returns `true` for any other kind (`:438`) — verified this session.
2. `CompiledPlanRoleConstraint` is a discriminated union of `{ kind: 'notEqual' }` and `{ kind: 'locatedIn' }` at `kernel/types-core.ts:1216–1218` — verified this session.
3. `locatedIn` is authored **0 times** in `data/games/fire-in-the-lake/92-agents.md` (verified 2026-05-22) — so compile-rejecting it breaks no existing profile. This is the reassessed recommended disposition (compile-reject, not implement), per spec §4.1.

## Architecture Check

1. A single `SUPPORTED_PLAN_ROLE_CONSTRAINT_KINDS` set, consumed by both the runtime evaluator and the compiler validator, makes "accepted" and "enforced" the same set by construction — closing the accept-but-ignore gap at its root rather than per-kind (Foundation #15).
2. Generic machinery: the registry names constraint *kinds* (`notEqual`, `locatedIn`), not game concepts — no game-specific identifiers enter the engine (Foundation #1).
3. No shim: `locatedIn` is rejected at compile time until a runtime implementation exists, rather than left as an accepted no-op (Foundation #14). The runtime `return true` fall-through becomes unreachable for accepted specs.

## What to Change

### 1. Single source of truth for supported constraint kinds

Add `SUPPORTED_PLAN_ROLE_CONSTRAINT_KINDS` (the set the runtime actually enforces — initially `{ 'notEqual' }`) in a location both `agents/plan-proposal.ts` and `cnl/validate-agent-plan-templates.ts` import. Drive `constraintsSatisfied` from it so any kind not in the set is a hard internal error rather than a silent `return true`.

### 2. Compile-reject unsupported constraint kinds

In `validate-agent-plan-templates.ts`, reject any authored role constraint whose kind is not in `SUPPORTED_PLAN_ROLE_CONSTRAINT_KINDS`, with a role/constraint-named diagnostic (e.g., `role 'X' constraint 'locatedIn' has no runtime implementation`). `locatedIn` is rejected under this rule until implemented.

## Files to Touch

- `packages/engine/src/agents/plan-proposal.ts` (modify — `constraintsSatisfied`, registry-driven)
- `packages/engine/src/cnl/validate-agent-plan-templates.ts` (modify — reject unsupported kinds)
- `packages/engine/src/kernel/types-core.ts` (modify — only if the registry const is co-located with the type; otherwise a new small module under `agents/`)
- `packages/engine/test/unit/cnl/agent-plan-template-validate.test.ts` (modify — unsupported-kind diagnostic)
- `packages/engine/test/unit/agents/plan-proposal.test.ts` (modify — `notEqual` still enforced; registry drives evaluation)

## Out of Scope

- Implementing `locatedIn` runtime semantics — descoped per spec §4.1 (authored 0×; YAGNI). Re-add to the supported set only if a profile later needs it.
- Step-match field validation (191PLAROLSEM-002) and compound validation (191PLAROLSEM-003) — separate phases.

## Acceptance Criteria

### Tests That Must Pass

1. A crafted plan template with a `locatedIn` (or any unsupported-kind) role constraint fails compilation with a role/constraint-named diagnostic.
2. `notEqual` constraints continue to compile and are enforced at runtime (distinct-binding behavior unchanged).
3. Existing suite: `pnpm -F @ludoforge/engine test:all`.

### Invariants

1. The set of constraint kinds the compiler accepts equals `SUPPORTED_PLAN_ROLE_CONSTRAINT_KINDS` — no kind is accepted by the compiler but ignored by the runtime.
2. `constraintsSatisfied` never silently returns `true` for an unrecognized kind (unreachable for accepted specs; internal error otherwise).
3. Compiling the same GameSpecDoc twice yields byte-identical GameDef; diagnostics replay byte-identically.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cnl/agent-plan-template-validate.test.ts` — unsupported-constraint-kind rejection diagnostic.
2. `packages/engine/test/unit/agents/plan-proposal.test.ts` — registry-driven `constraintsSatisfied`, `notEqual` parity.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test dist/test/unit/cnl/agent-plan-template-validate.test.js dist/test/unit/agents/plan-proposal.test.js`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
