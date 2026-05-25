# Spec 194 — Zobrist Decision-Stack Digest: Residual-Cost Investigation and Targeted Remediation

**Status**: PROPOSED
**Priority**: High — Zobrist decision-stack hashing (`digestEncodedDecisionStackFrame`, `encodeDecisionStackFrameDigestInput`, `zobristKey`) is 12.7–25.2% of CPU self-time across the five regressed FITL workloads at HEAD (`reports/fitl-perf-baseline-2026-05-24.md`). The cost existed pre-Spec-190 and was amplified by the plan-primary decision mix; on `bounded-termination-1002` it is the single largest above-floor category at 25.2%. **The Spec 168 Phase 3 frame-digest cache (`archive/tickets/168ENGHOTPATH-004.md`, COMPLETED 2026-05-13) is already in place** — this residual cost persists *despite* that cache. Root cause is unconfirmed; remediation must follow evidence, not assumption.
**Complexity**: M — Phase 1 is instrumentation only (engine-internal counters; no behavioral change). Phase 2 selects one remediation lever from a decision matrix; the chosen lever's complexity is gated on Phase 1 evidence (S to L). Must preserve byte-identical canonical Zobrist keys (Foundation #8 sacred).
**Date**: 2026-05-24
**Dependencies**:
- `archive/specs/80-incremental-zobrist-hashing.md` (COMPLETED — established the incremental Zobrist contract that any remediation MUST preserve).
- `archive/specs/168-engine-per-decision-hot-path-optimizations.md` (COMPLETED — Phase 3 / ticket `archive/tickets/168ENGHOTPATH-004.md` landed the `(frame identity, parent-frame digest)` tuple-keyed cache in `packages/engine/src/kernel/zobrist.ts`; this spec investigates why that cache does not fully eliminate the residual cost).
- `archive/specs/192-fitl-perf-profiling-methodology.md` (COMPLETED — produced the baseline that named this finding).

**Trigger report**: `reports/fitl-perf-baseline-2026-05-24.md` §Findings Table, row 2 (`Hash/digest-optimization` category, all regressed lanes except wasm-equivalence, 12.7–25.2% contribution).

**Ticket namespace**: `194ZOBDIGEST` (proposed; finalize during ticket decomposition)

---

## 1. Goal

Determine why Spec 168 Phase 3's frame-digest cache leaves a 12.7–25.2% residual cost in the Zobrist decision-stack pipeline, then apply the targeted remediation that Phase 1 evidence selects. Concretely:

1. **Instrument first.** Capture per-workload cache hit/miss rates using counters that already exist in `packages/engine/src/kernel/zobrist.ts` (see §3 for the enumerated counter list). Decompose `digestEncodedDecisionStackFrame` aggregate self-time into encode vs FNV-1a portions using mean per-call timings derived from existing hot-path bucket `totalMs / count` values. Output: `reports/perf-baseline/zobrist-residual-cost-<YYYY-MM-DD>.md` with per-workload breakdown for the five regressed lanes.
2. **Validate the working hypothesis.** The working hypothesis is three parts:
   - **H1** — Identity-keyed `decisionStackFrameDigestCache` hit rate is low in steady-state simulation because Foundation #11 immutability produces new frame objects on every state mutation, so the same frame object is rarely seen twice with matching parent digest.
   - **H2** — Content-keyed `frameDigestCache` (per-table LRU) hit rate is bounded by the fact that reaching that cache *requires* the `JSON.stringify` pass to compute its key, so the encode cost cannot be eliminated by content caching alone.
   - **H3** — The dominant per-call cost on cache miss is `JSON.stringify` over the frame's effect-frame substructure, not the FNV-1a digest pass.
   Phase 1 evidence accepts, refines, or refutes each hypothesis.
3. **Choose Phase 2 lever from evidence.** §4.2 maps Phase 1's observed hit-rate and cost-decomposition pattern to exactly one of {binary-canonical encoding, encoded-surface reduction, structural-identity cache, cost-is-floor archive}. Ticket decomposition opens only the selected lever's Phase 2 ticket.

The canonical Zobrist key for any reachable game state MUST be byte-identical pre- and post-remediation at the chosen kernel version. The proof obligation is the existing replay-identity corpus, the existing Spec 168 frame-digest-cache equivalence test, and the existing Spec 192 trajectory-identity test, supplemented by lever-specific tests per §9.

## 2. Non-Goals

- **No re-implementation of Spec 168 Phase 3 caches.** The `decisionStackFrameDigestCache` (identity-keyed with parent-digest validation, `zobrist.ts:147-150`) and the per-table `frameDigestCache` (content-keyed LRU, `zobrist.ts:290`) are in place and architecturally complete. Adding parallel caches with overlapping semantics would violate Foundation #14 (no compat shims) and Foundation #15 (architectural completeness).
- **No change to the canonical Zobrist key value for any game state within a given kernel version.** This is the Foundation #8 sacred guarantee; any remediation that alters key output without recording a kernel-version bump is rejected. The replay-identity corpus is the proof gate.
- **No change to the incremental-hashing contract** (Spec 80). Incremental updates remain the API surface for kernel state mutation; remediation optimizes the digest computation pathway only.
- **No game-specific optimizations.** The Zobrist pipeline is generic kernel infrastructure (Foundation #1); changes apply equally to any GameDef.
- **No determinism-corpus re-bless or kernel-version bump in Phase 1.** Instrumentation is observation-only. Phase 2 levers MAY require a version bump (binary-canonical encoding or encoded-surface reduction); the decision is gated on Phase 1 evidence and surfaced as an explicit Foundation #13 cost in the Phase 2 ticket.
- **No engine-WASM scope.** Verified: `packages/engine-wasm/policy-vm/` contains no Rust Zobrist routine. Canonical Zobrist keys are produced exclusively by the TS pipeline; any kernel-version bump applies uniformly.

## 3. Context (verified against codebase, 2026-05-24)

The existing Zobrist digest pipeline already implements two independent caches, both landed by Spec 168 Phase 3.

- **Identity-keyed cache** at `packages/engine/src/kernel/zobrist.ts:147-150`:
  ```ts
  const decisionStackFrameDigestCache = new WeakMap<
    NonNullable<GameState['decisionStack']>[number],
    { readonly parentFrameDigest: string; readonly digest: string }
  >();
  ```
  `WeakMap` keyed on frame object identity; cached value is `{ parentFrameDigest, digest }`. The lookup at `digestDecisionStackFrame:216-221` validates `cached?.parentFrameDigest === parentFrameDigest` BEFORE running `encodeDecisionStackFrameDigestInput`. A hit returns the digest immediately, skipping both the JSON encode pass AND the FNV-1a digest pass.

- **Content-keyed cache** at `packages/engine/src/kernel/zobrist.ts:290`:
  ```ts
  frameDigestCache: new LruCache<string, string>(DECISION_STACK_FRAME_DIGEST_CACHE_LIMIT)
  ```
  Per-`ZobristTable` LRU (4096 capacity) mapping encoded JSON string to digest. The lookup at `digestDecisionStackFrame:229-236` runs AFTER `encodeDecisionStackFrameDigestInput` — it requires the encoded string as its lookup key — so a content-cache hit skips only the FNV-1a passes, not the encode pass.

- **`digestDecisionStackFrame`** (entry point) at `zobrist.ts:211-245` chains the two caches:
  1. Identity-cache lookup (L216-221) — hit returns immediately.
  2. Identity-cache miss → encode (L225) → content-cache lookup (L229-236) — hit populates identity cache, returns.
  3. Both miss → digest via FNV-1a (L241) → populate both caches (L242-243).

- **`zobristKey`** at `zobrist.ts:333-363` has two caches keyed by feature kind:
  - Static features (zone tokens, vars, markers, etc.) use `table.keyCache: Map` (`zobrist.ts:289`) — unbounded plain `Map`, per-`ZobristTable` lifetime.
  - Dynamic features (`decisionStackFrame`, `turnCount`, `lastingEffect`, `nextFrameId`, `nextTurnId`) use `dynamicFeatureKeyCaches: WeakMap<ZobristTable, Map<string, bigint>>` (`zobrist.ts:151`) — per-`ZobristTable`, with `.clear()` at `DYNAMIC_FEATURE_KEY_CACHE_LIMIT` (4096): a hard reset on overflow, not LRU eviction.

- **Existing instrumentation counters** in `digestDecisionStackFrame` (gated on `hotPathProfilingEnabled`):
  - `zobrist:decisionStackFrameWeakCacheHit` (`zobrist.ts:219`) — identity-cache hits.
  - `zobrist:encodeDecisionStackFrame` (`zobrist.ts:227`, ms) — encode self-time, per-call.
  - `zobrist:decisionStackFrameRunLocalCacheHit` (`zobrist.ts:232`) — content-cache hits after identity miss.
  - `zobrist:decisionStackFrameRunLocalCacheMiss` (`zobrist.ts:238`) — both-cache misses.
  - `zobrist:decisionStackFrameEncodedChars` (`zobrist.ts:239`) — encoded JSON length distribution.
  - `zobrist:digestDecisionStackFrame` (`zobrist.ts:201`, ms) — FNV-1a self-time, per-call.

- **Measurement-shape boundary reset** (approved 2026-05-24): live `PerfHotPathBucket` values expose only `count` and `totalMs`; they do not retain per-call samples. Phase 1 therefore reports mean per-call encode/digest times and mean encoded characters per miss, computed from the existing buckets, rather than medians. This preserves the observation-only boundary and avoids adding profiler state in a ticket whose scope is campaign tooling plus report only.

- **Existing architectural-invariant test** `packages/engine/test/integration/zobrist-frame-digest-cache-equivalence.test.ts` proves the `(frame, parent-digest)` tuple-keyed cache returns byte-identical digests across cache hit, miss, and recompute paths on the FITL canary corpus, AND that the WeakMap memoization is scoped by parent-frame digest. `@test-class: architectural-invariant`. Any Phase 2 lever that touches `digestDecisionStackFrame` must keep this test green.

- **Call sites** for the digest pipeline:
  - `xorDecisionStack` (`packages/engine/src/kernel/zobrist-phase-hash.ts:212-229`) iterates decision stack per state-mutation, calls `digestDecisionStackFrame` per frame.
  - `computeFullHash` (`zobrist.ts:437-645`) iterates decision stack per full-hash computation (loop at `zobrist.ts:606-616`).
  - Both loops propagate `parentFrameDigest` linearly from the previous iteration's digest output — the stack walk is a *linear chain*, not a tree.
  - Frequency: post-every-effect, post-every-trigger-dispatch, post-every-phase-transition.

- **Profile evidence** (`reports/fitl-perf-baseline-2026-05-24.md:37`) — the Zobrist trio (`digestEncodedDecisionStackFrame` + `encodeDecisionStackFrameDigestInput` + `zobristKey`) sums to:
  - `parity-drive`: 37.5s / 23.8%
  - `bounded-termination-1002`: 142.3s / 25.2%
  - `diagnose-parity-runGame-1001`: 72.2s / 23.4%
  - `policy-preview-parity-arvn-1008`: 51.2s / 19.7%
  - `arvn-tournament-parallel`: 32.8s / 12.7%

- **Hypothesized root cause** (to be validated by Phase 1):
  - Per Foundation #11, kernel state mutations return new state — including new decision-stack frame objects. In steady-state simulation, each microturn produces fresh frames, so identity-cache reads at `zobrist.ts:216` rarely hit on the same frame object across subsequent state-mutation cycles.
  - The content-cache (`frameDigestCache`) requires the encoded JSON string as its lookup key, so reaching that cache costs one `JSON.stringify` per call regardless of hit/miss.
  - The `effectFrame.{localBindings, boundedIterationCursors, pendingTriggerQueue, decisionHistory}` fields (`encodeDecisionStackFrameDigestInput`, `zobrist.ts:174-194`) are large per-frame structures that dominate encoded-string length.
  - **If validated**, the dominant remaining cost is the `JSON.stringify` pass itself — not the FNV-1a, not the cache discipline.

- **Spec 80 incremental-hashing contract** (`archive/specs/80-incremental-zobrist-hashing.md`): kernel state mutations produce incremental Zobrist updates; the canonical key is reconstructable from incremental update history. This spec preserves that contract — only the digest *computation* shortcut path is in scope.

## 4. Architecture

This spec is two phases: Phase 1 (instrumentation; no behavioral change) and Phase 2 (one of four conditional remediation paths).

### 4.1 Phase 1 — Instrumentation deliverable

Add a `captureZobristResidualCostProfile` capture script alongside the existing Spec 192 baseline harness (path finalized at ticket decomposition; sibling to the existing perf-optimization campaign tooling) that:

1. Runs the five regressed workloads (`parity-drive`, `bounded-termination-1002`, `diagnose-parity-runGame-1001`, `policy-preview-parity-arvn-1008`, `arvn-tournament-parallel`) with `ENGINE_HOT_PATH_PROFILE=1` to enable the existing counters listed in §3.
2. Captures the six counters listed in §3 plus aggregate `digestEncodedDecisionStackFrame` wall-clock.
3. Computes per-workload hit-rate decomposition:
   - Identity-cache hit rate = `decisionStackFrameWeakCacheHit / total digestDecisionStackFrame calls`.
   - Content-cache hit rate (after identity miss) = `decisionStackFrameRunLocalCacheHit / (decisionStackFrameRunLocalCacheHit + decisionStackFrameRunLocalCacheMiss)`.
   - Encode-call rate = `decisionStackFrameRunLocalCacheHit + decisionStackFrameRunLocalCacheMiss` (calls that did not hit identity cache).
   - Mean per-call encode time (ms), mean per-call digest time (ms), mean encoded-chars per miss.
4. Decomposes `digestEncodedDecisionStackFrame` aggregate self-time into encode vs FNV-1a portions using the mean per-call timings and aggregate bucket totals.
5. Writes the report to `reports/perf-baseline/zobrist-residual-cost-<YYYY-MM-DD>.md` with a per-workload table and an explicit hypothesis verdict (H1, H2, H3 from §1.2 — accepted, refined, or refuted).

This is pure observation: zero changes to `zobrist.ts` code paths, zero changes to canonical key output. The replay-identity corpus + the Spec 168 frame-digest-cache equivalence test + the Spec 192 trajectory-identity test MUST remain 100% green throughout Phase 1.

### 4.2 Phase 2 — Decision matrix (lever selection)

The Phase 1 report selects exactly one of the following levers; ticket decomposition opens the chosen-lever ticket and explicitly defers the others:

| Lever | Selection criterion (Phase 1 evidence) | Behavioral change | Determinism cost |
|---|---|---|---|
| **2A — Binary-canonical encoding** | `encodeDecisionStackFrameDigestInput` self-time dominates `digestEncodedDecisionStackFrame` aggregate (H3 accepted); identity-cache hit rate confirmed low (<25%) (H1 accepted) | Replace JSON encoder with length-prefixed binary canonical encoder of frame fields; `digestEncodedDecisionStackFrame` consumes the binary form | Kernel-version bump per Foundation #13; replay-corpus re-bless; new compile-twice byte-identity proof at new canonical encoding |
| **2B — Encoded-surface reduction** | Mean encoded-chars per miss is large (>~2KB) AND specific `effectFrame` sub-fields can be proven irrelevant to canonical state identity (requires explicit field-irrelevance audit during the Phase 2 ticket) | Exclude the proven-irrelevant fields from `encodeDecisionStackFrameDigestInput`'s JSON output | Kernel-version bump per Foundation #13; replay-corpus re-bless; field-irrelevance proof recorded in the Phase 2 ticket |
| **2C — Structural-identity cache** | Identity-cache hit rate is low (<25%) AND a derived structural-identity key (e.g., `frameId + turnId + context + effectFrame.programCounter`) can be proven equivalence-class-correct for digest reuse (audit during Phase 2) | Add a second `WeakMap<StructuralIdentityKey, FrameDigestEntry>` short-circuiting the encode pass when structural identity matches; widens cache working set without reducing encoded surface | None — identity-keyed; canonical key preserved by construction (no kernel-version bump) |
| **2D — Cost-is-floor** | All caches show hit rates near their structural ceiling AND encode/digest per-call costs are at language/algorithm floors | Document the cost as architecturally inherent; archive Spec 194 with a "validated as accepted cost" report referenced from Spec 192's perf-bucket categorization (`reports/fitl-perf-baseline-2026-05-24.md`) | None — no code change |

The matrix is exclusive in Phase 2: at most one lever lands. If Phase 1 evidence selects 2A or 2B (which require kernel-version bump), the Phase 2 ticket also produces the Foundation #13 reproducibility-metadata migration and the replay-corpus re-bless in the same change (per Foundation #14, no parallel kernel versions in production code).

### 4.3 Determinism preservation strategy per lever

All Phase 2 levers preserve canonical Zobrist key value for any reachable game state. Mechanisms differ:

- **2A and 2B** preserve canonical keys *within* the new kernel version; the version bump records that historical replays use a different canonical key, and `archive/replays/` artifacts are re-blessed in the same change. Reproducibility (Foundation #13) is preserved by version-pinning.
- **2C** preserves canonical keys byte-identical pre- and post-refactor (cache state never feeds back into computation). The structural-identity key must be proven to satisfy: equal structural identity ⇒ equal digest. This is an architectural-invariant test obligation (§9).
- **2D** does not alter keys.

All paths satisfy the three Spec 168 guarantees the existing equivalence test already proves: identity discipline for caches, cache state never feeds back into computation, and per-frame digest correctness across cache hit/miss/recompute paths.

### 4.4 Why "add another cache" is rejected (Spec 168 Phase 3 already shipped)

The original Spec 194 draft proposed three caches: a frame-identity encoding cache, a per-frame digest memoization keyed on `(frame, parentFrameDigest)`, and a `cacheBinding`-bound dynamic-feature cache. Reassessment against the codebase (2026-05-24) showed:

- The proposed identity encoding cache duplicates `decisionStackFrameDigestCache` (Spec 168 §3.4).
- The proposed `(frame, parentFrameDigest)` memoization is the existing identity cache's exact contract — see `decisionStackFrameDigestCache` value type and `digestDecisionStackFrame:217` parent-digest validation.
- The proposed `cacheBinding`-bound dynamic-feature cache would migrate ownership from `WeakMap<ZobristTable, ...>` to `cacheBinding.runtime` — same effective lifetime (both live per-`GameDefRuntime`), no hit-rate change.

Re-shipping that infrastructure would violate Foundation #14 (parallel caches are a compat-shim pattern) and Foundation #15 (the proposed solution does not address the actual residual cost root cause). The instrument-first scope reframes the spec around evidence-gathering before any new cache code lands — including before lever 2C, which is the only lever that adds a new cache and only if Phase 1 evidence shows the structural-identity working set is materially wider than the object-identity working set.

## 5. Data flow / Process

**Phase 1 (instrumentation)**:
Capture script runs each workload under `ENGINE_HOT_PATH_PROFILE=1` → existing counters fire on the hot path inside `digestDecisionStackFrame` → script aggregates counter values plus mean per-call timings from bucket totals → script computes per-workload hit-rate decomposition → report written to `reports/perf-baseline/zobrist-residual-cost-<YYYY-MM-DD>.md` with explicit hypothesis verdict → ticket decomposition reads the report and opens the chosen-lever Phase 2 ticket.

**Phase 2 (conditional, one lever)**:
- **2A**: `encodeDecisionStackFrameDigestInput` replaced with binary canonical encoder → `digestEncodedDecisionStackFrame` consumes the binary encoded form → canonical keys change at kernel-version boundary → replay corpus re-blessed.
- **2B**: `encodeDecisionStackFrameDigestInput` shrunk by removing proven-irrelevant fields → same downstream pipeline → canonical keys change at kernel-version boundary → replay corpus re-blessed.
- **2C**: New structural-identity key derivation runs before `decisionStackFrameDigestCache.get(frame)` → second `WeakMap<StructuralIdentityKey, FrameDigestEntry>` short-circuits the encode pass when structural identity matches → canonical keys unchanged.
- **2D**: No code change; the P1 report is referenced from Spec 192's perf-bucket categorization as the "validated as accepted cost" record.

## 6. Determinism and replay (Foundations #8, #13, #16)

Phase 1 introduces zero canonical-key risk; instrumentation is observation-only.

**Prerequisites completed (2026-05-25)**: Phase 1 terminal closeout was blocked by three Foundations-aligned determinism prerequisites, now archived at `archive/tickets/194ZOBDIGEST-000-spec-161-default-off-determinism-prereq.md`, `archive/tickets/194ZOBDIGEST-000A-draft-state-determinism-timeout.md`, and `archive/tickets/194ZOBDIGEST-000B-fitl-policy-agent-canary-timeout.md`. The replay-identity corpus is citeable again (`pnpm -F @ludoforge/engine run test:determinism` passed 31/31 files), so Phase 1 can proceed to `tickets/194ZOBDIGEST-001.md`.

Phase 2 obligations depend on the chosen lever:

- **All paths** must keep the existing replay-identity corpus (`packages/engine/test/determinism/`) and the existing Spec 168 frame-digest-cache equivalence test (`packages/engine/test/integration/zobrist-frame-digest-cache-equivalence.test.ts`) 100% green at the post-remediation kernel version.
- **2A and 2B** require a deterministic replay re-bless and a kernel-version bump recorded in reproducibility metadata (Foundation #13). The Phase 2 ticket lands kernel change + version bump + corpus re-bless atomically (Foundation #14, no parallel kernel versions in production code).
- **2C** requires a new architectural-invariant test asserting that two frames with equal structural identity produce equal digests under warm and cold cache (§9).
- **All paths** keep the Spec 192 trajectory-identity test (`packages/engine/test/integration/perf-baseline-trajectory-identity.test.ts`) green across the regressed workloads.

Incremental Zobrist hashing (Spec 80) is preserved by all paths: incremental updates run the same digest pipeline; remediation does not change the orchestration.

## 7. Edge cases

- **Phase 1 counter availability** — the existing counters fire only when `hotPathProfilingEnabled` is true. The capture script must enable this flag at engine boot and assert non-zero counter values before computing rates; an all-zero counter set indicates the flag did not propagate.
- **Frame mutation** — frames are immutable per Foundation #11; state mutation produces a new frame object with new identity. The hypothesized identity-cache miss rate (H1) is the direct consequence of this discipline, not a defect.
- **Cross-replay determinism** — caches are per-process and identity- or structural-keyed; replays in different processes start with empty caches and compute identical digests/keys (proven by replay-identity corpus). Deserialized frames (`packages/engine/src/kernel/serde.ts:112-122`) have fresh object identity, so cache hits do not propagate across serialization boundaries — by design.
- **WASM Zobrist parity** — engine-WASM does not implement Zobrist hashing (verified: `packages/engine-wasm/policy-vm/` contains no Zobrist routine). Canonical keys are produced exclusively by the TS pipeline; any Phase 2 kernel-version bump applies uniformly without WASM-side migration.
- **GC of frame objects** — `WeakMap` entries are eligible for GC when the frame is no longer reachable; no manual cache eviction; bounded memory naturally.
- **Frame with no parent** (`parentFrameId === null` per `DecisionStackFrame` declaration in `packages/engine/src/kernel/microturn/types.ts:231-247`) — `parentFrameDigest` is the sentinel `'root'` (`DECISION_STACK_ROOT_PARENT_DIGEST`, `zobrist.ts:145`); handled by both existing caches without special-casing.
- **Counter-driven sampling skew** — `hotPathProfilingEnabled` adds per-call overhead. Phase 1's report must include a wall-clock comparison between profiled and unprofiled runs of the same workload to confirm counter overhead does not distort the hit-rate measurements.

## 8. Phases & acceptance criteria

| Phase | Deliverable | Acceptance | Effort |
|---|---|---|---|
| **P1** | Instrumentation capture script + residual-cost report (§4.1) | Script captures the six counters listed in §3 for all five regressed workloads under `ENGINE_HOT_PATH_PROFILE=1`; report at `reports/perf-baseline/zobrist-residual-cost-<YYYY-MM-DD>.md` includes per-workload hit-rate table, encode-vs-digest cost decomposition, profiled-vs-unprofiled wall-clock comparison, and explicit verdict on hypotheses H1, H2, H3 from §1.2; report names the Phase 2 lever selected per §4.2's decision matrix with the evidence trail justifying that selection; replay-identity corpus + Spec 168 frame-digest-cache equivalence test + Spec 192 trajectory-identity test all 100% green | S |
| **P2** | Apply the selected lever (one of 2A, 2B, 2C, 2D from §4.2) | **If 2A or 2B**: kernel-version bump landed + reproducibility metadata updated + replay corpus re-blessed + compile-twice byte-identity test green at new version. **If 2C**: new `(frame, structural-identity)` equivalence test green; replay-identity unchanged; Spec 168 equivalence test green. **If 2D**: archive note added to Spec 192 perf-bucket categorization referencing the P1 report; Spec 194 archived. Replay-identity corpus + Spec 168 equivalence test + Spec 192 trajectory-identity test green in all code-change cases | S–L (gated on lever) |
| **P3** | Perf witness re-capture (skipped if P2 = 2D) | Re-run Spec 192 baseline harness on the five regressed workloads at post-remediation HEAD; record measured gain; named gain target is **≥10% individual wall-clock reduction OR ≥15% combined reduction in Zobrist-trio self-time** across the five regressed workloads | S |

P1 is the minimum landing surface and is non-conditional. P2's scope and effort are gated on P1's evidence. P3 is skipped only if P2 = 2D (no code change).

## 9. Test plan

- **Replay identity** (Foundation #8 proof): existing `packages/engine/test/determinism/` corpus runs unchanged through P1; runs at the post-remediation kernel version for P2; must remain 100% green in both cases.
- **Spec 168 frame-digest-cache equivalence** (existing architectural invariant): `packages/engine/test/integration/zobrist-frame-digest-cache-equivalence.test.ts` runs unchanged; must remain 100% green. Any Phase 2 lever that touches `digestDecisionStackFrame` must verify this test still proves cache-hit/miss/recompute equivalence at the new behavior.
- **Trajectory identity** (Spec 192): `packages/engine/test/integration/perf-baseline-trajectory-identity.test.ts` runs unchanged across all six workloads through Phase 1 and Phase 2.
- **Phase 2 conditional tests** (one of the following lands per chosen lever):
  - **2A/2B (kernel-version bump)**: new `packages/engine/test/architecture/zobrist-canonical-key-byte-identity.test.ts` — random decision-stack shapes hashed twice in the same process, asserts byte-equality of `computeFullHash` output at the new canonical encoding; `@test-class: architectural-invariant`.
  - **2C (structural identity)**: new `packages/engine/test/architecture/zobrist-structural-identity-cache-equivalence.test.ts` — two distinct frame objects with equal derived structural identity produce equal digests under warm and cold cache; `@test-class: architectural-invariant`.
  - **2D**: no new test; report appendix added to the Spec 192 perf-bucket section recording the "cost-is-floor" verdict.
- **Spec 189 cache-binding witness** (`packages/engine/test/architecture/policy-eval-cache-binding-dedup.test.ts`) — unrelated to this spec but must remain green throughout; any Phase 2 lever should not interfere with `cacheBinding` discipline.
- **Engine test command** — run via `pnpm -F @ludoforge/engine run test` (or `pnpm -F @ludoforge/engine run test:all` for the e2e bundle), per `packages/engine/package.json` scripts; `node --test` direct invocation requires a prior `pnpm turbo build`.

## 10. Foundation alignment

| Foundation | How this spec respects it |
|---|---|
| **#1** Engine Agnosticism | Phase 1 instrumentation and all Phase 2 levers operate on generic kernel infrastructure; no game-specific code introduced. |
| **#8** Determinism Is Sacred | Phase 1: zero behavioral change. Phase 2: canonical Zobrist key is byte-identical pre- and post-remediation within the chosen kernel version; replay-identity corpus + Spec 168 equivalence test + Spec 192 trajectory-identity test are three independent proof surfaces. |
| **#11** Immutability | The hypothesized identity-cache miss rate (H1) is a *consequence* of #11. Phase 1 measures the consequence; Phase 2 either accepts it (2A/2B), works within it (2C), or documents it as a floor (2D). No mutation introduced. |
| **#13** Artifact Identity and Reproducibility | Levers 2A and 2B explicitly bump the kernel-version identifier and re-bless the replay corpus in the same change; historical replays are pinned to their pre-remediation kernel version. Lever 2C preserves canonical keys; no bump. Lever 2D: no change. |
| **#14** No Backwards Compatibility | No parallel caches; no compat shims for the pre-remediation kernel version. Phase 2 migrates all owned artifacts (replay corpus, fixtures, tests) in the same change. The original Spec 194 draft's three caches were rejected (§4.4) because shipping them alongside the existing Spec 168 caches would be a parallel-cache compat pattern. |
| **#15** Architectural Completeness | Spec reframed instrument-first precisely to avoid Spec 168's caches being patched with overlapping infrastructure. Phase 2 lever is chosen from evidence, not assumed; the "cost-is-floor" lever (2D) is an explicit option to prevent forcing a remediation when none is architecturally justified. |
| **#16** Testing as Proof | All hypotheses are validated by Phase 1 measurements (not assumed). Phase 2 lever's correctness is proven by the existing replay-identity corpus + Spec 168 equivalence test plus any lever-specific architectural-invariant test (§9). |
| **#20** Preview Signal Integrity | Zobrist hashing does not interact with preview-ref status semantics; no preview-status-boundary risk. |

## 11. Reassessment of source proposal (`reports/fitl-perf-baseline-2026-05-24.md`)

**Adopted**:
- Finding row 2 (`Hash/digest-optimization` category, 12.7–25.2% contribution, all regressed lanes except wasm-equivalence) — adopted as the spec's central remediation target.
- Foundation-requirement set (#8 byte-identical replay/state hashes, #15 structural completeness) — adopted verbatim.
- Per-workload self-time aggregates (37.5s on parity-drive, 142.3s on bounded-termination-1002, 72.2s on diagnose-parity-runGame-1001, 51.2s on policy-preview-parity-arvn-1008, 32.8s on arvn-tournament-parallel) — adopted as Phase 3's regression baseline.

**Reframed**:
- The report's framing ("sharing or partial digest reuse") implied new cache infrastructure. Reassessment found Spec 168 Phase 3 (ticket `archive/tickets/168ENGHOTPATH-004.md`, COMPLETED 2026-05-13) already implemented `(frame identity, parent-frame digest)` tuple-keyed caching; reshipping it would violate Foundation #14 and would not address the residual cost. This spec is reframed instrument-first: Phase 1 measures why the existing caches leave residual cost, Phase 2 applies the targeted lever Phase 1 evidence selects.

**Deferred** (gated on Phase 1 evidence per §4.2):
- Binary-canonical digest input format change (Lever 2A) — gated on Phase 1 evidence showing encode dominates digest; requires determinism-corpus re-bless and kernel-version bump per Foundation #13.
- Encoded-surface reduction (Lever 2B) — gated on Phase 1 evidence and a field-irrelevance audit; same Foundation #13 cost.
- Structural-identity cache (Lever 2C) — gated on Phase 1 evidence showing identity-cache miss rate is the dominant cost driver AND a structural-identity equivalence-class audit; no Foundation #13 cost.

**Out of scope**:
- Engine-WASM Zobrist parity — verified: no Rust Zobrist implementation exists in `packages/engine-wasm/policy-vm/`. Canonical-key preservation applies uniformly without WASM-side migration.

**Meta-decision**:
- The original draft was reframed during reassessment (2026-05-24) when investigation revealed Spec 168 had already shipped the proposed caches. The instrument-first reframing preserves the report's correctness target (12.7–25.2% reduction) while replacing the implementation premise with evidence-gathering. Phase 2's lever is chosen from data, not assumption — including the explicit option to conclude (lever 2D) that the cost is architecturally inherent and the spec should archive without code change.

## Tickets

Decomposed via `/spec-to-tickets` on 2026-05-24:

Inserted during implementation on 2026-05-24 after `docs/FOUNDATIONS.md` reassessment:

- [`archive/tickets/194ZOBDIGEST-000-spec-161-default-off-determinism-prereq.md`](../archive/tickets/194ZOBDIGEST-000-spec-161-default-off-determinism-prereq.md) — Prerequisite — restore Spec 161 default-off determinism proof before closing Phase 1

- [`archive/tickets/194ZOBDIGEST-000A-draft-state-determinism-timeout.md`](../archive/tickets/194ZOBDIGEST-000A-draft-state-determinism-timeout.md) — Prerequisite — resolve the `draft-state-determinism-parity` timeout before closing Phase 1

- [`archive/tickets/194ZOBDIGEST-000B-fitl-policy-agent-canary-timeout.md`](../archive/tickets/194ZOBDIGEST-000B-fitl-policy-agent-canary-timeout.md) — Prerequisite — resolve the `fitl-policy-agent-canary-determinism` timeout before closing Phase 1

- [`tickets/194ZOBDIGEST-001.md`](../tickets/194ZOBDIGEST-001.md) — Phase 1 — Zobrist residual-cost capture and report

**Phase-gated decomposition note**: Phase 2 (lever selection from {2A, 2B, 2C, 2D} per §4.2) and Phase 3 (perf witness re-capture per §8 P3) are deferred to a future `/spec-to-tickets` invocation once Phase 1's evidence lands. Per spec §4.2, the Phase 2 lever is selected from observed measurements — opening Phase 2 tickets ahead of that evidence would author hypothetical scope.
