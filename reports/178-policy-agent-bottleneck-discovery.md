# Spec 178 — Policy-Agent Bottleneck Discovery After Rejected WASM Batching

**Date**: 2026-05-17
**Status**: discovery report complete.
**Ticket**: `archive/tickets/178POLWASMPERF-001.md`

## Question

Spec 177 rejected the first post-176 acceleration shape. This report ranks the remaining slow-tier FITL ARVN policy-agent cost owners from the existing Spec 176 and Spec 177 evidence, then decides whether the next artifact should be an implementation spec, another bounded investigation, or no new work.

The materiality gate is pre-registered here before the recommendation:

- `spec-ready`: a named owner has a measured or tightly bounded ceiling of at least `5%` of slow-tier FITL ARVN wall time, or a smaller ceiling is justified as critical architecture debt with explicit non-performance value.
- `investigate-more`: a named owner is plausible and material, but current instrumentation cannot bound its ceiling tightly enough for an implementation spec.
- `no-material-owner-found`: existing evidence does not justify a new implementation spec or investigation.

The Spec 177 slow-tier wall-time precedent is `78,030.23 ms`, so a `5%` material wall-time threshold is about `3,901.51 ms`. Where a row uses the Phase 3 slow-tier agent-call denominator instead, the same `5%` standard is about `3,671.03 ms` of `73,420.5845 ms`.

## Evidence Inputs

| Input | Use in this report |
|---|---|
| `reports/176-phase-1-ffi-marshaling-decomposition.md` | Route-level WASM marshaling, execution, deserialization, and noisy outside-WASM residual context. |
| `reports/176-phase-2-ts-only-hot-paths.md` | Timed TS-only hot-bucket subtotal and per-prefix attribution. |
| `reports/176-phase-3-cheap-vs-expensive-coverage.md` | Slow-tier WASM-handled versus TS-fallback / no-WASM-signal wall-time split. |
| `reports/176-phase-4-bytecode-cache-amortization.md` | Bytecode cache hit/miss and compile-cost ceiling. |
| `reports/176-phase-5-state-serialization.md` | Serialization, bytes-per-call, marshaling, and unsupported preview-drive reason inventory. |
| `reports/176-phase-6-decision-and-rationale.md` | Prior accelerate decision and caveat that Spec 177 later rejected the named follow-up. |
| `reports/177-phase-0-batching-shape-selection.md` | Transfer-overhead ceiling and rejection of batching / transfer reduction as the next implementation owner. |
| `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-0-wasm-on.csv` | Bounded recomputation of slow-tier no-WASM-signal axes and unsupported-owner counts from existing rows. |

No new profiler script or runtime helper was needed. The existing markdown and CSV artifacts already expose enough data to rank the current owners and identify the next evidence gap.

## Ranked Owner Inventory

| Rank | Owner class | Current evidence | Slow-tier materiality | Classification |
|---:|---|---|---:|---|
| 1 | TS-fallback / no-WASM-signal policy work | Phase 3 measured `38,521.2183 ms` TS-fallback / no-WASM-signal wall time out of `73,420.5845 ms` slow-tier agent-call time. | `52.4665%` of Phase 3 slow-tier agent-call time. | `investigate-more`: material, but not yet narrowed to one implementation owner. |
| 2 | No-counter outside-WASM axes inside the Phase 3 fallback bucket | Existing CSV rows with no route or unsupported counter total `9,562.3179 ms` across `844` slow-tier decisions. | `13.0240%` of Phase 3 slow-tier agent-call time. | `investigate-more`: material, but the current counters do not explain the owner. |
| 3 | Timed TS-only hot buckets | Phase 2 measured `14,039.7016 ms` across `zobrist:*`, `tokenStateIndex:*`, and `evalQuery:*`. | `18.9582%` of the no-WASM slow-tier agent-call denominator. | `investigate-more`: material by the 5% bar, but below the prior `40%` dominance threshold and measured only in the no-WASM run. |
| 4 | Mixed serialization / payload-size cost | Phase 5 measured slow-tier marshaling at `529.53 ms` versus `191.59 ms` execution, with `159,855,164` bytes and Pearson `r = 0.5900`. | Material inside the WASM route, but below the wall-time threshold by itself. | Not spec-ready after Spec 177; keep as context for any future route investigation. |
| 5 | WASM transfer overhead already rejected by Spec 177 | Spec 177 measured a combined slow-tier transfer-overhead ceiling of `608.7484 ms`. | About `0.78%` of `78,030.23 ms`. | Ruled out. Do not replay batching with a lower bar. |
| 6 | Bytecode compile/cache cost | Phase 4 measured slow-tier hit rate `95.07%`, compile time `25.52 ms`, and compile/execution `5.57%`. | Far below the wall-time threshold. | Ruled out as a standalone owner. |
| 7 | Outside-WASM / run-to-run residual wall time | Phase 1's TS-equivalent comparison was negative because no-WASM slow-tier wall time was lower than WASM-on outside-call wall time. | No same-run ceiling. | Noisy context only until instrumented with a same-command attribution. |

The dominant remaining class is not another host/guest transfer reduction. It is the broad fallback/no-signal and outside-WASM policy-agent surface that remains after the current route either cannot fire or has no explanatory counter.

## Fallback and Preview-Signal Detail

Phase 3's fallback bucket is large enough to clear a materiality gate, but it is not a single implementation hypothesis. The top slow-tier fallback/no-WASM-signal axes from the existing Phase 0 CSV are:

| Axis | Decisions | Total ms | Route count | Unsupported count | Attributed fallback/no-signal ms |
|---|---:|---:|---:|---:|---:|
| `govern:chooseNStep:confirm | continuedDeepening` | 33 | `15,783.4667` | 0 | 182 | `15,783.4667` |
| `coupArvnRedeployPolice:chooseOne | continuedDeepening` | 58 | `7,041.9350` | 0 | 0 | `7,041.9350` |
| `event | singlePass` | 109 | `7,985.0107` | 109 | 244 | `5,519.3842` |
| `govern | singlePass` | 47 | `2,881.9400` | 63 | 238 | `2,278.7433` |
| `coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening` | 84 | `1,653.0150` | 0 | 0 | `1,653.0150` |
| `govern:chooseNStep:add | continuedDeepening` | 55 | `11,330.6652` | 261 | 35 | `1,339.7746` |
| `coupArvnRedeployOptionalTroops | singlePass` | 32 | `1,277.3123` | 46 | 192 | `1,030.4368` |
| `coupArvnRedeployPolice | singlePass` | 27 | `821.5151` | 27 | 162 | `704.1558` |

For production preview-drive unsupported reasons, the existing CSV exposes these counts:

| Scope | Unsupported owner / reason | Count |
|---|---|---:|
| Slow tier | `production-preview-drive.actionBatch` — deterministic shared scalar runtime bindings required | 262 |
| Slow tier | `production-preview-drive.cardEventAction` — card event action candidates do not route | 244 |
| Slow tier | `production-deep-choosenstep-continuation.projectedState` — terminal boundary before WASM projected state | 241 |
| Slow tier | `production-preview-drive.chooseN` — only origin-seat greedy chooseN publication is supported | 4 |
| All seeds | `production-preview-drive.actionBatch` — deterministic shared scalar runtime bindings required | 703 |
| All seeds | `production-preview-drive.cardEventAction` — card event action candidates do not route | 641 |
| All seeds | `production-deep-choosenstep-continuation.projectedState` — terminal boundary before WASM projected state | 632 |
| All seeds | `production-preview-drive.chooseN` — only origin-seat greedy chooseN publication is supported | 16 |
| All seeds | `production-preview-drive.effect.popInterruptPhase` — unsupported `popInterruptPhase` effect | 6 |

Those counts preserve Foundation #20's provenance-rich unsupported taxonomy, but the current reports do not attribute wall time directly by unsupported owner or explain no-counter axes such as `coupArvnRedeployPolice:chooseOne | continuedDeepening`. That is the remaining evidence gap.

## Candidate Owner Assessment

### WASM Transfer Overhead

Spec 177 is the decisive negative result. Its slow-tier measured transfer-overhead ceiling across `scoreRows`, `previewCandidateFeatureRows`, and `productionPreviewDrive` was `608.7484 ms`, while the `>=5%` bar was about `3,901.51 ms`. Replaying batching, cross-feature batching, or payload shrink with a lower bar would preserve a rejected implementation shape rather than attacking the root cause.

Classification: `no-material-owner-found` for this owner class.

### TS-Only Hot Buckets

Phase 2 measured timed TS-only buckets at `18.9582%` of slow-tier no-WASM agent-call time. The largest prefixes were:

| Prefix | Total ms | Share |
|---|---:|---:|
| `zobrist:*` | `8,151.4448` | `11.0071%` |
| `tokenStateIndex:*` | `4,291.5706` | `5.7950%` |
| `evalQuery:*` | `1,596.6862` | `2.1560%` |

This clears a generic 5% materiality screen, but it did not clear Spec 176's `40%` structural dominance threshold. It also comes from a no-WASM hot-bucket run, not a same-run attribution of the post-177 residual. It can inform the next investigation, especially around `zobrist` and token-state index work, but it is not a standalone implementation spec yet.

Classification: `investigate-more`.

### TS-Fallback / No-WASM-Signal Work

Phase 3 measured this as the biggest remaining known bucket: `38,521.2183 ms`, or `52.4665%` of slow-tier agent-call time. The top rows show a split between unsupported preview-drive reasons and whole axes with no counter signal.

This is the strongest candidate family, but the current evidence is too broad for a spec-ready implementation. A future implementation spec would need to know whether the actual owner is:

- unsupported preview-drive semantics such as deterministic shared scalar bindings, card-event action candidates, or projected-state terminal-boundary handling;
- choose-one / continued-deepening work that never reaches current WASM route counters;
- TS-only state/hash/query work visible in Phase 2;
- or another outside-WASM policy-agent path.

Classification: `investigate-more`, and the recommended next artifact should target this attribution gap.

### Bytecode Cache Cost

Phase 4 measured cache behavior as healthy enough for this context: slow-tier hit rate `95.07%`, compile time `25.52 ms`, and compile/execution `5.57%`. That is useful context, but it cannot plausibly clear the wall-time materiality bar.

Classification: `no-material-owner-found` for this owner class.

### Mixed Serialization and Payload-Size Cost

Phase 5 confirmed that marshaling and serialization are material inside routed WASM calls, but Spec 177 then bounded the transferable route-level overhead and rejected transfer reduction as insufficient. The Phase 5 byte relationship was mixed (`r = 0.5900` slow-tier), so a byte-size-only ABI optimization remains unproven.

Classification: context only unless a later investigation ties serialization to the broader fallback/no-signal owner.

### Preview Work Volume and Advisory Behavior

Preview work remains central to the residual, but it must be measured through Foundation #20 carriers rather than collapsed into a scalar. The current unsupported reasons are useful, but they are count-based; the next investigation needs wall-time attribution by unsupported owner, no-signal axis, and advisory/fallback status.

Classification: `investigate-more`.

### Outside-WASM / Run-to-Run Residual

Phase 1 recorded that the slow-tier no-WASM run was faster than WASM-on outside-call wall time after subtracting measured WASM buckets. That makes cross-run outside-WASM residual evidence noisy. It is too large to ignore, but not yet a measured owner.

Classification: `investigate-more` only if the next artifact can add same-command attribution. Otherwise, use it as caution against claiming wall-time wins from route-local metrics.

## Materiality Decision

The material class that survives Spec 177 is **TS-fallback / no-WASM-signal plus outside-WASM policy-agent residual**, not route-local transfer overhead.

However, this report should not recommend an implementation spec yet. The existing evidence proves a material broad bucket, but not a concrete implementation hypothesis with a tightly bounded ceiling. An implementation spec written now would likely be too vague, or would pick one unsupported reason without proving it owns enough wall time.

The next artifact should be a bounded investigation ticket that:

1. Adds or derives same-command wall-time attribution by unsupported preview-drive owner, no-counter axis, and TS-only hot-bucket family.
2. Keeps preview status, no-signal, unsupported, and advisory carriers explicit per Foundation #20.
3. Reports a spec-ready owner only if a concrete family can clear the `5%` slow-tier wall-time gate without relying on the rejected Spec 177 transfer-reduction ceiling.
4. Separates FITL ARVN witness limitations from generic engine claims.

No amendment is needed for `reports/176-phase-6-decision-and-rationale.md` or `reports/177-phase-0-batching-shape-selection.md`. Their interpretation remains intact: Spec 176's accelerate decision was tried through Spec 177, and Spec 177 rejected transfer reduction under the measured gate.

## Foundation Alignment

| Foundation | Alignment |
|---|---|
| #1 Engine Agnosticism | The report uses FITL ARVN as a witness workload only and does not recommend game-specific engine logic. |
| #14 No Backwards Compatibility | No compatibility path, legacy route, or lower-bar batching shape is proposed. |
| #15 Architectural Completeness | The recommendation follows the remaining measured root-cause family instead of preserving the rejected batching shape. |
| #16 Testing as Proof | Existing measured reports and CSV counters drive the verdict; the next artifact is an evidence gate, not an implementation shortcut. |
| #20 Preview Signal Integrity | Unsupported and no-signal preview behavior remains provenance-rich and must be attributed by status/owner rather than coerced into an implicit scalar. |

create-investigation-ticket: Attribute TS-fallback/no-WASM-signal and outside-WASM policy-agent wall time by unsupported owner, no-counter axis, and TS-only hot-bucket family
