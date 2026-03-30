# 95POLGUIMOVCOM-012: Add dynamic `zoneProp` policy expressions for target-zone evaluation

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — policy expression/compiler/runtime surface
**Deps**: archive/tickets/95POLGUIMOVCOM/95POLGUIMOVCOM-010.md, archive/specs/95-policy-guided-move-completion.md, archive/tickets/95POLGUIMOVCOM/95POLGUIMOVCOM-009.md

## Problem

After ticket `010`, the policy runtime will be able to resolve dynamic target zones canonically, but the policy DSL will still only expose:

- current/preview global-per-player-derived-victory surfaces
- candidate intrinsics
- completion intrinsics
- `zoneTokenAgg`

That is still too narrow for durable target-space heuristics. Real policy authoring needs direct access to generic zone properties such as population, support/opposition markers, terrain flags, or other authored zone attrs for the dynamically selected target zone. Without a dynamic `zoneProp` expression, authors are pushed toward brittle hardcoded zone-name lists or explosion of game-level derived metrics that exist only to simulate an obvious missing primitive.

## Assumption Reassessment (2026-03-30)

1. `AgentPolicyExpr` currently has no policy-level `zoneProp` variant. Confirmed in `packages/engine/src/kernel/types-core.ts`.
2. The engine already has a generic kernel-level `zoneProp` reference for authored zone data. The real gap is policy-surface parity: policy expressions can aggregate tokens in a zone via `zoneTokenAgg`, but they still cannot read scalar zone properties through the policy DSL/runtime. Confirmed from `packages/engine/src/kernel/resolve-ref.ts`, `packages/engine/src/agents/policy-expr.ts`, and `packages/engine/src/agents/policy-evaluation-core.ts`.
3. Dynamic zone-address resolution is already implemented on the policy side for `zoneTokenAgg`, including completion-time `option.value` usage. This ticket should reuse that canonical policy runtime path rather than inventing a new zone-resolution mechanism. Confirmed by `packages/engine/test/unit/agents/policy-expr.test.ts`, `packages/engine/test/unit/agents/policy-eval.test.ts`, and `packages/engine/test/unit/agents/completion-guidance-eval.test.ts`.
4. `compile-agents.ts` already routes policy expressions through `analyzePolicyExpr`; no dedicated lowering branch exists today for `zoneTokenAgg`, and `zoneProp` should follow the same architecture. The likely compiler touch points are `types-core`, `policy-expr`, `policy-evaluation-core`, and the compiled agent schema in `schemas-core`, not a bespoke compile-agents path.
5. This gap should still be solved as a generic policy-expression capability, not by adding FITL-specific derived metrics, compatibility aliases, or hand-authored zone buckets.

## Architecture Check

1. The cleaner design is to add a first-class generic `zoneProp` policy expression, mirroring the engine’s existing concept of zone properties, rather than inventing per-game derived metrics or alias refs.
2. This preserves Foundation #1, #2, and #4: games continue to author their own zone props in YAML, while the policy DSL and runtime stay generic.
3. `zoneProp` should mirror kernel semantics for scalar properties, including synthetic `id` and `category` handling and fail-closed unknowns for unresolved zones/properties.
4. No backwards-compatibility shims: add the canonical expression form once and use it directly in future policy authoring. Do not create temporary FITL-only helper refs.

## What to Change

### 1. Extend the policy expression DSL with `zoneProp`

Add a new `AgentPolicyExpr` variant:

- `kind: 'zoneProp'`
- `zone: string | AgentPolicyExpr`
- `prop: string`

This should support both:

- static authored zone ids
- dynamic zone ids such as `{ ref: option.value }`

The zone id resolution must depend on the canonical zone-address contract from ticket `010`.

### 2. Compile and validate `zoneProp` through the normal policy-expression pipeline

Update policy-expression analysis and compiled schema validation so `zoneProp`:

- is parsed from authored YAML
- participates in dependency/cost-class analysis like other policy expressions
- validates malformed shapes and bad nested expressions on the correct field path

Do not introduce a one-off parser branch that bypasses the normal expression analysis path. `compile-agents.ts` should continue to rely on the shared `analyzePolicyExpr` pipeline instead of adding special handling.

### 3. Evaluate `zoneProp` generically at runtime

Update the shared policy evaluation core to:

- resolve the target zone canonically through the same helper already used by dynamic `zoneTokenAgg`
- read the authored zone property from zone definitions/runtime data, matching kernel `zoneProp` semantics for scalar properties
- return the scalar property value when available
- return `undefined` when the zone or property cannot be resolved safely

The first scope should target scalar zone properties only. Array-membership helpers such as `zonePropIncludes` belong in a separate follow-up if they are genuinely needed.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/agents/policy-expr.ts` (modify)
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/test/unit/agents/policy-expr.test.ts` (modify)
- `packages/engine/test/unit/agents/policy-eval.test.ts` (modify)
- `packages/engine/test/unit/agents/completion-guidance-eval.test.ts` (modify)
- `packages/engine/test/unit/compile-agents-authoring.test.ts` (modify)
- `packages/engine/test/unit/schemas-top-level.test.ts` (modify if compiled schema coverage is extended)

## Out of Scope

- Array-membership helpers such as `zonePropIncludes`
- Marker-specific or token-presence convenience operators
- FITL-specific policy authoring changes beyond what is needed to prove the new generic primitive
- Broader completion-search redesign

## Acceptance Criteria

### Tests That Must Pass

1. New unit test: `zoneProp` with a static zone id reads the expected scalar zone property.
2. New unit test: `zoneProp` with `{ ref: option.value }` reads the expected scalar property for a dynamic completion target zone.
3. New unit test: malformed/non-scalar/unresolved `zoneProp` evaluations return `undefined` or emit the correct diagnostics, depending on the failure mode.
4. New compile/authoring test: authored `completionScoreTerms` can use `zoneProp` with dynamic zones and compile successfully.
5. Existing `policy-expr`, `policy-eval`, `completion-guidance-eval`, and compile-authoring suites remain green.
6. Existing suite: `pnpm -F @ludoforge/engine test`
7. Full suite: `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`

### Invariants

1. `zoneProp` remains a generic policy-expression primitive; it does not encode any game-specific property names or semantics.
2. Dynamic zone resolution for `zoneProp` uses the same canonical contract as dynamic `zoneTokenAgg`.
3. Scalar synthetic props `id` and `category` behave the same way they do for kernel `zoneProp`.
4. Missing/unreadable/non-scalar zone properties fail closed to unknown rather than defaulting to fabricated values.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-expr.test.ts` — compile/analyze `zoneProp` with static and dynamic zones
2. `packages/engine/test/unit/agents/policy-eval.test.ts` — runtime semantics for static/dynamic `zoneProp`
3. `packages/engine/test/unit/agents/completion-guidance-eval.test.ts` — completion-option scoring via dynamic `option.value` zone props
4. `packages/engine/test/unit/compile-agents-authoring.test.ts` — authored YAML acceptance and diagnostics
5. `packages/engine/test/unit/schemas-top-level.test.ts` — compiled schema acceptance for the new agent expression variant, if the schema surface changes

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/agents/policy-expr.test.js packages/engine/dist/test/unit/agents/policy-eval.test.js packages/engine/dist/test/unit/agents/completion-guidance-eval.test.js packages/engine/dist/test/unit/compile-agents-authoring.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`

## Outcome

- Completion date: 2026-03-30
- What actually changed:
  - Added a first-class policy `zoneProp` expression variant to the compiled agent policy AST and compiled schema surface.
  - Reused the existing dynamic policy zone-resolution path so `zoneProp` and `zoneTokenAgg` share canonical runtime zone addressing.
  - Implemented policy-runtime scalar zone-property reads with kernel-parity handling for synthetic `id` and `category`, plus fail-closed behavior for missing or non-scalar properties.
  - Extended targeted tests across policy expression analysis, policy runtime evaluation, completion-guidance evaluation, authoring compilation, compiled-schema validation, and regenerated schema artifacts.
  - Fixed the policy diagnostics walker to recurse into nested dynamic zone expressions instead of treating `zoneTokenAgg`/`zoneProp` as opaque leaves.
- Deviations from original plan:
  - `compile-agents.ts` did not need a dedicated code change because the shared `analyzePolicyExpr` pipeline already owns policy-expression lowering.
  - The compiled authoring proof uses `coalesce(zoneProp(...), 0)` rather than a bare numeric `zoneProp` completion term, because raw `zoneProp` remains intentionally typed as `unknown` until constrained by surrounding operators.
  - `packages/engine/schemas/GameDef.schema.json` also changed as a required artifact refresh after the compiled schema update.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/unit/agents/policy-expr.test.js packages/engine/dist/test/unit/agents/policy-eval.test.js packages/engine/dist/test/unit/agents/completion-guidance-eval.test.js packages/engine/dist/test/unit/compile-agents-authoring.test.js packages/engine/dist/test/unit/schemas-top-level.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo test`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
