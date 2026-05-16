# 173DEEPPRVCOST-002: Phase 1 — Train continuedDeepening encoded-build axis closure

**Status**: COMPLETED - archived residual owner moved to Spec 174
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `GameDefRuntime` encoded-state projection cache and policy encoded-state cache keying
**Deps**: `archive/tickets/173DEEPPRVCOST-001.md`, `archive/specs/173-deep-preview-drive-cost-reduction.md`

## Problem

The Phase 0 witness (`reports/fitl-arvn-15-seed-decomposition-2026-05-15.md`) names the dominant slow-tier axis: train operations under `continuedDeepening` account for **~74% of the top-10 slow-tier total time**. Two specific decision classes carry this cost:

- **`train:chooseNStep:add | continuedDeepening`** — 33 slow-tier decisions, 177,493 ms total, mean 5,378 ms/decision (fast-tier mean 437 ms; slow:fast ratio **12.3×**).
- **`train:chooseNStep:confirm | continuedDeepening`** — 35 slow-tier decisions, 140,315 ms total, mean 4,009 ms/decision (fast-tier mean 0.094 ms; slow:fast ratio **30,431×**).

Combined: **317,808 ms** of measured agent-call time across 68 decisions in the slow-tier seeds — single largest concentrated cost on the post-spec-172 baseline.

The per-microturn-class telemetry in the same rollup reveals the structural cause is encoded-state build cost dominating each train preview-drive invocation:

- `train:chooseNStep:add` produces **55,707 encoded builds across 62 decisions** (~898 builds per decision)
- `train:chooseNStep:confirm` produces **33,651 encoded builds across 94 decisions** (~358 builds per decision)
- For comparison, `coupArvnRedeployPolice:chooseOne` produces ~21 builds per decision; `event` produces 1 per decision

Encoded *object hits* exist (26,647 for `train:add`, 15,975 for `train:confirm`) — the spec 172 §4.4 `WeakMap<GameState, EncodedState>` cache works for sibling option evaluations within one drive node — but the preview drive's deep tree synthesizes many distinct future `GameState` objects, each one a cache miss because object identity changes. Over a 16-deep × 8-wide preview tree exploring train-operation candidate sequences, hundreds of synthesized states accumulate per decision, each requiring a fresh `buildEncodedState` call.

This ticket closes the train continuedDeepening encoded-build axis — both decision classes share one root cause, so a single fix targets both. Per spec §4.2 "One axis per ticket" — the train preview-drive encoded-build cost IS one axis, manifested across two related classes.

## Assumption Reassessment (2026-05-15)

1. **Phase 0 witness is current and the rollup is the source of truth.** Confirmed — `reports/fitl-arvn-15-seed-decomposition-2026-05-15.md` and `.csv` exist. Archived ticket `archive/tickets/173DEEPPRVCOST-001.md` records the witness ran against the 15-seed corpus on `dd79c500f` + the merged spec-172 PR (`b1f95ca8f`). All 15 seeds completed within the per-seed `400000 ms` timeout. Hot-axis acceptance was met: 2 axes above the `>3×` slow:fast threshold.
2. **The spec-172 caches are intact and contributing.** Confirmed via the rollup's "Encoded object hits" column — `train:chooseNStep:add` shows `26,647` object hits against `55,707` builds, meaning ~32% of within-node sibling lookups hit the spec-172 `policyEncodedStateCache`. The cache is working; the residual cost is from inter-node cache misses on synthesized future states.
3. **The deep `continuedDeepening` route runs in TS, not WASM.** Confirmed via the rollup's "Preview branch" column — the dominant train hot axes are tagged `continuedDeepening` (TS path), not `singlePass` or `greedy`. This matches `policy-wasm-score-routing.ts`'s fail-closed behavior for complex previews. WASM preview-drive coverage extension (Phase N escalation) remains explicitly out of scope per spec §3.
4. **Existing `GameDefRuntime` cache pattern is the established mechanism for new caches.** Confirmed via `packages/engine/src/kernel/gamedef-runtime.ts` — `compiledQueryPlanCache` is the `sharedStructural` precedent and `tokenStateIndexCache`/`policyEncodedStateCache` are the `runLocal` precedents. Spec 172 §4.5 added a constructor invariant; new caches in this ticket continue the pattern.
5. **Determinism gates pass on the post-witness baseline.** Confirmed via the archived ticket's Command Ledger — `pnpm -F @ludoforge/engine test` (`81/81 files passed`), `test:integration:fitl-rules` (`79/79 files passed`), `pnpm turbo test --force` all green on 2026-05-15. This ticket inherits that baseline and MUST preserve it byte-identical.
6. **No new test files have been added to the corpus that exercise train-operation continuedDeepening at the slice level.** Confirmed by absence of train-specific perf tests in `packages/engine/test/perf/agents/`. The architectural-invariant test for any new cache (per spec §6.2) is novel scope owned by this ticket.

7. **Post-002 witness changed the residual owner.** Confirmed by `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-002.md`: encoded builds on `train:chooseNStep:add` and `train:chooseNStep:confirm` dropped to `0`, but the ticket's train time gate is still red. User approved option 2 on 2026-05-15: keep the encoded-build closure, mark this ticket nonterminal/blocked on the residual measured gate at that time, and create successor `archive/tickets/173DEEPPRVCOST-003.md` for the token-state-index residual.

No blocking mismatches against the encoded-build axis. The train elapsed-time target remains red and is deferred to the successor named above.

## Architecture Check

1. **One-axis discipline is preserved.** Although the fix touches two named classes (`train:chooseNStep:add`, `train:chooseNStep:confirm`), they manifest a *single* axis: encoded-build cost on the train-operation continuedDeepening preview drive. The spec §4.2 "One axis per ticket" rule explicitly admits "a single decision class with a measurable per-decision cost gap vs the fast tier, or a single cache miss class with measurable hit-rate evidence" — this ticket targets the cache-miss class, with two decision classes as the manifesting evidence. Cross-class consolidation is the *correct* boundary here, not cross-axis bundling.
2. **Engine-agnostic boundary preserved.** Any new cache or precompute path keys on generic engine structures (`GameState`, `GameDef`, `EncodedStateLayout`, possibly synthesized-state canonical hashes) — no FITL-specific branching. The fix mechanism would benefit any GameDef whose policy profile triggers a deep `continuedDeepening` preview drive over high-state-synthesis decisions; FITL is just the corpus where the pathology was first measured. Foundation #1 preserved.
3. **Cache pattern follows spec 172.** New caches go on `GameDefRuntime` — `sharedStructural` for pure functions of `GameDef`, `runLocal` for state-keyed structures reset per `forkGameDefRuntimeForRun`. Module-level `WeakMap` only for pure-static internals invisible to replay. Constructor invariant from spec 172 §4.5 extends to any new constructor-resolved cache. Foundations #11, #14 preserved.
4. **Spec 172 §4.4 keying constraint inherited and corrected to the live encoded view.** The existing `policyEncodedStateCache` is keyed on `GameState` object identity (collision-free per Foundation #11). The retained fix adds a run-local projection cache keyed by the exact `GameState` fields consumed by `buildEncodedState` (`zones`, `globalVars`, `perPlayerVars`, `zoneVars`, `markers`, and `globalMarkers`) rather than by whole serialized `GameState`. This preserves Foundation #8 because cached reuse is guarded by encoded-view equality, not by Zobrist alone, and it permits safe reuse across decision-stack-only preview states.
5. **No backwards-compatibility shims.** Whatever new cache or precompute path lands replaces the existing miss path; no parallel old/new code routes retained. Foundation #14 preserved.
6. **Determinism is the load-bearing invariant.** This is a pure-perf change. The cached/threaded result MUST be byte-identical to the freshly-built result. `policy-bytecode-equivalence*`, `spec-140-replay-identity`, `forked-vs-fresh-runtime-parity`, and `zobrist-incremental-parity-fitl-seed-{42,123}` are the gates. Foundation #8 preserved.

## What to Change

The ticket prescribes the *axis* and the *constraints*; the *fix mechanism* emerges from the implementer's Phase 2 reassessment of the train-operation preview-drive code path. This is consistent with spec §4.2's witness-driven shape — the witness names the axis, the implementer designs the closure.

### 1. Investigate the train-operation preview-drive state synthesis

The Phase 0 witness names the cost concentration but not the specific synthesis path. The implementer's first task is targeted profiling to identify *why* `train:chooseNStep:add` generates ~898 encoded builds per decision while `coupArvnRedeployPolice:chooseOne` generates only ~21 per decision (despite both running `continuedDeepening`).

Suggested investigation entry points (hypotheses to validate, NOT commitments — the implementer chooses):

- **Branching factor**: Train `chooseNStep:add` may have a high mean candidate count combined with deep step-recursion. The rollup shows `train:add` mean candidates = 18.5 vs `coupArvnRedeployPolice:chooseOne` = 30.7 — surprisingly LOWER, so candidate count alone doesn't explain the build explosion. The driver is likely depth × step-recursion, not branching.
- **State synthesis per candidate**: `policy-preview.ts` `driveSyntheticCompletion` synthesizes a future `GameState` per-candidate-per-depth via the simulator's `applyMove`. Each apply produces a new immutable state object → new cache key → new `buildEncodedState`. The retained fix extends the cache key to encoded-state projection equality so structurally distinct preview states with identical encoded views reuse the same `EncodedState`.
- **`buildEncodedState` per-call cost**: separately from miss count, the per-build cost on synthesized states may be inflatable. `kernel/encoded-state/view.ts` `buildEncodedState` iterates over board tokens; under cube-heavy ARVN play, token count is high. An incremental-from-base-state path could amortize the build cost.

The implementer documents the profile findings in the ticket's `Outcome` section, including the chosen fix mechanism and why alternatives were rejected.

### 2. Implement the chosen fix

The implemented mechanism:

- Adds `policyEncodedStateProjectionCache` as a `runLocal` field on `GameDefRuntime`.
- Keys that cache by the encoded-state projection fields consumed by `buildEncodedState`, while preserving the existing `WeakMap<GameState, EncodedState>` object cache.
- Preserves explicit `encodedState` precedence and resets both encoded-state cache layers across `forkGameDefRuntimeForRun`.
- Leaves preview-drive bounds (`depthCap`, `maxOptions`, `chooseNBeamWidth`, `capClass`) unchanged.

### 3. Re-run the witness post-merge

Per spec §4.2, the post-merge witness output is the proof of axis closure. The implementer:

1. Re-runs `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 400000 --date <YYYY-MM-DD>` after the fix lands.
2. Appends the new run as a dated rollup to `reports/` (per spec §6.3 — append, do not overwrite the Phase 0 baseline).
3. Confirms the train encoded-build axis closed and the hot axes show measurable improvement on slow-tier mean ms/decision and total ms.
4. Because the measured time target remained red, successor `archive/tickets/173DEEPPRVCOST-003.md` owned the residual token-state-index cost.

Expected post-fix targets (informed by current evidence; not contractual):

- `train:chooseNStep:add` slow-tier mean drops from 5,378 ms to <1,000 ms (≥5× reduction).
- `train:chooseNStep:confirm` slow-tier mean drops from 4,009 ms to <500 ms (≥8× reduction).
- Slowest seed `1005` wall-time drops from ~185 s toward the §1 soft target of ≤60 s (this single ticket may not fully close the soft-target gap; subsequent Phase 1 tickets pick up the rest).
- Encoded-build counts on the train classes drop by ≥50%.

If the actual post-fix witness shows large train-axis improvement BUT a different class now dominates the slow-tier, that's expected and informs Phase 1 ticket 003's scope (per spec §4.4).

## Files to Touch

This is an audit-dependent ticket — the exact file set depends on the Phase 2 investigation's choice of fix mechanism. **Likely surface** (with one-line rationale per path):

- `packages/engine/src/agents/policy-encoded-state-cache.ts` — implemented encoded-state projection cache keying.
- `packages/engine/src/kernel/gamedef-runtime.ts` — added `policyEncodedStateProjectionCache` as run-local cache state.
- `packages/engine/test/unit/agents/policy-encoded-state-cache.test.ts` — extended cache equivalence, projection-key collision, and fork-reset coverage.
- `packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs` — corrected generated report status/command text for post-Phase-0 witness runs.
- `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-002.md` (new) — post-002 witness rollup.
- `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-002.csv` (new) — post-002 per-decision CSV.
- `archive/tickets/173DEEPPRVCOST-003.md` — successor for residual token-state-index cost.
- `packages/engine/src/agents/policy-preview.ts` — verified-no-edit; the fix lands below the preview drive at the encoded-state cache seam.
- `packages/engine/src/agents/policy-evaluation-core.ts` — verified-no-edit; already routes constructor encoded-state resolution through `resolvePolicyEncodedState`.
- `packages/engine/src/agents/microturn-option-eval.ts` — verified-no-edit; already passes `runtime` into inner microturn scoring.
- `packages/engine/src/kernel/encoded-state/view.ts` — verified-no-edit; no `buildEncodedState` algorithm change was needed for this encoded-build axis.

## Out of Scope

- **No preview-config retuning.** `depthCap`, `maxOptions`, `chooseNBeamWidth`, `capClass` for `arvn-evolved` are unchanged. Beam pruning is a campaign-side decision, not an engine-side fix.
- **No agent-profile mutation.** `arvn-evolved` Markdown / YAML is not edited.
- **No WASM preview-drive ABI extension.** Phase N escalation gate scope; if §4.2(b)/(c) fires post-002, that becomes Spec 174.
- **No multi-axis bundling.** This ticket addresses ONE axis (train continuedDeepening encoded-build cost) manifested across two related classes. The coup/govern continuedDeepening axes are separate Phase 1 tickets, deferred to a subsequent `/spec-to-tickets` invocation after 002's witness re-run informs their scope per spec §4.4.
- **No event-class bytecode-cache investigation.** The `event` class shows 234 bytecode compiles for 245 decisions (~95% miss rate) — possibly a separate Phase 1 axis, but its total contribution (~30 k ms) is small relative to train (~318 k ms). Defer to Phase 1 ticket 004 or later if 002+003 don't close the §1 soft target.
- **No kernel-surface changes.** `applyMove`, `legalMoves`, the publication contract, the microturn protocol are unchanged.
- **No new ref families, schema fields, or types** beyond the additive `GameDefRuntime` cache field this ticket may add.
- **No descope path.** This ticket is HIGH priority and addresses the dominant cost class; it is not optional. If the §1 investigation reveals the train cost is structurally irreducible without WASM preview-drive extension, the ticket closes by triggering the Phase N escalation gate per spec §4.2(c) — not by silently dropping scope.

## Acceptance Criteria

### Tests That Must Pass

1. Determinism gates byte-identical (load-bearing per spec §6.1):
   - `packages/engine/test/determinism/spec-140-replay-identity.test.ts`
   - `packages/engine/test/determinism/forked-vs-fresh-runtime-parity.test.ts` — load-bearing for any new `runLocal` `GameDefRuntime` field
   - `packages/engine/test/determinism/zobrist-incremental-parity-fitl-seed-42.test.ts` and `-seed-123.test.ts`
   - `packages/engine/test/integration/policy-bytecode-equivalence*.test.ts` — load-bearing for any change touching score-row or preview-drive WASM/TS routing
2. Behavioural-drift checks:
   - `pnpm -F @ludoforge/engine test:integration:fitl-rules` — no FITL rules drift
3. Cache invariants (new test required by spec §6.2 if a new cache lands):
   - `packages/engine/test/unit/agents/policy-encoded-state-cache.test.ts` — cache hit returns value deep-equal to freshly-built value; projection-key uniqueness per the chosen keying surface
   - `packages/engine/test/architecture/policy-evaluation-context-constructor-invariant.test.ts` — verified-no-edit because constructor already resolves encoded state through the cache accessor and focused proof confirms no direct warm builder calls
4. Existing suite: `pnpm turbo test --force` (full suite, force fresh).

### Manual Verification (witness re-run is the load-bearing proof)

1. Re-run the witness against the 15-seed corpus on the post-fix engine commit:
   ```bash
   pnpm -F @ludoforge/engine build
   node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 400000 --date <YYYY-MM-DD>
   ```
2. Confirm the post-merge rollup (`reports/fitl-arvn-15-seed-decomposition-<YYYY-MM-DD>.md`) shows:
   - `train:chooseNStep:add` encoded builds drop from `55,707` to `0`; slow-tier mean improves from `5,378.5904 ms` to `2,537.9756 ms` but remains above the `≤1,800 ms` gate
   - `train:chooseNStep:confirm` encoded builds drop from `33,651` to `0`; slow-tier mean improves from `4,008.9884 ms` to `1,781.6475 ms` but remains above the `≤1,300 ms` gate
   - Slowest seed wall-time improves from `183,274.3 ms` to `107,468.38 ms`, still above the §1 soft target of `≤60 s`
3. Confirm aggregate `compositeScore` from the production harness is byte-identical to the pre-fix baseline:
   ```bash
   /usr/bin/time -v bash campaigns/fitl-arvn-agent-evolution/harness.sh
   # compositeScore must match -3.1333 from reports/fitl-arvn-15-seed-harness-wall-times-2026-05-15.md
   # errors must be 0; truncated must be 0
   ```

### Invariants

1. **Determinism preserved.** Cached/threaded result is byte-identical to freshly-built result. Cache warmth changes nothing observable in `compositeScore`, per-seed margins, decision streams, preview status, or trace content.
2. **Engine-agnostic boundary preserved.** Cache key surface uses generic engine types (`GameState`, `GameDef`, `EncodedStateLayout`, canonical-state-hash). No FITL-specific branching introduced in cache logic.
3. **Spec 172 §4.5 constructor invariant extended, not broken.** If a new constructor-resolved structure is cached, the architectural-invariant test enumerates it; the constructor still resolves all caches via runtime/cached accessors with no direct builder calls.
4. **Cache key collision-free for the encoded view.** The new projection key includes the exact `GameState` fields consumed by `buildEncodedState`; a focused test proves decision-stack-only states can reuse the cached view while a changed encoded global variable cannot collide.
5. **Within-node sibling-option cache hit rate not regressed.** The existing `policyEncodedStateCache` continues to work for sibling option evaluations within one preview-drive node — the fix extends coverage to inter-node sharing without losing intra-node efficiency.
6. **Witness re-run shows measurable improvement but the time gate remains red.** Per spec §4.2, the retained fix is not reverted because the witness shows measurable improvement and no per-decision regression on the owned train classes. The train elapsed-time thresholds remained unmet; successor `archive/tickets/173DEEPPRVCOST-003.md` owned the residual.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-encoded-state-cache.test.ts` (modified) — architectural-invariant test for projection-key reuse, encoded-view collision safety, run-local fork reset, and explicit encoded-state precedence.
2. `packages/engine/test/architecture/policy-evaluation-context-constructor-invariant.test.ts` (verified-no-edit) — existing invariant covers warm constructor access through runtime caches.
3. `packages/engine/test/perf/agents/preview-drive-static-rebuild-witness.perf.test.ts` (verified-no-edit) — counter-based regression guard now proves the optimized path is reached (`buildEncodedState=39`, `hashHit=374`, `miss=39` in the focused run).

### Commands

1. Build:
   ```bash
   pnpm -F @ludoforge/engine build
   ```
2. Targeted determinism gates:
   ```bash
   pnpm -F @ludoforge/engine test packages/engine/test/determinism/spec-140-replay-identity.test.ts
   pnpm -F @ludoforge/engine test packages/engine/test/determinism/forked-vs-fresh-runtime-parity.test.ts
   pnpm -F @ludoforge/engine test packages/engine/test/determinism/zobrist-incremental-parity-fitl-seed-42.test.ts
   pnpm -F @ludoforge/engine test packages/engine/test/determinism/zobrist-incremental-parity-fitl-seed-123.test.ts
   pnpm -F @ludoforge/engine test packages/engine/test/integration/policy-bytecode-equivalence*.test.ts
   ```
3. Behavioural drift check:
   ```bash
   pnpm -F @ludoforge/engine test:integration:fitl-rules
   ```
4. Witness re-run (load-bearing proof):
   ```bash
   node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 400000 --date <YYYY-MM-DD>
   ls -la reports/fitl-arvn-15-seed-decomposition-*.md reports/fitl-arvn-15-seed-decomposition-*.csv
   ```
5. Aggregate parity check via production harness:
   ```bash
   /usr/bin/time -v bash campaigns/fitl-arvn-agent-evolution/harness.sh
   # confirm: compositeScore=-3.1333, errors=0, truncated=0
   ```
6. Full quality gate:
   ```bash
   pnpm turbo lint
   pnpm turbo typecheck
   pnpm turbo test --force
   ```
7. Ticket-deps integrity:
   ```bash
   pnpm run check:ticket-deps
   ```

## Outcome

**Completion date**: 2026-05-15.
Outcome amended: 2026-05-15.

### User-Approved Boundary Reset

The post-002 witness closed the encoded-build counter axis but left the train elapsed-time gates red. After reassessing against `docs/FOUNDATIONS.md`, the user approved option 2 on 2026-05-15: retain the encoded-build closure, keep this ticket nonterminal/blocked at that time rather than archive it as the terminal performance closure, and create successor `archive/tickets/173DEEPPRVCOST-003.md` for the residual token-state-index train cost.

Post-Spec-173 closeout amendment: the successor chain has now completed through `archive/tickets/173DEEPPRVCOST-008.md`, Spec 173 §4.2(c) fired, and `archive/specs/174-wasm-preview-drive-coverage-extension.md` owns the remaining generic WASM preview-drive coverage extension. This ticket is therefore complete as the retained encoded-build closure slice, not as the terminal Spec 173 performance closure.

### What Landed

- Added `policyEncodedStateProjectionCache` to `GameDefRuntime` as a `runLocal` cache reset by `forkGameDefRuntimeForRun`.
- Changed `resolvePolicyEncodedState` to reuse encoded states by encoded-view projection key, while preserving the existing `WeakMap<GameState, EncodedState>` object cache.
- Extended `policy-encoded-state-cache.test.ts` to prove object reuse, encoded-equivalent distinct-state reuse, encoded-view collision safety, run-local fork reset for both cache layers, and explicit `encodedState` precedence.
- Post-review correction: changed projection-key object sorting from `localeCompare` to a locale-independent comparator and added a focused regression guard, preserving Foundation #8's no-system-locale requirement.
- Corrected the decomposition script's generated report status/command text so post-Phase-0 witness reports do not claim to be Phase 0.
- Generated post-002 witness artifacts:
  - `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-002.md`
  - `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-002.csv`

### Measured Result and Materiality

| Metric | Baseline | Post-002 | Delta | Verdict |
|---|---:|---:|---:|---|
| `train:chooseNStep:add` encoded builds | 55,707 | 0 | -100% | encoded-build axis closed |
| `train:chooseNStep:confirm` encoded builds | 33,651 | 0 | -100% | encoded-build axis closed |
| Combined train encoded builds | 89,358 | 0 | -100% | encoded-build axis closed |
| `train:chooseNStep:add` slow mean | 5,378.5904 ms | 2,537.9756 ms | -52.81% | red vs `≤1,800 ms` |
| `train:chooseNStep:confirm` slow mean | 4,008.9884 ms | 1,781.6475 ms | -55.56% | red vs `≤1,300 ms` |
| Combined slow-tier train total | 317,808.07 ms | 146,110.85 ms | -54.03% | material improvement, still red |
| Slowest seed 1005 wall time | 183,274.3 ms | 107,468.38 ms | -41.36% | improved, still above `≤60 s` soft target |

The retained change is correct reusable substrate and materially improves the owned measured seam. The post-002 report shows the residual train rows now have `0` encoded builds but still high token-state-index counts (`train:chooseNStep:add` `33,203`; `train:chooseNStep:confirm` `6,242`), so successor `archive/tickets/173DEEPPRVCOST-003.md` owned that non-overlapping residual. Later successors exhausted the remaining TypeScript-side residual and moved terminal ownership to `archive/specs/174-wasm-preview-drive-coverage-extension.md`.

### Invariant Proof Matrix

| Invariant | Witness / assertion | Status | Proof lane |
|---|---|---|---|
| Encoded cache reuse is byte-identical to fresh build | Cached object and projection hits deep-equal fresh `buildEncodedState` output | proven | `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-encoded-state-cache.test.js ...` |
| Projection key is collision-safe for encoded-state fields | Decision-stack/turn-count-only state reuses; changed encoded global var does not collide | proven | `policy-encoded-state-cache.test.ts` |
| Run-local lifecycle is preserved | Forked runtime resets object and projection caches | proven | `policy-encoded-state-cache.test.ts` |
| Constructor cache invariant remains intact | Warm `PolicyEvaluationContext` constructions do not invoke direct build paths past first touch | proven | `policy-evaluation-context-constructor-invariant.test.ts` |
| Optimized route activates in preview-drive workload | Focused perf witness reports nonzero projection/hash hits and zero duplicate encoded-state rebuilds | proven | `preview-drive-static-rebuild-witness.perf.test.ts` |
| Determinism/behavior preserved | Replay identity, fork/fresh parity, Zobrist parity, bytecode equivalence, FITL rules, campaign harness, and full turbo test lanes pass | proven | final proof set |

### Command Ledger

| Ticket section | Literal command / shorthand | Ran directly / substituted / pending | Final citation |
|---|---|---|---|
| Build | `pnpm -F @ludoforge/engine build` | ran directly before focused compiled tests and witness | exit 0 |
| Cache invariants | new cache test | ran focused compiled test | `policy-encoded-state-cache.test.js` passed |
| Post-review locale-independent cache key guard | focused cache test after `localeCompare` removal | ran directly after rebuild | `policy-encoded-state-cache.test.js` passed; 6 tests / 1 suite |
| Constructor invariant | architecture invariant test | ran focused compiled test | `policy-evaluation-context-constructor-invariant.test.js` passed |
| Perf regression guard | optional perf witness | ran existing focused perf witness | passed; `buildEncodedState=39`, `hashHit=374`, `miss=39` |
| Witness re-run | `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 400000 --date <YYYY-MM-DD>` | ran with `--date 2026-05-15-post-002` | exit 0; all 15 seeds completed; report and CSV written |
| Artifact inspection | `ls -la reports/...` | substituted with direct report/CSV inspection | CSV has 3,741 data rows plus header |
| Determinism/equivalence | focused replay/fork/zobrist/bytecode subset | ran directly after final dist rebuild; reran after post-review locale-independent key cleanup | 26 tests / 7 suites passed |
| FITL rules | `pnpm -F @ludoforge/engine test:integration:fitl-rules` | ran directly | 79/79 files passed |
| Campaign harness | `bash campaigns/fitl-arvn-agent-evolution/harness.sh` | ran directly | exit 0; 15 completed, 0 truncated, 0 errors |
| Repo lint | `pnpm turbo lint` | ran directly | exit 0; 2 tasks successful |
| Repo typecheck | `pnpm turbo typecheck` | ran directly | exit 0; 3 tasks successful |
| Repo test | `pnpm turbo test --force` | ran directly | exit 0; 5 tasks successful, 0 cached |
| Dependency graph | `pnpm run check:ticket-deps` | ran directly | passed for 2 active tickets and 2,344 archived tickets |
| Whitespace hygiene | `git diff --check` plus `git diff --no-index --check /dev/null <new file>` | ran directly; no-index checks exit 1 on normal file diff with no diagnostics | no whitespace diagnostics |

### Source-Size Ledger

`path | before lines | after lines | crossed cap? | active growth | extraction/defer rationale | successor if any`

`packages/engine/src/kernel/gamedef-runtime.ts | 278 | 275 | no | renamed/rekeyed existing cache field | file remains under guidance; no extraction needed | none`

`packages/engine/src/agents/policy-encoded-state-cache.ts | 69 | 71 | no | key computation changed in existing small module | file remains under guidance; no extraction needed | none`

`packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs | 783 | 783 | no | report-template correction only | already near cap from Phase 0; two-line template correction is lower risk than extracting the measurement script in this ticket | none`

### Deferred Scope

- `archive/tickets/173DEEPPRVCOST-003.md` owned the residual train continuedDeepening token-state-index cost exposed by the post-002 witness.
- Coup/govern/event residual axes remain outside this ticket and should be selected by the next Spec 173 witness-driven ticket only after the residual train owner lands or is otherwise classified.
- WASM preview-drive coverage moved to `archive/specs/174-wasm-preview-drive-coverage-extension.md` after Spec 173 §4.2(c) fired.

### Late-Edit / Proof Validity

Post-witness edits changed only report-template text, ticket/spec ownership, proof transcription, and successor artifacts; they do not change the measured CSV rows or runtime cache semantics. Final correctness, integrity, and hygiene lanes above were run after the ticket/spec edits. This archival amendment changes only ownership text after Spec 174 became the terminal residual owner.
