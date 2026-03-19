# 15GAMAGEPOLIR-018: Compile Policy Expressions Into Canonical Typed Runtime IR

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — `GameDef.agents` schema, policy compiler IR lowering, evaluator/runtime expression execution
**Deps**: specs/15-gamespec-agent-policy-ir.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-006-implement-policy-evaluator-core-for-pruning-scoring-and-tiebreaks.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-017-add-explicit-policy-visibility-ownership-for-preview-safe-runtime-surfaces.md

## Problem

`GameSpecDoc.agents` is intentionally authored as a compact YAML DSL, but `GameDef.agents` still stores compiled policy expressions in the same loose JSON shape. In practice that means compiled refs such as `metric.foo`, `preview.victory.currentMargin.us`, `candidate.param.target`, and `seat.self` remain opaque strings in runtime data. The compiler and runtime therefore keep re-parsing path strings and re-inferring ref categories after compilation. That is the wrong ownership boundary for a long-lived architecture: compiled IR should be normalized, typed, and self-describing.

## Assumption Reassessment (2026-03-19)

1. `packages/engine/src/kernel/types-core.ts` still defines `AgentPolicyExpr` as a generic recursive JSON union, so compiled policy IR does not distinguish authored syntax from normalized runtime representation.
2. Archived ticket 017 added a shared compiled visibility contract for policy-visible surfaces, but refs that consume that contract are still encoded as strings and require parsing in `packages/engine/src/agents/policy-surface.ts`, `packages/engine/src/agents/policy-eval.ts`, and `packages/engine/src/agents/policy-preview.ts`.
3. The current compiler/runtime split still relies on string prefixes such as `var.global.`, `preview.`, `candidate.param.`, and `victory.currentRank.` to determine semantics after compilation.
4. Spec 15 explicitly says authoring format and compiled IR are not the same structure; current code has improved that separation for catalogs and visibility, but not yet for expression refs themselves.
5. No backwards compatibility is required for `GameDef.agents`, so upgrading the compiled schema directly is the correct move.
6. Corrected scope: keep authored YAML ergonomics in `GameSpecDoc`, but replace the compiled expression/ref representation in `GameDef.agents` with a canonical typed IR that runtime code can execute without string parsing.

## Architecture Check

1. A canonical compiled expression IR is cleaner than continuing to normalize only part of the agent catalog while leaving refs as ad hoc strings that every runtime helper must parse again.
2. This preserves the intended boundary: `GameSpecDoc` remains the readable, game-specific authoring DSL; `GameDef.agents` becomes the normalized, game-agnostic execution contract.
3. Visibility, candidate-param typing, preview semantics, and runtime surface family are all stronger when represented explicitly in compiled data rather than reconstructed from string prefixes.
4. The design must upgrade `GameDef.agents` in place. Do not add alias schemas, dual readers, or legacy string-ref fallback paths.
5. `visual-config.yaml` remains presentation-only and must not participate in policy-expression lowering or runtime execution.

## What to Change

### 1. Replace compiled string refs with a discriminated typed ref model

Introduce a canonical compiled ref union for `GameDef.agents` that explicitly represents:

- internal library refs such as `feature.*` and `aggregate.*`
- current-state surface refs such as global vars, seat vars, metrics, and victory values
- preview refs as explicit preview wrappers around supported surface refs rather than `preview.` string prefixes
- candidate, seat, and turn built-ins as typed intrinsic refs

The compiled ref model must carry the fields runtime execution actually needs, such as seat token, candidate param id, surface family, and preview/current phase, without any string parsing.

### 2. Separate authored policy DSL from compiled expression IR

Keep `GameSpecDoc` policy expressions authored in the current DSL, but lower them into a compiled expression union dedicated to `GameDef.agents`.

That lowering must:

- normalize operators into an explicit compiled shape
- reject invalid authored refs before IR emission
- avoid preserving authored string refs inside compiled expressions
- keep fingerprints and schema artifacts based on the new normalized runtime IR

### 3. Remove runtime string parsing from policy execution paths

Update policy evaluation and preview execution so they consume the typed compiled ref nodes directly.

That includes:

- deleting or collapsing string-prefix parsing helpers that become unnecessary after typed lowering
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
- `packages/engine/src/agents/policy-surface.ts` (modify or delete if subsumed by typed IR)
- `packages/engine/schemas/GameDef.schema.json` (modify via schema artifacts)
- `packages/engine/test/unit/compile-agents-authoring.test.ts` (modify)
- `packages/engine/test/unit/agents/policy-eval.test.ts` (modify)
- `packages/engine/test/unit/agents/policy-preview.test.ts` (modify)
- `packages/engine/test/unit/property/core-types-validation.property.test.ts` (modify)
- `packages/engine/test/unit/schemas-top-level.test.ts` (modify)

## Out of Scope

- redesigning the authored `GameSpecDoc` YAML DSL unless a small syntax cleanup is strictly required by the new compiler boundary
- adding new policy-visible surface families beyond those already accepted by Spec 15 and current implementation
- benchmark tuning or heuristic authoring for FITL/Texas policies
- runner, CLI, or `visual-config.yaml` changes

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/unit/compile-agents-authoring.test.ts` proves authored refs lower into typed compiled ref nodes and that invalid refs never survive into compiled IR as opaque strings.
2. `packages/engine/test/unit/agents/policy-eval.test.ts` proves current-state execution consumes typed compiled refs without string-prefix parsing behavior.
3. `packages/engine/test/unit/agents/policy-preview.test.ts` proves preview execution consumes typed preview ref nodes and still respects the compiled visibility contract from ticket 017.
4. `packages/engine/test/unit/schemas-top-level.test.ts` and `packages/engine/test/unit/property/core-types-validation.property.test.ts` prove the upgraded `GameDef.agents` schema validates the new IR and rejects legacy string-ref compiled shapes.
5. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `GameDef.agents` stores normalized typed policy expressions; runtime execution never needs to infer policy ref semantics from string prefixes.
2. `GameSpecDoc` remains the only game-specific authoring surface; compiled policy IR remains game-agnostic and JSON-serializable.
3. No backwards-compatibility aliases, dual schema versions, or runtime fallback parsers are introduced for legacy string-ref IR.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-agents-authoring.test.ts` — compiler lowering of authored DSL refs into typed compiled IR.
2. `packages/engine/test/unit/agents/policy-eval.test.ts` — evaluator execution through typed current-state refs.
3. `packages/engine/test/unit/agents/policy-preview.test.ts` — preview execution through typed preview refs plus visibility enforcement.
4. `packages/engine/test/unit/property/core-types-validation.property.test.ts` — structural validation of the upgraded compiled policy IR contract.
5. `packages/engine/test/unit/schemas-top-level.test.ts` — top-level schema rejection of legacy/invalid compiled ref shapes.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/compile-agents-authoring.test.js packages/engine/dist/test/unit/agents/policy-eval.test.js packages/engine/dist/test/unit/agents/policy-preview.test.js packages/engine/dist/test/unit/property/core-types-validation.property.test.js packages/engine/dist/test/unit/schemas-top-level.test.js`
3. `pnpm -F @ludoforge/engine lint`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm run check:ticket-deps`
