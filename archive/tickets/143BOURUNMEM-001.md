# 143BOURUNMEM-001: Heap-snapshot evidence report and top-N retainer breakdown

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — diagnostic script + report only; no runtime code changes
**Deps**: `archive/specs/143-bounded-runtime-memory-and-simulation-cost.md`

## Problem

Spec 143's Problem section cites a heap snapshot of the isolated FITL policy witness (seed 1002, profiles `us-baseline,arvn-baseline,nva-baseline,vc-baseline`) as the load-bearing evidence that "the strongest remaining live suspect is not one giant static authored string or one repeated-run runtime cache, but active retained execution/context surfaces during a long policy run." That snapshot is not checked into the repo, so the spec's qualitative description ("active retained execution/context surfaces") gives downstream tickets no concrete per-structure targets. Per the spec's own note: "The top-N retainer breakdown from that snapshot is load-bearing evidence for this spec and should be checked in as `reports/spec-143-heap-snapshot.md` during the first implementation ticket, so follow-on tickets have concrete per-structure targets rather than a qualitative description."

This ticket produces that evidence. It is the root of the 143BOURUNMEM chain — 002's lifetime-class audit consumes it as ground truth, and 003/004 use the top-N retainer identities to target specific structures.

## Assumption Reassessment (2026-04-23)

1. Seed 1002 with the four baseline profiles reproduces the OOM or near-OOM behavior as of the current `main` branch. Confirmed during reassessment: seed 1002 is the standard FITL profiling target (used in `campaigns/fitl-arvn-agent-evolution/diagnose-*.mjs` and `campaigns/fitl-perf-optimization/`).
2. Spec 141 run-boundary cache fixes have landed on `main`. Confirmed: `archive/specs/141-runtime-cache-run-boundary.md` is `COMPLETED`, and `archive/tickets/141RUNCACHE-001..004` are archived.
3. The engine is already compiled to `packages/engine/dist/` — diagnostic scripts can import from `dist/` per the reassess-spec skill's "In-session diagnostic investigations" pattern, avoiding a full-build loop on each run.
4. The investigation is evidence-gathering only; no runtime code is changed by this ticket.
5. Live repro on `2026-04-23` showed that the higher-turn witness still OOMs before it can reliably emit a terminal summary artifact. The checked-in diagnostic therefore needs a stable default capture bound, with the higher-turn OOM preserved as a separate explicit repro command.

## Architecture Check

1. **Reproducible investigation**: the diagnostic script is checked in alongside the report, so the next author can rerun the snapshot on demand rather than relying on a described-but-unreproducible artifact.
2. **Agnostic boundaries preserved**: the diagnostic imports from `dist/` and exercises FITL profiles as configured game data — it does not add FITL-specific branches to engine source (Foundation 1). The script itself lives under `campaigns/`, not `packages/engine/`.
3. **No backwards-compatibility shims**: evidence-only ticket; nothing to deprecate.
4. **Precedent pattern**: `campaigns/fitl-arvn-agent-evolution/diagnose-existing-classifier.mjs` is the canonical exemplar for the pattern (imports from `dist/`, minimal reproduction, checked in alongside the spec it informed). Follow that style.

## What to Change

### 1. Diagnostic script

Author a `node`-executable `.mjs` script that:

- Imports the compiled engine from `packages/engine/dist/`
- Loads the FITL GameDef with profiles `us-baseline,arvn-baseline,nva-baseline,vc-baseline` at seed `1002`
- Runs the simulation with `--expose-gc` and periodic heap snapshots (e.g., every N decisions) using `v8.writeHeapSnapshot` or the Chrome DevTools `--inspect-brk` protocol
- Captures at minimum: peak heap size, retained-size top-N classes (e.g., `Map`, `Array`, `Object`, plus any custom types that dominate), and the growth curve of live objects vs. decision count
- Prints a structured summary the report can quote

Reassessment correction: the higher-turn witness remains the right crash repro, but it is not a truthful default artifact-capture command on current `HEAD` because it can die before the final summary JSON is written. The checked-in script therefore defaults to the smallest stable capture bound that still surfaces the same retainer/growth shape, while higher `--max-turns` values remain available for explicit OOM repro.

### 2. Heap-snapshot report

Write `reports/spec-143-heap-snapshot.md` containing:

- Environment section: `main` HEAD SHA, Node version, flags used to capture the snapshot
- Reproduction command
- Top-N retainer table (by retained size and by instance count), e.g.:

  | Rank | Retained size | Count | Constructor / type | Likely owner structure |
  |------|---------------|-------|--------------------|------------------------|
  | 1 | … | … | `Map` | chooseN `probeCache` / `legalityCache` |
  | 2 | … | … | `Object` (decision-stack frame shape) | `decisionStackFrame` continuation fields |
  | … | | | | |

- Growth-curve observation: does heap grow linearly with decision count? Does per-decision runtime follow the same curve?
- Explicit mapping from top-N entries to the structures listed in Spec 143 Section 1's non-binding classification table. If any top-N entry does NOT map to a listed structure, flag as a gap for 002 to address.

## Files to Touch

- `campaigns/fitl-perf-optimization/diagnose-spec-143-heap.mjs` (new) — diagnostic script. Location follows the precedent of other `diagnose-*.mjs` scripts under `campaigns/fitl-perf-optimization/`; if the campaign's conventions place diagnostics elsewhere, match the existing convention during implementation.
- `reports/spec-143-heap-snapshot.md` (new) — the top-N retainer breakdown report.

## Out of Scope

- Any engine source changes — this ticket captures evidence only. All actual compaction, scope-boundary, and field-split work lives in 003 and 004.
- Interpretation of the retainers into an authoritative lifetime-class classification — that is 002's work. 001 produces the raw breakdown; 002 does the audit.
- Advisory CI witness wiring — that is 005/006.

## Acceptance Criteria

### Tests That Must Pass

1. Manual: running `node --expose-gc campaigns/fitl-perf-optimization/diagnose-spec-143-heap.mjs --seed 1002` produces a heap-snapshot file and a summary section that matches the structure described in "What to Change §2."
2. The checked-in `reports/spec-143-heap-snapshot.md` includes all sections listed above (environment, reproduction, top-N table, growth curve, structure mapping).
3. The report explicitly distinguishes the stable artifact-capture command from the higher-turn OOM repro command when those differ on current `HEAD`.
4. Existing suite sanity stays narrow to the owned slice: `pnpm -F @ludoforge/engine build` plus focused diagnostic/manual checks are sufficient because no engine runtime source changed.

### Invariants

1. The diagnostic script imports from `packages/engine/dist/`, not `src/`, so it runs against the deployed engine without a full-build loop.
2. The report's top-N table rows link back to concrete source locations (file path + symbol) so 002 and 003/004 can act on them directly.
3. No engine source file is modified by this ticket.
4. If the stable artifact-capture command differs from the higher-turn OOM repro command, both commands are recorded explicitly in the report and ticket closeout.

## Test Plan

### New/Modified Tests

1. `campaigns/fitl-perf-optimization/diagnose-spec-143-heap.mjs` — the ticket's own diagnostic; manual verification via the reproduction command.
2. No new test-framework tests — this is evidence capture, not regression gating.

### Commands

1. Build engine (required before running against `dist/`): `pnpm -F @ludoforge/engine build`
2. Syntax-check the diagnostic: `node --check campaigns/fitl-perf-optimization/diagnose-spec-143-heap.mjs`
3. Stable artifact-capture run: `node --expose-gc campaigns/fitl-perf-optimization/diagnose-spec-143-heap.mjs --seed 1002`
4. Control run used in the report's baseline comparison: `node --expose-gc campaigns/fitl-perf-optimization/diagnose-spec-143-heap.mjs --seed 1002 --max-turns 0`
5. Higher-turn OOM repro used in the report: `node --expose-gc campaigns/fitl-perf-optimization/diagnose-spec-143-heap.mjs --seed 1002 --max-turns 10`

## Outcome

- Completed: 2026-04-23
- Added `campaigns/fitl-perf-optimization/diagnose-spec-143-heap.mjs` to capture heap samples, emit `.heapsnapshot` artifacts, and summarize representative top retainers from the final snapshot while importing only from `packages/engine/dist/`.
- Added `reports/spec-143-heap-snapshot.md` with the environment, stable capture command, separate OOM repro command, growth curve, retainer tables, and explicit mapping back to Spec 143 Section 1's starter table.
- Confirmed that the higher-turn witness still OOMs on current `HEAD`; the checked-in artifact path therefore defaults to the smallest stable capture bound (`--max-turns 3`) while preserving the higher-turn crash as a separate repro command in the report.

- ticket corrections applied: `one default command should both reproduce the higher-turn OOM and always emit a final summary artifact -> stable capture defaults to --max-turns 3; higher-turn OOM repro remains a separate explicit command`
- verification set: `pnpm -F @ludoforge/engine build`; `node --check campaigns/fitl-perf-optimization/diagnose-spec-143-heap.mjs`; `node --expose-gc campaigns/fitl-perf-optimization/diagnose-spec-143-heap.mjs --seed 1002`; `node --expose-gc campaigns/fitl-perf-optimization/diagnose-spec-143-heap.mjs --seed 1002 --max-turns 0`; `node --expose-gc campaigns/fitl-perf-optimization/diagnose-spec-143-heap.mjs --seed 1002 --max-turns 10`
- proof gaps: none
