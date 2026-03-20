# 15GAMAGEPOLIR-017: Add Explicit Policy Visibility Ownership for Preview-Safe Runtime Surfaces

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — compiled policy-surface visibility contract, compiler/runtime visibility classification, preview masking refinement
**Deps**: specs/15-gamespec-agent-policy-ir.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-004-add-policy-visibility-metadata-and-canonical-seat-binding-validation.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-007-implement-policy-preview-runtime-and-hidden-info-masking.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-014-make-policy-metric-refs-executable-through-generic-runtime-contracts.md

## Problem

The current preview runtime is intentionally conservative: if preview safety cannot be proven generically, the whole preview surface collapses to `unknown`. That is safe, but it is not the final architecture Spec 15 calls for. The runtime still lacks explicit, shared ownership metadata for which policy-visible surfaces are public, acting-seat-visible, hidden, or preview-safe after a one-ply move. Without that contract, imperfect-information policy behavior remains sound only through broad masking, not through precise generic visibility reasoning.

## Assumption Reassessment (2026-03-19)

1. Archived ticket 004 deliberately kept policy visibility as a compiler allowlist boundary and did not add compiled ownership metadata for `var.*`, `metric.*`, or `victory.*` surfaces.
2. Archived ticket 007 implemented preview execution with conservative whole-surface masking whenever the previewed state still required hidden sampling for the acting player. That behavior is still present in `packages/engine/src/agents/policy-preview.ts`.
3. The current compiler/runtime split is the real gap:
   - `packages/engine/src/cnl/compile-agents.ts` approves runtime refs through hardcoded path families plus metric-id existence checks.
   - `packages/engine/src/agents/policy-eval.ts` and `packages/engine/src/agents/policy-preview.ts` resolve those same families through duplicated string-path logic rather than a shared compiled policy-surface contract.
4. The existing test inventory is close but not exactly what the old ticket claimed:
   - the hidden-information invariance property test already exists at `packages/engine/test/unit/property/policy-visibility.test.ts`
   - there is no current `packages/engine/test/integration/texas-holdem-policy-agent.test.ts`
5. Corrected scope: add one compiled/shared policy-surface visibility contract inside the authored/compiled `agents` pipeline, use it from both compile-time ref classification and runtime preview masking, and strengthen unit/property coverage around mixed safe/unsafe preview refs. Do not add game-specific exceptions, raw-state escape hatches, or fake backwards-compatibility alias paths.

## Architecture Check

1. A shared compiled policy-surface catalog is cleaner than teaching `policy-preview.ts` and `policy-eval.ts` parallel bespoke path logic or hardcoding Texas Hold'em semantics into the engine.
2. The clean ownership boundary is: authored policy-surface metadata in `doc.agents`, lowered into `GameDef.agents`, then consumed by compiler/runtime helpers. That keeps visibility semantics in authored/compiled data rather than scattered through runtime branches.
3. Replacing the current hardcoded allowlist plus blanket hidden-sampling collapse with explicit per-surface ownership is more robust and extensible than growing ad hoc exceptions one ref family at a time.
4. No backwards-compatibility shims, alias visibility labels, or legacy duplicate paths should be introduced. Upgrade the current `GameDef.agents` contract directly, including its schema version if the shape changes.

## What to Change

### 1. Add one shared policy-surface visibility contract to authored and compiled agent data

Extend the `agents` authoring/compiled contract with a single generic policy-surface catalog rather than scattering visibility booleans across unrelated runtime modules.

This catalog must cover every currently approved runtime ref family:

- global vars
- seat-scoped vars
- derived metrics
- victory margin/rank surfaces

Each compiled surface entry must answer:

- current-state visibility: `public`, `seatVisible`, or `hidden`
- preview-state visibility after one-ply application
- whether that preview ref remains readable when unrelated hidden state still exists elsewhere in the previewed state

Where sensible, the compiler may synthesize strict defaults from the surface kind, but the compiled contract must be explicit and shared.

### 2. Refine compiler/runtime policy visibility classification around that contract

Update policy compilation and runtime resolution so:

- compile-time ref validation classifies `var.*`, `metric.*`, `victory.*`, and `preview.*` from the compiled policy-surface contract, not from duplicated string allowlists alone
- `policy-eval.ts` and `policy-preview.ts` resolve runtime refs through the same shared contract/helper path instead of maintaining parallel bespoke branches
- preview masking returns `unknown` only for refs whose contract requires masking, instead of collapsing the whole preview surface whenever unrelated hidden state exists
- stochastic or unresolved previews may remain conservatively masked wholesale when determinism still cannot be proven generically; hidden-state masking is the part that should become per-ref
- diagnostics and compiled tests can assert exact current/preview visibility classifications from the shared contract

### 3. Strengthen imperfect-information invariant coverage

Add focused tests proving:

- per-ref preview masking in mixed states with both safe and unsafe surfaces
- hidden information does not leak through preview or current-state policy refs
- safe preview refs remain usable even when unrelated hidden state exists
- unsafe preview refs in the same state still resolve to `unknown`

## Files to Touch

- `packages/engine/src/cnl/game-spec-doc.ts` (modify)
- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/src/cnl/compiler-core.ts` (modify if shared visibility metadata is lowered there)
- `packages/engine/src/cnl/compile-agents.ts` (modify)
- `packages/engine/src/agents/policy-expr.ts` (modify if ref analysis needs shared visibility diagnostics)
- `packages/engine/src/agents/policy-preview.ts` (modify)
- `packages/engine/src/agents/policy-eval.ts` (modify)
- `packages/engine/test/unit/compile-agents-authoring.test.ts` (modify)
- `packages/engine/test/unit/agents/policy-preview.test.ts` (modify)
- `packages/engine/test/unit/property/policy-visibility.test.ts` (modify)
- `packages/engine/test/unit/agents/policy-eval.test.ts` (modify)

## Out of Scope

- authoring new FITL or Texas policy heuristics beyond what is needed to prove the visibility contract
- `PolicyAgent` factory/runner descriptor migration
- trace presentation redesign beyond reporting the refined shared visibility classifications
- visual-config changes
- adding a brand new Texas policy integration file unless this ticket ends up authoring Texas policies as a direct prerequisite

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/unit/agents/policy-preview.test.ts` proves preview masking is per-ref and contract-driven: safe preview refs stay available while unsafe refs in the same preview resolve to `unknown`.
2. `packages/engine/test/unit/property/policy-visibility.test.ts` proves two states that differ only in acting-seat-invisible hidden data still produce identical policy outcomes, while mixed safe/unsafe preview refs behave according to the shared visibility contract.
3. `packages/engine/test/unit/compile-agents-authoring.test.ts` proves compiled policy-surface visibility metadata is lowered deterministically and that unsupported/hidden refs are rejected or classified from the shared contract.
4. `packages/engine/test/unit/agents/policy-eval.test.ts` proves current-state and preview-state runtime resolution both use the shared compiled contract.
5. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Policy-surface visibility is owned by one shared generic contract from authored agent data through compiled `GameDef.agents` runtime evaluation.
2. Game-specific hidden-information semantics remain authored in `GameSpecDoc` data, not hardcoded into engine branches.
3. Safe preview refs remain usable even in imperfect-information games when unrelated hidden state exists elsewhere.
4. `visual-config.yaml` remains presentation-only and cannot influence policy visibility semantics.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-preview.test.ts` — per-ref preview visibility and masking rationale.
2. `packages/engine/test/unit/property/policy-visibility.test.ts` — mixed-surface invariance and hidden-info safety.
3. `packages/engine/test/unit/compile-agents-authoring.test.ts` — compile-time visibility classification ownership and compiled catalog lowering.
4. `packages/engine/test/unit/agents/policy-eval.test.ts` — shared current/preview runtime resolution through the compiled contract.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine lint`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm run check:ticket-deps`

## Outcome

- Completed: 2026-03-19
- What actually changed:
  - Added a shared compiled policy-surface visibility contract under `GameSpecDoc.agents.visibility` and `GameDef.agents.surfaceVisibility`, and upgraded the compiled policy catalog schema version to `2`.
  - Routed policy ref classification through that compiled contract in `compile-agents.ts` instead of relying only on duplicated hardcoded runtime-ref family checks.
  - Updated `policy-eval.ts` and `policy-preview.ts` to consume the same compiled contract so current-state and preview-state policy refs now share one visibility-ownership path.
  - Refined preview masking so hidden-sampling previews no longer collapse the entire preview surface: safe refs such as explicitly allowed preview vars remain readable while unsafe refs in the same preview still resolve to `unknown`.
  - Regenerated `packages/engine/schemas/GameDef.schema.json` and related schema artifacts for the updated `AgentPolicyCatalog` shape.
  - Fixed an exposed architectural bug in `compile-victory.ts`: terminal `margins` and `ranking` are now lowered even when `terminal.checkpoints` is absent, which was necessary for the victory policy surface to be owned correctly by compiled data.
- Deviations from original plan:
  - The shared visibility contract was implemented inside the authored/compiled `agents` contract rather than by scattering new visibility fields across unrelated runtime definitions. That kept the change smaller while still making the ownership explicit and shared.
  - Preview determinism remains conservatively whole-preview for unresolved or RNG-consuming moves; the per-ref refinement in this ticket is specifically for hidden-state masking once a preview state exists.
  - No new Texas policy integration file was added because the repo still has no authored Texas policy test seam that justifies one; the invariant coverage stayed in unit/property tests.
- Verification:
  - `pnpm -F @ludoforge/engine build`
  - `pnpm -F @ludoforge/engine lint`
  - `pnpm -F @ludoforge/engine run schema:artifacts`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm run check:ticket-deps`
