# Spec 194 — Zobrist Decision-Stack Digest Optimization

**Status**: PROPOSED
**Priority**: High — Zobrist decision-stack hashing (`digestEncodedDecisionStackFrame`, `encodeDecisionStackFrameDigestInput`, `zobristKey`) is 12.7–25.2% of CPU self-time across the five regressed FITL workloads at HEAD (`reports/fitl-perf-baseline-2026-05-24.md`). The cost existed pre-Spec-190 and was amplified by the plan-primary decision mix; on `bounded-termination-1002` it is the single largest above-floor category at 25.2%.
**Complexity**: M — engine change at `packages/engine/src/kernel/zobrist.ts` and its `encoded-state` digest pipeline; must preserve byte-identical canonical Zobrist keys (Foundation #8 sacred).
**Date**: 2026-05-24
**Dependencies**:
- `archive/specs/80-incremental-zobrist-hashing.md` (COMPLETED — established the incremental Zobrist contract that this spec optimizes within; this spec MUST preserve incremental-hash correctness).
- `archive/specs/192-fitl-perf-profiling-methodology.md` (COMPLETED — produced the baseline that named this finding).

**Trigger report**: `reports/fitl-perf-baseline-2026-05-24.md` §Findings Table, row 2 (`Hash/digest-optimization` category, all regressed lanes except wasm-equivalence, 12.7–25.2% contribution).

**Ticket namespace**: `194ZOBDIGEST` (proposed; finalize during ticket decomposition)

---

## 1. Goal

Reduce redundant decision-stack digest work without changing canonical Zobrist key identity or replay-identical state hashes. Concretely:

1. **Eliminate per-call re-encoding** — `encodeDecisionStackFrameDigestInput` currently calls `JSON.stringify` on every digest read for every frame, even when the frame's content is unchanged since the prior digest. Cache the encoded form keyed on frame identity so the JSON pass runs once per frame, not once per digest read.
2. **Reuse parent-frame digest chains** — `digestEncodedDecisionStackFrame` composes a parent-frame digest into each frame's encoded input. When a parent frame is shared across multiple child frames (e.g., during the decision stack's traversal), the parent's digest is computed redundantly. Memoize per-frame digests keyed on frame identity so the parent walks once per stack-mutation, not once per `computeFullHash` call.
3. **Improve `zobristKey` cache hit rate on digest features** — `zobristKey` already has a per-table LRU cache and a per-process dynamic-feature cache, but per-frame digest features are dynamic and currently see low hit rates (each frame produces a distinct dynamic feature). Bind the dynamic-feature cache to the `cacheBinding` lifetime (Spec 189 prior art) so digests for live decision-stack frames stay in cache across consecutive evaluations.

The canonical Zobrist key for any reachable game state MUST be byte-identical pre- and post-refactor. The proof obligation is the replay-identity corpus + a new compile-twice digest-identity test.

## 2. Non-Goals

- **No change to the canonical Zobrist key value for any game state.** This is the Foundation #8 sacred guarantee; any optimization that alters key output is rejected. The replay-identity corpus is the proof gate.
- **No change to the incremental-hashing contract** (Spec 80). Incremental hash updates remain the API surface for kernel state mutation; this spec optimizes the digest computation pathway that incremental hashing already orchestrates, not the orchestration itself.
- **No change to `ZobristFeature` encoding format on disk or in artifacts.** Reproducibility (Foundation #13) is preserved: a state's Zobrist key recorded at PR HEAD must match the key at the post-Spec-194 HEAD.
- **No new caches that affect determinism.** All caches are pure short-circuits; cache state never feeds back into key computation.
- **No game-specific optimizations.** The Zobrist pipeline is generic kernel infrastructure (Foundation #1); changes apply equally to any GameDef.

## 3. Context (verified against codebase, 2026-05-24)

- **`encodeDecisionStackFrameDigestInput`** at `packages/engine/src/kernel/zobrist.ts:174-194`:
  ```ts
  const encodeDecisionStackFrameDigestInput = (
    frame: NonNullable<GameState['decisionStack']>[number],
    parentFrameDigest: string,
  ): string => JSON.stringify({
    parentFrameDigest,
    frameId: frame.frameId,
    parentFrameId: frame.parentFrameId,
    turnId: frame.turnId,
    context: frame.context,
    // conditional fields for continuationBindings, effectFrame details, suspendedFrame ...
  }, stringifyDecisionStackFrameDigestValue);
  ```
  Fresh `JSON.stringify` per call; no cache check before encoding.

- **`digestEncodedDecisionStackFrame`** at `packages/engine/src/kernel/zobrist.ts:196-204`:
  ```ts
  const digestEncodedDecisionStackFrame = (encoded: string, profileHotPath: boolean): string => {
    const t0Digest = profileHotPath ? perfHotPathStart() : 0;
    const digestA = fnv1a64FromState(encoded, FRAME_DIGEST_PREFIX_A).toString(16).padStart(16, '0');
    const digestB = fnv1a64FromState(encoded, FRAME_DIGEST_PREFIX_B).toString(16).padStart(16, '0');
    if (profileHotPath) {
      perfHotPathEnd('zobrist:digestDecisionStackFrame', t0Digest);
    }
    return `${digestA}:${digestB}`;
  };
  ```
  Two FNV-1a passes per call; string formatting; digest cache exists but is keyed on the digest output (downstream of the cost), not on frame identity.

- **`zobristKey`** at `packages/engine/src/kernel/zobrist.ts:333-363`: per-table LRU cache (max 4096) for static features; per-process `dynamicFeatureKeyCaches` `WeakMap<ZobristTable, Map<string, bigint>>` for dynamic features (digest features fall into the dynamic bucket). Hit rate is high for static features and low for per-frame digest features (each frame's digest is a unique encoded string).

- **Call sites**:
  - `xorDecisionStack` (`zobrist-phase-hash.ts:212-229`) iterates decision stack per state-mutation and calls `digestDecisionStackFrame` per frame.
  - `computeFullHash` (`zobrist.ts:437-645`) iterates decision stack per full-hash computation and re-hashes each frame (lines 606-616).
  - Frequency: post-every-effect, post-every-trigger-dispatch, post-every-phase-transition. The decision stack can grow deeply (default `maxTriggerDepth` 8 + nested effect chains).

- **Profile evidence** (`reports/perf-baseline/parity-drive-8203b4d023.json`):
  - `digestEncodedDecisionStackFrame`: 18.9s / 12.0%.
  - `encodeDecisionStackFrameDigestInput`: 8.2s / 5.2%.
  - `zobristKey`: 8.1s / 5.1%.
  - Combined ~35s / 22.3% on a 157s median wall-clock.

- **Spec 80 incremental-hashing contract** (`archive/specs/80-incremental-zobrist-hashing.md`): kernel state mutations produce incremental Zobrist updates; the canonical key is reconstructable from incremental update history. This spec preserves that contract — only the digest *computation* shortcut path changes, not the incremental-update orchestration.

- **Existing digest-cache** at `packages/engine/src/kernel/zobrist.ts:147-150` is a `WeakMap<DecisionStackFrame, string>` that caches the digest output. The cache check happens AFTER `encodeDecisionStackFrameDigestInput` runs, so the encoding pass repeats even when the digest itself is cached.

## 4. Architecture

### 4.1 Frame-identity encoding cache

Introduce a `WeakMap<DecisionStackFrame, EncodedFrameForDigest>` keyed on the immutable frame object. The cached value is the `(parentFrameDigest, encodedString)` pair that feeds `digestEncodedDecisionStackFrame`.

On `encodeDecisionStackFrameDigestInput(frame, parentFrameDigest)`:
1. Look up `frame` in the encoding cache.
2. If hit AND cached `parentFrameDigest === parentFrameDigest`, return the cached `encodedString`.
3. If miss OR parent-digest mismatch, run the JSON pass, store the result, return.

Frame mutation (per Foundation #11) replaces the frame object, so identity change is the natural cache invalidation; mutation never invalidates a cached encoding silently.

### 4.2 Per-frame digest memoization

Extend the existing digest cache (`zobrist.ts:147-150`) to also memoize the digest output keyed on `(frame, parentFrameDigest)` tuple, so that traversals visiting the same frame with the same parent-digest skip both the encoding pass AND the FNV-1a digest pass.

The digest cache is structural: bound to frame identity (`WeakMap` so it's GC-safe), and the cached digest is invalidated whenever the parent-digest input changes (rare; only on stack reorganization above the frame).

### 4.3 Dynamic-feature cache binding lifetime

`zobristKey`'s dynamic-feature cache currently lives in a per-process `WeakMap<ZobristTable, Map<string, bigint>>` with a soft LRU cap. Bind the cache to the active `cacheBinding` (per Spec 189 prior art) so:

- Decision-stack digest features stay resident across consecutive evaluations within the same evaluation context.
- The cache is rebuilt when `cacheBinding` is rebuilt, matching the existing `PolicyEvaluationContext` cache discipline.
- No cross-context cache pollution; no per-process growth unbounded by `cacheBinding` lifetime.

This change is internal to `zobristKey`'s cache discovery; the public API (`zobristKey(table, feature)`) is unchanged.

### 4.4 Determinism preservation strategy

Three independent guarantees ensure the optimization cannot alter canonical Zobrist keys:

1. **Identity-keyed caches only.** Caches are keyed on frame object identity (`WeakMap`), not on encoded content; identity is established by the kernel's immutable frame production discipline. A frame produced by two independent paths with identical content gets two cache entries — they compute the same encoding+digest, then both store the same value. No collision risk.
2. **Cache state never feeds back into computation.** Caches are pure short-circuits; the encoded+digest+key output values are identical whether the cache is empty or warm.
3. **Architectural-invariant test** (per `.claude/rules/testing.md`): random-stack-shape determinism corpus runs each shape twice in the same process — first with empty caches, second with warm caches — and asserts byte-equality of `computeFullHash` output.

### 4.5 Optional binary-canonical digest input (deferred)

The current JSON-string digest input is human-readable but byte-heavy; a binary-canonical encoding (length-prefixed field concatenation, fixed-width integer encoding) would reduce per-call CPU AND memory pressure. This is deferred to a follow-up spec if §4.1–4.3 do not meet the per-spec gain target, because changing the encoding format requires:

- A determinism-corpus re-bless (canonical Zobrist keys for every recorded replay would change),
- A bump of the GameDef/kernel version identifier per Foundation #13,
- A new compile-twice byte-identity proof.

The deferred option exists in the categorization rubric (Spec 192 §4.4 `Hash/digest-optimization`); this spec opts not to take it unless measured headroom requires it.

## 5. Data flow / Process

Kernel state mutation → `xorDecisionStack` iterates decision stack → per-frame: `digestDecisionStackFrame(frame, parentDigest)` → checks digest cache by `(frame, parentDigest)` → cache hit returns digest; cache miss runs encoding cache lookup (`frame` → cached encoded) → encoding cache hit reuses encoded string; encoding cache miss runs `JSON.stringify`, stores → `digestEncodedDecisionStackFrame(encoded)` runs FNV-1a passes → stores digest → returns.

`computeFullHash` iterates decision stack → same per-frame path; under warm cache, decision-stack traversal becomes pure cache reads with zero JSON or FNV-1a work.

`zobristKey(table, digestFeature)` → checks `cacheBinding`-bound dynamic-feature cache → hit returns `bigint` key; miss runs `hashZobristFeature`, stores in cache.

## 6. Determinism and replay (Foundations #8, #16)

The canonical Zobrist key for any `(GameDef, GameState)` pair MUST be byte-identical pre- and post-refactor. Proven by:

- **Replay-identity corpus**: `packages/engine/test/determinism/` runs the full replay corpus; every test asserts byte-identical state hashes and serialized state. Existing tests cover the canonical key path.
- **Spec 192 trajectory-identity test**: each of the six perf workloads asserts `trace.finalState.stateHash` equality with and without `ENGINE_PER_DECISION_PROFILE=1`. Extending this proves the optimization preserves trajectory identity.
- **New compile-twice digest-identity test** (Foundation #16): same `GameDef` + same `GameState` → byte-identical `computeFullHash` output across two independent runs, one with warm caches one with empty caches. `@test-class: architectural-invariant`.

Incremental Zobrist hashing (Spec 80) is preserved: incremental updates run the same digest pipeline; cache warm/cold state cannot affect incremental update outputs.

## 7. Edge cases

- **Frame mutation** — frames are immutable per Foundation #11; mutation produces a new frame object with new identity; old frame's `WeakMap` entries become eligible for GC. No silent stale-cache risk.
- **Parent-frame reordering** — when the decision stack is reorganized above a frame (rare; only at certain trigger-dispatch transitions), the parent-digest input to that frame changes. The cache check on `(frame, parentDigest)` detects the change and recomputes; cached encoding for that frame is invalidated only if the parent-digest mismatch is real.
- **Cross-replay determinism** — caches are per-process and identity-keyed; replays in different processes start with empty caches and compute identical digests/keys (proven by replay-identity corpus).
- **`cacheBinding` rebuild** (Spec 189) — dynamic-feature cache is rebuilt with the binding; no cache leak across binding lifetime boundaries.
- **GC of frame objects** — `WeakMap` entries are eligible for GC when the frame is no longer reachable; no manual cache eviction needed; bounded memory naturally.
- **Frame with no parent** (`parentFrameId === undefined`) — `parentFrameDigest` is a sentinel empty string; cached on the frame identity normally; no special-case path.
- **Engine-WASM Zobrist path** — out of scope for this spec; engine-WASM has its own Zobrist routine in Rust. If engine-WASM hashes need parity post-refactor, the canonical-key guarantee (§6) ensures they continue to match by definition.

## 8. Phases & acceptance criteria

| Phase | Deliverable | Acceptance | Effort |
|---|---|---|---|
| **P1** | Frame-identity encoding cache (§4.1) + compile-twice digest-identity test (§4.4) | `WeakMap`-based encoding cache on `DecisionStackFrame`; existing replay-identity corpus 100% green; new compile-twice digest-identity test passes; trajectory-identity test (Spec 192) green across all five regressed workloads; `pnpm -F @ludoforge/engine test` 100% pass | S |
| **P2** | Per-frame digest memoization (§4.2) + dynamic-feature cache binding (§4.3) | Digest cache extended; `zobristKey` dynamic-feature cache bound to `cacheBinding`; replay-identity + trajectory-identity green; existing Spec 189 `POLEVALCACHE` cache-binding witness remains green | S–M |
| **P3** | Perf witness re-capture | Re-run Spec 192 baseline harness on `parity-drive`, `bounded-termination-1002`, `diagnose-parity-runGame-1001`, `policy-preview-parity-arvn-1008`, `arvn-tournament-parallel`; record measured gain; named gain target is **≥10% individual wall-clock reduction OR ≥15% combined reduction in Zobrist-trio self-time** across the five regressed workloads | S |

P1 is the minimum landing surface (eliminates the per-call JSON pass — the dominant cost). P2 compounds the gain. P3's measurement determines whether the deferred binary-canonical digest input (§4.5) is warranted.

## 9. Test plan

- **Replay identity** (Foundation #8 proof): existing `packages/engine/test/determinism/` corpus runs unchanged; must remain 100% green.
- **Trajectory identity** (Spec 192): existing `packages/engine/test/integration/perf-baseline-trajectory-identity.test.ts` runs unchanged across all six workloads.
- **Compile-twice digest-identity** (new, Foundation #16): `packages/engine/test/architecture/zobrist-digest-cache-identity.test.ts` — random decision-stack shapes, each hashed twice (cold caches / warm caches), assert byte-equality of `computeFullHash` output. `@test-class: architectural-invariant`.
- **`zobristKey` cache-binding witness** (Spec 189 protection): the existing `POLEVALCACHE` witness must remain green; an extension specifically for digest features may be added if P2's cache-binding change reveals a regression risk.
- **Perf witness**: Spec 192 harness re-captures on the five regressed workloads; results checked into `reports/perf-baseline/`.

## 10. Foundation alignment

| Foundation | How this spec respects it |
|---|---|
| **#1** Engine Agnosticism | Zobrist optimization is generic kernel infrastructure; no game-specific code introduced. |
| **#8** Determinism Is Sacred | Canonical Zobrist key for any state is byte-identical pre- and post-refactor. Replay-identity corpus + trajectory-identity test + new compile-twice digest-identity test are three independent proof surfaces. |
| **#11** Immutability | Caches are `WeakMap`-keyed on immutable frame identity; frame replacement is the natural cache invalidation; no mutation introduced. |
| **#13** Artifact Identity and Reproducibility | Replay artifacts recorded at any prior commit reproduce the same Zobrist keys post-refactor (canonical key preserved). Binary-canonical digest input is deferred (§4.5) precisely because it would require version-key bump. |
| **#15** Architectural Completeness | Caches are pure short-circuits with structural completeness; no fallback path; no silent default. The architectural-invariant test (§4.4) proves cache warm/cold cannot diverge from canonical output. |
| **#16** Testing as Proof | Three test surfaces (replay identity, trajectory identity, compile-twice digest identity) prove the optimization preserves canonical key output. |
| **#20** Preview Signal Integrity | Zobrist hashing does not interact with preview-ref status semantics; no preview-status-boundary risk. |

## 11. Reassessment of source proposal (`reports/fitl-perf-baseline-2026-05-24.md`)

**Adopted**:
- Finding row 2 (`Hash/digest-optimization` category, 12.7–25.2% contribution, all regressed lanes except wasm-equivalence) — adopted as the spec's central remediation target.
- Foundation-requirement set (#8 byte-identical replay/state hashes, #15 structural completeness for digest sharing/partial reuse) — adopted verbatim.
- Goal sentence ("Reduce redundant decision-stack digest work without changing canonical Zobrist key identity or replay hashes") — adopted as the §1 Goal.

**Adopted with adjustment**:
- The report's framing leaves the optimization strategy open ("sharing or partial digest reuse"). This spec commits to three concrete strategies (frame-identity encoding cache, per-frame digest memoization, `cacheBinding`-bound dynamic-feature cache) in §4.1–4.3 and defers the binary-canonical digest input alternative to a follow-up unless §4.1–4.3 do not meet the gain target.

**Deferred**:
- Binary-canonical digest input format change (§4.5) — gated on P3 measurement; requires determinism-corpus re-bless and version-key bump per Foundation #13.
- Engine-WASM Zobrist parity verification — out of scope; canonical-key preservation (§6) implies parity by definition.

**Meta-decision**:
- The `cacheBinding`-bound dynamic-feature cache (§4.3) is the only architectural extension beyond the report's literal finding text. Rationale: the report cites `zobristKey` self-time at 5.1% on `parity-drive`; binding the dynamic cache to evaluation-context lifetime is the natural complement to §4.1's encoding cache and Spec 189's existing cache discipline.
