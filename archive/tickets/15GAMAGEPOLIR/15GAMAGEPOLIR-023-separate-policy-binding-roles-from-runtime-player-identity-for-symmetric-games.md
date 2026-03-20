# 15GAMAGEPOLIR-023: Separate Policy Binding Roles From Runtime Player Identity for Symmetric Games

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — policy authoring/compiled IR identity contract, compiler/runtime identity resolution, integration coverage
**Deps**: specs/15-gamespec-agent-policy-ir.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-012-author-baseline-texas-holdem-policy-library-profiles-and-bindings.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-019-extract-policy-runtime-surface-provider-contracts-from-monolithic-evaluator.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-020-split-policy-surface-refs-into-discriminated-current-and-preview-ir-variants.md

## Problem

The remaining policy identity bug is narrower than this ticket originally claimed.

Profile binding is already keyed by canonical seat id and already works for symmetric games such as Texas Hold'em. The unresolved architectural problem is that player-targeted policy surface reads still route through the same canonical seat token path:

1. reusable authored profile binding is keyed by canonical seat id
2. player-targeted per-player surface reads (`var.seat.self.*`, `var.seat.active.*`, preview equivalents) are also resolved back through canonical seat ids

That second step is the bug. In a symmetric game where multiple runtime players share one canonical role such as `neutral`, resolving `self` or `active` through a seat id collapses onto the first matching runtime player. The clean fix is not to redesign the whole binding model; it is to separate role-scoped reads from runtime-player-scoped reads where the distinction actually matters.

## Assumption Reassessment (2026-03-19)

1. `packages/engine/src/kernel/identity.ts` still builds first-match seat-to-player lookup maps. That is acceptable for canonical seat resolution, but it is not a correct runtime-player selector for duplicate-role games.
2. `packages/engine/src/agents/policy-runtime.ts` and `packages/engine/src/agents/policy-preview.ts` still resolve per-player policy refs by turning `self`/`active` back into seat ids and then looking up a player index from the first matching seat.
3. Spec 15 is already correct that bindings are keyed by canonical seat ids. The stale part is its ref contract language: it still treats `var.seat.*` plus `self`/`active` as the general path for player-targeted reads.
4. Texas Hold'em already proves the binding half works: the production game binds one authored profile under `neutral` and applies it across symmetric players. The remaining gap is latent because the current Texas policy pack does not yet read per-player vars.
5. FITL already uses `var.seat.self.resources`, which happens to work only because FITL seat ids are unique per runtime player. That authored contract is too weak to carry forward as the generic model.
6. Corrected scope: keep canonical seat ids as reusable binding roles, introduce explicit runtime-player selectors for per-player policy surfaces, reject ambiguous role-scoped per-player reads when a spec can instantiate duplicate roles, and migrate authored policy refs that mean "the acting player" onto the explicit player-scoped form. Do not add backwards-compatibility aliases.

## Architecture Check

1. Canonical seat ids are still the right generic binding key. Replacing them everywhere would be churn without architectural benefit.
2. The clean split belongs at the policy surface layer: role-scoped selectors remain canonical seat ids, while runtime-player selectors become explicit and bypass seat-to-player first-match lookup.
3. This preserves the intended architecture boundary: `GameSpecDoc` continues to author game-specific policy data, while `GameDef`, compiler output, and runtime providers stay generic and reusable.
4. Ambiguous per-player reads should be rejected, not guessed. A role-scoped per-player ref is only valid when the spec cannot instantiate duplicate runtime players for that role.
5. No backwards-compatibility shim should keep the old overloaded `var.seat.self.*` path alive. Migrate authored policy fragments to the explicit player-scoped form.
6. `visual-config.yaml` stays completely outside this contract.

## What to Change

### 1. Keep binding roles as canonical seat ids

Do not replace `bindingsBySeat` or the existing canonical-seat binding model. It is already the correct generic abstraction for reusable authored profile selection.

### 2. Introduce explicit runtime-player selectors for per-player policy surfaces

Split per-player surface selectors into:

- player-scoped selectors for `self` and `active`
- role-scoped selectors for canonical seat ids

Authoring that means moving "acting player" reads off the overloaded `var.seat.self.*` shape and onto an explicit player-scoped form.

### 3. Lower the selector split into compiled policy IR and runtime providers

Update the compiled current-surface and preview-surface per-player ref model so it carries the correct selector category.

Update:

- policy ref lowering
- policy surface parsing/validation
- runtime provider resolution
- preview provider resolution

so explicit player-scoped refs resolve directly to runtime players, while role-scoped refs remain canonical seat reads with explicit ambiguity checks.

### 4. Reject ambiguous role-scoped per-player refs

If a spec can instantiate duplicate runtime players for one canonical role, role-scoped per-player refs must be rejected during compilation instead of being resolved by first-match runtime behavior.

### 5. Migrate authored policy refs that mean "acting player"

Update authored policy fragments that currently mean "the acting player" to use the explicit player-scoped form.

FITL should migrate `self` per-player reads even though they currently work, because the new authored form is the durable contract. Texas production policy data does not need a semantic change unless a ref actually targets per-player state.

### 6. Add parity and ambiguity-rejection coverage

Add tests that prove:

- symmetric games still resolve profile bindings by canonical role
- explicit player-scoped per-player refs resolve by runtime player, not first matching role
- asymmetric games preserve behavior under the clearer contract
- ambiguous role-scoped per-player reads are rejected at compile time

## Files to Touch

- `specs/15-gamespec-agent-policy-ir.md` (modify)
- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/src/cnl/compile-agents.ts` (modify)
- `packages/engine/src/agents/policy-surface.ts` (modify)
- `packages/engine/src/agents/policy-runtime.ts` (modify)
- `packages/engine/src/agents/policy-preview.ts` (modify)
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
- generic multi-agent query syntax beyond what is required to make role-vs-player identity unambiguous for per-player policy surfaces

## Acceptance Criteria

### Tests That Must Pass

1. Compiler tests prove role-scoped and player-scoped per-player selectors lower into distinct compiled IR forms and reject ambiguous symmetric-game role reads.
2. Runtime tests prove symmetric games still bind authored profiles by canonical role while explicit player-scoped per-player refs resolve to the concrete runtime player instance.
3. FITL and Texas integration tests prove asymmetric and symmetric production policy packs still compile and run under the refined contract without hidden-info leakage or emergency fallback regressions.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Profile binding keys and runtime-player selectors are distinct concepts with distinct generic owners.
2. `GameDef`, simulator, kernel, and policy runtime remain game-agnostic; no game-specific identity branches are introduced.
3. Ambiguous role-scoped per-player reads are rejected explicitly; the runtime never "picks the first matching player" for a duplicated role id.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-agents-authoring.test.ts` — lower/validate role-scoped vs player-scoped per-player selector kinds and ambiguity diagnostics.
2. `packages/engine/test/unit/agents/policy-eval.test.ts` — runtime player-vs-role resolution through the provider contract.
3. `packages/engine/test/unit/agents/policy-preview.test.ts` — preview identity routing for symmetric player-scoped refs.
4. `packages/engine/test/unit/agents/policy-agent.test.ts` — agent binding parity for symmetric and asymmetric games after the selector split.
5. `packages/engine/test/unit/property/policy-visibility.test.ts` — hidden-info invariants still hold after the per-player selector split.
6. `packages/engine/test/integration/texas-holdem-policy-agent.test.ts` — production symmetric-game policy behavior still binds and runs correctly.
7. `packages/engine/test/integration/fitl-policy-agent.test.ts` — production asymmetric-game regression coverage after migrating authored self-scoped per-player refs.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/compile-agents-authoring.test.js packages/engine/dist/test/unit/agents/policy-eval.test.js packages/engine/dist/test/unit/agents/policy-preview.test.js packages/engine/dist/test/unit/agents/policy-agent.test.js packages/engine/dist/test/unit/property/policy-visibility.test.js packages/engine/dist/test/integration/fitl-policy-agent.test.js packages/engine/dist/test/integration/texas-holdem-policy-agent.test.js`
3. `pnpm -F @ludoforge/engine lint`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm run check:ticket-deps`

## Outcome

- Completed: 2026-03-19
- What actually changed:
  - corrected the ticket/spec assumption that binding was still the broken layer; the implemented fix keeps `bindingsBySeat` as the canonical role-binding contract and moves the split down into policy surface selectors
  - introduced explicit player-scoped per-player policy refs in compiled IR via a discriminated selector model, while preserving role-scoped selectors for canonical seat-based surfaces
  - taught the compiler to accept `var.player.self.<id>` / `var.player.active.<id>` and to reject ambiguous role-scoped per-player refs when the spec can instantiate duplicate runtime roles
  - updated runtime and preview providers so player-scoped per-player refs resolve directly by runtime player index rather than first-match seat lookup
  - migrated FITL authored self-scoped per-player usage to `var.player.self.resources`
  - regenerated `packages/engine/schemas/GameDef.schema.json` for the new selector contract
- Deviations from original plan:
  - did not redesign `packages/engine/src/kernel/identity.ts` or replace the binding-role model; that would have been architectural churn without solving the actual bug
  - did not broaden the change to non-per-player policy surfaces beyond moving them onto the new compiled selector wrapper where needed
  - did not modify Texas authored policy data because the production Texas pack does not currently read per-player vars; the binding/runtime architecture is now ready for that future work without aliases
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed
  - `node --test packages/engine/dist/test/unit/compile-agents-authoring.test.js packages/engine/dist/test/unit/agents/policy-eval.test.js packages/engine/dist/test/unit/agents/policy-preview.test.js packages/engine/dist/test/unit/property/policy-visibility.test.js packages/engine/dist/test/integration/fitl-policy-agent.test.js packages/engine/dist/test/integration/texas-holdem-policy-agent.test.js` passed
  - `pnpm -F @ludoforge/engine lint` passed
  - `pnpm -F @ludoforge/engine run schema:artifacts` passed
  - `pnpm -F @ludoforge/engine test` passed
  - `pnpm run check:ticket-deps` passed
