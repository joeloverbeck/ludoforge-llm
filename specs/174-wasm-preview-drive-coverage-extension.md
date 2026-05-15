# Spec 174 - WASM Preview-Drive Coverage Extension

**Status**: PROPOSED
**Priority**: High - Spec 173 Phase 1 exhausted three consecutive TypeScript-side closure slices without meeting the slowest-seed soft target.
**Complexity**: XL - generic WASM preview-drive ABI, preview-state materialization, production routing, parity, and default-flip proof.
**Date**: 2026-05-15
**Dependencies**:
- `archive/specs/173-deep-preview-drive-cost-reduction.md`
- `archive/specs/150-fitl-policy-vm-wasm-port.md`
- `archive/specs/172-policy-eval-static-structure-caching.md`
**Trigger report**: `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-008-final.md`

## 1. Goal

Move the remaining generic deep preview-drive work for `continuedDeepening` / `deep1024` from TypeScript-only execution into a deterministic WASM route, without changing GameSpecDoc data, policy profiles, preview bounds, legality, publication, or kernel semantics.

Spec 173 proved that local TypeScript cache and constant-factor slices no longer move the terminal train residual materially:

- ticket 006 retained no runtime code after a flat/regressive choose-N preview no-entry-hash candidate;
- ticket 007 retained no runtime code after a flat/regressive decision-stack digest/encoding candidate;
- ticket 008 retained no runtime code and recorded post-008 slowest seed `1005` at `75,311.43 ms`, still above the Spec 173 `<=60 s` soft target.

This spec owns the architectural follow-up named by Spec 173 Phase N: extend the existing WASM policy/preview runtime so the production deep preview-drive path can route supported `continuedDeepening` work through WASM with explicit unsupported/fail-closed diagnostics and byte-equivalent TypeScript parity.

## 2. Non-Goals

- No FITL-specific Rust or TypeScript branches.
- No `arvn-evolved` profile retuning, `depthCap`, `maxOptions`, `chooseNBeamWidth`, or `capClass` changes.
- No changes to GameSpecDoc, production rules, legal action publication, or microturn semantics.
- No compatibility alias retained after a default flip. Temporary A/B routing is proof machinery only.
- No broad campaign scoring or `compositeScore` changes.

## 3. Architecture

The existing WASM path already owns generic policy-bytecode score-row execution and partial production preview-drive substrate from Spec 150. The remaining gap is coverage for the production deep preview-drive shape that still fails closed or stays TypeScript-owned for `continuedDeepening` / `deep1024`.

Spec 174 extends that route in stages:

1. Inventory the current production deep preview-drive unsupported classes from the post-008 witness and `policy-wasm-score-routing.ts`.
2. Extend the generic encoded preview-drive ABI to represent the missing bounded decision-stack publication, preview-state slots, candidate grouping, and completion semantics needed by `continuedDeepening`.
3. Prove TypeScript/WASM parity for supported preview-drive output before any production default flip.
4. Add activation and unsupported counters so a green correctness test cannot mask an inactive WASM path.
5. Flip only the proven supported route, fail closed for unsupported shapes, and delete temporary A/B wiring when the route is complete.

The route remains generic: it consumes compiled GameDef, policy bytecode, encoded state/layout identity, action/candidate identity, and bounded preview configuration. It must not inspect FITL ids, factions, cards, or authored profile names.

## 4. Phases

| Phase | Scope | Acceptance |
|---|---|---|
| 0 | Inventory and unsupported-class witness for post-008 deep preview-drive rows. | Report names supported vs unsupported production preview-drive classes, activation counters, and the exact current fail-closed reasons. |
| 1 | ABI extension for missing generic preview-drive structures. | Rust/TS ABI validates identity, version, bounded counts, and unsupported classes; malformed buffers fail closed deterministically. |
| 2 | Parity for supported deep preview-drive rows. | TypeScript and WASM preview-drive output are byte-equivalent for supported rows, including preview outcomes, candidate ordering, and state-feature values. |
| 3 | Production route activation. | Production `continuedDeepening` / `deep1024` rows route through WASM where supported, with nonzero activation counters and explicit unsupported counters. |
| 4 | Perf gate and default-flip decision. | The 15-seed witness improves the Spec 173 residual materially, or records a new architectural blocker with exact unsupported classes and next owner. |

## 5. Acceptance Criteria

1. No FITL-specific code appears in Rust, TypeScript bridge code, schema/ABI encoders, tests, or route predicates.
2. Every supported WASM preview-drive row has a TypeScript oracle proving byte-equivalent candidate ordering, preview status, surfaced values, and deterministic hashes where applicable.
3. Unsupported rows fail closed with stable reason strings and counters; fallback success cannot count as route activation.
4. Determinism gates remain green:
   - `packages/engine/test/determinism/spec-140-replay-identity.test.ts`
   - `packages/engine/test/determinism/forked-vs-fresh-runtime-parity.test.ts`
   - `packages/engine/test/determinism/zobrist-incremental-parity-fitl-seed-42.test.ts`
   - `packages/engine/test/determinism/zobrist-incremental-parity-fitl-seed-123.test.ts`
   - `packages/engine/test/integration/policy-bytecode-equivalence*.test.ts`
5. The 15-seed decomposition witness is rerun after production activation and records both activation counters and the residual elapsed metrics.

## 6. Foundation Alignment

| Foundation | Alignment |
|---|---|
| #1 Engine Agnosticism | The WASM route handles generic encoded preview-drive data only. |
| #5 One Rules Protocol | Legal action publication and application remain kernel-owned; WASM may only evaluate proven preview-drive rows. |
| #8 Determinism | Integer-only arithmetic, explicit ABI identity, and byte-equivalent TypeScript parity are required before routing. |
| #10 Bounded Computation | Existing preview bounds and `capClass` remain unchanged and are encoded into reproducibility metadata. |
| #14 No Backwards Compatibility | Temporary A/B routing must be deleted once the supported route is defaulted. |
| #15 Architectural Completeness | Spec 173's exhausted TypeScript-local path is replaced by the root architectural owner. |
| #16 Testing as Proof | Parity, activation, unsupported classification, determinism, and measured witnesses are required. |
| #20 Preview Signal Integrity | Preview statuses, fallback paths, and unavailable outcomes remain explicit; unsupported rows fail closed rather than silently contributing scalar values. |

## 7. Code Anchors

- `packages/engine/src/agents/policy-wasm-score-routing.ts`
- `packages/engine/src/agents/policy-wasm-production-preview-drive.js`
- `packages/engine/src/agents/policy-wasm-runtime.ts`
- `packages/engine-wasm/policy-vm`
- `packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs`
- `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-008-final.md`

## 8. Initial Ticket Decomposition

Pending. The first ticket should own Phase 0 inventory and unsupported-class proof only; later tickets should remain one ABI or route surface per slice. This spec intentionally does not implement WASM preview-drive code inside the Spec 173 closeout ticket.

## 9. Outcome

Pending implementation.
