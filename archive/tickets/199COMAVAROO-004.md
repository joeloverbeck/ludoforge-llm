# 199COMAVAROO-004: P4 — Compile-time grant-vocabulary check

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — cnl (compiler validation)
**Deps**: `archive/specs/199-compound-availability-at-root-proposal.md`

## Problem

Spec 191 P3 validates that each authored `root.compound.specialTags` aligns with at least one continuation witness in the GameDef's action surface (`validatePlanTemplateCompound` at `packages/engine/src/cnl/validate-agent-plan-templates.ts:213`). The witness check confirms *some state could grant* the continuation; it does not confirm the tags align with the engine's grant-predicate vocabulary. Authoring typos in `specialTags` (e.g., a misspelled tag that no `accompanyingOps` list references) would survive the witness check and surface only at probe runtime as an `unavailable` (`reason: 'no-grant-predicate'`) outcome. This ticket extends compile-time validation with a vocabulary alignment check, following the precedent of `validate-gamedef-extensions.ts:386-393` which validates each `accompanyingOps` entry against known action IDs.

## Assumption Reassessment (2026-05-26)

1. Grant-predicate vocabulary IS enumerable: special-activity grants resolve via action IDs in `accompanyingOps` lists on `ActionPipelineDef` at `packages/engine/src/kernel/types-operations.ts:29` — confirmed in the Spec 199 reassessment.
2. Precedent for action-ID vocabulary validation exists at `packages/engine/src/kernel/validate-gamedef-extensions.ts:386-393` — emits `Unknown action "<id>" in accompanyingOps.` diagnostic. This ticket follows the same diagnostic shape and emission pattern.
3. The existing helper `canSpecialAccompanyOperation` at `validate-agent-plan-templates.ts:393` and `collectCompoundWitnesses` at `validate-agent-plan-templates.ts:356` enumerate `(operationActionId, specialTags)` pairs from the GameDef — the union of those `specialTags` is the engine's recognized vocabulary, available without new infrastructure.
4. Decoupled from P1–P3: this validation runs at compile time, before runtime probing, and is independent of the probe primitive.

## Architecture Check

1. Foundation #12 (Compiler-Kernel Validation Boundary) — vocabulary alignment is knowable from the spec alone (GameDef structure), so it belongs at compile time, not runtime.
2. Foundation #15 (architectural completeness) — catches authoring typos at compile time rather than at probe runtime; addresses the root cause (silent acceptance of misaligned tags) rather than patching the symptom (probe-time `'no-grant-predicate'` outcomes).
3. Engine-agnostic — the validator operates on generic GameDef data, no game-specific identifiers per Foundation #1.
4. No backwards-compat shims — this is an additive validation; well-formed existing GameDefs already align (Foundation #14). Authored data that *did* misspell a tag would have always failed at probe runtime; promoting that failure to compile time is a strict improvement.

## What to Change

### 1. Extend `validatePlanTemplateCompound` with vocabulary alignment

In `packages/engine/src/cnl/validate-agent-plan-templates.ts:213`, after the existing witness check, add a vocabulary-alignment assertion: for each authored `root.compound.specialTags` token, verify it appears in at least one `(operationActionId, specialTags)` pair returned by `collectCompoundWitnesses` (which already enumerates these pairs at line 356). If a tag has no matching pair, emit a diagnostic mirroring `validate-gamedef-extensions.ts:386-393`:

```
Unknown special tag "<tag>" in plan template root.compound — no accompanyingOps entry references this tag.
```

The path field should follow the existing diagnostic-path idiom in the file (e.g., `${basePath}.root.compound.specialTags[<index>]`).

### 2. Test the vocabulary check

Add a focused test under `packages/engine/test/unit/cnl/` (mirroring existing `validate-agent-plan-templates.test.ts` convention, if present — verify exact path and idiomatic file-top test-class marker during implementation). Cases:
- Well-formed GameDef with aligned `specialTags` → no diagnostic.
- GameDef with a misspelled `specialTag` not present in any `accompanyingOps` → diagnostic emitted with the canonical message and correct path field.
- GameDef with `compound` undefined → validator is a no-op (existing behavior preserved).
- GameDef with multiple misaligned tags → one diagnostic per offending tag (no early-exit).

## Files to Touch

- `packages/engine/src/cnl/validate-agent-plan-templates.ts` (modify — extend `validatePlanTemplateCompound`)
- `packages/engine/test/unit/cnl/validate-agent-plan-templates-vocabulary.test.ts` (new) or extension of an existing sibling test file if the consolidation convention is in use; verify the placement during implementation.

## Out of Scope

- Probe primitive — owned by ticket 001.
- Proposer integration + trace fields — owned by ticket 002.
- Architectural-invariant + correspondence + FITL witness tests — owned by ticket 003.
- Modifying existing GameDef YAML for any FITL or sibling-game profile — Spec §2 Non-Goals.
- Removing the existing witness check — both checks coexist; the witness proves "some state could grant", the vocabulary check proves "the tag is part of the engine's recognized vocabulary".

## Acceptance Criteria

### Tests That Must Pass

1. New vocabulary-check test passes (path verified during implementation).
2. Existing `validate-agent-plan-templates` suite passes: `pnpm -F @ludoforge/engine build && node --test dist/test/unit/cnl/validate-agent-plan-templates*.test.js`.
3. Compile reproducibility preserved: `pnpm turbo schema:artifacts` (or the project's canonical compile-byte-identity check).
4. Full engine suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Compile-time determinism preserved — same GameSpecDoc compiles to byte-identical GameDef across two runs (Foundation #16).
2. Engine-agnostic — diagnostic emits a generic message naming the offending tag; no game-specific branches (Foundation #1).
3. The new check is purely additive — well-formed existing GameDefs continue to compile without new diagnostics.
4. One diagnostic per offending tag — multiple misaligned tags in the same template each produce their own diagnostic (no early-exit suppressing later tags).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cnl/validate-agent-plan-templates-vocabulary.test.ts` (new) — or sibling extension. Four cases as enumerated above.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test dist/test/unit/cnl/validate-agent-plan-templates*.test.js`
2. `pnpm turbo schema:artifacts`
3. `pnpm -F @ludoforge/engine test`

## Outcome

Completed on 2026-05-26.

Implemented the compile-time compound special-tag vocabulary check in `packages/engine/src/cnl/validate-agent-plan-templates.ts`. The validator now derives the recognized special-activity tag vocabulary from existing compound witnesses and emits one `CNL_COMPILER_AGENT_PLAN_TEMPLATE_COMPOUND_UNPROVABLE` diagnostic per authored `root.compound.specialTags` token that no `accompanyingOps`-grantable special action exposes.

Extended `packages/engine/test/unit/cnl/agent-plan-template-validate.test.ts` with coverage for aligned tags, unknown tags, absent compound metadata, and multiple unknown tags. The public diagnostic path is normalized by the compiler diagnostic codec to `.0` / `.1` segments even though the validator emits bracket-index source paths.

Deviation from the literal focused command: from the repository root, `node --test dist/test/unit/cnl/agent-plan-template-validate.test.js` is a stale path. The valid compiled test path is `packages/engine/dist/test/unit/cnl/agent-plan-template-validate.test.js`.

Verification:

1. `pnpm -F @ludoforge/engine build && node --test dist/test/unit/cnl/agent-plan-template-validate.test.js` — build passed; literal root `dist/...` test path failed because the compiled artifact lives under `packages/engine/dist/...`.
2. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/unit/cnl/agent-plan-template-validate.test.js` — passed, 12 tests.
3. `pnpm turbo schema:artifacts` — passed; no schema artifact diff remained.
4. `pnpm -F @ludoforge/engine test` — passed, 178/178 files.

Source-size ledger: `packages/engine/src/cnl/validate-agent-plan-templates.ts` is 689 lines after the change and remains under the 800-line cap; `packages/engine/test/unit/cnl/agent-plan-template-validate.test.ts` is 276 lines.
