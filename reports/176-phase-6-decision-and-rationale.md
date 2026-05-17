# Spec 176 Phase 6 — Decision and Rationale

**Date**: 2026-05-17
**Status**: Phase 6 decision complete.
**Ticket**: `archive/tickets/176POLWASMPERF-007.md`

## Decision

**Accelerate WASM.**

The follow-up artifact was `archive/specs/177-policy-wasm-batched-call-overhead-reduction.md`; it is now archived as rejected by its Phase 0 measured gate.

This decision is not a default flip, a retirement decision, or a claim that WASM is already faster on the FITL ARVN workload. It is a targeted acceleration decision: the Phase 1 and Phase 5 evidence shows that WASM execution is not the dominant cost inside the current WASM route; per-call marshaling, deserialization, and mixed serialization overhead are. The follow-up should therefore attack call granularity and host/guest transfer overhead before any renewed default-routing claim.

## Per-Hypothesis Verdict Summary

| Phase | Hypothesis | Verdict | Implication |
|---|---|---|---|
| Phase 1 | H1 FFI marshaling overhead | `marshaling-dominant` | Supports Accelerate via batching more policy work per WASM call. `reports/176-phase-1-ffi-marshaling-decomposition.md` records slow-tier marshaling plus deserialization at `583.4576 ms` versus `184.4379 ms` execution, a `3.16x` overhead/execution ratio. |
| Phase 2 | H2 TS-only hot paths | `ts-only-bound-low` | Does not support the H2-alone branch. `reports/176-phase-2-ts-only-hot-paths.md` records timed TS-only buckets at `18.9582%` of slow-tier agent-call time, below the `40%` dominance threshold. |
| Phase 3 | H3 cheap vs expensive path coverage | `mixed` | H3 is material but not dominant. `reports/176-phase-3-cheap-vs-expensive-coverage.md` records `52.4665%` slow-tier TS-fallback / no-WASM-signal wall time, inside the `40-60%` mixed band rather than the `cheap-paths-dominate` threshold. |
| Phase 4 | H4 bytecode cache amortization | `cache-cost-negligible` | Does not justify a cache-specific follow-up by itself. `reports/176-phase-4-bytecode-cache-amortization.md` records `95.11%` overall hit rate and `25.52 ms` compile time, `5.52%` of WASM execution. |
| Phase 5 | H5 state serialization cost | `serialization-mixed-overhead-dominant` | Supports weighing serialization/marshaling with H1 rather than a narrow byte-size-only ABI fix. `reports/176-phase-5-state-serialization.md` records all-seed marshaling at `1,309.86 ms` versus `479.28 ms` execution, with Pearson `r = 0.4705` for bytes-per-call versus marshaling-ms-per-call. |

## Dominant-Cause Attribution

The load-bearing pattern is **H1 plus H5**: fixed per-call host/guest overhead and mixed state-serialization overhead dominate the current WASM execution cost. Phase 1 proves the aggregate WASM timing buckets are marshaling-dominant, and Phase 5 independently confirms that serialized input transfer is material while not reducible to a pure byte-linear size problem (`reports/176-phase-1-ffi-marshaling-decomposition.md`; `reports/176-phase-5-state-serialization.md`).

The contrary retirement pattern is not strong enough. Phase 2 does not show structurally dominant TS-only work, and Phase 3 does not reach the `cheap-paths-dominate` threshold (`reports/176-phase-2-ts-only-hot-paths.md`; `reports/176-phase-3-cheap-vs-expensive-coverage.md`). H4 is also not dominant and should not steer the decision toward a cache-only repair (`reports/176-phase-4-bytecode-cache-amortization.md`).

## Decision Tree Application

Spec 176 section 6 maps H1 marshaling overhead to **Accelerate — follow-up spec to batch more work per WASM call**. The measured H5 verdict strengthens that same direction because it says the current cost is transfer/setup-heavy rather than execution-heavy. The decision therefore commits to **Accelerate WASM** through a batched-call / overhead-reduction follow-up.

The decision deliberately rejects these branches for this evidence set:

- **Keep WASM as-is**: rejected because H1 and H5 are not neutral findings; they identify a recoverable bottleneck class in the current route (`reports/176-phase-1-ffi-marshaling-decomposition.md`; `reports/176-phase-5-state-serialization.md`).
- **Retire WASM**: rejected because the H2 + H3 structural-boundedness pattern is not dominant under the current reports (`reports/176-phase-2-ts-only-hot-paths.md`; `reports/176-phase-3-cheap-vs-expensive-coverage.md`).
- **Cache-only acceleration**: rejected because H4 compile cost is negligible relative to execution (`reports/176-phase-4-bytecode-cache-amortization.md`).
- **Byte-size-only ABI acceleration**: rejected as the first follow-up because Phase 5 shows mixed overhead rather than a strong byte-linear relationship (`reports/176-phase-5-state-serialization.md`).

## Named Follow-Up Artifact

`archive/specs/177-policy-wasm-batched-call-overhead-reduction.md`

The stub named a batched-call / host-guest transfer reduction investigation as the next owner. Its notional success threshold was a measured slow-tier policy-agent wall-time improvement on the same FITL ARVN 15-seed witness after proving route activation and preserving TS fallback parity. Spec 177's Phase 0 evidence later rejected that path under the stated threshold.

## Foundation Alignment

| Foundation | Alignment |
|---|---|
| #14 No Backwards Compatibility | The decision does not preserve the current dual path as inertia; it creates a single named follow-up to either make the WASM complexity earn its cost or produce evidence strong enough for a later retirement decision. |
| #15 Architectural Completeness | Spec 176 no longer leaves the WASM architecture ambiguous. The investigation selects a concrete next architectural question: reduce call/serialization overhead rather than expanding coverage, tuning cache behavior, or deleting the route now. |
| #16 Testing as Proof | The decision is derived from Phase 1-5 measured reports and their explicit verdicts, not from spec 174 assumptions or narrative preference. |
| #20 Preview Signal Integrity | The selected Accelerate branch must preserve fail-closed TS fallback and preview-signal carriers. The follow-up may change batching or encoding shape, but not the requirement that unsupported or unavailable preview evidence remains explicit. |

## Cross-Game Generalization Caveat

This conclusion applies to the FITL ARVN workload measured by Spec 176. It does not prove that policy WASM is faster, slower, or neutral for Texas Hold'em or future games. Future games may have different state sizes, preview-route distributions, unsupported-feature mixes, and policy bytecode shapes.
