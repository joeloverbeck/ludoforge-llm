# 180STDVECOBSROL-003: Phase 2 - Status-aware outer-preview seatAgg

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes - policy expression/evaluator/compiler/schema.
**Deps**: `archive/tickets/180STDVECOBSROL-001.md`

## Problem

Ticket 002 owns the base Foundation 20 repair required by the Phase 1 standing witness: an all-unavailable preview-derived `seatAgg(sum)` must remain unavailable instead of contributing numeric `0`. This ticket adds the explicit authored availability modes, compiler/validator/schema wiring, and migration diagnostics so authors can choose how partial per-seat preview availability is handled.

## Assumption Reassessment (2026-05-17)

1. `PolicyPreviewTraceOutcome` already has the status vocabulary needed for unavailable cells.
2. The compiler diagnostic `CNL_COMPILER_AGENT_PREVIEW_REF_REQUIRES_EXPLICIT_FALLBACK` already protects inner-preview refs and should extend to status-aware outer-preview aggregates.
3. Existing profiles need a migration path, but new authoring should be explicit about availability.
4. Boundary reset approved in-session on 2026-05-17: base all-unavailable silent-zero prevention moved to `archive/tickets/180STDVECOBSROL-002.md`; this ticket remains the owner of the availability-mode API and partial-availability semantics.

## Architecture Check

1. Extend `seatAgg` in place rather than adding a duplicate `standingAgg` IR node.
2. Preserve engine agnosticism by keeping aggregation over generic seats and terminal-derived refs.
3. No compatibility alias is added; legacy `skipUnavailable` is a documented mode with advisory migration pressure.

## What to Change

### 1. Add `seatAgg.availability`

Support `requireAllReady`, `requireAnyReady`, `selfAndTargetReady`, and `skipUnavailable`.

### 2. Propagate unavailable status

When an aggregate is unavailable under its selected mode, register the preview ref as unavailable and require `previewFallback` before contribution. Preserve the base ticket-002 behavior that all-unavailable preview aggregates do not silently contribute numeric `0`.

### 3. Update compiler/validator/schema artifacts

Thread the new field through the authored profile schema, compiled IR, runtime evaluator, generated schemas, and focused tests.

## Files to Touch

- `packages/engine/src/agents/policy-expr.ts` (modify)
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify)
- `packages/engine/src/cnl/compile-agents.ts` (modify)
- `packages/engine/src/cnl/validate-agents.ts` (modify)
- `packages/engine/src/cnl/preview-seat-agg-refs.ts` (add helper for compiler migration diagnostics)
- `packages/engine/src/kernel/types-core.ts` and `packages/engine/src/kernel/schemas-core.ts` (modify if schema shape changes)
- `packages/engine/schemas/*.json` (regenerate if schema shape changes)
- focused tests under `packages/engine/test/architecture/preview-integrity/` and `packages/engine/test/unit/cnl/`

## Out of Scope

- Standing-projection route implementation.
- Base all-unavailable silent-zero prevention for the Phase 1 standing witness.
- Full `previewUsage.seatMatrix`.
- Named role primitives.
- Production profile migration beyond minimal fixture/test data.

## Acceptance Criteria

### Tests That Must Pass

1. Four availability modes are covered by focused tests.
2. Preview-derived aggregate without explicit fallback fails or warns according to the selected mode.
3. Generated schema artifacts are in sync.
4. `pnpm -F @ludoforge/engine test`.

### Invariants

1. Unavailable preview signal never silently becomes numeric contribution under explicit status-aware modes.
2. Existing ready-only aggregate behavior stays deterministic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/architecture/preview-integrity/spec-180-outer-preview-availability.test.ts` - four-mode behavior.
2. Compiler/validator test for `seatAgg.availability` and fallback diagnostic.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. Focused compiled test commands for availability and compiler diagnostics.
3. `pnpm -F @ludoforge/engine run schema:artifacts:check`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm run check:ticket-deps`

## Outcome (2026-05-17)

Completed on 2026-05-17.

Outcome amended: 2026-05-17 - Phase 3 sibling path updated after `180STDVECOBSROL-004` archival; no scope or proof change.

What landed:

- `seatAgg.availability` now supports `requireAllReady`, `requireAnyReady`, `selfAndTargetReady`, and `skipUnavailable` in the authored and compiled policy expression contracts.
- Runtime `seatAgg` evaluation now keeps `requireAllReady` and `selfAndTargetReady` unavailable when required preview cells are unavailable; `requireAnyReady` and `skipUnavailable` preserve partial-ready aggregation while retaining the Phase 1 all-unavailable no-contribution behavior.
- The compiler now requires `previewFallback` for explicit status-aware preview-derived `seatAgg` modes and emits a migration warning for implicit preview-derived `skipUnavailable`.
- `packages/engine/src/cnl/preview-seat-agg-refs.ts` carries the preview-derived seat aggregate scan so the oversized compiler hub does not grow.
- `packages/engine/schemas/GameDef.schema.json` was regenerated; `Trace.schema.json` and `EvalReport.schema.json` were checked by the generator and remained byte-identical.
- `packages/engine/src/cnl/validate-agents.ts` required no edit: the live validation path for authored policy expressions is the compiler/analyzer path exercised by the focused CNL diagnostic test.

Deferred scope:

- `previewUsage.seatMatrix` remains owned by `archive/tickets/180STDVECOBSROL-004.md`.
- Role primitives remain owned by `tickets/180STDVECOBSROL-005.md`.
- FITL ARVN witness, cookbook text, and Foundations appendix text remain owned by `tickets/180STDVECOBSROL-006.md`.

Source-size ledger:

| path | before lines | after lines | crossed cap? | active growth | extraction/defer rationale | successor |
| --- | ---: | ---: | --- | ---: | --- | --- |
| `packages/engine/src/agents/policy-evaluation-core.ts` | 2246 | 2246 | no; preexisting over cap | 0 | Local evaluator threading kept net-zero in the canonical evaluator hub. | none |
| `packages/engine/src/agents/policy-expr.ts` | 1767 | 1767 | no; preexisting over cap | 0 | Local analyzer/schema-key support kept net-zero in the canonical expression analyzer. | none |
| `packages/engine/src/cnl/compile-agents.ts` | 4720 | 4720 | no; preexisting over cap | 0 | Preview seat-aggregate scan was extracted to `preview-seat-agg-refs.ts`; compiler hub kept net-zero. | none |
| `packages/engine/src/kernel/schemas-core.ts` | 2780 | 2780 | no; preexisting over cap | 0 | Schema mirror addition kept net-zero in the canonical schema hub. | none |
| `packages/engine/src/kernel/types-core.ts` | 2347 | 2346 | no; preexisting over cap | -1 | Type contract addition kept net-negative in the canonical type hub. | none |
| `packages/engine/src/cnl/policy-bytecode/feature-table.ts` | 616 | 616 | no | 0 | Feature identity mirror updated without growth in near-cap table. | none |
| `packages/engine/src/cnl/preview-seat-agg-refs.ts` | 0 | 96 | no | +96 | New focused helper under cap; extraction avoids growth in oversized compiler hub. | none |
| `packages/engine/test/architecture/preview-standing/standing-preview-fixture.ts` | 287 | 339 | no | +52 | Focused fixture extension under cap for partial-ready availability witnesses. | none |
| `packages/engine/test/architecture/preview-integrity/spec-180-outer-preview-availability.test.ts` | 0 | 90 | no | +90 | New focused availability-mode regression under cap. | none |

Command ledger:

| ticket section | literal command/shorthand | ran directly/subsumed/split/replaced/not run | final citation |
| --- | --- | --- | --- |
| Test Plan | `pnpm -F @ludoforge/engine build` | run directly | passed after implementation and extraction |
| Test Plan | Focused compiled test commands for availability and compiler diagnostics | run directly via package exec compiled Node tests | passed: `spec-180-outer-preview-availability.test.js`; `previewfallback-required-diagnostic.test.js` |
| Test Plan | `pnpm -F @ludoforge/engine run schema:artifacts:check` | run directly | passed after regenerating `GameDef.schema.json` |
| Test Plan | `pnpm -F @ludoforge/engine test` | run directly | passed: default lane summary `92/92 files passed`; class-summary advisory text reported pass-only counts |
| Test Plan | `pnpm run check:ticket-deps` | run directly after terminal status update | passed: `Ticket dependency integrity check passed for 7 active tickets and 2403 archived tickets.` |

AGENTS canonical lane reconciliation:

| AGENTS canonical lane | required by ticket? | ran/subsumed/not applicable | rationale |
| --- | --- | --- | --- |
| `pnpm turbo build` | no | not applicable | ticket names engine package build; changed surface is engine-local. |
| `pnpm turbo test` | no | not applicable | package-local engine test is the explicit broad acceptance lane. |
| `pnpm turbo lint` | no | not applicable | no lint lane named; TypeScript build and engine test cover the changed engine/test sources. |
| `pnpm turbo typecheck` | no | not applicable | engine build runs `tsc` for the package. |
| `pnpm turbo schema:artifacts` | no | not applicable | engine package schema artifact check is the explicit schema lane. |

Late-edit proof validity: source-size ledger correction and equivalent formatting-only source compaction happened after the first package proof; affected build/schema/focused/package lanes were rerun after those edits. The post-status dependency-integrity transcription records the just-run checker result and does not change graph facts.
