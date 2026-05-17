# 176POLWASMPERF-005: Phase 4 — H4 bytecode cache amortization instrumentation + report

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — feature-flagged per-axis bytecode-cache compile / hit / miss instrumentation in `packages/engine/src/agents/policy-wasm-score-bytecode-cache.ts`.
**Deps**: `archive/tickets/176POLWASMPERF-001.md`

## Problem

Spec 176 §5 Phase 4 tests hypothesis **H4**: bytecode cache misses dominate compile cost. Each unique policy bytecode shape compiles in WASM once and caches; if shapes vary per-batch, cache miss + compile cost can dominate execution savings. Today `getScoreRowBytecodeCompileCount` exists in `policy-wasm-score-bytecode-cache.ts` and the aggregate compile count is captured by the profiler at `policy-wasm-score-bytecode-cache.ts` via `bytecodeCacheCompileCount` (line 348 of the profiler script), but the data is not partitioned per axis and the hit/miss-vs-compile-time correlation is not measured.

This ticket adds feature-flagged per-axis instrumentation (gated on the same `POLICY_WASM_TIMING_PROFILE` flag established by Phase 0), runs a 15-seed campaign, and writes the cache-effectiveness verdict.

## Assumption Reassessment (2026-05-17)

1. `packages/engine/src/agents/policy-wasm-score-bytecode-cache.ts` exists (size ~4.3 KB) and exposes the existing aggregate compile counter — verified.
2. The profiler script `packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs` already captures `bytecodeCacheCompileCount` per bucket — verified at line 348. This ticket extends the capture to include per-axis cache hit/miss + compile-time-ms, behind the timing flag.
3. The `POLICY_WASM_TIMING_PROFILE` flag established by ticket 001 is the canonical gate for all spec-176 timing-related instrumentation. This ticket reuses it; it does NOT introduce a separate flag.
4. "Per axis" means partitioned by the same axis taxonomy used in Phase 4i's "Top Hot Axes In Slow-Tier Seeds" — i.e., the existing `(groupAction:chooseStep | capClass)` aggregation in the profiler.

## Architecture Check

1. **Single flag (Foundation #14)**: Reuses `POLICY_WASM_TIMING_PROFILE` rather than adding a parallel flag. When the flag is unset, the per-axis cache instrumentation is dormant — the existing aggregate counter continues unchanged for backward-compatible witness CSV layout.
2. **Engine agnosticism (Foundation #1)**: Instrumentation lives in the WASM glue and the profiler script. No game-specific logic.
3. **Determinism (Foundation #8)**: Cache instrumentation is observational. It MUST NOT alter cache eviction or compile order.
4. **No backwards-compatibility shim**: Instrumentation is added cleanly; when spec 176 closes and the flag is removed by the follow-up spec, the instrumentation is deleted, not deprecated.

## What to Change

### 1. Extend the bytecode cache with per-axis hit/miss/compile-time accumulators

In `packages/engine/src/agents/policy-wasm-score-bytecode-cache.ts`:

- Add a per-axis accumulator map keyed by axis label (`{ groupAction, chooseStep, capClass }`-joined or whatever the existing axis-label convention is — read from the existing profiler aggregation).
- For each cache lookup, record one of `hit`, `miss-then-compile`, or `compile-time-ms` (the wall time consumed by the compile call when the lookup is a miss).
- The accumulator only allocates and records when `POLICY_WASM_TIMING_PROFILE` is set (cached env-flag read, as established by Phase 0).
- Expose `snapshotPolicyWasmBytecodeCacheAxisStats(): Record<axisLabel, { hits, misses, compileTimeMs }>` on the module's existing `*Internals` export surface.

### 2. Surface the new accessor in the profiler

In `packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs`:

- When `POLICY_WASM_TIMING_PROFILE=1`, snapshot the per-axis cache stats between seeds and emit additional CSV columns (`cacheHits`, `cacheMisses`, `cacheCompileTimeMs`) per per-axis row. Columns are empty when the flag is off.
- Aggregate per-axis totals into the witness markdown report's existing per-axis table.

### 3. Run the Phase 4 measurement

```
POLICY_WASM_TIMING_PROFILE=1 node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs \
  --seeds 1000..1014 --timeout-ms 600000 --date 2026-05-NN-phase-4-h4-cache-amortization
```

### 4. Write the H4 verdict report

Write `reports/176-phase-4-bytecode-cache-amortization.md` containing:

- Per-axis table: `axisLabel`, `cacheHits`, `cacheMisses`, `hitRate`, `compileTimeMs`, `compileTimeMs / wasmExecutionMs`.
- Slow-tier subtotal for the same metrics.
- Verdict:
  - `cache-amortizes-cleanly` — overall hit rate ≥95% AND total compile time / total WASM execution time ≤5%.
  - `cache-thrashes` — overall hit rate <80% OR compile time / execution time ≥20% on any axis.
  - `cache-cost-negligible` — between the above; compile cost is observable but not dominant.
- Implication note for Phase 6: which decision-tree branch this verdict supports (per spec 176 §6 — `H4 (cache misses)` → Accelerate with a small follow-up ticket).

## Files to Touch

- `packages/engine/src/agents/policy-wasm-score-bytecode-cache.ts` (modify) — per-axis accumulator + accessor.
- `packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs` (modify) — capture and surface per-axis stats.
- `reports/176-phase-4-bytecode-cache-amortization.md` (new) — H4 verdict report.
- `reports/fitl-arvn-15-seed-decomposition-2026-05-NN-phase-4-h4-cache-amortization.{md,csv}` (new) — witness artifacts.

## Out of Scope

- Any cache-eviction or cache-shape changes — even if the verdict is `cache-thrashes`, the fix design is owned by Phase 6's follow-up. This ticket only measures.
- Cross-axis cache invalidation analysis (e.g., does compiling axis A's bytecode evict axis B's entry?) — out of scope unless the verdict is `cache-thrashes`, in which case the report notes it as a follow-up investigation.
- Modifying the existing aggregate `bytecodeCacheCompileCount` accessor — the new per-axis accessor is additive.

## Acceptance Criteria

### Tests That Must Pass

1. New unit test asserting `snapshotPolicyWasmBytecodeCacheAxisStats` returns empty when `POLICY_WASM_TIMING_PROFILE` is unset, and non-empty after a single routed score-row call when the flag is set. `@test-class: architectural-invariant`.
2. New unit test asserting cache hit/miss totals equal the aggregate `bytecodeCacheCompileCount + cacheHits` (i.e., per-axis partition sums to the aggregate). `@test-class: architectural-invariant`.
3. Existing suite: `pnpm turbo test`.
4. Existing suite: `pnpm turbo lint`.
5. Existing suite: `pnpm turbo typecheck`.

### Invariants

1. With the flag unset, per-axis cache accumulators allocate no memory per call (verified by the test above).
2. Cache instrumentation does not alter cache eviction policy or compile order — verified by the existing replay-identity tests passing (since cache evolution is deterministic given the input call sequence).
3. The new accessor's totals reconcile with the existing aggregate compile counter.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/agents/policy-wasm-bytecode-cache-axis-stats.test.ts` — new file. Tests the flag-gated accumulator and the partition-sums-to-aggregate invariant. `@test-class: architectural-invariant`.

### Commands

1. `pnpm -F @ludoforge/engine test:unit packages/engine/test/agents/policy-wasm-bytecode-cache-axis-stats.test.ts`
2. `pnpm turbo lint typecheck`
3. `pnpm turbo test`
4. (Manual) Phase 4 measurement command in §3 above; verify the report writes successfully and the verdict is one of the three defined values.

## Outcome (2026-05-17)

The implementation landed the feature-flagged bytecode cache instrumentation and the H4 measurement artifacts:

- `packages/engine/src/agents/policy-wasm-score-bytecode-cache.ts` now records aggregate cache hits, misses, compile time, and per-axis `{ hits, misses, compileTimeMs }` only when `POLICY_WASM_TIMING_PROFILE=1` is enabled at module import. The existing aggregate compile counter remains unchanged.
- `packages/engine/src/agents/policy-wasm-runtime-counters.ts`, `policy-wasm-runtime-types.ts`, `policy-wasm-runtime.ts`, and `policy-wasm-score-routing.ts` thread the cache stats through the existing policy WASM internals without changing cache eviction or compile ordering.
- `packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs` and `profile-fitl-arvn-15-seed-report-rendering.mjs` emit `cacheHits`, `cacheMisses`, and `cacheCompileTimeMs` in the CSV and Markdown witness. `packages/engine/scripts/profile-fitl-arvn-15-seed-cli.mjs` was extracted so the profiler script stays under the repo file-size cap.
- `packages/engine/test/unit/agents/policy-wasm-bytecode-cache-axis-stats.test.ts` proves the flag-gated stats surface and the `compileCount + hitCount` reconciliation.
- `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-4-h4-cache-amortization.md` and `.csv` are the full 15-seed witness artifacts.
- `reports/176-phase-4-bytecode-cache-amortization.md` records the H4 verdict: `cache-cost-negligible`.

Ticket corrections applied:

- The draft's `groupAction | chooseStep | capClass` axis wording was stale. The live profiler axis is `microturnClass|previewBranch`, matching the existing Phase 3 report and the profiler's "Top Hot Axes In Slow-Tier Seeds" table. The H4 report and witness use that live axis taxonomy.
- The ticket's focused test command used a source path shape that the engine lane does not consume directly. The repo-valid focused command is `pnpm -F @ludoforge/engine build` followed by `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-wasm-bytecode-cache-axis-stats.test.js`.

Source-size ledger:

| Path | Before lines | After lines | Crossed cap? | Active growth | Extraction/defer rationale | Successor |
|---|---:|---:|---|---|---|---|
| `packages/engine/src/agents/policy-wasm-runtime.ts` | 1337 | 1337 | no; preexisting over cap | no net growth (`4` added / `4` deleted) | Axis parameter threaded without growing the already-oversize file. | none |
| `packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs` | 793 | 778 | no | net shrink after extracting CLI helpers | Extraction kept the ticket-owned profiler under the 800-line cap. | none |

Measured verdict:

| Scope | Cache hits | Cache misses | Hit rate | Compile ms | WASM execution ms | Compile / execution |
|---|---:|---:|---:|---:|---:|---:|
| All 15 seeds | 11664 | 600 | 95.11% | 25.52 | 461.88 | 5.52% |
| Slow tier only | 11561 | 600 | 95.07% | 25.52 | 458.47 | 5.57% |

Final proof:

- `pnpm -F @ludoforge/engine build` — pass.
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-wasm-bytecode-cache-axis-stats.test.js` — pass before broad lanes and pass again after broad lanes; `2` tests passed.
- `POLICY_WASM_TIMING_PROFILE=1 node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 600000 --date 2026-05-17-phase-4-h4-cache-amortization` — pass; `15/15` seeds completed, `3769` per-decision rows written.
- `pnpm turbo lint` — pass; `2` tasks successful, `1` cached runner task classified as cache-hit supplemental.
- `pnpm turbo typecheck` — pass; `3` tasks successful, `0` cached.
- `pnpm turbo test` — pass; `5` tasks successful, `2` cached build tasks classified as cache-hit supplemental because engine/runner tests ran fresh. Runner emitted existing jsdom/canvas and contained ticker stderr from passing tests; classified as non-ticket-owned advisory output.
- `pnpm run check:ticket-deps` — pass after terminal status edit; checked `3` active tickets and `2379` archived tickets.
- `git diff --check` — pass for tracked changes.
- `rg -n '[ \t]+$' packages/engine/scripts/profile-fitl-arvn-15-seed-cli.mjs packages/engine/test/unit/agents/policy-wasm-bytecode-cache-axis-stats.test.ts reports/176-phase-4-bytecode-cache-amortization.md reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-4-h4-cache-amortization.md reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-4-h4-cache-amortization.csv` — pass for retained untracked files; no trailing-whitespace matches.

Post-review correction:

- `packages/engine/src/agents/policy-wasm-score-bytecode-cache.ts` now snapshots per-axis stats with deterministic ordinal string ordering instead of `localeCompare`, preserving Foundation #8's locale-independent ordering expectation for cache/profiling artifacts.
- `packages/engine/test/unit/agents/policy-wasm-bytecode-cache-axis-stats.test.ts` now includes a deterministic ordinal-order assertion for axis labels that would sort differently under locale-sensitive comparison.
- Post-review proof: `pnpm -F @ludoforge/engine build` — pass; `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-wasm-bytecode-cache-axis-stats.test.js` — pass, `3` tests passed; `pnpm turbo lint` — pass; `pnpm turbo typecheck` — pass; `pnpm turbo test` — pass.

Schema/generated fallout:

- `pnpm turbo test` ran the engine `schema:artifacts:check` as part of `@ludoforge/engine:test`; no schema artifact diff was produced.

Late proof validity:

- The final implementation proof was refreshed after the post-review deterministic-ordering cleanup with the focused build/test pair above. The expensive 15-seed H4 measurement was not rerun because the cleanup changes only snapshot key ordering, not cache hit/miss/compile counters, execution routing, compile order, or measured values. The earlier measurement artifacts remain valid for the recorded H4 verdict.
