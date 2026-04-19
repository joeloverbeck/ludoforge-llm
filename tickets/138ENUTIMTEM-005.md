# 138ENUTIMTEM-005: Caching gate and CI performance assertion for guided-classifier overhead

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Conditional — cache slot on `GameDefRuntime` iff profiling gate triggers
**Deps**: `archive/tickets/138ENUTIMTEM-006.md`, `archive/tickets/138ENUTIMTEM-004.md`

## Problem

Per Spec 138 Investigation I4 and Goal G5, the guided-classifier pass runs per free-operation template per enumeration. The original draft phrasing assumed a scalar head subset from 138ENUTIMTEM-003; after the 2026-04-19 boundary correction, this ticket instead measures the final multi-pick-capable guidance contract landing in 138ENUTIMTEM-006. Before declaring that fix complete, the spec requires a profiling gate: if the corrected guidance path adds >25% wall-clock overhead to the 20-seed arvn sweep vs. pre-spec baseline, a memoization cache keyed by `(stateHash, actionId)` is added to `GameDefRuntime`; otherwise caching is deferred as YAGNI. A CI performance gate then enforces the <25% budget as a regression barrier.

This is a **gate ticket**: its scope is measurement-driven. Close with descope path if the measurement is <25% and no cache is warranted.

## Assumption Reassessment (2026-04-19)

1. `GameDefRuntime` is at `packages/engine/src/kernel/gamedef-runtime.ts`. Exports the runtime struct that already carries caches for `alwaysCompleteActionIds`, first-decision domains, and adjacency graph. Adding an LRU subset cache fits the existing pattern.
2. `stateHash` is deterministic and incorporates all rule-authoritative state (Foundation #8, #13). Safe cache key.
3. `actionId` is a branded string on `Move`. Safe cache key.
4. Existing campaign runner at `campaigns/fitl-arvn-agent-evolution/run-tournament.mjs` supports wall-clock timing output via the harness. Its output parses via the gate harness at `campaigns/fitl-arvn-agent-evolution/harness.sh` (confirm during implementation).
5. No existing `lru-cache` package dependency in `packages/engine/` — if caching lands, implement a minimal LRU inline rather than adding a dependency (matches the project's "no speculative deps" pattern).

## Architecture Check

1. Measurement-first, implementation-second — the cache lands only if the gate triggers. YAGNI-compliant.
2. If caching lands: cross-run cache reuse is safe because `stateHash` is deterministic (Foundation #13 artifact identity); per-run cache is cleared at simulation boundaries via `GameDefRuntime` lifecycle.
3. LRU bound (target 4096 entries) keeps memory bounded (Foundation #10 bounded computation).
4. Cache is scoped to `GameDefRuntime` — Foundation #11 scoped-mutation exception applies (the existing runtime caches already use this pattern; the new slot follows precedent).
5. CI performance gate asserts a quantitative invariant that prevents future regressions — Foundation #16 testing-as-proof.

## What to Change

### 1. Profile the 20-seed arvn sweep

Before any code change, capture baseline and post-guided-chooser wall-clock timings:
- Baseline: checkout the commit prior to the guided-completion series merge (use `git log` to identify), run `time node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 20 --players 4 --evolved-seat arvn --max-turns 200`, record wall-clock.
- Post-guidance: checkout HEAD after 138ENUTIMTEM-006 merges, run the same command, record wall-clock.
- Compute overhead: `(post - baseline) / baseline`.

Document the measurement in the ticket's Outcome field (when archived).

### 2. Gate decision

- **If overhead > 25%**: proceed to step 3 (add cache) and step 4 (CI gate).
- **If overhead ≤ 25%**: skip step 3 — no cache lands. Proceed directly to step 4 (CI gate). The gate's existence is itself the protection: a future regression that pushes past 25% triggers the gate; at that point a follow-up ticket adds the cache.

### 3. Conditional: add LRU cache on `GameDefRuntime`

Only if step 2 triggers caching:
- Add a guided-head cache slot to `GameDefRuntime`. Final value type depends on the 138ENUTIMTEM-006 contract; key format remains `${stateHash}:${actionId}` unless implementation proves a broader deterministic key is required.
- Implement a minimal LRU inline in `packages/engine/src/kernel/gamedef-runtime.ts` (no new dependency). Target max 4096 entries.
- Wire into `prepare-playable-moves.ts`'s guided-completion path: before calling `classifyDecisionSequenceSatisfiability`, check the cache; on miss, classify and populate the cache.
- Clear the cache at simulation boundary — confirm where `GameDefRuntime` is constructed per sim (`createGameDefRuntime` in `gamedef-runtime.ts`) and ensure fresh instances carry empty caches.

### 4. CI performance gate

Add a new test under `packages/engine/test/performance/spec-138-guided-classifier-overhead.test.ts`:
- Run the 20-seed arvn sweep twice within the test process: once with corrected guidance disabled behind a test-only flag, once with the default guided path active.
- Measure wall-clock for each sweep.
- Assert `(guided - uniform) / uniform < 0.25`.
- File-top marker: `// @test-class: architectural-invariant`.

If wall-clock tests are known-flaky in CI, alternative: measure total `classifyDecisionSequenceSatisfiability` probe-step count as a deterministic proxy, with a corresponding probe-step budget asserted to remain within a bounded multiple of baseline. Choose whichever produces stable CI signal; document the choice in the test file's header comment.

### 5. Descope path

If step 2 shows overhead ≤ 25%:
- Close this ticket with "Descoped — overhead measured at X% (< 25% threshold); cache deferred to future ticket if CI gate triggers regression." in the Outcome field.
- The CI performance gate (step 4) still lands — it's the regression barrier for the deferred cache.

## Files to Touch

- `packages/engine/src/kernel/gamedef-runtime.ts` (modify, conditional on gate)
- `packages/engine/src/agents/prepare-playable-moves.ts` (modify, conditional on gate — cache lookup wiring)
- `packages/engine/test/performance/spec-138-guided-classifier-overhead.test.ts` (new)

## Out of Scope

- No changes to the subset-extraction algorithm itself (owned by 138ENUTIMTEM-002).
- No changes to the guided-completion logic itself (owned by 138ENUTIMTEM-006).
- No changes to stop-reason / error-class deletion (owned by 138ENUTIMTEM-004).
- No cache persistence across processes — the cache is per-`GameDefRuntime` instance, cleared at simulation boundary.
- No cross-game optimization — the cache is keyed by `(stateHash, actionId)` which is game-agnostic, but the decision to cache is scoped to this spec's FITL trigger.

## Acceptance Criteria

### Tests That Must Pass

1. CI performance gate (step 4) passes: guided overhead < 25% of baseline uniform sampler (with or without cache, depending on step 2 decision).
2. If cache lands: `classifyDecisionSequenceSatisfiability` is called at most once per unique `(stateHash, actionId)` within a single simulation run.
3. `pnpm turbo build test lint typecheck` green.
4. `pnpm run check:ticket-deps` passes.
5. 20-seed arvn sweep under guided completion produces the same final stateHash as baseline for every seed where guidance did not restrict the head domain (re-confirms the determinism invariant after caching).

### Invariants

1. Cache reads and writes are deterministic: same key → same subset across runs (Foundation #8).
2. Cache is bounded: maximum 4096 entries, LRU eviction (Foundation #10).
3. Cache key construction uses `stateHash` directly — no hash-of-hash, no ambient process state (Foundation #8, #13).
4. CI performance gate is a hard assertion, not a warning — regression past 25% overhead fails the build.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/performance/spec-138-guided-classifier-overhead.test.ts` (new) — CI performance gate.
2. If cache lands: extend `packages/engine/test/unit/kernel/gamedef-runtime.test.ts` (create if absent) with cache-hit / cache-miss / LRU-eviction unit tests.

### Commands

1. Baseline profiling: `time node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 20 --players 4 --evolved-seat arvn --max-turns 200` (on pre-003 commit and on post-004 HEAD)
2. `pnpm -F @ludoforge/engine test:e2e --test-name-pattern="spec-138-guided-classifier-overhead"`
3. `pnpm turbo build test lint typecheck`
