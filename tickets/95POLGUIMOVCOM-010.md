# 95POLGUIMOVCOM-010: Centralize policy contract vocabularies to prevent type/schema/validator drift

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — agents policy contract, kernel schemas, cnl validator/compiler
**Deps**: archive/tickets/95POLGUIMOVCOM-002.md

## Problem

Ticket `002` exposed a broader architectural weakness in the policy stack: key policy vocabularies are duplicated across multiple layers and can drift silently.

Concrete examples already observed:

- `candidateIntrinsic.paramCount` existed in `types-core.ts` but was missing from `schemas-core.ts`
- `completionScoreTerms` and `completionGuidance` required synchronized edits across types, schemas, compiler lowering, and validator allowlists

This is not a guided-completion-only problem. It is a generic policy-contract problem. Leaving these vocabularies hand-maintained in multiple files makes future policy work brittle and increases the chance of partial implementations that violate Foundations #8 and #10.

## Assumption Reassessment (2026-03-30)

1. Policy contract vocabularies are currently duplicated in several places, including `types-core.ts`, `schemas-core.ts`, `validate-agents.ts`, and `compile-agents.ts`. Confirmed.
2. The current codebase already uses shared constant tables in some areas, so introducing a small policy-contract module would fit existing architecture better than adding more ad hoc literal arrays. Confirmed by local patterns in validator/compiler code.
3. The problem is generic and engine-agnostic. It is about shared policy vocabulary ownership, not about FITL or any other game. Confirmed.
4. No active Spec 95 ticket currently owns this cleanup. Tickets `003` and `006` are adjacent, but neither should absorb a broader cross-layer contract-centralization refactor. Confirmed.

## Architecture Check

1. Cleanest approach: create one small shared policy-contract module that owns the canonical vocabulary for policy library buckets, profile-use buckets, completion-guidance keys, and ref intrinsics that must stay synchronized across compiler/schema/validator layers.
2. Engine agnosticism is preserved because the centralized contract contains only generic policy vocabulary and helper tables. No game-specific identifiers or branching belong there.
3. No backwards-compatibility shims: consumers should import the shared contract directly and delete duplicated local allowlists rather than aliasing them.
4. This directly supports Foundations #8 and #10 by making the compiler/schema/validator boundary explicit and harder to desynchronize.

## What to Change

### 1. Add a shared policy-contract module

Create a focused module that exports canonical constants and helpers for policy vocabulary that currently drifts across layers, for example:

- library section keys
- `profile.use` section keys
- `completionGuidance` allowed keys and fallback values
- compiled ref intrinsic name sets that must stay aligned between types, schemas, and lowering

Keep the module declarative. Do not add code generation or a large meta-framework.

### 2. Make validator, schema, and compiler consume the shared contract

Replace duplicated local literal arrays / sets in:

- `validate-agents.ts`
- `schemas-core.ts`
- `compile-agents.ts`

with imports from the shared policy-contract module wherever the vocabulary must match exactly.

### 3. Reduce drift-sensitive duplication without broad rewrites

Tighten only the surfaces that have already shown drift risk:

- completion-guidance authored keys
- compiled agent-library/profile buckets
- completion/decision/candidate intrinsic vocabularies used in schemas and lowering

Do not attempt to fully auto-generate TypeScript unions from runtime tables in this ticket. The goal is one practical source of truth, not a sweeping rewrite.

### 4. Add regression coverage for synchronization

Add or strengthen tests so that the synchronized surfaces are exercised through:

- authored validation
- lowering/compilation
- schema acceptance

The tests should specifically guard against reintroducing the kinds of drift found during ticket `002`.

## Files to Touch

- `packages/engine/src/agents/policy-contract.ts` (new)
- `packages/engine/src/cnl/validate-agents.ts` (modify)
- `packages/engine/src/cnl/compile-agents.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/test/unit/compile-agents-authoring.test.ts` (modify)
- `packages/engine/test/unit/schemas-top-level.test.ts` (modify)
- `packages/engine/test/unit/cnl/validate-agents-completion.test.ts` (new or modify)

## Out of Scope

- Runtime completion scoring or PolicyAgent integration
- Game-specific YAML changes
- A generalized schema/code-generation pipeline
- Refactoring unrelated policy-expression or evaluation code that is not part of the drift-prone contract surface

## Acceptance Criteria

### Tests That Must Pass

1. New/updated tests prove `completionGuidance` and `completionScoreTerms` are accepted consistently by validator, compiler, and compiled schema.
2. New/updated tests prove `candidateIntrinsic.paramCount` and the completion-specific ref intrinsics remain synchronized across lowering and schema acceptance.
3. No duplicated local allowlists remain for the targeted policy vocabularies in validator/compiler/schema code.
4. Existing suite: `pnpm -F @ludoforge/engine test` — all pass
5. Existing suite: `pnpm turbo typecheck` — all pass
6. Existing suite: `pnpm turbo lint` — all pass

### Invariants

1. Shared policy vocabulary remains generic and game-agnostic.
2. Validator/compiler/schema layers consume the same canonical contract for the targeted surfaces.
3. The ticket reduces duplication for drift-prone policy vocabularies without introducing alias layers or compatibility shims.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cnl/validate-agents-completion.test.ts` — proves validator behavior stays aligned with shared completion-guidance vocabulary.
2. `packages/engine/test/unit/compile-agents-authoring.test.ts` — proves lowering still accepts the shared completion vocabularies and ref intrinsics.
3. `packages/engine/test/unit/schemas-top-level.test.ts` — proves the compiled schema stays aligned with the same canonical contract surface.

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "completion|policy"` (targeted)
2. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint` (full suite)
