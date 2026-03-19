# 15GAMAGEPOLIR-023: Separate Policy Binding Roles From Runtime Player Identity for Symmetric Games

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — policy authoring/compiled IR identity contract, compiler/runtime identity resolution, integration coverage
**Deps**: specs/15-gamespec-agent-policy-ir.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-012-author-baseline-texas-holdem-policy-library-profiles-and-bindings.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-019-extract-policy-runtime-surface-provider-contracts-from-monolithic-evaluator.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-020-split-policy-surface-refs-into-discriminated-current-and-preview-ir-variants.md

## Problem

The current policy identity model overloads one concept, "seat id", for two different jobs:

1. selecting a reusable authored profile binding
2. identifying the concrete runtime player instance whose per-player surfaces `self`, `active`, and seat-scoped refs should read

That works only when canonical seat ids are unique per runtime player, as in FITL. It is the wrong architecture for symmetric games like Texas Hold'em, where multiple runtime players share one canonical role such as `neutral`.

Ticket 012 fixed only the narrow binding symptom by letting a single canonical binding apply across symmetric players. It did not solve the deeper architectural gap: richer player-scoped policy surfaces still cannot cleanly distinguish runtime self/active identity from shared role identity. If we leave that conflation in place, future policy refs will either stay artificially weak for symmetric games or drift toward hacks such as "first matching neutral seat".

## Assumption Reassessment (2026-03-19)

1. `packages/engine/src/kernel/identity.ts` still builds `playerIndexBySeatId` as a one-to-one map keyed by canonical seat id, so duplicate role ids collapse to the first player index.
2. `packages/engine/src/agents/policy-runtime.ts`, `packages/engine/src/agents/policy-preview.ts`, and the compiled policy ref model still treat player-scoped reads as seat-token resolution problems rather than as explicit runtime-player resolution problems.
3. Spec 15 is currently precise about bindings being keyed by canonical seat ids, but it is still too loose about the difference between reusable role bindings and runtime player-instance selectors in symmetric games.
4. Texas Hold'em now proves the issue is real: the production game binds one baseline policy under `neutral`, but a future authored policy that needs `self`-scoped per-player vars or preview/victory surfaces would still sit on an ambiguous identity contract.
5. No active ticket owns this redesign. Ticket 013 is only the regression suite and must not freeze the interim compromise as canonical architecture.
6. Corrected scope: introduce one generic policy identity model that cleanly separates binding roles from runtime player identity, update authored/compiled refs to use that model explicitly, and migrate FITL/Texas authored policy data onto it. Do not add game-specific exceptions or backwards-compatibility aliases.

## Architecture Check

1. The clean solution is to separate reusable policy role binding from runtime player selection explicitly, not to keep stretching the old overloaded "seat" concept with more special cases.
2. This preserves the intended architecture boundary: `GameSpecDoc` continues to author game-specific policy data, while `GameDef`, compiler output, identity indexes, and runtime providers stay generic and reusable.
3. The redesign should make ambiguous reads impossible by construction. A role-scoped selector and a player-scoped selector are different concepts and should be different authored/compiled ref kinds.
4. No backwards-compatibility shim should keep the old overloaded seat-token path alive. If authored syntax or compiled IR needs to change to become correct, change it and migrate the authored policy fragments.
5. `visual-config.yaml` stays completely outside this contract.

## What to Change

### 1. Introduce a two-layer policy identity model

Define one generic identity contract with:

- `roleId`: the reusable canonical binding key selected from authored game/scenario data
- `playerIdentity`: the concrete runtime player instance used for `self`, `active`, and per-player/current/preview/victory reads

The compiler/runtime identity index must support:

- `roleIdByPlayerIndex`
- stable runtime player identity selection for `self` and `active`
- one-to-many lookup from role id to runtime players without collapsing duplicates to the first match

### 2. Split authored policy selectors into role-scoped vs player-scoped forms

Replace the overloaded policy "seat token" concept with explicit selectors:

- player-scoped selectors for `self`, `active`, and any future relative player targeting
- role-scoped selectors for reusable canonical role references

The compiler must reject ambiguous role-scoped reads in symmetric scenarios unless the selector kind guarantees one concrete player. The runtime must never guess.

### 3. Lower the new identity model into compiled policy IR and runtime providers

Update the compiled current-surface and preview-surface ref kinds so they carry the correct selector category.

Update:

- policy ref lowering
- policy surface visibility lookup
- runtime provider resolution
- preview provider resolution
- seat/player identity indexing

so all policy-surface reads route through the explicit role-vs-player contract.

### 4. Migrate authored game policies onto the new contract

Update FITL and Texas authored policy fragments to the new selector model.

Texas should then be able to grow richer self-scoped policy signals later without any special engine branch. FITL should continue to work naturally because its canonical roles are already unique per player.

### 5. Add parity and ambiguity-rejection coverage

Add tests that prove:

- symmetric games resolve profile bindings by role but resolve `self`/`active` reads by runtime player
- asymmetric games preserve current authored behavior under the clearer contract
- ambiguous role-scoped per-player reads are rejected at compile time instead of being resolved by first-match runtime behavior

## Files to Touch

- `specs/15-gamespec-agent-policy-ir.md` (modify)
- `packages/engine/src/kernel/identity.ts` (modify)
- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/src/cnl/compile-agents.ts` (modify)
- `packages/engine/src/agents/policy-surface.ts` (modify)
- `packages/engine/src/agents/policy-runtime.ts` (modify)
- `packages/engine/src/agents/policy-preview.ts` (modify)
- `packages/engine/src/agents/policy-eval.ts` (modify)
- `packages/engine/test/unit/compile-agents-authoring.test.ts` (modify)
- `packages/engine/test/unit/agents/policy-eval.test.ts` (modify)
- `packages/engine/test/unit/agents/policy-preview.test.ts` (modify)
- `packages/engine/test/unit/agents/policy-agent.test.ts` (modify)
- `packages/engine/test/unit/property/policy-visibility.test.ts` (modify)
- `packages/engine/test/integration/fitl-policy-agent.test.ts` (modify if selector syntax changes)
- `packages/engine/test/integration/texas-holdem-policy-agent.test.ts` (modify)
- `data/games/fire-in-the-lake/92-agents.md` (modify if selector syntax changes)
- `data/games/texas-holdem/92-agents.md` (modify)

## Out of Scope

- adding poker-strength heuristics, derived metrics, or search behavior
- new runner/CLI UX around agent selection
- browser/visual performance work
- game-specific engine branches for Texas, FITL, or any future symmetric game
- generic multi-agent query syntax beyond what is required to make role-vs-player identity unambiguous

## Acceptance Criteria

### Tests That Must Pass

1. Compiler tests prove role-scoped and player-scoped policy selectors lower into distinct compiled IR forms and reject ambiguous symmetric-game role reads.
2. Runtime tests prove symmetric games bind authored profiles by role while `self` and `active` policy surfaces resolve to the concrete runtime player instance.
3. FITL and Texas integration tests prove both asymmetric and symmetric production policy packs still compile and run under the unified identity contract without hidden-info leakage or emergency fallback regressions.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Profile binding keys and runtime player identity are distinct concepts with distinct generic owners.
2. `GameDef`, simulator, kernel, and policy runtime remain game-agnostic; no game-specific identity branches are introduced.
3. Ambiguous policy-surface reads are rejected explicitly; the runtime never "picks the first matching player" for a duplicated role id.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-agents-authoring.test.ts` — lower/validate role-scoped vs player-scoped selector kinds and ambiguity diagnostics.
2. `packages/engine/test/unit/agents/policy-eval.test.ts` — runtime player-vs-role resolution through the provider contract.
3. `packages/engine/test/unit/agents/policy-preview.test.ts` — preview identity routing for symmetric `self`/`active` reads.
4. `packages/engine/test/unit/agents/policy-agent.test.ts` — agent binding parity for symmetric and asymmetric games after the redesign.
5. `packages/engine/test/unit/property/policy-visibility.test.ts` — hidden-info invariants still hold after the identity split.
6. `packages/engine/test/integration/texas-holdem-policy-agent.test.ts` — production symmetric-game policy behavior under the new identity model.
7. `packages/engine/test/integration/fitl-policy-agent.test.ts` — production asymmetric-game regression coverage under the new identity model.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/compile-agents-authoring.test.js packages/engine/dist/test/unit/agents/policy-eval.test.js packages/engine/dist/test/unit/agents/policy-preview.test.js packages/engine/dist/test/unit/agents/policy-agent.test.js packages/engine/dist/test/unit/property/policy-visibility.test.js packages/engine/dist/test/integration/fitl-policy-agent.test.js packages/engine/dist/test/integration/texas-holdem-policy-agent.test.js`
3. `pnpm -F @ludoforge/engine lint`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm run check:ticket-deps`
