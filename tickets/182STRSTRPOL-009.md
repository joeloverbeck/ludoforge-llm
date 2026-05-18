# 182STRSTRPOL-009: Phase 3 — Guardrail trace formatting (top-K caps + deterministic ordering)

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — trace formatting / mode handling for guardrails block
**Deps**: `tickets/182STRSTRPOL-007.md`

## Problem

Spec 182 §5.7 specifies trace formatting for the guardrails block: `summary` mode caps `fired` at top-3 and `notFiredTop` at top-3; `verbose` lifts to top-K of the trace-controls budget; `debug` emits the full fired/not-fired matrix; `allPrunedFallback` is always present when invoked. Deterministic ordering by `(severity, id asc)` for `fired` and consistent ordering for `notFiredTop`. Tickets 007/008 populated the trace fields inline; this ticket adds the formatting layer + ordering + cap tests. This is a sibling of ticket 003 (modules trace formatting).

## Assumption Reassessment (2026-05-18)

1. Tickets 007 and 008 populate `guardrails.fired`, `guardrails.notFiredTop`, and `guardrails.allPrunedFallback` inline during dispatch — this ticket consumes that data and applies cap + ordering.
2. The trace mode handling layer (likely `PolicyTraceControls` or analog) is shared with module trace formatting (ticket 003) — this ticket extends the same machinery for guardrails.
3. Ordering: `fired` sorts by `(severity, id asc)` per spec §8 edge cases. `notFiredTop` sorts by deterministic ordering (TBD during implementation — likely `(severity, id asc)` for consistency).

## Architecture Check

1. Formatting is generic — no game-specific identifiers (Foundation #1).
2. Ordering is integer/lex-stable per Foundation #8.
3. Top-K caps are statically declared (no runtime-derived limits).
4. `allPrunedFallback` is always emitted when invoked, regardless of mode — it's a critical observability signal.

## What to Change

### 1. Cap application in trace formatter

For each mode:
- `summary`: slice `fired` to first 3 entries after sort; slice `notFiredTop` to first 3.
- `verbose`: slice to top-K of trace-controls budget (locate existing constant or config during implementation).
- `debug`: no slicing.

### 2. Deterministic ordering

Sort `fired` by `(severity, id asc)` where severity ordering is `prune` (0) < `demote` (1) < `warn` (2) < `auditOnly` (3) — or whatever ordering matches the team's existing convention; document the choice in code comments.

Sort `notFiredTop` by `(severity, id asc)` for consistency with `fired`. Verify against any existing precedent set in modules trace formatting (ticket 003).

### 3. Ordering and cap tests

- Ordering test: deterministic across two runs.
- Cap test: `summary` mode never emits more than 3+3 fired+notFiredTop entries.
- `allPrunedFallback` always present when invoked, regardless of mode.

## Files to Touch

- Trace-formatter source (locate during implementation; likely `packages/engine/src/agents/policy-trace-formatter.ts` or similar — pattern established by ticket 003 module formatter)
- `packages/engine/test/unit/agents/guardrail-trace-ordering.test.ts` (new)
- `packages/engine/test/unit/agents/guardrail-trace-caps.test.ts` (new)

## Out of Scope

- Migration atomic (ticket 010).
- Conformance tests per severity (ticket 011).
- Profile-quality lint (ticket 012).

## Acceptance Criteria

### Tests That Must Pass

1. New `guardrail-trace-ordering.test.ts` — `fired` and `notFiredTop` sort by `(severity, id asc)` deterministically.
2. New `guardrail-trace-caps.test.ts` — `summary` caps at 3+3; `verbose` lifts; `debug` no cap; `allPrunedFallback` always emitted when invoked.
3. Replay-determinism check: two runs at the same seed produce bit-identical `guardrails` trace blocks.
4. `pnpm turbo test`, `pnpm turbo lint`, `pnpm turbo typecheck`.

### Invariants

1. Ordering is deterministic per Foundation #8.
2. `summary` mode never exceeds 3+3 entries.
3. `allPrunedFallback` is always present when invoked.
4. No game-specific identifiers in formatting code (Foundation #1).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/guardrail-trace-ordering.test.ts`
2. `packages/engine/test/unit/agents/guardrail-trace-caps.test.ts`

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/unit/agents/guardrail-trace-*.test.js`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
