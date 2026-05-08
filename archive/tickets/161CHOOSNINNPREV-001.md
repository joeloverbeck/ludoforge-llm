# 161CHOOSNINNPREV-001: Sibling-file extraction: relocate chooseNStep beam driver

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/agents/`
**Deps**: `archive/specs/161-choosenstep-inner-preview-integration.md`

## Problem

`packages/engine/src/agents/policy-preview-inner.ts` is currently 758 lines, near the project's 800-line cap. Spec 161 adds a new `runChooseNStepInnerPreview` driver and supporting per-root-option types; growing the file further would push it past the cap. The chooseNStep beam types and `runChooseNStepBeamPreview` driver have zero non-test callers in source — they belong in a sibling file dedicated to the chooseNStep preview surface, leaving `policy-preview-inner.ts` to host the chooseOne driver and shared helpers.

This ticket performs the pure refactor only: relocate the chooseNStep types/helpers/driver to a new sibling file, export `InnerPreviewBaseInput` so the sibling can extend it, and update the existing beam test's import path. No behavior change.

## Assumption Reassessment (2026-05-07)

1. `packages/engine/src/agents/policy-preview-inner.ts` is 758 lines (verified via `wc -l`); content slated for extraction totals ~227 lines, leaving ~531 lines after the move — well below the 700-line target in the spec's Phase A acceptance criterion.
2. `runChooseNStepBeamPreview` has zero non-test callers in `packages/engine/src/` (verified via grep). The only test importer is `packages/engine/test/unit/agents/policy-preview-inner-choosen-beam.test.ts`.
3. `InnerPreviewBaseInput` at `policy-preview-inner.ts:65` lacks the `export` keyword. Sibling-file extension requires the export.

## Architecture Check

1. Pure refactor — no functional change. The relocated code keeps the same signatures, return types, and exported names. The only delta is the file boundary and the `export` keyword on `InnerPreviewBaseInput`.
2. Engine-agnostic — chooseNStep surface contains no game-specific identifiers. F#1 honored.
3. F#14 honored — no re-export shim from `policy-preview-inner.ts`. Test import updates to the new path directly.

## What to Change

### 1. Create sibling file `packages/engine/src/agents/policy-preview-inner-choosenstep.ts`

Move the following from `policy-preview-inner.ts` to the new sibling file:

- Type aliases: `ChooseNStepDecision` (currently lines 55–58), `ChooseNStepMicroturn` (lines 60–63).
- Interfaces: `RunChooseNStepBeamPreviewInput` (lines 98–101), `ChooseNStepBeamPrunedTraceEntry` (lines 103–110), `ChooseNStepBeamResult` (lines 112–119), `ChooseNStepBeamPreviewRun` (lines 121–127).
- Internal helpers: `chooseNStepStableMoveKey` (lines 134–136), `BeamPartial` (lines 525–530), `BeamCandidate` (lines 532–534), `legalChooseNAddDecisions` (lines 536–542), `outcomeForBeamState` (lines 544–562), `scoreChooseNStepCandidate` (lines 564–583), `resolveBeamResult` (lines 587–617).
- Function: `runChooseNStepBeamPreview` (lines 664–758).

The new file imports from `./policy-preview-inner.ts` (for `InnerPreviewBaseInput`, `previewOptionRefKey`, and any shared resolve-refs helper still needed by `resolveBeamResult`), `./policy-surface.ts`, `./policy-preview.ts`, `./microturn-option-evaluator.ts`, and `./microturn-option-eval.ts` directly.

### 2. Modify `packages/engine/src/agents/policy-preview-inner.ts`

- Add `export` keyword to `interface InnerPreviewBaseInput` at line 65.
- Remove the relocated content listed above.
- Verify `policy-preview-inner.ts` retains: chooseOne driver (`runChooseOneInnerPreview` and supporting helpers), the `InnerPreviewBaseInput` interface (now exported), the shared `previewOptionRefKey` helper, and shared `resolveRefs` / surface-resolution helpers consumed by both drivers.

### 3. Update existing test import

`packages/engine/test/unit/agents/policy-preview-inner-choosen-beam.test.ts` currently imports `runChooseNStepBeamPreview` and the chooseNStep types from `../../../src/agents/policy-preview-inner.js`. Update the import to `../../../src/agents/policy-preview-inner-choosenstep.js`.

## Files to Touch

- `packages/engine/src/agents/policy-preview-inner.ts` (modify — extract content, export `InnerPreviewBaseInput`)
- `packages/engine/src/agents/policy-preview-inner-choosenstep.ts` (new — relocated chooseNStep types/helpers/driver)
- `packages/engine/test/unit/agents/policy-preview-inner-choosen-beam.test.ts` (modify — update import path)

## Out of Scope

- New `runChooseNStepInnerPreview` per-root-option driver (Ticket 002).
- Runtime adapter changes (Ticket 003).
- Dispatch and integration tests (Ticket 004).
- Any change to behavior, signatures, or return shapes — pure relocation only.

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine build && node --test dist/test/unit/agents/policy-preview-inner-choosen-beam.test.js` passes against the relocated driver.
2. `pnpm -F @ludoforge/engine test` (full engine suite) passes — no regressions from the file boundary change.
3. `pnpm turbo typecheck` passes — `InnerPreviewBaseInput` export is consumed by the new sibling file with no cycle errors.

### Invariants

1. `packages/engine/src/agents/policy-preview-inner.ts` line count drops below 700 (target ~531; spec acceptance #1).
2. No re-export shim from `policy-preview-inner.ts` to the new sibling — clean F#14 migration.
3. Public exports of `policy-preview-inner.ts` unchanged for symbols that remain (chooseOne driver, shared helpers).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-preview-inner-choosen-beam.test.ts` (modify) — update import path to the new sibling file location.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test dist/test/unit/agents/policy-preview-inner-choosen-beam.test.js`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`
4. `pnpm -F @ludoforge/engine test`

## Outcome

Outcome amended: 2026-05-07

Completed on 2026-05-07. The implemented slice relocates the existing chooseNStep beam driver into `packages/engine/src/agents/policy-preview-inner-choosenstep.ts`, exports `InnerPreviewBaseInput` plus the shared internal ref/outcome helpers required by that sibling, and updates the existing beam-driver unit test to import the relocated module directly.

Touched-file scope matches the ticket's `Files to Touch` list. Generated fallout is limited to transient `dist/` output from the build/test lanes; no schema, golden, or compiled JSON artifacts are owned by this refactor.

Acceptance proof:

1. `pnpm -F @ludoforge/engine build` — passed.
2. `node --test dist/test/unit/agents/policy-preview-inner-choosen-beam.test.js` from `packages/engine/` — passed.
3. `pnpm turbo typecheck` — passed.
4. `pnpm turbo lint` — passed.
5. `pnpm -F @ludoforge/engine test` — passed, including `schema:artifacts:check` and default lane summary `65/65 files passed`.
6. Structural probes passed: `policy-preview-inner.ts` is 508 lines; `policy-preview-inner-choosenstep.ts` is 287 lines; no chooseNStep beam driver/type/helper exports remain in `policy-preview-inner.ts`.

Sibling/deferred scope: `archive/tickets/161CHOOSNINNPREV-002.md` now owns the completed per-root-option driver; active tickets `tickets/161CHOOSNINNPREV-003.md` and `tickets/161CHOOSNINNPREV-004.md` remain `PENDING` and own the runtime adapter/interface and dispatch/integration work that this ticket explicitly excludes.

Ticket graph integrity: `pnpm run check:ticket-deps` passed for 13 active tickets and 2267 archived tickets.

Late-edit proof validity: terminal status/proof transcription plus ticket-dependency result transcription only; no scope, acceptance, command, touched-file, follow-up, or dependency change.
