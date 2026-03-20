# 15GAMAGEPOLIR-018: Compile Policy Expressions Into Canonical Typed Runtime IR

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — `GameDef.agents` compiled expression schema/IR, policy compiler lowering, evaluator/runtime expression execution
**Deps**: specs/15-gamespec-agent-policy-ir.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-006-implement-policy-evaluator-core-for-pruning-scoring-and-tiebreaks.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-017-add-explicit-policy-visibility-ownership-for-preview-safe-runtime-surfaces.md

## Problem

`GameSpecDoc.agents` is intentionally authored as a compact YAML DSL, but `GameDef.agents` still stores compiled policy expressions in the same loose JSON shape. In practice that means compiled refs such as `metric.foo`, `preview.victory.currentMargin.us`, `candidate.param.target`, and `seat.self` remain opaque strings in runtime data. The compiler and runtime therefore keep re-parsing path strings and re-inferring ref categories after compilation. That is the wrong ownership boundary for a long-lived architecture: compiled IR should be normalized, typed, and self-describing.

## Assumption Reassessment (2026-03-19)

1. `packages/engine/src/kernel/types-core.ts` still defines `AgentPolicyExpr` as a generic recursive JSON union, and `packages/engine/src/kernel/schemas-core.ts` validates the same loose shape. Compiled policy expressions therefore still preserve authored operator objects and string refs instead of a dedicated runtime AST.
2. Ticket 017 already introduced compiled policy surface visibility metadata in `GameDef.agents.surfaceVisibility`. That part of the typed runtime contract exists today; the remaining gap is that expression refs still consume it indirectly through string parsing.
3. The compiler currently validates refs via structured helpers, but then stores the original authored expression nodes by casting `GameSpecPolicyExpr` to `AgentPolicyExpr` in `packages/engine/src/cnl/compile-agents.ts`. Runtime execution in `packages/engine/src/agents/policy-eval.ts` and `packages/engine/src/agents/policy-preview.ts` still branches on string prefixes such as `feature.`, `aggregate.`, `preview.`, `candidate.param.`, and `victory.currentRank.`.
4. `packages/engine/src/agents/policy-surface.ts` is currently valuable as a compile-time/runtime surface classifier, so deleting it is not a goal by itself. Reuse or narrow it only if the resulting architecture is cleaner.
5. Spec 15 explicitly says authoring format and compiled IR are not the same structure. Current code already honors that separation for profiles, bindings, parameter defs, candidate-param defs, dependency plans, and visibility contracts, but not yet for compiled expression nodes.
6. No backwards compatibility is required for `GameDef.agents`, so the right architecture is to upgrade the compiled expression schema in place and reject legacy compiled string-ref shapes.
7. Corrected scope: keep authored YAML ergonomics in `GameSpecDoc`, but replace the compiled expression/ref representation in `GameDef.agents` with a canonical typed AST that runtime code can execute without reparsing authored strings.

## Architecture Check

1. A canonical compiled expression AST is materially better than the current architecture because it removes authored-shape leakage from runtime, centralizes validation in the compiler, and turns expression execution into a closed set of typed nodes.
2. This preserves the intended boundary: `GameSpecDoc` remains the readable, game-specific authoring DSL; `GameDef.agents` becomes the normalized, game-agnostic execution contract.
3. Visibility, candidate-param typing, preview semantics, and runtime surface families become explicit data rather than conventions reconstructed from string prefixes. That is a long-term extensibility win.
4. The design must upgrade `GameDef.agents` in place. Do not add alias schemas, dual readers, or legacy string-ref fallback paths.
5. Prefer a small, explicit compiled node taxonomy over a generic "operator-name plus arbitrary payload" object if both solve the problem. The runtime contract should be easy to exhaustively switch over and difficult to misuse.
6. `visual-config.yaml` remains presentation-only and must not participate in policy-expression lowering or runtime execution.

## What to Change

### 1. Replace compiled string refs with a discriminated typed ref model

Introduce a canonical compiled ref union for `GameDef.agents` that explicitly represents:

- library refs such as state features, candidate features, and aggregates
- current-state surface refs such as global vars, seat vars, metrics, and victory values
- preview refs as explicit preview wrappers or preview-phase surface refs rather than `preview.` string prefixes
- candidate params plus candidate/seat/turn built-ins as typed intrinsic refs

The compiled ref model must carry the fields runtime execution actually needs, such as dependency family, seat token, candidate param id, surface family, and preview/current phase, without any string parsing.

### 2. Separate authored policy DSL from compiled expression IR

Keep `GameSpecDoc` policy expressions authored in the current DSL, but lower them into a compiled expression union dedicated to `GameDef.agents`.

That lowering must:

- normalize operators into an explicit compiled node shape
- reject invalid authored refs before IR emission
- avoid preserving authored string refs inside compiled expressions
- keep fingerprints and schema artifacts based on the new normalized runtime IR
- keep compile-time type/cost/dependency analysis aligned with the lowered AST rather than re-analyzing raw authored nodes later

### 3. Remove runtime string parsing from policy execution paths

Update policy evaluation and preview execution so they consume the typed compiled ref nodes directly.

That includes:

- deleting or collapsing string-prefix parsing branches that become unnecessary after typed lowering
- resolving preview/current visibility from the compiled surface contract using structured ref data
- keeping diagnostics deterministic and explicit when an impossible ref shape reaches runtime

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/src/cnl/compile-agents.ts` (modify)
- `packages/engine/src/agents/policy-expr.ts` (modify)
- `packages/engine/src/agents/policy-eval.ts` (modify)
- `packages/engine/src/agents/policy-preview.ts` (modify)
- `packages/engine/src/agents/policy-ir.ts` (modify)
- `packages/engine/src/agents/policy-surface.ts` (modify if needed; retain if it remains the clean home for surface/ref helpers)
- `packages/engine/schemas/GameDef.schema.json` (modify via schema artifacts)
- `packages/engine/test/unit/compile-agents-authoring.test.ts` (modify)
- `packages/engine/test/unit/agents/policy-expr.test.ts` (modify)
- `packages/engine/test/unit/agents/policy-eval.test.ts` (modify)
- `packages/engine/test/unit/agents/policy-preview.test.ts` (modify)
- `packages/engine/test/unit/property/policy-visibility.test.ts` (modify)
- `packages/engine/test/unit/property/core-types-validation.property.test.ts` (modify)
- `packages/engine/test/unit/schemas-top-level.test.ts` (modify)

## Out of Scope

- redesigning the authored `GameSpecDoc` YAML DSL unless a small syntax cleanup is strictly required by the new compiler boundary
- adding new policy-visible surface families beyond those already accepted by Spec 15 and current implementation
- benchmark tuning or heuristic authoring for FITL/Texas policies
- runner, CLI, or `visual-config.yaml` changes

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/unit/compile-agents-authoring.test.ts` proves authored refs lower into typed compiled AST nodes and that invalid refs never survive into compiled IR as opaque strings.
2. `packages/engine/test/unit/agents/policy-expr.test.ts` proves analysis/lowering produces typed runtime refs, preserves dependency metadata, and rejects invalid nested/legacy shapes.
3. `packages/engine/test/unit/agents/policy-eval.test.ts` proves current-state execution consumes typed compiled refs without string-prefix parsing behavior.
4. `packages/engine/test/unit/agents/policy-preview.test.ts` proves preview execution consumes typed preview refs and still respects the compiled visibility contract from ticket 017.
5. `packages/engine/test/unit/property/policy-visibility.test.ts` proves preview-backed evaluation remains invariant across hidden-state differences under the new compiled AST.
6. `packages/engine/test/unit/schemas-top-level.test.ts` and `packages/engine/test/unit/property/core-types-validation.property.test.ts` prove the upgraded `GameDef.agents` schema validates the new IR and rejects legacy compiled string-ref shapes.
7. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `GameDef.agents` stores normalized typed policy expressions; runtime execution never needs to infer policy ref semantics from authored string prefixes.
2. `GameSpecDoc` remains the only game-specific authoring surface; compiled policy IR remains game-agnostic and JSON-serializable.
3. No backwards-compatibility aliases, dual schema versions, or runtime fallback parsers are introduced for legacy string-ref IR.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-agents-authoring.test.ts` — compiler lowering of authored DSL refs into typed compiled AST nodes.
2. `packages/engine/test/unit/agents/policy-expr.test.ts` — analysis/lowering coverage for typed refs, dependencies, and invalid legacy shapes.
3. `packages/engine/test/unit/agents/policy-eval.test.ts` — evaluator execution through typed current-state refs.
4. `packages/engine/test/unit/agents/policy-preview.test.ts` — preview execution through typed preview refs plus visibility enforcement.
5. `packages/engine/test/unit/property/policy-visibility.test.ts` — evaluator invariance across hidden-state differences with preview-backed refs.
6. `packages/engine/test/unit/property/core-types-validation.property.test.ts` — structural validation of the upgraded compiled policy IR contract.
7. `packages/engine/test/unit/schemas-top-level.test.ts` — top-level schema rejection of legacy/invalid compiled ref shapes.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/compile-agents-authoring.test.js packages/engine/dist/test/unit/agents/policy-expr.test.js packages/engine/dist/test/unit/agents/policy-eval.test.js packages/engine/dist/test/unit/agents/policy-preview.test.js packages/engine/dist/test/unit/property/policy-visibility.test.js packages/engine/dist/test/unit/property/core-types-validation.property.test.js packages/engine/dist/test/unit/schemas-top-level.test.js`
3. `pnpm -F @ludoforge/engine lint`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm run check:ticket-deps`

## Outcome

- Completion date: 2026-03-19
- What actually changed: replaced compiled policy expressions in `GameDef.agents` with a dedicated discriminated AST; lowered authored policy DSL into typed library/runtime/preview/candidate-param ref nodes during compile; removed evaluator/preview runtime string-prefix ref parsing; regenerated `GameDef.schema.json`; updated compiler/runtime/schema/property tests to assert the new AST and reject legacy compiled string-ref shapes.
- Deviations from original plan: retained `packages/engine/src/agents/policy-surface.ts` as the clean home for surface parsing/visibility helpers instead of deleting it; kept visibility in the shared compiled surface catalog rather than duplicating it inside compiled ref nodes.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/unit/compile-agents-authoring.test.js packages/engine/dist/test/unit/agents/policy-expr.test.js packages/engine/dist/test/unit/agents/policy-eval.test.js packages/engine/dist/test/unit/agents/policy-preview.test.js packages/engine/dist/test/unit/property/policy-visibility.test.js packages/engine/dist/test/unit/property/core-types-validation.property.test.js packages/engine/dist/test/unit/schemas-top-level.test.js`
  - `pnpm -F @ludoforge/engine lint`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm run check:ticket-deps`
