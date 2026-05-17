# 178POLWASMPERF-001: Discover next material policy-agent bottleneck after rejected WASM batching

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None expected — report/script-only unless live evidence proves a tiny profiler gap
**Deps**: `archive/specs/177-policy-wasm-batched-call-overhead-reduction.md`, `reports/176-phase-6-decision-and-rationale.md`, `reports/177-phase-0-batching-shape-selection.md`

## Problem

Spec 176 selected an **Accelerate WASM** follow-up because Phase 1 and Phase 5 showed current WASM route costs were dominated by marshaling, deserialization, and mixed serialization overhead. Spec 177 tested the first concrete follow-up shape: batching or equivalent host/guest transfer reduction for `productionPreviewDrive`, `previewCandidateFeatureRows`, and related `scoreRows` work.

Spec 177 is now archived as `REJECTED`: Phase 0 measured slow-tier wall time at `78,030.23 ms`, requiring about `3,901.51 ms` for the `>=5%` bar, while an impossible 100% elimination of the measured transfer overhead across the targeted WASM routes would save only about `608.7484 ms`.

The next step must not be "try batching again with a lower bar." The next step is to identify the remaining dominant slow-tier policy-agent bottleneck and decide whether any concrete hypothesis can plausibly clear a material wall-time threshold before writing another implementation spec.

## Assumption Reassessment (2026-05-17)

1. `archive/specs/177-policy-wasm-batched-call-overhead-reduction.md` is terminal `REJECTED`; the active `tickets/177POLWASMBATCH-*` chain has been archived. **Confirmed.**
2. `reports/177-phase-0-batching-shape-selection.md` records verdict `no-transfer-reduction-shape-authorized`, with a measured slow-tier transfer-overhead ceiling of about `608.7484 ms`. **Confirmed.**
3. `reports/176-phase-2-ts-only-hot-paths.md` measured timed TS-only hot buckets at `18.9582%` of slow-tier agent-call time, below the prior `40%` dominance threshold. **Confirmed.**
4. `reports/176-phase-3-cheap-vs-expensive-coverage.md` measured TS-fallback / no-WASM-signal wall time at `52.4665%`, classified as `mixed` rather than `cheap-paths-dominate`. **Confirmed.**
5. `reports/176-phase-4-bytecode-cache-amortization.md` measured compile cost as `cache-cost-negligible`; a cache-only follow-up is not justified by that evidence alone. **Confirmed.**
6. `reports/176-phase-5-state-serialization.md` measured serialization as material but mixed, not strongly byte-linear; by itself it does not justify a byte-size-only ABI optimization. **Confirmed.**
7. There are currently no active tickets in `tickets/` beyond this discovery ticket. **Confirmed after archiving Spec 177 ticket chain.**

## Architecture Check

1. **Measurement before architecture.** Foundation #15 requires attacking the root cause, not preserving the rejected batching shape. This ticket produces a measured bottleneck ranking before any implementation spec is written.
2. **Testing as proof.** Foundation #16 requires a future spec to cite a plausible measured ceiling. This ticket's deliverable is the evidence gate for that future spec.
3. **Engine agnosticism.** The investigation can analyze FITL ARVN as the current witness workload, but any proposed future engine change must be generic. The report must separate workload-specific observations from engine-wide design claims.
4. **Preview signal integrity.** Foundation #20 prevents treating no-signal, fallback, hidden, unresolved, failed, depth-capped, or partial preview output as a simple scalar performance knob. Any future hypothesis touching preview work must preserve advisory provenance and status taxonomy.
5. **No implementation-spec laundering.** If the evidence names no hypothesis with a plausible material ceiling, this ticket closes with `no-material-owner-found` and does not create an implementation spec.

## What to Change

### 1. Build a post-177 bottleneck inventory

Create `reports/178-policy-agent-bottleneck-discovery.md` that reads the existing Spec 176 and Spec 177 reports and ranks remaining slow-tier policy-agent cost owners.

At minimum include these candidate owner classes:

- WASM transfer overhead already rejected by Spec 177.
- TS-only hot buckets from Phase 2.
- TS-fallback / no-WASM-signal work from Phase 3.
- bytecode compile/cache cost from Phase 4.
- mixed serialization and payload-size cost from Phase 5.
- preview work volume and no-signal/advisory behavior, using existing counters and report columns where available.
- outside-WASM / run-to-run residual wall time, explicitly labeled as noisy unless a same-run or same-command attribution exists.

### 2. Define a materiality gate before naming a spec

The report must pre-register a materiality threshold before recommending work. Use the Spec 177 bar as precedent, but do not blindly reuse it if the evidence surface is narrower.

Recommended default:

- `spec-ready`: a named owner has a measured or tightly bounded ceiling of at least `5%` slow-tier FITL ARVN wall time, or a smaller ceiling is justified as critical architectural debt with explicit non-performance value.
- `investigate-more`: a named owner is plausible but current instrumentation cannot bound its ceiling.
- `no-material-owner-found`: existing evidence does not justify a new implementation spec.

### 3. Decide whether existing evidence is enough

Start from existing reports. Add a new profiler script or rerun only if the report cannot answer a concrete bottleneck question from existing artifacts.

If a tiny profiler/report gap is found, keep it bounded to measurement:

- add columns or aggregation only;
- do not change runtime behavior;
- do not implement any optimization;
- record why existing reports were insufficient.

### 4. Produce a recommendation

The report must end with exactly one of:

- `create-spec: <short proposed spec title>` — only when one hypothesis clears the materiality gate;
- `create-investigation-ticket: <short title>` — when a specific missing measurement is required before a spec;
- `stop: no-material-owner-found` — when no evidence-backed next owner exists.

If `create-spec` is recommended, include the proposed spec's problem statement, success threshold, required proof lanes, and Foundation #20 / #14 constraints. Do not create the spec in this ticket unless the user explicitly asks after reviewing the report.

### 5. Update archived decision context if needed

If this ticket materially changes how `reports/176-phase-6-decision-and-rationale.md` or `reports/177-phase-0-batching-shape-selection.md` should be interpreted, add a short dated amendment note to the relevant report. Do not rewrite archived ticket history unless dependency integrity requires a path correction.

## Files to Touch

- `reports/178-policy-agent-bottleneck-discovery.md` (new)
- `packages/engine/scripts/` (modify only if a tiny report/profiler aggregation gap is proven)
- `reports/176-phase-6-decision-and-rationale.md` (modify only if a dated interpretation amendment is needed)
- `reports/177-phase-0-batching-shape-selection.md` (modify only if a dated interpretation amendment is needed)

## Out of Scope

- Creating a new implementation spec before the report identifies a material owner.
- Reopening or reusing `archive/specs/177-policy-wasm-batched-call-overhead-reduction.md`.
- Lowering Spec 177's threshold to make batching look viable.
- Implementing WASM ABI, runtime, policy-profile, kernel, or GameSpec changes.
- Changing preview-signal semantics or collapsing Foundation #20 carriers.
- Treating FITL ARVN evidence as proof of cross-game generalization without explicitly labeling that limitation.

## Acceptance Criteria

### Tests That Must Pass

1. The report exists at `reports/178-policy-agent-bottleneck-discovery.md`.
2. The report cites the Spec 176/177 evidence inputs and explicitly rules out replaying the rejected Spec 177 batching path.
3. The report ranks remaining owner classes with measured percentages, ceilings, or an explicit "not currently measurable" classification.
4. The report ends with exactly one recommendation: `create-spec`, `create-investigation-ticket`, or `stop`.
5. Existing active-ticket dependency integrity passes: `pnpm run check:ticket-deps`.

### Invariants

1. **No implementation work.** This ticket may only produce evidence, reports, and at most tiny profiler/report aggregation support.
2. **No lower-bar batching.** A new spec cannot be recommended by relaxing Spec 177's failed transfer-overhead predicate.
3. **Foundation #20 preserved.** Preview no-signal and fallback behavior is measured as provenance-rich advisory output, not as an implicit scalar.
4. **Engine agnosticism preserved.** Any recommended future engine work is generic, with FITL ARVN framed as the witness workload only.

## Test Plan

### New/Modified Tests

No automated tests are expected if this remains report-only. If a profiler/report aggregation helper changes, add or update the smallest focused test covering that helper.

### Commands

1. `pnpm run check:ticket-deps`
2. `git diff --check`
3. If a profiler/report helper changes: `pnpm -F @ludoforge/engine build`
4. If a profiler/report helper changes: run the focused script/test that proves the new aggregation

## Outcome (2026-05-17)

Outcome amended: 2026-05-17

**Completion date:** 2026-05-17.

**Durable state:** `COMPLETED` as a report-only discovery ticket. The recommendation is a bounded investigation ticket, not an implementation spec.

### What Landed

- Added the post-177 bottleneck inventory report at `reports/178-policy-agent-bottleneck-discovery.md`.
- The report reuses existing Spec 176/177 markdown and CSV artifacts; no profiler helper, runtime code, schema, generated artifact, GameSpecDoc, GameDef, or visual-config change is needed.
- The report rules out replaying Spec 177 transfer reduction as the next owner and recommends a bounded investigation ticket for the material TS-fallback/no-WASM-signal plus outside-WASM policy-agent residual.

### Recommendation

`create-investigation-ticket: Attribute TS-fallback/no-WASM-signal and outside-WASM policy-agent wall time by unsupported owner, no-counter axis, and TS-only hot-bucket family`

No new spec or ticket was created during implementation; the deliverable was the recommendation report only.

Post-review created follow-up `archive/tickets/178POLWASMPERF-002.md` to own the recommended bounded attribution investigation. That follow-up was later completed and archived.

### Ticket Corrections Applied

- `packages/engine/scripts/` is verified-no-edit: existing report/CSV artifacts are sufficient for the first inventory and recommendation; a new profiler/report aggregation helper is not needed for this ticket.
- `reports/176-phase-6-decision-and-rationale.md` is verified-no-edit: no dated interpretation amendment is needed because Spec 176's accelerate decision remains historical context and Spec 177 already records the rejected transfer-reduction follow-up.
- `reports/177-phase-0-batching-shape-selection.md` is verified-no-edit: no dated interpretation amendment is needed because this report preserves its `no-transfer-reduction-shape-authorized` verdict.

### Schema / Generated Fallout

None. This ticket changes Markdown evidence and ticket artifacts only.

### Verification Ledger

- `pnpm run check:ticket-deps` passed for `1` active ticket and `2385` archived tickets.
- `git diff --check` passed.
- `git diff --no-index --check /dev/null reports/178-policy-agent-bottleneck-discovery.md` produced no whitespace diagnostics. The command exits nonzero for ordinary no-index content differences, so the empty output is the hygiene proof.
- `rg -n '[ \t]+$' reports/178-policy-agent-bottleneck-discovery.md tickets/178POLWASMPERF-001.md` produced no matches.

### Late-Edit Proof Validity

No-invalidation: the final status/proof edit only records the already-run proof results and sets the already-proven terminal state; it does not change scope, acceptance criteria, command semantics, touched-file ownership, dependency ownership, or the report recommendation.

### Runtime Surface Breadth

No runtime surface change; report-only planning/evidence surface.

### Post-Review / Archive Review

- Created follow-up `archive/tickets/178POLWASMPERF-002.md` for the recommended bounded attribution investigation. That follow-up was later completed and archived.
- Archived this ticket to `archive/tickets/178POLWASMPERF-001.md`.
- Updated `reports/178-policy-agent-bottleneck-discovery.md` to cite the archived ticket path.
- Post-archive `pnpm run check:ticket-deps` passed for `1` active ticket and `2386` archived tickets.
- Post-archive `git diff --check` passed.
- Post-archive stale active-path sweep found no actionable active `tickets/178POLWASMPERF-001.md` references; the remaining old-path mention is a historical pre-archive verification command in this archived outcome.
