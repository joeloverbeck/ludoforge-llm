# ACTTOOHUMGAP-004: Deduplicate structurally identical messages

**Status**: DONE
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel tooltip pipeline
**Deps**: ACTTOOHUMGAP-001 (dedup operates on messages that may contain humanized values)

## Problem

Macro expansion can produce structurally identical `TooltipMessage` entries (same effect, same wording, different `astPath` or `macroOrigin`). These appear as duplicate lines in the final rule card.

## Assumption Reassessment (2026-03-08)

1. `tooltip-content-planner.ts` exists and contains the pipeline that collects, groups, and renders tooltip messages — confirmed.
2. `TooltipMessage` has `astPath` and `macroOrigin` metadata fields that should be ignored during dedup — to be verified at implementation time against `tooltip-ir.ts`.
3. There is currently no dedup pass in the content planner pipeline — this is the gap.

## Architecture Check

1. Dedup is a pure function operating on an immutable message array — no side effects.
2. Fingerprinting ignores metadata fields only (`astPath`, `macroOrigin`), so semantically different messages are preserved.
3. Position in pipeline (after collection, before grouping/rendering) ensures dedup happens at the right stage.

## What to Change

### 1. Add `deduplicateMessages()` to `tooltip-content-planner.ts`

Create `deduplicateMessages(messages: TooltipMessage[]): TooltipMessage[]` that:
- Computes a fingerprint for each message by serializing all fields **except** `astPath` and `macroOrigin`.
- Uses a `Set` or `Map` to track seen fingerprints.
- Keeps the first occurrence of each unique fingerprint.
- Returns the deduplicated array (new array, no mutation).

### 2. Integrate dedup into the content planner pipeline

Insert the `deduplicateMessages` call after message collection and before grouping/rendering. Ensure the pipeline flow is: collect → dedup → group → render.

## Files to Touch

- `packages/engine/src/kernel/tooltip-content-planner.ts` (modify — add `deduplicateMessages()`, integrate into pipeline)
- `packages/engine/test/unit/kernel/tooltip-content-planner.test.ts` (modify — add dedup tests)

## Out of Scope

- Value humanization (that is ACTTOOHUMGAP-001).
- Select target enrichment (that is ACTTOOHUMGAP-002).
- Macro binding sanitization (that is ACTTOOHUMGAP-003).
- Structured conditions (that is ACTTOOHUMGAP-005).
- Any file outside `packages/engine/src/kernel/tooltip-content-planner.ts` and its test.
- Changes to the `TooltipMessage` type definition in `tooltip-ir.ts` (dedup works with the existing shape).
- Changes to the compiler, runner, or game data files.

## Acceptance Criteria

### Tests That Must Pass

1. Two `TooltipMessage` entries that are identical except for `astPath` are collapsed to one.
2. Two `TooltipMessage` entries that are identical except for `macroOrigin` are collapsed to one.
3. Two `TooltipMessage` entries that differ in semantic content (e.g., different effect text) are both preserved.
4. Near-duplicates with subtle differences (e.g., different target zones) are preserved.
5. An input with zero duplicates returns the same number of messages.
6. An empty input returns an empty array.
7. Existing suite: `pnpm -F @ludoforge/engine test` — all tooltip tests pass (no regression).

### Invariants

1. `deduplicateMessages` is a pure function — does not mutate the input array.
2. Message ordering is preserved (first occurrence wins).
3. Only `astPath` and `macroOrigin` are excluded from fingerprinting — all semantic fields participate.
4. The dedup pass runs after collection and before grouping in the content planner pipeline.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/tooltip-content-planner.test.ts` — add tests for: exact duplicates, near-duplicates, no-duplicate inputs, empty input, metadata-only differences.

### Commands

1. `cd .claude/worktrees/spec-57 && pnpm -F @ludoforge/engine test`
2. `cd .claude/worktrees/spec-57 && pnpm turbo typecheck`
