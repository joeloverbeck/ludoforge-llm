# ACTTOOLTIP-005: Canonicalize removeByPriority macroOrigin aggregation semantics

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/cnl/expand-effect-macros.ts`, `packages/engine/src/kernel/ast-to-display.ts`, tests
**Deps**: None

## Problem

`removeByPriority` now supports per-group `macroOrigin`, but parent-level `removeByPriority.macroOrigin` is still derived by first-hit logic (`remainingBind`, else first group bind). In mixed-origin group cases, parent provenance can be misleading.

That makes provenance non-canonical and weakens long-term architecture for generic diagnostics/rendering tooling.

## Assumption Reassessment (2026-02-27)

1. `annotateControlFlowMacroOrigins` currently annotates `removeByPriority.groups[i].macroOrigin` and parent `removeByPriority.macroOrigin` independently — confirmed in `expand-effect-macros.ts`.
2. Parent `removeByPriority.macroOrigin` is selected by single-origin fallback logic and does not validate consistency across all groups — confirmed.
3. Display currently prefers group stem, then parent stem, then raw bind — confirmed in `ast-to-display.ts`.
4. Existing active tickets (`ACTTOOLTIP-003`, `ACTTOOLTIP-004`) do not define canonical parent-origin semantics for mixed-origin `removeByPriority` groups — confirmed.

## Architecture Check

1. Canonical provenance policy is cleaner than first-match heuristics: parent origin should be authoritative or absent.
2. This is fully game-agnostic compiler/display metadata behavior; no game-specific branches or runtime rules.
3. No compatibility shims: enforce a single strict contract for provenance semantics.

## What to Change

### 1. Define strict parent-origin contract for `removeByPriority`

In `annotateControlFlowMacroOrigins`:
- Keep per-group annotation as-is.
- Set parent `removeByPriority.macroOrigin` only when:
  - `remainingBind` has origin, or
  - all group origins resolve and are identical (`macroId` + `stem`).
- If group origins are mixed or partial without `remainingBind` provenance, omit parent `macroOrigin`.

### 2. Keep renderer deterministic under the stricter contract

In `ast-to-display.ts`, preserve precedence:
- `group.macroOrigin.stem`
- else `parent.macroOrigin.stem` (now authoritative only)
- else `group.bind`

No semantic renderer behavior change is expected when group provenance exists.

## Files to Touch

- `packages/engine/src/cnl/expand-effect-macros.ts` (modify)
- `packages/engine/src/kernel/ast-to-display.ts` (verify/no-op or small adjust)
- `packages/engine/test/unit/expand-effect-macros.test.ts` (modify)
- `packages/engine/test/unit/kernel/ast-to-display.test.ts` (modify)

## Out of Scope

- Introducing per-bind provenance beyond `removeByPriority` groups
- Changing runtime effect execution semantics
- UI styling work

## Acceptance Criteria

### Tests That Must Pass

1. Mixed-origin `removeByPriority` groups do not produce parent `macroOrigin`.
2. Uniform-origin groups still produce parent `macroOrigin`.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Parent provenance is never contradictory to child group provenance.
2. Provenance rules remain compiler-owned metadata only (not authored in GameSpecDoc).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/expand-effect-macros.test.ts` — Add mixed-origin group case; assert parent `macroOrigin` omitted and group origins preserved.
2. `packages/engine/test/unit/expand-effect-macros.test.ts` — Add uniform-origin case; assert parent `macroOrigin` present and consistent.
3. `packages/engine/test/unit/kernel/ast-to-display.test.ts` — Add case that mixed-origin groups still render per-group stems (without relying on parent fallback).

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine lint`
