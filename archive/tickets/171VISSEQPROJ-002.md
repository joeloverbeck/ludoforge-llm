# 171VISSEQPROJ-002: Cookbook rewrite for `visiblePrefix.sources`

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — documentation only
**Deps**: `archive/tickets/171VISSEQPROJ-001.md`

## Problem

`docs/agent-dsl-cookbook.md` documents the spec-170 observer-policy schema using the now-removed `visiblePrefix.zones[]` + `maxItems` shape. After `171VISSEQPROJ-001` lands, the cookbook's "Visible Prefix Declaration" and "FITL Coup Timing Example" sections describe a schema the compiler no longer accepts. Profile authors writing against the cookbook would produce GameSpecs that fail compilation. Foundation #14 requires owned documentation artifacts to migrate with the schema change; the cookbook is split into this ticket only because it is genuinely separable (it does not affect `build`/`typecheck`/`test`).

## Assumption Reassessment (2026-05-14)

1. `docs/agent-dsl-cookbook.md:315-359` contains the "Schedule Fallbacks", "Visible Prefix Declaration", and "FITL Coup Timing Example" sections; the latter two use `observerPolicy.kind: topNVisible` with `visiblePrefix.zones` + `maxItems: 2` — confirmed this session.
2. The "Schedule Fallbacks" section (lines ~287-313) documents `onUnavailable` / `onPartial.visiblePrefixExhausted` — this fallback contract is **unchanged** by spec 171 (the three resolution statuses are stable), so that section needs no edit.
3. The cookbook's spec-sources footer (line ~359) references `archive/specs/169-…` and `archive/specs/170-…` — spec 171 should be appended once `171VISSEQPROJ-001` has landed.

## Architecture Check

1. Documentation-only change; introduces no engine surface. Keeps the cookbook — the authoritative author-facing reference for the Agent DSL — consistent with the compiler's accepted schema.
2. No game-specific logic; the cookbook describes the generic `visiblePrefix.sources` construct with FITL as the worked example, mirroring the engine/GameSpecDoc boundary.
3. No backwards-compat content retained — the `zones`/`maxItems` shape is removed from the docs, not annotated as deprecated.

## What to Change

### 1. "Visible Prefix Declaration" section

Rewrite the YAML example and prose for `visiblePrefix.sources[]` with required per-source `take`. Explain: each source contributes at most `take` cards from the top of its public zone to the composed visible sequence; the scan bound is `sum(take)`; cards beyond a source's `take` are **public-but-excluded-by-policy** — not hidden, just outside the forward schedule horizon. State the per-source validation rules (public, deterministic order, distinct, not the draw zone; `take` required positive integer).

### 2. "FITL Coup Timing Example" section

Update the `coupEntry` example to the `sources` shape (`played:none take: 1`, `lookahead:none take: 1`). Explain that `played:none` accumulates the public played pile but `take: 1` extracts only the current card, so the composed sequence is `[current card, next card]` regardless of discard depth — and a Coup in `lookahead:none` resolves `ready: 1` rather than the spurious `partial.lowerBound: 2`. The `preferGovernEarlyInCoupCycle` consideration example is unchanged (the `scheduleFallback` contract is stable).

### 3. Spec-sources footer

Append `archive/specs/171-visible-sequence-projection.md` (or `specs/171-…` if not yet archived at edit time — verify location during implementation) to the spec-sources line.

## Files to Touch

- `docs/agent-dsl-cookbook.md` (modify)

## Out of Scope

- The "Schedule Fallbacks" section — the `onUnavailable` / `onPartial` contract is unchanged by spec 171; do not edit it.
- Any engine, schema, or test change — all covered by `archive/tickets/171VISSEQPROJ-001.md`.
- Documenting `order` / `role` per-source fields — rejected by spec §3; they do not exist.

## Acceptance Criteria

### Tests That Must Pass

1. Manual: every YAML block in the rewritten sections uses `visiblePrefix.sources` with explicit `take` and no `zones`/`maxItems`.
2. Manual: a GameSpec author copying the rewritten "Visible Prefix Declaration" example produces a boundary that compiles cleanly under the `171VISSEQPROJ-001` schema.
3. Existing suite: `pnpm turbo lint` (catches markdown/format regressions if the repo lints docs).

### Invariants

1. No occurrence of `visiblePrefix:` followed by `zones:` or `maxItems:` remains in `docs/agent-dsl-cookbook.md`.
2. The cookbook's described schema matches the `ObserverPolicySchema` shape shipped in `171VISSEQPROJ-001` — no drift.

## Test Plan

### New/Modified Tests

1. `docs/agent-dsl-cookbook.md` — no automated test; verified by manual review against the `171VISSEQPROJ-001` schema and by `grep` for residual `zones`/`maxItems` in the observer-policy sections.

### Commands

1. `grep -nE 'visiblePrefix|maxItems|topNVisible' docs/agent-dsl-cookbook.md` — expect only `sources`/`take` shape.
2. `pnpm turbo lint`

## Outcome

Completion date: 2026-05-14.
Outcome amended: 2026-05-14.

What landed:

- `docs/agent-dsl-cookbook.md` rewrites the "Visible Prefix Declaration" example to use `visiblePrefix.sources[]` with explicit per-source `take`.
- The section prose now states the `sum(take)` scan bound, the public-but-excluded-by-policy meaning of cards beyond a source's `take`, and the per-source validation rules: public zone, deterministic order, distinct source ids, not the hidden draw zone, and required positive-integer `take`.
- The "FITL Coup Timing Example" explanation now describes `played:none take: 1` plus `lookahead:none take: 1`, including the `ready: 1` lookahead Coup case and the unchanged `partial.lowerBound: 2` no-visible-Coup case.
- The spec-sources footer appends `archive/specs/171-visible-sequence-projection.md`.

Touched-file scope:

- Modified: `docs/agent-dsl-cookbook.md`, `archive/tickets/171VISSEQPROJ-002.md`.
- No engine, schema, generated artifact, or test files changed; those remain out of scope and are covered by `archive/tickets/171VISSEQPROJ-001.md` and `archive/tickets/171VISSEQPROJ-003.md`.

Generated fallout: none; documentation-only.

Deferred sibling/spec scope:

- `archive/tickets/171VISSEQPROJ-003.md` owns the new visible-sequence regression tests.
- The "Schedule Fallbacks" section was intentionally not edited because the `onUnavailable` / `onPartial.visiblePrefixExhausted` fallback contract is stable.

Final verification:

- Manual review of `docs/agent-dsl-cookbook.md` "Visible Prefix Declaration" and "FITL Coup Timing Example" against `packages/engine/src/kernel/schemas-core.ts` `ObserverPolicySchema` confirmed the example uses `visiblePrefix.sources[]` with `id` and positive-integer `take`.
- `grep -nE 'visiblePrefix|maxItems|topNVisible' docs/agent-dsl-cookbook.md` passed: it returned only `topNVisible`, `visiblePrefix`, and `visiblePrefixExhausted` hits; no `maxItems` hit remained.
- `rg -n -U 'visiblePrefix:\n(?:.*\n){0,6}.*(zones:|maxItems:)' docs/agent-dsl-cookbook.md` passed with zero matches.
- `pnpm turbo lint` passed. First run was a Turbo cache hit; final accepted lint proof was `pnpm turbo lint --force`, which passed with `Cached: 0 cached, 2 total`.
- `pnpm run check:ticket-deps` passed for 2 active tickets and 2334 archived tickets.
- `git diff --check` passed.

Late-edit proof validity:

- Terminal status and proof transcription only; no scope, acceptance criteria, command semantics, touched-file ownership, sibling ownership, dependency classification, docs prose contract, or generated-artifact claim changed after the final docs and lint proof lanes.
- Dependency-check transcription only; no ticket graph, dependency, status, scope, or acceptance semantics changed after `pnpm run check:ticket-deps`.
- Final `git diff --check` transcription only; final hygiene rerun followed this line.
