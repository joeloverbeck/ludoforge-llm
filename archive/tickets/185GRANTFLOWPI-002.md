# 185GRANTFLOWPI-002: Phase 2 — Grant-flow config generalization + `grantFlow` cap-class registry

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/cnl/` (compile-agents, validate-agents), kernel types-core (config type), `data/games/fire-in-the-lake/92-agents.md` (profile migration)
**Deps**: `archive/specs/185-grant-flow-preview-integrity.md`

## Problem

The current preview continuation config `outcomeGrantContinuation` (fields `enabled`/`extraDepthCap`/`capClass`; lowered/validated at `compile-agents.ts:1201-1281` and `validate-agents.ts:132-189`) only covers the `outcomeGrantResolve` acknowledgment frame. Phase 2 generalizes the continuation to the full grant/free-operation chain (ticket 003), which requires (a) a config shape whose name and semantics reflect grant-flow continuation rather than just post-grant acknowledgment, and (b) named `grantFlow` cap classes the drive can budget against. Per Foundation #14 (No Backwards Compatibility) this is a clean rename, with all repository-owned profiles migrated in the same change.

This ticket establishes the config + cap-class substrate so ticket 003's drive has a validated contract to consume. It bundles spec §5.4 (config shape) with the §6.1 cap-class registry/budget/validation entries (the trace/exit-reason half of §6.1–§6.2 stays in ticket 004), because the validator must check `extraDepthCap == budget` against the registry and the config references the classes.

## Assumption Reassessment (2026-05-20)

1. `POST_GRANT_CAP_CLASS_BUDGETS` is defined at `compile-agents.ts:165` and `postGrant16` maps to budget `4` (enforced by the `extraDepthCap`-must-equal-budget validator) — verified this session. The numeric suffix is a registry label, not the budget value; `grantFlow*` budgets are chosen here, not implied by the name.
2. `outcomeGrantContinuation` is declared in exactly one repository-owned profile, `data/games/fire-in-the-lake/92-agents.md` (`arvn-evolved`) — verified via `grep -rln outcomeGrantContinuation data/games/`. Migration scope is one profile; source-code blast-radius parity does not apply to this single data file.
3. The compiler lowers and the validator validates `enabled`/`extraDepthCap`/`capClass` and requires `extraDepthCap` to equal the named cap-class budget — verified this session.

## Architecture Check

1. Generalizing (renaming) the config rather than adding a parallel block avoids a compatibility shim and keeps a single authoritative continuation contract (Foundation #14).
2. Cap-class names are generic registry labels; no game-specific identifiers enter the compiler/validator (Foundation #1).
3. Named, statically-recorded cap classes satisfy Foundation #10 (the chosen class is named in the compiled artifact and available for reproducibility metadata).
4. Migrating the single profile in the same change keeps the corpus compilable (Foundation #14, #16).

## What to Change

### 1. Generalize the continuation config shape

Rename `outcomeGrantContinuation` to a generalized grant-flow continuation block reflecting the full chain semantics. Update the config type in `kernel/types-core.ts` (`CompiledAgentPreviewOutcomeGrantContinuationConfig` and its `AgentPreviewPostGrantCapClass`-equivalent), the GameSpec-side profile type, and all repository-owned references. Decide whether the single cap field generalizes or splits into per-segment fields (post-grant ack vs. free-operation continuation); the drive ticket (003) consumes whatever shape lands here, so finalize it in this ticket.

### 2. Add `grantFlow` cap-class registry entries

Add `grantFlow*` cap classes (e.g., `grantFlow16` / `grantFlow32` — suffix is a label) to the cap-class budget registry with explicit budget values chosen here. Keep `postGrant16` (budget 4) for the legacy acknowledgment frames.

### 3. Compiler + validator

Lower the generalized block and validate `enabled`, the cap field(s), and cap class(es); require each cap field to equal its named cap-class budget. Add/adjust diagnostic codes (mirroring the existing `CNL_COMPILER_AGENT_PREVIEW_POST_GRANT_EXTRA_DEPTH_CAP_INVALID`).

### 4. Migrate `arvn-evolved`

Update the `arvn-evolved` profile in `92-agents.md` to the generalized config shape. Preserve its intent (enabled grant-flow continuation) under the new keys/cap class.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify — config type + cap-class union)
- `packages/engine/src/cnl/compile-agents.ts` (modify — registry + lowering)
- `packages/engine/src/cnl/validate-agents.ts` (modify — validation + diagnostics)
- `data/games/fire-in-the-lake/92-agents.md` (modify — migrate `arvn-evolved`)

## Out of Scope

- The continuation drive logic (ticket 003) — this ticket only defines the config + cap-class contract it consumes.
- Trace segments / exit-reason taxonomy and surfacing the active cap class in trace (ticket 004).
- Profile *binding* promotion / `arvn-baseline` retirement / quarantine (out of scope for Spec 185 entirely per §2 / §8).

## Acceptance Criteria

### Tests That Must Pass

1. A profile declaring the generalized grant-flow config with a `grantFlow*` cap class compiles; a profile whose cap field ≠ the named cap-class budget fails compilation with the appropriate diagnostic.
2. `arvn-evolved` compiles under the new shape and round-trips deterministically (same GameSpecDoc → byte-identical GameDef).
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. The active cap class is statically named in the compiled artifact (Foundation #10).
2. No `outcomeGrantContinuation`-named key or alias survives in source, compiler, validator, types, or profiles (Foundation #14).

## Test Plan

### New/Modified Tests

1. Extend the existing compile/validate-agents tests covering the continuation block — assert the generalized shape compiles, cap-class/budget mismatch is rejected, and the `grantFlow*` classes are accepted. Mark `// @test-class: architectural-invariant`.

### Commands

1. `pnpm turbo build && pnpm -F @ludoforge/engine test`
2. `pnpm turbo lint && pnpm turbo typecheck && pnpm turbo schema:artifacts`

## Outcome

Completed: 2026-05-20

What changed:

- Renamed the authored and compiled preview continuation contract from `outcomeGrantContinuation` to `grantFlowContinuation` with no compatibility alias.
- Split the generalized block into explicit segment budgets: `postGrantDepthCap`/`postGrantCapClass` for the legacy `outcomeGrantResolve` acknowledgment segment and `freeOperationDepthCap`/`freeOperationCapClass` for the free-operation segment ticket 003 will consume.
- Added generic `grantFlow16` and `grantFlow32` cap-class registry entries with budgets `16` and `32`, and required the authored depth caps to equal their selected class budgets.
- Migrated the `arvn-evolved` profile in `data/games/fire-in-the-lake/92-agents.md` to the new shape with `postGrant16` plus `grantFlow16`.
- Updated the GameSpecDoc type, compiled types, Zod schemas, runtime pass-through, preview usage trace surface, focused architecture tests, and generated GameDef/Trace schema artifacts for the new contract.

Deviations from original plan:

- The finalized shape is split per segment rather than a single generalized cap. That matches Spec 185 §5.4/§6.1 because ticket 003 needs separate post-grant acknowledgment and free-operation continuation budgets.
- The owned file surface expanded beyond the draft `Files to Touch` list to include `game-spec-doc.ts`, `schemas-core.ts`, generated schemas, runtime pass-through, trace summary code, and focused tests. Those are direct no-alias fallout from Foundation #14.
- The source-size gate uses the user-approved 2026-05-20 Spec 185 Option 1 minimal-touch deferral already recorded by ticket 001/state for pre-existing oversized source files. No broad extraction/refactor was folded into this config-contract ticket.

Generated artifact provenance:

- `packages/engine/schemas/GameDef.schema.json` and `packages/engine/schemas/Trace.schema.json` were regenerated with `pnpm -F @ludoforge/engine run schema:artifacts` and `pnpm turbo schema:artifacts` from `packages/engine/src/kernel/schemas-core.ts`/`types-core.ts`.
- The refresh is expected because the compiled GameDef preview config schema and preview trace schema now expose `grantFlowContinuation` with split cap-class fields.

Verification:

- `pnpm turbo build` — passed.
- `node --test packages/engine/dist/test/architecture/preview-grant-flow-config/*.js packages/engine/dist/test/architecture/preview-post-grant/*.js packages/engine/dist/test/architecture/preview-signal-integrity/grant-flow-status.test.js` — passed, 13 tests.
- `pnpm -F @ludoforge/engine test` — passed, `160/160 files passed`.
- `pnpm turbo lint` — passed.
- `pnpm turbo typecheck` — passed.
- `pnpm turbo schema:artifacts` — passed.
- `rg -n "outcomeGrantContinuation|extraDepthCap|capClass: 'postGrant16'|back compatibility|back-compat" packages/engine/src packages/engine/test data/games/fire-in-the-lake/92-agents.md packages/engine/schemas` — no matches.

Source-size ledger:

- `packages/engine/src/cnl/compile-agents.ts`: 5772 -> 5826 lines, pre-existing oversized file, +54 lines for split grant-flow config lowering and cap-class registry validation.
- `packages/engine/src/cnl/validate-agents.ts`: 615 -> 658 lines, pre-existing oversized file, +43 lines for split-field validation and cap-budget checks.
- `packages/engine/src/kernel/types-core.ts`: 2744 -> 2749 lines, pre-existing oversized file, +5 lines for the new free-operation cap-class union and split config/trace fields.
- `packages/engine/src/kernel/schemas-core.ts`: 3033 -> 3037 lines, pre-existing oversized file, +4 lines for the new compiled config and trace schema fields.
- `packages/engine/src/agents/policy-preview.ts`: 1410 -> 1410 lines, pre-existing oversized file, mechanical rename only.
- `packages/engine/src/agents/policy-eval.ts`: 1720 -> 1724 lines, pre-existing oversized file, +4 lines for the split trace summary fields.

Archive status:

- Archived after post-ticket review. The Spec 185 continuation behavior was completed in `archive/tickets/185GRANTFLOWPI-003.md`.
