# 173DEEPPRVCOST-004: Phase 1 — Train continuedDeepening decision-stack and projection-key cost closure

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — Zobrist decision-stack digest / encoded-state projection-key reuse path
**Deps**: `tickets/173DEEPPRVCOST-003.md`, `specs/173-deep-preview-drive-cost-reduction.md`

## Problem

Ticket `173DEEPPRVCOST-003` closed the train continuedDeepening token-state-index counter axis, but the post-003 final witness still shows red train elapsed-time gates:

- `train:chooseNStep:add | continuedDeepening`: slow mean `2,438.9376 ms`, still above the ticket-002 `<=1,800 ms` gate.
- `train:chooseNStep:confirm | continuedDeepening`: slow mean `1,698.4784 ms`, still above the ticket-002 `<=1,300 ms` gate.
- Slowest seed `1005`: `104,515.38 ms`, still above the Spec 173 soft target of `<=60 s`.

The same post-003 final rollup shows token-index builds at `0` for both train classes. A diagnostic CPU profile of seed `1005` after the token-index fix shifted the remaining top self-time to decision-stack hashing and encoded-state projection-key construction:

- `digestEncodedDecisionStackFrame` / `zobristKey` in `packages/engine/src/kernel/zobrist.ts`.
- `encodeDecisionStackFrameDigestInput` in `packages/engine/src/kernel/zobrist.ts`.
- `stableStringify` / `encodedStateProjectionKey` in `packages/engine/src/agents/policy-encoded-state-cache.ts`.

This ticket owns the next non-overlapping train continuedDeepening residual axis after encoded builds and token-index builds have both been eliminated.

## Assumption Reassessment (2026-05-15)

1. **The token-index axis is no longer the remaining owner.** Confirmed by `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-003-final.md`: both train rows have `0` token index builds.
2. **The train time gate remains red.** Confirmed by the same witness: slow means remain above `<=1,800 ms` and `<=1,300 ms`, and slowest seed `1005` remains above the `<=60 s` soft target.
3. **The next residual is still generic engine work.** CPU profile samples point at decision-stack digest/key construction and encoded-state projection-key stringification, not FITL-specific rules or profile tuning.
4. **This is not a duplicate of tickets 002 or 003.** Ticket 002 owns encoded-state build elimination; ticket 003 owns token-state-index churn. This ticket starts from a state where both counters are zero and owns residual key/digest cost.
5. **Foundation alignment requires a measured slice, not scope inflation.** Foundation #15 requires naming the new root owner; Foundation #16 requires a witness-driven proof; Foundation #10 preserves existing preview-drive bounds.

## Architecture Check

1. **One-axis discipline is preserved.** This ticket targets projection/digest key construction cost in the same train continuedDeepening workload after encoded builds and token-index builds are gone.
2. **Engine-agnostic boundary preserved.** Any fix must operate on generic `GameState`, `GameDefRuntime`, Zobrist decision-stack digest caches, encoded-state projection caches, or preview-drive runtime structures. No FITL-specific branching, action ids, card ids, or profile mutation.
3. **No backwards-compatibility shims.** Retire or replace duplicated key/digest paths in the same change. Do not leave parallel old/new digest routes.
4. **Determinism remains load-bearing.** Cache warmth or key reuse must not alter final state, decision streams, preview status, trace content, hashes, or aggregate `compositeScore`.

## What to Change

### 1. Investigate residual key/digest cost

Use the post-003 final witness as the baseline. Identify why train continuedDeepening still spends substantial time in decision-stack digest and encoded projection-key construction after encoded-state and token-index counters are zero. Candidate seams to inspect:

- `packages/engine/src/kernel/zobrist.ts` — decision-stack frame digest encoding, digest caching, and run-local cache keys.
- `packages/engine/src/agents/policy-encoded-state-cache.ts` — projection-key construction and stable stringification.
- `packages/engine/src/agents/policy-preview-inner-choosenstep.ts` / `policy-preview-inner.ts` — preview states that differ only in decision-stack/runtime metadata while sharing encoded-view state.
- `packages/engine/src/kernel/state-draft.ts` / apply paths if cloned state identity prevents existing WeakMap cache reuse.

Document the chosen residual owner in this ticket's `Outcome` section before terminal closeout.

### 2. Implement the smallest generic key/digest residual fix

The fix may be a run-local digest cache, projection-key reuse improvement, reduced stringify cadence, or another generic constant-factor reduction. It must:

- Preserve exact deterministic hashing and canonical equality semantics.
- Preserve run-local reset behavior across `forkGameDefRuntimeForRun`.
- Avoid weakening decision-stack identity, replay, Zobrist parity, or encoded-state cache collision safety.
- Avoid changing preview-drive bounds, policy profile data, or FITL rules.

### 3. Re-run the witness

Run the same post-Phase-1 witness with a fresh date/label after the fix lands. The report must show whether train slow means improved materially without reintroducing encoded-state or token-index builds.

## Files to Touch

- `packages/engine/src/kernel/zobrist.ts` (likely modify)
- `packages/engine/src/agents/policy-encoded-state-cache.ts` (likely modify)
- `packages/engine/src/kernel/gamedef-runtime.ts` (possible modify if adding a run-local cache field)
- `packages/engine/src/agents/policy-preview-inner-choosenstep.ts` or nearby preview-drive files (possible modify)
- `packages/engine/test/kernel/*zobrist*` or nearby digest/cache tests (modify/add)
- `packages/engine/test/unit/agents/policy-encoded-state-cache.test.ts` or nearby cache tests (modify/add)
- `reports/fitl-arvn-15-seed-decomposition-<YYYY-MM-DD>.md` (new post-004 witness)
- `reports/fitl-arvn-15-seed-decomposition-<YYYY-MM-DD>.csv` (new post-004 witness)

## Out of Scope

- Encoded-state build elimination already owned by `tickets/173DEEPPRVCOST-002.md`.
- Token-state-index churn already owned by `tickets/173DEEPPRVCOST-003.md`.
- Coup/govern/event residual axes unless the post-004 witness makes one of them the next selected Spec 173 ticket.
- Preview-config retuning (`depthCap`, `maxOptions`, `chooseNBeamWidth`, `capClass`).
- Agent-profile mutation.
- WASM preview-drive ABI extension; that remains Phase-N / Spec 174 scope if Spec 173 escalation criteria fire.
- Kernel legality, apply, publication, or microturn protocol semantics.

## Acceptance Criteria

### Tests That Must Pass

1. Focused decision-stack digest/projection-key correctness and cache-lifecycle tests for the chosen residual fix.
2. Determinism gates:
   - `packages/engine/test/determinism/spec-140-replay-identity.test.ts`
   - `packages/engine/test/determinism/forked-vs-fresh-runtime-parity.test.ts`
   - `packages/engine/test/determinism/zobrist-incremental-parity-fitl-seed-42.test.ts`
   - `packages/engine/test/determinism/zobrist-incremental-parity-fitl-seed-123.test.ts`
   - `packages/engine/test/integration/policy-bytecode-equivalence*.test.ts`
3. Behavioural-drift check: `pnpm -F @ludoforge/engine test:integration:fitl-rules`.
4. Existing suite: `pnpm turbo test --force`.

### Manual Verification

1. Re-run the decomposition witness:
   ```bash
   pnpm -F @ludoforge/engine build
   node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 400000 --date <YYYY-MM-DD>
   ```
2. Confirm train encoded-state builds remain zero:
   - `train:chooseNStep:add`: `0`.
   - `train:chooseNStep:confirm`: `0`.
3. Confirm train token-index builds remain zero:
   - `train:chooseNStep:add`: `0`.
   - `train:chooseNStep:confirm`: `0`.
4. Confirm train slow means improve materially versus post-003 final:
   - `train:chooseNStep:add`: baseline `2,438.9376 ms`.
   - `train:chooseNStep:confirm`: baseline `1,698.4784 ms`.
5. Confirm aggregate harness parity when feasible:
   ```bash
   /usr/bin/time -v bash campaigns/fitl-arvn-agent-evolution/harness.sh
   # compositeScore must match -3.1333; errors=0; truncated=0
   ```

### Invariants

1. **Determinism preserved.** Cache warmth changes no observable game result, hash, trace semantics, or replay output.
2. **Projection-key collision safety preserved.** Encoded-state projection reuse remains guarded by exactly the fields consumed by encoded-state construction, or by a proven byte-equivalent canonical key.
3. **Decision-stack digest correctness preserved.** Any digest reuse remains byte-equivalent to `recomputeDecisionStackFrameDigest`.
4. **Run-local lifetime preserved.** Any new mutable or state-keyed cache resets at run boundaries and cannot leak mutable descendants across runs.
5. **Engine-agnostic boundary preserved.** No FITL-specific ids or rule branches enter engine code.
6. **Measured residual handled truthfully.** If key/digest costs drop but train elapsed gates remain red, record the remaining owner rather than marking Spec 173 complete by assertion.

## Test Plan

### New/Modified Tests

1. Focused digest/projection-key cache test — proves byte-equivalence to fresh digest/key construction and run-local reset/immutability behavior for the chosen design.
2. Focused preview-drive perf witness — proves the optimized train residual path activates and reports no regression in encoded-state or token-index counters.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. Focused digest/projection-key tests selected by the implementation.
3. Focused perf witness selected by the implementation.
4. `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 400000 --date <YYYY-MM-DD>`
5. `pnpm -F @ludoforge/engine test:integration:fitl-rules`
6. Targeted determinism/equivalence gates listed above.
7. `pnpm turbo lint`
8. `pnpm turbo typecheck`
9. `pnpm turbo test --force`
10. `pnpm run check:ticket-deps`

## Outcome

**Completion date**: 2026-05-15.
Outcome amended: 2026-05-15.

### User-Approved Boundary Reset

The first candidate set did not satisfy `docs/FOUNDATIONS.md` alignment because its measured improvement was not reproducible on the same witness lane. The user approved Option A on 2026-05-15: revert the non-material projection-identity and Zobrist feature-key candidates, continue inside this ticket, and keep only changes proven by the post-candidate witness.

### Chosen Residual Owners

Two generic, non-FITL-specific owners landed:

- Encoded-state projection-key stringification reused canonical string segments through a module-level `WeakMap<object, string>` inside `policy-encoded-state-cache.ts`. This preserves the existing canonical string key and collision surface while avoiding repeated stringify work for shared immutable projection subtrees.
- Choose-N intermediate decision-stack hash updates now skip a defensive baseline full-hash recompute only when the caller still holds the already-canonical baseline state. Stale internally-mutated continuation states still take the defensive recompute path.

Rejected attempts:

- A full projection identity cache was reverted because the material improvement did not reproduce on a same-command full witness.
- A Zobrist feature-key specialization was reverted because the full witness was flat/regressive.

### What Landed

- Added stable-stringify object segment caching and focused counters to `packages/engine/src/agents/policy-encoded-state-cache.ts`.
- Added focused cache coverage proving projection-key segment reuse does not change encoded-state cache semantics or collision behavior in `packages/engine/test/unit/agents/policy-encoded-state-cache.test.ts`.
- Added a narrow trusted-baseline option in `packages/engine/src/kernel/microturn/apply.ts` for the hot choose-N intermediate transition only.
- Generated final post-004 witness artifacts:
  - `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-004-final.md`
  - `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-004-final.csv`

### Measured Result and Materiality

| Metric | Post-003 baseline | Post-004 final | Delta | Verdict |
|---|---:|---:|---:|---|
| `train:chooseNStep:add` slow mean | 2,438.9376 ms | 1,559.7078 ms | -36.05% | train add gate closed (`<=1,800 ms`) |
| `train:chooseNStep:confirm` slow mean | 1,698.4784 ms | 1,085.0019 ms | -36.12% | train confirm gate closed (`<=1,300 ms`) |
| Slowest seed 1005 wall time | 104,515.38 ms | 80,502.7 ms | -22.98% | materially improved, still above `<=60 s` soft target |
| `train:chooseNStep:add` encoded builds / token index builds | 0 / 0 | 0 / 0 | unchanged | prior counter closures preserved |
| `train:chooseNStep:confirm` encoded builds / token index builds | 0 / 0 | 0 / 0 | unchanged | prior counter closures preserved |

The train elapsed gates owned by this ticket are now green, and the retained changes are materially better than the post-003 baseline. Spec 173 remains active because the slowest seed is still `80.5027 s`, above the spec-wide `<=60 s` soft target.

### Residual Owner / Successor

The final post-004 witness shifted the next selected non-overlapping residual to `coupArvnRedeployPolice:chooseOne | continuedDeepening`:

- Slow-tier decisions: `52`.
- Slow-tier total: `38,938.6 ms`.
- Slow mean: `748.8192 ms`.
- Fast mean: `408.5609 ms`.
- Slow:fast ratio: `1.8328`.

Successor `archive/tickets/173DEEPPRVCOST-005.md` owns that secondary continuedDeepening axis. This ticket does not widen into coup/govern/event work.

### Invariant Proof Matrix

| Invariant | Witness / assertion | Status | Proof lane |
|---|---|---|---|
| Projection-key collision safety preserved | Existing collision-guard test and new segment-reuse test pass | proven | `policy-encoded-state-cache.test.js` |
| Decision-stack hash correctness preserved | FITL Zobrist parity seeds recompute full hash after every move | proven | `zobrist-incremental-parity-fitl-seed-42.test.js`, `zobrist-incremental-parity-fitl-seed-123.test.js` |
| Prior encoded/token counter closures preserved | Final witness reports train encoded builds and token index builds at `0` | proven | post-004 final report |
| Engine-agnostic boundary preserved | No FITL ids, action ids, card ids, profile data, or preview bounds changed | proven by diff inspection | source diff |

### Command Ledger

| Ticket section | Literal command / shorthand | Ran directly / substituted / pending | Final citation |
|---|---|---|---|
| Build | `pnpm -F @ludoforge/engine build` | ran directly after final source edits | exit 0 |
| Focused projection-key test | focused digest/projection-key tests selected by implementation | ran compiled direct test | `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-encoded-state-cache.test.js`; 7 tests passed |
| Zobrist parity subset | `zobrist-incremental-parity-fitl-seed-42` and `-123` | ran compiled direct subset | 2 tests passed |
| Single-seed probe | focused perf witness selected by implementation | ran with `--seeds 1005 --date 2026-05-15-hash-baseline-skip-probe --output-dir /tmp/ludoforge-173-hash-baseline-skip-probe` | seed 1005 `85,688.06 ms` |
| Final decomposition witness | `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 400000 --date <YYYY-MM-DD>` | ran with `--date 2026-05-15-post-004-final` | exit 0; all 15 seeds completed; report and CSV written |
| FITL rules | `pnpm -F @ludoforge/engine test:integration:fitl-rules` | ran directly | 79/79 files passed |
| Repo lint | `pnpm turbo lint` | ran directly | 2/2 tasks successful |
| Repo typecheck | `pnpm turbo typecheck` | ran directly | 3/3 tasks successful |
| Full quality gate | `pnpm turbo test --force` | ran directly | 5/5 tasks successful; engine default 81/81 files passed |
| Dependency graph | `pnpm run check:ticket-deps` | ran directly after successor/spec edits | ticket dependency integrity check passed for 4 active tickets and 2344 archived tickets |

### Source-Size Ledger

`path | before lines | after lines | crossed cap? | active growth | extraction/defer rationale | successor if any`

`packages/engine/src/agents/policy-encoded-state-cache.ts | 71 | 89 | no | +18 | tiny pure helper cache local to projection-key construction | none`

`packages/engine/src/kernel/microturn/apply.ts | 792 | 800 | no | +8 | narrow option on existing private hash helper; extraction would obscure the correctness precondition | none`

`packages/engine/test/unit/agents/policy-encoded-state-cache.test.ts | 222 | 250 | no | +28 | focused invariant coverage for the new projection segment cache | none`

### Deferred Scope

- `archive/tickets/173DEEPPRVCOST-005.md` owns the next secondary continuedDeepening residual selected by the final post-004 witness.
- Govern/event residual axes remain outside this ticket and should only be selected by a later Spec 173 witness-driven ticket.
- WASM preview-drive coverage remains Phase-N / Spec 174 scope only if Spec 173 §4.2(b) or §4.2(c) fires.
