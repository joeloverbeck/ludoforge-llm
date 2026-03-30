# 95POLGUIMOVCOM-010: Centralize policy contract vocabularies and bucket mappings to prevent cross-layer drift

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
- ticket `003` had to add validator-side `profile.use.*` library-id cross-reference checks, but the validator and compiler still own the `profile.use` bucket mapping separately
- `zoneTokenAgg.owner` is currently typed and diagnosed as an unconstrained string / "literal seat id" surface even though the runtime zone-address contract is player-qualified (`zoneBase:none` or `zoneBase:${playerId}`), not seat-qualified

This is not a guided-completion-only problem. It is a generic policy-contract problem. Leaving these vocabularies hand-maintained in multiple files makes future policy work brittle and increases the chance of partial implementations that violate Foundations #8 and #10.

## Assumption Reassessment (2026-03-30)

1. Policy contract vocabularies are currently duplicated in several places, including `types-core.ts`, `schemas-core.ts`, `validate-agents.ts`, and `compile-agents.ts`. Confirmed.
2. The current codebase already uses shared constant tables in some areas, so introducing a small policy-contract module would fit existing architecture better than adding more ad hoc literal arrays. Confirmed by local patterns in validator/compiler code.
3. The problem is generic and engine-agnostic. It is about shared policy vocabulary ownership, not about FITL or any other game. Confirmed.
4. Ticket `003` intentionally stopped at a focused validator fix. It did not centralize the shared `profile.use` bucket mapping or eliminate the duplicated validator/compiler ownership of that mapping. Confirmed.
5. `zoneTokenAgg.owner` currently drifts across policy layers: `types-core.ts`/`schemas-core.ts` allow a raw string, `policy-expr.ts` diagnostics mention "literal seat id", while runtime zone lookup is player-qualified and does not meaningfully consume canonical seat ids for zone ownership. Confirmed.
6. Archived ticket `006` no longer owns any compiler work; it is now an archival record confirming that the completion-guidance authored/compiled surface already landed via tickets `002` and `003`. Confirmed.
7. No other active Spec 95 ticket owns this cleanup better than ticket `010`. Ticket `007` should stay focused on evaluator-core extraction, ticket `008` on PolicyAgent wiring, and ticket `009` on cross-cutting guided-completion tests. None of them should absorb a broader validator/compiler/schema contract-centralization refactor. Confirmed.

## Architecture Check

1. Cleanest approach: create one small shared policy-contract module that owns the canonical vocabulary for policy library buckets, profile-use buckets, completion-guidance keys, and the bucket-to-bucket mapping used by both validator and compiler.
2. Engine agnosticism is preserved because the centralized contract contains only generic policy vocabulary and helper tables. No game-specific identifiers or branching belong there.
3. No backwards-compatibility shims: consumers should import the shared contract directly and delete duplicated local allowlists rather than aliasing them.
4. This directly supports Foundations #8 and #10 by making the compiler/schema/validator boundary explicit and harder to desynchronize.
5. `zoneTokenAgg.owner` should be tightened to the runtime-meaningful vocabulary (`self`, `active`, `none`, and explicit runtime player ids if still needed), not seat ids. Seat identity and runtime player identity are separate concepts per Spec 15; letting zone ownership round-trip through seat ids is the wrong abstraction.

## What to Change

### 1. Add a shared policy-contract module

Create a focused module that exports canonical constants and helpers for policy vocabulary that currently drifts across layers, for example:

- library section keys
- `profile.use` section keys
- the canonical mapping from each `profile.use` key to its `library` bucket
- `completionGuidance` allowed keys and fallback values
- compiled ref intrinsic name sets that must stay aligned between types, schemas, and lowering
- policy expression vocabularies whose authored/runtime meaning must stay aligned, including `zoneTokenAgg.owner`

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
- `profile.use` bucket ownership and authored-library lookup mapping
- compiled agent-library/profile buckets
- completion/decision/candidate intrinsic vocabularies used in schemas and lowering
- `zoneTokenAgg.owner` authored vocabulary and diagnostics so authored policy does not imply unsupported seat-qualified runtime zone ownership

Do not attempt to fully auto-generate TypeScript unions from runtime tables in this ticket. The goal is one practical source of truth, not a sweeping rewrite.

### 4. Add regression coverage for synchronization

Add or strengthen tests so that the synchronized surfaces are exercised through:

- authored validation
- lowering/compilation
- schema acceptance

The tests should specifically guard against reintroducing the kinds of drift found during ticket `002`.

## Files to Touch

- `packages/engine/src/agents/policy-contract.ts` (new)
- `packages/engine/src/agents/policy-expr.ts` (modify)
- `packages/engine/src/cnl/validate-agents.ts` (modify)
- `packages/engine/src/cnl/compile-agents.ts` (modify)
- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/test/unit/compile-agents-authoring.test.ts` (modify)
- `packages/engine/test/unit/agents/policy-expr.test.ts` (modify)
- `packages/engine/test/unit/schemas-top-level.test.ts` (modify)
- `packages/engine/test/unit/cnl/validate-agents-completion.test.ts` (new or modify) or `packages/engine/test/unit/compile-agents-authoring.test.ts` (extend existing validator coverage if cleaner)

## Out of Scope

- Runtime completion scoring or PolicyAgent integration
- Game-specific YAML changes
- A generalized schema/code-generation pipeline
- Refactoring unrelated policy-expression or evaluation code that is not part of the drift-prone contract surface

## Acceptance Criteria

### Tests That Must Pass

1. New/updated tests prove `completionGuidance` and `completionScoreTerms` are accepted consistently by validator, compiler, and compiled schema.
2. New/updated tests prove `candidateIntrinsic.paramCount` and the completion-specific ref intrinsics remain synchronized across lowering and schema acceptance.
3. New/updated tests prove `zoneTokenAgg.owner` accepts only the runtime-meaningful authored vocabulary and no longer advertises seat ids as valid ownership selectors.
4. New/updated tests prove validator/compiler/schema layers consume the same canonical `profile.use` bucket mapping for library-id validation/lowering.
5. No duplicated local allowlists or ad hoc bucket-mapping tables remain for the targeted policy vocabularies in validator/compiler/schema code.
6. Existing suite: `pnpm -F @ludoforge/engine test` — all pass
7. Existing suite: `pnpm turbo typecheck` — all pass
8. Existing suite: `pnpm turbo lint` — all pass

### Invariants

1. Shared policy vocabulary remains generic and game-agnostic.
2. Validator/compiler/schema layers consume the same canonical contract for the targeted surfaces.
3. The ticket reduces duplication for drift-prone policy vocabularies without introducing alias layers or compatibility shims.
4. Policy authoring must not blur canonical seat ids with runtime player-qualified zone ownership.
5. Ticket ownership stays clean: adjacent guided-completion tickets consume the centralized contract but do not reintroduce local allowlists or bucket mappings.

## Test Plan

### New/Modified Tests

1. Validator coverage proving unknown `profile.use.*` ids and completion-guidance warnings still resolve through the shared canonical bucket mapping.
2. `packages/engine/test/unit/compile-agents-authoring.test.ts` — proves lowering still accepts the shared completion vocabularies and ref intrinsics.
3. `packages/engine/test/unit/agents/policy-expr.test.ts` — proves `zoneTokenAgg.owner` diagnostics and accepted vocabulary stay aligned with the canonical policy contract.
4. `packages/engine/test/unit/schemas-top-level.test.ts` — proves the compiled schema stays aligned with the same canonical contract surface.

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "completion|policy"` (targeted)
2. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint` (full suite)
